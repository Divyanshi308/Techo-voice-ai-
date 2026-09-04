'use strict';

/**
 * routes/avatar.js — talking-head avatar (optional visual layer on Agora voice).
 *
 * Endpoints (all auth-gated, never leak secrets):
 *   GET  /api/avatar/status        → { provider, configured, setup }
 *   GET  /api/avatar/list          → { provider, configured, avatars[], selected }
 *   PUT  /api/avatar/select        → save { avatarId, voiceId } in the profile
 *   POST /api/avatar/create-talk   → { text, avatarId?, voiceId? } → { videoId, status }
 *   GET  /api/avatar/status/:videoId → { status: processing|ready|failed, url? }
 *
 * When the provider is not configured everything returns honest configured:false
 * with setup steps; the voice conversation keeps working independently.
 */

const express = require('express');
const store = require('../db');
const auth = require('../auth');
const provider = require('../services/avatar/provider');

const router = express.Router();

function avatarPref(user) {
  return (user && user.talkingAvatar) || {};
}

router.get('/api/avatar/status', auth.requireUser, (req, res) => {
  res.json({ ok: true, ...provider.status() });
});

router.get('/api/avatar/list', auth.requireUser, async (req, res) => {
  const st = provider.status();
  let avatars = provider.catalog.all();
  let selected = avatarPref(store.get('users', req.session.uid));
  let thumbnails = {};
  if (st.configured) {
    try {
      const p = provider.getProvider();
      const r = await p.listAvatars();
      if (r && r.avatars) {
        r.avatars.forEach((a) => { if (a.thumbnail) thumbnails[a.id] = a.thumbnail; });
        const remoteIds = new Set((r.avatars || []).map((a) => a.id));
        for (const a of r.avatars) {
          if (!remoteIds.has(a.id)) continue;
          const known = provider.catalog.get(a.id);
          if (!known) avatars.push({ id: a.id, name: a.name, gender: a.gender, desc: '', thumbnail: a.thumbnail, voiceId: '', lang: a.lang || 'en' });
        }
      }
    } catch (e) { /* keep catalog */ }
  }
  avatars = avatars.map((a) => ({ ...a, thumbnail: a.thumbnail || thumbnails[a.id] || null }));
  res.json({ ok: true, provider: st.provider, configured: st.configured, setup: st.setup, avatars, selected });
});

router.put('/api/avatar/select', auth.requireUser, (req, res) => {
  const user = store.get('users', req.session.uid);
  const b = req.body || {};
  const avatarId = typeof b.avatarId === 'string' ? b.avatarId : null;
  const voiceId = typeof b.voiceId === 'string' ? b.voiceId : null;
  if (!avatarId) return res.status(400).json({ error: 'avatar_id_required' });
  const known = provider.catalog.get(avatarId);
  if (!known) return res.status(400).json({ error: 'unknown_avatar', message: 'That avatar is not in the catalog.' });
  const patch = { talkingAvatar: { avatarId, voiceId: voiceId || known.voiceId || null, name: known.name, at: new Date().toISOString() } };
  const updated = store.update('users', user.id, patch);
  res.json({ ok: true, preferences: avatarPref(updated) });
});

router.post('/api/avatar/create-talk', auth.requireUser, async (req, res) => {
  const st = provider.status();
  if (!st.configured) {
    return res.status(501).json({ ok: false, configured: false, setup: st.setup, reason: 'not_configured', message: 'Talking-head avatar provider is not configured. Voice still works without it.' });
  }
  const b = req.body || {};
  const text = typeof b.text === 'string' ? b.text.trim() : '';
  if (!text) return res.status(400).json({ ok: false, reason: 'empty_text', message: 'text is required.' });
  const avatarId = b.avatarId || avatarPref(store.get('users', req.session.uid)).avatarId || null;
  const r = await provider.getProvider().createTalk({ text, avatarId, voiceId: b.voiceId || undefined });
  if (!r.ok) {
    const code = r.code === 'insufficient_credit' ? 402 : 502;
    return res.status(code).json({ ok: false, reason: r.reason, code: r.code || null, message: r.message });
  }
  res.json({ ok: true, videoId: r.videoId, status: r.status });
});

router.get('/api/avatar/status/:videoId', auth.requireUser, async (req, res) => {
  const st = provider.status();
  if (!st.configured) {
    return res.status(501).json({ ok: false, configured: false, setup: st.setup, reason: 'not_configured', message: 'Talking-head avatar provider is not configured.' });
  }
  const videoId = String(req.params.videoId || '');
  if (!videoId) return res.status(400).json({ ok: false, reason: 'missing_video_id' });
  const r = await provider.getProvider().status(videoId);
  res.json({ ok: true, videoId, status: r.status, url: r.url || null, reason: r.reason || null });
});

module.exports = router;
