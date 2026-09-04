/* views/reminders.js — reminder scheduler with consent-gated voice notifications. */

views.reminders = {
  async render() {
    const el = h('div', {});
    el.appendChild(h('div', { class: 'between wrap' }, [
      h('h2', {}, '⏰ ' + t('reminders')),
      h('button', { class: 'btn sm', onclick: () => addReminderModal() }, '➕ ' + t('edit'))
    ]));

    const card = h('div', { class: 'card mt' }, [UI.skeleton(2)]);
    el.appendChild(card);
    await loadList(card);
    // Google Calendar events live alongside local reminders (when connected).
    const calCard = h('div', { class: 'card mt' }, [h('h3', {}, '📅 Calendar'), UI.skeleton(1)]);
    el.appendChild(calCard);
    await loadCalendar(calCard);
    // Surface OAuth result (?cal=connected|error) once, then clean the URL.
    try {
      const q = new URLSearchParams(window.location.hash.split('?')[1] || '');
      if (q.get('cal') === 'connected') UI.toast('Google Calendar connected.', 'good');
      else if (q.get('cal') === 'error') UI.toast('Google Calendar connect failed.', 'bad');
      if (q.get('cal')) window.location.hash = '#/reminders';
    } catch (e) { /* ignore */ }
    return el;
  }
};

async function loadCalendar(card) {
  try {
    const st = await API.get('/api/calendar/status').catch(() => ({ configured: false }));
    card.querySelectorAll('.skeleton').forEach((x) => x.remove());
    if (!st.configured) {
      card.appendChild(h('p', { class: 'small muted' }, 'Google Calendar not configured — voice scheduling keeps working via local reminders.'));
      card.appendChild(h('a', { class: 'small', href: '#/integrations' }, 'Setup steps on the Integrations page →'));
      return;
    }
    if (!st.connected) {
      card.appendChild(h('p', { class: 'small muted' }, 'Server is ready — connect your Google account to see meetings here.'));
      card.appendChild(h('button', { class: 'btn sm mt6', onclick: async () => {
        try { const r = await API.get('/api/calendar/auth-url'); if (r.url) window.location.href = r.url; }
        catch (e) { UI.toast('Could not start Google connect.', 'bad'); }
      } }, 'Connect Google Calendar'));
      return;
    }
    const ev = await API.get('/api/calendar/events?limit=5');
    if (!(ev.events || []).length) { card.appendChild(h('p', { class: 'small muted' }, 'No upcoming meetings.')); return; }
    ev.events.forEach((e) => card.appendChild(h('div', { class: 'list-item mt6' }, [
      h('span', { style: { fontSize: '1.3rem' } }, '📅'),
      h('div', { style: { flex: 1 } }, [
        h('div', { style: { fontWeight: 700 } }, e.title),
        h('div', { class: 'small muted' }, e.start)
      ])
    ])));
  } catch (e) {
    card.querySelectorAll('.skeleton').forEach((x) => x.remove());
    card.appendChild(h('p', { class: 'small muted' }, 'Could not load calendar.'));
  }
}

async function loadList(card) {
  try {
    const data = await API.get('/api/reminders');
    const list = data.reminders || [];
    card.querySelectorAll('.skeleton').forEach((x) => x.remove());
    if (!list.length) { card.appendChild(UI.empty('⏰', t('empty'))); return; }
    list.forEach((r) => {
      const item = h('div', { class: 'list-item' }, [
        h('span', { style: { fontSize: '1.4rem' } }, kindIcon(r.kind)),
        h('div', { style: { flex: 1 } }, [
          h('div', { style: { fontWeight: 700 } }, r.title),
          h('div', { class: 'small muted' }, (r.humanDue || new Date(r.due).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })) + ' · ' + (r.method === 'voice-call' ? '🎤 ' + t('tab_chat') : '🔔 in-app'))
        ]),
        UI.statusTag(r.status),
        h('button', { class: 'icon-btn sm', title: 'Ring now (voice)', onclick: () => ringNow(r), style: { fontSize: '1rem' } }, '🔔'),
        h('button', { class: 'icon-btn sm', title: 'Delete', onclick: () => delReminder(r, card), style: { fontSize: '1rem', color: 'var(--bad)' } }, '🗑️')
      ]);
      card.appendChild(item);
    });
  } catch (e) {
    card.querySelectorAll('.skeleton').forEach((x) => x.remove());
    card.appendChild(UI.empty('⏰', 'Could not load reminders.'));
  }
}

