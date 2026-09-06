'use strict';

/**
 * routes/agora.js — Agora Integration API surface (authenticated).
 *
 * All Agora orchestration lives here and talks only to the modular
 * server/services/agora/* modules. SECRETS NEVER LEAVE THESE MODULES:
 * every response is assembled from safe config/status only, and tokens are
 * issued through the secure backend token service (never hand-rolled, never
 * with the secret echoed back).
 */

const express = require('express');
const store = require('../db');
const auth = require('../auth');
const agoraConfig = require('../services/agora/config');
const tokenService = require('../services/agora/token');
const rte = require('../services/agora/rte');
const agentConfig = require('../services/agora/agentConfig');
const analytics = require('../services/agora/analytics');
const sessions = require('../services/agora/sessions');
const { publicBaseUrl } = require('../baseUrl');

const router = express.Router();

// ---------------------------------------------------------------------------
// Dashboard / status
// ---------------------------------------------------------------------------

// Full dashboard payload (safe status only — no secrets).
router.get('/api/agora/status', auth.requireUser, (req, res) => {
  const st = agoraConfig.status();
  const caps = tokenService.capability();
  const activeCfg = agentConfig.summary();

  // Collate an honest connection state.
  let connection = 'not_configured';
  if (st.connection === 'connected' && caps.convo) connection = 'connected';
  else if (st.connection === 'auth_failed') connection = 'auth_failed';
  else if (st.credentialsPresent && !caps.convo) connection = 'token_unavailable';
  else if (st.mocked) connection = 'mock';

  const user = store.get('users', req.session.uid) || {};
  const consent = {
    voiceRecording: !!(user.consents && user.consents.voiceRecording),
    conversations: user.conversationConsent !== false
  };

  res.json({
    status: {
      connection,
      env: st.env,
      appId: st.appId,
      appIdConfigured: st.appIdConfigured,
      agentId: st.agentId,
      agentConfigured: st.agentConfigured,
      pipelineId: process.env.AGORA_PIPELINE_ID || '',
      region: rte.REGION(),
      baseUrl: publicBaseUrl(),
      webhooksConfigured: !!process.env.WEBHOOK_SECRET,
      secretsExposed: st.secretsExposed,
      rtcConfigured: st.rtcConfigured,
      convoAvailable: caps.convo,
      apaasAvailable: caps.apaas,
      mocked: st.mocked,
      productionReady: st.productionReady,
      labels: st.labels,
      rte: sessions.recentRte(6)
    },
    agent: activeCfg,
    token: { rtc: caps.rtc, convo: caps.convo, apaas: caps.apaas },
    analytics: analytics.countsFor(req.session.uid),
    recent: analytics.recentActivity(req.session.uid, 12),
    warnings: analytics.errorWarnings(req.session.uid, 10),
    consent
  });
});

// Connection self-test (used by health check + dashboard "test connection").
router.get('/api/agora/connection-test', auth.requireUser, (req, res) => {
  const st = agoraConfig.status();
  const caps = tokenService.capability();
  const checks = [
    { key: 'app_id', label: 'Agora App ID configured', ok: st.appIdConfigured, detail: st.appIdConfigured ? 'Present' : 'Missing AGORA_APP_ID' },
    { key: 'customer_credentials', label: 'Customer credentials configured', ok: st.credentialsPresent, detail: st.credentialsPresent ? 'Present' : 'Missing AGORA_CUSTOMER_ID / AGORA_CUSTOMER_SECRET' },
    { key: 'agent_id', label: 'Voice-AI agent configured', ok: st.agentConfigured, detail: st.agentConfigured ? 'Present' : 'Missing AGORA_AGENT_ID / AGORA_PIPELINE_ID (create agent in Agora Console / AI Studio)' },
    { key: 'convo_token', label: 'Conversational AI token mintable', ok: caps.convo, detail: caps.convo ? 'Token service ready' : 'Token service unavailable (credentials required)' },
    { key: 'rtc_token', label: 'RTC token mintable', ok: caps.rtc, detail: caps.rtc ? 'Token service ready' : 'RTC token unavailable' }
  ];
  const allOk = checks.every((c) => c.ok);
  res.json({
    ok: allOk,
    connected: allOk,
    mode: st.mocked ? 'mock' : 'production',
    env: st.env,
    checkedAt: new Date().toISOString(),
    checks
  });
});

// ---------------------------------------------------------------------------
// Agent configuration + version history
// ---------------------------------------------------------------------------

router.get('/api/agora/agent-config', auth.requireUser, (req, res) => {
  res.json({ config: agentConfig.getActive(), sense: 'published', version: agentConfig.getActive().version });
});

router.get('/api/agora/agent-config/draft', auth.requireUser, (req, res) => {
  res.json({ draft: agentConfig.getDraft() });
});

router.post('/api/agora/agent-config/draft', auth.requireUser, (req, res) => {
  const patch = req.body || {};
  const saved = agentConfig.saveDraft(patch.config || {});
  res.json({ ok: true, draft: saved });
});

