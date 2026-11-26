import { randomUUID } from 'node:crypto';
import {
  authenticated,
  deleteMediaBlob,
  fail,
  getUpcomingSundayBerlin,
  isIsoDate,
  readCmsState,
  readJsonBody,
  readMediaBlob,
  saveMediaBlob,
  str,
  verifyOrigin,
  writeCmsState
} from './_shared.mjs';

const DATA_URL_RE = /^data:(image\/(?:webp|jpeg|png));base64,([A-Za-z0-9+/=]+)$/;
const SAFE_MEDIA_ID_RE = /^[a-zA-Z0-9_-]{4,64}$/;
const MAX_UPLOAD_BODY = 3_600_000;
const MAX_DECODED_BYTES = 2_400_000;

function parseImageDataUrl(value, label = 'Bild') {
  if (typeof value !== 'string') fail(`${label} fehlt.`);
  const m = value.match(DATA_URL_RE);
  if (!m) fail(`${label} muss WebP, JPEG oder PNG sein.`);
  const mime = m[1];
  const base64 = m[2];
  const approxBytes = Math.floor((base64.length * 3) / 4);
  if (approxBytes < 32 || approxBytes > MAX_DECODED_BYTES) {
    fail(`${label} ist zu groß (maximal 2,4 MB nach Optimierung).`, 413);
  }
  return { mime, base64 };
}

function isSafeMediaUrl(url) {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed || trimmed.length > 500) return false;
  return trimmed.startsWith('/') || /^https:\/\//i.test(trimmed);
}

function extractBlobId(url) {
  if (typeof url !== 'string') return null;
  const m = url.match(/\/api\/cms\?action=media&id=([a-zA-Z0-9_-]{4,64})$/);
  return m ? m[1] : null;
}

