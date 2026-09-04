/* views/integrations.js — "Give Your MCP a Voice" dashboard.
 *
 * One page for every external integration: Agora Conversational AI (core voice
 * engine), Google Calendar (scheduling), Email via Resend, and Stripe
 * read-only payments demo. Each card shows honest live status; unconfigured
 * providers show setup steps instead of fake data. No secrets ever render. */

views.integrations = {
  async render() {
    const el = h('div', {});
    el.appendChild(h('h2', {}, '🔗 ' + t('nav_dk_integrations')));
    el.appendChild(h('p', { class: 'small muted' }, 'Give Your MCP a Voice — Techo is a voice-first business assistant that grows new skills over time. Say "add a meeting tomorrow at 5 PM" or "send an email to my supplier".'));

    let st = null;
    try { st = await API.get('/api/integrations/status'); }
    catch (e) { el.appendChild(UI.empty('🔗', 'Could not load integration status. Try again.')); return el; }
    const ig = (st && st.integrations) || {};

    el.appendChild(agoraCard(ig.agora || {}));
    el.appendChild(await calendarCard(ig.calendar || {}));
    el.appendChild(await emailCard(ig.email || {}));
    el.appendChild(await paymentsCard(ig.payments || {}));
    el.appendChild(futureCard());
    return el;
  }
};

function statusPill(cfg) {
  const on = cfg.connected || cfg.configured;
  return h('span', { class: 'tag ' + (on ? 'good' : 'neutral') }, on ? (cfg.mode === 'production' ? 'Live' : cfg.demo ? 'Demo' : 'Connected') : 'Not configured');
}

function setupList(steps) {
  const box = h('div', { class: 'small muted mt6' });
  box.appendChild(h('div', { style: { fontWeight: 700, marginBottom: 4 } }, 'Setup steps'));
  const ol = h('ol', { style: { margin: '4px 0 0 18px', padding: 0 } });
  (steps || []).forEach((s) => ol.appendChild(h('li', { style: { marginBottom: 4 } }, s)));
  box.appendChild(ol);
  return box;
}

function agoraCard(a) {
  const card = h('div', { class: 'card mt' }, [
    h('div', { class: 'between' }, [h('h3', {}, '🎙️ Agora Conversational AI — core voice engine'), statusPill(a)]),
    h('p', { class: 'small muted' }, a.connection === 'connected'
      ? 'Live voice sessions start from the Talk screen mic. Transcripts sync into the conversation.'
      : 'Voice runs on the browser path until Agora is connected. No fake "connected" states — ever.')
  ]);
  const row = h('div', { class: 'row mt6', style: { gap: 8, flexWrap: 'wrap' } }, [
    h('button', { class: 'btn sm', onclick: async () => {
      try {
        const r = await AgoraClient.startAgent();
        UI.toast('Agent session: ' + (r.mode || '?') + (r.session && r.session.agent_id ? ' (agent ' + r.session.agent_id.slice(0, 8) + '…)' : ''), r.ok ? 'good' : 'warn');
        try { await AgoraClient.endAgent({ consent: false, persist: false }); } catch (e) { /* ignore */ }
      } catch (e) { UI.toast('Agent start failed: ' + e.message, 'bad'); }
    } }, '▶ Test voice agent'),
    h('a', { class: 'btn sm ghost', href: '#/agora' }, 'Open Agora dashboard →')
  ]);
  card.appendChild(row);
  return card;
}

async function calendarCard(c) {
  const card = h('div', { class: 'card mt' }, [
    h('div', { class: 'between' }, [h('h3', {}, '📅 Google Calendar — Give Scheduling a Voice'), statusPill(c)])
  ]);
  if (!c.configured) {
    card.appendChild(h('p', { class: 'small muted' }, 'Voice scheduling still works — meetings are kept as local reminders until you connect.'));
    card.appendChild(setupList(c.setup));
    return card;
  }
  let info = null;
  try { info = await API.get('/api/calendar/status'); } catch (e) { /* ignore */ }
  if (info && info.connected) {
    card.appendChild(h('p', { class: 'small muted' }, 'Connected. Say "add a meeting tomorrow at 5 PM with my supplier" or "show my meetings this week".'));
    try {
      const ev = await API.get('/api/calendar/events?limit=5');
      if (ev.events && ev.events.length) {
        ev.events.forEach((e) => card.appendChild(h('div', { class: 'list-item mt6' }, [
          h('span', { style: { fontSize: '1.2rem' } }, '📅'),
          h('div', { style: { flex: 1 } }, [
            h('div', { style: { fontWeight: 700 } }, e.title),
            h('div', { class: 'small muted' }, e.start)
          ])
        ])));
      } else card.appendChild(h('p', { class: 'small muted' }, 'No upcoming events.'));
    } catch (e) { card.appendChild(h('p', { class: 'small muted' }, 'Could not load events.')); }
    card.appendChild(h('button', { class: 'btn sm ghost mt6', onclick: async () => { await API.post('/api/calendar/disconnect'); UI.toast('Calendar disconnected.'); views.integrations.render().then(() => {}); } }, 'Disconnect'));
  } else {
    card.appendChild(h('p', { class: 'small muted' }, 'Server is configured — connect your Google account to finish setup.'));
    card.appendChild(h('button', { class: 'btn sm mt6', onclick: async () => {
      try { const r = await API.get('/api/calendar/auth-url'); if (r.url) window.location.href = r.url; }
      catch (e) { UI.toast('Could not start Google connect.', 'bad'); }
    } }, 'Connect Google Calendar'));
  }
  return card;
}

