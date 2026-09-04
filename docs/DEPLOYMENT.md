# Deployment Guide

This document covers deploying VyaparVaani (including the Agora Conversational
AI integration) to a production server.

---

## 1. Build & run requirements

- Node.js **18+**
- npm (bundled with Node) **9+**
- An internet connection for the two Agora SDKs (already in `package.json`).

No compile step is required — the frontend is served statically by the server.

---

## 2. Local development

```bash
npm install        # install dependencies (Agora SDKs included)
npm start          # starts the server with --watch on port 4321
```

Open http://localhost:4321

Useful scripts:

```bash
npm run reset-data       # wipe the JSON store; reseeds sample data on next boot
npm run preflight        # env / prod-readiness checklist
npm run build:validate   # verify all frontend assets exist & parse
npm run agora:tokens     # verify the token service mints each token type
```

---

## 3. Environment variables

Create a `.env` file in the project root (see `.env.example`). Package with:

| Variable | Required | Purpose |
|----------|----------|---------|
| `PORT` | no (default 4321) | HTTP listen port |
| `VY_COOKIE_SECRET` | **yes (prod)** | Signs session cookies. Insecure dev fallback warns. |
| `PUBLIC_BASE_URL` | yes (prod) | Public URL of the server (webhook callbacks, UI links). |
| `AGORA_APP_ID` | conditional | Agora Project App ID |
| `AGORA_APP_CERTIFICATE` | conditional | Agora App Certificate (**secret**) |
| `AGORA_CUSTOMER_ID` | conditional | Agora RESTful Customer ID |
| `AGORA_CUSTOMER_SECRET` | conditional | Agora RESTful Customer Secret (**secret**) |
| `AGORA_AGENT_ID` | conditional | Conversational AI agent UID (or `AGORA_PIPELINE_ID`) |
| `AGORA_REGION` | no | Region cluster override (`GLOBAL` default) |
| `WEBHOOK_SECRET` | optional | Verifies Agora webhook payloads (HMAC). |
| `AGORA_ENV` | no (default dev) | `dev` \| `staging` \| `prod` |

Conditional = required only when you want live Agora voice (otherwise the app
runs securely in mock mode).

> **Production security:** set `VY_COOKIE_SECRET` to a long random string and
> store all `*_SECRET`/`*_CERTIFICATE` values in your platform's secret manager,
> **not** in source control. `.env` and `server/data/` should be git-ignored.

---

## 4. Deploying

### Option A — single Node process (simplest)

```bash
git pull
npm ci --omit=dev          # install production deps
set NODE_ENV=production
npm run build:validate     # sanity check the frontend assets
npm start                  # or run under pm2/systemd
```

### Option B — behind a reverse proxy (recommended)

Put Nginx/Caddy in front of port 4321, terminate TLS, and proxy:

```nginx
location / {
    proxy_pass http://127.0.0.1:4321;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";   # for future WebSocket/voice
    proxy_set_header Host $host;
}
```

### Option C — containers

Add a `Dockerfile` that copies `package.json` + `server/` + `public/`, runs
`npm ci --omit=dev`, exposes port 4321, and injects env/secrets at runtime.

---

## 5. First-run verification after deploy

1. Hit `GET / <your-host>/api/health` → confirm `"agora"` object echoes the
   correct `env` and an honest `connection`.
2. Sign in and open **`#/agora`** → banner shows the correct state
   (Mock mode / Connected).
3. Run **Test connection** from the dashboard → the self-check runs a **real
   REST probe** to Agora (`/api/agora/health` returns `ok:true,
   apiReachable:true` when your Customer credentials authenticate).
4. If live voice is configured, make a real test call: **Start conversation**
   on the dashboard (or `POST /api/agora/session/start`) → the agent joins a
   real RTC channel and returns its real `agent_id`; the browser joins that
   channel via `/api/agora/token` and streams audio. `POST /api/agora/session/stop`
   ends it.
5. Optionally configure Agora to POST events to
   `{PUBLIC_BASE_URL}/api/agora/webhooks` and set `WEBHOOK_SECRET` to verify
   signatures (HMAC SHA-256).

---

## 6. Rollback

- **Agent config** — from the *Agent Configuration* page, use **Restore** on any
  prior version (creates a new rollback revision, never destroys history).
- **App** — keep the previous release tag; redeploy it. The JSON store is
  version-tolerant; back it up before downgrading data-bearing releases.

---

## 7. Backups

The app persists to `server/data/*.json` (seeded sample data) and
`server/storage/recordings/` (user voice recordings). Back these up with your
normal nightly job. `npm run reset-data` removes them only when run
deliberately.
