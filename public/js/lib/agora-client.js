/* agora-client.js — browser adapter for Agora Conversational AI agent.
 *
 * The browser NEVER holds Agora secrets. Every capability here goes through
 * the secure backend (/api/agora/*). Tokens are short-lived and channel-scoped
 * and are fetched fresh from the server on demand.
 *
 * REAL vs MOCK:
 *   - A REAL Agora voice session (join channel + pull the agent's audio) is
 *     only attempted when the backend reports it is actually CONNECTED (real
 *     credentials configured AND an agent session with an agent_id exists).
 *   - Otherwise the app uses the clearly-marked browser Web Speech path and
 *     the dashboard shows honest "Mock / Not configured" states. We never
 *     fabricate a "Connected" status or a fake waveform.
 */

const AGORA_SDK_URL = 'https://download.agora.io/sdk/release/AgoraRTC_N-4.23.1.js';

const AgoraClient = {
  status: null,          // cached /api/agora/status payload
  liveSession: null,     // current session { id, channel, mode, agent_id, rtc }
  rtc: null,             // AgoraRTC client when in a real session
  localAudio: null,
  remoteTracks: [],
  listeners: new Set(),
  aiSpeaking: false,     // last known agent audio state
  _sdkPromise: null,

  /* Lazy-load the AgoraRTC Web SDK on demand (~1MB). Loading only happens when
   * a real session is about to start; everyone else never pays the cost. */
  loadSDK() {
    if (window.AgoraRTC) return Promise.resolve(window.AgoraRTC);
    if (AgoraClient._sdkPromise) return AgoraClient._sdkPromise;
    AgoraClient._sdkPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = AGORA_SDK_URL;
      s.async = true;
      s.onload = () => resolve(window.AgoraRTC);
      s.onerror = () => { AgoraClient._sdkPromise = null; reject(new Error('Failed to load AgoraRTC SDK')); };
      document.head.appendChild(s);
    });
    return AgoraClient._sdkPromise;
  },

  async refresh() {
    try {
      AgoraClient.status = await API.get('/api/agora/status');
    } catch (e) {
      AgoraClient.status = null;
    }
    return AgoraClient.status;
  },

  on(fn) { AgoraClient.listeners.add(fn); return () => AgoraClient.listeners.delete(fn); },
  _emit(name, data) { AgoraClient.listeners.forEach((fn) => { try { fn(name, data); } catch {} }); },

  configFromStatus() {
    const st = AgoraClient.status || {};
    const s = st.status || {};
    return {
      connection: s.connection || 'not_configured',
      env: s.env || 'dev',
      mock: !!s.mocked,
      connected: s.connection === 'connected',
      appId: s.appId || '',
      agentId: s.agentId || '',
      labels: s.labels || { connection: 'Not configured' }
    };
  },

  /* ---- Agent lifecycle (backend-tracked, mock-aware) ---- */
  async startAgent(opts = {}) {
    const r = await API.post('/api/agora/session/start', { channel: opts.channel });
    AgoraClient.liveSession = r.session;
    AgoraClient._emit('agent', { action: 'start', session: r.session, mode: r.mode, ok: r.ok });
    return r;
  },

  async sendTurn(text, lang) {
    const r = await API.post('/api/agora/agent/turn', { text, lang: lang || '' });
    return r;
  },

  async endAgent(opts = {}) {
    if (!AgoraClient.liveSession) return { ok: true, session: null };
    const r = await API.post('/api/agora/session/stop', {
      consent: opts.consent === true,
      persist: opts.persist !== false
    });
    if (AgoraClient.rtc) { await AgoraClient.leaveRTC(); }
    AgoraClient.liveSession = null;
    AgoraClient._emit('agent', { action: 'end', session: r.session });
    return r;
  },

  /* ---- Secure token fetch (server-side secrets only) ---- */
  async getToken(kind = 'rtc', channel) {
    const r = await API.post('/api/agora/token', { kind, channel });
    if (!r.available) throw new Error(r.note || 'Token unavailable');
    return r;
  },

  /* ---- Human-agent escalation ---- */
  async escalate(opts = {}) {
    const r = await API.post('/api/agora/transfer', {
      topic: opts.topic, reason: opts.reason, consent: opts.consent !== false, sessionId: opts.sessionId
    });
    return r;
  },

  /* ---- Connection self-test ---- */
  async connectionTest() {
    return API.get('/api/agora/connection-test');
  },

  async health() {
    return API.get('/api/agora/health');
  },

  /* ---- REAL Agora RTC voice session ----
   * Only fires when there is a live agent session with real connection info.
   * Joins the RTC channel, publishes the local microphone, and subscribes to
   * the AI agent's remote audio. Returns honest state; never fakes.
   */
  async joinVoiceSession(session, onEvent) {
    if (!session || !session.rtc || !session.rtc.appId) {
      return { ok: false, mode: 'mock', note: 'No live Agora agent session — staying in mock/browser mode.' };
    }
    try { await AgoraClient.loadSDK(); } catch (e) {
      return { ok: false, mode: 'unavailable', note: e.message };
    }
    if (!(window.AgoraRTC && window.AgoraRTC.createClient)) {
      return { ok: false, mode: 'unavailable', note: 'AgoraRTC SDK failed to initialise.' };
    }
    try {
      const RTC = window.AgoraRTC;
      const tok = await AgoraClient.getToken('rtc', session.rtc.channel);
      if (!tok.available) throw new Error(tok.note || 'Token unavailable');
      if (onEvent) onEvent({ type: 'connecting', message: 'Connecting to Agora voice channel…' });

      // Unlock audio output inside the user-gesture context so the AI's voice
      // is never blocked by autoplay policies (best-effort, no-op if not needed).
      AgoraClient.unlockAudio();

      const client = RTC.createClient({ mode: 'rtc', codec: 'vp8' });
      await client.join(tok.appId, tok.channel, tok.token, Number(tok.uid) || undefined);
      if (onEvent) onEvent({ type: 'connected', message: 'Connected to Agora channel.' });

      const local = await RTC.createMicrophoneAudioTrack();
      await client.publish([local]);

      const playRemote = (track) => {
        // play() may need a retry while the browser finishes wiring the device.
        return new Promise((resolve) => {
          const attempt = (n) => {
            if (!track) return resolve();
            try { track.setVolume(1); track.play(); resolve(); }
            catch (e) { if (n < 3) setTimeout(() => attempt(n + 1), 400); else resolve(); }
          };
          attempt(0);
        });
      };
      const handleTrack = async (user, mediaType) => {
        try { await client.subscribe(user, mediaType); } catch {}
        if (mediaType === 'audio' && user.audioTrack) {
          user.audioTrack.on('track-ended', () => AgoraClient.aiSpeaking = false);
          await playRemote(user.audioTrack);
          AgoraClient.remoteTracks.push(user.audioTrack);
          AgoraClient.aiSpeaking = true;
          if (onEvent) onEvent({ type: 'ai_speaking', message: '🔊 AI agent voice connected (Agora).' });
        }
      };
      client.on('user-published', handleTrack);
      client.on('user-unpublished', (user, mediaType) => {
        if (mediaType === 'audio' && user.audioTrack) {
          const i = AgoraClient.remoteTracks.indexOf(user.audioTrack);
          if (i > -1) AgoraClient.remoteTracks.splice(i, 1);
        }
      });
      client.on('connection-state-change', (cur) => {
        if (onEvent && cur === 'DISCONNECTED') onEvent({ type: 'disconnected', message: 'Disconnected from Agora.' });
      });
      client.on('user-joined', (u) => {
        if (onEvent) onEvent({ type: 'agent_joined', uid: u.uid });
      });

      AgoraClient.rtc = client;
      AgoraClient.localAudio = local;
      return { ok: true, mode: 'agora', client, local };
    } catch (e) {
      AgoraClient.leaveRTC();
      return { ok: false, mode: 'mock', note: e.message };
    }
  },

  async leaveRTC() {
    AgoraClient.aiSpeaking = false;
    if (AgoraClient.localAudio) { try { AgoraClient.localAudio.close(); } catch {} }
    AgoraClient.remoteTracks.forEach((t) => { try { t.stop(); } catch {} });
    AgoraClient.remoteTracks = [];
    if (AgoraClient.rtc) { try { await AgoraClient.rtc.leave(); } catch {} }
    AgoraClient.rtc = null;
    AgoraClient.localAudio = null;
  },

  /* Best-effort audio unlock so the AI's spoken reply is never autoplay-blocked. */
  unlockAudio() {
    try {
      if (!window.__vvAudioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) window.__vvAudioCtx = new AC();
      }
      const ctx = window.__vvAudioCtx;
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
      if (ctx && ctx.state === 'running') ctx.resume().catch(() => {});
    } catch (e) { /* non-fatal */ }
  }
};

window.AgoraClient = AgoraClient;
