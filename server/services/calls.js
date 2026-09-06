'use strict';

/**
 * calls.js — Call scheduling with an honest real-vs-simulated label.
 *
 * The telephony backend is API-ready (swap in Telnyx/Twilio via placeOutboundCall)
 * but the MVP ships with a clearly-marked simulator. Scheduling here:
 *   - creates a `calls` record with channel 'mock-voice' + simulated:true, and
 *   - creates a matching `reminder` (method 'voice-call') so the reminders tick
 *     fires the mock dial + in-app/email notification when the call is due.
 * Nothing is ever dialled without explicit consent.
 */

const store = require('../db');
const telephony = require('./telephony');
const emailSvc = require('./integrations/email');

function validEmail(s) {
  return typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

/**
 * Schedule an outbound call (record + reminder).
 * @param {object} args { userId, title, due, humanDue, notes?, participant?, notifyEmail?, consent }
 */
function schedule({ userId, title, due, humanDue, notes, participant, notifyEmail, consent }) {
  if (!title || !due) {
    return { ok: false, reason: 'missing_fields', message: 'Call title and due time are required.' };
  }
  const now = new Date().toISOString();
  const consentOk = consent === true;

  const reminder = store.insert('reminders', {
    userId,
    title: String(title).slice(0, 60),
    notes: notes || '',
    due,
    humanDue: humanDue || '',
    priority: 'medium',
    kind: 'call',
    method: 'voice-call',
    status: 'pending',
    consent: consentOk,
    notifyEmail: validEmail(notifyEmail) ? notifyEmail.trim() : '',
    createdAt: now
  });

  const record = store.insert('calls', {
    userId,
    contactId: null,
    kind: 'scheduled-call',
    consent: consentOk,
    status: 'scheduled',
    channel: telephony.MOCK_PROVIDER ? 'mock-voice' : 'real-voice',
    simulated: telephony.MOCK_PROVIDER,
    scheduled: due,
    at: null,
    durationSec: null,
    transcript: '',
    title: String(title).slice(0, 60),
    participant: participant || '',
    notifyEmail: validEmail(notifyEmail) ? notifyEmail.trim() : '',
    reminderId: reminder.id,
    scheduledAt: now
  });

  return {
    ok: true,
    simulated: !!telephony.MOCK_PROVIDER,
    channel: telephony.MOCK_PROVIDER ? 'mock-voice' : 'real-voice',
    call: store.get('calls', record.id),
    reminder
  };
}

function list(userId) {
  return store.find('calls', (c) => c.userId === userId)
    .slice().sort((a, b) => new Date(b.scheduledAt || 0) - new Date(a.scheduledAt || 0));
}

function get(id) {
  return store.get('calls', id);
}

function configured() {
  return telephony.MOCK_PROVIDER === false;
}

function status() {
  return {
    provider: telephony.MOCK_PROVIDER ? 'mock-voice' : 'real-voice',
    configured: configured(),
    simulated: !!telephony.MOCK_PROVIDER,
    setup: telephony.MOCK_PROVIDER
      ? ['Set TELNYX_API_KEY (and a messaging profile) in the server .env to place real outbound calls.']
      : []
  };
}

module.exports = { schedule, list, get, configured, status, validEmail };