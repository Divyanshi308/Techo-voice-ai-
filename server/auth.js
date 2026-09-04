'use strict';

const crypto = require('crypto');

const SECRET = process.env.VY_COOKIE_SECRET || 'dev-secret-change-me';
if (!process.env.VY_COOKIE_SECRET) {
  console.warn('[auth] VY_COOKIE_SECRET not set — using insecure dev secret.');
}

const COOKIE = 'vv_session';
const TTL_MS = 30 * 24 * 3600 * 1000; // 30 days
// Secure-only cookie when running behind HTTPS (production). Set
// VY_COOKIE_SECURE=1 (or force via NODE_ENV=production + https) to enable.
const COOKIE_SECURE = String(process.env.VY_COOKIE_SECURE) === '1' ||
  (String(process.env.NODE_ENV) === 'production' && String(process.env.PUBLIC_BASE_URL).startsWith('https'));

const sign = (payload) => {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
};

const verify = (token) => {
  try {
    const [body, sig] = token.split('.');
    const expected = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
};

const issueSession = (req, res, user) => {
  const token = sign({
    uid: user.id,
    role: user.role,
    exp: Date.now() + TTL_MS
  });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: TTL_MS,
    secure: COOKIE_SECURE
  });
};

const clearSession = (res) => {
  res.clearCookie(COOKIE);
};

const currentUser = (req) => {
  const token = req.cookies && req.cookies[COOKIE];
  if (!token) return null;
  return verify(token);
};

const requireUser = (req, res, next) => {
  const sess = currentUser(req);
  if (!sess) return res.status(401).json({ error: 'not_authenticated', message: 'Please sign in first.' });
  req.session = sess;
  next();
};

const requireAdmin = (req, res, next) => {
  const sess = currentUser(req);
  if (!sess) return res.status(401).json({ error: 'not_authenticated' });
  if (sess.role !== 'admin') return res.status(403).json({ error: 'forbidden', message: 'Admin access required.' });
  req.session = sess;
  next();
};

module.exports = { issueSession, clearSession, currentUser, requireUser, requireAdmin, verify, sign };