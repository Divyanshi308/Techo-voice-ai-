'use strict';

const express = require('express');
const store = require('../db');
const auth = require('../auth');
const aiEngine = require('../services/aiEngine');

const router = express.Router();

// Generate promotional/follow-up content drafts
router.post('/api/content/generate', auth.requireUser, (req, res) => {
  const user = store.get('users', req.session.uid);
  const { kind, lang, customerId } = req.body || {};
  const useLang = lang || user.preferredLang || 'en';
  let customerName;
  if (customerId) {
    const c = store.get('contacts', customerId);
    if (c) customerName = c.name;
  }
  const out = aiEngine.generateContent(kind || 'whatsapp-promo', useLang, user.business && user.business.name, customerName);
  res.json({ ok: true, content: out });
});

// Track generated content usage (analytics)
router.post('/api/content/use', auth.requireUser, (req, res) => {
  const { kind, lang } = req.body || {};
  store.insert('contentUses', {
    userId: req.session.uid,
    kind: kind || 'promo',
    lang: lang || null,
    at: new Date().toISOString()
  });
  res.json({ ok: true });
});

module.exports = router;