async function emailCard(c) {
  const card = h('div', { class: 'card mt' }, [
    h('div', { class: 'between' }, [h('h3', {}, '📧 Email — Give Email a Voice (Resend)'), statusPill(c)])
  ]);
  if (!c.configured) { card.appendChild(setupList(c.setup)); return card; }
  card.appendChild(h('p', { class: 'small muted' }, 'Sending via ' + (c.from || 'Resend') + '. Say "send an email to supplier@example.com about delayed stock".'));
  const to = h('input', { type: 'email', placeholder: 'To (email address)', style: { flex: 1, minWidth: '160px' } });
  const subj = h('input', { type: 'text', placeholder: 'Subject', style: { flex: 2, minWidth: '160px' } });
  const body = h('textarea', { placeholder: 'Message…', rows: 2, style: { width: '100%', marginTop: 8 } });
  const consent = h('label', { class: 'small', style: { display: 'flex', gap: 6, alignItems: 'center', marginTop: 8 } }, [
    h('input', { type: 'checkbox' }), h('span', {}, 'I consent to sending this email')
  ]);
  const box = h('div', {});
  const send = h('button', { class: 'btn sm', style: { marginTop: 8 }, onclick: async () => {
    const ok = await API.post('/api/email/send', {
      to: to.value.trim(), subject: subj.value.trim(), text: body.value.trim(),
      consent: consent.querySelector('input').checked
    }).catch((e) => ({ ok: false, message: e.message }));
    UI.toast(ok.ok ? 'Email sent to ' + ok.email.to : ('Send failed: ' + (ok.message || ok.reason)), ok.ok ? 'good' : 'bad');
    if (ok.ok) { to.value = ''; subj.value = ''; body.value = ''; refreshSent(); }
  } }, 'Send email');
  async function refreshSent() {
    box.innerHTML = '';
    try {
      const r = await API.get('/api/email/sent?limit=5');
      (r.emails || []).forEach((e) => box.appendChild(h('div', { class: 'list-item mt6' }, [
        h('span', { style: { fontSize: '1.2rem' } }, '✉️'),
        h('div', { style: { flex: 1 } }, [
          h('div', { style: { fontWeight: 700 } }, e.subject),
          h('div', { class: 'small muted' }, e.to + ' · ' + new Date(e.at).toLocaleString())
        ])
      ])));
      if (!(r.emails || []).length) box.appendChild(h('p', { class: 'small muted' }, 'No sent emails yet.'));
    } catch (e) { box.appendChild(h('p', { class: 'small muted' }, 'Could not load sent emails.')); }
  }
  card.appendChild(h('div', { class: 'row', style: { gap: 8, flexWrap: 'wrap', marginTop: 8 } }, [to, subj]));
  card.appendChild(body);
  card.appendChild(consent);
  card.appendChild(send);
  card.appendChild(h('h3', { class: 'mt', style: { fontSize: '.95rem' } }, 'Sent'));
  card.appendChild(box);
  await refreshSent();
  return card;
}

async function paymentsCard(c) {
  const card = h('div', { class: 'card mt' }, [
    h('div', { class: 'between' }, [h('h3', {}, '💳 Payments — Give Payments a Voice (read-only demo)'), statusPill(c)])
  ]);
  try {
    const r = await API.get('/api/payments/overview?days=7');
    if (r.reason) { card.appendChild(h('p', { class: 'small muted' }, 'Payments summary unavailable right now.')); return card; }
    if (r.demo) card.appendChild(h('p', { class: 'small muted' }, r.note || 'Demo figures from your local Techo ledger.'));
    const grid = h('div', { class: 'grid3 mt' }, [
      statTile('Sales (7d)', '₹' + (r.sales || 0)),
      statTile('Expenses (7d)', '₹' + (r.expenses || 0)),
      statTile('Net (7d)', '₹' + (r.net != null ? r.net : ((r.sales || 0) - (r.expenses || 0))))
    ]);
    card.appendChild(grid);
    card.appendChild(h('p', { class: 'small muted mt6' }, 'Ask by voice: "what were my sales last week?"'));
  } catch (e) { card.appendChild(h('p', { class: 'small muted' }, 'Could not load payments overview.')); }
  return card;
}

function statTile(label, value) {
  return h('div', { class: 'stat' }, [h('div', { class: 'num' }, value), h('div', { class: 'lbl' }, label)]);
}

function futureCard() {
  const card = h('div', { class: 'card mt' }, [
    h('h3', {}, '🔮 Future MCPs'),
    h('p', { class: 'small muted' }, 'Planned voice skills — not built yet:')
  ]);
  const ul = h('ul', { class: 'small', style: { margin: '6px 0 0 18px', padding: 0 } });
  ['Linear — Give Projects a Voice', 'Notion — Give Knowledge a Voice', 'GitHub — Give Development a Voice', 'Vercel — Give Deployments a Voice', 'HubSpot — Give Sales a Voice', 'Zapier — Give Everything a Voice']
    .forEach((x) => ul.appendChild(h('li', {}, x)));
  card.appendChild(ul);
  return card;
}
