/* voice.js — Web Speech (STT/TTS) with a clearly-marked mock fallback. */

const Voice = (() => {
  const supportsSpeech = typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
  const supportsTTS = typeof window !== 'undefined' && 'speechSynthesis' in window;

  let recognizer = null;
  let listening = false;
  let onResult = null;
  let onEnd = null;
  let onInterim = null;
  let langCode = 'hi-IN';

  // Browser voices cache (for TTS selection & preview)
  let browserVoices = [];

  function loadVoices() {
    if (!supportsTTS) return;
    browserVoices = window.speechSynthesis.getVoices() || [];
    window.speechSynthesis.onvoiceschanged = () => {
      browserVoices = window.speechSynthesis.getVoices() || [];
      if (Voice.onVoicesChanged) Voice.onVoicesChanged(browserVoices);
    };
    if (Voice.onVoicesChanged && browserVoices.length) Voice.onVoicesChanged(browserVoices);
    return browserVoices;
  }

  function pickVoice(lang, gender) {
    const want = lang.replace('_', '-');
    const candidates = browserVoices.filter((v) => v.lang && v.lang.toLowerCase().startsWith(want.toLowerCase()));
    if (candidates.length) {
      if (gender && gender !== 'neutral') {
        const byGender = candidates.filter((v) => (v.name || '').toLowerCase().includes(gender));
        if (byGender.length) return byGender[0];
      }
      return candidates[0];
    }
    // fallback: any Indian voice, then any voice
    const indian = browserVoices.filter((v) => /in|hi|mr|bn|pa|te|ta|gu|kn|ml|or|as|ur/i.test(v.lang || ''));
    return indian[0] || browserVoices[0] || null;
  }

  // ---- Speech-to-Text ------------------------------------------------------
  // Continuous, code-switching-aware listening. Because the browser Web Speech
  // API can only recognize one locale per instance, we run a shared recognizer
  // that accepts interim results and emits final utterances with a best-effort
  // language guess (multi-script regex). Mid-sentence language switching is
  // handled by the client re-guessing each final segment and by the LLM
  // replying in the user's preferred language. A real ASR (Deepgram) behind
  // the provider layer supports true code-switching.
  let continuous = false;
  let restarting = false;

  const SCRIPT_GROUPS = [
    { name: 'as', test: (t) => /[\u0980-\u09FF]/.test(t) && /মোৰ|বিক্রি|হ’ল|অসমীয়া|আপোনাৰ/.test(t) },
    { name: 'bn', test: (t) => /[\u0980-\u09FF]/.test(t) },
    { name: 'pa', test: (t) => /[\u0A00-\u0A7F]/.test(t) },
    { name: 'gu', test: (t) => /[\u0A80-\u0AFF]/.test(t) },
    { name: 'or', test: (t) => /[\u0B00-\u0B7F]/.test(t) },
    { name: 'ta', test: (t) => /[\u0B80-\u0BFF]/.test(t) },
    { name: 'te', test: (t) => /[\u0C00-\u0C7F]/.test(t) },
    { name: 'kn', test: (t) => /[\u0C80-\u0CFF]/.test(t) },
    { name: 'ml', test: (t) => /[\u0D00-\u0D7F]/.test(t) },
    { name: 'ur', test: (t) => /[\u0600-\u06FF]/.test(t) },
    { name: 'mr', test: (t) => /[\u0900-\u097F]/.test(t) && /(आहे|नाही|मला|होय|करतो|करते|आमच्या|दुकानात)/.test(t) },
    { name: 'bho', test: (t) => /[\u0900-\u097F]/.test(t) && /(बताईं|रउआ|भोजपुरी|हई|चाहीं)/.test(t) },
    { name: 'mai', test: (t) => /[\u0900-\u097F]/.test(t) && /(मैथिली|अछि|अहां|सहायता)/.test(t) },
    { name: 'gom', test: (t) => /[\u0900-\u097F]/.test(t) && /(आमच्या|जाली|कोंकणी|आसा|कसो|सगोल)/.test(t) },
    { name: 'ks', test: (t) => /[\u0900-\u097F]/.test(t) && /(कश्मीरी|छुस|चुह)/.test(t) },
    { name: 'hi', test: (t) => /[\u0900-\u097F]/.test(t) },
    { name: 'hing', test: (t) => /(hai|bhai|kya|kar|paisa|samjhao|likh|batao|chahiye|kyu|kaise|nahi|ho|raha)/i.test(t) },
    { name: 'en', test: () => true }
  ];
  function guessSegmentLang(text) {
    for (const g of SCRIPT_GROUPS) { if (g.test(text)) return g.name; }
    return 'hing';
  }

  function startListening(opts = {}) {
    if (!supportsSpeech) {
      // Clearly-marked mock fallback: no real mic.
      if (opts.onUnavailable) opts.onUnavailable();
      return false;
    }
    stopListening();
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognizer = new SR();
    // Best default for the Indian subcontinent; final segments are re-guessed.
    const start = opts.lang || langCode;
    recognizer.lang = (start === 'hing' || start === 'hi') ? 'hi-IN' : start.replace('_', '-');
    // Continuous so users can switch languages mid-sentence without re-tapping.
    recognizer.continuous = !!opts.continuous;
    continuous = !!opts.continuous;
    recognizer.interimResults = true;
    onResult = opts.onResult || null;
    onEnd = opts.onEnd || null;
    onInterim = opts.onInterim || null;
    listening = true;
    restarting = false;

    recognizer.onresult = (event) => {
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          const seg = event.results[i][0].transcript;
          const segLang = guessSegmentLang(seg);
          if (onResult) onResult(seg, segLang);
        } else if (event.results[i][0] && onInterim) {
          onInterim(event.results[i][0].transcript);
        }
      }
    };
    recognizer.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        listening = false;
        restarting = false;
        if (onEnd) onEnd({ error: event.error, code: 'permission' });
      } else if (event.error === 'no-speech' && continuous) {
        // Keep listening — user may still be thinking.
      } else {
        listening = false;
        restarting = false;
        if (onEnd) onEnd({ error: event.error });
      }
    };
    recognizer.onend = () => {
      // Auto-restart so a short pause doesn't end the session — the user can
      // keep talking naturally and switch languages without re-tapping.
      if (listening && continuous && !restarting) {
        restarting = true;
        try { recognizer.start(); }
        catch (e) { restarting = false; listening = false; if (onEnd) onEnd({}); }
        finally { setTimeout(() => { restarting = false; }, 300); }
      } else {
        listening = false;
        if (onEnd) onEnd({});
      }
    };
    try { recognizer.start(); } catch (e) { listening = false; restarting = false; return false; }
    return true;
  }

  function stopListening() {
    continuous = false;
    if (recognizer) {
      try { recognizer.stop(); } catch (e) { /* noop */ }
      recognizer = null;
    }
    listening = false;
  }

  function isListening() { return listening; }

  // ---- Text-to-Speech --------------------------------------------------------
  function speak(text, opts = {}) {
    if (!supportsTTS) return false;
    const utter = new SpeechSynthesisUtterance(text);
    const lang = opts.lang || 'hing';
    const map = {
      hing: 'hi-IN', hi: 'hi-IN', mr: 'mr-IN', bn: 'bn-IN', pa: 'pa-IN', en: 'en-IN',
      te: 'te-IN', ta: 'ta-IN', gu: 'gu-IN', kn: 'kn-IN', ml: 'ml-IN', or: 'or-IN',
      as: 'as-IN', ur: 'ur-IN', bho: 'hi-IN', mai: 'hi-IN', gom: 'mr-IN', ks: 'hi-IN'
    };
    utter.lang = map[lang] || 'hi-IN';
    if (opts.voice) utter.voice = opts.voice;
    if (typeof opts.pitch === 'number') utter.pitch = opts.pitch;
    if (typeof opts.rate === 'number') utter.rate = opts.rate;
    utter.onend = () => { if (Voice.onSpeakEnd) Voice.onSpeakEnd(); };
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
    return true;
  }

  function stopSpeaking() {
    if (supportsTTS) window.speechSynthesis.cancel();
  }

  // Preview a language's default TTS voice with a sample sentence
  function previewVoice(lang, sampleText) {
    if (!supportsTTS) return;
    const entry = typeof LangReg !== 'undefined' && LangReg.get(lang) ? LangReg.get(lang) : null;
    const fallbackText = entry ? entry.sample : 'Hello! This is a voice preview.';
    stopSpeaking();
    speak(sampleText || fallbackText, { lang: lang });
  }

  // ---- Media recorder for optional voice-note capture (consent-gated in UI) --
  let recorder = null;
  let chunks = [];
  let stream = null;
  async function startRecording(onBlob) {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      return { ok: false, error: 'mic_unavailable' };
    }
    try {
      recorder = new MediaRecorder(stream);
    } catch (e) {
      stream.getTracks().forEach((t) => t.stop());
      return { ok: false, error: 'recorder_unavailable' };
    }
    chunks = [];
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
      stream.getTracks().forEach((t) => t.stop());
      if (onBlob) onBlob(blob);
    };
    recorder.start();
    return { ok: true };
  }
  function stopRecording() {
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  }

  // ---- Audio level analyzer (drives the live waveform visualizer) ---------
  let audioCtx = null;
  let analyser = null;
  let levelRaF = null;
  let levelCb = null;

  // Call once while the user is speaking to start reading mic levels. Uses an
  // AudioContext + AnalyserNode; completely separate from STT and Agora.
  async function attachLevel(onLevel) {
    if (levelCb === onLevel && levelRaF) return;
    levelCb = onLevel;
    try {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtx.state === 'suspended') await audioCtx.resume();
      let stream;
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
      catch (e) { return { ok: false, error: 'mic_unavailable' }; }
      const src = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const read = () => {
        if (!analyser) return;
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        const level = sum / data.length / 255;
        if (levelCb) levelCb(level);
        levelRaF = requestAnimationFrame(read);
      };
      read();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: 'audio_error' };
    }
  }

  function detachLevel() {
    if (levelRaF) { cancelAnimationFrame(levelRaF); levelRaF = null; }
    if (audioCtx && audioCtx.state === 'running') { audioCtx.close().catch(() => {}); }
    audioCtx = null; analyser = null; levelCb = null;
  }

  return {
    supportsSpeech, supportsTTS,
    startListening, stopListening, isListening, onVoicesChanged: null, onSpeakEnd: null,
    speak, stopSpeaking, loadVoices, pickVoice, previewVoice, getVoices: () => browserVoices,
    startRecording, stopRecording,
    attachLevel, detachLevel, guessSegmentLang
  };
})();

window.Voice = Voice;
