'use strict';

/**
 * integrations/email.js — "Give Email a Voice" (Resend).
 *
 * Sends real emails through the Resend API when RESEND_API_KEY is set.
 * Every send is persisted to the local `emails` collection (consent-gated by
 * the caller) so the UI can show a sent-mail list. When unconfigured, all
 * calls return honest { configured:false, setup:[...] } payloads.
 */

const store = require('../../db');

const API_KEY = () => process.env.RESEND_API_KEY || '';
const FROM = () => process.env.RESEND_FROM || 'Techo <onboarding@resend.dev>';

function configured() {
  return !!API_KEY();
}

function setupSteps() {
  return [
    'Create a free account at resend.com and generate an API key.',
    'Set RESEND_API_KEY in the server .env (and RESEND_FROM if you have a verified domain), then restart.',
    'Open Techo → Integrations → Email to verify status, then say "send an email…" by voice.'
  ];
}

function status() {
  return { provider: 'resend', configured: configured(), from: configured() ? FROM() : '', setup: configured() ? [] : setupSteps() };
}

function validEmail(s) {
  return typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

async function send(userId, { to, subject, text, consent }) {
  if (!configured()) return { configured: false, setup: setupSteps() };
  if (!consent) return { ok: false, reason: 'consent_required', message: 'Email consent is required before sending.' };
  if (!validEmail(to)) return { ok: false, reason: 'invalid_to', message: 'A valid recipient email address is required.' };
  if (!subject || !String(subject).trim()) return { ok: false, reason: 'missing_subject', message: 'An email subject is required.' };
  if (!text || !String(text).trim()) return { ok: false, reason: 'missing_body', message: 'Email text is required.' };

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + API_KEY(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM(), to: [to.trim()], subject: String(subject).trim(), text: String(text).trim() })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, reason: 'provider_error', message: (json && json.message) || ('Resend HTTP ' + res.status) };
  }
  const now = new Date().toISOString();
  const rec = store.insert('emails', {
    id: store.uid('em'),
    userId,
    to: to.trim(),
    subject: String(subject).trim(),
    text: String(text).trim().slice(0, 2000),
    provider: 'resend',
    providerId: json.id || '',
    consent: true,
    at: now,
    createdAt: now
  });
  return { ok: true, email: { id: rec.id, to: rec.to, subject: rec.subject, at: rec.at, providerId: rec.providerId } };
}

function listSent(userId, limit = 20) {
  const emails = store.find('emails', (e) => e.userId === userId)
    .slice().sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0))
    .slice(0, Math.min(50, limit || 20))
    .map((e) => ({ id: e.id, to: e.to, subject: e.subject, at: e.at }));
  return { configured: configured(), setup: configured() ? [] : setupSteps(), emails };
}

module.exports = { status, configured, setupSteps, send, listSent };
