'use strict';

/**
 * env.js — minimal .env loader (no external dependency).
 *
 * Reads a `.env` file from the project root (next to server/) into
 * process.env WITHOUT overwriting variables that are already set (e.g. from a
 * real environment / secret manager). It does NOT support shell-style
 * interpolation or quoted multiline values — keep values simple.
 *
 * This is deliberately tiny so the backend can read AGORA_* (and other)
 * secrets from a local `.env` that is git-ignored. Secrets never leave the
 * server; the frontend only ever receives safe status + short-lived tokens.
 */

const fs = require('fs');
const path = require('path');

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    // strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (Object.prototype.hasOwnProperty.call(process.env, key)) continue;
    process.env[key] = value;
  }
}

loadEnv();

module.exports = { loadEnv };
