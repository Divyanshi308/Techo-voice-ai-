'use strict';

/**
 * storage.js — Backend local-drive storage abstraction for VyaparVaani.
 *
 * Browser code cannot write safely to an arbitrary computer folder, so all
 * file-based assets (recordings, generated exports) are stored HERE on the
 * server under a dedicated root with per-user subfolders:
 *
 *   server/storage/
 *     recordings/<userId>/   consent-gated audio recordings
 *     exports/<userId>/      CSV/JSON exports
 *     assets/                shared/generated avatar assets
 *     audit/                 application audit log
 *
 * This is the single place to swap local disk for cloud/object storage or
 * Agora-compatible storage later without touching routes/views.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', 'storage');

function ensure(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const DIRS = {
  recordings: ensure(path.join(ROOT, 'recordings')),
  exports: ensure(path.join(ROOT, 'exports')),
  assets: ensure(path.join(ROOT, 'assets')),
  audit: ensure(path.join(ROOT, 'audit'))
};

function userRecordingDir(userId) {
  return ensure(path.join(DIRS.recordings, safe(userId)));
}
function userExportDir(userId) {
  return ensure(path.join(DIRS.exports, safe(userId)));
}
function safe(id) {
  return String(id || 'anon').replace(/[^a-zA-Z0-9_-]/g, '');
}

/** Persist a decoded audio buffer as a recording for a user (consent handled by caller). */
function saveRecording(userId, { buffer, ext = 'webm', mime = 'audio/webm', note = '' }) {
  const name = `rec_${crypto.randomBytes(6).toString('hex')}.${ext.replace(/[^a-zA-Z0-9]/g, '')}`;
  const full = path.join(userRecordingDir(userId), name);
  fs.writeFileSync(full, buffer);
  return {
    url: `/api/audio/file/${safe(userId)}/${name}`,
    fileName: name,
    mime,
    size: buffer.length,
    note
  };
}

/** Write an export file for a user and return a downloadable URL. */
function saveExport(userId, { buffer, name }) {
  const safeName = String(name || 'export.csv').replace(/[^a-zA-Z0-9._-]/g, '_');
  const full = path.join(userExportDir(userId), safeName);
  fs.writeFileSync(full, buffer);
  return `/api/audio/export/${safe(userId)}/${safeName}`;
}

/** Append a structured audit-log entry (per user, stored as a JSON-lines file). */
function audit(userId, entry) {
  try {
    const file = path.join(DIRS.audit, `${safe(userId)}.log.jsonl`);
    const line = JSON.stringify({ at: new Date().toISOString(), userId, ...entry });
    fs.appendFileSync(file, line + '\n');
  } catch (e) { /* non-fatal */ }
}

/** Read a user's audit log (most recent first). */
function readAudit(userId, limit = 200) {
  try {
    const file = path.join(DIRS.audit, `${safe(userId)}.log.jsonl`);
    if (!fs.existsSync(file)) return [];
    const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).reverse();
    return lines.slice(0, limit).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch (e) { return []; }
}

/** Serve a recording/export file path safely (no path traversal). */
function resolvePublic(p, userId) {
  const allowed = [DIRS.recordings, DIRS.exports];
  const full = path.resolve(p);
  if (!allowed.some((d) => full.startsWith(d))) return null;
  if (!fs.existsSync(full)) return null;
  return full;
}

/** Build a CSV string from an array of row objects. */
function toCSV(rows) {
  if (!rows || !rows.length) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const head = cols.join(',');
  const body = rows.map((r) => cols.map((c) => esc(r[c])).join(',')).join('\n');
  return head + '\n' + body + '\n';
}

module.exports = {
  ROOT,
  DIRS,
  saveRecording,
  saveExport,
  audit,
  readAudit,
  resolvePublic,
  toCSV,
  userRecordingDir
};
