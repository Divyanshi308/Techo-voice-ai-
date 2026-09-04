/* avatar-mode.js — fullscreen "Avatar Mode" overlay.
 * Opens from the top bar switch. Shows the selected persona as a living pixel
 * human with an honest state chip (mirrors the real voice pipeline when a chat
 * session is active) and lets the user change persona (which also switches the
 * real catalog voice preference). Offline-safe, no external assets.
 */

(function () {
  'use strict';

  const STAGE_W = 300, STAGE_H = 300;

  let root = null;
  let stageCanvas = null;
  let raf = null;
  let t = 0;
  let micActive = false;
  let micStream = null;
  let audioCtx = null;
  let audioAnalyser = null;
  let audioData = null;

  function stateNow() {
    if (window.VoiceBus && window.VoiceBus.state) return window.VoiceBus.state;
    if (micActive) return 'listening';
    return 'idle';
  }

  function levelNow() {
    if (window.VoiceBus && typeof window.VoiceBus.level === 'number') return window.VoiceBus.level;
    if (micActive && audioAnalyser) {
      audioAnalyser.getByteTimeDomainData(audioData);
      let sum = 0;
      for (let i = 0; i < audioData.length; i++) {
        const v = (audioData[i] - 128) / 128;
        sum += v * v;
      }
      return Math.min(1, Math.sqrt(sum / audioData.length) * 3);
    }
    return 0;
  }

  function animate() {
    t++;
    const persona = PixelAvatars.getSelected();
    const st = stateNow();
    PixelAvatars.render(stageCanvas, persona, t, st, levelNow());
    const chip = root && root.querySelector('.am-state-chip');
    if (chip) {
      chip.textContent = PixelAvatars.label(st);
      chip.className = 'am-state-chip';
      chip.style.borderColor = PixelAvatars.color(st);
      chip.style.color = PixelAvatars.color(st);
    }
    raf = requestAnimationFrame(animate);
  }

  function buildCard(p) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'am-card';
    card.dataset.persona = p.id;
    const voice = PixelAvatars.voiceOf(p);
    card.appendChild(el('span', 'am-card-swatch', { background: p.color }));
    const body = el('span', 'am-card-body');
    body.appendChild(el('span', 'am-card-name', { textContent: p.name }));
    body.appendChild(el('span', 'am-card-role', { textContent: p.role }));
    body.appendChild(el('span', 'am-card-voice', { textContent: 'Voice: ' + voice.name + ' (' + voice.lang + ') · ' + voice.gender }));
    body.appendChild(el('span', 'am-card-greet', { textContent: p.personality }));
    card.appendChild(body);
    card.addEventListener('click', () => selectPersona(p.id));
    return card;
  }

  function renderPersonaList() {
    const listEl = root.querySelector('.am-personas');
    listEl.textContent = '';
    PixelAvatars.personas.forEach((p) => listEl.appendChild(buildCard(p)));
    markSelected();
  }

  function markSelected() {
    const p = PixelAvatars.getSelected();
    (root.querySelectorAll('.am-card')).forEach((c) => {
      c.classList.toggle('active', c.dataset.persona === p.id);
    });
    updateStageInfo();
  }

  function updateStageInfo() {
    const p = PixelAvatars.getSelected();
    const name = root.querySelector('.am-name');
    const role = root.querySelector('.am-role');
    const voice = root.querySelector('.am-voice');
    const hint = root.querySelector('.am-hint');
    if (name) name.textContent = p.name;
    if (role) role.textContent = p.role;
    if (voice) voice.textContent = 'Voice: ' + PixelAvatars.voiceOf(p).name + ' · ' + p.specialty;
    if (hint) hint.textContent = p.greeting;
  }

  async function selectPersona(id) {
    const p = PixelAvatars.select(id);
    if (!p) return;
    markSelected();
    try {
      if (window.API && window.API.put) {
        await API.put('/api/me/preferences', { voiceId: p.voiceId });
      }
    } catch (e) { /* best effort */ }
    if (window.VoiceBus && window.VoiceBus.onPersona) window.VoiceBus.onPersona(p);
    flash('Voice' + (p ? ' set to ' + PixelAvatars.voiceOf(p).name : ''));
  }

  async function toggleMic() {
    const btn = root.querySelector('.am-mic');
    if (micActive) {
      stopMic();
      btn.textContent = 'Talk';
      return;
    }
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      flash('Microphone unavailable');
      PixelAvatars.setState(window.VoiceBus && window.VoiceBus.state ? window.VoiceBus.state : 'idle');
      return;
    }
    micActive = true;
    btn.textContent = 'Stop';
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const src = audioCtx.createMediaStreamSource(micStream);
      audioAnalyser = audioCtx.createAnalyser();
      audioAnalyser.fftSize = 256;
      src.connect(audioAnalyser);
      audioData = new Uint8Array(audioAnalyser.fftSize);
    } catch (e) { /* fallback: listen without meter */ }
    if (window.VoiceBus && window.VoiceBus.micOn) window.VoiceBus.micOn();
    else PixelAvatars.setState('listening');
  }

  function stopMic() {
    micActive = false;
    if (micStream) { micStream.getTracks().forEach((tr) => tr.stop()); micStream = null; }
    if (audioCtx) { audioCtx.close().catch(function () {}); audioCtx = null; }
    audioAnalyser = null; audioData = null;
    if (window.VoiceBus && window.VoiceBus.micOff) window.VoiceBus.micOff();
  }

  function flash(msg) {
    const el2 = root.querySelector('.am-flash');
    if (!el2) return;
    el2.textContent = msg;
    el2.classList.add('show');
    clearTimeout(flash._t);
    flash._t = setTimeout(function () { el2.classList.remove('show'); }, 1600);
  }

  function el(tag, cls, opts) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (opts) {
      if (opts.textContent !== undefined) n.textContent = opts.textContent;
      if (opts.background) n.style.background = opts.background;
    }
    return n;
  }

  function open() {
    if (root) { root.classList.add('open'); return; }
    root = el('div', 'avatar-mode');
    root.setAttribute('aria-hidden', 'false');
    root.appendChild(el('div', 'am-backdrop'));

    const panel = el('div', 'am-panel');
    root.appendChild(panel);

    const head = el('div', 'am-head');
    head.appendChild(el('div', 'am-title', { textContent: 'Avatar Mode' }));
    head.appendChild(el('div', 'am-sub', { textContent: 'Your business companion — always ready to help' }));
    const closeBtn = el('button', 'am-close');
    closeBtn.type = 'button';
    closeBtn.textContent = '×';
    closeBtn.setAttribute('aria-label', 'Close avatar mode');
    closeBtn.addEventListener('click', close);
    head.appendChild(closeBtn);
    panel.appendChild(head);

    const stageWrap = el('div', 'am-stage-wrap');
    stageCanvas = document.createElement('canvas');
    stageCanvas.width = STAGE_W; stageCanvas.height = STAGE_H;
    stageCanvas.className = 'am-stage';
    stageWrap.appendChild(stageCanvas);
    stageWrap.appendChild(el('div', 'am-state-chip', { textContent: 'Ready to listen' }));
    panel.appendChild(stageWrap);

    const info = el('div', 'am-info');
    const p0 = PixelAvatars.getSelected();
    info.appendChild(el('div', 'am-name', { textContent: p0.name }));
    info.appendChild(el('div', 'am-role', { textContent: p0.role }));
    info.appendChild(el('div', 'am-voice', { textContent: 'Voice: ' + PixelAvatars.voiceOf(p0).name }));
    info.appendChild(el('div', 'am-hint', { textContent: p0.greeting }));
    panel.appendChild(info);

    const micBtn = el('button', 'am-mic btn-primary');
    micBtn.type = 'button';
    micBtn.textContent = 'Talk';
    micBtn.addEventListener('click', toggleMic);
    panel.appendChild(micBtn);

    const picker = el('div', 'am-picker');
    picker.appendChild(el('div', 'am-picker-title', { textContent: 'Choose your companion' }));
    picker.appendChild(el('div', 'am-personas'));
    panel.appendChild(picker);

    panel.appendChild(el('div', 'am-flash'));

    renderPersonaList();
    PixelAvatars.on(() => { if (root) markSelected(); });
    // update the chip instantly on real voice-state changes, even if the tab
    // is throttled or rAF is paused (honest state, not animation-dependent)
    if (window.VoiceBus && window.VoiceBus.on) {
      window._amBusOff = window.VoiceBus.on(() => {
        if (!root) return;
        const st = stateNow();
        const chip = root.querySelector('.am-state-chip');
        if (chip) {
          chip.textContent = PixelAvatars.label(st);
          chip.style.borderColor = PixelAvatars.color(st);
          chip.style.color = PixelAvatars.color(st);
        }
      });
    }
    document.body.appendChild(root);
    requestAnimationFrame(() => root.classList.add('open'));
    if (!raf) raf = requestAnimationFrame(animate);
  }

  function close() {
    if (!root) return;
    stopMic();
    if (window._amBusOff) { try { window._amBusOff(); } catch (e) { /* ignore */ } window._amBusOff = null; }
    root.classList.remove('open');
    setTimeout(function () {
      if (root) { root.remove(); root = null; }
      if (raf) { cancelAnimationFrame(raf); raf = null; }
    }, 240);
  }

  window.AvatarMode = { open, close };
})();