router.post('/api/agora/agent-config/publish', auth.requireUser, (req, res) => {
  const { comment } = req.body || {};
  const result = agentConfig.publish({ comment });
  res.json({ ok: true, ...result });
});

router.get('/api/agora/agent-config/history', auth.requireUser, (req, res) => {
  res.json({ history: agentConfig.history() });
});

router.post('/api/agora/agent-config/rollback', auth.requireUser, (req, res) => {
  const { version } = req.body || {};
  if (!version) return res.status(400).json({ error: 'version_required' });
  const result = agentConfig.rollback(version);
  if (!result) return res.status(404).json({ error: 'version_not_found' });
  res.json({ ok: true, ...result });
});

router.get('/api/agora/agent-config/diff', auth.requireUser, (req, res) => {
  const draft = agentConfig.getDraft();
  const active = agentConfig.getActive();
  res.json({ diff: agentConfig.diff(active, draft), draft, active });
});

// ---------------------------------------------------------------------------
// Voice-agent sessions (start / end / test)
// ---------------------------------------------------------------------------

router.post('/api/agora/agent/start', auth.requireUser, async (req, res) => {
  const st = agoraConfig.status();
  const { session, reused } = await sessions.start(req.session.uid, { channel: (req.body || {}).channel });
  res.json({ ok: true, mode: session.mode, reused, session: safeSession(session) });
});

router.post('/api/agora/agent/turn', auth.requireUser, (req, res) => {
  const { text, lang, role } = req.body || {};
  const s = sessions.addTurn(req.session.uid, { role: role || 'user', text: text || '', lang });
  if (!s) return res.status(400).json({ error: 'no_active_session' });
  res.json({ ok: true, turns: s.turns });
});

router.post('/api/agora/agent/end', auth.requireUser, async (req, res) => {
  const b = req.body || {};
  const s = await sessions.end(req.session.uid, {
    persist: b.persist !== false,
    consent: b.consent === true,
    kind: b.kind || 'conversation',
    note: b.note || ''
  });
  res.json({ ok: true, session: s ? safeSession(s) : null });
});

router.post('/api/agora/agent/escalate', auth.requireUser, (req, res) => {
  const b = req.body || {};
  const result = sessions.escalate(req.session.uid, { topic: b.topic, reason: b.reason, consent: b.consent !== false });
  res.json({ ok: true, ...result });
});

router.get('/api/agora/human-agent', auth.requireUser, (req, res) => {
  res.json({ humanAgent: sessions.humanAgentInfo() });
});

// ---------------------------------------------------------------------------
// Agora REST (RTE) integration endpoints
// ---------------------------------------------------------------------------

// Health check — real API connectivity probe when configured.
router.get('/api/agora/health', auth.requireUser, async (req, res) => {
  const h = await rte.health();
  res.json({ ...h, env: agoraConfig.env(), region: rte.REGION, appIdConfigured: !!rte.appId() });
});

// Real token endpoint (short-lived, channel-scoped).
router.post('/api/agora/token', auth.requireUser, (req, res) => {
  const { kind, channel, uid, roomUuid, userUuid } = req.body || {};
  const result = tokenService.issue(kind || 'convo', { channel, uid, roomUuid, userUuid });
  if (!result.available) {
    return res.status(412).json({ available: false, reason: result.reason, note: result.note, channel: result.channel });
  }
  res.json(result);
});

// Start a real voice session (creates + starts an Agora agent when configured).
router.post('/api/agora/session/start', auth.requireUser, async (req, res) => {
  const { channel } = req.body || {};
  const { session, reused } = await sessions.start(req.session.uid, { channel });
  res.status(session.status === 'error' ? 502 : 200).json({ ok: session.status !== 'error', reused, mode: session.mode, session: safeSession(session) });
});

// Stop a real voice session (stops the Agora agent when one is running).
router.post('/api/agora/session/stop', auth.requireUser, async (req, res) => {
  const { persist, consent } = req.body || {};
  const s = await sessions.end(req.session.uid, { persist, consent, kind: 'conversation' });
  res.json({ ok: true, session: s ? safeSession(s) : null });
});

// Live transcript sync — merges the agent's short-term history (when live)
// into the session transcript so the UI can poll one endpoint.
router.get('/api/agora/session/sync', auth.requireUser, async (req, res) => {
  const r = await sessions.syncTranscript(req.session.uid);
  res.json({ ok: r.ok !== false, ...r });
});

// Get status of the caller's current session.
router.get('/api/agora/session/:id', auth.requireUser, (req, res) => {
  const s = sessions.current(req.session.uid);
  if (!s || s.id !== req.params.id) return res.status(404).json({ error: 'session_not_found' });
  res.json({ ok: true, session: safeSession(s) });
});

