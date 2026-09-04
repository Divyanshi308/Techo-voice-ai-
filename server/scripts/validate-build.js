'use strict';

/**
 * scripts/validate-build.js — Frontend build/asset validation.
 *
 *   node server/scripts/validate-build.js
 *
 * Verifies all JS/CSS referenced by index.html exist and parse with Node's
 * syntax checker (a cheap proxy for a real bundler, since this SPA is
 * dependency-free). Exits non-zero on any missing/broken asset.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..', 'public');
const INDEX = path.join(ROOT, 'index.html');

if (!fs.existsSync(INDEX)) {
  console.error('✗ public/index.html not found');
  process.exit(1);
}

const html = fs.readFileSync(INDEX, 'utf8');
const scripts = [...html.matchAll(/src="([^"]+)"/g)].map((m) => m[1]);
const links = [...html.matchAll(/href="([^"]+\.css)"/g)].map((m) => m[1]);

let failures = 0;

console.log(`\nVyaparVaani — build validation\n`);

for (const src of scripts) {
  if (/^https?:\/\//.test(src)) {           // external CDN (e.g. Agora RTC SDK) — not a local asset
    console.log(`  ↻ external: ${src}`);
    continue;
  }
  const full = path.join(ROOT, src.replace(/^\//, ''));
  if (!fs.existsSync(full)) {
    console.log(`  ✗ missing: ${src}`);
    failures++;
    continue;
  }
  const code = fs.readFileSync(full, 'utf8');
  try {
    // Parse-only: some files reference globals (window, App) at load time, so
    // we only syntax-check, not execute.
    new vm.Script(code, { filename: src });
    console.log(`  ✓ ${src}`);
  } catch (e) {
    console.log(`  ✗ syntax error in ${src}: ${e.message}`);
    failures++;
  }
}

for (const href of links) {
  const full = path.join(ROOT, href.replace(/^\//, ''));
  if (!fs.existsSync(full)) {
    console.log(`  ✗ missing: ${href}`);
    failures++;
  } else {
    console.log(`  ✓ ${href}`);
  }
}

console.log(`\nResult: ${failures ? failures + ' failure(s)' : 'OK — all referenced assets exist and parse.'}`);
process.exit(failures ? 1 : 0);