export default async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const send = (code, data, cache = 'no-store') => {
    res.setHeader('Cache-Control', cache);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.statusCode = code;
    res.end(JSON.stringify(data));
  };

  try {
    const url = new URL(req.url, 'http://localhost');
    const action = url.searchParams.get('action') || 'public';

    if (req.method === 'GET' && action === 'media') {
      const id = url.searchParams.get('id') || '';
      if (!SAFE_MEDIA_ID_RE.test(id)) fail('Ungültige Medien-ID.', 400);
      const blob = await readMediaBlob(id);
      if (!blob) fail('Medium nicht gefunden.', 404);
      const buf = Buffer.from(blob.data, 'base64');
      res.setHeader('Content-Type', blob.mime);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.statusCode = 200;
      res.end(buf);
      return;
    }

    if (req.method === 'GET' && action === 'public') {
      const cms = await readCmsState();
      return send(
        200,
        {
          activeRun: getUpcomingSundayBerlin(),
          runBanner: cms.runBanner,
          days: cms.days,
          media: cms.media.filter(item => Boolean(item.day)),
          updatedAt: cms.updatedAt
        },
        'no-store'
      );
    }

    if (req.method === 'GET' && action === 'state') {
      if (!authenticated(req)) fail('Bitte anmelden.', 401);
      const cms = await readCmsState();
      return send(200, { activeRun: getUpcomingSundayBerlin(), ...cms });
    }

    if (req.method !== 'POST') fail('Methode nicht erlaubt.', 405);
    verifyOrigin(req);
    if (!authenticated(req)) fail('Bitte anmelden.', 401);

    const b = await readJsonBody(req, action === 'upload' ? MAX_UPLOAD_BODY : 64000);
    const cms = await readCmsState();

    if (action === 'add-day') {
      const date = str(b.date, 10);
      const title = str(b.title, 90);
      if (!isIsoDate(date)) fail('Bitte ein gültiges Datum (JJJJ-MM-TT) wählen.');
      const existing = cms.days.find(d => d.date === date);
      if (existing) {
        if (title) existing.title = title;
      } else {
        cms.days.push({ date, title });
      }
      const saved = await writeCmsState(cms);
      return send(200, { ok: true, activeRun: getUpcomingSundayBerlin(), ...saved });
    }

    if (action === 'update-day') {
      const oldDate = str(b.oldDate, 10);
      const date = str(b.date, 10);
      const title = str(b.title, 90);
      if (!isIsoDate(oldDate) || !isIsoDate(date)) fail('Bitte ein gültiges Datum angeben.');
      const idx = cms.days.findIndex(d => d.date === oldDate);
      if (idx === -1) fail('Tag nicht gefunden.', 404);
      if (date !== oldDate && cms.days.some(d => d.date === date)) {
        fail('Dieses Datum existiert bereits.');
      }
      cms.days[idx] = { date, title };
      if (date !== oldDate) {
        for (const item of cms.media) {
          if (item.day === oldDate) item.day = date;
        }
      }
      const saved = await writeCmsState(cms);
      return send(200, { ok: true, activeRun: getUpcomingSundayBerlin(), ...saved });
    }

    if (action === 'delete-day') {
      const date = str(b.date, 10);
      if (!isIsoDate(date)) fail('Ungültiges Datum.');
      cms.days = cms.days.filter(d => d.date !== date);
      for (const item of cms.media) {
        if (item.day === date) item.day = '';
      }
      const saved = await writeCmsState(cms);
      return send(200, { ok: true, activeRun: getUpcomingSundayBerlin(), ...saved });
    }

    if (action === 'assign-day') {
      const ids = Array.isArray(b.ids) ? b.ids.map(x => str(x, 80)).filter(Boolean) : [];
      const day = str(b.day, 10);
      if (!ids.length) fail('Keine Medien ausgewählt.');
      if (day && !isIsoDate(day)) fail('Ungültiges Ziel-Datum.');
      if (day && !cms.days.some(d => d.date === day)) {
        cms.days.push({ date: day, title: '' });
      }
      const idSet = new Set(ids);
      let changed = 0;
      for (const item of cms.media) {
        if (idSet.has(item.id)) {
          item.day = day;
          changed++;
        }
      }
      if (!changed) fail('Medium nicht gefunden.', 404);
      const saved = await writeCmsState(cms);
      return send(200, { ok: true, activeRun: getUpcomingSundayBerlin(), ...saved });
    }

    if (action === 'update-media') {
      const id = str(b.id, 80);
      const idx = cms.media.findIndex(m => m.id === id);
      if (idx === -1) fail('Medium nicht gefunden.', 404);
      const item = cms.media[idx];
      if (typeof b.caption === 'string') item.caption = str(b.caption, 160);
      if (typeof b.day === 'string') {
        const nextDay = str(b.day, 10);
        if (nextDay && !isIsoDate(nextDay)) fail('Ungültiges Datum.');
        if (nextDay && !cms.days.some(d => d.date === nextDay)) {
          cms.days.push({ date: nextDay, title: '' });
        }
        item.day = nextDay;
      }
      if (b.move === 'up' || b.move === 'down') {
        const sameDayIndices = cms.media
          .map((m, i) => ({ m, i }))
          .filter(x => x.m.day === item.day)
          .map(x => x.i);
        const pos = sameDayIndices.indexOf(idx);
        const swapPos = b.move === 'up' ? pos - 1 : pos + 1;
        if (swapPos >= 0 && swapPos < sameDayIndices.length) {
          const targetIdx = sameDayIndices[swapPos];
          [cms.media[idx], cms.media[targetIdx]] = [cms.media[targetIdx], cms.media[idx]];
        }
      }
      const saved = await writeCmsState(cms);
      return send(200, { ok: true, activeRun: getUpcomingSundayBerlin(), ...saved });
    }

    if (action === 'delete-media') {
      const id = str(b.id, 80);
      const idx = cms.media.findIndex(m => m.id === id);
      if (idx === -1) fail('Medium nicht gefunden.', 404);
      const [removed] = cms.media.splice(idx, 1);
      const saved = await writeCmsState(cms);
      const blobIds = new Set([extractBlobId(removed.src), extractBlobId(removed.thumb)].filter(Boolean));
      for (const blobId of blobIds) {
        await deleteMediaBlob(blobId).catch(() => {});
      }
      return send(200, { ok: true, activeRun: getUpcomingSundayBerlin(), ...saved });
    }

    if (action === 'upload') {
      const day = str(b.day, 10);
      if (day && !isIsoDate(day)) fail('Ungültiges Ziel-Datum.');
      const caption = str(b.caption, 160) || 'Kassel United · Sonntagslauf';
      const fullImg = parseImageDataUrl(b.dataUrl, 'Bild');
      const thumbImg = b.thumbDataUrl ? parseImageDataUrl(b.thumbDataUrl, 'Vorschaubild') : null;
      const width = Math.min(4000, Math.max(100, Number(b.width) || 1200));
      const height = Math.min(4000, Math.max(100, Number(b.height) || 1600));

      const baseId = 'img_' + randomUUID().replace(/-/g, '').slice(0, 14);
      const fullBlobId = baseId;
      await saveMediaBlob(fullBlobId, fullImg.mime, fullImg.base64);

      let thumbUrl = `/api/cms?action=media&id=${fullBlobId}`;
      if (thumbImg) {
        const thumbBlobId = baseId + '_t';
        await saveMediaBlob(thumbBlobId, thumbImg.mime, thumbImg.base64);
        thumbUrl = `/api/cms?action=media&id=${thumbBlobId}`;
      }

      if (day && !cms.days.some(d => d.date === day)) {
        const [y, m, d] = day.split('-').map(Number);
        const isSunday = new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 0;
        cms.days.push({ date: day, title: isSunday ? 'Sonntagslauf · Schloss Orangerie' : '' });
      }

      const item = {
        id: baseId,
        type: 'photo',
        day,
        src: `/api/cms?action=media&id=${fullBlobId}`,
        thumb: thumbUrl,
        width,
        height,
        caption,
        uploadedAt: new Date().toISOString()
      };
      cms.media.unshift(item);
      const saved = await writeCmsState(cms);
      return send(201, { ok: true, item, activeRun: getUpcomingSundayBerlin(), ...saved });
    }

    if (action === 'add-url') {
      const type = b.type === 'video' ? 'video' : 'photo';
      const src = str(b.src, 500);
      const thumb = str(b.thumb, 500);
      const poster = str(b.poster, 500);
      const caption = str(b.caption, 160) || 'Kassel United Moment';
      const day = str(b.day, 10);
      if (!isSafeMediaUrl(src)) fail('Bitte eine gültige URL (/... oder https://...) angeben.');
      if (thumb && !isSafeMediaUrl(thumb)) fail('Ungültige Vorschau-URL.');
      if (poster && !isSafeMediaUrl(poster)) fail('Ungültige Poster-URL.');
      if (day && !isIsoDate(day)) fail('Ungültiges Datum.');
      if (day && !cms.days.some(d => d.date === day)) {
        cms.days.push({ date: day, title: '' });
      }
      const item = {
        id: 'ext_' + randomUUID().replace(/-/g, '').slice(0, 12),
        type,
        day,
        src,
        ...(type === 'video' ? { poster: poster || '' } : { thumb: thumb || src }),
        width: type === 'video' ? 720 : 1200,
        height: type === 'video' ? 1280 : 1600,
        caption
      };
      cms.media.unshift(item);
      const saved = await writeCmsState(cms);
      return send(201, { ok: true, item, activeRun: getUpcomingSundayBerlin(), ...saved });
    }

    if (action === 'save-banner') {
      cms.runBanner = {
        title: str(b.title, 80) || 'Diesen Sonntag dabei?',
        specialNote: str(b.specialNote, 120),
        description:
          str(b.description, 320) ||
          'Alle Altersgruppen sind willkommen. Melde dich an und lauf mit: So hast du die Chance auf einen extra Gutschein.',
        raffleNote:
          str(b.raffleNote, 320) ||
          'Der extra Gutschein wird unter den angemeldeten Personen verlost, die tatsächlich mitlaufen. Die Gruppeneinladung ist dafür nicht erforderlich.',
        registrationOpen: b.registrationOpen !== false
      };
      const saved = await writeCmsState(cms);
      return send(200, { ok: true, activeRun: getUpcomingSundayBerlin(), ...saved });
    }

    fail('Nicht gefunden.', 404);
  } catch (e) {
    send(Number.isInteger(e.code) ? e.code : 503, {
      error: Number.isInteger(e.code) ? e.message : 'Dienst momentan nicht verfügbar. Bitte später erneut versuchen.'
    });
  }
}
