'use strict';

const express = require('express');
const store = require('../db');
const auth = require('../auth');

const router = express.Router();

/* ------------------------------------------------------------------ *
 * Catalog
 * ------------------------------------------------------------------ */

router.get('/api/avatars', (req, res) => {
  const catalog = store.find('avatars', (a) => !a.ownerId);
  const mine = auth.currentUser(req)
    ? store.find('avatars', (a) => a.ownerId === auth.currentUser(req).uid)
    : [];
  res.json({ avatars: catalog, custom: mine });
});

router.get('/api/voices', (req, res) => {
  const catalog = store.find('voices', (v) => !v.ownerId);
  res.json({ voices: catalog });
});

router.get('/api/themes', (req, res) => {
  res.json({ themes: store.all('themes') });
});

/* ------------------------------------------------------------------ *
 * User preferences: avatar, voice, language, theme, background
 * ------------------------------------------------------------------ */

router.get('/api/me/preferences', auth.requireUser, (req, res) => {
  const user = store.get('users', req.session.uid);
  const avatar = user.avatarId ? store.get('avatars', user.avatarId) || store.get('avatars', 'av_didi') : store.get('avatars', 'av_didi');
  const voice = user.voiceId ? store.get('voices', user.voiceId) || store.get('voices', 'v_roopa') : store.get('voices', 'v_roopa');
  res.json({
    preferences: {
      avatarId: user.avatarId,
      voiceId: user.voiceId,
      uiLang: user.uiLang || 'en',
      preferredLang: user.preferredLang || 'en',
      themeId: user.themeId,
      themeCustom: user.themeCustom || null,
      langPrefs: user.langPrefs || {
        autoDetect: true,
        lockResponseLang: false,
        allowSwitch: true,
        showNative: true,
        showRoman: false
      }
    },
    avatar,
    voice
  });
});

router.put('/api/me/preferences', auth.requireUser, (req, res) => {
  const user = store.get('users', req.session.uid);
  const b = req.body || {};
  const patch = {};
  ['avatarId', 'voiceId', 'uiLang', 'preferredLang', 'themeId'].forEach((k) => {
    if (b[k] !== undefined) patch[k] = b[k];
  });
  if (b.themeCustom !== undefined) patch.themeCustom = b.themeCustom;
  if (b.themeId !== undefined) patch.themeId = b.themeId;
  if (b.langPrefs !== undefined && b.langPrefs && typeof b.langPrefs === 'object') {
    patch.langPrefs = { ...(user.langPrefs || {}), ...b.langPrefs };
  }
  const updated = store.update('users', user.id, patch);
  res.json({ ok: true, preferences: updated });
});

/* ------------------------------------------------------------------ *
 * Custom avatar (consent-aware: user uploads their OWN image or builds one)
 * ------------------------------------------------------------------ */

router.post('/api/avatars/custom', auth.requireUser, (req, res) => {
  const user = store.get('users', req.session.uid);
  const b = req.body || {};
  if (!b.name) return res.status(400).json({ error: 'name_required' });
  if (b.image && b.image.length > 6000000) {
    return res.status(400).json({ error: 'image_too_large', message: 'Image must be under 6 MB.' });
  }
  const avatar = store.insert('avatars', {
    name: b.name,
    ownerId: user.id,
    lang: b.lang || user.preferredLang || 'en',
    gender: b.gender || 'neutral',
    tone: b.tone || 'friendly',
    personality: b.personality || 'helpful voice assistant',
    color: b.color || '#7c5cff',
    emoji: b.emoji || '🤖',
    image: b.image || null,
    tagline: b.tagline || '',
    custom: true,
    createdAt: new Date().toISOString()
  });
  res.json({ ok: true, avatar });
});

router.delete('/api/avatars/custom/:id', auth.requireUser, (req, res) => {
  const avatar = store.get('avatars', req.params.id);
  if (!avatar || avatar.ownerId !== req.session.uid) return res.status(404).json({ error: 'not_found' });
  store.remove('avatars', avatar.id);
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ *
 * Custom voice pack (metadata only — TTS uses device voices, clearly safe)
 * ------------------------------------------------------------------ */

router.post('/api/voices/custom', auth.requireUser, (req, res) => {
  const user = store.get('users', req.session.uid);
  const b = req.body || {};
  if (!b.name) return res.status(400).json({ error: 'name_required' });
  const voice = store.insert('voices', {
    name: b.name,
    ownerId: user.id,
    lang: b.lang || 'hing',
    gender: b.gender || 'neutral',
    accent: b.accent || 'Indian',
    personality: b.personality || 'warm',
    pitch: b.pitch !== undefined ? Number(b.pitch) : 1,
    rate: b.rate !== undefined ? Number(b.rate) : 1,
    browserHint: `${b.lang || 'hing'} voice via device speech synthesis`,
    custom: true,
    createdAt: new Date().toISOString()
  });
  res.json({ ok: true, voice });
});

module.exports = router;