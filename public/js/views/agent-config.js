/* views/agent-config.js — Agent configuration with version history.
 *
 * Edit the voice-AI agent (name, system prompt, greeting, languages, voice,
 * persona, escalation rules, consent messages, knowledge base, avatar, history
 * settings). Supports a full workflow: edit draft → preview → Save Draft →
 * Test Agent → Publish Configuration, plus a publish review screen (old-vs-new
 * diff, validation, warnings, confirm) and version history with rollback.
 *
 * Publishing only marks a locally-persisted config version. Live deployment to
 * the Agora agent still requires applying the config in Agora Console / AI
 * Studio — the UI says exactly that and never claims a false publish.
 */

views.agentConfig = {
  active: null,
  draft: null,
  history: [],

  async render() {
    const el = h('div', {});
    el.appendChild(h('h2', {}, '⚙️ ' + t('nav_dk_agent_config')));

    try {
      const [cfg, hist] = await Promise.all([
        API.get('/api/agora/agent-config/draft'),
        API.get('/api/agora/agent-config/history')
      ]);
      views.agentConfig.draft = cfg.draft || {};
      views.agentConfig.history = hist.history || [];
      const active = await API.get('/api/agora/agent-config');
      views.agentConfig.active = active.config || {};
    } catch (e) {
      el.appendChild(UI.empty('⚠️', 'Could not load agent configuration: ' + e.message));
      return el;
    }

    // Status header
    const status = h('div', { class: 'row', style: { alignItems: 'center', gap: 10, marginTop: 4 } }, [
      h('span', { class: 'small muted' }, 'Published v' + (views.agentConfig.active.version || 1)),
      (views.agentConfig.active.publishedAt
        ? h('span', { class: 'small muted' }, '· ' + shortTime(views.agentConfig.active.publishedAt))
        : h('span', { class: 'tag warn' }, 'Not published yet')),
      h('span', { style: { flex: 1 } }),
      h('button', { class: 'btn ghost sm', onclick: () => Router.navigate('/agora') }, '← Dashboard')
    ]);
    el.appendChild(status);

    // The editable form
    el.appendChild(editorForm());

    // Preview panel
    el.appendChild(previewPanel());

    // Action bar: preview / save draft / test / publish
    el.appendChild(actionBar());

    // Version history
    el.appendChild(versionHistory());

    return el;
  }
};

