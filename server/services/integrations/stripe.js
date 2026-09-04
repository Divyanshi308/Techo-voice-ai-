'use strict';

/**
 * integrations/stripe.js — "Give Payments a Voice" (read-only demo).
 *
 * Read-only sales overview. With STRIPE_SECRET_KEY (test mode) it aggregates
 * real recent charges via the Stripe REST API. Without it, it returns clearly
 * labeled demo figures derived from the local transaction ledger so the voice
 * command "what were my sales last week" still answers honestly.
 */

const store = require('../../db');

const SECRET = () => process.env.STRIPE_SECRET_KEY || '';

function configured() {
  return !!SECRET();
}

function setupSteps() {
  return [
    'Create a Stripe account and switch it to test mode.',
    'Copy a test-mode secret key (sk_test_…) into STRIPE_SECRET_KEY in the server .env, then restart.',
    'Ask by voice: "what were my sales last week?" — figures come from test-mode charges.'
  ];
}

function status() {
  return { provider: 'stripe', mode: configured() ? 'test-live' : 'demo', configured: configured(), setup: configured() ? [] : setupSteps() };
}

function ledgerSummary(userId, days = 7) {
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const txs = store.find('transactions', (t) => t.userId === userId && new Date(t.at || 0).getTime() >= since);
  let sales = 0, expenses = 0;
  const byNote = {};
  txs.forEach((t) => {
    const amt = Number(t.amount) || 0;
    if (t.type === 'sale') {
      sales += amt;
      const k = (t.note || 'Sale').slice(0, 40);
      byNote[k] = (byNote[k] || 0) + amt;
    } else if (t.type === 'expense') expenses += amt;
  });
  const top = Object.entries(byNote).sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([note, total]) => ({ note, total }));
  return { rangeDays: days, sales, expenses, net: sales - expenses, count: txs.length, top };
}

async function overview(userId, days = 7) {
  if (!configured()) {
    return {
      configured: false, demo: true,
      note: 'Demo figures from your local Techo ledger — Stripe not configured.',
      setup: setupSteps(),
      ...ledgerSummary(userId, days)
    };
  }
  try {
    const res = await fetch('https://api.stripe.com/v1/charges?limit=100', {
      headers: { Authorization: 'Bearer ' + SECRET() }
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, reason: 'provider_error', message: (json.error && json.error.message) || ('Stripe HTTP ' + res.status) };
    }
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    const charges = (json.data || []).filter((c) => c.paid && (c.created * 1000) >= since);
    const total = charges.reduce((s, c) => s + (c.amount || 0), 0) / 100;
    return {
      ok: true, configured: true, demo: false, mode: 'test',
      rangeDays: days, charges: charges.length, sales: total, currency: (charges[0] && charges[0].currency) || 'inr'
    };
  } catch (e) {
    return { ok: false, reason: 'network_error', message: 'Could not reach Stripe: ' + e.message };
  }
}

module.exports = { status, configured, setupSteps, overview };
