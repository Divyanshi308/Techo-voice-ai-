'use strict';

const express = require('express');
const store = require('../db');
const auth = require('../auth');

const router = express.Router();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const BASE_URL = process.env.PUBLIC_BASE_URL || process.env.VY_BASE_URL || 'http://localhost:4321';
const REDIRECT_URI = `${BASE_URL}/auth/google/callback`;

const googleConfigured = Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);

const sanitizeUser = (u) => {
  if (!u) return null;
  const { ...safe } = u;
  safe.messages = undefined;
  return { ...safe, business: u.business || { notes: [] } };
};

const findOrCreate = (profile, provider) => {
  let user = store.findOne('users', (x) => x.email === profile.email);
  if (!user) {
    user = store.insert('users', {
      email: profile.email,
      name: profile.name || profile.email.split('@')[0],
      role: 'owner',
      provider,
      picture: profile.picture || '',
      phone: '',
      preferredLang: 'hing',
      uiLang: 'hi',
      avatarId: 'av_didi',
      voiceId: 'v_roopa',
      themeId: 'th_sunrise',
      themeCustom: null,
      bio: '',
      consents: {
        transcriptStore: false, voiceNote: false, calls: false, reminders: false,
        contactOthers: false, dataForReviews: false, aiAnalysis: false
      },
      business: { notes: [] },
      createdAt: new Date().toISOString()
    });
  } else if (provider === 'google' && profile.picture) {
    user = store.update('users', user.id, { picture: profile.picture, name: profile.name || user.name });
  }
  return user;
};

// OAuth provider status (real vs clearly-marked mock mode)
router.get('/api/auth/google', (req, res) => {
  if (!googleConfigured) {
    return res.json({ mode: 'mock', configured: false, message: 'Google OAuth not configured (GOOGLE_CLIENT_ID/SECRET unset). Using clearly-marked mock Google sign-in.' });
  }
  const qs = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    prompt: 'select_account'
  });
  res.json({ mode: 'real', configured: true, url: `https://accounts.google.com/o/oauth2/v2/auth?${qs}` });
});

// Real Google OAuth callback
router.get('/auth/google/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code) return res.redirect('/?auth=error');
  try {
    const tokRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI, grant_type: 'authorization_code'
      })
    });
    const tok = await tokRes.json();
    if (!tok.access_token) throw new Error(tok.error || 'token exchange failed');
    const infoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${tok.access_token}` }
    });
    const info = await infoRes.json();
    const user = findOrCreate({ email: info.email, name: info.name, picture: info.picture }, 'google');
    auth.issueSession(req, res, user);
    res.redirect('/?auth=ok');
  } catch (err) {
    console.error('[auth:google]', err.message);
    res.redirect('/?auth=error');
  }
});

// Demo sign-in (mock of Google auth, clearly marked in the UI)
router.post('/api/auth/demo', (req, res) => {
  // Grab the email set by the mock Google screen; default to the seeded owner
  const email = (req.body && req.body.email) || 'demo@vyaparvaani.local';
  const profile = {
    email,
    name: email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    picture: ''
  };
  const user = findOrCreate(profile, 'demo');
  auth.issueSession(req, res, user);
  res.json({ ok: true, mode: 'demo', user: sanitizeUser(user) });
});

router.post('/api/auth/logout', (req, res) => {
  auth.clearSession(res);
  res.json({ ok: true });
});

router.get('/api/auth/me', (req, res) => {
  const sess = auth.currentUser(req);
  if (!sess) return res.status(401).json({ error: 'not_authenticated' });
  const user = store.get('users', sess.uid);
  if (!user) return res.status(401).json({ error: 'not_authenticated' });
  res.json({ user: sanitizeUser(user) });
});

router.get('/api/auth/state', (req, res) => {
  const settings = store.get('settings', 'global') || {};
  res.json({
    googleConfigured,
    mockMode: settings.mockMode,
    appName: settings.appName || 'Techo',
    disclaimer: settings.disclaimer || '',
    mockNotes: settings.mockNotes || {}
  });
});

module.exports = router;