'use strict';

/**
 * agentTools.js — Executable actions the Agora voice-AI agent can trigger.
 *
 * The agent itself holds the LLM and answers the user. This module lets that
 * same voice conversation DO things on our backend:
 *
 *   - Direct service calls: the agent's LLM can be configured (Agora Console →
 *     Services → HTTP) to POST to /api/agent/tool; this module runs the action.
 *   - Transcript watcher: every user turn of a live session is scanned; when a
 *     fully-specified side-effect is requested (send an email, schedule a call,
 *     add a calendar event, record a sale/expense, set a reminder) it is
 *     executed here so the demo works even before the agent's HTTP service is
 *     configured. Results appear as in-app notifications (never spoken over the
 *     agent, which already narrated its own answer).
 *
 * Everything stays consent-gated and honest: real emails/calendar go out for
 * real; calls are recorded as honestly labelled simulated (channel 'mock-voice')
 * until a telephony provider key is configured.
 */

const store = require('../db');
const calendarSvc = require('./integrations/calendar');
const emailSvc = require('./integrations/email');
const callsSvc = require('./calls');
const aiEngine = require('./aiEngine');

function notify(userId, title, body, extra) {
  return store.insert('notifications', {
    userId,
    kind: 'agent-action',
    title,
    body,
    read: false,
    at: new Date().toISOString(),
    ...(extra || {})
  });
}

/** Record an executed action for a user so the UI can list recent agent actions. */
function recordAction(userId, action) {
  const rec = {
    userId,
    kind: 'agent-action',
    action: action.name,
    ok: !!action.ok,
    label: action.label || '',
    simulated: !!action.simulated,
    detail: action.detail || {},
    at: new Date().toISOString()
  };
  store.insert('agentActions', rec);
  return rec;
}

const EXECUTORS = {
  send_email: async (userId, p) => {
    const r = await emailSvc.send(userId, { to: (p && p.to) || '', subject: (p && p.subject) || '', text: (p && p.body) || (p && p.text) || '', consent: true });
    if (!r.ok) return { name: 'send_email', ok: false, label: 'Email failed — ' + (r.message || r.reason), detail: { reason: r.reason || 'failed' } };
    return { name: 'send_email', ok: true, label: `Email "…" sent to ${r.email.to}`, detail: { to: r.email.to, subject: r.email.subject, emailId: r.email.id } };
  },

  create_calendar_event: async (userId, p) => {
    if (!p || !p.title || !p.start) return { name: 'create_calendar_event', ok: false, label: 'Calendar event needs a title and start time.', detail: {} };
    const r = await calendarSvc.createEvent(userId, { title: p.title, start: p.start, end: p.end || p.start, description: (p && p.description) || 'Created by voice via Techo.' });
    if (!r.ok) {
      if (r.reason === 'provider_error' || r.configured === false) {
        // Honest fallback: keep it as a local reminder, tell the user.
        store.insert('reminders', { userId, title: p.title, notes: p.description || '', due: p.start, humanDue: '', priority: 'medium', status: 'pending', kind: 'todo', method: 'in-app', consent: true, createdAt: new Date().toISOString() });
        return { name: 'create_calendar_event', ok: false, simulated: true, label: 'Calendar not connected — saved as a local reminder instead.', detail: { reason: r.reason || 'not_connected' } };
      }
      return { name: 'create_calendar_event', ok: false, label: 'Calendar event failed — ' + (r.message || r.reason), detail: {} };
    }
    return { name: 'create_calendar_event', ok: true, label: `Meeting "${r.event.title}" added to your calendar.`, detail: { eventId: r.event.id, title: r.event.title, start: r.event.start } };
  },

  read_calendar_events: async (userId, p) => {
    const r = await calendarSvc.listUpcoming(userId, Number((p && p.limit) || 5));
    if (!r.ok || r.events === undefined && r.configured === false) {
      return { name: 'read_calendar_events', ok: false, label: 'Calendar not available — ' + ((r && r.message) || 'not connected'), detail: { configured: !!(r && r.configured), connected: !!(r && r.connected) } };
    }
    const events = (r.events || []).slice(0, 5);
    return { name: 'read_calendar_events', ok: true, label: events.length ? `${events.length} upcoming meeting${events.length > 1 ? 's' : ''} shown in-app.` : 'No upcoming meetings.', detail: { events } };
  },

  schedule_call: (userId, p) => {
    if (!p || !p.title || !p.when) return { name: 'schedule_call', ok: false, label: 'Call needs a title and a time.', detail: {} };
    const r = callsSvc.schedule({
      userId, title: p.title, due: p.when, humanDue: p.humanDue || '', notes: p.notes || '',
      participant: p.participant || '', notifyEmail: p.notifyEmail || '', consent: true
    });
    return {
      name: 'schedule_call', ok: !!r.ok, simulated: !!r.simulated,
      label: r.ok ? `Call "${p.title}" scheduled (${r.simulated ? 'simulated' : 'real'} telephony).` : (r.message || 'failed'),
      detail: { callId: r.call && r.call.id, simulated: !!r.simulated, channel: r.channel }
    };
  },

  create_reminder: (userId, p) => {
    if (!p || !p.title || !p.due) return { name: 'create_reminder', ok: false, label: 'Reminder needs a title and a time.', detail: {} };
    const rec = store.insert('reminders', {
      userId, title: String(p.title).slice(0, 60), notes: p.notes || '', due: p.due, humanDue: p.humanDue || '',
      priority: p.priority || 'medium', kind: p.kind || 'todo', method: p.method || 'in-app',
      status: 'pending', consent: true, notifyEmail: (p.notifyEmail && callsSvc.validEmail(p.notifyEmail)) ? p.notifyEmail : '',
      createdAt: new Date().toISOString()
    });
    return { name: 'create_reminder', ok: true, label: `Reminder "${rec.title}" set.`, detail: { reminderId: rec.id, due: rec.due } };
  },

  record_transaction: (userId, p) => {
    const type = (p && (p.type === 'sale' || p.type === 'expense')) ? p.type : null;
    const amount = Number((p && p.amount) || Number(p.money));
    if (!type || !amount || isNaN(amount)) return { name: 'record_transaction', ok: false, label: 'Transaction needs a type (sale/expense) and an amount.', detail: {} };
    const rec = store.insert('transactions', {
      userId, type, amount: Math.round(amount), note: (p && p.note) || (type === 'sale' ? 'Sale recorded via voice agent' : 'Expense recorded via voice agent'),
      topic: 'general', at: new Date().toISOString(), via: 'voice', source: 'agent'
    });
    return { name: 'record_transaction', ok: true, label: `Recorded ${type} of ₹${Math.round(amount)}.`, detail: { transactionId: rec.id, type, amount: Math.round(amount) } };
  }
};

