'use strict';

/**
 * services/avatar/provider.js — provider interface + configuration gate.
 *
 * Decides which talking-head provider is active and ENFORCES the "never fake a
 * connected state" rule. When HeyGen is not configured every call returns honest
 * { configured:false, setup:[...] } and the frontend shows "Avatar not
 * configured" while the voice conversation keeps working untouched.
 *
 * Secrets (the API key) NEVER leave the server — only the provider name and
 * configured boolean are ever serialized.
 */

const catalog = require('./catalog');

const PROVIDERS = {
  heygen: 'heygen',
  none: 'none'
};

function configuredProvider() {
  const p = String(process.env.AVATAR_PROVIDER || 'heygen').toLowerCase().trim();
  if (p === 'none' || p === '' || p === 'mock') return PROVIDERS.none;
  if (p && !/^[a-z0-9_-]+$/.test(p)) return PROVIDERS.none;
  return PROVIDERS.heygen;
}

function configured() {
  if (configuredProvider() === PROVIDERS.none) return false;
  const key = String(process.env.HEYGEN_API_KEY || '').trim();
  return key.length > 0;
}

function setupSteps() {
  return [
    'Create a free HeyGen account at heygen.com and open the API settings.',
    'Generate an API key and add it to the server .env as HEYGEN_API_KEY (keep it secret — never commit .env).',
    'Optionally set AVATAR_PROVIDER=heygen (default). Restart the server.',
    'Open Techo → Avatar Studio → pick an avatar, then start a voice conversation. The selected avatar will play the AI replies.'
  ];
}

function status() {
  const p = configuredProvider();
  const on = configured();
  return {
    provider: p === PROVIDERS.none ? 'none' : 'heygen',
    configured: on,
    setup: on ? [] : setupSteps()
  };
}

/**
 * getProvider() → the live provider adapter.
 * Returns null when not configured (callers then return the honest payload).
 */
function getProvider() {
  if (!configured()) return null;
  // Lazy require so a missing/invalid key never breaks startup of other routes.
  return require('./heygen');
}

module.exports = { configured, configureProviderCheck: configuredProvider, status, getProvider, catalog, PROVIDERS };
