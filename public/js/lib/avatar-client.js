/* lib/avatar-client.js — thin client for the talking-head avatar endpoints.
 * No secrets live here; the server decides configuration state and returns
 * honest { configured:false } when no provider key is present. */

window.AvatarClient = {
  status() { return API.get('/api/avatar/status').catch(() => ({ configured: false, setup: [] })); },
  list() { return API.get('/api/avatar/list').catch(() => ({ configured: false, avatars: [] })); },
  select(payload) { return API.put('/api/avatar/select', payload).catch(() => ({ ok: false })); },
  createTalk(payload) { return API.post('/api/avatar/create-talk', payload).catch((e) => ({ ok: false, message: e.message })); },
  statusOf(videoId) { return API.get('/api/avatar/status/' + encodeURIComponent(videoId)).catch(() => ({ ok: false })); }
};
