# Astra remote ChatGPT browser controller

This is an **optional, separate backend** for the existing Astra/Meal Mate ChatGPT Bridge. It runs a persistent Playwright Chromium profile and streams JPEG screencast frames over an authenticated WebSocket. The user controls login/2FA/CAPTCHAs manually. The controller types a prompt into the visible ChatGPT composer, observes the displayed assistant reply, and streams updates to Astra. It uses **no private ChatGPT API**. Login input necessarily travels through your self-hosted browser controller, so treat that service as sensitive infrastructure.

## Run locally

1. Generate a strong secret using `openssl rand -hex 32`. Export as `BROWSER_CONTROL_TOKEN`.
2. Set `BROWSER_ALLOWED_ORIGINS=http://localhost:5173` (or your exact Astra origin, e.g. `https://astra.example.com`).
3. Run `docker compose -f docker-compose.browser.yml up --build -d` from the repository root.
4. Set `VITE_BROWSER_SERVICE_URL=ws://localhost:8787/ws` in Astra's frontend environment; restart the app build. **Never** put the token in a `VITE_` variable.
5. Open **ChatGPT Bridge**, enter your controller token, connect, log in in the live view, then run a prompt.

For a hosted HTTPS website use **wss://** with an authenticated TLS reverse proxy pointing at port 8787. Set `BROWSER_ALLOWED_ORIGINS` to the **exact frontend origin**. Do not publish the controller directly to the internet, and restrict its container's egress to sites required for ChatGPT and selected login methods.

## API and protocol

The WebSocket `/ws` accepts a first message `{"type":"auth","token":"..."}`. All subsequent messages are authenticated per-connection. Actions:
- `{"type":"pointer","x":100,"y":50}` click, or `{"type":"pointer","action":"down|move|up","x":100,"y":50}` for dragging.
- `{"type":"wheel","dx":0,"dy":400}`, `{"type":"key","key":"Enter"}`, `{"type":"type","text":"hi"}`
- `{"type":"prompt","text":"..."}`, `{"type":"cancel"}`, `{"type":"status"}`

Server events: `authenticated`, `status`, `frame` (JPEG base64 with 1280x800 dimensions), `response` (cumulative text), `done`, and `error`.

There is also `POST /api/browser/prompt` with `Authorization: Bearer <BROWSER_CONTROL_TOKEN>` and JSON `{"prompt":"..."}`. It produces Server-Sent Events (`response`, `done` or `error`). Only one automated prompt runs per profile at a time. `GET /health` exposes no session details.

## Security and limitations

- Chromium profile persists in the Docker volume `browser_profiles`; **it contains login sessions**. Keep the volume private and protect backups. The frontend does not retain the controller token or ChatGPT cookies. Any login text typed through the remote controls passes through the frontend and browser controller transiently, so only deploy this on a host you trust.
- One active interactive controller. Reconnecting replaces the old controller. Explicit origin check plus per-connection token authentication; token must be 32+ characters. Server only listens on loopback by default; the Compose port is loopback-bound.
- Browser top-level navigation is restricted to ChatGPT and selected identity providers; requests to local network addresses are blocked. Google, Apple, Microsoft login pages are available for manual interaction. Extra SSO providers require a reviewed allowlist change.
- Dynamic ChatGPT DOM selectors can change. The service reports errors rather than silently switching to another API. Response extraction is from the **active generated reply**, not existing conversation history.
- CAPTCHA solving is **manual only**. Automation must respect the target service's terms and limits. Use the official OpenAI API if stable programmatic API integration is required.
- Production use needs per-user isolation, access management, TLS/WSS, audit/rate limits, container egress filtering, appropriate sandboxing and a durable deployment platform. The single-profile controller is intended for one trusted owner, **not a public multi-tenant service**.
- The remote Chromium session is not deployed by Lovable automatically. A persistent Docker-capable host is required. A static-only hosting plan cannot run it.
