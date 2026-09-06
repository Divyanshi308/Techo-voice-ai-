'use strict';

/**
 * baseUrl.js — single source of truth for the app's public URL.
 *
 * Precedence:
 *   1. PUBLIC_BASE_URL  (explicit, e.g. set in the hosting dashboard)
 *   2. VY_BASE_URL      (legacy alias)
 *   3. RENDER_EXTERNAL_URL  (auto-set by Render for the live service)
 *   4. Default: https://techo-voice-ai.onrender.com in production,
 *      http://localhost:4321 elsewhere.
 *
 * Critical rule: in production the app NEVER uses a localhost/insecure base
 * URL. Every OAuth redirect_uri, webhook callback and dashboard "base URL"
 * surfaces through this function, so a missing misconfigured env var can never
 * make the live site point back to a dev machine.
 */

const DEFAULT_PROD = 'https://techo-voice-ai.onrender.com';
const DEFAULT_DEV = 'http://localhost:4321';

function isProd() {
  return String(process.env.NODE_ENV) === 'production';
}

function stripTrailingSlash(u) {
  return String(u || '').replace(/\/+$/, '');
}

function publicBaseUrl() {
  const prod = isProd();
  const candidates = [
    process.env.PUBLIC_BASE_URL,
    process.env.VY_BASE_URL,
    process.env.RENDER_EXTERNAL_URL
  ].filter(Boolean);

  for (const c of candidates) {
    const clean = stripTrailingSlash(c);
    if (!prod) return clean;
    if (/^https:\/\//i.test(clean) && !/localhost|127\.0\.0\.1|\.local/i.test(clean)) return clean;
  }

  if (prod) {
    console.warn('[baseUrl] production without a valid https PUBLIC_BASE_URL — defaulting to ' + DEFAULT_PROD);
    return DEFAULT_PROD;
  }
  return DEFAULT_DEV;
}

module.exports = { publicBaseUrl, isProd, DEFAULT_PROD, DEFAULT_DEV };