(() => {
  const MONTHS_DE = [
    'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
    'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'
  ];

  const dialog = document.getElementById('lightbox');
  const img = document.getElementById('viewer-image');
  const caption = document.getElementById('viewer-caption');
  const count = document.getElementById('viewer-count');
  const filtersEl = document.getElementById('day-filters');
  const daysEl = document.getElementById('gallery-days');
  const totalEl = document.getElementById('gallery-total');

  let activeFilter = new URLSearchParams(location.search).get('tag') || 'all';
  let current = 0;
  let opener = null;
  let visiblePhotos = [];

  function formatShortDate(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return iso || '';
    const [y, m, d] = iso.split('-');
    return `${d}.${m}.${y}`;
  }

  function formatLongDate(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return iso || '';
    const [y, m, d] = iso.split('-');
    return `${d}. ${MONTHS_DE[Number(m) - 1] || m} ${y}`;
  }

  function refreshPhotoList() {
    visiblePhotos = [...document.querySelectorAll('.gallery-day:not([hidden]) [data-photo]')];
  }

  function showPhoto(index) {
    refreshPhotoList();
    if (!visiblePhotos.length) return;
    current = (index + visiblePhotos.length) % visiblePhotos.length;
    const a = visiblePhotos[current];
    const thumb = a.querySelector('img');
    img.src = a.href;
    img.alt = thumb?.alt || '';
    caption.textContent = img.alt;
    count.textContent = `${current + 1} / ${visiblePhotos.length}`;
  }

  document.getElementById('viewer-close')?.addEventListener('click', () => dialog.close());
  document.getElementById('viewer-prev')?.addEventListener('click', () => showPhoto(current - 1));
  document.getElementById('viewer-next')?.addEventListener('click', () => showPhoto(current + 1));

  dialog?.addEventListener('close', () => {
    document.body.classList.remove('scroll-locked');
    if (opener) opener.focus();
  });

  dialog?.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      showPhoto(current - 1);
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      showPhoto(current + 1);
    }
  });

  function bindInteractiveMedia() {
    refreshPhotoList();
    document.querySelectorAll('[data-photo]').forEach(a => {
      if (a.dataset.bound === '1') return;
      a.dataset.bound = '1';
      a.addEventListener('click', e => {
        if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        refreshPhotoList();
        const idx = visiblePhotos.indexOf(a);
        if (idx === -1) return;
        opener = a;
        showPhoto(idx);
        dialog.showModal();
        document.body.classList.add('scroll-locked');
        document.getElementById('viewer-close')?.focus();
      });
    });

    const videos = [...document.querySelectorAll('.media-card video')];
    videos.forEach(video => {
      if (video.dataset.bound === '1') return;
      video.dataset.bound = '1';
      video.addEventListener('play', () => {
        document.querySelectorAll('.media-card video').forEach(other => {
          if (other !== video) other.pause();
        });
      });
      video.addEventListener('error', () => {
        if (video.parentElement.querySelector('.media-status')) return;
        const message = document.createElement('p');
        message.className = 'media-status';
        message.setAttribute('role', 'status');
        message.textContent = 'Das Video konnte nicht geladen werden. Versuche es über „Video separat öffnen“.';
        video.after(message);
      });
    });
  }

  function applyFilter(dayKey) {
    const sections = [...document.querySelectorAll('.gallery-day')];
    const hasMatch = dayKey === 'all' || sections.some(s => s.dataset.day === dayKey);
    activeFilter = hasMatch ? dayKey : 'all';

    filtersEl?.querySelectorAll('.day-pill').forEach(btn => {
      btn.setAttribute('aria-pressed', String(btn.dataset.filter === activeFilter));
    });

    sections.forEach(sec => {
      const show = activeFilter === 'all' || sec.dataset.day === activeFilter;
      sec.hidden = !show;
      if (!show) {
        sec.querySelectorAll('video').forEach(v => v.pause());
      }
    });

    refreshPhotoList();
  }

  function bindFilters() {
    filtersEl?.querySelectorAll('.day-pill').forEach(btn => {
      btn.addEventListener('click', () => applyFilter(btn.dataset.filter));
    });
  }

  function buildMediaCard(item) {
    const fig = document.createElement('figure');
    fig.className = `media-card ${item.type === 'video' ? 'is-video' : 'is-photo'}`;
    const label = item.caption || 'Kassel United Moment';

    if (item.type === 'video') {
      const video = document.createElement('video');
      video.controls = true;
      video.playsInline = true;
      video.preload = 'none';
      if (item.poster) video.poster = item.poster;
      video.width = item.width || 720;
      video.height = item.height || 1280;
      video.setAttribute('aria-label', `${label} – Video vom ${formatShortDate(item.day)}`);
      const source = document.createElement('source');
      source.src = item.src;
      source.type = 'video/mp4';
      video.append(source, document.createTextNode('Dein Browser unterstützt dieses Video nicht.'));

      const fallback = document.createElement('a');
      fallback.className = 'media-fallback';
      fallback.href = item.src;
      fallback.target = '_blank';
      fallback.rel = 'noopener noreferrer';
      fallback.textContent = 'Video separat öffnen ↗';
      fallback.setAttribute('aria-label', `${label}: Video separat öffnen (neuer Tab)`);

      const fc = document.createElement('figcaption');
      const s1 = document.createElement('span');
      s1.textContent = label;
      const s2 = document.createElement('span');
      s2.textContent = 'VIDEO';
      fc.append(s1, s2);
      fig.append(video, fallback, fc);
    } else {
      const a = document.createElement('a');
      a.href = item.src;
      a.setAttribute('data-photo', '');
      a.setAttribute('aria-label', `${label}: Foto vergrößern`);

      const image = document.createElement('img');
      image.src = item.thumb || item.src;
      image.width = item.width || 640;
      image.height = item.height || 853;
      image.loading = 'lazy';
      image.decoding = 'async';
      image.alt = label;

      const zoom = document.createElement('span');
      zoom.className = 'zoom';
      zoom.setAttribute('aria-hidden', 'true');
      zoom.textContent = '↗';

      a.append(image, zoom);
      const fc = document.createElement('figcaption');
      const s1 = document.createElement('span');
      s1.textContent = label;
      const s2 = document.createElement('span');
      s2.textContent = 'FOTO';
      fc.append(s1, s2);
      fig.append(a, fc);
    }
    return fig;
  }

  function renderFromCms(cms) {
    if (!daysEl || !filtersEl || !Array.isArray(cms?.media)) return;

    const grouped = new Map();
    const dayMeta = new Map();
    (cms.days || []).forEach(d => {
      if (d?.date) dayMeta.set(d.date, d.title || '');
    });

    cms.media.forEach(item => {
      if (!item?.day) return;
      if (!grouped.has(item.day)) grouped.set(item.day, []);
      grouped.get(item.day).push(item);
      if (!dayMeta.has(item.day)) dayMeta.set(item.day, '');
    });

    const sortedDates = [...grouped.keys()].sort((a, b) => b.localeCompare(a));
    const totalCount = sortedDates.reduce((sum, d) => sum + grouped.get(d).length, 0);

    if (totalEl) {
      totalEl.textContent = `${totalCount} ${totalCount === 1 ? 'Moment' : 'Momente'} · ${sortedDates.length} ${sortedDates.length === 1 ? 'Tag' : 'Tage'}`;
    }

    filtersEl.replaceChildren();
    const makePill = (key, label, num) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'day-pill';
      btn.dataset.filter = key;
      btn.setAttribute('aria-pressed', 'false');
      btn.append(document.createTextNode(label + ' '));
      const c = document.createElement('span');
      c.className = 'day-pill-count';
      c.textContent = String(num);
      btn.append(c);
      return btn;
    };

    filtersEl.append(makePill('all', 'Alle Tage', totalCount));
    sortedDates.forEach(date => {
      filtersEl.append(makePill(date, formatShortDate(date), grouped.get(date).length));
    });

    daysEl.replaceChildren();
    if (!sortedDates.length) {
      const empty = document.createElement('p');
      empty.className = 'gallery-empty';
      empty.textContent = 'Noch keine kategorisierten Momente vorhanden.';
      daysEl.append(empty);
      return;
    }

    sortedDates.forEach(date => {
      const items = grouped.get(date);
      const sec = document.createElement('section');
      sec.className = 'gallery-day';
      sec.dataset.day = date;
      sec.setAttribute('aria-labelledby', `day-${date}`);

      const head = document.createElement('div');
      head.className = 'day-head';

      const main = document.createElement('div');
      main.className = 'day-head-main';

      const h2 = document.createElement('h2');
      h2.id = `day-${date}`;
      h2.textContent = formatLongDate(date);
      main.append(h2);

      const title = dayMeta.get(date);
      if (title) {
        const tag = document.createElement('span');
        tag.className = 'day-tag';
        tag.textContent = title;
        main.append(tag);
      }

      const badge = document.createElement('span');
      badge.className = 'day-badge';
      badge.textContent = `${items.length} ${items.length === 1 ? 'Moment' : 'Momente'}`;

      head.append(main, badge);

      const grid = document.createElement('div');
      grid.className = 'day-grid';
      items.forEach(item => grid.append(buildMediaCard(item)));

      sec.append(head, grid);
      daysEl.append(sec);
    });

    bindFilters();
    bindInteractiveMedia();
    applyFilter(activeFilter);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      document.querySelectorAll('.media-card video').forEach(v => v.pause());
    }
  });

  bindFilters();
  bindInteractiveMedia();
  applyFilter(activeFilter);

  fetch('/api/cms?action=public', { headers: { Accept: 'application/json' } })
    .then(r => (r.ok ? r.json() : null))
    .then(cms => {
      if (cms && Array.isArray(cms.media)) renderFromCms(cms);
    })
    .catch(() => {});
})();
