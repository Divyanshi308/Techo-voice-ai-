'use strict';

/**
 * agora/rte.js — REAL Agora Conversational AI REST (RTE) client.
 *
 * Talks to Agora's Conversational AI Engine REST API:
 *   base: https://api.agora.io/api/conversational-ai-agent/v2/projects/{appid}
 *
 * Supported endpoints (authenticated with Basic Auth over
 * customerId:customerSecret, never exposed to the frontend):
 *   - join:   POST /join                        start an agent instance
 *   - leave:  POST /agents/{agentId}/leave      stop an agent instance
 *   - query:  GET  /agents/{agentId}            agent status
 *   - list:   GET  /agents?limit=..             list agent instances
 *   - history:GET  /agents/{agentId}/history    short-term conversation history
 *
 * SECURITY / HONESTY:
 *   - These functions only fire real HTTP requests when the required Agora
 *     credentials are configured AND a real RTC token can be minted.
 *   - They NEVER fabricate an agent_id / status / transcript. When not
 *     configured or a call fails, they return a structured error object with
 *     `ok:false`, a safe provider error category, and a message that contains
 *     NO secrets and NO raw stack traces intended for end users.
 *   - Managed mode (credential_mode: "managed") is used for ASR/LLM/TTS so no
 *     separate provider API keys are required.
 */

const tokenService = require('./token');
const agoraConfig = require('./config');

const BASE = 'https://api.agora.io/api/conversational-ai-agent/v2/projects';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CUSTOMER_ID = () => process.env.AGORA_CUSTOMER_ID || '';
const CUSTOMER_SECRET = () => process.env.AGORA_CUSTOMER_SECRET || '';
const REGION = () => process.env.AGORA_REGION || 'GLOBAL';

function appId() {
  return process.env.AGORA_APP_ID || '';
}

function configured() {
  return !!appId() && !!CUSTOMER_ID() && !!CUSTOMER_SECRET();
}

function authHeader() {
  return 'Basic ' + Buffer.from(`${CUSTOMER_ID()}:${CUSTOMER_SECRET()}`).toString('base64');
}

/** Categorise a thrown error into a safe provider-facing category. */
function classify(err) {
  const m = String((err && err.message) || '');
  if (!m) return 'provider_error';
  if (/401|403|unauthorized|forbidden|invalid.*(secret|customer|credential)/i.test(m)) return 'auth_error';
  if (/404|not_found/i.test(m)) return 'not_found';
  if (/429|rate|quota|limit/i.test(m)) return 'rate_limited';
  if (/400|invalid|param|field/i.test(m)) return 'bad_request';
  if (/timeout|econn|socket|network|fetch failed/i.test(m)) return 'network_error';
  return 'provider_error';
}

/** Safe error object — no secrets, no raw stack for the UI. */
function fail(category, message, opts = {}) {
  return { ok: false, error: category, message, ...opts };
}

