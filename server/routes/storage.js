'use strict';

/**
 * routes/storage.js — Consent-gated local audio + export endpoints.
 *
 * POST /api/audio/upload   : save a consent-gated voice-note recording.
 * GET  /api/audio/file/... : serve a stored file (recordings or exports).
 * GET  /api/audit/logs     : read the current user's audit log.
 */

const express = require('express');
const store = require('../db');
const auth = require('../auth');
const storage = require('../services/storage');

const router = express.Router();

function current(req) { return store.get('users', req.session.uid); }

// Upload a consent-gated voice recording (base64 in JSON body; 8mb server limit).
router.post('/api/audio/upload', auth.requireUser, (req, res) => {
  const user = current(req);
  const b = req.body || {};
  if (b.consent !== true) {
    return res.status(403).json({ error: 'consent_required', message: 'Explicit consent is required before saving your voice recording.' });
  }
  const data = b.data; // base64 without prefix
  if (!data) return res.status(400).json({ error: 'no_audio' });
  let buffer;
  try { buffer = Buffer.from(data, 'base64'); } catch (e) { return res.status(400).json({ error: 'bad_audio' }); }
  if (!buffer.length) return res.status(400).json({ error: 'empty_audio' });

  const saved = storage.saveRecording(user.id, {
    buffer,
    ext: b.ext || 'webm',
    mime: b.mime || 'audio/webm',
    note: b.note || ''
  });
  // Attach the recording reference to the active conversation transcript
  const conv = store.get('conversations', user.activeConversationId);
  if (conv && conv.userId === user.id && b.kind !== 'note') {
    conv.messages = conv.messages || [];
    conv.messages.push({
      role: 'assistant',
      text: '🎙️ Recording saved (local storage). ' + (b.note || ''),
      audioUrl: saved.url,
      at: new Date().toISOString()
    });
    store.update('conversations', conv.id, { messages: conv.messages });
  }
  storage.audit(user.id, { action: 'audio.upload', file: saved.fileName, size: saved.size });
  res.json({ ok: true, recording: saved, fileSize: saved.size });
});

// Serve a stored file (recordings, exports) with strict path-safety.
router.get(['/api/audio/file/:userId/:name', '/api/audio/export/:userId/:name'], auth.requireUser, (req, res) => {
  const { userId, name } = req.params;
  if (userId !== req.session.uid) {
    // Admins may read any stored file; owners may only read their own.
    const user = store.get('users', req.session.uid);
    if (!user || user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  }
  const safeName = name.replace(/[^a-zA-Z0-9._-]/g, '');
  const nodePath = require('path');
  // The file may live in recordings OR exports (both under the same user folder).
  let resolved = null;
  for (const sub of ['recordings', 'exports']) {
    const candidate = nodePath.join(storage.ROOT, sub, userId, safeName);
    if (storage.resolvePublic(candidate, userId)) { resolved = candidate; break; }
  }
  if (!resolved) return res.status(404).json({ error: 'not_found' });
  const mime = /\.csv$/i.test(resolved) ? 'text/csv' : (/\.(mp3)$/i.test(resolved) ? 'audio/mpeg' : (/(\.json)$|\.jsonl$/i.test(resolved) ? 'application/json' : 'audio/webm'));
  res.type(mime);
  res.download(resolved, safeName, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: 'unavailable' });
  });
});

// Read the current user's audit log (privacy-friendly local record).
router.get('/api/audit/logs', auth.requireUser, (req, res) => {
  const logs = storage.readAudit(req.session.uid, Number(req.query.limit) || 200);
  res.json({ logs });
});

module.exports = router;
