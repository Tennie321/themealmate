# Astra remote ChatGPT browser (optional)

This is a **separate Node + Playwright container**, not a Lovable Cloud runtime.
The Astra app stays on TanStack Start; it mints a **60-second, one-use signed ticket**
after authenticating the existing private-beta cookie. The browser's WebSocket
validates that ticket and the exact calling Origin **before** launching Chrome.
The worker streams CDP JPEG screencast frames back to the UI and receives
pointer, scroll, keyboard, and explicit prompt actions. It never asks Astra
for the ChatGPT password; sign in and handle security challenges yourself in
the remote screen. The Chrome profile survives worker restarts via a Docker volume.

## Deploy

1. Ensure the existing app has `ASTRA_ACCESS_CODE` (12+ characters) and
   `ASTRA_SESSION_SECRET` (32+ random characters) configured as server secrets.
   This feature fails closed if that gate is not configured.
2. Generate a fresh shared secret: `openssl rand -hex 32`. Store it privately
   as `ASTRA_BROWSER_SECRET` in **both** the Astra server environment and the
   browser worker environment. Do not put it in `VITE_` vars or the repository.
3. Configure the worker's `ASTRA_BROWSER_ORIGIN` to the **exact** Astra
   origin (such as `https://astra.example`, no trailing slash).
4. Inside this directory, create a local untracked `.env` with only
   `ASTRA_BROWSER_SECRET=...` and `ASTRA_BROWSER_ORIGIN=...`; run
   `docker compose up -d --build`.
5. Terminate TLS at a reverse proxy and send
   `wss://browser.example/remote-browser/ws` to
   `http://127.0.0.1:8787/remote-browser/ws` with HTTP Upgrade support.
   Set server-only `ASTRA_BROWSER_PUBLIC_WS_URL` in Astra to the full WSS URL.
   Alternatively proxy `/remote-browser/ws` on Astra's own public origin
   and leave `ASTRA_BROWSER_PUBLIC_WS_URL` blank. A separate hostname
   is usually easier on hosted deployments. Do not expose port 8787 publicly.
6. Unlock Astra and open ChatGPT Bridge → **Connect**. Click in the streamed
   browser to focus fields, then use a hardware keyboard, or the remote-keyboard
   text field/Tab/Enter controls on touch devices. When logged in, enter an
   automated prompt and select **Run in ChatGPT**. The response streams below
   the browser. **Stop** attempts to stop current generation.

## Safety / operational constraints

- One shared browser profile and one active controller per worker. **Single
  owner only**; add durable multi-user authentication, isolated profiles,
  resource quotas and audit policies before enabling this for other users.
- Treat the worker as sensitive: its persistent Docker volume includes ChatGPT
  session cookies. Encrypt and restrict it; do not include it in backups/logs.
  Secure the host, restrict egress to public websites and block RFC1918/metadata
  endpoints at the infrastructure firewall. Run as non-root, without privileged
  Docker permissions. The browser has no full desktop address bar.
- Browser pixels and prompts pass only through the short-ticket WebSocket
  to the configured worker. The signed ticket is not a ChatGPT token and is
  never put into a URL. Use TLS / WSS except localhost development.
- No CAPTCHA solver or security-check bypass is provided; interact manually.
  We do not guarantee ChatGPT browser automation or any ability to bypass
  site usage limits. ChatGPT may change its selectors, login flows or policies.
- CDP screenshots are a **screencast**, not WebRTC video; network latency
  and CPU consumption depend on your worker. The app is responsive without the
  worker, and retains link handoff as a fallback.
- The worker intentionally allows user interaction with sign-in pages and the
  ChatGPT interface. It is **not a general-purpose open web crawler** and
  should be deployed with strict container egress controls.
- This repository cannot deploy the worker inside Lovable Cloud automatically.
  Configure an external container host and WSS endpoint before expecting
  remote control to work.

## Quick checks

- `curl -s http://127.0.0.1:8787/remote-browser/health` returns
  `{"status":"ok"}` (health does not authenticate or start the browser).
- An unsigned or expired WebSocket ticket must be rejected.
- Connect while locked out of Astra: `POST /api/browser/ticket` returns 401.
- Connect when the secret is unset: the endpoint returns 503.
- Run `npm run test:security` in the repository root for ticket/URL tests.
- Smoke-test interactive login, manual CAPTCHA handling, sending a prompt,
  streaming completion, stopping, disconnecting/reconnecting, and cookie
  persistence after restarting the container.

**Important:** Production behavior has not been verified by adding these
files alone. Deployment configuration, live auth and smoke testing are required.
