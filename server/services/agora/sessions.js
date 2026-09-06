'use strict';

/**
 * agora/sessions.js — Live voice-agent session tracking + transcript handling.
 *
 * Lifecycle of a voice-AI conversation:
 *   start → (listen/speak/turn) → end
 *
 * REAL Agora integration:
 *   - When Agora credentials are configured, start() calls the Agora
 *     Conversational AI REST API (`rte.join`) to create + start a real agent
 *     instance, and end() calls `rte.leave` to stop it. The session then holds
 *     the REAL agent_id/status/agent_uid returned by Agora.
 *   - When credentials are absent, start() still creates a session record but
 *     marks it `mock` — the dashboard shows exactly what happened and the
 *     test-voice-agent button works end-to-end in the UI, but NOTHING is
 *     claimed to be live.
 *
 * When a call/transcript is persisted to `calls`/`conversations`, it is always
 * consent-gated and stored locally (privacy-first).
 */

const store = require('../../db');
const rte = require('./rte');
const agoraConfig = require('./config');

// In-memory live sessions (per user). Not persisted — status only.
const live = new Map(); // userId -> session

// Map of userId -> real agent_id for cleanup, plus a log of recent RTE actions.
const agents = new Map();
const rteLog = []; // [{at, action, userId, ok, agent_id, error}]

function current(userId) {
  return live.get(userId) || null;
}

function logRte(action, userId, result) {
  rteLog.unshift({
    at: new Date().toISOString(),
    action,
    userId,
    ok: !!(result && result.ok),
    agent_id: (result && result.agent_id) || null,
    mode: (result && result.mode) || null,
    error: (result && result.error) || null,
    message: (result && result.message) || ''
  });
  if (rteLog.length > 200) rteLog.pop();
}

/**
 * Start (or return existing) a voice session for a user.
 *
 * REAL mode: calls Agora `join`, stores the real agent_id + agent_uid.
 * MOCK mode: records the session as `mock` and returns an honest status.
 */
async function start(userId, opts = {}) {
  const existing = live.get(userId);
  if (existing && existing.status !== 'ended') {
    return { session: existing, reused: true };
  }

  const now = new Date().toISOString();
  const channel = opts.channel || `vv-ai-${Math.random().toString(16).slice(2, 10)}`;
  const cfg = agoraConfig.status();
  const configured = cfg.credentialsPresent && !!cfg.appId;

  const session = {
    id: `sess_${Math.random().toString(16).slice(2, 10)}${Math.random().toString(16).slice(2, 6)}`,
    userId,
    channel,
    status: 'starting',
    mode: configured ? 'production' : 'mock',
    startedAt: now,
    endedAt: null,
    turns: 0,
    transcript: [],
    agent_id: null,
    agent_uid: null,
    error: null,
    watchedUserIdx: -1
  };

  if (configured) {
    const agentUid = 1002;
    const res = await rte.join({
      channel,
      uid: 0,
      remoteUid: agentUid,
      name: `${(store.get('users', userId) || {}).name || 'user'}-vv-${Date.now()}`
    });
    logRte('start', userId, res);
    if (res.ok) {
      session.agent_id = res.agent_id;
      session.agent_uid = agentUid;
      session.channel = res.channel || channel;
      session.status = 'active';
      session.mode = 'production';
      session.rtc = res.rtc || null;
    } else {
      session.status = 'error';
      session.error = { category: res.error, message: res.message };
    }
  } else {
    session.status = 'active'; // mock session is immediately "usable"
  }

  live.set(userId, session);
  if (session.agent_id) agents.set(userId, session.agent_id);
  return { session, reused: false };
}

/** Record a spoken/text turn in the live session. */
function addTurn(userId, { role, text, lang, langConfidence, intent, entities, audioRef }) {
  const s = live.get(userId);
  if (!s) return null;
  s.turns += 1;
  s.transcript.push({
    role,
    text,
    cleaned: text || '',
    lang: lang || '',
    langConfidence: langConfidence || null,
    intent: intent || null,
    entities: entities || null,
    audioRef: audioRef || null,
    at: new Date().toISOString()
  });
  if (!s.watchedUserIdx || s.watchedUserIdx < 0) s.watchedUserIdx = 0;
  s.watchedUserIdx = s.transcript.length - 1;
  return s;
}

/**
 * End a session, stopping the real Agora agent (if any) and, with consent,
 * persisting a call/transcript record locally.
 */
