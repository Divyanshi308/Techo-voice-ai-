/* views/chat.js â€” voice-first assistant with text fallback.
   - Large mic button (primary action) with recording-consent prompt.
   - Spoken answers played back with audio controls.
   - Language detection badge on each user message (code-switch support).
   - Action buttons after replies (record, share, remind, expert).
   - Text chat fallback when voice is unavailable. */

// Live Agora agent readiness (honest â€” set from the real /api/agora/status).
const ViewState = {
  liveAgentReady: false,
  liveSession: null,
  connection: 'not_configured'
};

views.chat = {
  state: {
    messages: [], listening: false, speakEnabled: true, pendingText: '',
    mode: 'idle', muted: false, err: null
  },

  async render() {
    const S = this.state;
    if (App.pendingPrompt) { S.pendingText = App.pendingPrompt; App.pendingPrompt = null; }
    if (App.pendingText) { S.pendingText = App.pendingText; App.pendingText = null; }
    const autoMic = App.pendingMic;
    App.pendingMic = false;

    await loadVoiceCache();
    await loadTalkingAvatar();
    await Realtime.init();
    // Honest live-state from the authoritative backend status (set by Realtime.init).
    const rts = Realtime.status || {};
    ViewState.connection = rts.connection || (App.realtimeMode === 'agora' ? 'connected' : 'not_configured');
    ViewState.liveAgentReady = rts.connection === 'connected' && !!rts.agentConfigured;
    ViewState.liveSession = rts.agentConfigured ? { connection: rts.connection, agentConfigured: !!rts.agentConfigured } : null;

    const el = h('div', {});
    el.appendChild(h('div', { class: 'row between' }, [
      h('h2', {}, t('tab_chat')),
      h('button', {
        class: 'icon-btn', type: 'button', title: 'New conversation', 'aria-label': 'New conversation', onclick: async () => {
          await API.post('/api/chat/new');
          S.messages = [];
          renderLog();
        }
      }, 'âž•')
    ]));

    // Persona strip header (pixel-human companion + honest live state)
    const header = buildPersonaStrip();
    el.appendChild(header);

    // Chat log
    const log = h('div', { class: 'chat-log' });
    el.appendChild(log);

    // â”€â”€ Language selector row â”€â”€
    const userLang = App.session.user.preferredLang || 'hing';
    const langOpts = (App.config.languages || []).filter((l) => l.enabled !== false);
    const langRow = h('div', { class: 'lang-row', style: { display: 'flex', gap: '4px', overflowX: 'auto', padding: '4px 0 6px', flexWrap: 'nowrap' } });
    // Auto-detect option
    langRow.appendChild(h('button', {
      class: 'chip sm' + (!App.session.user.langPrefs || !App.session.user.langPrefs.lockResponseLang ? ' selected' : ''),
      style: { flexShrink: 0 },
      onclick: async () => { await API.put('/api/me/preferences', { langPrefs: { lockResponseLang: false } }); App.session.user.langPrefs = { ...(App.session.user.langPrefs || {}), lockResponseLang: false }; views.chat.render(); }
    }, 'ðŸ”„ Auto'));
    langOpts.forEach((l) => {
      langRow.appendChild(h('button', {
        class: 'chip sm' + (userLang === l.code ? ' selected' : ''),
        style: { flexShrink: 0 },
        onclick: async () => { await API.put('/api/me/preferences', { preferredLang: l.code }); App.session.user.preferredLang = l.code; UI.toast('Reply â†’ ' + l.nativeName, 'good'); views.chat.render(); }
      }, l.flag + ' ' + (l.code === 'hing' ? 'Hing' : l.code.toUpperCase())));
    });

    // â”€â”€ Detected language + response language badge â”€â”€
    const statusBadge = h('div', { class: 'chat-lang-status row', style: { justifyContent: 'center', gap: '6px', fontSize: '.75rem', flexWrap: 'wrap' } });
    statusBadge.appendChild(h('span', { class: 'pill neutral' }, 'ðŸ—£ Reply: ' + (langOpts.find((l) => l.code === userLang) || {}).name || userLang));
    statusBadge.appendChild(h('span', { class: 'pill neutral' }, App.realtimeMode === 'agora' && ViewState.liveAgentReady ? 'ðŸŽ™ï¸ Live: Agora RTC agent' : 'ðŸŽ¤ STT: browser Web Speech'));

    // Mic + text input area
    const micBtn = h('button', {
      class: 'mic-big', 'aria-label': TR.t('tap_to_speak'), 'aria-pressed': 'false',
      onclick: () => this.toggleMic()
    }, 'ðŸŽ™ï¸');
    const orbWrap = h('div', { class: 'avatar-orb-wrap' }, [
      h('span', { class: 'avatar-orb-halo', 'aria-hidden': 'true' }),
      h('span', { class: 'avatar-orb-ring', 'aria-hidden': 'true' }),
      micBtn,
      h('span', { class: 'voice-orb-label' }, t('tap_to_speak'))
    ]);
    const wave = h('div', { class: 'waveform idle' });
    for (let i = 0; i < 24; i++) wave.appendChild(h('span', { class: 'bar' }));

    const muteBtn = h('button', {
      class: 'tbtn', title: 'Mute/unmute AI voice reply', 'aria-pressed': String(!S.muted),
      onclick: () => toggleMute()
    }, S.muted ? 'ðŸ”‡' : 'ðŸ”Š');
    const stopBtn = h('button', {
      class: 'tbtn', title: 'Stop speaking', onclick: () => { Voice.stopSpeaking(); stopAll(); }
    }, 'â¹');

    const vstate = h('div', { class: 'vstate s-idle' }, [h('span', { class: 'dot' }), h('span', {}, t('tap_to_speak'))]);
    const voiceStatus = h('div', { class: 'voice-status' });
    const voiceStatusRow = h('div', { class: 'row', style: { justifyContent: 'center', gap: '10px', flexWrap: 'wrap' } }, [vstate, voiceStatus]);

    const noteBtn = h('button', {
      class: 'tbtn note-rec', title: 'Record a voice note (saved locally after consent)',
      'aria-pressed': 'false', onclick: () => recordNote(noteBtn, noteStatus)
    }, 'ðŸŽ¤â¬‡');
    const noteStatus = h('div', { class: 'small muted', style: { fontSize: '.72rem', minHeight: '1.2em' } });

    const input = h('input', {
      type: 'text', placeholder: t('prompt'), value: S.pendingText || '',
      onkeydown: (e) => { if (e.key === 'Enter' && input.value.trim()) sendText(input.value.trim()); }
    });
    const sendBtn = h('button', { class: 'btn' }, t('send'));
    sendBtn.addEventListener('click', () => { const v = input.value.trim(); if (v) sendText(v); });

    const micCard = h('div', { class: 'card mt', style: { textAlign: 'center' } }, [
      langRow,
      statusBadge,
      h('div', { class: 'mic-wrap' }, [
        orbWrap,
        h('div', { class: 'mic-transport' }, [noteBtn, muteBtn, stopBtn]),
        wave,
        voiceStatusRow,
        noteStatus,
        h('div', { class: 'type-row' }, [input, sendBtn]),
        h('div', { class: 'small muted mt6', style: { fontSize: '.74rem' } }, voiceProviderNote())
      ])
    ]);
    // capture the provider-note element so live-state refreshes can rewrite it
    const noteEl = micCard.querySelector('.small.muted.mt6');
    el.appendChild(micCard);

    init(this, { el, log, micBtn, voiceStatus, input, wave, vstate, muteBtn, noteEl, statusBadge });

    // Load prior conversation
    await loadConversation(this, el, log);

    // When arriving from the home mic button, start listening right away.
    if (autoMic) {
      setTimeout(() => { try { views.chat.toggleMic(); } catch (e) { /* ignore */ } }, 80);
    }

    return el;
  },

  async toggleMic() {
    const S = this.state;
    if (S.listening) {
      await endLiveSession();
      Voice.stopListening();
      Voice.detachLevel();
      setMode('idle');
      S.listening = false;
      chatState.micBtn.classList.remove('listening');
      return;
    }
    // Recording consent
    if (!consentOk('voiceNote')) {
      setMode('requesting');
      const granted = await askConsent('voiceNote', t('recording_consent'));
      if (!granted) { UI.toast('Mic/recording permission needed.', 'warn'); setMode('idle'); return; }
    }
    // Prefer a REAL Agora live voice session when the backend is configured;
    // fall back to the browser Web Speech path otherwise (never fake it).
    const live = await startLiveSession();
    if (live) return;
    const started = Voice.startListening({
      lang: App.session.user.preferredLang || 'hing',
      continuous: true,
      onInterim: (txt) => { setVoiceStatus('ðŸŽ™ï¸ ' + txt); },
      onResult: (final, segLang) => {
        setVoiceStatus('');
        sendText(final, 'voice', segLang);
      },
      onEnd: (ev) => {
        S.listening = false;
        chatState.micBtn.classList.remove('listening');
        if (S.mode === 'listening') setMode('idle');
        setVoiceStatus('');
        if (ev && ev.code === 'permission') {
          setMode('mic_denied');
          UI.toast(t('mic_permission_denied'), 'bad');
        }
      },
      onUnavailable: () => {
        setMode('voice_unavailable');
        UI.toast('Voice mic unavailable â€” fallback to typing.', 'warn');
        setVoiceStatus('Voice unavailable â€” type below.');
      }
    });
    if (started) {
      S.listening = true;
      chatState.micBtn.classList.add('listening');
      setMode('listening');
      // Live waveform: best-effort; on failure just keep the idle bars.
      Voice.attachLevel((lvl) => {
        if (window.VoiceBus) VoiceBus.setLevel(lvl);
        const bars = chatState && chatState.wave ? chatState.wave.children : [];
        const boost = 6 + Math.round(lvl * 46);
        for (let i = 0; i < bars.length; i++) {
          const sway = Math.sin(i * 0.9 + performance.now() * 0.01) * 8;
          bars[i].style.height = Math.max(5, boost + sway) + 'px';
        }
      }).then((r) => {
        if (r && !r.ok && chatState) chatState.wave.classList.add('idle');
      });
    }
  }
};