function kindIcon(k) { return { payment: '💳', todo: '✅', 'follow-up': '📞', deadline: '🗓️' }[k] || '⏰'; }

async function delReminder(r, card) {
  const ok = await UI.confirm('Delete "' + r.title + '"?');
  if (!ok) return;
  await API.del('/api/reminders/' + r.id);
  card.innerHTML = '';
  card.appendChild(UI.skeleton(2));
  await loadList(card);
  UI.toast('Reminder deleted.');
}

async function ringNow(r) {
  if (!consentOk('reminders')) {
    const granted = await askConsent('reminders', 'Permission for voice call notifications? (A simulated voice call will be triggered.)');
    if (!granted) { UI.toast('Voice reminders need consent.', 'warn'); return; }
  }
  try {
    const res = await API.post('/api/reminders/' + r.id + '/ring', { consent: true });
    UI.toast('🔔 Voice notification scheduled (mock call).', 'good');
  } catch (e) {
    UI.toast(e.message || 'Ring failed.', 'bad');
  }
}

async function addReminderModal() {
  const inp = (label, value, type = 'text') => h('div', { class: 'field' }, [h('label', {}, label), h('input', { type, value: value || '' })]);
  const titleI = inp('Title', '');
  const notesI = h('div', { class: 'field' }, [h('label', {}, 'Notes')]); notesI.appendChild(h('textarea', { value: '' }));
  const dateI = inp('Date & time (adjustable)', defaultDue(), 'datetime-local');
  const prioSel = h('div', { class: 'field' }, [h('label', {}, 'Priority'), h('select', {}, ['high', 'medium', 'low'].map((p) => h('option', { value: p, selected: p === 'medium' }, p)))]);
  const kindSel = h('div', { class: 'field' }, [h('label', {}, 'Type'), h('select', {}, ['payment', 'todo', 'deadline', 'follow-up'].map((k) => h('option', { value: k }, k)))]);
  const methodSel = h('div', { class: 'field' }, [h('label', {}, 'Notify via'), h('select', {}, [{ v: 'voice-call', l: 'Voice call (needs consent)' }, { v: 'in-app', l: 'In-app notification' }].map((o) => h('option', { value: o.v, selected: o.v === 'voice-call' }, o.l)))]);
  const remLangSel = h('div', { class: 'field' }, [h('label', {}, 'Reminder language'), h('select', {}, (App.config.languages || []).filter((l) => l.enabled !== false).map((l) => h('option', { value: l.code, selected: l.code === (App.session.user.preferredLang || 'hing') }, `${l.flag} ${l.nativeName}`)))]);

  const m = UI.modal(`<h3>➕ ${t('edit')} reminder</h3>`);
  const body = m.el.querySelector('.modal');
  [titleI, notesI, dateI, prioSel, kindSel, methodSel, remLangSel].forEach((f) => body.appendChild(f));
  const save = h('button', { class: 'btn block mt' }, t('save'));
  body.appendChild(save);
  const cancel = h('button', { class: 'btn ghost block mt6' }, t('cancel'));
  body.appendChild(cancel);

  save.addEventListener('click', async () => {
    const voice = methodSel.querySelector('select').value === 'voice-call';
    let consent = true;
    if (voice && !consentOk('reminders')) {
      const granted = await askConsent('reminders', 'Voice call for reminders?');
      if (!granted) { UI.toast('Consent needed for voice reminders.', 'warn'); return; }
      consent = true;
    }
    const rawDate = dateI.querySelector('input').value;
    const due = rawDate ? new Date(rawDate).toISOString() : new Date(Date.now() + 86400000).toISOString();
    const human = rawDate ? new Date(rawDate).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'tomorrow';
    const payload = {
      title: titleI.querySelector('input').value,
      notes: notesI.querySelector('textarea').value,
      due, humanDue: human,
      priority: prioSel.querySelector('select').value,
      kind: kindSel.querySelector('select').value,
      method: methodSel.querySelector('select').value,
      language: remLangSel.querySelector('select').value,
      consent
    };
    try {
      await API.post('/api/reminders', payload);
      m.close(); UI.toast('Reminder set.'); views.reminders.render();
    } catch (e) { UI.toast('Failed: ' + e.message, 'bad'); }
  });
  cancel.addEventListener('click', () => m.close());
}

function defaultDue() {
  const d = new Date(Date.now() + 86400000);
  d.setMinutes(0, 0, 0);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
