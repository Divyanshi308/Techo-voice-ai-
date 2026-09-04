'use strict';

const express = require('express');
const store = require('../db');
const auth = require('../auth');
const aiProvider = require('../services/aiProvider');

const router = express.Router();

router.get('/api/profile', auth.requireUser, (req, res) => {
  const user = store.get('users', req.session.uid);
  const conversations = store.find('conversations', (c) => c.userId === user.id);
  const msgs = conversations.flatMap((c) => c.messages).filter((m) => m && m.role === 'user');
  const autoExtracted = aiProvider.summarizeConversation(msgs, user.business || {});
  const transactions = store.find('transactions', (t) => t.userId === user.id);
  const sales = transactions.filter((t) => t.type === 'sale').reduce((s, t) => s + t.amount, 0);
  const expenses = transactions.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  res.json({
    profile: user.business || { notes: [] },
    autoExtracted,
    stats: {
      sales: sales,
      expenses: expenses,
      net: sales - expenses,
      txCount: transactions.length
    }
  });
});

router.put('/api/profile', auth.requireUser, (req, res) => {
  const user = store.get('users', req.session.uid);
  const body = req.body || {};
  const allowed = ['name', 'location', 'industry', 'established', 'products', 'customers', 'challenges', 'monthlySales', 'monthlyExpenses', 'avgMargin', 'bestSellers', 'suppliers', 'notes'];
  const patch = {};
  for (const k of allowed) {
    if (body[k] !== undefined) patch[k] = body[k];
  }
  const updated = store.update('users', user.id, { business: { ...(user.business || {}), ...patch } });
  res.json({ ok: true, profile: updated.business });
});

module.exports = router;