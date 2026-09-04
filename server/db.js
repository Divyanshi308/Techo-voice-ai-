'use strict';

/**
 * db.js — Tiny JSON-file-backed data store for the VyaparVaani MVP.
 *
 * Deliberately dependency-free: each collection lives in its own file under
 * ./data so they are easy to inspect and back up. Writes are queued and
 * flushed asynchronously. For production this would be swapped for
 * PostgreSQL/Redis via the same repository interface.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

class Store {
  constructor(opts = {}) {
    this.dir = opts.dir || DATA_DIR;
    this.cache = new Map(); // collection name -> array of records
    this.pendingWrites = new Map(); // collection name -> timer
    this.indices = new Map(); // collection -> Map(id -> index)
    this.initialized = false;
  }

  _collectionFile(name) {
    return path.join(this.dir, `${name}.json`);
  }

  _load(name) {
    const file = this._collectionFile(name);
    try {
      if (!fs.existsSync(file)) return [];
      const raw = fs.readFileSync(file, 'utf8');
      const data = JSON.parse(raw);
      return Array.isArray(data) ? data : [];
    } catch (err) {
      console.error(`[db] failed to load collection "${name}":`, err.message);
      return [];
    }
  }

  init(collections) {
    for (const name of collections) {
      if (!this.cache.has(name)) {
        const records = this._load(name);
        this.cache.set(name, records);
        this._rebuildIndex(name);
      }
    }
    this.initialized = true;
  }

  _rebuildIndex(name) {
    const idx = new Map();
    const records = this.cache.get(name) || [];
    records.forEach((rec, i) => {
      if (rec && rec.id) idx.set(rec.id, i);
    });
    this.indices.set(name, idx);
  }

  _persist(name) {
    if (this.pendingWrites.has(name)) {
      clearTimeout(this.pendingWrites.get(name));
    }
    const timer = setTimeout(() => {
      this.pendingWrites.delete(name);
      const records = this.cache.get(name) || [];
      const file = this._collectionFile(name);
      const tmp = `${file}.tmp`;
      fs.writeFile(tmp, JSON.stringify(records, null, 2), (err) => {
        if (err) {
          console.error(`[db] write failed for "${name}":`, err.message);
          return;
        }
        fs.rename(tmp, file, (e) => {
          if (e) console.error(`[db] rename failed for "${name}":`, e.message);
        });
      });
    }, 30);
    this.pendingWrites.set(name, timer);
  }

  all(name) {
    return (this.cache.get(name) || []).slice();
  }

  find(name, predicate) {
    return (this.cache.get(name) || []).filter(predicate);
  }

  findOne(name, predicate) {
    return (this.cache.get(name) || []).find(predicate) || null;
  }

  get(name, id) {
    const idx = this.indices.get(name);
    if (idx && idx.has(id)) {
      return this.cache.get(name)[idx.get(id)] || null;
    }
    return this.findOne(name, (r) => r.id === id) || null;
  }

  _ensure(name) {
    if (!this.cache.has(name)) {
      this.cache.set(name, this._load(name));
      this._rebuildIndex(name);
    }
    return this.cache.get(name);
  }

  uid(prefix = 'id') {
    return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
  }

  insert(name, record) {
    const col = this._ensure(name);
    if (!record.id) record.id = this.uid(name.slice(0, 3));
    if (!record.createdAt) record.createdAt = new Date().toISOString();
    col.push(record);
    this._rebuildIndex(name);
    this._persist(name);
    return record;
  }

  update(name, id, patch) {
    const idx = this.indices.get(name);
    const col = this.cache.get(name) || [];
    if (idx && idx.has(id)) {
      const rec = col[idx.get(id)];
      Object.assign(rec, patch, { updatedAt: new Date().toISOString() });
      this._persist(name);
      return rec;
    }
    const rec = col.find((r) => r.id === id);
    if (rec) {
      Object.assign(rec, patch, { updatedAt: new Date().toISOString() });
      this._persist(name);
    }
    return rec;
  }

  remove(name, id) {
    const col = this.cache.get(name) || [];
    const before = col.length;
    const next = col.filter((r) => r.id !== id);
    const removed = before !== next.length;
    if (removed) {
      this.cache.set(name, next);
      this._rebuildIndex(name);
      this._persist(name);
    }
    return removed;
  }

  removeWhere(name, predicate) {
    const col = this.cache.get(name) || [];
    const next = col.filter((r) => !predicate(r));
    const removed = next.length !== col.length;
    if (removed) {
      this.cache.set(name, next);
      this._rebuildIndex(name);
      this._persist(name);
    }
    return removed;
  }
}

module.exports = new Store();