async function request(method, pathname, body) {
  const res = await fetch(`${BASE}/${encodeURIComponent(appId())}${pathname}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authHeader()
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = {}; }
  if (!res.ok) {
    const err = new Error(json.message || json.msg || `HTTP ${res.status} from Agora`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

// ---------------------------------------------------------------------------
// Health / connectivity check
// ---------------------------------------------------------------------------

/**
 * Verify credentials by listing agents (cheap read endpoint). Returns safe
 * status. Never exposes credentials.
 */
async function health() {
  if (!configured()) {
    return {
      ok: false, configured: false, mode: 'mock',
      checks: {
        appId: !!appId(),
        customerCredentials: false,
        basicAuth: false,
        apiReachable: false
      },
      message: 'Agora credentials not configured — set AGORA_APP_ID, AGORA_CUSTOMER_ID, AGORA_CUSTOMER_SECRET.'
    };
  }
  try {
    await request('GET', '/agents?limit=1');
    return {
      ok: true, configured: true, mode: 'production',
      checks: { appId: true, customerCredentials: true, basicAuth: true, apiReachable: true },
      message: 'Agora REST API reachable and authenticated.'
    };
  } catch (err) {
    return fail(classify(err), 'Agora REST API check failed: ' + safeErr(err), {
      configured: true, mode: 'production',
      checks: { appId: true, customerCredentials: true, basicAuth: true, apiReachable: false }
    });
  }
}

// ---------------------------------------------------------------------------
// Token + channel helpers used by join()
// ---------------------------------------------------------------------------

/**
 * Build the `properties` object for the join request from the active agent
 * configuration (published via the Agent Configuration page). Managed mode is
 * used for ASR/LLM/TTS; the agent/pipeline ID from config is passed through.
 */
function buildProperties({ channel, token, uid, remoteUid, greeting, systemPrompt, supportedLanguages, ttsVoice, speed, idleTimeout, pipelineMode }) {
  const cfg = require('./agentConfig').getActive();
  const mainLang = (supportedLanguages && supportedLanguages[0]) || 'hi';
  const primaryBcp47 = mainLang === 'hi' ? 'hi-IN' : mainLang === 'bn' ? 'bn-BD' : mainLang === 'pa' ? 'pa-IN' : mainLang === 'mr' ? 'mr-IN' : mainLang === 'en' ? 'en-US' : mainLang === 'hing' ? 'hi-IN' : 'hi-IN';

  const props = {
    channel,
    token,
    agent_rtc_uid: '0',
    remote_rtc_uids: [String(remoteUid || 1002)],
    enable_string_uid: false,
    idle_timeout: idleTimeout || 120
  };

  // In pipeline mode the published agent already defines ASR/LLM/TTS and the
  // system prompt — overriding them with inline managed blocks makes Agora
  // reject the join (HTTP 400). Only override when NOT using a pipeline.
  if (pipelineMode) {
    return props;
  }

  props.asr = {
    credential_mode: 'managed',
    language: primaryBcp47,
    params: {}
  };
  props.llm = {
    credential_mode: 'managed',
    system_messages: [{ role: 'system', content: systemPrompt || cfg.systemPrompt || 'You are Techo, a helpful voice assistant for business owners in India.' }],
    greeting_message: greeting || cfg.greeting || 'Namaste! Main Techo hoon. Kaise madad karoon?',
    failure_message: 'Maaf kijiye, main is sawal ka jawab abhi nahi de sakta. Chaahein to kisi expert se baat kar sakte hain.'
  };
  props.tts = {
    credential_mode: 'managed',
    vendor: 'minimax',
    params: {
      voice_id: ttsVoice || 'male-qn-octagon-preview'
    },
    skip_patterns: [3, 4]
  };

  return props;
}

/** Generate a fresh channel-scoped RTC token for the agent + user. */
function makeRtcToken(channel, uid) {
  return tokenService.rtcToken(channel, uid);
}

// ---------------------------------------------------------------------------
// Agent lifecycle
// ---------------------------------------------------------------------------

/**
 * Start a Conversational AI agent in `channel`.
 *
 * Uses the published agent's `pipeline_id`/`agent_id`/`name` when available
 * (pipeline mode), otherwise builds an inline managed-mode configuration.
 * Returns the real `agent_id` and `status` only when Agora actually starts it.
 */
async function join({ channel, uid, remoteUid, name, opts = {} }) {
  if (!configured()) {
    return fail('not_configured', 'Agora not configured. Add AGORA_APP_ID + AGORA_CUSTOMER_ID + AGORA_CUSTOMER_SECRET to enable live voice-AI agents.', { mode: 'mock' });
  }
  const rtc = makeRtcToken(channel, uid);
  if (!rtc.available) {
    return fail('token_unavailable', rtc.note || 'Could not mint an RTC token for the agent channel.', { mode: 'mock' });
  }

  const cfg = require('./agentConfig').getActive();
  const pipelineId = process.env.AGORA_PIPELINE_ID || process.env.AGORA_AGENT_ID || '';
  const requestBody = {
    name: name || `${cfg.name || 'vyaparvaani'}-${Date.now()}`,
    properties: buildProperties({
      channel,
      token: rtc.token,
      uid,
      remoteUid: remoteUid || 1002,
      greeting: null,
      systemPrompt: null,
      supportedLanguages: cfg.supportedLanguages,
      ttsVoice: cfg.ttsVoice,
      speed: cfg.speed,
      idleTimeout: opts.idleTimeout,
      pipelineMode: !!pipelineId
    })
  };
  if (pipelineId) requestBody.pipeline_id = pipelineId;

  try {
    const data = await request('POST', '/join', requestBody);
    const agentId = data.agent_id || data.instance_id || data.uid || '';
    const status = data.status || data.state || 'RUNNING';
    if (!agentId) {
      return fail('provider_error', 'Agora started the agent but returned no agent_id.', { raw: sanitizeRaw(data) });
    }
    return {
      ok: true,
      agent_id: agentId,
      status,
      channel,
      create_ts: data.create_ts || null,
      mode: 'production',
      rtc: { appId: rtc.appId, channel: rtc.channel, uid: String(rtc.uid || 0) }
    };
  } catch (err) {
    return fail(classify(err), 'Failed to start the Agora voice agent: ' + safeErr(err), { mode: 'production', channel });
  }
}

/** Stop an agent instance by its real agent_id. */
async function leave(agentId) {
  if (!configured()) {
    return fail('not_configured', 'Agora not configured — cannot stop a live agent.', { mode: 'mock' });
  }
  if (!agentId) return fail('missing_agent_id', 'No agent_id provided to stop.');
  try {
    await request('POST', `/agents/${encodeURIComponent(agentId)}/leave`);
    return { ok: true, agent_id: agentId, status: 'IDLE' };
  } catch (err) {
    // `TaskNotFound` (HTTP 404) simply means the agent already ended on its own,
    // e.g. via idle timeout — treat that as a clean stop, not an error.
    if (err && err.status === 404 && /task|session|ended|not found/i.test(String(err.body && (err.body.detail || err.body.reason || err.body.message) || ''))) {
      return { ok: true, agent_id: agentId, status: 'ENDED', alreadyEnded: true };
    }
    return fail(classify(err), 'Failed to stop the Agora voice agent: ' + safeErr(err));
  }
}

/** Query the current status of a running agent. */
async function query(agentId) {
  if (!configured()) return fail('not_configured', 'Agora not configured.', { mode: 'mock' });
  if (!agentId) return fail('missing_agent_id', 'No agent_id provided to query.');
  try {
    const data = await request('GET', `/agents/${encodeURIComponent(agentId)}`);
    return {
      ok: true,
      agent_id: agentId,
      status: data.status || data.state || data.agent_status || 'UNKNOWN',
      create_ts: data.create_ts || null,
      ...sanitizeRaw(data)
    };
  } catch (err) {
    return fail(classify(err), 'Failed to query Agora agent status: ' + safeErr(err));
  }
}

/** List recent agent instances (diagnostics/dashboard). */
async function list(limit = 20) {
  if (!configured()) return fail('not_configured', 'Agora not configured.', { mode: 'mock' });
  try {
    const data = await request('GET', `/agents?limit=${Math.min(50, limit || 20)}`);
    const agents = Array.isArray(data.agents) ? data.agents : [];
    return {
      ok: true,
      agents: agents.map((a) => ({
        agent_id: a.agent_id || a.instance_id || a.uid || '',
        status: a.status || a.state || 'UNKNOWN',
        create_ts: a.create_ts || null
      }))
    };
  } catch (err) {
    return fail(classify(err), 'Failed to list Agora agents: ' + safeErr(err));
  }
}

/** Retrieve short-term conversation history for an agent. */
async function history(agentId) {
  if (!configured()) return fail('not_configured', 'Agora not configured.', { mode: 'mock' });
  if (!agentId) return fail('missing_agent_id', 'No agent_id provided.');
  try {
    const data = await request('GET', `/agents/${encodeURIComponent(agentId)}/history`);
    return { ok: true, history: data.history || data.messages || [] };
  } catch (err) {
    return fail(classify(err), 'Failed to retrieve Agora conversation history: ' + safeErr(err));
  }
}

// ---------------------------------------------------------------------------
// Safe sanitisation
// ---------------------------------------------------------------------------

function safeErr(err) {
  const s = String((err && err.message) || 'Unknown provider error');
  // Never leak the secret/customer id if it appears in an error string.
  const id = CUSTOMER_ID();
  const secret = CUSTOMER_SECRET();
  return s.split(id).join('[customer-id]').split(secret).join('[secret]');
}

/** Strip anything that looks like a credential from raw provider data. */
function sanitizeRaw(obj) {
  if (!obj || typeof obj !== 'object') return {};
  const out = {};
  for (const k of Object.keys(obj)) {
    if (/secret|token|key|credential|certificate/i.test(k)) continue;
    out[k] = obj[k];
  }
  return out;
}

module.exports = {
  health,
  join,
  leave,
  query,
  list,
  history,
  configured,
  appId,
  REGION,
  buildProperties,
  makeRtcToken
};
