'use strict';

/**
 * scripts/preflight.js — Run before deploy to validate the environment.
 *
 *   node server/scripts/preflight.js
 *
 * Exits non-zero when required production settings are missing. Prints an
 * honest checklist so deployers can act on it (no fake "passed" results).
 */

require('../env'); // load .env before reading process.env
const agoraConfig = require('../services/agora/config');
const { publicBaseUrl, isProd } = require('../baseUrl');

const ENV = agoraConfig.env();
const checks = [];

function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail });
}

function line(c) {
  const mark = c.ok ? '✓' : '✗';
  console.log(`  ${mark} ${c.name}${c.detail ? ' — ' + c.detail : ''}`);
}

const resolvedBase = publicBaseUrl();
check('PORT set', !!process.env.PORT, process.env.PORT || 'defaults to 4321');
check('VY_COOKIE_SECRET changed', !!process.env.VY_COOKIE_SECRET && process.env.VY_COOKIE_SECRET !== 'dev-secret-change-me', process.env.VY_COOKIE_SECRET ? 'set' : 'IN SECURE DEV DEFAULT');
check('AGORA_APP_ID', !!process.env.AGORA_APP_ID, process.env.AGORA_APP_ID ? 'set' : 'missing — mock mode');
check('AGORA_APP_CERTIFICATE', !!process.env.AGORA_APP_CERTIFICATE, process.env.AGORA_APP_CERTIFICATE ? 'set' : 'missing — mock mode');
check('AGORA_CUSTOMER_ID', !!process.env.AGORA_CUSTOMER_ID, process.env.AGORA_CUSTOMER_ID ? 'set' : 'missing — mock mode');
check('AGORA_CUSTOMER_SECRET', !!process.env.AGORA_CUSTOMER_SECRET, process.env.AGORA_CUSTOMER_SECRET ? 'set' : 'missing — mock mode');
check('AGORA_AGENT_ID', !!process.env.AGORA_AGENT_ID, process.env.AGORA_AGENT_ID ? 'set' : 'missing — create agent in Agora Console');
check('AGORA_ENV valid', ['dev', 'staging', 'prod'].includes(ENV), ENV + (process.env.AGORA_ENV ? '' : ' (defaulted: NODE_ENV=production ⇒ prod)'));
const baseOk = isProd() ? /^https:\/\//i.test(resolvedBase) && !/localhost|127\.0\.0\.1/.test(resolvedBase) : !!resolvedBase;
check('PUBLIC_BASE_URL (resolved)', baseOk, resolvedBase + (process.env.PUBLIC_BASE_URL ? '' : ' (auto — set PUBLIC_BASE_URL to override)'));
check('WEBHOOK_SECRET', !!process.env.WEBHOOK_SECRET, process.env.WEBHOOK_SECRET ? 'set' : 'missing — webhooks disabled');

console.log(`\nVyaparVaani — Agora preflight  (AGORA_ENV=${ENV})\n`);
checks.forEach(line);

const failures = checks.filter((c) => !c.ok).length;
const requiredForProd = [
  'PORT set', 'VY_COOKIE_SECRET changed', 'AGORA_APP_ID', 'AGORA_APP_CERTIFICATE',
  'AGORA_CUSTOMER_ID', 'AGORA_CUSTOMER_SECRET', 'AGORA_AGENT_ID', 'AGORA_ENV valid',
  'PUBLIC_BASE_URL (resolved)', 'WEBHOOK_SECRET'
];

if (ENV === 'prod') {
  const missing = checks.filter((c) => requiredForProd.includes(c.name) && !c.ok);
  console.log(`\nResult: ${missing.length ? 'NOT PRODUCTION-READY (' + missing.map((m) => m.name).join(', ') + ') ' : 'Production-ready' }  (${failures} total warnings)`);
  process.exitCode = missing.length ? 1 : 0;
} else {
  console.log(`\nResult: ${failures} warnings (env=${ENV}). ${nowReady() ? 'Ready for live voice.' : 'Still in mock/config-pending mode.'}   (${failures} total issues)`);
  process.exitCode = 0;
}

function nowReady() {
  return !!(process.env.AGORA_APP_ID && process.env.AGORA_CUSTOMER_ID && process.env.AGORA_CUSTOMER_SECRET && process.env.AGORA_AGENT_ID);
}
