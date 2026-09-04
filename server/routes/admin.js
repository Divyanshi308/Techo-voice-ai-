'use strict';

const express = require('express');
const store = require('../db');
const auth = require('../auth');

const router = express.Router();

router.use('/api/admin', auth.requireAdmin);

router.get('/api/admin/stats', (req, res) => {
  const users = store.all('users');
  const owners = users.filter((u) => u.role === 'owner');
  const conversations = store.all('conversations');
  const messages = conversations.flatMap((c) => c.messages).filter(Boolean);
  const transactions = store.all('transactions');
  const sales = transactions.filter((t) => t.type === 'sale').reduce((s, t) => s + t.amount, 0);
  const expenses = transactions.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const calls = store.all('calls');
  const cases = store.all('cases');
  const surveys = store.all('surveys');
  const reviews = store.all('reviews');
  const contentUses = store.all('contentUses');

  const salesByMonth = monthBuckets(transactions.filter((t) => t.type === 'sale'));
  const langDist = {};
  messages.forEach((m) => {
    if (m.role === 'user' && m.lang) langDist[m.lang] = (langDist[m.lang] || 0) + 1;
  });
  const callStatus = {};
  calls.forEach((c) => { callStatus[c.status] = (callStatus[c.status] || 0) + 1; });
  const positivity = reviews.reduce((acc, r) => {
    acc[r.sentiment || 'neutral'] = (acc[r.sentiment || 'neutral'] || 0) + 1;
    return acc;
  }, {});

  res.json({
    counts: {
      users: owners.length,
      admins: users.filter((u) => u.role === 'admin').length,
      conversations: conversations.length,
      messages: messages.length,
      transactions: transactions.length,
      calls: calls.length,
      cases: cases.length,
      surveys: surveys.length,
      reviews: reviews.length,
      contentUses: contentUses.length
    },
    revenue: { sales, expenses, net: sales - expenses },
    salesByMonth,
    languageDistribution: langDist,
    callStatus,
    reviewsBySentiment: positivity,
    intents: computeIntents(messages)
  });
});

function monthBuckets(txs) {
  const buckets = {};
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    buckets[d.toISOString().slice(0, 7)] = 0;
  }
  txs.forEach((t) => {
    const k = (t.at || '').slice(0, 7);
    if (buckets[k] !== undefined) buckets[k] += t.amount;
  });
  return buckets;
}

function computeIntents(messages) {
  // lightweight intent histogram from user messages using the AI lexicon
  const words = {
    sale: ['sale', 'बिक्री', 'becha', 'bech'],
    expense: ['expense', 'kharch', 'खर्च', 'spent'],
    marketing: ['promo', 'whatsapp', 'caption', 'social'],
    concept: ['gst', 'samjhao', 'matlab', 'what is', 'tax', 'मतलब'],
    reminder: ['remind', 'reminder', 'yaad', 'याद'],
    human: ['expert', 'lawyer', 'ca ', 'vakil', 'legal', 'वकील']
  };
  const out = {};
  messages.filter((m) => m.role === 'user').forEach((m) => {
    const t = (m.text || '').toLowerCase();
    for (const [k, ws] of Object.entries(words)) {
      if (ws.some((w) => t.includes(w))) out[k] = (out[k] || 0) + 1;
    }
  });
  return out;
}

// Users management
router.get('/api/admin/users', (req, res) => {
  const users = store.all('users').map((u) => ({
    id: u.id, name: u.name, email: u.email, role: u.role, provider: u.provider,
    loginCount: u.loginCount || 0, createdAt: u.createdAt, disabled: !!u.disabled,
    businessName: u.business && u.business.name ? u.business.name : null
  }));
  res.json({ users });
});

router.patch('/api/admin/users/:id', (req, res) => {
  const u = store.get('users', req.params.id);
  if (!u) return res.status(404).json({ error: 'not_found' });
  const b = req.body || {};
  const patch = {};
  if (b.role && ['owner', 'admin'].includes(b.role)) patch.role = b.role;
  if (b.disabled !== undefined) patch.disabled = b.disabled === true;
  if (b.loginCount !== undefined) patch.loginCount = b.loginCount;
  store.update('users', u.id, patch);
  res.json({ ok: true });
});