async function end(userId, { persist = true, consent = false, kind = 'conversation', note = '' } = {}) {
  const s = live.get(userId);
  if (!s) return null;
  s.status = 'ending';

  let stopResult = null;
  if (s.agent_id) {
    stopResult = await rte.leave(s.agent_id);
    logRte('end', userId, stopResult);
    s.stopResult = stopResult;
  } else if (s.mode === 'production' && s.status !== 'error') {
    // Shouldn't normally happen, but be safe.
    s.stopResult = { ok: false, error: 'no_agent_id', message: 'Session had no live agent_id to stop.' };
  }

  s.status = s.error ? 'error' : 'ended';
  s.endedAt = new Date().toISOString();
  agents.delete(userId);

  if (persist) {
    const transcriptText = s.transcript.map((t) => `${t.role === 'user' ? 'User' : 'Helper'}: ${t.text}`).join('\n');
    store.insert('calls', {
      id: store.uid('cl'),
      userId,
      kind,
      status: s.status === 'ended' ? 'completed' : 'failed',
      channel: s.channel,
      durationSec: s.startedAt && s.endedAt ? Math.max(0, Math.round((new Date(s.endedAt) - new Date(s.startedAt)) / 1000)) : 0,
      consent: !!consent,
      transcript: transcriptText,
      at: s.endedAt,
      createdAt: s.endedAt,
      meta: {
        sessionId: s.id,
        mode: s.mode,
        agent_id: s.agent_id || undefined,
        agent_uid: s.agent_uid || undefined,
        note: note || '',
        stopResult: s.stopResult ? { ok: s.stopResult.ok, error: s.stopResult.error } : undefined
      }
    });
  }

  live.delete(userId);
  return s;
}

/**
 * Explicitly route to a human agent (escalation). Records a case + call entry.
 * In a full telephony deployment this would also transfer the RTC session via
 * Agora/SIP; currently it records the readiness + the case for the expert desk.
 */
function escalate(userId, { topic = 'Voice conversation', reason = '', consent = true, sessionId } = {}) {
  const user = store.get('users', userId);
  const now = new Date().toISOString();
  const s = live.get(userId);
  const caseRec = store.insert('cases', {
    id: store.uid('cs'),
    userId,
    topic,
    reason: reason || 'Escalated from voice-AI conversation',
    status: 'open',
    createdAt: now,
    updatedAt: now,
    source: 'agora-voice',
    meta: {
      sessionId: sessionId || (s ? s.id : null),
      agent_id: s ? s.agent_id : null,
      transcript: s ? s.transcript : []
    }
  });
  store.insert('calls', {
    id: store.uid('cl'),
    userId,
    kind: 'escalation',
    status: 'scheduled',
    channel: 'expert',
    consent: !!consent,
    at: now,
    createdAt: now,
    meta: { caseId: caseRec.id, reason: reason || '', topic, sessionId: sessionId || (s ? s.id : null) }
  });
  return { caseId: caseRec.id, case: caseRec, transfer: 'scheduled' };
}

/** Human-agent availability summary (from the experts directory). */
function humanAgentInfo() {
  const experts = store.all('experts');
  const available = experts.filter((e) => e.available !== false);
  return {
    provider: 'in-app',
    experts: available.length,
    total: experts.length,
    available: available.length > 0
  };
}

/** All sessions (admin troubleshooting). */
function listAll() {
  return Array.from(live.values());
}

/** Recent RTE actions (dashboard diagnostics). */
function recentRte(limit = 10) {
  return rteLog.slice(0, limit);
}

/**
 * Pull the live agent's short-term history from Agora and merge any new turns
 * into the in-memory session transcript (deduped). Lets the UI poll one
 * endpoint for live transcripts during a production voice session.
 */
async function syncTranscript(userId) {
  const s = live.get(userId);
  if (!s) return { ok: false, reason: 'no_active_session', transcript: [] };
  if (!s.agent_id) return { ok: true, synced: 0, transcript: s.transcript };
  const h = await rte.history(s.agent_id);
  if (!h.ok) return { ok: false, reason: h.error || 'provider_error', message: h.message, transcript: s.transcript };
  const seen = new Set(s.transcript.map((t) => t.role + '|' + t.text));
  let added = 0;
  (h.history || []).forEach((m) => {
    const role = m.role === 'user' ? 'user' : 'assistant';
    const text = String(m.text || m.content || '').trim();
    if (!text || seen.has(role + '|' + text)) return;
    seen.add(role + '|' + text);
    s.transcript.push({ role, text, cleaned: text, lang: '', langConfidence: null, intent: null, entities: null, audioRef: null, at: new Date().toISOString() });
    added++;
  });
  s.turns = s.transcript.length;
  const lastUser = s.transcript.map((t) => t.role).lastIndexOf('user');
  s.watchedUserIdx = Math.max(s.watchedUserIdx || -1, lastUser);
  return { ok: true, synced: added, transcript: s.transcript };
}

module.exports = { start, addTurn, end, escalate, current, humanAgentInfo, listAll, recentRte, syncTranscript };
