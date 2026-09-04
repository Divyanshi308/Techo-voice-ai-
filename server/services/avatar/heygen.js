'use strict';

/**
 * services/avatar/heygen.js — HeyGen talking-head avatar provider (v3 API).
 *
 * Uses the current HeyGen API (post-v2, sunset of /v2/avatars is 2026-10-31):
 *   - listAvatars()   → avatar LOOKS via GET /v3/avatars/looks (owned + catalog).
 *   - createTalk()    → POST /v3/videos (type "avatar", script + voice) and
 *                       return { videoId, status } (async job).
 *   - status(videoId) → poll GET /v3/videos/{id} → { status, url? }, status is
 *                       processing | ready | failed.
 *
 * All calls are wrapped so a provider failure degrades to a clear, honest error
 * and NEVER breaks the surrounding voice conversation. The API key stays
 * server-side and is never serialized to clients.
 */

const API_BASE = 'https://api.heygen.com';

const KEY = () => String(process.env.HEYGEN_API_KEY || '').trim();

function headers() {
  return {
    'X-Api-Key': KEY(),
    'Content-Type': 'application/json'
  };
}

async function fetchJson(url, opts) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (e) { json = null; }
  if (!res.ok) {
    const e = (json && json.error) || {};
    const msg = e.message || json && json.message || ('HeyGen HTTP ' + res.status);
    const err = new Error(msg);
    err.status = res.status;
    err.code = e.code || null;
    err.body = json;
    throw err;
  }
  return json;
}

/**
 * Create a talking-avatar video of `text` spoken by the avatar.
 * Returns { videoId, status } where status is 'waiting'|'processing' or an
 * honest { ok:false, reason, message } on provider error (e.g. no credits).
 */
async function createTalk({ text, avatarId, voiceId }) {
  const avatar = require('./catalog').get(avatarId);
  const avatar_id = (avatar && avatar.id) || avatarId;
  if (!avatar_id) {
    return { ok: false, reason: 'invalid_avatar', message: 'No such avatar id.' };
  }
  const script = String(text).slice(0, 500);
  if (!script.trim()) {
    return { ok: false, reason: 'empty_text', message: 'text is required.' };
  }
  const body = {
    type: 'avatar',
    avatar_id,
    script,
    aspect_ratio: 'auto',
    resolution: '720p',
    title: 'Techo reply'
  };
  // Prefer an explicit voice, else the catalog's default voice for the look.
  const vid = voiceId || (avatar && avatar.voiceId) || null;
  if (vid) body.voice_id = vid;

  let json;
  try {
    json = await fetchJson(`${API_BASE}/v3/videos`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body)
    });
  } catch (e) {
    const reason = e.code === 'insufficient_credit' ? 'insufficient_credit' : 'provider_error';
    const message = e.code === 'insufficient_credit'
      ? 'Your HeyGen account has no credits, so talking-video generation is paused. Voice still works fine.'
      : e.message;
    return { ok: false, reason, message, code: e.code || null };
  }
  const data = (json && json.data) || {};
  const videoId = data.video_id;
  if (!videoId) {
    return { ok: false, reason: 'provider_error', message: (json && json.message) || 'No video id returned.' };
  }
  const s = String(data.status || 'waiting').toLowerCase();
  return { ok: true, videoId: String(videoId), status: s === 'completed' ? 'ready' : 'processing' };
}

/**
 * Poll generation status. Returns { status, url? } where status is one of
 * processing | ready | failed. Never throws; on provider error returns failed.
 */
async function status(videoId) {
  if (!videoId) return { status: 'failed', reason: 'missing_video_id' };
  let json;
  try {
    json = await fetchJson(`${API_BASE}/v3/videos/${encodeURIComponent(videoId)}`, {
      method: 'GET',
      headers: headers()
    });
  } catch (e) {
    return { status: 'failed', reason: 'provider_error', message: e.message };
  }
  const data = (json && json.data) || {};
  const s = String(data.status || 'processing').toLowerCase();
  if (s === 'completed' || (data.video_url && data.video_url.length)) {
    return { status: 'ready', url: data.video_url || null, id: data.video_id || videoId };
  }
  if (s === 'failed' || s === 'error' || s === 'cancelled') {
    const reason = (data.error && data.error.message) || data.reason || 'Generation failed.';
    return { status: 'failed', reason, message: reason };
  }
  return { status: 'processing', id: videoId };
}

/**
 * List avatar looks available to this account. The curated catalog (the
 * account's own selected avatars) is always returned as the primary set. When
 * configured, additional remote looks owned by the account are appended (by
 * name, dedup) so users can pick more without floods of near-identical cards.
 * Falls back to just the catalog on any provider error.
 */
async function listAvatars() {
  const catalog = require('./catalog');
  const local = catalog.all();
  let remote = [];
  try {
    const json = await fetchJson(`${API_BASE}/v3/avatars/looks`, { method: 'GET', headers: headers() });
    remote = ((json && json.data) || [])
      .filter((a) => a.id)
      .map((a) => ({
        id: a.id,
        name: a.name || a.id,
        gender: a.gender || 'neutral',
        thumbnail: a.preview_image_url || a.preview_video_url || null,
        lang: 'en'
      }));
  } catch (e) {
    remote = [];
  }
  // Append remote looks that aren't already in the catalog, dedup by name so a
  // single character's many "looks" don't flood the picker.
  const seen = new Set(local.map((a) => a.name));
  for (const r of remote) {
    if (!r.name) continue;
    if (seen.has(r.name)) continue;
    if (local.some((l) => l.id === r.id)) continue;
    seen.add(r.name);
    local.push(r);
  }
  return { avatars: local };
}

module.exports = { createTalk, status, listAvatars };
