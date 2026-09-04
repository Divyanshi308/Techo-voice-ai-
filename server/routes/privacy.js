'use strict';

const express = require('express');
const store = require('../db');
const auth = require('../auth');

const router = express.Router();

const CONSENT_KEYS = ['transcriptStore', 'voiceNote', 'calls', 'reminders', 'contactOthers', 'dataForReviews', 'aiAnalysis'];

// Aggregated personal data view (GDPR-style "what we hold")
router.get('/api/privacy/data', auth.requireUser, (req, res) => {
  const uid = req.session.uid;
  const user = store.get('users', uid);
  const conversations = store.find('conversations', (c) => c.userId === uid);
  const transcripts = conversations.flatMap((c) =>
    c.messages.map((m) => ({ conversation: c.id, role: m.role, text: m.text, lang: m.lang, at: m.at }))
  );
  const calls = store.find('calls', (c) => c.userId === uid).map((c) => ({
    id: c.id, kind: c.kind, status: c.status, at: c.at, transcript: c.transcript || '', contactId: c.contactId
  }));
  const transactions = store.find('transactions', (t) => t.userId === uid);
  const surveys = store.find('surveys', (s) => s.userId === uid);
  const reminders = store.find('reminders', (r) => r.userId === uid);
  const reviews = store.find('reviews', (r) => r.userId === uid);
  const cases = store.find('cases', (c) => c.userId === uid);
  const avatarCustoms = store.find('avatars', (a) => a.ownerId === uid);
  const usage = store.find('contentUses', (u) => u.userId === uid);

  res.json({
    profile: user.business || {},
    consents: user.consents || {},
    transcripts,
    calls,
    transactions,
    surveys,
    reminders,
    reviews,
    cases,
    avatarCustoms,
    contentUsage: usage
  });
});

// Download all data as JSON
router.get('/api/privacy/export', auth.requireUser, async (req, res) => {
  const uid = req.session.uid;
  const data = await new Promise((resolve) => {
    // reuse the aggregation above with a minimal local build
    const user = store.get('users', uid);
    const conversations = store.find('conversations', (c) => c.userId === uid);
    resolve({
      exportedAt: new Date().toISOString(),
      user: { id: user.id, name: user.name, email: user.email, provider: user.provider },
      conversations,
      calls: store.find('calls', (c) => c.userId === uid),
      transactions: store.find('transactions', (t) => t.userId === uid),
      surveys: store.find('surveys', (s) => s.userId === uid),
      surveyResponses: store.find('surveyResponses', (r) => store.get('surveys', r.surveyId) && store.get('surveys', r.surveyId).userId === uid),
      reminders: store.find('reminders', (r) => r.userId === uid),
      reviews: store.find('reviews', (r) => r.userId === uid),
      cases: store.find('cases', (c) => c.userId === uid)
    });
  });
  res.setHeader('Content-Disposition', `attachment; filename="vyaparvaani-data-${uid}.json"`);
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(data, null, 2));
});

// Delete data (scoped)
router.post('/api/privacy/delete', auth.requireUser, (req, res) => {
  const uid = req.session.uid;
  const { scope } = req.body || {};
  const deleted = {};

  const scopeMatches = (k) => scope === 'all' || scope === k;
  if (scopeMatches('transcripts')) {
    deleted.transcripts = 0;
    store.find('conversations', (c) => c.userId === uid).forEach((c) => {
      deleted.transcripts += c.messages.length;
      c.messages = [];
      store.update('conversations', c.id, { messages: [] });
    });
  }
  if (scopeMatches('recordings')) {
    store.find('calls', (c) => c.userId === uid).forEach((c) => {
      store.update('calls', c.id, { transcript: '', audioUrl: null });
    });
    deleted.recordings = 'transcripts & audio references cleared';
  }
  if (scopeMatches('transactions')) {
    deleted.transactions = store.removeWhere('transactions', (t) => t.userId === uid);
  }
  if (scopeMatches('surveys')) {
    deleted.surveys = store.removeWhere('surveys', (s) => s.userId === uid);
  }
  if (scopeMatches('reviews')) {
    deleted.reviews = store.removeWhere('reviews', (r) => r.userId === uid);
  }
  if (scopeMatches('reminders')) {
    deleted.reminders = store.removeWhere('reminders', (r) => r.userId === uid);
  }
  if (scopeMatches('cases')) {
    deleted.cases = store.removeWhere('cases', (c) => c.userId === uid);
  }
  if (scopeMatches('conversations') || scope === 'all') {
    deleted.conversations = store.removeWhere('conversations', (c) => c.userId === uid);
  }
  res.json({ ok: true, deleted, note: scope === 'all'
    ? 'Profile and account are kept so you can sign in; conversations, transcripts, calls, transactions, surveys, reviews, reminders and cases were deleted.'
    : `${scope} deleted.` });
});

// Consent management
router.get('/api/privacy/consents', auth.requireUser, (req, res) => {
  const user = store.get('users', req.session.uid);
  res.json({ consents: user.consents || {} });
});

router.put('/api/privacy/consents', auth.requireUser, (req, res) => {
  const user = store.get('users', req.session.uid);
  const body = req.body || {};
  const consents = { ...(user.consents || {}) };
  for (const k of CONSENT_KEYS) {
    if (body[k] !== undefined) consents[k] = body[k] === true;
  }
  // Any of these being toggled on is a consent change; never silently reset others.
  store.update('users', user.id, {
    consents,
    consentLog: (user.consentLog || []).concat({
      at: new Date().toISOString(),
      changes: Object.keys(body).filter((k) => CONSENT_KEYS.includes(k))
    }).slice(-50)
  });
  res.json({ ok: true, consents });
});

module.exports = router;