let thatErrText = '';
/* ---- Live Agora voice session (production path) -------------------------
 * Tries a real agent session first. Returns the session on success, null when
 * the backend is not configured or the join fails â€” the caller then falls
 * back to the browser Web Speech path. Honest states only. */
async function startLiveSession() {
  const S = views.chat.state;
  if (S.live) return S.live.session || null;
  let r = null;
  try {
    setMode('requesting');
    setVoiceStatus('Connecting to voice AIâ€¦');
    r = await AgoraClient.startAgent();
  } catch (e) { r = null; }
  const sess = r && r.session;
  const usable = r && r.ok && sess && r.mode === 'production' && sess.status === 'active' && sess.rtc && sess.rtc.appId;
  if (!usable) {
    if (sess && sess.status === 'error' && sess.error) {
      setMode('error', sess.error.message || 'Voice agent error');
      UI.toast(sess.error.message || 'Voice agent error', 'bad');
      setTimeout(() => { if (views.chat.state.mode === 'error') setMode('idle'); }, 4000);
    } else {
      setMode('idle');
    }
    setVoiceStatus('');
    return null;
  }
  const j = await AgoraClient.joinVoiceSession(sess, (ev) => {
    if (ev.type === 'connecting') { setMode('requesting'); setVoiceStatus(ev.message); }
    else if (ev.type === 'connected') { setMode('listening'); setVoiceStatus('Listeningâ€¦ speak now.'); }
    else if (ev.type === 'ai_speaking') { setMode('speaking'); setVoiceStatus('Techo is speakingâ€¦'); }
    else if (ev.type === 'disconnected') { setMode('ended'); setVoiceStatus(''); }
  });
  if (!j.ok) {
    setMode('idle');
    setVoiceStatus('');
    try { await AgoraClient.endAgent({ consent: false, persist: false }); } catch (e) { /* ignore */ }
    return null;
  }
  S.live = { sessionId: sess.id, seen: (sess.transcript || []).length, poll: setInterval(pollLiveTranscript, 4000) };
  S.listening = true;
  if (chatState) chatState.micBtn.classList.add('listening');
  setMode('listening');
  UI.toast('Live voice connected â€” talk now.', 'good');
  return sess;
}

