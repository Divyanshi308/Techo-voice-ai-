'use strict';

/**
 * realtime.js — Agora RTC integration + pluggable real-time voice pipeline.
 *
 * Architecture
 * ------------
 * A real-time voice session flows through independently connected providers:
 *
 *   [ user audio ] ──► Agora RTC (low-latency audio transport)
 *                              │
 *                              ▼
 *   [ ASR provider ]  text        (Deepgram / browser speech)
 *   [ LLM provider ]  reply text  (OpenAI / local engine)
 *   [ TTS provider ]  audio       (ElevenLabs / device synthesis)
 *   [ Human-agent  ]  escalation  (expert directory / Zendesk)
 *
 * Each stage is wired through providerRegistry.js so any capability can be
 * swapped without touching the others. Agora is only the audio transport and
 * never stores transcripts. When Agora is not configured, the client uses a
 * browser Web Speech fallback — the rest of the pipeline is unchanged.
 *
 * Token generation
 * ----------------
 * Agora RTC tokens are issued with the vendor's official @agora-io/rtc-token
 * library when available, otherwise the endpoint reports that a token cannot
 * be minted (never produces an invalid hand-rolled token).
 */

const crypto = require('crypto');
const registry = require('./providerRegistry');

let RtcTokenBuilder = null;
let RtcRole = null;
try {
  ({ RtcTokenBuilder, RtcRole } = require('agora-access-token'));
} catch {
  // Optional dependency — only needed when AGORA_APP_ID + cert are configured.
  RtcTokenBuilder = null;
}

const cfg = () => registry.get('realtime');

const issueToken = (channelName, uid = 0) => {
  const realtimeCfg = cfg();
  if (!realtimeCfg.agoraAppId) {
    return {
      available: false,
      note: 'Agora RTC not configured (AGORA_APP_ID unset). Using browser Web Speech fallback for real-time voice.',
      fallback: 'browser-webspeech'
    };
  }
  if (!RtcTokenBuilder) {
    return {
      available: false,
      note: 'Agora RTC configured (AGORA_APP_ID set) but the official "agora-access-token" package is not installed. Install it to mint secure tokens.',
      fallback: 'browser-webspeech'
    };
  }
  const channel = channelName || `vv-${crypto.randomBytes(4).toString('hex')}`;
  const expiry = 3600;
  const uidInt = Math.floor(uid) || 0;
  const token = RtcTokenBuilder.buildTokenWithUid(
    realtimeCfg.agoraAppId, realtimeCfg.agoraCert, channel, uidInt, RtcRole.PUBLISHER, expiry
  );
  return { available: true, token, channel, uid: uidInt, appId: realtimeCfg.agoraAppId, fallback: 'agora' };
};

const pipelineStatus = () => ({
  realtime: registry.get('realtime'),
  asr: registry.get('asr'),
  tts: registry.get('tts'),
  llm: registry.get('llm'),
  telephony: registry.get('telephony'),
  avatar: registry.get('avatar'),
  humanAgent: registry.get('humanAgent'),
  fullRegistry: registry.registry()
});

module.exports = { issueToken, pipelineStatus };
