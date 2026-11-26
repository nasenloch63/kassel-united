(() => {
  function getUpcomingSundayIso() {
    try {
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
      const map = Object.fromEntries(fmt.formatToParts(new Date()).map(p => [p.type, p.value]));
      const wd = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[map.weekday] ?? 0;
      const h = Number(map.hour === '24' ? '0' : map.hour);
      const min = Number(map.minute);
      let add = (7 - wd) % 7;
      if (add === 0 && (h > 14 || (h === 14 && min >= 45))) add = 7;
      const d = new Date(Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day) + add));
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    } catch {
      return '';
    }
  }

  function formatDeDate(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return '';
    const [y, m, d] = iso.split('-');
    return `${d}.${m}.${y}`;
  }

  const runCard = document.getElementById('lauf-anmeldung');
  if (runCard) {
    const titleEl = document.getElementById('run-title');
    const metaEl = document.getElementById('run-meta');
    const descEl = document.getElementById('run-desc');
    const raffleEl = document.getElementById('run-raffle-note');
    const runForm = runCard.querySelector('form[data-registration="run"]');
    const runBtn = runForm?.querySelector('button[type="submit"]');
    const runFeedback = runForm?.querySelector('[role="status"]');

    const applyRunBanner = (isoDate, banner) => {
      const dateStr = formatDeDate(isoDate);
      const parts = [
        dateStr ? `So., ${dateStr}` : 'Jeden Sonntag',
        '14:30 Uhr treffen',
        '14:45 Uhr Programmstart',
        'Schloss Orangerie'
      ];
      if (banner?.specialNote) parts.push(banner.specialNote);
      if (metaEl) metaEl.textContent = parts.join(' · ') + '.';
      if (titleEl && banner?.title) titleEl.textContent = banner.title;
      if (descEl && banner?.description) descEl.textContent = banner.description;
      if (raffleEl && banner?.raffleNote) raffleEl.textContent = banner.raffleNote;
      if (banner && banner.registrationOpen === false && runBtn) {
        runBtn.disabled = true;
        runBtn.textContent = 'Anmeldung aktuell pausiert';
        if (runFeedback) runFeedback.textContent = 'Die Anmeldung für diesen Sonntag ist aktuell pausiert.';
      }
    };

    applyRunBanner(getUpcomingSundayIso(), null);

    fetch('/api/cms?action=public', { headers: { Accept: 'application/json' } })
      .then(r => (r.ok ? r.json() : null))
      .then(payload => {
        if (payload?.runBanner) applyRunBanner(payload.activeRun || getUpcomingSundayIso(), payload.runBanner);
      })
      .catch(() => {});
  }

  document.querySelectorAll('[data-registration]').forEach(form => {
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const status = form.querySelector('[role=status]');
      const button = form.querySelector('[type=submit]');
      const body = Object.fromEntries(new FormData(form));
      body.kind = form.dataset.registration;
      body.privacy = form.elements.privacy.checked;
      body.whatsapp = form.elements.whatsapp?.checked || false;
      if (body.kind === 'run' && !body.email.trim() && !body.instagram.trim()) {
        status.textContent = 'Bitte E-Mail oder Instagram angeben.';
        form.elements.email.focus();
        return;
      }
      button.disabled = true;
      status.textContent = 'Anmeldung wird gespeichert …';
      try {
        const response = await fetch('/api/registration?action=register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const data = await response.json();
        if (!response.ok) throw Error(data.error);
        form.reset();
        const runDateStr = formatDeDate(data.run);
        status.textContent =
          body.kind === 'run'
            ? `Du bist angemeldet! Wir sehen uns am Sonntag${runDateStr ? ` (${runDateStr})` : ''} um 14:30 Uhr am Schloss Orangerie.`
            : 'Anmeldung gespeichert! Wir melden uns zur Abstimmung bei dir.';
      } catch (e) {
        status.textContent = e.message || 'Anmeldung fehlgeschlagen. Bitte erneut versuchen.';
      } finally {
        button.disabled = false;
      }
    });
  });
})();
