'use strict';

/**
 * integrations/calendar.js — "Give Scheduling a Voice".
 *
 * Provider interface with two modes:
 *   - configured: real Google Calendar REST calls (OAuth2 access tokens minted
 *     from the stored per-user refresh token; secrets stay server-side).
 *   - not configured: honest { configured:false, setup:[...] } payloads so the
 *     UI can show "Google Calendar not configured" + setup steps. Nothing is
 *     ever faked — no demo events are invented.
 */

const store = require('../../db');
const { publicBaseUrl } = require('../../baseUrl');

const CLIENT_ID = () => process.env.GOOGLE_CLIENT_ID || '';
const CLIENT_SECRET = () => process.env.GOOGLE_CLIENT_SECRET || '';
const REDIRECT_PATH = '/api/calendar/callback';

function configured() {
  return !!(CLIENT_ID() && CLIENT_SECRET());
}

function baseUrl() {
  return publicBaseUrl();
}

function setupSteps() {
  return [
    'Create a project at console.cloud.google.com and enable the Google Calendar API.',
    'Create OAuth 2.0 credentials (Web application) and add this redirect URI: ' + baseUrl() + REDIRECT_PATH,
    'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the server .env, then restart.',
    'Open Techo → Integrations → Google Calendar → Connect, and approve access.'
  ];
}

function status() {
  return {
    provider: 'google-calendar',
    configured: configured(),
    setup: configured() ? [] : setupSteps(),
    redirectUri: baseUrl() + REDIRECT_PATH
  };
}

/** OAuth consent URL the user visits to connect their calendar. */
function authUrl(state = '') {
  if (!configured()) return { configured: false, setup: setupSteps() };
  const params = new URLSearchParams({
    client_id: CLIENT_ID(),
    redirect_uri: baseUrl() + REDIRECT_PATH,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/calendar.events',
    access_type: 'offline',
    prompt: 'consent',
    state: state || ''
  });
  return { configured: true, url: 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString() };
}

async function tokenRequest(body) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString()
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error_description || json.error || ('OAuth HTTP ' + res.status));
  return json;
}

function tokenRecord(userId) {
  return store.find('integrationTokens', (t) => t.userId === userId && t.provider === 'google')[0] || null;
}

/** Exchange an OAuth code for tokens (user just approved access — explicit consent). */
async function connectWithCode(userId, code) {
  if (!configured()) return { configured: false, setup: setupSteps() };
  const tok = await tokenRequest({
    code,
    client_id: CLIENT_ID(),
    client_secret: CLIENT_SECRET(),
    redirect_uri: baseUrl() + REDIRECT_PATH,
    grant_type: 'authorization_code'
  });
  const existing = tokenRecord(userId);
  const rec = {
    userId,
    provider: 'google',
    scope: 'calendar.events',
    accessToken: tok.access_token || '',
    refreshToken: tok.refresh_token || (existing && existing.refreshToken) || '',
    expiresAt: Date.now() + (Number(tok.expires_in) || 3600) * 1000,
    connectedAt: new Date().toISOString()
  };
  if (existing) store.update('integrationTokens', existing.id, rec);
  else store.insert('integrationTokens', { id: store.uid('it'), ...rec });
  return { ok: true, connected: true };
}

/** Fresh access token via the stored refresh token. */
async function accessToken(userId) {
  const rec = tokenRecord(userId);
  if (!rec || !rec.refreshToken) return { ok: false, reason: 'not_connected', message: 'Google Calendar not connected for this user.' };
  if (rec.accessToken && rec.expiresAt > Date.now() + 60000) return { ok: true, token: rec.accessToken };
  const tok = await tokenRequest({
    client_id: CLIENT_ID(),
    client_secret: CLIENT_SECRET(),
    refresh_token: rec.refreshToken,
    grant_type: 'refresh_token'
  });
  store.update('integrationTokens', rec.id, {
    accessToken: tok.access_token || '',
    expiresAt: Date.now() + (Number(tok.expires_in) || 3600) * 1000
  });
  return { ok: true, token: tok.access_token };
}

async function gfetch(userId, path, opts = {}) {
  const at = await accessToken(userId);
  if (!at.ok) return at;
  const res = await fetch('https://www.googleapis.com/calendar/v3' + path, {
    ...opts,
    headers: { Authorization: 'Bearer ' + at.token, 'Content-Type': 'application/json', ...(opts.headers || {}) }
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, reason: 'provider_error', message: (json.error && json.error.message) || ('Calendar HTTP ' + res.status) };
  return { ok: true, data: json };
}

async function listUpcoming(userId, maxResults = 10) {
  if (!configured()) return { configured: false, setup: setupSteps(), events: [] };
  const now = new Date().toISOString();
  const r = await gfetch(userId, '/calendars/primary/events?timeMin=' + encodeURIComponent(now) +
    '&maxResults=' + Math.min(25, maxResults || 10) + '&singleEvents=true&orderBy=startTime');
  if (!r.ok) return { configured: true, connected: !!tokenRecord(userId), ...r, events: [] };
  const events = (r.data.items || []).map((e) => ({
    id: e.id, title: e.summary || '(no title)',
    start: (e.start && (e.start.dateTime || e.start.date)) || '',
    end: (e.end && (e.end.dateTime || e.end.date)) || '',
    link: e.htmlLink || ''
  }));
  return { configured: true, connected: true, events };
}

async function createEvent(userId, { title, start, end, description }) {
  if (!configured()) return { configured: false, setup: setupSteps() };
  if (!title || !start) return { ok: false, reason: 'missing_fields', message: 'Event title and start time are required.' };
  const body = {
    summary: title,
    description: description || 'Created by voice via Techo.',
    start: { dateTime: start },
    end: { dateTime: end || start }
  };
  const r = await gfetch(userId, '/calendars/primary/events', { method: 'POST', body: JSON.stringify(body) });
  if (!r.ok) return { configured: true, ...r };
  return {
    ok: true,
    event: { id: r.data.id, title: r.data.summary, start, end: end || start, link: r.data.htmlLink || '' }
  };
}

function disconnect(userId) {
  const rec = tokenRecord(userId);
  if (rec) store.remove('integrationTokens', rec.id);
  return { ok: true, connected: false };
}

module.exports = { status, configured, setupSteps, authUrl, connectWithCode, listUpcoming, createEvent, disconnect, tokenRecord };
