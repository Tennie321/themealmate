# Astra remote ChatGPT browser sidecar

This is an **opt-in, single-owner** companion to Astra's existing ChatGPT Bridge. It hosts a Playwright Chromium browser on a persistent volume, streams JPEG frames using Chrome DevTools Protocol screencast over an authenticated WebSocket, accepts mouse/keyboard control, and types explicitly submitted prompts into the signed-in ChatGPT website. It then emits incremental assistant response text as WebSocket events.

It is not an OpenAI API integration. The ChatGPT website DOM and access rules can change. It does not bypass CAPTCHAs, 2FA, or login challenges: the user handles them in the live browser view. It never asks for or stores passwords in Astra application storage; input manually typed via the remote controls is sent to the browser service. Treat the browser screen itself as sensitive.

## Start locally

1. Set server-only `ASTRA_ACCESS_CODE` (12+ characters) and `ASTRA_SESSION_SECRET` (32+ characters) in the **Astra application**. Users must unlock the private beta first, even if Lovable AI is disabled.
2. Generate an independent 32+ character random `ASTRA_BROWSER_TOKEN_SECRET`, and set it on **both** the Astra app server and the browser sidecar. Never use a `VITE_` variable, commit the value or reuse the beta access code.
3. Determine the actual Astra web origin (including protocol and port). Example: `http://localhost:5173`. In the sidecar folder run:

```sh
export ASTRA_BROWSER_ALLOWED_ORIGIN=http://localhost:5173
export ASTRA_BROWSER_TOKEN_SECRET='use-a-long-random-secret-generated-locally'
docker compose up --build -d
```

4. Set `ASTRA_BROWSER_PUBLIC_WS_URL=ws://localhost:8788/socket` on the Astra server **only when the Astra frontend runs on the same local computer via HTTP**. Open ChatGPT Bridge → Connect browser. Sign in directly using the remote browser view, then use the prompt automation field.

The example secret is a placeholder, not a real credential. The container stores Chromium data under `/profiles/owner` in the `chatgpt_browser_profile` Docker volume; logout/cleanup is controlled by the ChatGPT UI or by deleting the volume yourself. Disconnecting does **not** sign out of ChatGPT.

## Host securely

- Host the browser service on an isolated machine/container. The sample Compose binds port 8788 to 127.0.0.1 only. Place a TLS reverse proxy in front of `/socket` with HTTPS → WebSocket Upgrade support, and set `ASTRA_BROWSER_PUBLIC_WS_URL=wss://browser.your-domain.example/socket` in Astra's server-only environment.
- Set `ASTRA_BROWSER_ALLOWED_ORIGIN=https://astra.your-domain.example` on the browser container. It must exactly match the browser's Origin and the origin where Astra is hosted, without a trailing slash.
- Never expose the service's raw port to the Internet. Use TLS, network firewall rules, an owner-only Astra deployment, and trusted server/volume storage. ChatGPT session cookies and signed-in page screenshots are sensitive.
- Tickets are valid for 45 seconds and one use. Astra issues them only from a same-origin POST with a valid signed beta session and full configured credentials. The worker checks HMAC, expiry, nonce replay, WebSocket subprotocol and exact Origin before allowing control.
- Only one remote viewer has control at a time. Reconnection preempts the previous viewer. This architecture is **not multi-tenant**: a shared beta access code means everyone with it can see/control the same ChatGPT account. Isolated per-user profiles, real identity and centralized authorization are required before any shared deployment.
- Sidecar and frontend must both be online; Lovable's managed hosting does not automatically deploy Docker Compose services or configure secrets. If you cannot host the sidecar, keep using the existing link handoff.
- Browser control is experimental, relies on documented Playwright and Chrome DevTools screencasting plus ChatGPT UI selectors, and may fail after ChatGPT redesigns or during account challenges. No CAPTCHA-solving or stealth techniques are included.

## Protocol

POST `/api/browser/ticket` on Astra (with beta session cookie and same-origin Origin) → `{ wsUrl, ticket }`. Frontend opens `new WebSocket(wsUrl, ['astra.browser.v1', 'ticket.' + ticket])`. Worker returns `frame` (base64 JPEG), `status` (only hostname + busy), `run:start`, `run:delta` / `run:replace`, `run:done` and `run:error` messages. Commands: `mouse`, `scroll`, `type`, `key`, `home`, `run`, `stop`, `status`. There is no unauthenticated command API. The worker never stores the prompt/reply transcript; UI state stays in the tab.

## Validation

```sh
npm run test:security           # root unit/static regression checks
npm test --prefix services/chatgpt-browser
npm run build
npx tsc --noEmit
```

For a staging smoke test: connect after unlocking Astra, verify screenshot and pointer actions, log into ChatGPT manually, submit a short prompt and confirm progressive output and completion, stop a running prompt, disconnect/reconnect and verify persistence. Test expired/replayed tickets and unauthorized origins; verify the service is unreachable without an authorized ticket. Automated tests do not log in to ChatGPT or exercise its live UI.
