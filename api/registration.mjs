import {scryptSync,timingSafeEqual,randomBytes,createHmac,randomUUID,randomInt} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
export const RUN='2026-11-22', FIGHT='2026-12-fight-night';
const empty=()=>({registrations:[],draws:{},limits:{}});
let db;
let postgresPool;
async function postgres() {
  postgresPool ??= import('pg').then(({ default: pg }) =>
    new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3, connectionTimeoutMillis: 5000 })
  );
  return postgresPool;
}

async function read(){
 if (process.env.DATABASE_URL) {
   const result = await (await postgres()).query('SELECT value FROM ku_registration_state WHERE id = 1');
   return result.rows[0]?.value ?? JSON.stringify(empty());
 }
 if(process.env.KV_REST_API_URL){const value=await redis(['GET','ku:registrations:v1']);return value||JSON.stringify(empty());}
 if(process.env.VERCEL||process.env.NODE_ENV==='production')throw Error('Datenspeicher noch nicht eingerichtet.');
 if(!db){mkdirSync('.local',{recursive:true});db=new DatabaseSync(process.env.KU_TEST_DB||'.local/registrations.sqlite');db.exec('CREATE TABLE IF NOT EXISTS state(id INTEGER PRIMARY KEY, value TEXT NOT NULL)');db.prepare('INSERT OR IGNORE INTO state VALUES(1,?)').run(JSON.stringify(empty()));}
 return db.prepare('SELECT value FROM state WHERE id=1').get().value;
}
async function redis(command){const r=await fetch(process.env.KV_REST_API_URL,{method:'POST',headers:{Authorization:'Bearer '+process.env.KV_REST_API_TOKEN,'Content-Type':'application/json'},body:JSON.stringify(command)});if(!r.ok)throw Error('Datenspeicher nicht erreichbar.');const j=await r.json();if(j.error)throw Error('Datenspeicherfehler.');return j.result;}
async function mutate(fn){for(let i=0;i<10;i++){const old=await read(),state=JSON.parse(old),result=fn(state),next=JSON.stringify(state);let ok;
 if (process.env.DATABASE_URL) {
   const result = await (await postgres()).query(
     `INSERT INTO ku_registration_state (id, value)
      SELECT 1, $1::text WHERE $2::text = $3::text OR EXISTS (SELECT 1 FROM ku_registration_state WHERE id = 1)
      ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value
      WHERE ku_registration_state.value = $2::text`,
     [next, old, JSON.stringify(empty())]
   );
   ok = result.rowCount === 1;
 } else if(process.env.KV_REST_API_URL)ok=await redis(['EVAL',"local v=redis.call('GET',KEYS[1]); if (not v and ARGV[1]==ARGV[3]) or v==ARGV[1] then redis.call('SET',KEYS[1],ARGV[2]); return 1 end; return 0",1,'ku:registrations:v1',old,next,JSON.stringify(empty())]);else ok=db.prepare('UPDATE state SET value=? WHERE id=1 AND value=?').run(next,old).changes;if(ok)return result;}throw Error('Bitte erneut versuchen.');}
