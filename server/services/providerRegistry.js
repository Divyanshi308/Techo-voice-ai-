'use strict';

/**
 * providerRegistry.js — pluggable external services.
 *
 * Each capability (speech-to-text, text-to-speech, LLM, telephony, avatar,
 * human-agent, realtime RTC) is a separate, independently configurable
 * provider. When the required credentials are absent the app falls back to a
 * clearly-marked built-in mock/simulated provider, so the product remains
 * fully usable and demoable while remaining API-ready for production.
 *
 * Configure via environment variables (see README "Provider configuration").
 */

const PROFILE = {
  realtime: {
    // Agora RTC for low-latency real-time voice
    provider: process.env.AGORA_APP_ID ? 'agora' : 'browser-webspeech',
    agoraAppId: process.env.AGORA_APP_ID || '',
    agoraCert: process.env.AGORA_APP_CERTIFICATE || '',
    cacheToken: process.env.AGORA_CACHE_TOKEN_SECRET || '',
    note: process.env.AGORA_APP_ID
      ? 'Agora RTC configured — low-latency real-time voice pipeline active.'
      : 'Agora not configured; using browser Web Speech MVP fallback.'
  },
  agora: {
    // Agora Conversational AI (Voice AI) — App Builder / AI Agents
    // Configured via customer ID + secret (server-side only). The frontend
    // never sees these; it requests short-lived tokens from the backend.
    enabled: !!process.env.AGORA_CUSTOMER_ID && !!process.env.AGORA_CUSTOMER_SECRET,
    appId: process.env.AGORA_APP_ID || '',
    customerId: !!process.env.AGORA_CUSTOMER_ID,
    customerSecret: !!process.env.AGORA_CUSTOMER_SECRET,
    agentId: process.env.AGORA_AGENT_ID || '',
    env: process.env.AGORA_ENV || 'dev',
    provider: (process.env.AGORA_CUSTOMER_ID && process.env.AGORA_CUSTOMER_SECRET) ? 'agora-conversational-ai' : 'mock',
    note: (process.env.AGORA_CUSTOMER_ID && process.env.AGORA_CUSTOMER_SECRET)
      ? 'Agora Conversational AI configured (customer credentials present).'
      : 'Agora Conversational AI not configured — using clearly-marked mock agent mode. Add AGORA_CUSTOMER_ID / AGORA_CUSTOMER_SECRET to enable live voice-AI agents.'
  },
  asr: {
    provider: process.env.DEEPGRAM_API_KEY ? 'deepgram' : 'mock-browser-speech',
    key: !!process.env.DEEPGRAM_API_KEY,
    note: process.env.DEEPGRAM_API_KEY
      ? 'Deepgram ASR configured.'
      : 'Deepgram not configured — using browser Web Speech recognition.'
  },
  tts: {
    provider: process.env.ELEVENLABS_API_KEY ? 'elevenlabs' : 'browser-synthesis',
    key: !!process.env.ELEVENLABS_API_KEY,
    note: process.env.ELEVENLABS_API_KEY
      ? 'ElevenLabs configured.'
      : 'ElevenLabs not configured — using device speech synthesis.'
  },
  llm: {
    provider: process.env.OPENAI_API_KEY ? 'openai' : 'vyaparvaani-local-ai',
    key: !!process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || 'gpt-4o',
    note: process.env.OPENAI_API_KEY
      ? 'OpenAI configured.'
      : 'OpenAI not configured — using VyaparVaani local rule-based engine.'
  },
  telephony: {
    provider: process.env.TELNYX_API_KEY ? 'telnyx' : 'mock-telephony',
    key: !!process.env.TELNYX_API_KEY,
    note: process.env.TELNYX_API_KEY
      ? 'Telnyx telephony configured.'
      : 'Telnyx not configured — using mock telephony simulator.'
  },
  avatar: {
    provider: 'safe-generated',
    note: 'Avatars are safe generated illustrations only. No real-person cloning. Custom avatars use your own uploaded image.'
  },
  humanAgent: {
    provider: process.env.ZENDESK_SUBDOMAIN ? 'zendesk' : 'in-app',
    key: !!process.env.ZENDESK_SUBDOMAIN,
    note: 'Escalated cases route to a vetted human-expert directory.'
  }
};

const registry = () => Object.fromEntries(
  Object.entries(PROFILE).map(([k, v]) => [k, { provider: v.provider, configured: status(v), note: v.note }])
);

function status(cfg) {
  if (cfg.agoraAppId) return true;
  if (cfg.key === true) return true;
  if (cfg.enabled === true) return true;
  if (cfg.provider && (cfg.provider.startsWith('browser') || cfg.provider === 'mock-telephony' || cfg.provider === 'in-app')) return true;
  if (cfg.provider === 'agora') return !!process.env.AGORA_APP_ID;
  return false;
}

const get = (name) => PROFILE[name] || null;

module.exports = { PROFILE, registry, get, env: (name) => (PROFILE[name] || {}).env };