router.delete('/api/admin/users/:id', (req, res) => {
  const u = store.get('users', req.params.id);
  if (!u) return res.status(404).json({ error: 'not_found' });
  if (u.role === 'admin') return res.status(403).json({ error: 'cannot_delete_admin' });
  store.remove('users', u.id);
  store.removeWhere('conversations', (c) => c.userId === u.id);
  store.removeWhere('transactions', (t) => t.userId === u.id);
  store.removeWhere('reminders', (r) => r.userId === u.id);
  store.removeWhere('surveys', (s) => s.userId === u.id);
  store.removeWhere('calls', (c) => c.userId === u.id);
  store.removeWhere('reviews', (r) => r.userId === u.id);
  store.removeWhere('cases', (c) => c.userId === u.id);
  res.json({ ok: true });
});

// Cases (all)
router.get('/api/admin/cases', (req, res) => {
  const cases = store.all('cases')
    .map((c) => ({ ...c, user: store.get('users', c.userId) ? { id: c.userId, name: store.get('users', c.userId).name, email: store.get('users', c.userId).email } : null, expert: c.expertId ? store.get('experts', c.expertId) : null }))
    .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
  res.json({ cases });
});

router.patch('/api/admin/cases/:id', (req, res) => {
  const c = store.get('cases', req.params.id);
  if (!c) return res.status(404).json({ error: 'not_found' });
  const b = req.body || {};
  const patch = {};
  if (b.status) patch.status = b.status;
  if (b.priority) patch.priority = b.priority;
  if (b.expertId) patch.expertId = b.expertId;
  if (b.category) patch.category = b.category;
  if (b.expertId) {
    patch.status = 'assigned';
    patch.assigned = new Date().toISOString();
  }
  const timeline = c.timeline || [];
  timeline.push({ at: new Date().toISOString(), note: `Admin update: ${Object.keys(patch).join(', ')}`, by: 'admin' });
  patch.timeline = timeline;
  store.update('cases', c.id, patch);
  res.json({ ok: true });
});

// Experts
router.post('/api/admin/experts', (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.role) return res.status(400).json({ error: 'name_role_required' });
  store.insert('experts', {
    name: b.name, role: b.role, services: b.services || [], lang: b.lang || ['en'], available: b.available !== false, hourly: b.hourly || 'On request', verified: b.verified !== false
  });
  res.json({ ok: true });
});

router.patch('/api/admin/experts/:id', (req, res) => {
  const e = store.get('experts', req.params.id);
  if (!e) return res.status(404).json({ error: 'not_found' });
  const b = req.body || {};
  const patch = {};
  ['name', 'role', 'services', 'lang', 'available', 'hourly', 'verified'].forEach((k) => {
    if (b[k] !== undefined) patch[k] = b[k];
  });
  store.update('experts', e.id, patch);
  res.json({ ok: true });
});

router.delete('/api/admin/experts/:id', (req, res) => {
  store.remove('experts', req.params.id);
  res.json({ ok: true });
});

// Languages toggle
router.patch('/api/admin/languages/:code', (req, res) => {
  const l = store.findOne('languages', (x) => x.code === req.params.code);
  if (!l) return res.status(404).json({ error: 'not_found' });
  const enabled = req.body.enabled === true;
  store.update('languages', l.id, { enabled });
  res.json({ ok: true, languages: store.all('languages') });
});

// All calls / surveys / reviews (admin view)
router.get('/api/admin/calls', (req, res) => {
  const calls = store.all('calls').map((c) => ({
    ...c,
    user: store.get('users', c.userId) ? store.get('users', c.userId).name : null,
    contact: c.contactId && store.get('contacts', c.contactId) ? store.get('contacts', c.contactId).name : null
  }));
  res.json({ calls });
});

router.get('/api/admin/surveys', (req, res) => {
  res.json({ surveys: store.all('surveys') });
});

router.get('/api/admin/reviews', (req, res) => {
  res.json({ reviews: store.all('reviews').map((r) => ({ ...r, user: store.get('users', r.userId) ? store.get('users', r.userId).name : null })) });
});

module.exports = router;