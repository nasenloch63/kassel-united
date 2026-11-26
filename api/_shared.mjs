import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

export const FIGHT = '2026-12-fight-night';
export const LEGACY_RUN = '2026-11-22';

export function fail(message, code = 400) {
  throw Object.assign(Error(message), { code });
}

export const str = (v, max = 180) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export function isIsoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * Returns the Berlin wall-clock date/time components for a given timestamp.
 */
export function berlinParts(nowMs = Date.now()) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false
  });
  const map = Object.fromEntries(fmt.formatToParts(new Date(nowMs)).map(p => [p.type, p.value]));
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour === '24' ? '0' : map.hour),
    minute: Number(map.minute),
    weekday: weekdayMap[map.weekday] ?? 0
  };
}

/**
 * Automatically returns the active upcoming Sunday run date (YYYY-MM-DD in Europe/Berlin).
 * On Sundays at/after 14:45 Berlin time, rolls forward cleanly to next Sunday.
 */
export function getUpcomingSundayBerlin(nowMs = Date.now()) {
  const p = berlinParts(nowMs);
  let addDays = (7 - p.weekday) % 7;
  if (addDays === 0 && (p.hour > 14 || (p.hour === 14 && p.minute >= 45))) {
    addDays = 7;
  }
  const utc = new Date(Date.UTC(p.year, p.month - 1, p.day + addDays));
  const y = utc.getUTCFullYear();
  const m = String(utc.getUTCMonth() + 1).padStart(2, '0');
  const d = String(utc.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function emptyRegistrations() {
  return { registrations: [], draws: {}, limits: {} };
}

export const DEFAULT_DRIVE_FOLDERS = [
  { id: '1UlVrEdhM1qK5iCZIZMcd4z1gXpsJm3lU', name: 'Kassel United' },
  { id: '1_LlVheUzvGq-TvixiRTF7lZE8vRsjsBC', name: 'Florian Kassel-United' },
  { id: '1FAjEHyIMXTyFR4Szk3u353kJLtc7kuUk', name: 'Kassel United UGC' }
];

// Already-imported older Drive IDs from Kassel United folder so auto-sync does not re-add duplicates
export const SEED_KNOWN_DRIVE_IDS = [
  '1rVMmDizl-HWdOH_nL8fVQXWU6DvM9NeB',
  '1uzJtcXkpgE046dZf8nB6N70bnbsZl-ch',
  '1NYkH0CgMy2LA5Otcjn21E409agM5zTy5',
  '1bmOLQxJueyDIGCcQ62aVANjFuAA7t6xC',
  '1f4dtqjvx0nNTuaOB5cnwN3fshuBTBPhe',
  '1Fa-cfuwyiokdo9KJDCcmfe48hbbF1yQu',
  '1HhHNsdgI0BQNJFDMRkmrAhY4MhTqH36w',
  '1WotfLC5bSxWI3w7f_JWTt3i4tXpLvdce',
  '1SNF9uje_3da-oqE-a503DBxWuY8OSVjj',
  '1_RB_6aCRojD-AOzvsPZdQJbS6xRTPs3n',
  '17bJg_mnH-aNmwC9Rb6XRMVoowWmkGhM8',
  '1iegdtaNsyA-5p0mNM5oTyzixkRhHcFvV',
  '1P1iEKcSgVUjncnLFK_4js2JMUqzx-Wqx',
  '1-gbMe_O9WfWfeRtAbmmpwJDtGrQOcbaz',
  '1rbo5h1Yuvie0XQOb9UWvLI8oifQgygqC',
  '1077__0YeELYOFRBmfAGdTcefcBdDOAxa',
  '1FF4fF4aShRwI8a15R702YJmkvwAabw8L',
  '1QrV1EdaeOUt6ZVOYpFAWKgQqEc5KohTp'
];

export function defaultCmsState() {
  return {
    version: 2,
    updatedAt: '2026-11-26T15:15:00.000Z',
    runBanner: {
      title: 'Diesen Sonntag dabei?',
      specialNote: '',
      description: 'Alle Altersgruppen sind willkommen. Melde dich an und lauf mit: So hast du die Chance auf einen extra Gutschein.',
      raffleNote: 'Der extra Gutschein wird unter den angemeldeten Personen verlost, die tatsächlich mitlaufen. Die Gruppeneinladung ist dafür nicht erforderlich.',
      registrationOpen: true
    },
    driveFolders: [...DEFAULT_DRIVE_FOLDERS],
    ignoredDriveIds: [...SEED_KNOWN_DRIVE_IDS],
    lastDriveSync: null,
    days: [
      {
        date: '2026-11-22',
        title: 'Sonntagslauf · Hessenschau zu Besuch'
      },
      {
        date: '2026-11-01',
        title: 'Sonntagslauf · Orangerie & Karlsaue'
      },
      {
        date: '2026-10-25',
        title: 'Erster Lauf · Schloss Orangerie'
      }
    ],
    media: [
      {
        id: 'run-2211-01',
        driveId: '1TJjJJdS9kOVPGJSFYqBFKiEMSlN7N_zF',
        type: 'photo',
        day: '2026-11-22',
        src: '/galerie/run-2211-01-1600.webp',
        thumb: '/galerie/run-2211-01-640.webp',
        width: 1206,
        height: 2144,
        caption: 'Setup & Getränke am Treffpunkt'
      },
      {
        id: 'run-2211-02',
        driveId: '1Gbrrny0as3_FyeLAv8TwDrT5hfCwnf1c',
        type: 'photo',
        day: '2026-11-22',
        src: '/galerie/run-2211-02-1600.webp',
        thumb: '/galerie/run-2211-02-640.webp',
        width: 1600,
        height: 2133,
        caption: 'Sonntagstreff vor der Karlsaue'
      },
      {
        id: 'run-2211-03',
        driveId: '1cYt9eH85IkYIP_I-jW8dqZX2ociiMyW8',
        type: 'photo',
        day: '2026-11-22',
        src: '/galerie/run-2211-03-1600.webp',
        thumb: '/galerie/run-2211-03-640.webp',
        width: 1600,
        height: 2133,
        caption: 'Ankommen am Schloss Orangerie'
      },
      {
        id: 'run-2211-04',
        driveId: '1jvj_41LXCdDC6z0m2AH1T3hDYxTvGrH6',
        type: 'photo',
        day: '2026-11-22',
        src: '/galerie/run-2211-04-1600.webp',
        thumb: '/galerie/run-2211-04-640.webp',
        width: 1600,
        height: 2133,
        caption: 'Crew vor dem Schloss Orangerie'
      },
      {
        id: 'run-2211-05',
        driveId: '1lMwDQXckRhWhXyB8qeeIs7JxI4f5cgGy',
        type: 'photo',
        day: '2026-11-22',
        src: '/galerie/run-2211-05-1600.webp',
        thumb: '/galerie/run-2211-05-640.webp',
        width: 1600,
        height: 2133,
        caption: 'Vor dem Start an der Orangerie'
      },
      {
        id: 'run-2211-06',
        driveId: '11OThsLBopkQ0x14m6aLM3oVAEYRsRJDB',
        type: 'photo',
        day: '2026-11-22',
        src: '/galerie/run-2211-06-1600.webp',
        thumb: '/galerie/run-2211-06-640.webp',
        width: 1600,
        height: 2133,
        caption: 'Eindrücke vom 22. November'
      },
      {
        id: 'run-2211-07',
        driveId: '1T0a4mj6uKdP4-KtwkNaD3SAWmBRi4y4l',
        type: 'photo',
        day: '2026-11-22',
        src: '/galerie/run-2211-07-1600.webp',
        thumb: '/galerie/run-2211-07-640.webp',
        width: 1600,
        height: 2133,
        caption: 'Kassel United vor der Orangerie'
      },
      {
        id: 'run-2211-08',
        driveId: '1aESAg1GfsqCSElfOD-L2X5twK2MEOin_',
        type: 'photo',
        day: '2026-11-22',
        src: '/galerie/run-2211-08-1600.webp',
        thumb: '/galerie/run-2211-08-640.webp',
        width: 1600,
        height: 2133,
        caption: 'Sonntagsstimmung am Schloss Orangerie'
      },
      {
        id: 'run-2211-09',
        driveId: '1RlcduV2xxYqF9UkRuQEdxceTwe5lhJIA',
        type: 'photo',
        day: '2026-11-22',
        src: '/galerie/run-2211-09-1600.webp',
        thumb: '/galerie/run-2211-09-640.webp',
        width: 1600,
        height: 2133,
        caption: 'Gemeinsam draußen in Kassel'
      },
      {
        id: 'run-2211-10',
        driveId: '1Wf7eCBb_3ht4KTRmZVWWyafHNJtUlI31',
        type: 'photo',
        day: '2026-11-22',
        src: '/galerie/run-2211-10-1600.webp',
        thumb: '/galerie/run-2211-10-640.webp',
        width: 1600,
        height: 2133,
        caption: 'Community-Moment am 22. November'
      },
      {
        id: 'run-0111-awbg',
        type: 'video',
        day: '2026-11-01',
        src: '/galerie/run-0111-awbg.mp4',
        poster: '/galerie/run-0111-awbg-poster.webp',
        width: 720,
        height: 1280,
        caption: 'Gemeinsam loslaufen an der Orangerie'
      },
      {
        id: 'run-0111-awbw',
        type: 'video',
        day: '2026-11-01',
        src: '/galerie/run-0111-awbw.mp4',
        poster: '/galerie/run-0111-awbw-poster.webp',
        width: 720,
        height: 1280,
        caption: 'Laufrunde durch die Karlsaue'
      },
      {
        id: 'run-0111-awca',
        type: 'video',
        day: '2026-11-01',
        src: '/galerie/run-0111-awca.mp4',
        poster: '/galerie/run-0111-awca-poster.webp',
        width: 720,
        height: 1280,
        caption: 'Gemeinsam unterwegs'
      },
      {
        id: 'run-0111-awcq',
        type: 'video',
        day: '2026-11-01',
        src: '/galerie/run-0111-awcq.mp4',
        poster: '/galerie/run-0111-awcq-poster.webp',
        width: 720,
        height: 1280,
        caption: 'Ein Moment auf der Laufstrecke'
      },
      {
        id: 'run-0111-awcg',
        type: 'video',
        day: '2026-11-01',
        src: '/galerie/run-0111-awcg.mp4',
        poster: '/galerie/run-0111-awcg-poster.webp',
        width: 720,
        height: 1280,
        caption: 'Die Crew an der Orangerie'
      },
      {
        id: 'run-0111-awcw',
        type: 'video',
        day: '2026-11-01',
        src: '/galerie/run-0111-awcw.mp4',
        poster: '/galerie/run-0111-awcw-poster.webp',
        width: 720,
        height: 1280,
        caption: 'Gemeinsames Training im Freien'
      },
      {
        id: 'run-0111-awdq',
        type: 'video',
        day: '2026-11-01',
        src: '/galerie/run-0111-awdq.mp4',
        poster: '/galerie/run-0111-awdq-poster.webp',
        width: 720,
        height: 1280,
        caption: 'Zusammen trainieren'
      },
      {
        id: 'run-0111-awda',
        type: 'photo',
        day: '2026-11-01',
        src: '/galerie/run-0111-awda-1600.webp',
        thumb: '/galerie/run-0111-awda-640.webp',
        width: 480,
        height: 640,
        caption: 'Getränke und Preise beim Community-Treffen'
      },
      {
        id: 'run-0111-awdg',
        type: 'photo',
        day: '2026-11-01',
        src: '/galerie/run-0111-awdg-1600.webp',
        thumb: '/galerie/run-0111-awdg-640.webp',
        width: 480,
        height: 640,
        caption: 'Einblicke vom Community-Treffen'
      },
      {
        id: 'community-1',
        type: 'photo',
        day: '2026-10-25',
        src: '/galerie/community-1-1600.webp',
        thumb: '/galerie/community-1-640.webp',
        width: 1179,
        height: 2096,
        caption: 'Gemeinsamer Moment vor der Orangerie'
      },
      {
        id: 'community-2',
        type: 'photo',
        day: '2026-10-25',
        src: '/galerie/community-2-1600.webp',
        thumb: '/galerie/community-2-640.webp',
        width: 2066,
        height: 3672,
        caption: 'Treffpunkt bei tief stehender Sonne vor der Orangerie'
      },
      {
        id: 'community-3',
        type: 'photo',
        day: '2026-10-25',
        src: '/galerie/community-3-1600.webp',
        thumb: '/galerie/community-3-640.webp',
        width: 1080,
        height: 722,
        caption: 'Gruppenfoto von Kassel United vor der Orangerie'
      },
      {
        id: 'community-4',
        type: 'photo',
        day: '2026-10-25',
        src: '/galerie/community-4-1600.webp',
        thumb: '/galerie/community-4-640.webp',
        width: 1068,
        height: 1600,
        caption: 'Crew-Moment vor der Orangerie'
      },
      {
        id: 'community-5',
        type: 'photo',
        day: '2026-10-25',
        src: '/galerie/community-5-1600.webp',
        thumb: '/galerie/community-5-640.webp',
        width: 1068,
        height: 1600,
        caption: 'Gemeinsam vor der Orangerie in Kassel'
      }
    ]
  };
}

let sqliteDb;
let postgresPool;
let pgCmsTablesReady = false;

export async function getPostgres() {
  postgresPool ??= import('pg').then(({ default: pg }) =>
    new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3, connectionTimeoutMillis: 5000 })
  );
  return postgresPool;
}

