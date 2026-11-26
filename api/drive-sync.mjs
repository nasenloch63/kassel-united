import {
  authenticated,
  berlinParts,
  fail,
  getUpcomingSundayBerlin,
  readCmsState,
  verifyOrigin,
  writeCmsState
} from './_shared.mjs';

const MONTHS_EN = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
};

const SKIP_NAME_RE = /(?:^|[\s._-])(logo|herkules|herakles|favicon)(?:[\s._-]|$)|\.(?:svg|pdf|gif|txt|doc|docx|xlsx)$/i;
const IMAGE_EXT_RE = /\.(?:jpe?g|png|webp|heic|heif)$/i;

function decodeHtml(s) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function isValidYmd(y, m, d) {
  if (y < 2015 || y > 2035 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function toIsoYmd(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function extractDateFromFilename(name, refYear) {
  const s = String(name || '');
  // YYYY-MM-DD or YYYYMMDD
  let m = s.match(/(?:^|[^0-9])(20[1-3]\d)[-_.]?([01]\d)[-_.]?([0-3]\d)(?:[^0-9]|$)/);
  if (m && isValidYmd(Number(m[1]), Number(m[2]), Number(m[3]))) {
    return toIsoYmd(Number(m[1]), Number(m[2]), Number(m[3]));
  }
  // DD.MM.YYYY or DD-MM-YYYY or DD.MM.YY
  m = s.match(/(?:^|[^0-9])([0-3]\d)[.-]([01]\d)[.-](20[1-3]\d|[2-3]\d)(?:[^0-9]|$)/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    if (isValidYmd(y, Number(m[2]), Number(m[1]))) {
      return toIsoYmd(y, Number(m[2]), Number(m[1]));
    }
  }
  // DD.MM (e.g. "run 01.11.MOV" or "22.11")
  m = s.match(/(?:^|[^0-9])([0-3]\d)\.([01]\d)(?:[^0-9]|$)/);
  if (m && isValidYmd(refYear, Number(m[2]), Number(m[1]))) {
    return toIsoYmd(refYear, Number(m[2]), Number(m[1]));
  }
  return null;
}

function parseDriveModifiedLabel(label, nowParts) {
  const clean = String(label || '').trim();
  // "Nov 22, 2026" or "Nov 22"
  const m = clean.match(/^([A-Za-z]{3})\s+(\d{1,2})(?:,\s*(\d{4}))?$/);
  if (m) {
    const mo = MONTHS_EN[m[1].toLowerCase()];
    const day = Number(m[2]);
    let year = m[3] ? Number(m[3]) : nowParts.year;
    if (!m[3] && mo > nowParts.month + 1) year -= 1;
    if (mo && isValidYmd(year, mo, day)) return toIsoYmd(year, mo, day);
  }
  // "14:30" or "2:30 PM" -> modified today
  if (/^\d{1,2}:\d{2}/.test(clean)) {
    return toIsoYmd(nowParts.year, nowParts.month, nowParts.day);
  }
  return toIsoYmd(nowParts.year, nowParts.month, nowParts.day);
}

function cleanCaption(filename, folderName) {
  const base = String(filename || '').replace(/\.[^.]+$/, '').trim();
  // Replace generic camera/UUID filenames with a clean Kassel United caption
  if (/^(?:IMG|DSC|PXL|VID|MOV)[_-]?\d+/i.test(base) || /^[0-9A-F]{8}-[0-9A-F]{4}-/i.test(base)) {
    return folderName ? `${folderName} · Kassel United` : 'Kassel United · Sonntagslauf';
  }
  return base.replace(/[_-]+/g, ' ').slice(0, 140) || 'Kassel United · Sonntagslauf';
}

async function listPublicFolderViaHtml(folderId) {
  const res = await fetch(`https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(folderId)}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KasselUnitedCMS/1.0)' }
  });
  if (!res.ok) throw Error(`Drive-Ordner ${folderId} nicht öffentlich erreichbar (HTTP ${res.status}).`);
  const html = await res.text();
  const blocks = html.split('<div class="flip-entry"').slice(1);
  const items = [];
  for (const block of blocks) {
    const idMatch = block.match(/id="entry-([a-zA-Z0-9_-]+)"/);
    const titleMatch = block.match(/<div class="flip-entry-title">([^<]+)<\/div>/);
    if (!idMatch || !titleMatch) continue;
    const id = idMatch[1];
    const name = decodeHtml(titleMatch[1]).trim();
    const isFolder = /href="https:\/\/drive\.google\.com\/drive\/folders\//.test(block);
    const mimeMatch = block.match(/drive-thirdparty\.googleusercontent\.com\/\d+\/type\/([^"']+)/);
    const modMatch = block.match(/<div class="flip-entry-last-modified"><div>([^<]+)<\/div><\/div>/);
    items.push({
      id,
      name,
      isFolder,
      mimeType: mimeMatch ? mimeMatch[1] : isFolder ? 'application/vnd.google-apps.folder' : '',
      modifiedLabel: modMatch ? decodeHtml(modMatch[1]).trim() : ''
    });
  }
  return items;
}

async function listPublicFolderViaApiKey(folderId, apiKey) {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  const fields = encodeURIComponent(
    'files(id,name,mimeType,createdTime,modifiedTime,imageMediaMetadata(time,width,height))'
  );
  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&pageSize=200&key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);
  if (!res.ok) throw Error(`Drive API Fehler (HTTP ${res.status}).`);
  const json = await res.json();
  return (json.files || []).map(f => ({
    id: f.id,
    name: f.name,
    isFolder: f.mimeType === 'application/vnd.google-apps.folder',
    mimeType: f.mimeType || '',
    modifiedTime: f.modifiedTime || f.createdTime || '',
    exifTime: f.imageMediaMetadata?.time || '',
    width: f.imageMediaMetadata?.width || 1600,
    height: f.imageMediaMetadata?.height || 2133
  }));
}

async function scanFolderRecursive(folderId, folderName, depth = 0) {
  const apiKey = process.env.GOOGLE_DRIVE_API_KEY || '';
  const entries = apiKey
    ? await listPublicFolderViaApiKey(folderId, apiKey)
    : await listPublicFolderViaHtml(folderId);

  const files = [];
  for (const entry of entries) {
    if (entry.isFolder) {
      if (depth < 1 && !/^logo$/i.test(entry.name)) {
        const sub = await scanFolderRecursive(entry.id, entry.name, depth + 1).catch(() => []);
        files.push(...sub);
      }
      continue;
    }
    files.push({ ...entry, folderName });
  }
  return files;
}

function resolveDriveItemDate(item, nowParts) {
  // 1. Official EXIF timestamp if API key was used
  if (item.exifTime) {
    const m = String(item.exifTime).match(/^(\d{4}):(\d{2}):(\d{2})/);
    if (m && isValidYmd(Number(m[1]), Number(m[2]), Number(m[3]))) {
      return toIsoYmd(Number(m[1]), Number(m[2]), Number(m[3]));
    }
  }
  // 2. Date inside filename
  const byName = extractDateFromFilename(item.name, nowParts.year);
  if (byName) return byName;
  // 3. ISO modifiedTime (API) or Drive label ("Nov 22")
  if (item.modifiedTime) {
    const iso = String(item.modifiedTime).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  }
  return parseDriveModifiedLabel(item.modifiedLabel, nowParts);
}

export async function runGoogleDriveSync(cms) {
  const nowParts = berlinParts();
  const existingDriveIds = new Set(cms.media.map(m => m.driveId).filter(Boolean));
  const ignoredIds = new Set(cms.ignoredDriveIds || []);
  const folders = cms.driveFolders || [];

  let added = 0;
  let scanned = 0;
  const folderResults = [];
  const addedItems = [];

  for (const folder of folders) {
    try {
      const files = await scanFolderRecursive(folder.id, folder.name, 0);
      scanned += files.length;
      let folderAdded = 0;

      for (const f of files) {
        if (existingDriveIds.has(f.id) || ignoredIds.has(f.id)) continue;
        if (SKIP_NAME_RE.test(f.name)) continue;

        const isImage =
          (f.mimeType && f.mimeType.startsWith('image/') && f.mimeType !== 'image/svg+xml' && f.mimeType !== 'image/gif') ||
          IMAGE_EXT_RE.test(f.name);
        if (!isImage) continue;

        const day = resolveDriveItemDate(f, nowParts);
        if (!cms.days.some(d => d.date === day)) {
          const [y, m, d] = day.split('-').map(Number);
          const isSunday = new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 0;
          cms.days.push({
            date: day,
            title: isSunday ? 'Sonntagslauf · Schloss Orangerie' : f.folderName || ''
          });
        }

        const item = {
          id: 'drv_' + f.id.slice(0, 14),
          driveId: f.id,
          type: 'photo',
          day,
          src: `https://drive.google.com/thumbnail?id=${encodeURIComponent(f.id)}&sz=w1600`,
          thumb: `https://drive.google.com/thumbnail?id=${encodeURIComponent(f.id)}&sz=w640`,
          width: f.width || 1600,
          height: f.height || 2133,
          caption: cleanCaption(f.name, f.folderName),
          source: 'gdrive',
          syncedAt: new Date().toISOString()
        };

        addedItems.push(item);
        existingDriveIds.add(f.id);
        added++;
        folderAdded++;
      }

      folderResults.push({ id: folder.id, name: folder.name, ok: true, scanned: files.length, added: folderAdded });
    } catch (err) {
      folderResults.push({ id: folder.id, name: folder.name, ok: false, error: err.message });
    }
  }

  if (addedItems.length) {
    // Keep newest dates first
    addedItems.sort((a, b) => b.day.localeCompare(a.day));
    cms.media.unshift(...addedItems);
  }

  cms.lastDriveSync = {
    at: new Date().toISOString(),
    added,
    scanned,
    folders: folderResults
  };

  const saved = await writeCmsState(cms);
  return { saved, added, scanned, folders: folderResults };
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
    const isCronHeader = Boolean(req.headers['x-vercel-cron']);
    const cronSecret = process.env.CRON_SECRET || '';
    const authHeader = req.headers.authorization || '';
    const validCron = cronSecret ? authHeader === `Bearer ${cronSecret}` : isCronHeader;

    if (req.method === 'GET') {
      if (!validCron && !authenticated(req)) fail('Nicht autorisiert.', 401);
    } else if (req.method === 'POST') {
      verifyOrigin(req);
      if (!authenticated(req)) fail('Bitte anmelden.', 401);
    } else {
      fail('Methode nicht erlaubt.', 405);
    }

    const cms = await readCmsState();
    const result = await runGoogleDriveSync(cms);
    return send(200, {
      ok: true,
      added: result.added,
      scanned: result.scanned,
      folders: result.folders,
      activeRun: getUpcomingSundayBerlin(),
      ...result.saved
    });
  } catch (e) {
    return send(Number.isInteger(e.code) ? e.code : 503, {
      error: Number.isInteger(e.code) ? e.message : 'Google-Drive-Sync fehlgeschlagen.'
    });
  }
}
