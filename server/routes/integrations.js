'use strict';

/**
 * routes/integrations.js — "Give Your MCP a Voice" API surface (authenticated).
 *
 * Calendar (Google), Email (Resend) and Payments (Stripe read-only demo).
 * Every endpoint is honest about configuration state: unconfigured providers
 * return { configured:false, setup:[...] } with setup steps — never fake data.
 * No secrets ever leave the server (only boolean flags + safe fields).
 */

const express = require('express');
const auth = require('../auth');
const calendar = require('../services/integrations/calendar');
const email = require('../services/integrations/email');
const stripe = require('../services/integrations/stripe');
const agoraConfig = require('../services/agora/config');
const { publicBaseUrl } = require('../baseUrl');

const router = express.Router();

// Combined status for the Integrations dashboard page.
router.get('/api/integrations/status', auth.requireUser, (req, res) => {
  const ag = agoraConfig.status();
  res.json({
    ok: true,
    integrations: {
      agora: {
        provider: 'agora-conversational-ai',
        connected: ag.connection === 'connected',
        connection: ag.connection,
        mode: ag.mocked ? 'mock' : 'production',
        agentConfigured: ag.agentConfigured
      },
      calendar: calendar.status(),
      email: email.status(),
      payments: stripe.status()
    }
  });
});

// ---------------------------------------------------------------- Calendar ---
router.get('/api/calendar/status', auth.requireUser, (req, res) => {
  res.json({ ok: true, ...calendar.status(), connected: !!calendar.tokenRecord(req.session.uid) });
});

router.get('/api/calendar/auth-url', auth.requireUser, (req, res) => {
  const r = calendar.authUrl(req.session.uid);
  res.json({ ok: true, ...r, redirectUri: calendar.status().redirectUri });
});

// OAuth callback — user approved access on Google's site (explicit consent).
router.get('/api/calendar/callback', auth.requireUser, async (req, res) => {
  const { code, error } = req.query || {};
  const base = publicBaseUrl();
  if (error || !code) {
    return res.redirect(base + '/#/reminders?cal=error');
  }
  try {
    await calendar.connectWithCode(req.session.uid, code);
    return res.redirect(base + '/#/reminders?cal=connected');
  } catch (e) {
    return res.redirect(base + '/#/reminders?cal=error');
  }
});

router.get('/api/calendar/events', auth.requireUser, async (req, res) => {
  try {
    const r = await calendar.listUpcoming(req.session.uid, Number(req.query.limit) || 10);
    res.json({ ok: r.configured && r.events !== undefined && !r.reason, ...r });
  } catch (e) {
    res.status(502).json({ ok: false, reason: 'provider_error', message: 'Calendar request failed.' });
  }
});

router.post('/api/calendar/events', auth.requireUser, async (req, res) => {
  const b = req.body || {};
  if (b.consent !== true) {
    return res.status(403).json({ ok: false, reason: 'consent_required', message: 'Calendar consent is required to create events.' });
  }
  try {
    const r = await calendar.createEvent(req.session.uid, { title: b.title, start: b.start, end: b.end, description: b.description });
    res.status(r.ok ? 200 : r.configured === false ? 501 : 400).json(r);
  } catch (e) {
    res.status(502).json({ ok: false, reason: 'provider_error', message: 'Calendar request failed.' });
  }
});

router.post('/api/calendar/disconnect', auth.requireUser, (req, res) => {
  res.json({ ok: true, ...calendar.disconnect(req.session.uid) });
});

// ------------------------------------------------------------------- Email ---
router.get('/api/email/status', auth.requireUser, (req, res) => {
  res.json({ ok: true, ...email.status() });
});

router.post('/api/email/send', auth.requireUser, async (req, res) => {
  const b = req.body || {};
  try {
    const r = await email.send(req.session.uid, { to: b.to, subject: b.subject, text: b.text, consent: b.consent === true });
    res.status(r.ok ? 200 : r.configured === false ? 501 : 400).json(r);
  } catch (e) {
    res.status(502).json({ ok: false, reason: 'provider_error', message: 'Email request failed.' });
  }
});

router.get('/api/email/sent', auth.requireUser, (req, res) => {
  res.json({ ok: true, ...email.listSent(req.session.uid, Number(req.query.limit) || 20) });
});

// ---------------------------------------------------------------- Payments ---
router.get('/api/payments/overview', auth.requireUser, async (req, res) => {
  try {
    const r = await stripe.overview(req.session.uid, Number(req.query.days) || 7);
    res.json({ ok: !r.reason, ...r });
  } catch (e) {
    res.status(502).json({ ok: false, reason: 'provider_error', message: 'Payments request failed.' });
  }
});

router.get('/api/payments/status', auth.requireUser, (req, res) => {
  res.json({ ok: true, ...stripe.status() });
});

module.exports = router;