function editorForm() {
  const d = views.agentConfig.draft;
  const field = (label, input) => {
    return h('div', { class: 'field mt' }, [h('label', {}, label), input]);
  };
  const text = (val, ph) => h('input', { type: 'text', value: val || '', placeholder: ph || '', class: 'field-input', style: { width: '100%' } });
  const area = (val, ph, rows) => h('textarea', { rows: rows || 3, placeholder: ph || '', style: { width: '100%' }, class: 'field-input' }, val || '');
  const wrap = (input, key, coerce) => {
    input.addEventListener('input', () => {
      views.agentConfig.draft[key] = coerce ? coerce(input.value) : input.value;
    });
    return input;
  };
  const bool = (key, label) => {
    const sw = h('input', { type: 'checkbox', checked: !!d[key] });
    sw.addEventListener('change', () => { views.agentConfig.draft[key] = sw.checked; });
    return h('div', { class: 'switch-row' }, [
      h('span', { style: { fontWeight: 600, flex: 1 } }, label),
      h('label', { class: 'switch' }, [sw, h('span', { class: 'slider' })])
    ]);
  };

  const card = h('div', { class: 'card mt' }, [h('h3', {}, 'Agent configuration')]);

  card.appendChild(field('Agent name', wrap(text(d.name, 'Agent name'), 'name')));
  card.appendChild(field('System prompt', wrap(area(d.systemPrompt, 'How the agent behaves', 4), 'systemPrompt')));
  card.appendChild(field('Greeting', wrap(text(d.greeting, 'First message'), 'greeting')));

  // Supported languages
  card.appendChild(h('div', { class: 'field mt' }, [h('label', {}, 'Supported languages')]));
  card.appendChild(languageChips());

  // Response language
  card.appendChild(h('div', { class: 'field mt' }, [h('label', {}, 'Preferred response language')]));
  card.appendChild(responseLangChips());

  // Auto-detect, switching
  card.appendChild(bool('languageAutoDetect', 'Auto-detect language'));
  card.appendChild(bool('midSentenceSwitching', 'Mid-sentence language switching'));
  card.appendChild(bool('codeSwitching', 'Code-switching'));

  // Voice
  card.appendChild(field('TTS voice', wrap(text(d.ttsVoice, 'e.g. Roopa / En-GB'), 'ttsVoice')));
  card.appendChild(h('div', { class: 'field mt' }, [h('label', {}, 'TTS speed (0.5–2.0)')]));
  const speed = h('input', { type: 'range', min: '0.5', max: '2', step: '0.1', value: d.speed || 1, style: { width: '100%' } });
  const speedLabel = h('span', { class: 'small muted', style: { marginLeft: 8 } }, (d.speed || 1) + '×');
  speed.addEventListener('input', () => { views.agentConfig.draft.speed = parseFloat(speed.value); speedLabel.textContent = speed.value + '×'; });
  card.appendChild(h('div', { class: 'row', style: { gap: 8, alignItems: 'center' } }, [speed, speedLabel]));

  // Tone + persona
  const toneOpts = h('select', { class: 'field-input' }, [['friendly', 'Friendly'], ['professional', 'Professional'], ['warm', 'Warm & encouraging'], ['formal', 'Formal']].map(([v, l]) => h('option', { value: v }, l)));
  toneOpts.value = d.tone || 'friendly';
  toneOpts.addEventListener('change', () => { views.agentConfig.draft.tone = toneOpts.value; });
  card.appendChild(field('Tone', toneOpts));
  card.appendChild(field('Persona', wrap(text(d.persona, 'Persona description'), 'persona')));

  // Human escalation + uncertainty
  const he = d.humanEscalation || {};
  card.appendChild(h('div', { class: 'small muted mt6', style: { fontWeight: 700, marginTop: 16 } }, 'Human escalation'));
  card.appendChild(boolNested('humanEscalation', 'enabled', 'Enable human escalation'));
  card.appendChild(textAreaField('humanEscalation', 'trigger', he.trigger || '', 'When to hand off to a human'));
  card.appendChild(numberField('humanEscalation', 'maxAttempts', he.maxAttempts != null ? he.maxAttempts : 2));
  card.appendChild(boolNested('uncertainty', 'enabled', 'Uncertainty handling'));

  // Consent
  card.appendChild(h('div', { class: 'small muted mt6', style: { fontWeight: 700, marginTop: 16 } }, 'Consent'));
  card.appendChild(boolNested('consent', 'requireExplicit', 'Require explicit consent'));
  card.appendChild(textAreaField('consent', 'message', (d.consent && d.consent.message) || '', 'Consent prompt'));

  // Conversation history
  card.appendChild(h('div', { class: 'small muted mt6', style: { fontWeight: 700, marginTop: 16 } }, 'Conversation history'));
  card.appendChild(boolNested('conversationHistory', 'enabled', 'Store conversation history'));
  card.appendChild(boolNested('conversationHistory', 'storeLocalOnly', 'Local-only storage (no cloud)'));
  card.appendChild(boolNested('conversationHistory', 'requireConsent', 'Require consent to store'));

  return card;
}