async function pollLiveTranscript() {
  const S = views.chat.state;
  if (!S.live) return;
  try {
    const r = await API.get('/api/agora/session/sync');
    const transcript = (r && r.transcript) || [];
    const fresh = transcript.slice(S.live.seen);
    if (fresh.length && chatState) {
      fresh.forEach((m) => {
        S.messages.push({ role: m.role === 'user' ? 'user' : 'assistant', text: m.text, at: m.at || new Date().toISOString(), live: true });
      });
      S.live.seen = transcript.length;
      renderLog();
    } else if (r.transcript) {
      S.live.seen = r.transcript.length;
    }
    const actions = (r && r.agentActions) || [];
    (S.live.seenActions = S.live.seenActions || {});
    actions.forEach((a) => {
      if (S.live.seenActions[a.id]) return;
      S.live.seenActions[a.id] = true;
      if (UI && UI.toast) UI.toast((a.ok ? '✓ ' : '⚠ ') + a.label, a.ok ? 'good' : 'warn');
      if (chatState && a.label) {
        S.messages.push({ role: 'system', text: '[Action] ' + a.label, at: new Date().toISOString(), live: true, action: a });
        renderLog();
      }
    });
  } catch (e) { /* transient: keep polling until mic off */ }
}

async function endLiveSession() {
  const S = views.chat.state;
  if (!S.live) return;
  if (S.live.poll) { clearInterval(S.live.poll); }
  S.live = null;
  try { await AgoraClient.endAgent({ consent: true, persist: true }); } catch (e) { /* ignore */ }
}
function setMode(cls, errText) {
  const S = views.chat.state;
  thatErrText = errText || '';
  S.mode = cls;
  // Publish honest state to the shared voice bus (drives Avatar Mode + persona strip)
  if (window.VoiceBus) window.VoiceBus.setState(cls === 'error' ? 'error' : cls);
  if (!chatState) return;
  const T = {
    idle: t('tap_to_speak'), listening: t('listening'), requesting: t('requesting_mic'),
    processing: t('processing'), speaking: t('speaking'), user_speaking: t('user_speaking'),
    langswitch: t('lang_switching'), paused: t('paused'), muted: t('voice_muted'),
    escalate: t('escalating'), human_connected: t('human_connected'), ended: t('conversation_ended'),
    mic_denied: t('mic_permission_denied'), voice_unavailable: t('voice_unavailable')
  };
  const labelT = { ...T };
  chatState.vstate.className = 'vstate s-' + cls;
  if (cls === 'error') chatState.vstate.lastChild.textContent = thatErrText || 'Error';
  else chatState.vstate.lastChild.textContent = T[cls] || '';
  // update the orb label (readable text for every voice state)
  const labelEl = chatState.micBtn && chatState.micBtn.closest('.avatar-orb-wrap')
    ? chatState.micBtn.closest('.avatar-orb-wrap').querySelector('.voice-orb-label') : null;
  if (labelEl) labelEl.textContent = cls === 'error' ? (thatErrText || 'Error') : (labelT[cls] || '');
  // reflect on the mic button
  chatState.micBtn.classList.toggle('listening', cls === 'listening' || cls === 'user_speaking' || cls === 'requesting');
  chatState.micBtn.classList.toggle('speaking', cls === 'speaking');
  chatState.micBtn.classList.toggle('error', cls === 'error' || cls === 'mic_denied' || cls === 'voice_unavailable');
  chatState.micBtn.classList.toggle('muted', cls === 'muted');
  chatState.micBtn.classList.toggle('paused', cls === 'paused');
  chatState.micBtn.classList.toggle('ended', cls === 'ended');
  if (cls === 'speaking') { chatState.wave.classList.remove('idle'); chatState.wave.classList.add('speaking'); }
  else if (cls === 'user_speaking' || cls === 'listening') { chatState.wave.classList.remove('idle'); chatState.wave.classList.remove('speaking'); }
  else { chatState.wave.classList.remove('speaking'); chatState.wave.classList.add('idle'); }
}

