'use strict';

/**
 * scripts/agora-tokens.js — Verify the Agora token service without a browser.
 *
 *   node server/scripts/agora-tokens.js [convo|rtc|apaas]
 *
 * Mints a token when credentials permit; otherwise prints an honest
 * "not configured / needs credentials" message. Never prints secrets.
 */

const tokenService = require('../services/agora/token');

const kinds = process.argv[2] ? [process.argv[2]] : ['convo', 'rtc', 'apaas'];

console.log('\nAgora token service self-test\n');

kinds.forEach((kind) => {
  const r = tokenService.issue(kind, {});
  if (r.available) {
    console.log(`  ✓ ${kind}: token minted (${r.token.length} chars) for channel "${r.channel || r.roomUuid || 'n/a'}"`);
  } else {
    console.log(`  ✗ ${kind}: unavailable — ${r.note}`);
  }
});

console.log('\nDone. (Only availability/length is reported — no secrets shown.)');