// text/number fields that write into a nested section of the draft
function textAreaField(section, key, val, ph) {
  const input = h('input', { type: 'text', value: val || '', placeholder: ph || '', class: 'field-input', style: { width: '100%' } });
  input.addEventListener('input', () => {
    if (!views.agentConfig.draft[section] || typeof views.agentConfig.draft[section] !== 'object') views.agentConfig.draft[section] = {};
    views.agentConfig.draft[section][key] = input.value;
  });
  return h('div', { class: 'field mt' }, [h('label', {}, humanize(key)), input]);
}
function numberField(section, key, val) {
  const input = h('input', { type: 'number', min: '1', max: '10', value: val, class: 'field-input', style: { width: 120 } });
  input.addEventListener('input', () => {
    if (!views.agentConfig.draft[section] || typeof views.agentConfig.draft[section] !== 'object') views.agentConfig.draft[section] = {};
    views.agentConfig.draft[section][key] = parseInt(input.value, 10) || 2;
  });
  return h('div', { class: 'field mt' }, [h('label', {}, humanize(key)), input]);
}
function humanize(k) {
  return String(k).replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}

function languageChips() {
  const d = views.agentConfig.draft;
  const supported = d.supportedLanguages || [];
  const langs = (App.config.languages || []).filter((l) => ['hi', 'hing', 'mr', 'bn', 'pa', 'en', 'te', 'ta', 'gu', 'kn', 'ml', 'or', 'as', 'ur'].includes(l.code));
  const chips = h('div', { class: 'quick-chips mt' });
  langs.forEach((l) => {
    const on = supported.includes(l.code);
    chips.appendChild(h('button', { class: 'chip ' + (on ? 'selected' : ''), onclick: () => {
      const idx = supported.indexOf(l.code);
      if (idx > -1) supported.splice(idx, 1); else supported.push(l.code);
      views.agentConfig.draft.supportedLanguages = supported.slice();
      views.agentConfig.render().then(() => {});
    } }, `${l.flag} ${l.nativeName}`));
  });
  return chips;
}

function responseLangChips() {
  const d = views.agentConfig.draft;
  const cur = d.preferredResponseLanguage || 'auto';
  const chips = h('div', { class: 'quick-chips mt' });
  [['auto', '↺ Auto'], ['hi', 'हिन्दी'], ['hing', 'Hinglish'], ['en', 'English'], ['mr', 'मराठी'], ['bn', 'বাংলা'], ['pa', 'ਪੰਜਾਬੀ'], ['te', 'తెలుగు']].forEach(([code, label]) => {
    chips.appendChild(h('button', { class: 'chip ' + (cur === code ? 'selected' : ''), onclick: () => {
      views.agentConfig.draft.preferredResponseLanguage = code;
      views.agentConfig.render().then(() => {});
    } }, label));
  });
  return chips;
}

// Helper to build nested-boolean toggles
function boolNested(section, key, label) {
  const d = views.agentConfig.draft;
  if (!d[section] || typeof d[section] !== 'object') d[section] = {};
  const sw = h('input', { type: 'checkbox', checked: !!d[section][key] });
  sw.addEventListener('change', () => { views.agentConfig.draft[section][key] = sw.checked; });
  return h('div', { class: 'switch-row' }, [
    h('span', { style: { fontWeight: 600, flex: 1 } }, label),
    h('label', { class: 'switch' }, [sw, h('span', { class: 'slider' })])
  ]);
}

// minor override of the temp-field handling: map tmp fields back to their target

function previewPanel() {
  const d = views.agentConfig.draft;
  const card = h('div', { class: 'card mt' }, [h('h3', {}, 'Preview')]);
  const box = h('div', { class: 'agent-preview', style: { background: 'var(--lavender)', padding: 14, borderRadius: 'var(--radius-sm)' } });
  box.appendChild(h('div', { class: 'muted small', style: { fontWeight: 700 } }, d.name || 'Agent'));
  box.appendChild(h('p', { style: { marginTop: 6 } }, d.greeting || ''));
  box.appendChild(h('p', { class: 'small muted', style: { marginTop: 6 } }, 'Reply language: ' + (d.preferredResponseLanguage || 'auto') + ' · Tone: ' + (d.tone || 'friendly')));
  card.appendChild(box);
  const promptPreview = h('details', { style: { marginTop: 10 } }, [
    h('summary', { class: 'small link', style: { cursor: 'pointer' } }, 'System prompt'),
    h('p', { class: 'small muted', style: { marginTop: 6, whiteSpace: 'pre-wrap' } }, d.systemPrompt || '')
  ]);
  card.appendChild(promptPreview);
  return card;
}