function toggleMute() {
  const S = views.chat.state;
  S.muted = !S.muted;
  if (S.muted) Voice.stopSpeaking();
  if (chatState && chatState.muteBtn) {
    chatState.muteBtn.textContent = S.muted ? 'ðŸ”‡' : 'ðŸ”Š';
    chatState.muteBtn.setAttribute('aria-pressed', String(!S.muted));
  }
  UI.toast(S.muted ? 'AI voice reply muted.' : 'AI voice reply unmuted.', 'good');
}

function stopAll() {
  endLiveSession();
  Voice.stopListening();
  Voice.stopSpeaking();
  Voice.detachLevel();
  views.chat.state.listening = false;
  setMode('idle');
}

let chatState = null; // bound context

// Pixel-human companion strip in the chat header. Renders the currently
// selected Avatar-Mode persona and mirrors the real voice state via VoiceBus.
function buildPersonaStrip() {
  const cv = document.createElement('canvas');
  cv.width = 96; cv.height = 96;
  cv.className = 'avatar-stage';
  cv.setAttribute('aria-hidden', 'true');
  const nameEl = h('div', { class: 'p-strip-name' }, (PixelAvatars.getSelected() || {}).name || '');
  const stateEl = h('div', { class: 'p-strip-state' }, PixelAvatars.label());
  const strip = h('div', { class: 'chat-header-persona card' }, [
    cv,
    h('div', { style: { flex: 1 } }, [nameEl, stateEl]),
    h('a', { class: 'small', href: '#/voice' }, 'Edit')
  ]);
  let t2 = 0;
  let raf = null;
  function tick() {
    t2++;
    const per = PixelAvatars.getSelected() || PixelAvatars.personas[0];
    const st = (window.VoiceBus && window.VoiceBus.state) || 'idle';
    const lvl = st === 'speaking'
      ? ((window.VoiceBus && window.VoiceBus.level) || 0.5)
      : (window.VoiceBus && window.VoiceBus.level) || 0;
    PixelAvatars.render(cv, per, t2, st, lvl);
    nameEl.textContent = per.name;
    stateEl.textContent = PixelAvatars.label(st);
    stateEl.style.color = PixelAvatars.color(st);
    raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);
  if (window.__personaStrip && window.__personaStrip.cancel) window.__personaStrip.cancel();
  window.__personaStrip = { cancel: () => cancelAnimationFrame(raf) };
  return strip;
}

