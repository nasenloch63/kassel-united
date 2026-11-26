import { createHmac, randomBytes, randomInt, randomUUID, scryptSync } from 'node:crypto';
import {
  authenticated,
  equal,
  fail,
  FIGHT,
  getUpcomingSundayBerlin,
  isIsoDate,
  mutateRegistrationState,
  readCmsState,
  readJsonBody,
  readRegistrationStateRaw,
  setSessionCookie,
  sign,
  str,
  verifyOrigin
} from './_shared.mjs';

export { FIGHT };
export const RUN = getUpcomingSundayBerlin();

export function validate(b, activeRun = getUpcomingSundayBerlin()) {
  const kind = b.kind;
  if (!['run', 'fight'].includes(kind)) fail('Ungültige Anmeldung.');
  if (b.privacy !== true) fail('Bitte den Datenschutzhinweis bestätigen.');
  const r = {
    id: randomUUID(),
    kind,
    event: kind === 'run' ? activeRun : FIGHT,
    createdAt: new Date().toISOString(),
    attended: false,
    privacy: true,
    privacyVersion: '2026-11-17'
  };
  if (kind === 'run') {
    r.firstName = str(b.firstName, 80);
    r.lastName = str(b.lastName, 80);
    r.name = r.firstName + ' ' + r.lastName;
    r.email = str(b.email).toLowerCase();
    r.instagram = str(b.instagram, 31).replace(/^@/, '');
    r.phone = str(b.phone, 32).replace(/[\s().-]/g, '').replace(/^00/, '+');
    r.whatsapp = b.whatsapp === true;
    if (!r.firstName || !r.lastName) fail('Bitte Vor- und Nachnamen angeben.');
    if (!r.email && !r.instagram) fail('Bitte E-Mail oder Instagram angeben.');
    if (r.instagram && !/^[a-zA-Z0-9._]{1,30}$/.test(r.instagram)) {
      fail('Bitte einen gültigen Instagram-Nutzernamen angeben.');
    }
    if (!/^\+?\d{7,15}$/.test(r.phone)) fail('Bitte eine gültige WhatsApp-Telefonnummer angeben.');
  } else {
    for (const [key, max] of Object.entries({
      name: 100,
      email: 180,
      discipline: 20,
      club: 120,
      experience: 500,
      message: 500
    })) {
      r[key] = str(b[key], max);
    }
    r.email = r.email.toLowerCase();
    r.weight = Number(b.weight);
    if (
      !r.name ||
      !r.email ||
      !r.experience ||
      !['Boxen', 'Kickboxen', 'MMA', 'Ringen'].includes(r.discipline) ||
      !Number.isFinite(r.weight) ||
      r.weight < 1 ||
      r.weight > 350
    ) {
      fail('Bitte alle Pflichtfelder korrekt ausfüllen.');
    }
  }
  if (r.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)) fail('Bitte eine gültige E-Mail angeben.');
  return r;
}

