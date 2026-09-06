/* views/home.js — night-street GIF background with centered search bar,
 * inline voice button (Agora Conversational AI), and compact conversation
 * panel. Voice button starts a live Agora session right here — no redirect
 * to /chat needed. */

views.home = {
  _poll: null,
  _seen: 0,
  _state: 'idle', // idle | listening | processing | speaking | error
  _messages: [],
  _session: null,
  _voiceEl: null,
  _panelEl: null,
  _statusEl: null,

  async render() {
    if (!document.querySelector('link[data-techo-home-bg]')) {
      const pl = document.createElement('link');
      pl.rel = 'preload'; pl.as = 'image';
      pl.href = '/backgrounds/techo-home-bg.gif';
      pl.setAttribute('data-techo-home-bg', '1');
      document.head.appendChild(pl);
    }

    views.home._cleanup();
    views.home._messages = [];
    views.home._seen = 0;
    views.home._state = 'idle';

    const el = h('div', { class: 'home-minimal' });
    el.appendChild(h('h1', { class: 'visually-hidden', style: 'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0' }, 'Techo'));

    const center = h('div', { class: 'home-center' });
    center.appendChild(views.home._buildSearchRow());
    center.appendChild(views.home._buildConversationPanel());
    el.appendChild(center);
    center.appendChild(await avatarEntry());
    return el;
  },

  _buildSearchRow() {
    const self = views.home;
    const input = h('input', {
      type: 'search', name: 'ask',
      placeholder: 'Ask anything — e.g. "show today sales" or "pending payments"',
      'aria-label': 'Ask the assistant'
    });
    const goBtn = h('button', {
      class: 'icon-btn', type: 'button', title: 'Ask', 'aria-label': 'Ask',
      onclick: () => { App.pendingText = input.value.trim(); Router.navigate('/chat'); }
    }, '→');
    const voiceBtn = h('button', {
      class: 'icon-btn home-voice-btn', type: 'button',
      title: 'Tap to speak', 'aria-label': 'Tap to speak',
      onclick: () => self._toggleVoice()
    }, '🎙️');
    self._voiceEl = voiceBtn;
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { App.pendingText = input.value.trim(); Router.navigate('/chat'); } });
    return h('div', { class: 'home-search', role: 'search' }, [input, voiceBtn, goBtn]);
  },

  _buildConversationPanel() {
    const self = views.home;
    const panel = h('div', { class: 'home-voice-panel', style: { display: 'none' } });
    self._panelEl = panel;
    return panel;
  },

  _updateUI() {
    const self = views.home;
    const btn = self._voiceEl;
    const panel = self._panelEl;
    if (!btn || !panel) return;
    const s = self._state;
    btn.className = 'icon-btn home-voice-btn hs-' + s;
    const labels = { idle: '🎙️', listening: '🔴', processing: '⏳', speaking: '🔊', error: '⚠️' };
    const titles = { idle: 'Tap to speak', listening: 'Listening — tap to stop', processing: 'Thinking…', speaking: 'AI is speaking — tap to stop', error: 'Error — tap to retry' };
    btn.textContent = labels[s] || '🎙️';
    btn.title = titles[s] || 'Tap to speak';

    if (s === 'idle' && self._messages.length === 0) {
      panel.style.display = 'none';
      return;
    }
    panel.style.display = '';
    panel.innerHTML = '';
    if (s !== 'idle') {
      const statusTexts = { listening: 'Listening…', processing: 'Thinking…', speaking: 'AI is speaking…', error: 'Connection error' };
      const cls = { listening: 'hv-listening', processing: 'hv-processing', speaking: 'hv-speaking', error: 'hv-error' };
      panel.appendChild(h('div', { class: 'hv-status ' + (cls[s] || '') }, statusTexts[s] || ''));
    }
    self._messages.forEach((m) => {
      const row = h('div', { class: 'hv-row ' + (m.role === 'user' ? 'hv-user' : 'hv-ai') });
      const label = h('span', { class: 'hv-label' }, m.role === 'user' ? 'You' : 'Techo');
      const body = h('span', { class: 'hv-text' }, m.text);
      row.appendChild(label);
      row.appendChild(body);
      panel.appendChild(row);
    });
  },

  async _toggleVoice() {
    const self = views.home;
    if (self._state === 'listening' || self._state === 'speaking' || self._state === 'processing') {
      await self._stopVoice();
      return;
    }
    self._setState('processing');
    try {
      const st = await API.get('/api/agora/status').catch(() => null);
      const s = (st && st.status) || {};
      if (s.connection !== 'connected' || !s.agentConfigured) {
        self._setState('error');
        UI.toast('Voice agent not configured on the server.', 'warn');
        self._updateUI();
        return;
      }
    } catch (e) { /* proceed — server will error later if unconfigured */ }

    let r = null;
    try {
      r = await AgoraClient.startAgent();
    } catch (e) { r = null; }
    const sess = r && r.session;
    const usable = r && r.ok && sess && r.mode === 'production' && sess.status === 'active' && sess.rtc && sess.rtc.appId;
    if (!usable) {
      const msg = (sess && sess.error && sess.error.message) || 'Voice agent unavailable.';
      self._setState('error');
      UI.toast(msg, 'bad');
      self._updateUI();
      return;
    }

    const j = await AgoraClient.joinVoiceSession(sess, (ev) => {
      if (ev.type === 'connected') self._setState('listening');
      else if (ev.type === 'ai_speaking') self._setState('speaking');
      else if (ev.type === 'disconnected') self._setState('idle');
    });
    if (!j.ok) {
      self._setState('error');
      UI.toast('Could not connect to voice channel.', 'bad');
      try { await AgoraClient.endAgent({ consent: false, persist: false }); } catch {}
      self._updateUI();
      return;
    }
    self._session = sess;
    self._seen = (sess.transcript || []).length;
    self._poll = setInterval(() => self._pollTranscript(), 3500);
    self._setState('listening');
    UI.toast('Live voice connected — talk now.', 'good');
  },

  async _stopVoice() {
    const self = views.home;
    if (self._poll) { clearInterval(self._poll); self._poll = null; }
    await AgoraClient.leaveRTC();
    try { await AgoraClient.endAgent({ consent: true, persist: true }); } catch {}
    self._session = null;
    self._setState('idle');
  },

  async _pollTranscript() {
    const self = views.home;
    if (!self._session) return;
    try {
      const r = await API.get('/api/agora/session/sync');
      const transcript = (r && r.transcript) || [];
      const fresh = transcript.slice(self._seen);
      if (fresh.length) {
        fresh.forEach((m) => {
          const role = m.role === 'user' ? 'user' : 'assistant';
          const existing = self._messages.findIndex((x) => x.role === role && x.text === m.text);
          if (existing === -1) self._messages.push({ role, text: m.text });
        });
        self._seen = transcript.length;
        self._updateUI();
      }
      const actions = (r && r.agentActions) || [];
      actions.forEach((a) => {
        if (a.label) {
          self._messages.push({ role: 'assistant', text: '✓ ' + a.label });
          self._updateUI();
        }
      });
      if (transcript.length > 0 && self._state === 'listening') {
        const last = transcript[transcript.length - 1];
        if (last.role !== 'user') self._setState('processing');
      }
    } catch (e) { /* transient */ }
  },

  _setState(s) {
    views.home._state = s;
    views.home._updateUI();
  },

  _cleanup() {
    const self = views.home;
    if (self._poll) { clearInterval(self._poll); self._poll = null; }
    if (self._session) { AgoraClient.leaveRTC().catch(() => {}); AgoraClient.endAgent({ consent: false, persist: false }).catch(() => {}); self._session = null; }
    self._messages = [];
    self._seen = 0;
  }
};

async function avatarEntry() {
  const btn = h('button', {
    class: 'home-avatar', type: 'button', 'aria-label': 'Open Avatar Studio',
    onclick: () => Router.navigate('/avatar-studio')
  }, [h('span', { class: 'home-avatar-thumb' }, '🧑‍💼')]);

  let st = null; let list = null;
  try { st = await AvatarClient.status(); list = await AvatarClient.list(); } catch (e) {}
  const configured = !!(st && st.configured);
  const selected = (list && list.selected) || {};
  const current = (list && list.avatars || []).find((a) => a.id === selected.avatarId);

  const text = h('span', { class: 'home-avatar-text' });
  if (configured && current) {
    if (current.thumbnail) btn.querySelector('.home-avatar-thumb').textContent = '';
    if (current.thumbnail) btn.querySelector('.home-avatar-thumb').appendChild(h('img', { src: current.thumbnail, alt: '' }));
    text.textContent = 'Techo talks as ' + current.name;
  } else if (configured) {
    text.textContent = 'Pick a talking avatar';
  } else {
    text.textContent = 'Avatar — set up';
  }
  btn.appendChild(text);
  btn.appendChild(h('span', { class: 'home-avatar-arrow' }, '›'));
  return btn;
}