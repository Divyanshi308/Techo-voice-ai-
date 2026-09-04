'use strict';

/**
 * agora/analytics.js — Dashboard metrics for the Agora Integration page.
 *
 * Purely aggregates existing collections (calls, conversations, cases,
 * reviews) so the dashboard shows honest live counts. No fabricated data:
 * when nothing has happened yet the counts are zero.
 */

const store = require('../../db');

function countsFor(userId) {
  const scope = (col) => store.find(col, (r) => !userId || r.userId === userId);

  const calls = scope('calls');
  const conversations = scope('conversations');
  const cases = scope('cases');
  const reviews = scope('reviews');

  const completedCalls = calls.filter((c) => c.status === 'completed');
  const scheduledCalls = calls.filter((c) => c.status === 'scheduled');
  const escalationCalls = calls.filter((c) => c.kind === 'escalation' || (c.meta && c.meta.kind === 'escalation'));

  return {
    calls: {
      total: calls.length,
      completed: completedCalls.length,
      scheduled: scheduledCalls.length,
      escalation: escalationCalls.length,
      lastAt: completedCalls.length ? completedCalls.map((c) => c.at || c.createdAt).sort().pop() : null
    },
    conversations: {
      total: conversations.length,
      lastAt: conversations.length ? conversations.map((c) => (c.messages && c.messages.length && c.messages[c.messages.length - 1].at) || c.createdAt).sort().pop() : null
    },
    cases: {
      total: cases.length,
      open: cases.filter((c) => c.status === 'open' || c.status === 'assigned').length,
      resolved: cases.filter((c) => c.status === 'resolved' || c.status === 'closed').length
    },
    reviews: {
      total: reviews.length,
      avgRating: reviews.length ? (reviews.reduce((s, r) => s + (r.rating || 0), 0) / reviews.length).toFixed(1) : 0
    }
  };
}

/** Recent activity events across calls/cases, newest first. */
function recentActivity(userId, limit = 12) {
  const events = [];
  store.find('calls', (r) => !userId || r.userId === userId).forEach((c) => {
    events.push({ at: c.at || c.createdAt, type: 'call', title: `${c.kind || 'call'} call`, status: c.status, id: c.id, channel: c.channel || '' });
  });
  store.find('cases', (r) => !userId || r.userId === userId).forEach((c) => {
    events.push({ at: c.createdAt || c.updatedAt, type: 'case', title: (c.topic || 'case') + (c.status ? ` — ${c.status}` : ''), status: c.status, id: c.id, channel: 'expert' });
  });
  return events
    .filter((e) => e.at)
    .sort((a, b) => (b.at > a.at ? 1 : -1))
    .slice(0, limit);
}

/** Errors/warnings derived from stored data (audit log + failed calls). */
function errorWarnings(userId, limit = 10) {
  const out = [];
  store.find('calls', (r) => (!userId || r.userId === userId) && (r.status === 'failed' || r.status === 'error')).forEach((c) => {
    out.push({ at: c.at || c.createdAt, level: 'error', text: `${c.kind || 'call'} call failed${c.error ? ': ' + c.error : ''}`, id: c.id });
  });
  if (!out.length) {
    return { warnings: [], hasWarnings: false };
  }
  return { warnings: out.slice(0, limit), hasWarnings: true };
}

module.exports = { countsFor, recentActivity, errorWarnings };
