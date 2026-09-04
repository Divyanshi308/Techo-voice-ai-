# Agora Conversational AI — Setup Guide

This guide explains how to connect VyaparVaani to Agora **Conversational AI**
(voice-AI agents) so the built-in voice assistant runs over real, low-latency
Agora audio instead of the browser Web-Speech fallback.

> **TL;DR** — VyaparVaani ships fully runnable in a clearly-marked **mock mode**.
> To go live you add **5 env vars** on the server and create **one agent** in the
> Agora Console. The frontend **never** holds a secret; it requests short-lived
> tokens from the server.

---

## 1. Architecture at a glance

```
 [ Browser / mobile app ]
        │  (JavaScript client, request-only — no secrets)
        ▼
 [ VyaparVaani backend ]   routes/agora.js
        │   │
        │   └── services/agora/token.js   ← mints short-lived tokens (server-only)
        │       token.js reads AGORA_* from env, NEVER returns secrets
        ▼
 [ Agora Cloud ]
        ├── RTC                 low-latency audio transport
        ├── Conversational AI   the voice-AI agent (STT → LLM → TTS loop)
        └── App Builder / AI Studio   where you configure & deploy the agent
```

The modular services live in `server/services/agora/`:

| File | Purpose |
|------|---------|
| `config.js`    | Safe, resolved configuration + honest status (env, appId, connection). |
| `token.js`     | Secure token minting — RTC, Conversational AI (RCON), App Builder. |
| `agentConfig.js`| Agent configuration with draft → publish → rollback + version history. |
| `sessions.js`  | Voice-session lifecycle, transcripts, human escalation, call records. |
| `analytics.js` | Dashboard metrics (calls, conversations, cases, reviews, warnings). |

---

## 2. What you need from Agora

Create a free trial account at **https://console.agora.io** and then:

1. **App ID + App Certificate** (Project → Create).
   - Copy the **App ID** and **App Certificate**.
2. **Customer ID + Customer Secret** (RESTful API / Cryptographic)
   - Under your account → **RESTful API**. These are used *only server-side*
     to mint short-lived tokens.
3. **A voice-AI agent** (the conversational agent that talks to your customer).
   - Open **AI Studio / App Builder**, create an agent, and copy its **Agent ID
     (AGENT_UID)**. Configure its system prompt, language, voice and escalation
     behaviour there (or mirror the values you set in VyaparVaani's
     *Agent Configuration* page).

---

## 3. Configuration

Copy `.env.example` to `.env` and fill in the values:

```dotenv
AGORA_APP_ID=your-app-id
AGORA_APP_CERTIFICATE=your-app-certificate
AGORA_CUSTOMER_ID=your-customer-id
AGORA_CUSTOMER_SECRET=your-customer-secret
AGORA_AGENT_ID=your-agent-uid        # OR: AGORA_PIPELINE_ID=your-pipeline-id
AGORA_REGION=GLOBAL                  # optional region override
PUBLIC_BASE_URL=https://your-server   # used for webhook callbacks
WEBHOOK_SECRET=your-webhook-secret   # optional: verify webhook signatures
AGORA_ENV=prod                       # dev | staging | prod
```

> **Security:** `AGORA_CUSTOMER_SECRET` and `AGORA_APP_CERTIFICATE` are the
> equivalent of API keys. They must live **only** in the server environment /
> secret store — **never** in frontend code, the browser, or the git repo.
> VyaparVaani only ever sends the App ID and a short-lived token to the client.
> A real `.env` with live values is already in place on this machine
> (`appid`, `certificate`, `customerId/secret`), so `#/agora` reports
> **Connected** in production mode today.

### Installing the official Agora SDKs

Both are already in `package.json`:

```bash
npm install agora-token agora-access-token
```

`agora-token` provides the Conversational AI (`ConvoAITokenBuilder`) and App
Builder (`ApaasTokenBuilder`) builders. `agora-access-token` keeps the legacy
RTC compatibility path working.

---

## 4. Turning on live voice

1. Kill the running server, then start it so it picks up `.env`:
   ```bash
   npm start
   ```
2. Open **`#/agora`** (Agora Integration) in the app.
   - The banner changes from **Mock mode** → **Connected** when the server
     detects the credentials.
   - Click **Test connection** to run the self-check (App ID, customer
     credentials, agent ID, token minting).
3. Open **`#/agent-config`** and **Publish Configuration** to apply your agent
   settings. (Live deployment of the agent itself still happens in Agora
   Console / AI Studio — VyaparVaani never claims a false "published to Agora".)

### Real call flow once `AGORA_AGENT_ID` / `AGORA_PIPELINE_ID` is set

When the credentials **and** the agent/pipeline are configured:

- `POST /api/agora/session/start` calls Agora's real `/join` endpoint, which
  starts the Conversational AI agent in a dedicated RTC channel and returns the
  real `agent_id`, agent UID, and channel info.
- The browser then joins that channel via **Agora RTC** (short-lived token from
  `/api/agora/token`) and streams the microphone to the agent. Audio from the
  agent is played back to the user in real time.
- `POST /api/agora/session/stop` calls the real `/leave` endpoint.
- `GET /api/agora/health` performs a real REST connectivity + auth probe
  (`ok: true`, `apiReachable: true` when your Customer credentials valid).
- `GET /api/agora/configuration` returns the resolved (non-secret) integration
  config, and `POST /api/agora/webhooks` verifies Agora webhook payloads via
  HMAC when `WEBHOOK_SECRET` is set.

If credentials are set but the agent is **not**, `/session/start` returns an
honest error (HTTP 400 from Agora) and the session is recorded with
`status:error` — the dashboard shows **Agent unavailable** rather than a fake
"connected" state.

---

## 5. Verification / sanity checks

| Command | Purpose |
|---------|---------|
| `npm run preflight`           | Checklist of required env vars + prod-readiness. |
| `npm run agora:tokens`        | Confirms the token service can mint each token type. |
| `npm run build:validate`      | Verifies every frontend asset exists and parses. |
| `GET /api/health`             | Returns `agora.connection`, `agora.env`, `agora.mocked`. |
| `GET /api/agora/connection-test` | Per-check connection self test (authenticated). |

The **Agora Integration** dashboard also exposes button links straight to the
Agora Console, AI Studio, and App Builder.

---

## 6. What is mocked vs real

Everything runs end-to-end **without** credentials, in a clearly-marked mock
mode:

| Capability | Mock mode (no creds) | Live mode (with creds) |
|------------|----------------------|------------------------|
| Voice chat | browser Web Speech | Agora RTC transport |
| Voice-AI agent | recorded session/call locally (mock) | real Conversational AI agent |
| Tokens | `available:false` (never fabricated) | minted securely server-side |
| Dashboard status | Mock mode / Not configured | Connected / Production-ready |
| Agent config + versions | fully functional (local) | fully functional + deployable in Console |

The dashboard **never** shows "Published successfully" unless a real publish
to Agora actually succeeds — publishing config locally is clearly labelled as a
local version save.