export function drawWinner(state, runDate = getUpcomingSundayBerlin()) {
  if (state.draws[runDate]) return state.draws[runDate];
  const eligible = state.registrations.filter(r => r.kind === 'run' && r.event === runDate && r.attended);
  if (!eligible.length) fail('Noch keine bestätigten Mitläufer.');
  const winner = eligible[randomInt(eligible.length)];
  return (state.draws[runDate] = {
    id: winner.id,
    name: winner.name,
    drawnAt: new Date().toISOString(),
    eligibleCount: eligible.length,
    eligibleIds: eligible.map(r => r.id)
  });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const send = (code, data) => {
    res.statusCode = code;
    res.end(JSON.stringify(data));
  };

  try {
    const url = new URL(req.url, 'http://localhost');
    const action = url.searchParams.get('action') || 'register';
    const activeRun = getUpcomingSundayBerlin();

    if (req.method === 'GET' && action === 'admin') {
      if (!authenticated(req)) fail('Bitte anmelden.', 401);
      const state = JSON.parse(await readRegistrationStateRaw());
      const reqRun = url.searchParams.get('run');
      const runSet = new Set([activeRun]);
      for (const r of state.registrations) {
        if (r.kind === 'run' && isIsoDate(r.event)) runSet.add(r.event);
      }
      for (const k of Object.keys(state.draws || {})) {
        if (isIsoDate(k)) runSet.add(k);
      }
      const availableRuns = [...runSet].sort((a, b) => b.localeCompare(a));
      const selectedRun = reqRun && isIsoDate(reqRun) ? reqRun : activeRun;
      return send(200, {
        registrations: state.registrations,
        draw: state.draws[selectedRun] || null,
        draws: state.draws || {},
        run: selectedRun,
        activeRun,
        availableRuns
      });
    }

    if (req.method !== 'POST') fail('Methode nicht erlaubt.', 405);
    verifyOrigin(req);
    const b = await readJsonBody(req, 12000);

    if (action === 'login' || action === 'register') {
      const ip = process.env.VERCEL
        ? String(req.headers['x-vercel-forwarded-for'] || req.socket?.remoteAddress)
        : req.socket?.remoteAddress;
      const key = createHmac('sha256', process.env.SESSION_SECRET || 'local')
        .update(action + ip)
        .digest('hex');
      const blocked = await mutateRegistrationState(s => {
        const now = Date.now();
        for (const k of Object.keys(s.limits)) {
          if (s.limits[k].until < now) delete s.limits[k];
        }
        const l = (s.limits[key] ||= { count: 0, until: now + 900000 });
        return ++l.count > (action === 'login' ? 8 : 30);
      });
      if (blocked) fail('Zu viele Versuche. Bitte in 15 Minuten erneut versuchen.', 429);
    }

    if (action === 'login') {
      const [salt, hash] = (process.env.ADMIN_PASSWORD_HASH || '').split(':');
      if (!salt || !hash) fail('Admin-Zugang noch nicht eingerichtet.', 503);
      const valid = equal(scryptSync(str(b.password, 256), salt, 64).toString('hex'), hash);
      if (!valid || str(b.email).toLowerCase() !== process.env.ADMIN_EMAIL?.toLowerCase()) {
        fail('E-Mail oder Passwort ist falsch.', 401);
      }
      const token = Date.now() + 8 * 3600000 + '.' + randomBytes(24).toString('hex');
      setSessionCookie(res, token + '.' + sign(token), 8 * 3600);
      return send(200, { ok: true });
    }

    if (action === 'logout') {
      setSessionCookie(res, '', 0);
      return send(200, { ok: true });
    }

    if (action === 'register') {
      if (b.website) fail('Anmeldung konnte nicht verarbeitet werden.');
      const r = validate(b, activeRun);
      if (r.kind === 'run') {
        const cms = await readCmsState().catch(() => null);
        if (cms?.runBanner?.registrationOpen === false) {
          fail('Die Anmeldung für diesen Lauf ist aktuell pausiert.', 409);
        }
      }
      await mutateRegistrationState(s => {
        if (
          s.registrations.some(
            x => x.event === r.event && (r.kind === 'run' ? x.phone === r.phone : x.email === r.email)
          )
        ) {
          fail('Für diesen Kontakt liegt bereits eine Anmeldung vor.', 409);
        }
        s.registrations.push(r);
      });
      return send(201, { ok: true, run: r.event });
    }

    if (!authenticated(req)) fail('Bitte anmelden.', 401);

    if (action === 'attendance') {
      const runDate = isIsoDate(b.run) ? b.run : activeRun;
      await mutateRegistrationState(s => {
        if (s.draws[runDate]) fail('Teilnahme nach der Ziehung gesperrt.', 409);
        const r = s.registrations.find(x => x.id === b.id && x.kind === 'run' && x.event === runDate);
        if (!r) fail('Anmeldung nicht gefunden.', 404);
        r.attended = b.attended === true;
      });
      return send(200, { ok: true });
    }

    if (action === 'draw') {
      const runDate = isIsoDate(b.run) ? b.run : activeRun;
      const draw = await mutateRegistrationState(s => drawWinner(s, runDate));
      return send(200, { draw });
    }

    fail('Nicht gefunden.', 404);
  } catch (e) {
    send(Number.isInteger(e.code) ? e.code : 503, {
      error: Number.isInteger(e.code) ? e.message : 'Dienst momentan nicht verfügbar. Bitte später erneut versuchen.'
    });
  }
}
