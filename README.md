# Techo — Give Your MCP a Voice

A working **voice-first business assistant** for Indian small-business owners.
Talk to it in your language, record sales & expenses by voice, manage meetings
and email by voice, run surveys & review collection, and escalate complex
questions to human experts — all with explicit, per-feature privacy consent.

**Core voice engine:** [Agora Conversational AI](https://docs.agora.io/en/conversational-ai/overview/product-overview)
(real agent sessions + RTC audio when configured, honest browser fallback otherwise).

## Quick start

```bash
cd vyaparvaani
npm install
npm start      # → http://localhost:4321
```

Open **http://localhost:4321** and sign in with **Demo owner — Vijay Sharma**
(`demo@vyaparvaani.local`; demo emails are local test identifiers, not real
accounts). Admin: `admin@vyaparvaani.local` → "Admin" in the sidebar.

Data persists in `server/data/*.json` (seeded once). Reset with:

```bash
npm run reset-data   # wipes sample data; re-seeded on next start
```

## Using the app

- **Home (🏠):** night-street backdrop, centered search + voice mic. Typing or
  tapping the mic hands off to Talk.
- **Talk (🎙️):** tap the mic → Techo tries a **live Agora voice session** first
  (Connecting → Connected → Listening → AI speaking, live transcript sync),
  falling back to browser Web Speech when Agora is unavailable. Mute, stop,
  per-message TTS, waveform, 16 voice states, Hinglish code-switching.
- **Sales & Expenses (💰):** totals + manual add/edit/delete; voice: "aaj 2000
  ki sale hui".
- **Marketing Studio (📣):** WhatsApp promos, captions, follow-ups.
- **Reminders (⏰):** local reminders + Google Calendar meetings side by side.
- **Surveys (📋) / Reviews (⭐):** surveys with simulated outbound calls + CSV
  export; review collection with ratings.
- **Support (🙋):** human-expert escalation cases. **History (🕘):** transcripts,
  export/delete. **Privacy (🔒):** consents, download/delete data, audit log.
- **Avatar & Voice (👤) / Language (🌐) / Settings / Admin** as before.
- **Integrations (🔗):** live status + setup for Agora, Calendar, Email,
  Payments, and the future-MCP roadmap.

## Agora Conversational AI setup (core voice engine)

1. Create an Agora project at [console.agora.io](https://console.agora.io) →
   copy **App ID** + **App Certificate**.
2. Get **Customer ID + Customer Secret** (REST API access).
3. Create a Conversational AI agent (App Builder / AI Studio) → copy the
   **Pipeline ID** (or published **Agent ID**).
4. Put them in `server/.env` (see `.env.example`):
   `AGORA_APP_ID`, `AGORA_APP_CERTIFICATE`, `AGORA_CUSTOMER_ID`,
   `AGORA_CUSTOMER_SECRET`, `AGORA_PIPELINE_ID` (or `AGORA_AGENT_ID`).
5. Restart, open **Integrations** → Agora card → **Test voice agent**, or check
   `GET /api/agora/connection-test` (per-check results) and
   `GET /api/agora/health` (live REST probe).

Without credentials the app runs the browser voice path and every surface says
so — it never fakes a live session. Secrets stay server-side; the browser only
ever receives short-lived, channel-scoped tokens from `POST /api/agora/token`.

## Google Calendar — "Give Scheduling a Voice"

1. Google Cloud Console → enable **Google Calendar API** → OAuth 2.0 client
   (Web) with redirect URI `{PUBLIC_BASE_URL}/api/calendar/callback`.
2. Set `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` in `.env`, restart.
3. **Integrations → Calendar → Connect** (OAuth consent), then say
   "add a meeting tomorrow at 5 PM with my supplier" or "show my meetings
   this week". Meetings appear on the Reminders page. Unconnected? Voice
   scheduling still works via local reminders — nothing is lost.

## Email — "Give Email a Voice" (Resend)

1. [resend.com](https://resend.com) → API key → `RESEND_API_KEY` in `.env`
   (+ `RESEND_FROM` with a verified domain, optional).
2. Say "send an email to supplier@example.com about delayed stock" → confirm
   by voice → sent (consent-gated, logged on the Integrations page).

## Payments — "Give Payments a Voice" (read-only demo)

Ask "what were my sales last week?". Without `STRIPE_SECRET_KEY` (test mode)
you get clearly-labeled demo figures from the local ledger; with it, test-mode
charge aggregates. Read-only — no real money movement.

## "Give Your MCP a Voice" — roadmap

Live now: Agora · Calendar · Email · Payments(demo). Next candidates (not
built): Linear (projects), Notion (knowledge), GitHub (development), Vercel
(deployments), HubSpot (sales), Zapier (everything).

## Architecture

Vanilla JS SPA (no build step), Node + Express, JSON-file store
(`server/db.js`), consent-gated everything.

```
vyaparvaani/
├─ server/
│  ├─ index.js · db.js · auth.js · seed.js
│  ├─ routes/  auth, chat, profile, content, reminders, surveys, escalation,
│  │           avatars, privacy, config, languages, admin, storage, agora,
│  │           integrations          # ← NEW: calendar/email/payments
│  └─ services/
│     ├─ aiEngine.js                # rule-based intents incl. calendar/email/payments
│     ├─ agora/  config, token, rte (real REST), sessions, agentConfig…
│     └─ integrations/              # ← NEW: calendar.js, email.js, stripe.js
├─ public/js/views/integrations.js  # ← NEW dashboard page (route /integrations)
└─ server/data/*.json · server/storage/   # local-first persistence
```

## Testing

```bash
npm run build:validate   # all frontend assets exist + parse
npm run test:agora        # 30-check E2E: auth, Agora lifecycle (real when
                          # configured), integrations, voice intents, webhooks
npm run preflight         # env / readiness checklist
```

Manual: mic permission → live session → live transcript → end; Hindi/Hinglish/
English speech; onboarding → profile; sales/reminder/survey/review/escalation
flows; Calendar/Email not-configured screens; keyboard-only run; Lighthouse
(current: 100/100/100/100).

## Environment variables

See `.env.example` for the full list: server, Agora, webhooks, Google OAuth,
Resend, Stripe, optional ASR/TTS/LLM providers. Never commit `.env`.

## Notes

- Techo is an AI assistant, not a lawyer/CA/financial adviser (disclaimer
  included in-app).
- Demo emails (`*@vyaparvaani.local`) are local test identifiers.
