'use strict';

const express = require('express');
const store = require('../db');
const auth = require('../auth');
const aiProvider = require('../services/aiProvider');

const router = express.Router();

const loadUser = (req) => store.get('users', req.session.uid);

const ensureConversation = (user) => {
  const activeId = user.activeConversationId;
  const existing = store.get('conversations', activeId);
  if (existing && existing.userId === user.id) return existing;
  const created = store.insert('conversations', {
    userId: user.id, title: 'New conversation', createdAt: new Date().toISOString(), messages: []
  });
  store.update('users', user.id, { activeConversationId: created.id });
  return created;
};

// List conversations + transactions for the signed-in user
router.get('/api/chat/data', auth.requireUser, (req, res) => {
  const user = loadUser(req);
  const conversations = store
    .find('conversations', (c) => c.userId === user.id)
    .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
  const transactions = store
    .find('transactions', (t) => t.userId === user.id)
    .sort((a, b) => (b.at > a.at ? 1 : -1));
  res.json({
    conversations,
    transactions,
    activeConversationId: user.activeConversationId
  });
});

// Send a message (voice or typed bytes arrive here as text)
router.post('/api/chat', auth.requireUser, async (req, res) => {
  const user = loadUser(req);
  const { text, mode = 'text' } = req.body || {};
  if (!text || !String(text).trim()) {
    return res.status(400).json({ error: 'empty_message' });
  }
  const conv = ensureConversation(user);
  const userMsg = { role: 'user', text: String(text).trim(), lang: req.body.lang || null, at: new Date().toISOString() };
  conv.messages.push(userMsg);

  let result;
  try {
    result = await aiProvider.generate({
      user, text: userMsg.text, mode,
      detectedLang: userMsg.lang
    });
  } catch (e) {
    conv.messages.pop();
    store.update('conversations', conv.id, { messages: conv.messages });
    console.error('[chat] AI engine error:', e);
    return res.status(502).json({ error: 'ai_error', message: e.message || 'AI engine error' });
  }

  const asstMsg = {
    role: 'assistant',
    text: result.reply,
    lang: result.replyLang,
    meta: result.meta || {},
    at: new Date().toISOString()
  };
  conv.messages.push(asstMsg);
  if (conv.messages.length <= 2) {
    conv.title = userMsg.text.slice(0, 40);
  }
  store.update('conversations', conv.id, { messages: conv.messages, title: conv.title });

  // Refresh user (engine may have updated profile/business)
  const freshUser = store.get('users', user.id);
  res.json({
    userMessage: userMsg,
    assistantMessage: asstMsg,
    result: {
      reply: result.reply,
      replyLang: result.replyLang,
      meta: result.meta,
      intents: result.intents,
      model: result.model,
      provider: result.provider,
      actions: (result.actions || []).map((a) => ({
        type: a.type,
        payload: a.payload
      }))
    },
    transactions: store.find('transactions', (t) => t.userId === user.id).sort((a, b) => (b.at > a.at ? 1 : -1)),
    reminders: store.find('reminders', (r) => r.userId === user.id).sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1)),
    profile: freshUser.business
  });
});

// Delete a transaction (owner only)
router.delete('/api/transactions/:id', auth.requireUser, (req, res) => {
  const tx = store.get('transactions', req.params.id);
  if (!tx || tx.userId !== req.session.uid) return res.status(404).json({ error: 'not_found' });
  store.remove('transactions', tx.id);
  res.json({ ok: true });
});

router.put('/api/transactions/:id', auth.requireUser, (req, res) => {
  const tx = store.get('transactions', req.params.id);
  if (!tx || tx.userId !== req.session.uid) return res.status(404).json({ error: 'not_found' });
  const { amount, note, type } = req.body || {};
  const updated = store.update('transactions', tx.id, {
    amount: amount != null ? Number(amount) : tx.amount,
    note: note != null ? note : tx.note,
    type: type || tx.type
  });
  res.json({ ok: true, transaction: updated });
});

// New blank transcript conversation is created lazily by POST /api/chat.
// Allow explicit "start fresh" that resets active conversation.
router.post('/api/chat/new', auth.requireUser, (req, res) => {
  const user = loadUser(req);
  const created = store.insert('conversations', {
    userId: user.id, title: 'New conversation', createdAt: new Date().toISOString(), messages: []
  });
  store.update('users', user.id, { activeConversationId: created.id });
  res.json({ ok: true, conversation: created });
});

// Delete an individual conversation (owner only) — also clears the active id.
router.delete('/api/chat/:id', auth.requireUser, (req, res) => {
  const conv = store.get('conversations', req.params.id);
  if (!conv || conv.userId !== req.session.uid) return res.status(404).json({ error: 'not_found' });
  store.remove('conversations', conv.id);
  const user = store.get('users', req.session.uid);
  if (user && user.activeConversationId === conv.id) {
    store.update('users', user.id, { activeConversationId: null });
  }
  res.json({ ok: true });
});

module.exports = router;