/**
 * Run a single agent action. Used by POST /api/agent/tool (agent HTTP service)
 * and the transcript watcher. Always records a notification + action log.
 */
async function execute(userId, name, params) {
  const fn = EXECUTORS[name];
  if (!fn) return { ok: false, reason: 'unknown_action', message: 'Unknown agent action: ' + name, label: '' };
  let result;
  try {
    result = await fn(userId, params || {});
  } catch (e) {
    result = { name, ok: false, label: 'Action error: ' + e.message, detail: {} };
  }
  if (result.label) notify(userId, 'Voice agent action', result.label);
  recordAction(userId, result);
  return result;
}

/* ------------------------------------------------------------------ *
 * Transcript watcher — scan user turns of a live session for complete
 * side-effect requests and execute them (idempotent per session+index).
 * ------------------------------------------------------------------ */

const watched = new Map(); // userId -> { sessionId, lastUserIndex } (per session)

const MX = {
  email: () => /(send|email|mail|bhej)/i,
  emailTo: () => /([\w.+-]+@[\w-]+\.[\w.]+)/,
  call: () => /call|phone/i,
  cal: () => /meeting|appointment|calendar|schedule/i,
  remind: () => /remind|reminder|yaad|todolist|todo/i,
  sale: () => /sale|sell|bichi|विक्री|विक्री|[₹]\s?\d|\d{2,}\s?(rupaye|rs|₹|rupees)/i,
  expense: () => /expense|spend|kharch|kharchee|paid/i,
  moneyRupee: () => /(?:₹|rs\.?|rupees?|rupaye)\s?(\d{2,})|(\d{2,})\s?(?:rupaye|rupees|rs\.?)/i,
  time: () => /\b(today|tonight|tomorrow|kal|aaj|evening|morning|shaam|subah)\b|(?:at|ko|baje|baj)\s?(\d{1,2}(?::\d{2})?(?:\s?(?:am|pm|shaam|subah))?)/i
};

/** Minimal "when" parser: returns ISO for today/tomorrow + HH:MM or relative "in N min/hours". */
function parseWhen(text) {
  const now = Date.now();
  let when = new Date(now);
  const low = text.toLowerCase();
  if (/(tomorrow|kal)/i.test(low)) when = new Date(now + 24 * 3600 * 1000);
  const hm = text.match(/(\d{1,2})(?::(\d{2}))?\s?(am|pm|shaam|sham|subah)/i);
  if (hm) {
    let h = parseInt(hm[1], 10) % 24;
    const m = hm[2] ? parseInt(hm[2], 10) % 60 : 0;
    const ap = (hm[3] || '').toLowerCase();
    if ((ap === 'pm' || ap === 'shaam' || ap === 'sham') && h < 12) h += 12;
    if ((ap === 'am' || ap === 'subah') && h === 12) h = 0;
    when.setHours(h, m, 0, 0);
  }
  const inN = low.match(/\bin\s+(\d+)\s*(min|minute|hour|hr|ghante|minute)/i);
  if (inN) {
    const n = parseInt(inN[1], 10);
    const unit = inN[2].toLowerCase();
    when = new Date(now + n * (unit.startsWith('hour') || unit === 'hr' || unit === 'ghante' ? 3600 : 60) * 1000);
  }
  if ((low.includes('today') || /aaj/i.test(low)) && !hm) when = new Date(now);
  return when.toISOString();
}

