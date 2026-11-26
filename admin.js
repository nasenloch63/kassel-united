(() => {
  const WEEKDAYS_DE = ['So.', 'Mo.', 'Di.', 'Mi.', 'Do.', 'Fr.', 'Sa.'];
  const el = id => document.getElementById(id);

  let regData = null;
  let cmsData = null;
  let activeTab = 'cms'; // 'cms' | 'runs' | 'fighters'
  let cmsFilter = 'all'; // 'all' | 'unassigned' | 'YYYY-MM-DD'
  let uploadDayMode = 'auto'; // 'auto' | '' | 'YYYY-MM-DD'
  let selectedRun = '';
  let selectedIds = new Set();
  let draggedIds = [];
  let editingDayDate = null;

  function setStatus(msg) {
    el('status').textContent = msg || '';
  }

  function formatShortDate(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return iso || '';
    const [y, m, d] = iso.split('-');
    return `${d}.${m}.${y}`;
  }

  function formatDateWithWeekday(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return iso || '';
    const [y, m, d] = iso.split('-').map(Number);
    const wd = WEEKDAYS_DE[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] || '';
    return `${wd}, ${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`;
  }

  function defaultSundayIso() {
    const now = new Date();
    const back = now.getDay(); // 0 = Sun -> today; Mon..Sat -> last Sunday
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function showLogin() {
    el('dashboard').hidden = true;
    el('login-panel').hidden = false;
    el('logout').hidden = true;
    regData = null;
    cmsData = null;
  }

  async function api(endpoint, action, body, query = '') {
    const url = `/api/${endpoint}?action=${encodeURIComponent(action)}${query}`;
    const r = await fetch(
      url,
      body !== undefined
        ? {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          }
        : {}
    );
    const d = await r.json().catch(() => ({}));
    if (r.status === 401) showLogin();
    if (!r.ok) throw Error(d.error || 'Anfrage fehlgeschlagen.');
    return d;
  }

  async function runAction(button, fn, successMsg = '') {
    if (button) button.disabled = true;
    setStatus('');
    try {
      await fn();
      if (successMsg) setStatus(successMsg);
    } catch (e) {
      setStatus(e.message || 'Ein Fehler ist aufgetreten.');
    } finally {
      if (button) button.disabled = false;
      if (regData && cmsData) renderAll();
    }
  }

  async function refreshAll() {
    const runQuery = selectedRun ? `&run=${encodeURIComponent(selectedRun)}` : '';
    const [reg, cms] = await Promise.all([
      api('registration', 'admin', undefined, runQuery),
      api('cms', 'state')
    ]);
    regData = reg;
    cmsData = cms;
    selectedRun = reg.run;
    el('login-panel').hidden = true;
    el('dashboard').hidden = false;
    el('logout').hidden = false;
    hydrateBannerForm();
    renderAll();
  }

  function setTab(next) {
    activeTab = next;
    el('tab-cms').setAttribute('aria-selected', String(next === 'cms'));
    el('tab-runs').setAttribute('aria-selected', String(next === 'runs'));
    el('tab-fighters').setAttribute('aria-selected', String(next === 'fighters'));
    el('view-cms').hidden = next !== 'cms';
    el('view-runs').hidden = next !== 'runs';
    el('view-fighters').hidden = next !== 'fighters';
  }

  function hydrateBannerForm() {
    if (!cmsData?.runBanner) return;
    const b = cmsData.runBanner;
    el('banner-title').value = b.title || '';
    el('banner-special').value = b.specialNote || '';
    el('banner-desc').value = b.description || '';
    el('banner-raffle').value = b.raffleNote || '';
    el('banner-open').checked = b.registrationOpen !== false;
    el('active-run-badge').textContent = formatDateWithWeekday(cmsData.activeRun || regData?.activeRun || '');
  }

  function renderAll() {
    if (!regData || !cmsData) return;

    const runs = regData.registrations.filter(r => r.kind === 'run' && r.event === selectedRun);
    const fights = regData.registrations.filter(r => r.kind === 'fight');

    el('cms-tab-count').textContent = String(cmsData.media.length);
    el('run-tab-count').textContent = String(runs.length);
    el('fight-tab-count').textContent = String(fights.length);

    renderCms();
    renderRuns(runs, fights);
    renderFighters(fights);
  }

  /* ==================== CMS GALLERY & DAYS ==================== */

  function dayCount(dayKey) {
    if (dayKey === 'all') return cmsData.media.length;
    if (dayKey === 'unassigned') return cmsData.media.filter(m => !m.day).length;
    return cmsData.media.filter(m => m.day === dayKey).length;
  }

  function buildDaySelectOptions(selectEl, currentVal, includeUnassigned = true, compact = false, includeAuto = false) {
    selectEl.replaceChildren();
    if (includeAuto) {
      const opt = document.createElement('option');
      opt.value = 'auto';
      opt.textContent = 'Automatisch (Erstelldatum)';
      selectEl.append(opt);
    }
    if (includeUnassigned) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'Ohne Datum';
      selectEl.append(opt);
    }
    for (const d of cmsData.days) {
      const opt = document.createElement('option');
      opt.value = d.date;
      opt.textContent = !compact && d.title ? `${formatShortDate(d.date)} · ${d.title}` : formatShortDate(d.date);
      selectEl.append(opt);
    }
    const valid = [...selectEl.options].some(o => o.value === currentVal);
    selectEl.value = valid ? currentVal : includeAuto ? 'auto' : '';
  }

  function isValidYmd(y, m, d) {
    if (y < 2015 || y > 2035 || m < 1 || m > 12 || d < 1 || d > 31) return false;
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }

  function toIsoYmd(y, m, d) {
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  function parseExifDateString(str) {
    const m = str.match(/^(\d{4}):(\d{2}):(\d{2})/);
    if (!m) return null;
    const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    return isValidYmd(y, mo, d) ? toIsoYmd(y, mo, d) : null;
  }

  function readAscii(view, start, len) {
    let out = '';
    const end = Math.min(view.byteLength, start + len);
    for (let i = start; i < end; i++) {
      const c = view.getUint8(i);
      if (c === 0) break;
      out += String.fromCharCode(c);
    }
    return out;
  }

  function extractDateFromTiff(view, tiffStart) {
    if (tiffStart + 8 > view.byteLength) return null;
    const byteOrder = view.getUint16(tiffStart, false);
    const little = byteOrder === 0x4949;
    if (!little && byteOrder !== 0x4d4d) return null;
    if (view.getUint16(tiffStart + 2, little) !== 0x002a) return null;
    const ifd0Offset = view.getUint32(tiffStart + 4, little);

    const readIfd = (offset, targetTags) => {
      const pos = tiffStart + offset;
      if (pos + 2 > view.byteLength) return {};
      const entries = view.getUint16(pos, little);
      const found = {};
      for (let i = 0; i < entries; i++) {
        const ePos = pos + 2 + i * 12;
        if (ePos + 12 > view.byteLength) break;
        const tag = view.getUint16(ePos, little);
        if (!targetTags.includes(tag)) continue;
        const type = view.getUint16(ePos + 2, little);
        const count = view.getUint32(ePos + 4, little);
        if (type === 2 && count >= 10) {
          const valOff = count <= 4 ? ePos + 8 : tiffStart + view.getUint32(ePos + 8, little);
          found[tag] = readAscii(view, valOff, Math.min(count, 32));
        } else if (type === 4 && count === 1) {
          found[tag] = view.getUint32(ePos + 8, little);
        }
      }
      return found;
    };

    const ifd0 = readIfd(ifd0Offset, [0x0132, 0x8769]);
    if (typeof ifd0[0x8769] === 'number') {
      const exif = readIfd(ifd0[0x8769], [0x9003, 0x9004]);
      const dOrig = parseExifDateString(exif[0x9003] || '');
      if (dOrig) return dOrig;
      const dDig = parseExifDateString(exif[0x9004] || '');
      if (dDig) return dDig;
    }
    return parseExifDateString(ifd0[0x0132] || '');
  }

  async function extractExifDate(file) {
    try {
      const buf = await file.slice(0, 131072).arrayBuffer();
      const view = new DataView(buf);
      if (view.byteLength < 12) return null;

      // JPEG: SOI 0xFFD8
      if (view.getUint16(0, false) === 0xffd8) {
        let off = 2;
        while (off + 4 < view.byteLength) {
          if (view.getUint8(off) !== 0xff) break;
          const marker = view.getUint8(off + 1);
          if (marker === 0xda || marker === 0xd9) break;
          const size = view.getUint16(off + 2, false);
          if (size < 2) break;
          if (marker === 0xe1 && readAscii(view, off + 4, 4) === 'Exif') {
            return extractDateFromTiff(view, off + 10);
          }
          off += 2 + size;
        }
      }

      // WebP: RIFF....WEBP with EXIF chunk
      if (readAscii(view, 0, 4) === 'RIFF' && readAscii(view, 8, 4) === 'WEBP') {
        let off = 12;
        while (off + 8 < view.byteLength) {
          const chunkId = readAscii(view, off, 4);
          const chunkSize = view.getUint32(off + 4, true);
          if (chunkId === 'EXIF') {
            const payloadStart = off + 8;
            const hasHeader = readAscii(view, payloadStart, 4) === 'Exif';
            return extractDateFromTiff(view, hasHeader ? payloadStart + 6 : payloadStart);
          }
          off += 8 + chunkSize + (chunkSize % 2);
        }
      }
    } catch {}
    return null;
  }

  function extractDateFromFilename(name) {
    const m = (name || '').match(/(?:^|[^0-9])(20[1-3]\d)[-_]?([01]\d)[-_]?([0-3]\d)(?:[^0-9]|$)/);
    if (!m) return null;
    const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    return isValidYmd(y, mo, d) ? toIsoYmd(y, mo, d) : null;
  }

  function formatBerlinIsoDate(ms) {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Berlin',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      })
        .formatToParts(new Date(ms))
        .map(p => [p.type, p.value])
    );
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  async function detectFileCreationDate(file) {
    const exifDate = await extractExifDate(file);
    if (exifDate) return { date: exifDate, source: 'EXIF' };
    const nameDate = extractDateFromFilename(file.name);
    if (nameDate) return { date: nameDate, source: 'Dateiname' };
    if (file.lastModified) {
      return { date: formatBerlinIsoDate(file.lastModified), source: 'Dateidatum' };
    }
    return { date: formatBerlinIsoDate(Date.now()), source: 'Heute' };
  }

  async function compressImageToWebP(file, maxEdge, quality) {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    let dataUrl = canvas.toDataURL('image/webp', quality);
    if (!dataUrl.startsWith('data:image/webp')) {
      dataUrl = canvas.toDataURL('image/jpeg', quality);
    }
    return { dataUrl, width, height };
  }

  async function uploadFilesToDay(files, targetDay) {
    const imageFiles = [...files].filter(f => f.type.startsWith('image/'));
    if (!imageFiles.length) {
      setStatus('Bitte Bilddateien (JPG, PNG oder WebP) auswählen oder hineinziehen.');
      return;
    }
    const isAuto = targetDay === 'auto';
    const dayCounts = new Map();
    let uploaded = 0;

    for (const file of imageFiles) {
      let resolvedDay = targetDay;
      let sourceNote = '';
      if (isAuto) {
        const detected = await detectFileCreationDate(file);
        resolvedDay = detected.date;
        sourceNote = ` (${detected.source})`;
      }
      const dayLabel = resolvedDay ? formatShortDate(resolvedDay) : 'Ohne Datum';
      setStatus(`Optimiere & lade hoch (${uploaded + 1}/${imageFiles.length}) → ${dayLabel}${sourceNote} …`);
      const full = await compressImageToWebP(file, 1400, 0.82);
      const thumb = await compressImageToWebP(file, 520, 0.76);
      const cleanName = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
      const res = await api('cms', 'upload', {
        dataUrl: full.dataUrl,
        thumbDataUrl: thumb.dataUrl,
        width: full.width,
        height: full.height,
        caption: cleanName || 'Kassel United · Sonntagslauf',
        day: resolvedDay
      });
      cmsData = res;
      dayCounts.set(dayLabel, (dayCounts.get(dayLabel) || 0) + 1);
      uploaded++;
      renderAll();
    }

    const summary = [...dayCounts.entries()].map(([lbl, n]) => (dayCounts.size > 1 ? `${lbl} (${n}×)` : lbl)).join(', ');
    setStatus(
      isAuto
        ? `${uploaded} ${uploaded === 1 ? 'Bild' : 'Bilder'} automatisch nach Erstelldatum eingeordnet: ${summary} · Live auf /galerie.`
        : `${uploaded} ${uploaded === 1 ? 'Bild' : 'Bilder'} gespeichert unter ${summary} · Live auf /galerie.`
    );
  }

  async function assignIdsToDay(ids, targetDay) {
    const res = await api('cms', 'assign-day', { ids, day: targetDay });
    cmsData = res;
    selectedIds.clear();
    const label = targetDay ? formatShortDate(targetDay) : 'Ohne Datum';
    setStatus(`${ids.length} ${ids.length === 1 ? 'Medium' : 'Medien'} → ${label} verschoben · Live gespeichert.`);
    renderAll();
  }

  function wireDropTarget(zoneEl, targetDay) {
    zoneEl.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = e.dataTransfer.types.includes('Files') ? 'copy' : 'move';
      zoneEl.classList.add('is-dragover');
    });
    zoneEl.addEventListener('dragleave', e => {
      if (!zoneEl.contains(e.relatedTarget)) zoneEl.classList.remove('is-dragover');
    });
    zoneEl.addEventListener('drop', async e => {
      e.preventDefault();
      zoneEl.classList.remove('is-dragover');
      if (e.dataTransfer.files?.length) {
        await runAction(null, () => uploadFilesToDay(e.dataTransfer.files, targetDay));
        return;
      }
      let ids = [...draggedIds];
      if (!ids.length) {
        try {
          const parsed = JSON.parse(e.dataTransfer.getData('application/x-ku-media') || '[]');
          if (Array.isArray(parsed)) ids = parsed;
        } catch {}
      }
      draggedIds = [];
      if (!ids.length) return;
      await runAction(null, () => assignIdsToDay(ids, targetDay));
    });
  }

  function renderDaysSidebar() {
    const list = el('cms-days-list');
    list.replaceChildren();

    // Update upload select target (defaults to auto creation-date detection)
    const uploadSel = el('upload-day-select');
    buildDaySelectOptions(uploadSel, uploadDayMode, true, false, true);

    // 1. "All Days" filter row
    const allBox = document.createElement('div');
    allBox.className = 'day-dropzone' + (cmsFilter === 'all' ? ' is-active' : '');
    const allRow = document.createElement('div');
    allRow.className = 'day-dz-row';
    const allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.className = 'day-dz-btn';
    allBtn.innerHTML = '';
    const allDate = document.createElement('span');
    allDate.className = 'day-dz-date';
    allDate.textContent = 'Alle Tage';
    const allSub = document.createElement('span');
    allSub.className = 'day-dz-title';
    allSub.textContent = 'Gesamte Mediathek anzeigen';
    allBtn.append(allDate, allSub);
    allBtn.onclick = () => {
      cmsFilter = 'all';
      renderCms();
    };
    const allCount = document.createElement('span');
    allCount.className = 'day-dz-count';
    allCount.textContent = String(dayCount('all'));
    allRow.append(allBtn, allCount);
    allBox.append(allRow);
    list.append(allBox);

    // 2. Individual Event Day Drop-Zones
    for (const day of cmsData.days) {
      const box = document.createElement('div');
      box.className = 'day-dropzone' + (cmsFilter === day.date ? ' is-active' : '');
      box.dataset.dayTarget = day.date;

      const row = document.createElement('div');
      row.className = 'day-dz-row';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'day-dz-btn';
      const dateSpan = document.createElement('span');
      dateSpan.className = 'day-dz-date';
      dateSpan.textContent = formatDateWithWeekday(day.date);
      btn.append(dateSpan);
      if (day.title) {
        const titleSpan = document.createElement('span');
        titleSpan.className = 'day-dz-title';
        titleSpan.textContent = day.title;
        btn.append(titleSpan);
      }
      btn.onclick = () => {
        cmsFilter = day.date;
        renderCms();
      };

      const meta = document.createElement('div');
      meta.className = 'day-dz-meta';
      const cnt = document.createElement('span');
      cnt.className = 'day-dz-count';
      cnt.textContent = String(dayCount(day.date));

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'icon-mini';
      editBtn.title = 'Datum / Titel bearbeiten';
      editBtn.setAttribute('aria-label', `${formatShortDate(day.date)} bearbeiten`);
      editBtn.textContent = '✎';
      editBtn.onclick = () => {
        editingDayDate = editingDayDate === day.date ? null : day.date;
        renderDaysSidebar();
      };

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'icon-mini danger';
      delBtn.title = 'Tag entfernen';
      delBtn.setAttribute('aria-label', `${formatShortDate(day.date)} entfernen`);
      delBtn.textContent = '✕';
      delBtn.onclick = () => {
        const n = dayCount(day.date);
        const msg = n
          ? `Tag ${formatShortDate(day.date)} entfernen? Die ${n} zugeordneten Medien bleiben erhalten und landen unter „Ohne Datum“.`
          : `Tag ${formatShortDate(day.date)} entfernen?`;
        if (!confirm(msg)) return;
        runAction(delBtn, async () => {
          cmsData = await api('cms', 'delete-day', { date: day.date });
          if (cmsFilter === day.date) cmsFilter = 'all';
        }, `Tag ${formatShortDate(day.date)} entfernt.`);
      };

      meta.append(cnt, editBtn, delBtn);
      row.append(btn, meta);

      const hint = document.createElement('div');
      hint.className = 'day-dz-hint';
      hint.textContent = `Loslassen → ${formatShortDate(day.date)} zuweisen`;

      box.append(row, hint);

      if (editingDayDate === day.date) {
        const form = document.createElement('form');
        form.className = 'day-edit-form';
        const dIn = document.createElement('input');
        dIn.type = 'date';
        dIn.value = day.date;
        dIn.required = true;
        const tIn = document.createElement('input');
        tIn.type = 'text';
        tIn.value = day.title || '';
        tIn.maxLength = 90;
        tIn.placeholder = 'Optionaler Titel';
        const acts = document.createElement('div');
        acts.className = 'day-edit-actions';
        const save = document.createElement('button');
        save.type = 'submit';
        save.className = 'pill-btn primary sm';
        save.textContent = 'Speichern';
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'pill-btn ghost sm';
        cancel.textContent = 'Abbrechen';
        cancel.onclick = () => {
          editingDayDate = null;
          renderDaysSidebar();
        };
        acts.append(save, cancel);
        form.append(dIn, tIn, acts);
        form.onsubmit = e => {
          e.preventDefault();
          runAction(save, async () => {
            cmsData = await api('cms', 'update-day', {
              oldDate: day.date,
              date: dIn.value,
              title: tIn.value
            });
            if (cmsFilter === day.date) cmsFilter = dIn.value;
            editingDayDate = null;
          }, 'Tag aktualisiert · Live gespeichert.');
        };
        box.append(form);
      }

      wireDropTarget(box, day.date);
      list.append(box);
    }

    // 3. Unassigned / Draft Drop-Zone
    const unBox = document.createElement('div');
    unBox.className = 'day-dropzone' + (cmsFilter === 'unassigned' ? ' is-active' : '');
    unBox.dataset.dayTarget = '';
    const unRow = document.createElement('div');
    unRow.className = 'day-dz-row';
    const unBtn = document.createElement('button');
    unBtn.type = 'button';
    unBtn.className = 'day-dz-btn';
    const unDate = document.createElement('span');
    unDate.className = 'day-dz-date';
    unDate.textContent = 'Ohne Datum (Entwurf)';
    const unSub = document.createElement('span');
    unSub.className = 'day-dz-title';
    unSub.textContent = 'Nicht öffentlich sichtbar';
    unBtn.append(unDate, unSub);
    unBtn.onclick = () => {
      cmsFilter = 'unassigned';
      renderCms();
    };
    const unCount = document.createElement('span');
    unCount.className = 'day-dz-count';
    unCount.textContent = String(dayCount('unassigned'));
    unRow.append(unBtn, unCount);
    const unHint = document.createElement('div');
    unHint.className = 'day-dz-hint';
    unHint.textContent = 'Loslassen → aus öffentlicher Galerie parken';
    unBox.append(unRow, unHint);
    wireDropTarget(unBox, '');
    list.append(unBox);
  }

  function renderMediaGrid() {
    const grid = el('cms-media-grid');
    grid.replaceChildren();
    const query = el('cms-search').value.trim().toLowerCase();

    const items = cmsData.media.filter(item => {
      if (cmsFilter === 'unassigned' && item.day) return false;
      if (cmsFilter !== 'all' && cmsFilter !== 'unassigned' && item.day !== cmsFilter) return false;
      if (query && !(item.caption || '').toLowerCase().includes(query) && !(item.day || '').includes(query)) {
        return false;
      }
      return true;
    });

    if (cmsFilter === 'all') {
      el('cms-active-label').textContent = `Alle Medien (${items.length})`;
    } else if (cmsFilter === 'unassigned') {
      el('cms-active-label').textContent = `Ohne Datum (${items.length})`;
    } else {
      const dayObj = cmsData.days.find(d => d.date === cmsFilter);
      el('cms-active-label').textContent = `${formatDateWithWeekday(cmsFilter)}${dayObj?.title ? ' · ' + dayObj.title : ''} (${items.length})`;
    }

    el('cms-clear-sel').hidden = selectedIds.size === 0;
    el('cms-selection-hint').textContent = selectedIds.size
      ? `${selectedIds.size} ausgewählt – ziehe eine ausgewählte Karte nach rechts auf ein Datum`
      : 'Karten nach rechts auf ein Datum ziehen (oder per Auswahlmenü zuordnen)';

    el('cms-media-empty').hidden = items.length > 0;

    for (const item of items) {
      const card = document.createElement('article');
      card.className = 'cms-card' + (selectedIds.has(item.id) ? ' is-selected' : '');
      card.draggable = true;
      card.dataset.mediaId = item.id;

      card.addEventListener('dragstart', e => {
        draggedIds = selectedIds.has(item.id) ? [...selectedIds] : [item.id];
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('application/x-ku-media', JSON.stringify(draggedIds));
        e.dataTransfer.setData('text/plain', draggedIds.join(','));
        card.classList.add('is-dragging');
      });

      card.addEventListener('dragend', () => {
        card.classList.remove('is-dragging');
        draggedIds = [];
        document.querySelectorAll('.is-dragover').forEach(z => z.classList.remove('is-dragover'));
      });

      const thumbWrap = document.createElement('div');
      thumbWrap.className = 'cms-thumb';

      const selLabel = document.createElement('label');
      selLabel.className = 'cms-card-select';
      selLabel.title = 'Für Mehrfach-Drag auswählen';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = selectedIds.has(item.id);
      cb.onchange = () => {
        if (cb.checked) selectedIds.add(item.id);
        else selectedIds.delete(item.id);
        card.classList.toggle('is-selected', cb.checked);
        el('cms-clear-sel').hidden = selectedIds.size === 0;
        el('cms-selection-hint').textContent = selectedIds.size
          ? `${selectedIds.size} ausgewählt – ziehe eine ausgewählte Karte nach rechts auf ein Datum`
          : 'Karten nach rechts auf ein Datum ziehen (oder per Auswahlmenü zuordnen)';
      };
      selLabel.append(cb);

      const handle = document.createElement('span');
      handle.className = 'cms-drag-badge';
      handle.textContent = '⋮⋮ Ziehen';

      const typePill = document.createElement('span');
      typePill.className = 'cms-type-pill';
      typePill.textContent = item.type === 'video' ? 'VIDEO' : 'FOTO';

      const img = document.createElement('img');
      img.src = item.type === 'video' ? item.poster || '' : item.thumb || item.src;
      img.alt = item.caption || '';
      img.loading = 'lazy';
      img.decoding = 'async';

      thumbWrap.append(img, selLabel, handle, typePill);

      const body = document.createElement('div');
      body.className = 'cms-card-body';

      const capInput = document.createElement('input');
      capInput.type = 'text';
      capInput.className = 'cms-caption-input';
      capInput.value = item.caption || '';
      capInput.maxLength = 160;
      capInput.placeholder = 'Beschreibung…';
      capInput.setAttribute('aria-label', 'Beschreibung bearbeiten');
      capInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') capInput.blur();
      });
      capInput.addEventListener('change', () => {
        const nextVal = capInput.value.trim();
        if (nextVal === (item.caption || '')) return;
        runAction(null, async () => {
          cmsData = await api('cms', 'update-media', { id: item.id, caption: nextVal });
        }, 'Beschreibung gespeichert.');
      });

      const footer = document.createElement('div');
      footer.className = 'cms-card-footer';

      const daySelect = document.createElement('select');
      daySelect.className = 'cms-day-select';
      daySelect.setAttribute('aria-label', 'Lauftag zuweisen');
      buildDaySelectOptions(daySelect, item.day, true, true);
      daySelect.onchange = () => {
        runAction(null, () => assignIdsToDay([item.id], daySelect.value));
      };

      const upBtn = document.createElement('button');
      upBtn.type = 'button';
      upBtn.className = 'icon-mini';
      upBtn.title = 'Nach vorne verschieben';
      upBtn.setAttribute('aria-label', 'Nach vorne');
      upBtn.textContent = '←';
      upBtn.onclick = () => {
        runAction(upBtn, async () => {
          cmsData = await api('cms', 'update-media', { id: item.id, move: 'up' });
        });
      };

      const downBtn = document.createElement('button');
      downBtn.type = 'button';
      downBtn.className = 'icon-mini';
      downBtn.title = 'Nach hinten verschieben';
      downBtn.setAttribute('aria-label', 'Nach hinten');
      downBtn.textContent = '→';
      downBtn.onclick = () => {
        runAction(downBtn, async () => {
          cmsData = await api('cms', 'update-media', { id: item.id, move: 'down' });
        });
      };

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'icon-mini danger';
      delBtn.title = 'Medium entfernen';
      delBtn.setAttribute('aria-label', 'Medium entfernen');
      delBtn.textContent = '✕';
      delBtn.onclick = () => {
        if (!confirm(`„${item.caption || 'Dieses Medium'}“ dauerhaft aus der Galerie entfernen?`)) return;
        runAction(delBtn, async () => {
          cmsData = await api('cms', 'delete-media', { id: item.id });
          selectedIds.delete(item.id);
        }, 'Medium entfernt.');
      };

      footer.append(daySelect, upBtn, downBtn, delBtn);
      body.append(capInput, footer);
      card.append(thumbWrap, body);
      grid.append(card);
    }
  }

  function renderDrivePanel() {
    const list = el('drive-folders-list');
    const meta = el('drive-sync-meta');
    if (!list || !meta) return;

    if (cmsData.lastDriveSync?.at) {
      const when = new Date(cmsData.lastDriveSync.at).toLocaleString('de-DE');
      meta.textContent = `Letzter Sync: ${when} · ${cmsData.lastDriveSync.scanned || 0} geprüft, ${cmsData.lastDriveSync.added || 0} neu.`;
    } else {
      meta.textContent = 'Läuft täglich automatisch (18:00 Uhr) und jederzeit per Klick.';
    }

    list.replaceChildren();
    for (const f of cmsData.driveFolders || []) {
      const row = document.createElement('div');
      row.className = 'drive-folder-row';

      const link = document.createElement('a');
      link.className = 'drive-folder-link';
      link.href = `https://drive.google.com/drive/folders/${encodeURIComponent(f.id)}`;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = `${f.name} ↗`;

      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'icon-mini danger';
      rm.title = 'Ordner trennen';
      rm.setAttribute('aria-label', `${f.name} trennen`);
      rm.textContent = '✕';
      rm.onclick = () => {
        if (!confirm(`Ordner „${f.name}“ aus der automatischen Synchronisierung entfernen?`)) return;
        runAction(rm, async () => {
          cmsData = await api('cms', 'remove-drive-folder', { id: f.id });
        }, `Ordner „${f.name}“ entfernt.`);
      };

      row.append(link, rm);
      list.append(row);
    }
  }

  function renderCms() {
    renderDaysSidebar();
    renderMediaGrid();
    renderDrivePanel();
  }

  /* ==================== RUNS & FIGHT NIGHT ==================== */

  function renderRuns(runs, fights) {
    const runSel = el('run-selector');
    runSel.replaceChildren();
    for (const d of regData.availableRuns || [selectedRun]) {
      const opt = document.createElement('option');
      opt.value = d;
      opt.textContent = d === regData.activeRun ? `${formatShortDate(d)} (Aktiv)` : formatShortDate(d);
      runSel.append(opt);
    }
    runSel.value = selectedRun;

    el('run-count').textContent = String(runs.length);
    el('attended-count').textContent = String(runs.filter(r => r.attended).length);
    el('fight-count').textContent = String(fights.length);

    const draw = regData.draws?.[selectedRun] || regData.draw || null;
    el('draw').disabled = Boolean(draw) || !runs.some(r => r.attended);
    el('winner').textContent = draw
      ? `Gewonnen: ${draw.name} · aus ${draw.eligibleCount} Mitläufern · ${new Date(draw.drawnAt).toLocaleString('de-DE')}`
      : '';

    const tbody = el('run-rows');
    tbody.replaceChildren();
    const query = el('run-search').value.trim().toLowerCase();
    const filtered = runs.filter(r => JSON.stringify(r).toLowerCase().includes(query));
    el('run-empty').hidden = filtered.length > 0;

    for (const r of filtered) {
      const tr = document.createElement('tr');
      const cols = [
        r.name,
        [r.email, r.instagram ? '@' + r.instagram : ''].filter(Boolean).join(' / '),
        r.phone,
        r.whatsapp ? 'Ja' : 'Nein'
      ];
      cols.forEach(text => {
        const td = document.createElement('td');
        td.textContent = text;
        tr.append(td);
      });
      const tdAct = document.createElement('td');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pill-btn sm' + (r.attended ? ' primary' : ' ghost');
      btn.textContent = r.attended ? '✓ Bestätigt' : 'Teilnahme bestätigen';
      btn.disabled = Boolean(draw);
      btn.onclick = () =>
        runAction(btn, async () => {
          await api('registration', 'attendance', { id: r.id, attended: !r.attended, run: selectedRun });
          await refreshAll();
        });
      tdAct.append(btn);
      tr.append(tdAct);
      tbody.append(tr);
    }
  }

  function renderFighters(fights) {
    const tbody = el('fight-rows');
    tbody.replaceChildren();
    const query = el('fight-search').value.trim().toLowerCase();
    const filtered = fights.filter(r => JSON.stringify(r).toLowerCase().includes(query));
    el('fight-empty').hidden = filtered.length > 0;

    for (const r of filtered) {
      const tr = document.createElement('tr');
      const cols = [
        r.name,
        r.email,
        `${r.discipline} / ${r.weight} kg`,
        r.club || '—',
        r.experience + (r.message ? ' · ' + r.message : '')
      ];
      cols.forEach(text => {
        const td = document.createElement('td');
        td.textContent = text;
        td.style.whiteSpace = 'normal';
        td.style.minWidth = '130px';
        tr.append(td);
      });
      tbody.append(tr);
    }
  }

  /* ==================== EVENT WIRING ==================== */

  el('new-day-date').value = defaultSundayIso();

  el('login').onsubmit = e => {
    e.preventDefault();
    const f = e.currentTarget;
    runAction(f.querySelector('button'), async () => {
      await api('registration', 'login', Object.fromEntries(new FormData(f)));
      f.reset();
      await refreshAll();
    });
  };

  el('logout').onclick = () =>
    runAction(el('logout'), async () => {
      await api('registration', 'logout', {});
      showLogin();
    });

  el('refresh').onclick = () => runAction(el('refresh'), refreshAll, 'Daten aktualisiert.');

  el('tab-cms').onclick = () => setTab('cms');
  el('tab-runs').onclick = () => setTab('runs');
  el('tab-fighters').onclick = () => setTab('fighters');

  el('add-day-form').onsubmit = e => {
    e.preventDefault();
    const date = el('new-day-date').value;
    const title = el('new-day-title').value.trim();
    const btn = e.currentTarget.querySelector('button[type="submit"]');
    runAction(
      btn,
      async () => {
        cmsData = await api('cms', 'add-day', { date, title });
        el('new-day-title').value = '';
        cmsFilter = date;
      },
      `Tag ${formatShortDate(date)} angelegt · Ziehe jetzt Bilder rechts hinein.`
    );
  };

  el('upload-day-select').onchange = e => {
    uploadDayMode = e.target.value;
  };

  el('file-input').onchange = e => {
    const files = e.target.files;
    if (!files?.length) return;
    const targetDay = el('upload-day-select').value;
    runAction(null, () => uploadFilesToDay(files, targetDay)).finally(() => {
      e.target.value = '';
    });
  };

  const uploadZone = el('upload-dropzone');
  uploadZone.addEventListener('dragover', e => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    uploadZone.classList.add('is-dragover');
  });
  uploadZone.addEventListener('dragleave', e => {
    if (!uploadZone.contains(e.relatedTarget)) uploadZone.classList.remove('is-dragover');
  });
  uploadZone.addEventListener('drop', e => {
    if (!e.dataTransfer.files?.length) return;
    e.preventDefault();
    uploadZone.classList.remove('is-dragover');
    const targetDay = el('upload-day-select').value;
    runAction(null, () => uploadFilesToDay(e.dataTransfer.files, targetDay));
  });

  el('add-url-form').onsubmit = e => {
    e.preventDefault();
    const f = e.currentTarget;
    const fd = Object.fromEntries(new FormData(f));
    const rawTarget = el('upload-day-select').value;
    const targetDay =
      rawTarget === 'auto'
        ? extractDateFromFilename(fd.src) || cmsData.days[0]?.date || ''
        : rawTarget;
    const btn = f.querySelector('button[type="submit"]');
    runAction(
      btn,
      async () => {
        cmsData = await api('cms', 'add-url', {
          type: fd.type,
          src: fd.src,
          poster: fd.poster,
          thumb: fd.poster,
          caption: fd.caption,
          day: targetDay
        });
        f.reset();
      },
      'Medium verknüpft · Live gespeichert.'
    );
  };

  el('cms-search').oninput = () => {
    if (cmsData) renderMediaGrid();
  };

  el('cms-select-all').onclick = () => {
    document.querySelectorAll('#cms-media-grid .cms-card').forEach(c => {
      if (c.dataset.mediaId) selectedIds.add(c.dataset.mediaId);
    });
    renderMediaGrid();
  };

  el('cms-clear-sel').onclick = () => {
    selectedIds.clear();
    renderMediaGrid();
  };

  el('run-selector').onchange = e => {
    selectedRun = e.target.value;
    runAction(null, refreshAll);
  };

  el('banner-form').onsubmit = e => {
    e.preventDefault();
    const btn = e.currentTarget.querySelector('button[type="submit"]');
    runAction(
      btn,
      async () => {
        cmsData = await api('cms', 'save-banner', {
          title: el('banner-title').value,
          specialNote: el('banner-special').value,
          description: el('banner-desc').value,
          raffleNote: el('banner-raffle').value,
          registrationOpen: el('banner-open').checked
        });
        hydrateBannerForm();
      },
      'Anmeldeformular aktualisiert · Änderungen sind live auf der Startseite.'
    );
  };

  el('draw').onclick = () => {
    if (!confirm(`Jetzt verbindlich für den ${formatShortDate(selectedRun)} aus allen bestätigten Mitläufern ziehen?`)) {
      return;
    }
    runAction(el('draw'), async () => {
      await api('registration', 'draw', { run: selectedRun });
      await refreshAll();
    }, 'Gewinner ausgelost und gespeichert.');
  };

  el('run-search').oninput = () => {
    if (regData) renderAll();
  };

  el('fight-search').oninput = () => {
    if (regData) renderAll();
  };

  el('sync-drive-btn')?.addEventListener('click', () => {
    const btn = el('sync-drive-btn');
    runAction(btn, async () => {
      setStatus('Synchronisiere Google-Drive-Ordner …');
      const res = await api('cms', 'sync-drive', {});
      cmsData = res;
      setStatus(
        res.added > 0
          ? `Google Drive Sync fertig: ${res.added} neue ${res.added === 1 ? 'Datei' : 'Dateien'} importiert & nach Datum sortiert · Live auf /galerie.`
          : `Google Drive Sync fertig: Alle ${res.scanned} Dateien sind bereits auf dem neuesten Stand.`
      );
    });
  });

  el('add-drive-folder-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const f = e.currentTarget;
    const fd = Object.fromEntries(new FormData(f));
    const btn = f.querySelector('button[type="submit"]');
    runAction(
      btn,
      async () => {
        cmsData = await api('cms', 'add-drive-folder', { name: fd.name, folder: fd.folder });
        f.reset();
      },
      'Google-Drive-Ordner verknüpft · Klicke auf „Jetzt synchronisieren ↻“.'
    );
  });

  setTab('cms');
  refreshAll().catch(e => {
    if (!String(e.message || '').includes('Bitte anmelden')) setStatus(e.message);
  });
})();