// Consent-gated voice-note recording â†’ uploads audio to the backend local store.
let noteRec = { recording: false, blob: null };
async function recordNote(btn, status) {
  const S = views.chat.state;
  if (!noteRec.recording) {
    if (!consentOk('voiceNote')) {
      const granted = await askConsent('voiceNote', t('recording_consent'));
      if (!granted) { UI.toast('Recording not started â€” permission needed.', 'warn'); return; }
    }
    const res = await Voice.startRecording((blob) => {
      noteRec.blob = blob;
      noteRec.recording = false;
      btn.classList.remove('recording');
      btn.setAttribute('aria-pressed', 'false');
      btn.textContent = 'ðŸŽ¤â¬‡';
      uploadNote(blob, status);
    });
    if (!res.ok) {
      UI.toast(res.error === 'mic_unavailable' ? 'Microphone unavailable.' : 'Recorder unavailable.', 'bad');
      status.textContent = 'Could not start recording. Voice-mic fallback: type below.';
      return;
    }
    noteRec.recording = true;
    if (S.muted) { /* voice reply is off; recording is independent */ }
    btn.classList.add('recording');
    btn.setAttribute('aria-pressed', 'true');
    btn.textContent = 'âº';
    status.textContent = 'Recordingâ€¦ tap again to stop & save (local storage).';
    UI.toast('Recording voice noteâ€¦', 'info');
  } else {
    Voice.stopRecording();
  }
}

async function uploadNote(blob, status) {
  status.textContent = 'Saving recordingâ€¦';
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const base64 = String(reader.result).split(',')[1];
      const r = await API.post('/api/audio/upload', {
        consent: true,
        data: base64,
        ext: (blob.type || '').includes('mp4') ? 'm4a' : 'webm',
        mime: blob.type || 'audio/webm',
        note: '',
        kind: 'note'
      });
      status.textContent = 'âœ… Saved: ' + (r.recording.fileName || '') + ' (' + Math.round(r.fileSize / 1024) + ' KB local)';
      UI.toast('Voice note saved locally.', 'good');
    } catch (e) {
      status.textContent = 'Could not save: ' + e.message;
      UI.toast('Upload failed: ' + e.message, 'bad');
    }
  };
  reader.readAsDataURL(blob);
}

function init(view, ctx) {
  chatState = { ...ctx, view };
  // Inform the view of the real Agora connectivity (honest state).
  refreshLiveState();
}

async function refreshLiveState() {
  try {
    const s = Realtime.status || (await API.get('/api/agora/status'));
    const st = (s && s.status) || s || {};
    ViewState.connection = st.connection || 'not_configured';
    ViewState.liveAgentReady = st.connection === 'connected' && !!st.agentConfigured;
    ViewState.liveSession = st.agentConfigured ? { connection: st.connection, agentConfigured: !!st.agentConfigured } : null;
    if (chatState) {
      const badge = document.querySelector('.chat-lang-status .pill:last-child');
      if (badge) badge.textContent = ViewState.liveAgentReady
        ? 'ðŸŽ™ï¸ Live: Agora RTC agent'
        : 'ðŸŽ¤ STT: browser Web Speech';
      const note = chatState.noteEl;
      if (note) note.textContent = voiceProviderNote();
    }
  } catch (e) { ViewState.connection = 'not_configured'; }
}

function setVoiceStatus(txt) {
  if (chatState) chatState.voiceStatus.textContent = txt;
}

function voiceProviderNote() {
  const providers = (App.config && App.config.providers) || {};
  if (ViewState.liveAgentReady) {
    return 'ðŸŽ›ï¸ Mode: Agora RTC (low-latency real-time voice). ASR: ' + (providers.asr || {}).provider + ' Â· LLM: ' + (providers.llm || {}).provider + ' Â· TTS: ' + (providers.tts || {}).provider;
  }
  if (ViewState.connection === 'connected') {
    return 'ðŸŽ›ï¸ Agora connected but no agent configured yet (set AGORA_AGENT_ID / AGORA_PIPELINE_ID) â€” using browser Web Speech for now.';
  }
  return Voice.supportsSpeech
    ? 'ðŸŽ¤ Mode: browser Web Speech (Agora not connected) â€” use mic or type below.'
    : 'ðŸ“ Voice mic not available â€” typing works fine (clearly-marked fallback).';
}

async function loadConversation(view, el, log) {
  try {
    const data = await API.get('/api/chat/data');
    const conv = (data.conversations || []).find((c) => c.id === data.activeConversationId) ||
                 (data.conversations || [])[0];
    if (conv && conv.messages && conv.messages.length) {
      view.state.messages = conv.messages;
    }
  } catch (e) { /* ignore */ }
  renderLog();
}

function renderLog() {
  if (!chatState) return;
  const log = chatState.log;
  log.innerHTML = '';
  const msgs = views.chat.state.messages;
  if (!msgs.length) {
    log.appendChild(h('div', { class: 'empty' }, [
      h('div', { class: 'big' }, 'ðŸ—£ï¸'),
      h('p', {}, t('prompt'))
    ]));
    return;
  }
  msgs.forEach((m, i) => renderMessage(log, m, i === msgs.length - 1));
  log.scrollTop = log.scrollHeight;
}