const humanWhen = (text) => {
  const t = text.toLowerCase();
  if (/(tomorrow|kal)/i.test(t)) return 'tomorrow';
  if (/(today|aaj)/i.test(t)) return 'today';
  const hm = text.match(/(\d{1,2}:\d{2}(?:\s?(?:am|pm))?)/i);
  if (hm) return hm[1];
  return '';
};

/**
 * Scan a user turn. Executes at most one clearly-specified action so partial
 * requests (e.g. "yes, send it") never fire. Returns [{ name, label }].
 */
function maybeAutoExecute(userId, { text = '', sessionId }) {
  const s = watched.get(userId);
  const sid = s && s.sessionId;
  if (sid && sid !== sessionId) { watched.delete(userId); }
  const entry = watched.get(userId) || { sessionId, lastUserIndex: -1 };
  // Handled by the caller: only pass *new* turns.
  const low = text.toLowerCase();
  const out = [];

  // 1) Email: needs an address AND a subject/about clause.
  if (MX.email().test(low)) {
    const toM = text.match(MX.emailTo());
    const subjM = text.match(/(?:about|regarding|subject|ke baare me|par|ki)\s+([^.,!?\n]{3,120})/i);
    if (toM && subjM && subjM[1].trim()) {
      cachedEmail = { to: toM[1], subject: subjM[1].trim().slice(0, 80), body: subjM[1].trim().slice(0, 500) };
      out.push('send_email');
    }
  }
  // 2) Record transaction: needs ₹ amount + sale/expense cue.
  const money = text.match(MX.moneyRupee());
  if (money && (MX.sale().test(low) || MX.expense().test(low))) {
    const isSale = MX.sale().test(low) && !/expense|kharch|paid/i.test(low);
    out.push('record_transaction');
    cachedTx = { type: isSale ? 'sale' : 'expense', amount: Number(money[1] || money[2]), note: text.slice(0, 60) };
  }
  // 3) Reminder / call / calendar — any one that has a time mention.
  if (MX.time().test(low)) {
    const when = parseWhen(text);
    const human = humanWhen(text);
    const isRemind = MX.remind().test(low);
    const isCal = /meeting|appointment|calendar|\bmilna\b/i.test(low);
    const isCall = MX.call().test(low) && !isCal;
    if (isRemind) {
      out.push('create_reminder');
      cachedRem = { title: cleanTitle(text) || 'Business task', due: when, humanDue: human, notes: text };
    } else if (isCall) {
      out.push('schedule_call');
      cachedCall = { title: cleanTitle(text) || 'Business call', when, humanDue: human, notes: text };
    } else if (isCal) {
      out.push('create_calendar_event');
      cachedCal = { title: cleanTitle(text) || 'Business meeting', start: when, end: when, description: text };
    }
  }
  // Keep it to a single action per turn (the most specific wins by order above).
  const primary = out[0];
  if (primary) {
    const params = pick(primary);
    // Don't execute twice within the same session for the same turn text.
    if (entry.lastTurnText === text) return [];
    entry.lastTurnText = text;
    watched.set(userId, entry);
    return [{ name: primary, params: params || {} }];
  }
  return [];
}

// ephemeral capture so primary keeps its params (single-turn, simple)
let cachedEmail = null; let cachedTx = null; let cachedCall = null; let cachedCal = null; let cachedRem = null;
function pick(name) {
  const p = {
    send_email: () => cachedEmail,
    record_transaction: () => cachedTx,
    schedule_call: () => cachedCall,
    create_calendar_event: () => cachedCal,
    create_reminder: () => cachedRem
  }[name] || (() => null);
  const v = p();
  return v;
}

function cleanTitle(text) {
  return text
    .replace(/(remind|reminder|yaad dillao|yaad|lagao|schedule|book|arrange|fix|call|phone|meeting|appointment|calendar|add|create|email|send)/gi, '')
    .replace(/\b(kal|aaj|tomorrow|today|shaam|sham|subah|evening|morning|at|ko|baje|am|pm|tonight)\b/gi, ' ')
    .replace(/\b(the|to|me|my|a|an|please|pls)\b/gi, ' ')
    .replace(/\d{1,2}:?\d{0,2}\s?(am|pm)?/gi, ' ')
    .replace(/[⁰.,!?]/gi, ' ').replace(/\s+/g, ' ').trim().slice(0, 50);
}

module.exports = { execute, maybeAutoExecute, EXECUTORS, recordAction, notify };