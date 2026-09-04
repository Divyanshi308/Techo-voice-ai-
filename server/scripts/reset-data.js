/* reset-data.js — wipes the JSON-file store so a fresh seed runs on next boot.
   Run:  npm run reset-data   (or:  node server/scripts/reset-data.js) */

const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
const dropped = [];

if (!fs.existsSync(dataDir)) {
  console.log('No data directory found:', dataDir);
  process.exit(0);
}

for (const file of fs.readdirSync(dataDir)) {
  if (file.endsWith('.json')) {
    fs.unlinkSync(path.join(dataDir, file));
    dropped.push(file);
  }
}

console.log('Reset complete. Removed:', dropped.join(', ') || '(nothing)');
console.log('Next server boot will re-seed sample data.');
