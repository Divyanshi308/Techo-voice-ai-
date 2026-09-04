'use strict';

require('./env'); // load .env BEFORE any module reads process.env

const path = require('path');
const compression = require('compression');
const express = require('express');
const store = require('./db');
const { seed } = require('./seed');
const reminders = require('./services/reminders');

const PORT = process.env.PORT || 4321;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// --- boot -------------------------------------------------------------------
store.init([
  'users', 'conversations', 'transactions', 'reminders', 'surveys', 'surveyResponses',
  'surveyInsights', 'calls', 'reviews', 'cases', 'experts', 'avatars', 'voices',
  'contacts', 'themes', 'languages', 'prompts', 'settings', 'notifications', 'contentUses',
  'agentConfig', 'agentVersions', 'integrationTokens', 'emails'
]);
seed();

const app = express();
app.disable('x-powered-by');

// ----- gzip/brotli compression for smaller payloads ---------------------------
app.use(compression());

// ----- security headers --------------------------------------------------------
// Basic Content-Security-Policy (starter; relaxed enough for the SPA + Agora SDK).
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://download.agora.io https://fonts.googleapis.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.gstatic.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://*.heygen.ai; connect-src 'self' wss: https:; media-src 'self' blob: mediastream: https://*.heygen.ai; worker-src 'self' blob:"
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  // Permissions-Policy: microphone is required for the voice assistant; camera + mic
  // (Agora video) reachable via user-gesture. Everything else is denied by default.
  res.setHeader('Permissions-Policy', 'microphone=(self), camera=(self), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()');
  next();
});

// ----- body parsing (raised limits because avatar images are data-URLs) ------
app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: true, limit: '8mb' }));

// ----- tiny cookie parser (avoid dependency; same API as cookie-parser) ------
app.use((req, res, next) => {
  req.cookies = {};
  const raw = req.headers.cookie;
  if (raw) {
    raw.split(';').forEach((pair) => {
      const idx = pair.indexOf('=');
      if (idx > -1) {
        const k = pair.slice(0, idx).trim();
        const v = decodeURIComponent(pair.slice(idx + 1).trim());
        req.cookies[k] = v;
      }
    });
  }
  next();
});

// ----- request logging (dev) -------------------------------------------------
app.use((req, res, next) => {
  if (req.path.startsWith('/assets') || req.path === '/favicon.ico') return next();
  const start = Date.now();
  res.on('finish', () => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} → ${res.statusCode} (${Date.now() - start}ms)`);
  });
  next();
});

// ----- api routes -------------------------------------------------------------
app.use(require('./routes/auth'));
app.use(require('./routes/chat'));
app.use(require('./routes/profile'));
app.use(require('./routes/content'));
app.use(require('./routes/reminders'));
app.use(require('./routes/surveys'));
app.use(require('./routes/escalation'));
app.use(require('./routes/avatars'));
app.use(require('./routes/privacy'));
app.use(require('./routes/config'));
app.use(require('./routes/languages'));
app.use(require('./routes/admin'));
app.use(require('./routes/storage'));
app.use(require('./routes/agora'));
app.use(require('./routes/integrations'));
app.use(require('./routes/avatar'));

// JSON 404 for unknown API routes
app.use('/api', (req, res) => res.status(404).json({ error: 'not_found', path: req.path }));

// ----- static frontend ---------------------------------------------------------
// Files here are NOT versioned/hashed, so avoid `immutable`. Use a moderate
// max-age so updates get picked up reasonably quickly while still caching.
const STATIC_MAX_AGE = 60 * 60;            // 1 hour default
const ASSET_MAX_AGE = 60 * 60 * 24;        // 1 day for JS/CSS/images
app.use(express.static(PUBLIC_DIR, {
  setHeaders(res, filePath) {
    if (/\.(js|css|woff2?|png|jpe?g|gif|webp|avif|svg|ico)$/i.test(filePath)) {
      res.setHeader('Cache-Control', `public, max-age=${ASSET_MAX_AGE}`);
    } else {
      res.setHeader('Cache-Control', `public, max-age=${STATIC_MAX_AGE}`);
    }
  }
}));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// ----- unified error handler ----------------------------------------------------
// Logs full detail server-side but never leaks internal messages/stack to the
// client. 4xx errors that carry a safe `expose` message are returned as-is;
// everything else (especially 5xx) gets a generic, non-revealing response.
app.use((err, req, res, next) => {
  console.error('[server]', err.message, err.stack);
  const status = err.status || 500;
  if (status >= 500) {
    return res.status(status).json({ error: 'server_error', message: 'Something went wrong. Please try again.' });
  }
  if (err.expose) {
    return res.status(status).json({ error: err.code || 'error', message: err.message });
  }
  res.status(status).json({ error: err.code || 'error', message: err.message || 'Request failed.' });
});

app.listen(PORT, () => {
  console.log(`\n🚀  Techo running →  http://localhost:${PORT}`);
  console.log(`   Demo owner:  sign in via "Demo Google" (demo@vyaparvaani.local)`);
  console.log(`   Admin:       sign in via "Demo Google" (admin@vyaparvaani.local)\n`);
});

reminders.start();

process.on('SIGINT', () => {
  reminders.stop();
  process.exit(0);
});