function fail(message,code=400){throw Object.assign(Error(message),{code});}
const str=(v,max=180)=>typeof v==='string'?v.trim().slice(0,max):'';
export function validate(b){
 const kind=b.kind;if(!['run','fight'].includes(kind))fail('Ungültige Anmeldung.');
 if(b.privacy!==true)fail('Bitte den Datenschutzhinweis bestätigen.');
 const r={id:randomUUID(),kind,event:kind==='run'?RUN:FIGHT,createdAt:new Date().toISOString(),attended:false,privacy:true,privacyVersion:'2026-11-17'};
 if(kind==='run'){
 r.firstName=str(b.firstName,80);r.lastName=str(b.lastName,80);r.name=r.firstName+' '+r.lastName;r.email=str(b.email).toLowerCase();r.instagram=str(b.instagram,31).replace(/^@/,'');r.phone=str(b.phone,32).replace(/[\s().-]/g,'').replace(/^00/,'+');r.whatsapp=b.whatsapp===true;
 if(!r.firstName||!r.lastName)fail('Bitte Vor- und Nachnamen angeben.');
 if(!r.email&&!r.instagram)fail('Bitte E-Mail oder Instagram angeben.');
 if(r.instagram&&!/^[a-zA-Z0-9._]{1,30}$/.test(r.instagram))fail('Bitte einen gültigen Instagram-Nutzernamen angeben.');
 if(!/^\+?\d{7,15}$/.test(r.phone))fail('Bitte eine gültige WhatsApp-Telefonnummer angeben.');
 }else{
 for(const [key,max] of Object.entries({name:100,email:180,discipline:20,club:120,experience:500,message:500}))r[key]=str(b[key],max);
 r.email=r.email.toLowerCase();r.weight=Number(b.weight);
 if(!r.name||!r.email||!r.experience||!['Boxen','Kickboxen','MMA','Ringen'].includes(r.discipline)||!Number.isFinite(r.weight)||r.weight<1||r.weight>350)fail('Bitte alle Pflichtfelder korrekt ausfüllen.');
 }
 if(r.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email))fail('Bitte eine gültige E-Mail angeben.');return r;
}
function sign(s){if(!process.env.SESSION_SECRET)throw Error('Admin-Zugang noch nicht eingerichtet.');return createHmac('sha256',process.env.SESSION_SECRET).update(s).digest('hex');}
function equal(a,b){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
function authenticated(req){const token=(req.headers.cookie||'').split('; ').find(c=>c.startsWith('ku_session='))?.slice(11)||'';const [expiry,nonce,sig]=token.split('.');return expiry&&nonce&&sig&&Number(expiry)>Date.now()&&equal(sign(expiry+'.'+nonce),sig);}
function cookie(res,value,age){res.setHeader('Set-Cookie',`ku_session=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${process.env.VERCEL||process.env.NODE_ENV==='production'?'; Secure':''}`);}
export function drawWinner(state){if(state.draws[RUN])return state.draws[RUN];const eligible=state.registrations.filter(r=>r.kind==='run'&&r.event===RUN&&r.attended);if(!eligible.length)fail('Noch keine bestätigten Mitläufer.');const winner=eligible[randomInt(eligible.length)];return state.draws[RUN]={id:winner.id,name:winner.name,drawnAt:new Date().toISOString(),eligibleCount:eligible.length,eligibleIds:eligible.map(r=>r.id)};}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('X-Content-Type-Options','nosniff');
 const send=(code,data)=>{res.statusCode=code;res.end(JSON.stringify(data));};
 try{
 const url=new URL(req.url,'http://localhost'), action=url.searchParams.get('action')||'register';
 if(req.method==='GET'&&action==='admin'){if(!authenticated(req))fail('Bitte anmelden.',401);const state=JSON.parse(await read());return send(200,{registrations:state.registrations,draw:state.draws[RUN]||null,run:RUN});}
 if(req.method!=='POST')fail('Methode nicht erlaubt.',405);
 const origin=req.headers.origin;const expected=process.env.PUBLIC_ORIGIN||`http://${req.headers.host}`;if(!origin||origin!==expected)fail('Ungültige Anfrage.',403);
 let raw='';if(req.body!==undefined)raw=typeof req.body==='string'?req.body:JSON.stringify(req.body);else for await(const chunk of req){raw+=chunk;if(raw.length>12000)fail('Anfrage zu groß.',413);}if(raw.length>12000)fail('Anfrage zu groß.',413);let b;try{b=JSON.parse(raw);if(!b||typeof b!=='object'||Array.isArray(b))throw Error();}catch{fail('Ungültige Anfrage.');}
 if(action==='login'||action==='register'){
 const ip=process.env.VERCEL?String(req.headers['x-vercel-forwarded-for']||req.socket?.remoteAddress):req.socket?.remoteAddress;
 const key=createHmac('sha256',process.env.SESSION_SECRET||'local').update(action+ip).digest('hex');
 const blocked=await mutate(s=>{const now=Date.now();for(const k of Object.keys(s.limits))if(s.limits[k].until<now)delete s.limits[k];const l=s.limits[key]||={count:0,until:now+900000};return ++l.count>(action==='login'?8:30);});if(blocked)fail('Zu viele Versuche. Bitte in 15 Minuten erneut versuchen.',429);
 }
 if(action==='login'){
 const [salt,hash]=(process.env.ADMIN_PASSWORD_HASH||'').split(':');if(!salt||!hash)fail('Admin-Zugang noch nicht eingerichtet.',503);
 const valid=equal(scryptSync(str(b.password,256),salt,64).toString('hex'),hash);if(!valid||str(b.email).toLowerCase()!==process.env.ADMIN_EMAIL?.toLowerCase())fail('E-Mail oder Passwort ist falsch.',401);
 const token=Date.now()+8*3600000+'.'+randomBytes(24).toString('hex');cookie(res,token+'.'+sign(token),8*3600);return send(200,{ok:true});
 }
 if(action==='logout'){cookie(res,'',0);return send(200,{ok:true});}
 if(action==='register'){
 if(b.website)fail('Anmeldung konnte nicht verarbeitet werden.');const r=validate(b);
 if(r.kind==='run'&&Date.now()>Date.parse('2026-11-22T14:45:00+01:00'))fail('Die Anmeldung für diesen Lauf ist geschlossen.',409);
 await mutate(s=>{if(s.registrations.some(x=>x.event===r.event&&(r.kind==='run'?x.phone===r.phone:x.email===r.email)))fail('Für diesen Kontakt liegt bereits eine Anmeldung vor.',409);s.registrations.push(r);});return send(201,{ok:true});
 }
 if(!authenticated(req))fail('Bitte anmelden.',401);
 if(action==='attendance'){await mutate(s=>{if(s.draws[RUN])fail('Teilnahme nach der Ziehung gesperrt.',409);const r=s.registrations.find(x=>x.id===b.id&&x.kind==='run'&&x.event===RUN);if(!r)fail('Anmeldung nicht gefunden.',404);r.attended=b.attended===true;});return send(200,{ok:true});}
 if(action==='draw'){const draw=await mutate(drawWinner);return send(200,{draw});}
 fail('Nicht gefunden.',404);
 }catch(e){send(Number.isInteger(e.code)?e.code:503,{error:Number.isInteger(e.code)?e.message:'Dienst momentan nicht verfügbar. Bitte später erneut versuchen.'});}
}
