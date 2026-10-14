# Astra remote ChatGPT browser

This optional service adds a **single-owner**, persistent Playwright Chromium browser to
Astra's ChatGPT Bridge page. Browser pixels stream via Chrome DevTools Protocol
screencast frames and authenticated WebSockets. The user can operate login and
verification screens directly; Astra never receives a ChatGPT password as an
application credential. A prompt command types into the active ChatGPT composer,
submits it and streams assistant reply text from the rendered page.

## Requirements

- An **independently deployed** Linux/Docker host with persistent storage.
  Lovable-hosted TanStack frontend/server routes do not launch containerized
  browsers themselves.
- HTTPS for the Astra app and **WSS** for the browser endpoint. Run the browser
  service behind a TLS reverse proxy; do not publicly expose the raw HTTP port.
- Astra server secrets `ASTRA_ACCESS_CODE` (12+ characters),
  `ASTRA_SESSION_SECRET` (32+ characters), `ASTRA_BROWSER_SHARED_SECRET`
  (32+ characters) and `ASTRA_BROWSER_PUBLIC_WS_URL`.
- The browser container gets that **same** `ASTRA_BROWSER_SHARED_SECRET`,
  `ASTRA_BROWSER_ALLOWED_ORIGINS` (exact Astra origin), and a persistent
  volume for `ASTRA_BROWSER_PROFILE_DIR`.

## Start locally

From `services/remote-browser`:

```bash
# Use your own independent random 32+-character value, identical in both environments.
export ASTRA_BROWSER_SHARED_SECRET="REPLACE_WITH_A_LONG_RANDOM_SECRET"
export ASTRA_BROWSER_ALLOWED_ORIGINS="http://localhost:3000"
docker compose up --build -d
curl http://127.0.0.1:8787/health
```

Configure the main Astra server with:

```bash
ASTRA_ACCESS_CODE=<your-own-12-plus-character-access-code>
ASTRA_SESSION_SECRET=<a-separate-long-random-secret>
ASTRA_BROWSER_SHARED_SECRET=<same-secret-used-in-the-container>
ASTRA_BROWSER_PUBLIC_WS_URL=ws://localhost:8787/ws
```

Local insecure WS is permitted **only** for localhost. For production, configure
`ASTRA_BROWSER_PUBLIC_WS_URL=wss://browser.your-domain.example/ws` and put the
browser service behind a TLS reverse proxy that supports WebSocket upgrades.
Set `ASTRA_BROWSER_ALLOWED_ORIGINS=https://your-astra-app.example` to the
actual browser address bar's origin. For multiple trusted origins, separate them
with commas. Do not include paths or trailing slashes.

The container listens on 8787 but `compose.yaml` binds it to the host loopback
interface only, ready for a same-host reverse proxy. Deploy with a volume
that survives container restarts. The image runs as an unprivileged user; avoid
world-readable browser profile mounts. Check that the volume is writable.

Then open **Astra → ChatGPT Bridge → Connect browser**. Sign in to ChatGPT inside
the streamed screen, complete challenges yourself, focus the screen to type,
or use the paste field to send text into the focused form control. Click **Send
prompt** to automate a ChatGPT turn. The latest assistant reply appears below
the screen as it is generated. **Stop** requests cancellation.

## Protocol

1. Astra `POST /api/browser/session` checks its existing signed private
   beta session (fail-closed), verifies same origin, rate-limits issuance and
   signs a 60-second one-use grant. No app secret is sent to the browser.
2. The UI connects to `wss://.../ws` with WebSocket subprotocols
   `astra.browser.v1` and `auth.<signed-grant>`. The grant is not in a URL,
   query string, browser history or container logs.
3. The service validates the signature, audience, expiry, nonce replay and
   exact `Origin`, then serves `ready` and `frame` events. One browser
   controller connection is active at a time.
4. Incoming JSON actions: `input` (pointer/key/wheel/paste), `home`,
   `reload`, `prompt` (`prompt` string 1–8000 chars), and `cancel`.
   The service emits `prompt_started`, repeated `response_update` snapshots,
   `response_done`, `response_cancelled`, or `response_error`.

The service uses the actual ChatGPT website, **not** a supported OpenAI API.
UI selectors, account restrictions, response structures and sign-in flows can
change. No guarantee is made for CAPTCHA compatibility or continuous operation.
No CAPTCHA bypass, session-cookie extraction, stealth tooling or login automation
is implemented.

## Security and operating boundaries

- **Single-owner only.** Astra's current access code is not true per-user
  identity. All authorized Astra sessions operate the **same** saved ChatGPT
  browser, and a second connection replaces the first. Do **not** expose to
  multiple unrelated users without adding real identity, per-user profile
  directories, authorization and quotas.
- Browser profiles contain authentication cookies and account data. Back them
  up/encrypt them as secrets; do not commit or share the mounted volume.
- Anyone controlling this browser may send messages or interact with the active
  ChatGPT account. Use strong Astra access credentials and HTTPS/WSS, restrict
  the reverse proxy to trusted users/network as practical, and rotate the shared
  secret to invalidate future tickets. Revoking an already connected session
  also requires terminating that WebSocket or restarting the service.
- The service never records passwords or stream frames to disk; screenshots
  travel through a WebSocket to your device. Be aware this may disclose
  sensitive on-screen account data to the host operator.
- No unrestricted navigation API is offered. `home` only navigates to
  `https://chatgpt.com/`; identity-provider redirects in login are user-driven.
- The service is **not** an unattended scheduler, multi-tenant browser farm or
  a general-purpose HTTP proxy. It does not bypass provider rate limits.

## Verification

Run `node --test services/remote-browser/tests/*.test.mjs` from the repo root
for ticket-authentication unit tests; `npm run test:security` runs the
cross-service ticket contract. The GitHub CI workflow checks application build,
types, regressions and browser-service JavaScript syntax. Live login, screenshot
delivery and response extraction require running the real container and
manually exercising ChatGPT; CI does not have an authenticated ChatGPT account.

For production readiness, add distributed rate limits, per-user authentication
and isolated profile volumes before offering this to anyone other than the
private beta owner.
