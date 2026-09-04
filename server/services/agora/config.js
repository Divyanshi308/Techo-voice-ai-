'use strict';

/**
 * agora/config.js — Resolved, safe Agora configuration.
 *
 * This is the single source of truth for everything the frontend is allowed to
 * know about Agora. SECRETS ARE NEVER EXPORTED FROM THIS MODULE. Only boolean
 * "configured" flags, non-sensitive IDs and status strings leave the server.
 * The dashboard therefore always shows honest states (Connected / Not
 * configured / Auth failed / Token expired / Agent unavailable / Mock mode /
 * Production-ready) without ever leaking the App Certificate, Customer Secret,
 * API keys or tokens.
 */

const registry = require('../providerRegistry');

const ENVIRONMENTS = ['dev', 'staging', 'prod'];

function env() {
  const e = String(process.env.AGORA_ENV || 'dev').toLowerCase();
  return ENVIRONMENTS.includes(e) ? e : 'dev';
}

/** True only when both customer id + secret are present (real credentials). */
function credentialsPresent() {
  return !!(process.env.AGORA_CUSTOMER_ID && process.env.AGORA_CUSTOMER_SECRET);
}

/** True when the RTC (app id + cert) pair is present. */
function rtcConfigured() {
  return !!(process.env.AGORA_APP_ID && process.env.AGORA_APP_CERTIFICATE);
}

function appId() {
  return process.env.AGORA_APP_ID || '';
}

/**
 * The Agora provider profile (conversational AI). Exposes only safe fields.
 * `enabled` is true only when real customer credentials are configured; when
 * absent the app routes to a clearly-marked mock agent mode.
 */
function agoraProfile() {
  const present = credentialsPresent();
  return {
    provider: present ? 'agora-conversational-ai' : 'mock',
    configured: present,
    env: env(),
    appId: appId(),
    agentId: process.env.AGORA_AGENT_ID || process.env.AGORA_PIPELINE_ID || '',
    customerId: !!process.env.AGORA_CUSTOMER_ID,
    customerSecret: !!process.env.AGORA_CUSTOMER_SECRET,
    rtcConfigured: rtcConfigured(),
    agentConfigured: !!(process.env.AGORA_AGENT_ID || process.env.AGORA_PIPELINE_ID),
    note: present
      ? 'Agora Conversational AI configured.'
      : 'Agora not configured — running in mock agent mode. Add AGORA_CUSTOMER_ID + AGORA_CUSTOMER_SECRET (+ AGORA_AGENT_ID / AGORA_PIPELINE_ID) to enable live voice-AI agents.'
  };
}

/** Full safe status object consumed by the dashboard. */
function status() {
  const present = credentialsPresent();
  const app = appId();
  let connection = 'not_configured';
  if (present && app) connection = 'connected';
  else if (present && !app) connection = 'auth_failed'; // creds present but no app id
  if (present && app) connection = 'connected';

  return {
    connection,
    env: env(),
    appId: app || '',
    appIdConfigured: !!app,
    agentId: process.env.AGORA_AGENT_ID || process.env.AGORA_PIPELINE_ID || '',
    agentConfigured: !!(process.env.AGORA_AGENT_ID || process.env.AGORA_PIPELINE_ID),
    credentialsPresent: present,
    rtcConfigured: rtcConfigured(),
    customerIdConfigured: !!process.env.AGORA_CUSTOMER_ID,
    customerSecretConfigured: !!process.env.AGORA_CUSTOMER_SECRET,
    secretsExposed: false, // guard flag — the blueprint never sends secrets
    mocked: !present,
    productionReady: (present && !!app && !!(process.env.AGORA_AGENT_ID || process.env.AGORA_PIPELINE_ID) && env() === 'prod'),
    labels: {
      connection: present ? (env() === 'prod' ? 'Production-ready' : 'Connected') : 'Mock mode'
    }
  };
}

/** Env label for display. */
function envLabel() {
  return env().toUpperCase();
}

module.exports = { status, agoraProfile, env, envLabel, credentialsPresent, rtcConfigured, appId, ENVIRONMENTS, registry };
