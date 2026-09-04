/* views/agora.js — Agora Integration dashboard.
 *
 * Presents an honest, live view of the Agora Conversational AI integration:
 * connection status, environment, App ID, agent, language/voice config,
 * session/channel status, conversation/call/escalation counts, transcripts &
 * call logs, errors/warnings, a test-voice-agent control, and links to the
 * Agora Console / AI Studio / App Builder.
 *
 * States shown are always honest — Connected / Not configured / Auth failed /
 * Token expired / Agent unavailable / Mock mode / Production-ready — derived
 * from the backend /api/agora/status payload (which never forwards secrets).
 */

views.agora = {
  data: null,

  async render() {
    const el = h('div', {});
    el.appendChild(h('h2', {}, '🎛️ ' + t('nav_dk_agora')));

    try {
      views.agora.data = await API.get('/api/agora/status');
    } catch (e) {
      el.appendChild(UI.empty('⚠️', 'Could not load Agora status. Try again.'));
      return el;
    }

    const st = views.agora.data.status || {};
    const cfg = views.agora.configFromStatus ? views.agora.configFromStatus() : {};

    // Live config + RTE + health (fetched for the dashboard cards).
    let liveCfg = {}, health = null;
    try {
      liveCfg = (await API.get('/api/agora/configuration')).configuration || {};
    } catch (e) {}
    try { health = await API.get('/api/agora/health'); } catch (e) {}
    const rte = (st.rte) || [];

    // Connection banner
    el.appendChild(connectBanner(st));

    // Key facts grid
    el.appendChild(keyFacts(st, views.agora.data.agent));

    // Live config / RTE connectivity
    el.appendChild(configSection(liveCfg, health, rte));

    // Actions: test voice agent + open consoles
    el.appendChild(actions(st));

    // Analytics: calls / conversations / escalations / cases / reviews
    el.appendChild(analyticsSection(views.agora.data.analytics));

    // Recent activity
    el.appendChild(recentSection(views.agora.data.recent));

    // Error/warning log
    el.appendChild(warningsSection(views.agora.data.warnings));

    // Consent / privacy summary
    el.appendChild(consentSection(views.agora.data.consent));

    // Live agent test panel (live session controls)
    el.appendChild(liveAgentPanel(st, views.agora.data.agent));

    // Call logs / transcripts (from calls + conversations)
    el.appendChild(callLogs(views.agora.data.analytics, views.agora.data.recent));

    return el;
  }
};

views.agora.configFromStatus = function () {
  const st = (views.agora.data && views.agora.data.status) || {};
  const caps = (views.agora.data && views.agora.data.token) || {};
  return {
    connection: st.connection || 'not_configured',
    env: st.env || 'dev',
    mock: !!st.mocked,
    appId: st.appId || '',
    agentId: st.agentId || '',
    labels: st.labels || { connection: 'Not configured' },
    caps
  };
};

function connectBanner(st) {
  const cfg = views.agora.configFromStatus();
  const map = {
    connected: ['good', '✓ Connected'],
    mock: ['warn', 'Mock mode'],
    not_configured: ['neutral', 'Not configured'],
    auth_failed: ['danger', 'Auth failed'],
    token_unavailable: ['warn', 'Token unavailable'],
    timeout: ['warn', 'Token expired'],
    agent_unavailable: ['warn', 'Agent unavailable']
  };
  const [cls, txt] = map[cfg.connection] || ['neutral', cfg.connection];

  const banner = h('div', { class: 'card mt agora-connect' }, [
    h('div', { class: 'row', style: { alignItems: 'center', gap: 12 } }, [
      h('span', { class: `status-dot ${cls}` }),
      h('div', { style: { flex: 1 } }, [
        h('div', { style: { fontWeight: 800 } }, `Connection: ${txt}`),
        h('div', { class: 'small muted' },
          cfg.mock
            ? 'Running in mock mode — live voice-AI is disabled until Agora credentials are configured. Add AGORA_CUSTOMER_ID / AGORA_CUSTOMER_SECRET in the server `.env`.'
            : 'Agora Conversational AI is connected.')
      ]),
      h('button', { class: 'btn ghost sm', onclick: async (e) => {
        e.target.disabled = true;
        UI.toast('Refreshing…');
        try {
          views.agora.data = await API.get('/api/agora/status');
          views.agora.render();
        } finally { e.target.disabled = false; }
      } }, '↻ Refresh')
    ])
  ]);
  return banner;
}

