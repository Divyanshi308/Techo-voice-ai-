'use strict';

const express = require('express');
const store = require('../db');
const auth = require('../auth');

const router = express.Router();

// Experts directory
router.get('/api/experts', (req, res) => {
  res.json({ experts: store.all('experts') });
});

// Cases for the current user
router.get('/api/cases', auth.requireUser, (req, res) => {
  const cases = store
    .find('cases', (c) => c.userId === req.session.uid)
    .map((c) => ({ ...c, expert: c.expertId ? store.get('experts', c.expertId) : null }))
    .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
  res.json({ cases });
});

router.get('/api/cases/:id', auth.requireUser, (req, res) => {
  const c = store.get('cases', req.params.id);
  if (!c || c.userId !== req.session.uid) return res.status(404).json({ error: 'not_found' });
  res.json({
    case: {
      ...c,
      expert: c.expertId ? store.get('experts', c.expertId) : null,
      timeline: c.timeline || []
    }
  });
});

// Create a case from a structured message (full summary captured for the human expert)
router.post('/api/cases', auth.requireUser, (req, res) => {
  const user = store.get('users', req.session.uid);
  const b = req.body || {};
  if (!b.message) return res.status(400).json({ error: 'message_required' });
  const c = store.insert('cases', {
    userId: user.id,
    status: 'open',
    priority: b.priority || 'medium',
    category: b.category || 'general',
    language: b.language || user.preferredLang || 'en',
    consultTitle: b.consultTitle || b.message.slice(0, 60),
    transcript: b.message,
    summary: {
      userMessage: b.message,
      topic: b.consultTitle || b.message.slice(0, 60),
      facts: b.facts || [],
      recommendation: b.recommendation || 'Reviewed by the VyaparVaani team; a qualified expert will respond.'
    },
    expertId: b.expertId || null,
    assigned: null,
    createdAt: new Date().toISOString(),
    consent: b.consent === true,
    timeline: [{ at: new Date().toISOString(), note: 'Case created', by: 'system' }]
  });
  res.json({ ok: true, case: c });
});

// User asks to chat with their assigned expert (mock thread)
router.post('/api/cases/:id/messages', auth.requireUser, (req, res) => {
  const c = store.get('cases', req.params.id);
  if (!c || c.userId !== req.session.uid) return res.status(404).json({ error: 'not_found' });
  const b = req.body || {};
  const timeline = c.timeline || [];
  timeline.push({ at: new Date().toISOString(), note: `Owner: ${b.message || '(attachment)'}`, by: 'user' });
  if (c.expertId) {
    const ex = store.get('experts', c.expertId);
    if (ex) {
      timeline.push({ at: new Date(Date.now() + 2000).toISOString(), note: `${ex.name}: Thanks — reviewing your case. You can view my advice here shortly.`, by: 'expert' });
    }
  }
  const updated = store.update('cases', c.id, { timeline, status: c.status === 'open' ? 'in-review' : c.status });
  res.json({ ok: true, case: updated });
});

// Request escalation to a human expert (transfers expert assignment)
router.post('/api/cases/:id/assign', auth.requireUser, (req, res) => {
  const c = store.get('cases', req.params.id);
  if (!c || c.userId !== req.session.uid) return res.status(404).json({ error: 'not_found' });
  const expert = store.get('experts', req.body.expertId);
  if (!expert) return res.status(400).json({ error: 'expert_not_found' });
  const timeline = c.timeline || [];
  timeline.push({ at: new Date().toISOString(), note: `Assigned to ${expert.name} (${expert.role})`, by: 'system' });
  const updated = store.update('cases', c.id, { expertId: expert.id, status: 'assigned', assigned: new Date().toISOString(), timeline });
  res.json({ ok: true, case: { ...updated, expert } });
});

module.exports = router;