function renderMessage(log, m, isLast) {
  const isUser = m.role === 'user';
  const bubble = h('div', { class: `bubble ${isUser ? 'user' : 'assistant'}` });

  const textEl = h('div', {}, m.text);
  bubble.appendChild(textEl);

  // Meta row
  const meta = h('div', { class: 'meta' });
  if (isUser && m.lang) {
    meta.appendChild(h('span', { class: 'pill' }, langBadge(m.lang)));
  }
  if (!isUser && m.lang && m.lang !== 'hing') {
    meta.appendChild(h('span', { class: 'tag neutral' }, langBadge(m.lang)));
  }
  // market confidence badge
  if (!isUser && m.meta && m.meta.market && m.meta.market.level) {
    meta.appendChild(UI.levelTag(m.meta.market.level).cloneNode(true));
  }
  bubble.appendChild(meta);

  // Action buttons on last assistant message
  if (!isUser && isLast) {
    // Optional talking-head avatar video for this reply (non-blocking layer).
    if (m.avatarVideo) bubble.appendChild(buildAvatarVideo(m.avatarVideo));
    const actions = renderReplyActions(m);
    if (m.meta && m.meta.market && m.meta.market.disclaimer) {
      bubble.appendChild(h('div', { class: 'small muted mt6', style: { fontSize: '.72rem' } }, 'âš ï¸ ' + m.meta.market.disclaimer));
    }
    if (actions.childElementCount) bubble.appendChild(actions);
    if (m.meta && m.meta.kind === 'escalated') {
      bubble.appendChild(h('button', { class: 'chip mt', onclick: () => Router.navigate('/support') }, 'ðŸ™‹ ' + t('cases')));
    }
  }

  log.appendChild(bubble);
  log.scrollTop = log.scrollHeight;
}

function langBadge(code) {
  if (typeof LangReg !== 'undefined') {
    const e = LangReg.get(code);
    if (e) return e.flag + ' ' + e.nativeName;
  }
  const map = { hi: 'ðŸ‡®ðŸ‡³ à¤¹à¤¿à¤¨à¥à¤¦à¥€', hing: 'ðŸ‡®ðŸ‡³ Hinglish', mr: 'ðŸ‡®ðŸ‡³ à¤®à¤°à¤¾à¤ à¥€', bn: 'ðŸ‡§ðŸ‡© à¦¬à¦¾à¦‚à¦²à¦¾', pa: 'ðŸ‡®ðŸ‡³ à¨ªà©°à¨œà¨¾à¨¬à©€', en: 'ðŸ‡¬ðŸ‡§ EN',
    te: 'ðŸ‡®ðŸ‡³ à°¤à±†à°²à±à°—à±', ta: 'ðŸ‡®ðŸ‡³ à®¤à®®à®¿à®´à¯', gu: 'ðŸ‡®ðŸ‡³ àª—à«àªœàª°àª¾àª¤à«€', kn: 'ðŸ‡®ðŸ‡³ à²•à²¨à³à²¨à²¡', ml: 'ðŸ‡®ðŸ‡³ à´®à´²à´¯à´¾à´³à´‚', or: 'ðŸ‡®ðŸ‡³ à¬“à¬¡à¬¼à¬¿à¬†',
    as: 'ðŸ‡®ðŸ‡³ à¦…à¦¸à¦®à§€à¦¯à¦¼à¦¾', ur: 'ðŸ‡µðŸ‡° Ø§Ø±Ø¯Ùˆ', bho: 'ðŸ‡®ðŸ‡³ à¤­à¥‹à¤œà¤ªà¥à¤°à¥€', mai: 'ðŸ‡®ðŸ‡³ à¤®à¥ˆà¤¥à¤¿à¤²à¥€', gom: 'ðŸ‡®ðŸ‡³ à¤•à¥‹à¤‚à¤•à¤£à¥€', ks: 'ðŸ‡®ðŸ‡³ à¤•à¤¶à¥à¤®à¥€à¤°à¥€' };
  return map[code] || code;
}

function renderReplyActions(m) {
  const wrap = h('div', { class: 'reply-actions' });
  const mk = m.meta && m.meta.kind;

  if (Voice.supportsTTS) {
    const play = h('button', { class: 'chip', onclick: () => {
      const v = App.voice || {};
      Voice.speak(m.text, { lang: m.lang || App.session.user.preferredLang, pitch: v.pitch, rate: v.rate });
    } }, 'ðŸ”Š Suno');
    wrap.appendChild(play);
    const stop = h('button', { class: 'chip', onclick: () => Voice.stopSpeaking() }, 'â¹');
    wrap.appendChild(stop);
  }

  if (mk === 'whatsapp-promo' || mk === 'promo' || mk === 'caption' || mk === 'follow-up') {
    const copy = h('button', { class: 'chip', onclick: async () => {
      try { await navigator.clipboard.writeText(m.text); UI.toast('Copied!'); }
      catch { UI.toast('Copy failed â€” text above.', 'warn'); }
    } }, 'ðŸ“‹ Copy');
    const wa = h('button', { class: 'chip', onclick: () => UI.toast('Opens WhatsApp share (demo) â€” copy instead.', 'warn') }, 'ðŸ’¬ WhatsApp');
    wrap.appendChild(copy); wrap.appendChild(wa);
  }

  if (mk === 'sale-recorded' || mk === 'expense-recorded' || mk === 'transaction') {
    const del = h('button', { class: 'chip', style: { color: 'var(--bad)' }, onclick: async () => {
      const ok = await UI.confirm('Delete this transaction?');
      if (ok) { UI.toast('Transaction removed (demo).', 'good'); }
    } }, 'ðŸ—‘ï¸');
    wrap.appendChild(del);
  }

  if (m.meta && m.meta.kind === 'escalated') {
    const go = h('button', { class: 'chip', onclick: () => Router.navigate('/support') }, 'ðŸ™‹ â†’ ' + t('cases'));
    wrap.appendChild(go);
  }

  return wrap;
}