function keyFacts(st, agent) {
  const cfg = views.agora.configFromStatus();
  const langLabel = (agent && agent.languages) ? agent.languages.join(', ') : '—';
  const facts = [
    ['Env', cfg.env.toUpperCase(), 'Environment (dev / staging / prod)'],
    ['App ID', st.appIdConfigured ? shortId(st.appId) : 'Not set', 'Agora App ID status'],
    ['Agent', st.agentConfigured ? (st.agentId || 'Configured') : 'Not set', 'Voice-AI agent (console.agora.io)'],
    ['Languages', langLabel, 'Voice agent supported languages'],
    ['Reply language', agent ? (agent.preferredResponseLanguage || 'auto') : 'auto', 'Preferred response language'],
    ['Voice', agent ? (agent.voiceProvider || 'agora') : 'agora', 'TTS provider']
  ];
  const card = h('div', { class: 'card mt' }, [h('h3', {}, 'Status')]);
  const grid = h('div', { class: 'agora-facts' });
  facts.forEach(([k, v, sub]) => {
    grid.appendChild(h('div', { class: 'fact' }, [
      h('div', { class: 'muted small', style: { fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' } }, k),
      h('div', { style: { fontWeight: 800, marginTop: 2 } }, v),
      h('div', { class: 'muted small' }, sub)
    ]));
  });
  card.appendChild(grid);
  return card;
}

function actions(st) {
  const cfg = views.agora.configFromStatus();
  const card = h('div', { class: 'card mt' }, [
    h('h3', {}, 'Actions'),
    h('div', { class: 'row', style: { gap: 10, flexWrap: 'wrap', marginTop: 6 } }, [
      h('button', { class: 'btn', onclick: () => Router.navigate('/agent-config') }, '⚙️ Configure agent'),
      h('button', { class: 'btn ghost', onclick: () => views.agora.runVoiceTest() }, '🎙️ Test voice agent'),
      h('a', { class: 'btn ghost sm', href: 'https://console.agora.io', target: '_blank', rel: 'noopener' }, 'Agora Console ↗'),
      h('a', { class: 'btn ghost sm', href: 'https://ai.agora.io', target: '_blank', rel: 'noopener' }, 'AI Studio ↗'),
      h('a', { class: 'btn ghost sm', href: 'https://console.agora.io/cn/projects', target: '_blank', rel: 'noopener' }, 'App Builder ↗'),
      h('button', { class: 'btn ghost sm', onclick: () => views.agora.runConnectionTest() }, 'Test connection')
    ])
  ]);
  return card;
}

function configSection(cf, health, rte) {
  cf = cf || {};
  rte = rte || [];
  const card = h('div', { class: 'card mt' }, [h('h3', {}, 'Live configuration')]);
  const rows = [
    ['Base URL', cf.baseUrl || '—', 'Agora Conversational AI API endpoint'],
    ['Region', cf.region || '—', 'Agora region cluster'],
    ['Pipeline ID', cf.pipelineId || '—', 'Published agent pipeline (AGORA_PIPELINE_ID)'],
    ['Webhooks', cf.webhooksConfigured ? 'Configured' : 'Not configured', 'WEBHOOK_SECRET verification enabled']
  ];
  const grid = h('div', { class: 'agora-facts' });
  rows.forEach(([k, v, sub]) => {
    grid.appendChild(h('div', { class: 'fact' }, [
      h('div', { class: 'muted small', style: { fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' } }, k),
      h('div', { style: { fontWeight: 800, marginTop: 2 } }, v || '—'),
      h('div', { class: 'muted small' }, sub)
    ]));
  });
  card.appendChild(grid);
  if (health && health.ok !== undefined) {
    card.appendChild(h('div', { class: 'mt6 small' }, [
      h('span', { class: health.ok ? 'good-txt' : 'danger-txt', style: { fontWeight: 700 } },
        health.ok ? '✓ Agora REST API reachable & authenticated.' : '✗ Agora REST API check failed.'),
      h('div', { class: 'muted' }, (health.message || '') + ' (mode ' + health.mode + ')')
    ]));
  }
  if (rte && rte.length) {
    card.appendChild(h('h4', { class: 'mt', style: { marginTop: 12 } }, 'Recent RTE activity'));
    rte.slice().reverse().slice(0, 8).forEach((r) => {
      card.appendChild(h('div', { class: 'list-item' }, [
        h('div', { style: { flex: 1 } }, [
          h('div', { style: { fontWeight: 600 } }, r.label || r.action),
          h('div', { class: 'small muted' }, (r.id || '') + (r.channel ? ' · ' + r.channel : '') + (r.at ? ' · ' + shortTime(r.at) : ''))
        ]),
        h('span', { class: r.status === 'ok' ? 'good-txt' : r.status === 'error' ? 'danger-txt' : 'muted' },
          (r.status || '') + (r.mode ? ' (' + r.mode + ')' : ''))
      ]));
    });
  }
  return card;
}

function analyticsSection(a) {
  if (!a) return h('div', { class: 'card mt' }, [h('h3', {}, 'Activity')]);
  const items = [
    ['📞', 'Calls', a.calls ? a.calls.total : 0],
    ['✅', 'Completed', a.calls ? a.calls.completed : 0],
    ['📅', 'Scheduled', a.calls ? a.calls.scheduled : 0],
    ['🧑‍⚖️', 'Escalations', a.calls ? a.calls.escalation : 0],
    ['💬', 'Conversations', a.conversations ? a.conversations.total : 0],
    ['🛠️', 'Cases', a.cases ? a.cases.total : 0],
    ['⭐', 'Reviews', a.reviews ? a.reviews.total : 0]
  ];
  const card = h('div', { class: 'card mt' }, [h('h3', {}, 'Conversation & call activity')]);
  const grid = h('div', { class: 'agora-stats' });
  items.forEach(([ic, label, val]) => {
    grid.appendChild(h('div', { class: 'stat-mini' }, [
      h('span', { style: { fontSize: '1.4rem' } }, ic),
      h('div', { style: { fontWeight: 800, fontSize: '1.2rem' } }, val),
      h('div', { class: 'small muted' }, label)
    ]));
  });
  card.appendChild(grid);
  return card;
}

function recentSection(recent) {
  const card = h('div', { class: 'card mt' }, [h('h3', {}, 'Recent activity')]);
  if (!recent || !recent.length) {
    card.appendChild(h('div', { class: 'small muted mt6' }, 'No activity yet — start a test voice agent or run a survey call.'));
    return card;
  }
  recent.forEach((r) => {
    card.appendChild(h('div', { class: 'list-item' }, [
      h('span', { style: { fontSize: '1.2rem' } }, r.type === 'call' ? '📞' : '🧑‍⚖️'),
      h('div', { style: { flex: 1 } }, [
        h('div', { style: { fontWeight: 700 } }, r.title),
        h('div', { class: 'small muted' }, (r.channel || '') + (r.at ? ' · ' + shortTime(r.at) : ''))
      ]),
      UI.statusTag(r.status || '')
    ]));
  });
  return card;
}

function warningsSection(w) {
  const card = h('div', { class: 'card mt' }, [h('h3', {}, 'Errors & warnings')]);
  const list = (w && w.warnings) || [];
  if (!w || !w.hasWarnings || !list.length) {
    card.appendChild(h('div', { class: 'small muted mt6' }, 'No errors or warnings recorded.'));
    return card;
  }
  list.forEach((er) => {
    card.appendChild(h('div', { class: 'list-item' }, [
      h('span', { style: { fontSize: '1.2rem' } }, er.level === 'error' ? '⛔' : '⚠️'),
      h('div', { style: { flex: 1 } }, [
        h('div', { style: { fontWeight: 700 } }, er.text),
        h('div', { class: 'small muted' }, shortTime(er.at))
      ])
    ]));
  });
  return card;
}

function consentSection(consent) {
  const card = h('div', { class: 'card mt' }, [h('h3', {}, 'Consent & privacy')]);
  if (!consent) { card.appendChild(h('div', { class: 'small muted mt6' }, 'No consent data.')); return card; }
  card.appendChild(h('div', { class: 'switch-row' }, [
    h('span', { style: { fontWeight: 600, flex: 1 } }, 'Voice recording consent'),
    h('span', {}, consent.voiceRecording ? 'Granted' : 'Not granted')
  ]));
  card.appendChild(h('div', { class: 'switch-row' }, [
    h('span', { style: { fontWeight: 600, flex: 1 } }, 'Conversation history'),
    h('span', {}, consent.conversations ? 'Enabled' : 'Disabled')
  ]));
  card.appendChild(h('a', { class: 'small link mt6', href: '#/privacy', style: { display: 'inline-block', marginTop: 8 } }, 'Manage privacy & consent →'));
  return card;
}

function liveAgentPanel(st, agent) {
  const cfg = views.agora.configFromStatus();
  let active = false;
  let sessionInfo = null;

  const statusLine = h('div', { class: 'small muted mt6', id: 'agora-live-state' },
    'No active agent session.');

  const startBtn = h('button', { class: 'btn', onclick: async () => {
    try {
      const r = await AgoraClient.startAgent();
      sessionInfo = r.session;
      active = true;
      startBtn.disabled = true; endBtn.disabled = false;
      wildcard.disabled = false; transcriptTxt.value = '';
      if (r.mode === 'production' && r.session && r.session.agent_id) {
        statusLine.textContent = `Live agent running (agent ${r.session.agent_id}) on channel ${r.session.channel}. Joining audio (Agora RTC)…`;
        // Try to actually join the real RTC voice channel.
        const j = await AgoraClient.joinVoiceSession(r.session, (ev) => {
          transcriptTxt.value += '\n[' + ev.type + '] ' + (ev.message || '');
          transcriptTxt.scrollTop = transcriptTxt.scrollHeight;
          statusLine.textContent = ev.message || statusLine.textContent;
        });
        if (!j.ok) {
          statusLine.textContent = 'Agent started but audio join unavailable: ' + j.note + ' (' + r.mode + ' mode).';
          UI.toast('Agent started; audio join: ' + j.note, 'warn');
        }
      } else {
        statusLine.textContent = `Active session (${r.mode}) — channel ${r.session.channel}. Mock mode: no real audio. Speak or type below.`;
        UI.toast('Voice agent started (' + r.mode + ' mode).', r.mode === 'production' ? 'good' : 'warn');
      }
    } catch (e) {
      statusLine.textContent = 'Could not start the agent: ' + e.message + (views.agora.configFromStatus().connection === 'connected' ? ' (agent not configured — set AGORA_AGENT_ID / AGORA_PIPELINE_ID).' : '');
      UI.toast('Start failed: ' + e.message, 'bad');
    }
  } }, '▶ Start conversation');

  const endBtn = h('button', {
    class: 'btn danger', disabled: true, onclick: async () => {
      const r = await AgoraClient.endAgent({ consent: true, kind: 'conversation' });
      active = false; sessionInfo = null;
      startBtn.disabled = false; endBtn.disabled = true; wildcard.disabled = true;
      statusLine.textContent = 'Session ended' + (r && r.session ? ' (duration ' + (r.session.turns || 0) + ' turns).' : '.');
      UI.toast('Conversation ended.', 'good');
      views.agora.data = await API.get('/api/agora/status');
      setTimeout(() => views.agora.render(), 200);
    }
  }, '■ End conversation');

  const wildcard = h('input', {
    type: 'text', placeholder: 'Type a test phrase (e.g. "record a sale of 500 for biscuits")…',
    class: 'field-input', id: 'agora-live-input', disabled: true, style: { marginRight: 8, flex: 1 }
  });
  const sendBtn = h('button', { class: 'btn ghost sm', disabled: true, onclick: async () => {
    const v = wildcard.value.trim();
    if (!v) return;
    try { await AgoraClient.sendTurn(v); wildcard.value = ''; UI.toast('Sending to agent…'); }
    catch (e) { UI.toast(e.message, 'bad'); }
  } }, 'Send');

  wildcard.addEventListener('input', () => { const has = !!wildcard.value.trim(); sendBtn.disabled = !has || wildcard.disabled; });

  const transcriptTxt = h('textarea', {
    rows: 4, placeholder: 'Live session log will appear here…', readonly: true,
    style: { width: '100%', marginTop: 10, fontFamily: 'var(--font-mono, monospace)', fontSize: '.85rem' }
  });

  const escBtn = h('button', { class: 'btn ghost sm', onclick: async () => {
    try {
      await AgoraClient.escalate({ topic: 'Support request from voice', reason: 'Requires a human expert' });
      UI.toast('Escalated to a human expert.', 'good');
      statusLine.textContent = 'Escalated to a human expert — case created.';
    } catch (e) { UI.toast(e.message, 'bad'); }
  } }, '🧑‍⚖️ Escalate to human');

  const card = h('div', { class: 'card mt' }, [
    h('h3', {}, 'Test voice agent'),
    h('div', { class: 'small muted mt6' }, 'Start a conversation to exercise the agent. In mock mode this records a session/call locally; in live mode it would open a real Agora voice channel.'),
    h('div', { class: 'row', style: { gap: 10, marginTop: 12, flexWrap: 'wrap' } }, [startBtn, endBtn, h('span', { style: { flex: 1 } }), escBtn]),
    h('div', { class: 'row', style: { gap: 8, marginTop: 10 } }, [wildcard, sendBtn]),
    statusLine,
    transcriptTxt
  ]);
  return card;
}

function callLogs(a) {
  const card = h('div', { class: 'card mt' }, [h('h3', {}, 'Call logs & transcripts')]);
  card.appendChild(h('a', { class: 'small link', href: '#/history', style: { display: 'inline-block', marginTop: 4 } }, 'View full conversation history →'));
  const total = (a && a.calls && a.calls.total) || 0;
  card.appendChild(h('div', { class: 'small muted mt6', style: { marginTop: 8 } },
    total + (total === 1 ? ' call record' : ' call records') + ' stored (consent-gated, local-only).'));
  return card;
}

function shortId(id) {
  if (!id) return '';
  return id.length > 10 ? id.slice(0, 8) + '…' + id.slice(-4) : id;
}
function shortTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleString();
}

/* ---- actions exposed for reusable calls ---- */
views.agora.runVoiceTest = function () {
  const state = document.querySelector('#agora-live-state');
  if (state) { state.textContent = 'Click "Start conversation" to begin a live test.'; }
  const start = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes('Start conversation'));
  if (start) start.click(); else if (state) state.textContent = 'Start a conversation above to test.';
};
views.agora.runConnectionTest = async function () {
  UI.toast('Running connection test…');
  try {
    const h = await API.get('/api/agora/health');
    const ct = await API.get('/api/agora/connection-test');
    if (h.ok && ct.ok) UI.toast('Connected — Agora REST API reachable & all checks passed.', 'good');
    else {
      const missing = (ct.checks || []).filter((c) => !c.ok).map((c) => c.key + (c.detail ? ' (' + c.detail + ')' : '')).join(', ');
      UI.toast('Not fully connected: ' + (missing || 'check failed'), 'bad');
    }
  } catch (e) { UI.toast(e.message, 'bad'); }
};
