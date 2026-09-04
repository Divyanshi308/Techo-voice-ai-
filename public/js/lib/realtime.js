/* realtime.js — optional Agora RTC low-latency voice client.
   If Agora SDK is loaded (window.AgoraRTC) and the server returns a token,
   it opens a realtime voice channel. Otherwise falls back to the browser
   Web Speech path (Voice). The LLM/ASR/TTS provider wiring stays identical. */

const Realtime = {
  mode: null,      // 'agora' | 'browser'
  rtc: null,
  localAudio: null,
  remoteAudios: [],
  channel: null,
  statusListener: null,

  async init() {
    // Decide mode from the *real* backend connection state (never fake).
    const cfg = App.config || {};
    const providers = cfg.providers || {};
    const rt = providers.realtime || {};
    // Prefer the authoritative /api/agora/status when reachable.
    let liveConnected = rt.provider === 'agora';
    let status = null;
    try {
      status = await API.get('/api/agora/status');
      const st = status && status.status;
      if (st && st.connection === 'connected' && st.agentConfigured) {
        liveConnected = true;
      }
    } catch (e) { /* status unavailable: keep provider config */ }
    Realtime.status = status ? (status.status || null) : null;
    App.realtimeMode = (liveConnected && window.AgoraRTC) ? 'agora' : 'browser';
    Realtime.mode = App.realtimeMode;
    return Realtime.mode;
  },

  async join(onRemoteText) {
    await this.init();
    if (Realtime.mode !== 'agora') {
      return { ok: true, mode: 'browser' };
    }
    try {
      const tok = await API.post('/api/agora/token', { kind: 'rtc', channel: undefined });
      if (!tok.available || !tok.token) {
        App.realtimeMode = 'browser';
        Realtime.mode = 'browser';
        return { ok: true, mode: 'browser', note: tok.note };
      }
      const { RTC } = window.AgoraRTC;
      Realtime.rtc = RTC.createClient({ mode: 'rtc', codec: 'vp8' });
      Realtime.channel = tok.channel;
      await Realtime.rtc.join(tok.appId, tok.channel, tok.token, tok.uid);
      Realtime.localAudio = await RTC.createMicrophoneAudioTrack();
      await Realtime.rtc.publish([Realtime.localAudio]);
      Realtime.rtc.on('user-published', async (user, mediaType) => {
        await Realtime.rtc.subscribe(user, mediaType);
        if (mediaType === 'audio') {
          user.audioTrack && user.audioTrack.play();
          Realtime.remoteAudios.push(user);
          if (onRemoteText) onRemoteText('🔊 Live remote audio connected (Agora).');
        }
      });
      return { ok: true, mode: 'agora', channel: tok.channel };
    } catch (e) {
      console.error('[realtime] agora join failed, falling back:', e.message);
      App.realtimeMode = 'browser';
      Realtime.mode = 'browser';
      return { ok: true, mode: 'browser', note: 'Agora failed: ' + e.message };
    }
  },

  async leave() {
    if (Realtime.rtc) {
      try {
        if (Realtime.localAudio) { Realtime.localAudio.close(); }
        Realtime.remoteAudios.forEach((u) => { try { u.audioTrack && u.audioTrack.stop(); } catch {} });
        await Realtime.rtc.leave();
      } catch {}
      Realtime.rtc = null;
      Realtime.localAudio = null;
      Realtime.remoteAudios = [];
      Realtime.channel = null;
    }
  }
};

window.Realtime = Realtime;
