'use strict';

/**
 * telephony.js — Mock outbound call service (API-ready interface).
 *
 * In production this wraps a telephony provider (e.g. Telnyx/Twilio) via the
 * same async interface: `placeOutboundCall(record)`. For the MVP it simulates
 * call progression (scheduled → dialing → ringing → completed / no-answer /
 * failed) with timers, writes records to the store, and (optionally) produces
 * a call transcript via the survey engine when mock transcripts are enabled.
 */

const store = require('../db');

const MOCK_PROVIDER = true; // set to false when wiring a real telephony backend

const STATES = ['scheduled', 'dialing', 'ringing', 'in-progress', 'completed', 'no-answer', 'failed'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const simulate = async (call, transcript = '') => {
  if (!MOCK_PROVIDER) return call; // interface no-op when provider disabled
  try {
    store.update('calls', call.id, { status: 'dialing', startedAt: new Date().toISOString() });
    await sleep(900);
    store.update('calls', call.id, { status: 'ringing' });
    // Random-ish outcome using call id hash for determinism
    let h = 0;
    for (const ch of String(call.id)) h = (h * 31 + ch.charCodeAt(0)) % 100;
    if (h < 15) {
      store.update('calls', call.id, { status: 'no-answer', at: new Date().toISOString() });
      return store.get('calls', call.id);
    }
    if (h >= 93) {
      store.update('calls', call.id, { status: 'failed', at: new Date().toISOString() });
      return store.get('calls', call.id);
    }
    store.update('calls', call.id, { status: 'in-progress' });
    const durationSec = 40 + (h % 9) * 17;
    await sleep(800 + (h % 6) * 250);
    store.update('calls', call.id, {
      status: 'completed',
      at: new Date().toISOString(),
      durationSec,
      transcript: transcript || ''
    });
  } catch (err) {
    console.error('[telephony] simulate error:', err.message);
    store.update('calls', call.id, { status: 'failed' });
  }
  return store.get('calls', call.id);
};

const placeOutboundCall = async ({ userId, contactId, kind, surveyId, consent, scheduledAt, transcript }) => {
  if (!consent) {
    throw Object.assign(new Error('Consent is required before placing any outbound call.'), { code: 403 });
  }
  const record = store.insert('calls', {
    userId, contactId, kind, surveyId, consent,
    status: 'scheduled',
    channel: MOCK_PROVIDER ? 'mock-voice' : 'real-voice',
    scheduled: scheduledAt || new Date().toISOString(),
    at: null, durationSec: null, transcript: transcript || ''
  });
  // Fire-and-forget simulation
  void simulate(record, transcript);
  return store.get('calls', record.id);
};

const getCall = (id) => store.get('calls', id);
const listCalls = (userId) => store.find('calls', (c) => c.userId === userId);
const listAllCalls = () => store.all('calls');

module.exports = { placeOutboundCall, getCall, listCalls, listAllCalls, STATES, MOCK_PROVIDER };