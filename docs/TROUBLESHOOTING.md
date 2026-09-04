# Troubleshooting Guide

Common issues and fixes for VyaparVaani, focused on the Agora integration.

---

## Server won't start

**Symptom:** `EADDRINUSE` or port 4321 already in use.
**Fix:** kill the previous Node process, then restart:

```powershell
# stop vyaparvaani node processes (watch parent + server child)
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -match 'vyaparvaani|server/index.js' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
npm start
```

**Symptom:** `agora-token` / `agora-access-token` not found.
**Fix:** `npm install agora-token agora-access-token`.

---

## Agora shows "Mock mode" even after adding credentials

- Confirm the `.env` file is in the **project root** and the server was
  **restarted** after editing it (`--watch` does **not** reload `.env` reliably).
- Confirm at least `AGORA_CUSTOMER_ID` + `AGORA_CUSTOMER_SECRET` are set (the
  server requires these to consider Agora configured).
- Run `npm run preflight` — it prints exactly which variables are missing.
- Verify `AGORA_ENV` is one of `dev|staging|prod`.

## "Connected" but can't start a live conversation (HTTP 400)

**Symptom:** `POST /api/agora/session/start` returns `502` with
`{category:"bad_request", message:"Failed to start the Agora voice agent: HTTP 400 from Agora"}`.

**Cause:** credentials are valid (health shows `ok:true`) but **no agent is
configured** — `AGORA_AGENT_ID` / `AGORA_PIPELINE_ID` is empty.

**Fix:** create + publish a Conversational AI agent in Agora console / AI
Studio and set `AGORA_AGENT_ID` (or `AGORA_PIPELINE_ID`) in `.env`, then
restart. The dashboard **connection-test** shows `agent_id (✗)` until then.

## The chat view keeps saying "browser Web Speech"

That's correct and honest while the agent isn't configured. The app only
switches to "Live: Agora RTC agent" when BOTH the credentials are connected
AND `agentConfigured` is true. Set `AGORA_AGENT_ID` and restart to flip it.

## Token / "not available" errors

VyaparVaani **never fabricates tokens**. If a token request returns
`available:false` it means the server-side credentials aren't present:
- Check the server log for `reason` (e.g. missing customer secret).
- Confirm the App ID / Customer ID belong to the **same Agora account**.
- Confirm the token type matches the SDK builder used (RTC vs Conversational AI).

## Voice test starts but no audio

- The browser needs mic permission and a modern browser (Chrome/Edge/Firefox).
- In **mock mode** the app falls back to Web Speech — network voice requires the
  live credentials (see `AGORA_SETUP.md`) and an RTC-capable network path.
- Open the *Agora Integration* dashboard and click **Test connection** to see
  which check fails first (App ID / customer / agent / token).

## "Publish" review doesn't open or a promise error appears

The publish flow builds a review modal listing exactly the changed fields
between the last published version and the current draft:
- Verify the frontend assets are up to date (hard-reload the page to bypass
  cache; the app is served fresh on a normal deploy).
- Confirm the server is running (`/api/health`) and you are signed in —
  publish requires an authenticated session.

## Version history / rollback missing entries

Rollback always **creates a new version** (tagged `rollback`) rather than
rewriting the old one. Look for the newest version number; it may be higher
than the one you expected. History is kept in `server/data/agentVersions.json`.

## Dashboard shows stale counts

Counts (calls, conversations, cases, reviews) are read from the JSON store on
demand. Re-open the dashboard or click refresh; if they're 0 after a reset,
that's correct (see `reset-data`).

## Cookie / session issues

- If `VY_COOKIE_SECRET` is unset, the server uses an insecure dev secret and
  logs a **warning** — set it in production.
- Demo login: `POST /api/auth/demo` with `{"email":"demo@vyaparvaani.local"}`.

## Still stuck?

Run `npm run preflight` and `npm run build:validate`, then check the server
console for the first error. See `docs/AGORA_SETUP.md` and
`docs/DEPLOYMENT.md`.