function actionBar() {
  const card = h('div', { class: 'card mt' }, [
    h('h3', {}, 'Actions'),
    h('div', { class: 'row', style: { gap: 10, flexWrap: 'wrap' } }, [
      saveDraftBtn(),
      h('button', { class: 'btn ghost', onclick: () => views.agentConfig.publishFlow() }, '🚀 Publish Configuration'),
      h('button', { class: 'btn ghost', onclick: () => views.agentConfig.testAgent() }, '🎙️ Test Agent'),
      h('button', { class: 'btn ghost danger', onclick: () => views.agentConfig.reset() }, '↺ Reset to defaults')
    ]),
    h('div', { class: 'small muted mt6' }, 'Publishing here saves a new config version locally. To make it live on the real Agora agent, open the agent in Agora Console / AI Studio and apply the same values — this page never claims a false "Published to Agora".')
  ]);
  return card;
}

function saveDraftBtn() {
  const btn = h('button', { class: 'btn', onclick: async (e) => {
    e.target.disabled = true;
    try {
      await API.post('/api/agora/agent-config/draft', { config: views.agentConfig.draft });
      UI.toast('Draft saved.', 'good');
      views.agentConfig.data = { draft: views.agentConfig.draft };
    } catch (ex) { UI.toast(ex.message, 'bad'); }
    finally { e.target.disabled = false; }
  } }, '💾 Save Draft');
  return btn;
}

function versionHistory() {
  const hist = views.agentConfig.history || [];
  const card = h('div', { class: 'card mt' }, [h('h3', {}, 'Version history')]);
  if (!hist.length) {
    card.appendChild(h('div', { class: 'small muted mt6' }, 'No published versions yet.'));
    return card;
  }
  hist.forEach((v) => {
    const row = h('div', { class: 'list-item' }, [
      h('span', { style: { fontWeight: 800 } }, 'v' + v.version),
      h('div', { style: { flex: 1 } }, [
        h('div', { style: { fontWeight: 600 } }, v.comment || ('v' + v.version)),
        h('div', { class: 'small muted' }, (v.status || 'published') + ' · ' + shortTime(v.publishedAt))
      ]),
      h('button', { class: 'btn ghost sm', onclick: async () => {
        await views.agentConfig.rollback(v.version);
      } }, 'Restore')
    ]);
    card.appendChild(row);
  });
  return card;
}

