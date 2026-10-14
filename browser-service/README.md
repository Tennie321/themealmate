# Astra remote ChatGPT browser (self-hosted)

This is an **opt-in, single-owner** browser controller for Astra. The normal
ChatGPT link handoff continues to work without this service. The controller
uses Playwright's Chromium with a **persistent profile**, CDP screencast
frames over a browser-authenticated WebSocket, and page-based prompt/reply
automation (not an OpenAI API). The user handles sign-in, MFA and CAPTCHAs
manually in the streamed browser. No challenge-solving is automated.

## Run locally

Create a root `.env` file (never commit it). At minimum:

```env
REMOTE_BROWSER_ACCESS_CODE=choose-a-long-private-code-16-or-more
REMOTE_BROWSER_SESSION_SECRET=replace-with-at-least-32-random-characters
```

Generate strong values using `openssl rand -hex 32`. Configure
`ASTRA_ACCESS_CODE`, `ASTRA_SESSION_SECRET`, and optional Lovable/Perplexity
server secrets separately if you want to use those parts of Astra.

```sh
docker compose -f compose.yml up --build -d
# Open http://localhost:8080, then ChatGPT Bridge -> Remote browser.
docker compose -f compose.yml logs -f browser
```

The Nginx gateway is bound to **127.0.0.1:8080**, not the public internet.
The separate Chromium service has **no published host port**. Its WebSocket,
auth endpoints, and screenshots are reachable from the same origin at
`/browser/ws`, `/browser/auth`, and `/browser/status`. The gateway
strips the `/browser/` prefix before forwarding to the internal service.

For remote access, use your own TLS-terminating reverse proxy or VPN in
front of port 8080; never expose this HTTP endpoint directly over the
internet. Forward the original `Host` and normal WebSocket upgrade headers.
**HTTPS/WSS are mandatory outside loopback.** Secure cookie flag follows
the browser's HTTPS Origin. Browser credentials and ChatGPT cookies live in
the `browser-profile` Docker volume; back it up securely and never publish
or commit it. `docker compose down -v` erases the saved ChatGPT session.

## How it works

1. In Astra, open **ChatGPT Bridge -> Remote browser** and unlock using
   `REMOTE_BROWSER_ACCESS_CODE` (not your ChatGPT password).
2. Click and type directly into the streamed Chromium view to complete
   ChatGPT sign-in, MFA, or any CAPTCHA on the actual `chatgpt.com` site.
3. Type a prompt in Astra and click **Run prompt**. The server locates the
   live composer, types the prompt and submits it. It watches assistant
   messages and streams their updated text into Astra in real time.
4. Click **Stop** to cancel the current automation. You can reconnect to
   the same browser and review the last run in the current server process.

All remote actions require a signed, HttpOnly, SameSite=Strict session
cookie. Login attempts are throttled per network peer, and WebSockets
reject missing sessions or cross-origin connections. No raw credentials
or profile files are sent to Astra's normal AI chat APIs. Multiple clients
with the same access code will operate the **same** browser and may
interfere; restrict it to a single trusted operator.

### Protocol

Client -> server WebSocket JSON messages:

- `{type:"pointer", action:"down"|"move"|"up"|"scroll", x, y, button, dx, dy}`
- `{type:"key", key:"Enter"}` or `{type:"insert", text:"typed text"}`
- `{type:"navigate"}` (resets the page to chatgpt.com)
- `{type:"run", runId:"uuid", prompt:"..."}` and `{type:"cancel"}`

Server -> client: `frame` with a JPEG base64 string, `status` with
readiness/busy/last run, `response` with partial/final assistant text,
and `error` with a human-readable failure reason.

## Verification

```sh
npm install --prefix browser-service --no-audit --no-fund
npm run check --prefix browser-service
npm test --prefix browser-service
docker compose -f compose.yml config
```

WebSocket integration and live ChatGPT sign-in require a deployed browser
instance and manual end-to-end verification. ChatGPT DOM selectors are
subject to change; neither the browser service nor existing Safari
handoff is a supported ChatGPT API. The service does not bypass CAPTCHAs
or perform unattended actions while a human verification step is required.