/* ---- Optional talking-head avatar layer -------------------------------
 * Renders a HeyGen talking-head video of the AI reply. Fully optional and
 * NON-BLOCKING: if the provider is not configured or generation fails, the
 * voice conversation continues untouched. A subtle loading state is shown only
 * while a video is being generated. */
let talkingAvatar = null;   // { avatarId, name, voiceId } once loaded
let talkingAvatarCfg = false;

async function loadTalkingAvatar() {
  try {
    const r = await AvatarClient.list();
    talkingAvatarCfg = !!r.configured;
    talkingAvatar = (r && r.selected && r.selected.avatarId) ? r.selected : null;
  } catch (e) { talkingAvatarCfg = false; talkingAvatar = null; }
}

function isTalkingAvatarEnabled() {
  return talkingAvatarCfg === true && !!(talkingAvatar && talkingAvatar.avatarId);
}

function buildAvatarVideo(v) {
  const panel = h('div', { class: 'avatar-video-panel' });
  if (v.url) {
    panel.appendChild(h('video', { src: v.url, controls: true, preload: 'none', playsinline: 'true' }));
  } else {
    const load = h('div', { class: 'avatar-video-loading' }, [
      h('span', { class: 'spinner', 'aria-hidden': 'true' }),
      h('span', {}, v.error ? ('Avatar unavailable' + (v.error ? ': ' + v.error : '')) : 'Generating the avatar speakingâ€¦')
    ]);
    panel.appendChild(load);
  }
  if (talkingAvatar && talkingAvatar.name) {
    panel.appendChild(h('div', { class: 'av-note' }, 'ðŸ§‘â€ðŸ’¼ ' + talkingAvatar.name + ' Â· AI reply'));
  }
  return panel;
}