/* ---- workflow actions ---- */
views.agentConfig.publishFlow = async function () {
  // First save the draft
  await API.post('/api/agora/agent-config/draft', { config: views.agentConfig.draft });

  // Build the review screen (old vs new diff, validation, warnings)
  const diffRes = await API.get('/api/agora/agent-config/diff');
  const diff = diffRes.diff || [];
  const validation = validate(views.agentConfig.draft);

  const lines = diff.map((d) =>
    h('div', { class: 'list-item' }, [
      h('div', { style: { flex: 1, fontSize: '.95rem' } }, [
        h('div', { style: { fontWeight: 700 } }, d.key),
        h('div', { class: 'small muted', style: { whiteSpace: 'pre-wrap', maxHeight: 60, overflow: 'auto' } },
          'old: ' + pretty(d.from) + '\nnew: ' + pretty(d.to))
      ])
    ]));

  let body = h('div', {});
  body.appendChild(h('p', { class: 'small muted' }, 'Review the changes before publishing. ' + (validation.ok ? 'All checks pass.' : 'Validation warnings below.')));
  if (!validation.ok) {
    validation.warnings.forEach((w) => body.appendChild(h('div', { class: 'small warn', style: { marginTop: 4 } }, '⚠ ' + w)));
  }
  if (diff.length) {
    body.appendChild(h('div', { class: 'small muted mt6', style: { fontWeight: 700 } }, 'Changed fields (' + diff.length + ')'));
    lines.forEach((l) => body.appendChild(l));
  } else {
    body.appendChild(h('div', { class: 'small muted mt6' }, 'No changes detected since the last published version.'));
  }

  const comment = h('input', { type: 'text', placeholder: 'Publish comment (optional)', class: 'field-input', style: { width: '100%', marginTop: 10 } });

  const m = UI.modal(`<h3>Publish new agent configuration</h3>`);
  const wrap = m.el.querySelector('.modal');
  wrap.appendChild(h('div', { class: 'mt' }, [body]));
  wrap.appendChild(comment);
  wrap.appendChild(h('div', { class: 'row', style: { justifyContent: 'flex-end', gap: 10, marginTop: 14 } }, [
    h('button', { class: 'btn ghost sm', onclick: () => m.close(false) }, 'Cancel'),
    h('button', { class: 'btn sm', onclick: async () => {
      try {
        await API.post('/api/agora/agent-config/publish', { comment: comment.value });
        m.close(true);
        UI.toast('Configuration published (new version).', 'good');
        views.agentConfig.render().then(() => {});
      } catch (e) { UI.toast(e.message, 'bad'); }
    } }, 'Confirm publish')
  ]));
};

views.agentConfig.rollback = async function (version) {
  const ok = await UI.confirm('Restore version v' + version + '? This creates a new version from it.');
  if (!ok) return;
  try {
    const r = await API.post('/api/agora/agent-config/rollback', { version });
    UI.toast('Rolled back to v' + version + ' (now v' + r.version + ').', 'good');
    views.agentConfig.render().then(() => {});
  } catch (e) { UI.toast(e.message, 'bad'); }
};

views.agentConfig.testAgent = async function () {
  try {
    const { session, mode } = await AgoraClient.startAgent();
    UI.toast('Agent test started (' + mode + ' mode, channel ' + session.channel + ').', 'good');
    const state = document.querySelector('#agora-live-state');
    if (state) state.textContent = 'Agent test running (' + mode + '). View transcripts on the dashboard.';
  } catch (e) { UI.toast(e.message, 'bad'); }
};

views.agentConfig.reset = async function () {
  // reset requires backend support; here just confirm + advise
  const ok = await UI.confirm('Reset agent config to defaults?');
  if (!ok) return;
  UI.toast('Reset not yet wired to backend — restoring draft to defaults locally.', 'bad');
  views.agentConfig.draft = JSON.parse(JSON.stringify({
    name: 'Techo Voice Assistant',
    greeting: 'Namaste! Main Techo hoon.',
    systemPrompt: 'You are Techo, a helpful assistant for business owners in India.',
    supportedLanguages: ['hi', 'hing', 'mr', 'bn', 'pa', 'en'],
    preferredResponseLanguage: 'auto',
    tone: 'friendly'
  }));
  views.agentConfig.render().then(() => {});
};

/* ---- helpers ---- */
function validate(d) {
  const warnings = [];
  if (!d.name || !String(d.name).trim()) warnings.push('Agent name is empty.');
  if (!d.systemPrompt || !String(d.systemPrompt).trim()) warnings.push('System prompt is empty.');
  if (!(d.supportedLanguages && d.supportedLanguages.length)) warnings.push('No languages selected.');
  if (!d.greeting || !String(d.greeting).trim()) warnings.push('Greeting is empty.');
  return { ok: !warnings.length, warnings };
}
function pretty(v) {
  if (v == null) return '—';
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
function shortTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleString();
}