// Live transcript for a session (from the in-memory session record).
router.get('/api/agora/transcripts/:sessionId', auth.requireUser, (req, res) => {
  const s = sessions.current(req.session.uid);
  const call = store.find('calls', (c) => c.userId === req.session.uid && c.meta && c.meta.sessionId === req.params.sessionId)[0];
  if (!s && !call) return res.status(404).json({ error: 'session_not_found' });
  const transcript = s && s.transcript ? s.transcript : (call ? [{ role: 'system', text: call.transcript }] : []);
  res.json({ ok: true, sessionId: req.params.sessionId, transcript });
});

// Human transfer (records escalation + scheduled expert call).
router.post('/api/agora/transfer', auth.requireUser, (req, res) => {
  const b = req.body || {};
  const result = sessions.escalate(req.session.uid, {
    topic: b.topic, reason: b.reason, consent: b.consent !== false, sessionId: b.sessionId
  });
  res.json({ ok: true, ...result, status: 'scheduled' });
});

// Call history (GET, authenticated).
router.get('/api/agora/calls', auth.requireUser, (req, res) => {
  const calls = store.find('calls', (c) => c.userId === req.session.uid)
    .slice().sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0))
    .map((c) => ({ ...c, simulated: !!(c.simulated || c.channel === 'mock-voice') }));
  res.json({ ok: true, calls });
});

// Webhook verification endpoint — verifies a webhook signature when
// WEBHOOK_SECRET is configured; otherwise reports "webhooks not configured".
// NOTE: deliberately NOT behind auth.requireUser — real Agora webhooks are
// server-to-server and carry no browser session cookie. They are authenticated
// purely by the HMAC signature below (or explicitly refused when no secret is
// configured). This keeps the endpoint reachable by Agora's callback servers.
router.post('/api/agora/webhooks', (req, res) => {
  const secret = process.env.WEBHOOK_SECRET || '';
  if (!secret) {
    return res.status(501).json({ ok: false, configured: false, message: 'Webhooks not configured — set WEBHOOK_SECRET on the server to verify Agora webhook payloads.' });
  }
  const sig = req.headers['x-agora-signature'] || req.headers['x-signature'] || '';
  const expected = require('crypto').createHmac('sha256', secret).update(JSON.stringify(req.body || {})).digest('hex');
  const valid = typeof sig === 'string' && sig.length === expected.length &&
    require('crypto').timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  if (!valid) return res.status(401).json({ ok: false, configured: true, verified: false, message: 'Invalid webhook signature.' });
  // Forward to a handler if registered (currently just acknowledges).
  res.json({ ok: true, configured: true, verified: true, received: true });
});

// Return the resolved (non-secret) integration configuration + provider status.
router.get('/api/agora/configuration', auth.requireUser, (req, res) => {
  const st = agoraConfig.status();
  const h = rte.configured();
  res.json({
    ok: true,
    configuration: {
      env: agoraConfig.env(),
      region: rte.REGION(),
      appIdConfigured: !!rte.appId(),
      customerCredentialsConfigured: st.credentialsPresent,
      agentId: st.agentId || '',
      pipelineId: process.env.AGORA_PIPELINE_ID || '',
      mode: h ? 'production' : 'mock',
      baseUrl: publicBaseUrl(),
      webhooksConfigured: !!process.env.WEBHOOK_SECRET,
      backendHealthy: true,
      lastSession: analysis_lastSession(req.session.uid)
    }
  });
});

function analysis_lastSession(userId) {
  const calls = store.find('calls', (c) => c.userId === userId);
  calls.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));
  const c = calls[0];
  return c ? { status: c.status, at: c.at, mode: (c.meta && c.meta.mode) || null, agentId: (c.meta && c.meta.agent_id) || null } : null;
}

// Recent RTE actions (diagnostics).
router.get('/api/agora/rte-log', auth.requireUser, (req, res) => {
  res.json({ ok: true, entries: sessions.recentRte(20) });
});

// ---------------------------------------------------------------------------
// Calls + review/survey integration (adhoc: log a call/record)
// ---------------------------------------------------------------------------

router.post('/api/agora/call', auth.requireUser, (req, res) => {
  const b = req.body || {};
  const now = new Date().toISOString();
  const call = store.insert('calls', {
    id: store.uid('cl'),
    userId: req.session.uid,
    kind: b.kind || 'conversation',
    status: b.status || 'completed',
    channel: b.channel || 'agora-voice',
    durationSec: Number(b.durationSec) || 0,
    consent: b.consent === true,
    transcript: b.transcript || '',
    at: now,
    createdAt: now,
    meta: b.meta || {}
  });
  res.json({ ok: true, call });
});

function safeSession(s) {
  return s ? {
    id: s.id, channel: s.channel, status: s.status, mode: s.mode,
    startedAt: s.startedAt, endedAt: s.endedAt, turns: s.turns, transcript: s.transcript,
    agent_id: s.agent_id || null, agent_uid: s.agent_uid || null,
    rtc: s.rtc || null, error: s.error || null, stopResult: s.stopResult || null
  } : null;
}

module.exports = router;
