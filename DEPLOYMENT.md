# Deployment — Techo (live demo)

Live URL: **https://techo-voice-ai.onrender.com** · Repo: `Techo-voice-ai-` (public)
· Assumed host: [Render](https://render.com) (free web service).

## How the app resolves its own public URL

The server derives its public URL once, in `server/baseUrl.js`, and every
OAuth redirect, webhook callback and "base URL" surface uses it:

1. `PUBLIC_BASE_URL` (set it explicitly in the host dashboard)
2. `VY_BASE_URL` (legacy alias)
3. `RENDER_EXTERNAL_URL` (auto-provided by Render)
4. Default: `https://techo-voice-ai.onrender.com` when `NODE_ENV=production`,
   else `http://localhost:4321`.

**Guard:** in production the app never uses a `localhost`/non-`https` base URL —
missing/misconfigured env vars fall through to the default above, and a warning
is logged once at boot. OAuth/calendar setup therefore works even if no
`PUBLIC_BASE_URL` is set; you still may set it explicitly to be safe.

## Render setup

1. Create a **Web Service** from the GitHub repo (free tier is fine).
2. Build: `npm install` · Start: `npm start` · Health check path: `/api/health`.
3. Add env vars (values below). Save → the service deploys automatically.
4. After first deploy, add the URL `https://techo-voice-ai.onrender.com` as the
   **Authorized redirect URI** for **both** Google OAuth clients (the app's
   Google-sign-in and the Google Calendar integration).

The free tier sleeps after inactivity — first hit after a gap can take ~30-60s.

## Required env vars (production)

| Variable | Purpose |
|---|---|
| `NODE_ENV` | `production` (Render default). Makes cookies Secure, defaults Agora env to `prod`, prod-safe base URL. |
| `VY_COOKIE_SECRET` | Session signing secret — set a long random string (never the dev default). |
| `AGORA_APP_ID` + `AGORA_APP_CERTIFICATE` | Agora RTC project credentials. |
| `AGORA_CUSTOMER_ID` + `AGORA_CUSTOMER_SECRET` | Agora Conversational AI REST credentials. |
| `AGORA_AGENT_ID` (or `AGORA_PIPELINE_ID`) | The published voice-AI agent. |
| `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` | Google OAuth for sign-in AND Calendar. |
| `RESEND_API_KEY` (+ `RESEND_FROM`) | Email sending. |
| `HEYGEN_API_KEY` | Talking-head avatar (videos need account credits). |
| `WEBHOOK_SECRET` | HMAC secret for Agora webhook verification. |

Optional: `STRIPE_SECRET_KEY` (test mode charge aggregates), `DEEPGRAM_API_KEY`,
`ELEVENLABS_API_KEY`, `OPENAI_API_KEY` (+ `OPENAI_MODEL`), `TELNYX_API_KEY`,
`ZENDESK_SUBDOMAIN` — turning on real providers where you want them.

Optional: `PUBLIC_BASE_URL=https://techo-voice-ai.onrender.com` (or rely on the
prod default / `RENDER_EXTERNAL_URL`).

## Google Calendar OAuth (gets 403 "redirect_uri" or "Access blocked")

1. Console → **APIs & Services → Credentials → OAuth 2.0 Client IDs**.
2. For the **Calendar** integration add the redirect URI:
   `https://techo-voice-ai.onrender.com/api/calendar/callback`.
3. For **Google sign-in** add:
   `https://techo-voice-ai.onrender.com/auth/google/callback`.
4. In **OAuth consent screen → Audience**, either **Publish the app** or add
   test users (every Google account that will demo Calendar).
5. The Integrations page shows the exact redirect URI the app is using — keep
   it in sync with the console.

## Honesty rules (keep these)

Every surface reports the truth — no fake "connected" states:

- **Telephony (outbound calls) is simulated** unless `TELNYX_API_KEY` is set.
  Calls set `channel: 'mock-voice'` and `simulated: true`; the UI shows a
  "Simulated" tag and reminders say "mock call".
- **AI is a local rule-based mock engine** (`aiProvider.PROVIDER.kind ===
  'mock'`) until an LLM key is added.
- **ASR/TTS are browser Web Speech + device voices** until Deepgram/ElevenLabs
  keys are added. `/api/health` labels them.
- **Payments** shows clearly-labelled demo figures from the local ledger until
  `STRIPE_SECRET_KEY` (test mode) is set.
- **HeyGen videos** require account credits; when they run out the app shows
  "Video paused (no credits)" instead of a broken flow.
- `AGORA_ENV` defaults to `prod` under `NODE_ENV=production`; leave it unset on
  Render. Set it explicitly only to force `dev`/`staging`.

## Release checklist

```bash
npm run preflight          # env/readiness gate (fails hard in prod on gaps)
npm run build:validate     # frontend assets parsed
npm run test:agora         # 35-check E2E suite (auth, Agora, integrations, webhooks)
```

Then open the live URL and verify: `/api/health`, Demo owner sign-in, Agora
session start, Integrations page statuses, email send, payments demo figures,
a scheduled "Simulated" reminder call.

## Notes

- Secrets never leave the server. The frontend only receives boolean/status
  flags and short-lived, channel-scoped Agora tokens. `/api/config` returns
  sanitised provider info only.
- Local dev: `npm start` → http://localhost:4321 with `.env` values. `NODE_ENV`
  is unset locally, so prod defaults above never leak into dev.