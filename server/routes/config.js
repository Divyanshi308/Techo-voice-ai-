'use strict';

const express = require('express');
const store = require('../db');
const auth = require('../auth');
const aiProvider = require('../services/aiProvider');
const realtime = require('../services/realtime');
const agoraToken = require('../services/agora/token');
const agoraConfig = require('../services/agora/config');
const languageRegistry = require('../services/languageRegistry');

const router = express.Router();

// App config for the frontend: languages, themes, prompts, disclaimers
router.get('/api/config', (req, res) => {
  const settings = store.get('settings', 'global') || {};
  const storedLangs = store.all('languages');
  const disabled = new Set(storedLangs.filter((l) => l.enabled === false).map((l) => l.code));
  // Merge the canonical registry (18 modes, provider-aware status) with any
  // admin enable/disable stored in the seed data.
  const languages = languageRegistry.list().map((l) => ({
    ...l,
    enabled: !disabled.has(l.code)
  }));
  res.json({
    appName: settings.appName || 'Techo',
    languages,
    themes: store.all('themes'),
    prompts: store.all('prompts'),
    disclaimer: settings.disclaimer || '',
    mockNotes: settings.mockNotes || {},
    aiProvider: aiProvider.PROVIDER,
    telephonyMock: true,
    providers: realtime.pipelineStatus()
  });
});

// Agora RTC token for a real-time voice channel (Auth-free pre-login call,
// but returns only availability + a token scoped to a random ephemeral channel).
router.post('/api/realtime/token', (req, res) => {
  const { channel } = req.body || {};
  res.json(agoraToken.rtcToken(channel, Math.floor(Math.random() * 100000) + 1));
});

router.get('/api/health', (req, res) => {
  const agora = agoraConfig.status();
  res.json({
    ok: true,
    uptime: process.uptime(),
    provider: aiProvider.PROVIDER.kind,
    agora: { connection: agora.connection, env: agora.env, mocked: agora.mocked }
  });
});

// Notifications for the current user
router.get('/api/notifications', auth.requireUser, (req, res) => {
  const list = store.find('notifications', (n) => n.userId === req.session.uid).sort((a, b) => (b.at > a.at ? 1 : -1));
  res.json({ notifications: list });
});

router.post('/api/notifications/read', auth.requireUser, (req, res) => {
  const ids = new Set(req.body.ids || []);
  store.find('notifications', (n) => n.userId === req.session.uid).forEach((n) => {
    if (!ids.size || ids.has(n.id)) store.update('notifications', n.id, { read: true });
  });
  res.json({ ok: true });
});

module.exports = router;