// Fire-and-forget: create the talking video for an assistant reply, poll until
// ready, then re-render the log with the video. Never blocks voice flow.
async function requestTalkingAvatar(assistantMsg) {
  if (!assistantMsg || !assistantMsg.text) return;
  if (!isTalkingAvatarEnabled()) return;
  const S = views.chat.state;
  const idx = S.messages.findIndex((m) => m === assistantMsg);
  if (idx === -1) return;

  // show a subtle loading state while the video is generated/renderVideoed
  assistantMsg.avatarVideo = { state: 'loading' };
  renderLog();

  const create = await AvatarClient.createTalk({
    text: assistantMsg.text,
    avatarId: talkingAvatar.avatarId,
    voiceId: talkingAvatar.voiceId || undefined
  });
  if (!create.ok || !create.videoId) {
    assistantMsg.avatarVideo = { url: null, error: (create.message || create.reason || 'Generation failed') };

    renderLog();
    return;
  }

  // Poll (bounded) until ready/failed.
  const deadline = Date.now() + 90000; // 90s max
  while (Date.now() < deadline) {
    await sleep(4000);
    const st = await AvatarClient.statusOf(create.videoId);
    if (st && st.status === 'ready' && st.url) {
      assistantMsg.avatarVideo = { url: st.url, state: 'ready' };

      renderLog();
      return;
    }
    if (st && (st.status === 'failed' || (st.reason))) {
      assistantMsg.avatarVideo = { url: null, error: st.reason || 'Generation failed' };

      renderLog();
      return;
    }
  }
  assistantMsg.avatarVideo = { url: null, error: 'Timed out' };

  renderLog();
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function sendText(text, mode = 'text', segLang = null) {
  const S = views.chat.state;
  // Guard: flush any stale pending confirmation from engine by always sending
  const userMsg = { role: 'user', text, at: new Date().toISOString() };
  S.messages.push({ ...userMsg, lang: null });

  // local language guess for badge (front-end optimistic); prefer ASR segment lang
  const guess = segLang ? { code: segLang } : guessLang(text);
  S.messages[S.messages.length - 1].lang = guess.code;

  // keep listening while the assistant is processing/speaking (hands-free flow)
  S.reading = true;
  setMode('processing');
  renderLog();

  const typing = h('div', { class: 'bubble assistant' }, [
    h('div', { class: 'skeleton', style: { width: '140px', height: '16px' } })
  ]);
  chatState.log.appendChild(typing);
  chatState.log.scrollTop = chatState.log.scrollHeight;

  let assistantMsg = null;
  try {
    const data = await API.post('/api/chat', { text, mode });
    // Remove optimistic user msg, replace with authoritative
    S.messages.pop();
    S.messages.push(data.userMessage);
    S.messages.push(data.assistantMessage);
    assistantMsg = data.assistantMessage;
    // Live-update profile/avatar if the engine learned something or lang changed
    if (assistantMsg.meta && assistantMsg.meta.kind === 'profile-learned') {
      await loadProfileCache();
    }
  } catch (e) {
    typing.remove();
    if (e.status === 401) { Router.navigate('/login'); return; }
    UI.toast('Error: ' + e.message, 'bad');
    setMode('error', 'Could not get a reply: ' + e.message);
    S.messages.pop();
  }
  S.reading = false;
  renderLog();

  // Optional talking-head avatar for this reply â€” non-blocking; voice continues
  requestTalkingAvatar(assistantMsg);

  // Auto-speak the AI reply unless muted / unsupported / no voice layer
  if (assistantMsg && !S.muted) {
    await speakReply(assistantMsg);
  }
  // If the user is still holding the mic open, return to listening state
  if (S.listening && S.mode !== 'speaking') setMode('listening');
}

let currentUtter = null;
function speakReply(assistantMsg) {
  return new Promise((resolve) => {
    const msg = assistantMsg;
    if (!msg || !msg.text || !Voice.supportsTTS) { resolve(); return; }
    const S = views.chat.state;
    if (S.muted) { resolve(); return; }
    setMode('speaking');
    const v = App.voice || {};
    const utterLang = msg.lang || App.session.user.preferredLang || 'hing';
    Voice.onSpeakEnd = () => { setMode('idle'); Voice.onSpeakEnd = null; resolve(); };
    Voice.speak(msg.text, { lang: utterLang, pitch: v.pitch, rate: v.rate });
    // safety timeout in case a browser never fires onend
    setTimeout(() => { if (chatState && chatState.vstate && /s-speaking/.test(chatState.vstate.className)) { setMode('idle'); Voice.onSpeakEnd = null; resolve(); } }, 30000);
  });
}

function guessLang(text) {
  if (typeof LangReg !== 'undefined') {
    const code = LangReg.guessLang(text);
    const entry = LangReg.get(code);
    return { code, name: entry ? entry.name : code };
  }
  const t = text.toLowerCase();
  if (/[\u0980-\u09FF]/.test(text)) return { code: 'bn', name: 'Bengali' };
  if (/[\u0A00-\u0A7F]/.test(text)) return { code: 'pa', name: 'Punjabi' };
  if (/[\u0900-\u097F]/.test(text)) {
    return /à¤†à¤¹à¥‡|à¤¨à¤¾à¤¹à¥€|à¤®à¤²à¤¾|à¤¹à¥‹à¤¯/.test(text) ? { code: 'mr', name: 'Marathi' } : { code: 'hi', name: 'Hindi' };
  }
  if (/(hai|bhai|kya|kar|paisa|samjhao|likh|batao|chahiye)/.test(t)) return { code: 'hing', name: 'Hinglish' };
  if (/(the|is|what|how|need|want|please|explain)/.test(t)) return { code: 'en', name: 'English' };
  return { code: 'hing', name: 'Hinglish' };
}

/* ---- consent helpers (shared) ---- */
function consentOk(key) {
  const c = App.session.user.consents || {};
  return c[key] === true;
}
function askConsent(key, message) {
  return new Promise((resolve) => {
    const m = UI.modal(`
      <h3>ðŸ”’ ${esc(message)}</h3>
      <p class="small muted">You can change or revoke this anytime in Settings â†’ Privacy.</p>
      <div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:8px;margin-top:14px">
        <button class="btn ghost sm" data-no>${t('no')}</button>
        <button class="btn good sm" data-yes>${t('yes')}</button>
      </div>`);
    m.el.querySelector('[data-yes]').addEventListener('click', async () => {
      const cur = App.session.user.consents || {};
      cur[key] = true;
      App.session.user.consents = cur;
      try { await API.put('/api/privacy/consents', { [key]: true }); } catch {}
      m.close(true);
    });
    m.el.querySelector('[data-no]').addEventListener('click', () => m.close(false));
    m.onClose((v) => resolve(v === true));
  });
}
window.consentOk = consentOk;
window.askConsent = askConsent;

async function loadVoiceCache() {
  try {
    const p = await API.get('/api/me/preferences');
    App.avatar = p.avatar;
    App.voice = p.voice;
  } catch (e) { /* ignore */ }
}
async function loadProfileCache() {
  try { const p = await API.get('/api/profile'); App.session.user.business = p.profile; } catch {}
}
