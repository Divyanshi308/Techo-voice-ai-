'use strict';

const express = require('express');
const store = require('../db');
const auth = require('../auth');
const telephony = require('../services/telephony');

const router = express.Router();

const OWNER_FIELDS = ['title', 'notes', 'due', 'priority', 'kind', 'method', 'consent'];

router.get('/api/reminders', auth.requireUser, (req, res) => {
  const list = store
    .find('reminders', (r) => r.userId === req.session.uid)
    .sort((a, b) => new Date(a.due) - new Date(b.due));
  res.json({ reminders: list });
});

router.post('/api/reminders', auth.requireUser, (req, res) => {
  const user = store.get('users', req.session.uid);
  const body = req.body || {};
  if (!body.title || !body.due) {
    return res.status(400).json({ error: 'title_and_due_required' });
  }
  const consent = body.consent === true;
  const record = store.insert('reminders', {
    userId: user.id,
    title: body.title,
    notes: body.notes || '',
    due: body.due,
    humanDue: body.humanDue || '',
    priority: body.priority || 'medium',
    kind: body.kind || 'todo',
    method: (body.method || (consent ? 'voice-call' : 'in-app')),
    status: 'pending',
    consent,
    createdAt: new Date().toISOString()
  });
  res.json({ ok: true, reminder: record });
});

router.patch('/api/reminders/:id', auth.requireUser, (req, res) => {
  const reminder = store.get('reminders', req.params.id);
  if (!reminder || reminder.userId !== req.session.uid) return res.status(404).json({ error: 'not_found' });
  const body = req.body || {};
  const patch = {};
  for (const k of OWNER_FIELDS) if (body[k] !== undefined) patch[k] = body[k];
  const updated = store.update('reminders', reminder.id, patch);
  res.json({ ok: true, reminder: updated });
});

router.delete('/api/reminders/:id', auth.requireUser, (req, res) => {
  const reminder = store.get('reminders', req.params.id);
  if (!reminder || reminder.userId !== req.session.uid) return res.status(404).json({ error: 'not_found' });
  store.remove('reminders', reminder.id);
  res.json({ ok: true });
});

// Manually trigger the mock voice notification for a reminder (consent-gated)
router.post('/api/reminders/:id/ring', auth.requireUser, async (req, res) => {
  const user = store.get('users', req.session.uid);
  const reminder = store.get('reminders', req.params.id);
  if (!reminder || reminder.userId !== user.id) return res.status(404).json({ error: 'not_found' });
  const consent = !!(user.consents && user.consents.reminders) && req.body.consent === true;
  if (!consent) return res.status(403).json({ error: 'consent_required', message: 'Voice notifications need your permission. Enable them in Settings → Privacy.' });
  try {
    const call = await telephony.placeOutboundCall({
      userId: user.id, contactId: null, kind: 'reminder', consent: true,
      scheduledAt: new Date().toISOString(),
      transcript: `Voice reminder: ${reminder.title}. ${reminder.notes || ''}`
    });
    store.update('reminders', reminder.id, { ringTriggered: true });
    res.json({ ok: true, call });
  } catch (err) {
    res.status(400).json({ error: 'call_failed', message: err.message });
  }
});

module.exports = router;