export function getSqlite() {
  if (!sqliteDb) {
    mkdirSync('.local', { recursive: true });
    sqliteDb = new DatabaseSync(process.env.KU_TEST_DB || '.local/registrations.sqlite');
    sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS state(id INTEGER PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS cms_state(id INTEGER PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS cms_media(id TEXT PRIMARY KEY, mime TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL);
    `);
    sqliteDb.prepare('INSERT OR IGNORE INTO state VALUES(1, ?)').run(JSON.stringify(emptyRegistrations()));
  }
  return sqliteDb;
}

export async function redis(command) {
  const r = await fetch(process.env.KV_REST_API_URL, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + process.env.KV_REST_API_TOKEN,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(command)
  });
  if (!r.ok) throw Error('Datenspeicher nicht erreichbar.');
  const j = await r.json();
  if (j.error) throw Error('Datenspeicherfehler.');
  return j.result;
}

async function ensurePgCmsTables() {
  if (pgCmsTablesReady) return;
  const pool = await getPostgres();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ku_cms_state (
      id INTEGER PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ku_cms_media (
      id TEXT PRIMARY KEY,
      mime TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  pgCmsTablesReady = true;
}

export async function readRegistrationStateRaw() {
  if (process.env.DATABASE_URL) {
    const result = await (await getPostgres()).query('SELECT value FROM ku_registration_state WHERE id = 1');
    return result.rows[0]?.value ?? JSON.stringify(emptyRegistrations());
  }
  if (process.env.KV_REST_API_URL) {
    const value = await redis(['GET', 'ku:registrations:v1']);
    return value || JSON.stringify(emptyRegistrations());
  }
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
    throw Error('Datenspeicher noch nicht eingerichtet.');
  }
  return getSqlite().prepare('SELECT value FROM state WHERE id = 1').get().value;
}

export async function mutateRegistrationState(fn) {
  for (let i = 0; i < 10; i++) {
    const old = await readRegistrationStateRaw();
    const state = JSON.parse(old);
    const result = fn(state);
    const next = JSON.stringify(state);
    let ok = false;
    if (process.env.DATABASE_URL) {
      const q = await (await getPostgres()).query(
        `INSERT INTO ku_registration_state (id, value)
         SELECT 1, $1::text WHERE $2::text = $3::text OR EXISTS (SELECT 1 FROM ku_registration_state WHERE id = 1)
         ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value
         WHERE ku_registration_state.value = $2::text`,
        [next, old, JSON.stringify(emptyRegistrations())]
      );
      ok = q.rowCount === 1;
    } else if (process.env.KV_REST_API_URL) {
      ok = await redis([
        'EVAL',
        "local v=redis.call('GET',KEYS[1]); if (not v and ARGV[1]==ARGV[3]) or v==ARGV[1] then redis.call('SET',KEYS[1],ARGV[2]); return 1 end; return 0",
        1,
        'ku:registrations:v1',
        old,
        next,
        JSON.stringify(emptyRegistrations())
      ]);
    } else {
      ok = getSqlite().prepare('UPDATE state SET value = ? WHERE id = 1 AND value = ?').run(next, old).changes === 1;
    }
    if (ok) return result;
  }
  throw Error('Bitte erneut versuchen.');
}

function normalizeCms(raw) {
  const seed = defaultCmsState();
  if (!raw || typeof raw !== 'object') return seed;
  const runBanner = { ...seed.runBanner, ...(raw.runBanner || {}) };
  const days = Array.isArray(raw.days) ? raw.days.filter(d => d && isIsoDate(d.date)) : [...seed.days];
  const media = Array.isArray(raw.media) ? [...raw.media] : [...seed.media];
  const driveFolders =
    Array.isArray(raw.driveFolders) && raw.driveFolders.length
      ? raw.driveFolders.filter(f => f && typeof f.id === 'string' && f.id.length >= 10)
      : [...seed.driveFolders];
  const ignoredDriveIds = Array.isArray(raw.ignoredDriveIds)
    ? [...new Set(raw.ignoredDriveIds.filter(x => typeof x === 'string'))]
    : [...seed.ignoredDriveIds];

  // Auto-upgrade v1 stored CMS state once to include the newly imported 22.11.2026 run photos
  if ((raw.version || 1) < 2) {
    if (!days.some(d => d.date === '2026-11-22')) {
      days.push({ date: '2026-11-22', title: 'Sonntagslauf · Hessenschau zu Besuch' });
    }
    const existingIds = new Set(media.map(m => m.id));
    const newSeedItems = seed.media.filter(m => m.day === '2026-11-22' && !existingIds.has(m.id));
    if (newSeedItems.length) media.unshift(...newSeedItems);
    for (const id of SEED_KNOWN_DRIVE_IDS) {
      if (!ignoredDriveIds.includes(id)) ignoredDriveIds.push(id);
    }
  }

  days.sort((a, b) => b.date.localeCompare(a.date));
  return {
    version: 2,
    updatedAt: raw.updatedAt || seed.updatedAt,
    runBanner,
    driveFolders,
    ignoredDriveIds,
    lastDriveSync: raw.lastDriveSync || null,
    days,
    media
  };
}

export async function readCmsState() {
  if (process.env.DATABASE_URL) {
    await ensurePgCmsTables();
    const result = await (await getPostgres()).query('SELECT value FROM ku_cms_state WHERE id = 1');
    return result.rows[0]?.value ? normalizeCms(JSON.parse(result.rows[0].value)) : defaultCmsState();
  }
  if (process.env.KV_REST_API_URL) {
    const value = await redis(['GET', 'ku:cms:v1']);
    return value ? normalizeCms(JSON.parse(value)) : defaultCmsState();
  }
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
    return defaultCmsState();
  }
  const row = getSqlite().prepare('SELECT value FROM cms_state WHERE id = 1').get();
  return row?.value ? normalizeCms(JSON.parse(row.value)) : defaultCmsState();
}

export async function writeCmsState(nextState) {
  const normalized = normalizeCms({ ...nextState, version: 2, updatedAt: new Date().toISOString() });
  const serialized = JSON.stringify(normalized);
  if (process.env.DATABASE_URL) {
    await ensurePgCmsTables();
    await (await getPostgres()).query(
      `INSERT INTO ku_cms_state (id, value) VALUES (1, $1)
       ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value`,
      [serialized]
    );
    return normalized;
  }
  if (process.env.KV_REST_API_URL) {
    await redis(['SET', 'ku:cms:v1', serialized]);
    return normalized;
  }
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
    throw Error('Datenspeicher noch nicht eingerichtet.');
  }
  getSqlite()
    .prepare('INSERT INTO cms_state (id, value) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET value = excluded.value')
    .run(serialized);
  return normalized;
}

export async function saveMediaBlob(id, mime, base64Data) {
  const createdAt = new Date().toISOString();
  if (process.env.DATABASE_URL) {
    await ensurePgCmsTables();
    await (await getPostgres()).query(
      `INSERT INTO ku_cms_media (id, mime, data, created_at) VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET mime = EXCLUDED.mime, data = EXCLUDED.data`,
      [id, mime, base64Data, createdAt]
    );
    return;
  }
  if (process.env.KV_REST_API_URL) {
    await redis(['SET', `ku:media:${id}`, JSON.stringify({ mime, data: base64Data })]);
    return;
  }
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
    throw Error('Datenspeicher noch nicht eingerichtet.');
  }
  getSqlite()
    .prepare('INSERT INTO cms_media (id, mime, data, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET mime = excluded.mime, data = excluded.data')
    .run(id, mime, base64Data, createdAt);
}

export async function readMediaBlob(id) {
  if (process.env.DATABASE_URL) {
    await ensurePgCmsTables();
    const result = await (await getPostgres()).query('SELECT mime, data FROM ku_cms_media WHERE id = $1', [id]);
    return result.rows[0] || null;
  }
  if (process.env.KV_REST_API_URL) {
    const value = await redis(['GET', `ku:media:${id}`]);
    return value ? JSON.parse(value) : null;
  }
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
    return null;
  }
  return getSqlite().prepare('SELECT mime, data FROM cms_media WHERE id = ?').get(id) || null;
}

export async function deleteMediaBlob(id) {
  if (!id) return;
  if (process.env.DATABASE_URL) {
    await ensurePgCmsTables();
    await (await getPostgres()).query('DELETE FROM ku_cms_media WHERE id = $1', [id]);
    return;
  }
  if (process.env.KV_REST_API_URL) {
    await redis(['DEL', `ku:media:${id}`]);
    return;
  }
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
    return;
  }
  getSqlite().prepare('DELETE FROM cms_media WHERE id = ?').run(id);
}

export function sign(s) {
  if (!process.env.SESSION_SECRET) throw Error('Admin-Zugang noch nicht eingerichtet.');
  return createHmac('sha256', process.env.SESSION_SECRET).update(s).digest('hex');
}

export function equal(a, b) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function authenticated(req) {
  if (!process.env.SESSION_SECRET) return false;
  const token = (req.headers.cookie || '')
    .split(';')
    .map(c => c.trim())
    .find(c => c.startsWith('ku_session='))
    ?.slice(11) || '';
  const [expiry, nonce, sig] = token.split('.');
  return Boolean(expiry && nonce && sig && Number(expiry) > Date.now() && equal(sign(expiry + '.' + nonce), sig));
}

export function setSessionCookie(res, value, age) {
  res.setHeader(
    'Set-Cookie',
    `ku_session=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${process.env.VERCEL || process.env.NODE_ENV === 'production' ? '; Secure' : ''}`
  );
}

export function verifyOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) fail('Ungültige Anfrage.', 403);
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() || (process.env.VERCEL ? 'https' : 'http');
  const hostOrigin = `${proto}://${req.headers.host}`;
  const allowed = new Set([hostOrigin]);
  if (process.env.PUBLIC_ORIGIN) allowed.add(process.env.PUBLIC_ORIGIN);
  if (!allowed.has(origin)) fail('Ungültige Anfrage.', 403);
}

export async function readJsonBody(req, maxBytes = 12000) {
  let raw = '';
  if (req.body !== undefined) {
    raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  } else {
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > maxBytes) fail('Anfrage zu groß.', 413);
    }
  }
  if (raw.length > maxBytes) fail('Anfrage zu groß.', 413);
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw Error();
    return parsed;
  } catch {
    fail('Ungültige Anfrage.');
  }
}
