'use strict';

/**
 * agora/token.js — Secure Agora token minting (SERVER-ONLY).
 *
 * Never call this from the frontend. It lives behind authenticated API routes
 * and issues short-lived, channel-scoped tokens. Secrets (customer id / secret,
 * app certificate) are read from process.env only and are never returned.
 *
 * Two token families are supported:
 *   1. RTC tokens  — low-latency audio transport (uses agora-access-token or
 *                    agora-token RtcTokenBuilder).
 *   2. Conversational AI / RCON tokens — for the voice-AI agent channel
 *                    (uses agora-token ConvoAITokenBuilder / ApaasTokenBuilder
 *                    when credentials allow, else reports a clear "needs
 *                    credentials" state — never a fabricated token).
 */

const crypto = require('crypto');

let ConvoAITokenBuilder = null;
let RtcTokenBuilder = null;
let RtcRole = null;
let ApaasTokenBuilder = null;
let RtmTokenBuilder = null;
const Ct = { exp: 0 };

try {
  const at = require('agora-token');
  ConvoAITokenBuilder = at.ConvoAITokenBuilder;
  RtcTokenBuilder = at.RtcTokenBuilder;
  RtcRole = at.RtcRole;
  ApaasTokenBuilder = at.ApaasTokenBuilder;
  RtmTokenBuilder = at.RtmTokenBuilder;
} catch (e) {
  // fall back to the legacy package for RTC only
  try {
    const old = require('agora-access-token');
    RtcTokenBuilder = old.RtcTokenBuilder;
    RtcRole = old.RtcRole;
  } catch (e2) { /* neither installed */ }
}

const AGORA_APP_ID = process.env.AGORA_APP_ID || '';
const AGORA_APP_CERT = process.env.AGORA_APP_CERTIFICATE || '';
const AGORA_CUSTOMER_ID = process.env.AGORA_CUSTOMER_ID || '';
const AGORA_CUSTOMER_SECRET = process.env.AGORA_CUSTOMER_SECRET || '';
const AGORA_AGENT_ID = process.env.AGORA_AGENT_ID || '';

function hasRtc() { return !!(AGORA_APP_ID && AGORA_APP_CERT && RtcTokenBuilder && RtcRole); }
function hasConvo() { return !!(AGORA_APP_ID && AGORA_CUSTOMER_ID && AGORA_CUSTOMER_SECRET && ConvoAITokenBuilder); }
function hasApaas() { return !!(AGORA_APP_ID && AGORA_CUSTOMER_ID && AGORA_CUSTOMER_SECRET && ApaasTokenBuilder); }

/**
 * Mint an RTC token for a given channel + uid.
 * Returns { available:false, ... } clearly when impossible (never a fake token).
 */
function rtcToken(channelName, uid = 0) {
  if (!hasRtc()) {
    return {
      available: false,
      reason: 'rtc_not_configured',
      note: 'Agora RTC token unavailable — AGORA_APP_ID + AGORA_APP_CERTIFICATE (+ token lib) required.'
    };
  }
  const channel = channelName || `vv-${crypto.randomBytes(4).toString('hex')}`;
  const uidInt = Math.floor(uid) || 0;
  // try legacy builder first (buildTokenWithUid exists on both)
  let token;
  try {
    token = RtcTokenBuilder.buildTokenWithUid(AGORA_APP_ID, AGORA_APP_CERT, channel, uidInt, RtcRole.PUBLISHER, 3600);
  } catch (e) {
    return { available: false, reason: 'rtc_token_failed', note: e.message };
  }
  if (!token) return { available: false, reason: 'rtc_token_empty' };
  return { available: true, token, channel, uid: uidInt, appId: AGORA_APP_ID, kind: 'rtc' };
}

/**
 * Mint a Conversational AI (RCON) token for the agent voice channel.
 * Uses Agora's official builder. When credentials are missing, returns a clear
 * "needs credentials" state instead of a fabricated token.
 */
function convoToken(channelName, uid = 0) {
  const channel = channelName || `vv-ai-${crypto.randomBytes(4).toString('hex')}`;
  if (!hasConvo()) {
    return {
      available: false,
      reason: 'convo_not_configured',
      note: 'Agora Conversational AI token unavailable — set AGORA_APP_ID + AGORA_CUSTOMER_ID + AGORA_CUSTOMER_SECRET.',
      channel
    };
  }
  try {
    const token = ConvoAITokenBuilder.buildToken(
      AGORA_APP_ID, AGORA_APP_CERT || '', AGORA_CUSTOMER_ID, AGORA_CUSTOMER_SECRET,
      channel, Math.floor(uid) || 0, Math.floor(Date.now() / 1000) + 3600
    );
    return { available: !!token, token, channel, uid: Math.floor(uid) || 0, appId: AGORA_APP_ID, kind: 'convo' };
  } catch (e) {
    return { available: false, reason: 'convo_token_failed', note: e.message, channel };
  }
}

/**
 * Mint an App Builder (AI Agent / AI Agents) room token.
 * Returns a clear unavailability state when credentials are absent.
 */
function apaasToken(roomUuid, userUuid, role = 0) {
  if (!hasApaas()) {
    return {
      available: false,
      reason: 'apaas_not_configured',
      note: 'Agora App Builder token unavailable — set AGORA_APP_ID + AGORA_CUSTOMER_ID + AGORA_CUSTOMER_SECRET.'
    };
  }
  try {
    const token = ApaasTokenBuilder.buildRoomUserToken(
      AGORA_APP_ID, AGORA_APP_CERT || '', AGORA_CUSTOMER_ID, AGORA_CUSTOMER_SECRET,
      roomUuid || crypto.randomUUID(), userUuid || `usr_${crypto.randomBytes(4).toString('hex')}`, role
    );
    return { available: !!token, token };
  } catch (e) {
    return { available: false, reason: 'apaas_token_failed', note: e.message };
  }
}

/**
 * Single entry point used by the authenticated route. `kind` is one of
 * 'rtc' | 'convo' | 'apaas'. Returns a token ONLY when minting genuinely
 * succeeds; otherwise returns a safe "unavailable" object (no secrets).
 */
function issue(kind, opts = {}) {
  const uid = Number.isFinite(opts.uid) ? opts.uid : undefined;
  switch (kind) {
    case 'convo': return convoToken(opts.channel, uid);
    case 'apaas': return apaasToken(opts.roomUuid, opts.userUuid);
    case 'rtc':
    default: return rtcToken(opts.channel, uid);
  }
}

/** Overall token capability for status surfaces. */
function capability() {
  return {
    rtc: hasRtc(),
    convo: hasConvo(),
    apaas: hasApaas(),
    agentId: AGORA_AGENT_ID || ''
  };
}

module.exports = { issue, rtcToken, convoToken, apaasToken, capability, hasRtc, hasConvo, hasApaas };
