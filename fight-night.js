'use strict';

const form = document.getElementById('fighter-form');
const status = document.getElementById('form-status');
const fallback = document.getElementById('mail-fallback');
const mailText = document.getElementById('mail-text');

form.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const data = new FormData(form);
  const value = (key) => String(data.get(key) || '').trim();
  const body = [
    'Hallo Castle United,',
    '',
    'ich möchte mich für die Fight Night anmelden.',
    '',
    'Name: ' + value('name'),
    'E-Mail: ' + value('email'),
    'Disziplin: ' + value('discipline'),
    'Aktuelles Gewicht: ' + value('weight') + ' kg',
    'Gym / Verein: ' + (value('club') || 'Keine Angabe'),
    '',
    'Training und Kampferfahrung:',
    value('experience'),
    '',
    'Nachricht:',
    value('message') || 'Keine weitere Nachricht',
    '',
    'Bitte meldet euch zur Abstimmung der Teilnahme bei mir.'
  ].join('\n');
  mailText.value = body;
  fallback.hidden = false;
  status.textContent = 'Deine E-Mail ist vorbereitet. Bitte sende sie in deinem Mailprogramm ab.';
  const subject = 'Kämpferanmeldung – Castle United Fight Night – ' + value('discipline');
  window.location.href = 'mailto:info@naser-solutions.de?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
});

document.getElementById('copy-mail').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(mailText.value);
    status.textContent = 'Anmeldung kopiert. Füge sie in eine E-Mail an info@naser-solutions.de ein.';
  } catch {
    mailText.focus();
    mailText.select();
    status.textContent = 'Bitte kopiere den markierten Text und sende ihn an info@naser-solutions.de.';
  }
});
