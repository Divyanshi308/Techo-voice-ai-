'use strict';

/**
 * agentTools.js — POST /api/agent/tool
 *
 * Lets a remote LLM (the Agora Conversational AI agent's built-in model)
 * execute real actions on our backend, e.g. send an email, schedule a call,
 * add a calendar event, record a sale/expense or set a reminder.
 *
 * Authentication:
 *   - Preferred: set AGENT_TOOL_SECRET and configure the agent's HTTP service
 *     (Agora Console → agent → Services → HTTP) to POST here with
 *     `Authorization: Bearer <AGENT_TOOL_SECRET>` and body
 *     `{ userId, action, params }`. Each call is cross-checked against an
 *     ACTIVE voice session for that user so a valid token can't act for people
 *     who aren't mid-conversation.
 *   - Fallback: if AGENT_TOOL_SECRET is NOT set, the endpoint only accepts an
 *     authenticated browser session (in-app use). It is never exposed without
 *     some authentication path.
 *
 * `action` must be one of agentTools.EXECUTORS keys:
 *   send_email | create_calendar_event | read_calendar_events | schedule_call |
 *   create_reminder | record_transaction
 */

const express = require('express');
const auth = require('../auth');
const agentTools = require('../services/agentTools');
const sessions = require('../services/agora/sessions');

const router = express.Router();

function bearerMatches(secret) {
  if (!secret) return false;
  return (req) => {
    const header = req.headers['authorization'] || '';
    return header === 'Bearer ' + secret;
  };
}

// Authentication is either the shared agent secret (server-to-server) or an
// authenticated browser session (in-app fallback).
router.post('/api/agent/tool', (req, res, next) => {
  const secret = process.env.AGENT_TOOL_SECRET || '';
  if (secret && bearerMatches(secret)(req)) return next();
  return auth.requireUser(req, res, next);
}, async (req, res) => {
  const secret = process.env.AGENT_TOOL_SECRET || '';
  const fromAgentSecret = !!secret && bearerMatches(secret)(req);
  const body = req.body || {};
  const action = String(body.action || '');
  if (!action || !agentTools.EXECUTORS[action]) {
    return res.status(400).json({ ok: false, error: 'unknown_action', message: 'Action must be one of: ' + Object.keys(agentTools.EXECUTORS).join(', ') });
  }

  // Resolve the user the action belongs to.
  let userId = null;
  if (fromAgentSecret) {
    if (body.userId) {
      if (!sessions.current(String(body.userId))) {
        return res.status(403).json({ ok: false, error: 'no_active_session', message: 'No active voice session for userId. The agent can only act during a live conversation.' });
      }
      userId = String(body.userId);
    } else if (body.channel) {
      const match = sessions.listAll().find((s) => s.channel === String(body.channel));
      if (match) userId = match.userId;
      if (!userId) return res.status(403).json({ ok: false, error: 'no_active_session', message: 'No active voice session for channel ' + body.channel });
    } else {
      return res.status(400).json({ ok: false, error: 'missing_user', message: 'Body must include userId (or channel) when calling via the agent secret.' });
    }
  } else {
    userId = req.session.uid;
  }
  if (!userId) return res.status(403).json({ ok: false, error: 'unauthorized' });

  const result = await agentTools.execute(String(userId), action, body.params || {});
  res.json({ ok: result.ok !== false, ...result });
});

module.exports = router;