'use strict';

/**
 * routes/calls.js — Call scheduling API (authenticated).
 *
 * Scheduling is honest about the telephony backend: each record carries
 * channel ('mock-voice' | 'real-voice') and `simulated` so the UI can show a
 * "Simulated" badge. When a call is due, the reminders tick fires a mock dial
 * cycle and (if notifyEmail is set) sends an email notification. Nothing is
 * ever dialled without consent.
 */

const express = require('express');
const store = require('../db');
const auth = require('../auth');
const callsSvc = require('../services/calls');

const router = express.Router();

router.get('/api/calls', auth.requireUser, (req, res) => {
  res.json({ ok: true, calls: callsSvc.list(req.session.uid) });
});

router.post('/api/calls/schedule', auth.requireUser, (req, res) => {
  const user = store.get('users', req.session.uid);
  const b = req.body || {};
  const consent = b.consent === true || !!(user && user.consents && user.consents.calls);
  if (!consent) {
    return res.status(403).json({ ok: false, reason: 'consent_required', message: 'Outbound call consent is required to schedule calls. Enable it in Settings → Privacy.' });
  }
  const r = callsSvc.schedule({
    userId: user.id,
    title: b.title,
    due: b.due,
    humanDue: b.humanDue || '',
    notes: b.notes || '',
    participant: b.participant || '',
    notifyEmail: b.notifyEmail || '',
    consent: true
  });
  if (!r.ok) return res.status(400).json(r);
  res.json({
    ok: true,
    simulated: r.simulated,
    channel: r.channel,
    call: r.call,
    reminder: r.reminder,
    label: r.simulated ? 'Simulated' : 'Real'
  });
});

module.exports = router;