# Astra remote ChatGPT browser bridge (experimental)

This is an **optional, self-hosted** Playwright worker for Astra's existing ChatGPT Bridge. It provides a real interactive Chrome session (CDP JPEG screencast), a manual login/verification surface, and a prompt runner that observes text from the ChatGPT webpage. It is **not** OpenAI's official API; browser selectors and site policies can change. Do not use this to bypass CAPTCHAs: the signed-in user completes them manually.

## Services and trust boundary

- Astra/TanStack app: continues to own the existing signed HttpOnly beta session. New POST /api/browser/ticket checks this session, the request Origin and its own rate fuse, then issues a signed, single-use **90-second** connection ticket (HMAC-SHA256) without sending the beta cookie to the worker. Tokens cannot be used from a different origin.
- Browser worker: Node + Playwright + ws, deployed as a **separate persistent Docker service**. The worker verifies the HMAC, expiry and exact allowed APP_ORIGIN in the WebSocket upgrade and first message. One live WebSocket owner can control the private browser at a time. Every WebSocket expires after 30 minutes; reconnect to renew. The worker does not log prompts, frames, passwords or session tickets.
- Browser data: stored under /data/profiles/<sha256(owner)> on the named Docker volume. Container restarts preserve login state. The current app is **single owner**, not a per-user account system: the signed subject is "owner". Do not share the beta access code or enable this in a multi-user deployment without first implementing real user identity and profile isolation.
- Client: under ChatGPT Bridge, click Connect browser. The live image maps pointer coordinates to 1280 x 800; clicking a field, then typing in the password-masked "Type into the selected browser field" box forwards text without saving it in React state. Keyboard navigation supports Enter, Tab, Backspace, arrows, etc. The prompt input sends a single controlled instruction and renders cumulative response snapshots; Stop cancels the job.

## Deploy locally

1. Configure the main Astra server's ASTRA_ACCESS_CODE (12+ chars) and ASTRA_SESSION_SECRET (32+ chars), and generate a **separate**, random BROWSER_BRIDGE_SECRET (32+ chars) shared only with the worker. **Both the Astra server and worker must use exactly the same independent BROWSER_BRIDGE_SECRET**. Do not use any VITE_ variables for secrets.
2. From services/browser-bridge, set APP_ORIGIN to the **exact web app origin**, for example http://localhost:3000 or https://astra.example.com. Run docker compose up --build -d. Port 8787 binds to localhost by default, not the public network. Check curl http://127.0.0.1:8787/healthz.
3. Set BROWSER_BRIDGE_WS_URL on the **Astra server** to ws://localhost:8787/v1/control for local development *if the web app itself is opened from that same machine*. For a hosted web app, put a TLS reverse proxy in front of the worker and use wss://browser.example.com/v1/control. The proxy must forward WebSocket upgrade headers and Origin, and must not rewrite the Origin. A browser on an HTTPS app will not connect to insecure ws://.
4. Sign in to Astra with its beta access code. Open **ChatGPT Bridge → Connect browser**. In the browser screen, complete ChatGPT login, MFA or CAPTCHAs yourself. Enter a test prompt and monitor response text below the viewport.
5. To run outside Docker for development, from services/browser-bridge run npm install, npx playwright install chromium and npm start. Set PORT, PROFILE_ROOT, APP_ORIGIN and BROWSER_BRIDGE_SECRET; make sure PROFILE_ROOT is a private directory.

### Example Nginx reverse proxy

Use a separate TLS host for the worker (and normal HTTPS upstream on the main Astra app):

    location /v1/control {
      proxy_pass http://127.0.0.1:8787;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection "upgrade";
      proxy_set_header Host $host;
      proxy_set_header Origin $http_origin;
      proxy_read_timeout 190s;
    }

Expose **only** this TLS endpoint to browsers; leave the port binding on loopback and restrict who can reach the host. Deploy on a dedicated trusted machine. Back up and encrypt the private Docker volume, protect it from other users, and delete it when revoking ChatGPT login state. Never put browser profiles in Git.

## WebSocket message contract

Client connects to /v1/control with the browser Origin (must match APP_ORIGIN), then sends JSON { "type": "auth", "ticket": "<signed-ticket>" } on open. Successful sessions receive status messages, a ready event with viewport size, and frame events containing base64 JPEG data.

Authenticated client actions:
- { "type":"pointer", "action":"move|down|up|click", "x":integer, "y":integer }
- { "type":"wheel", "dx":number, "dy":number }
- { "type":"key", "action":"down|up", "key":"Enter" }
- { "type":"type", "text":"typed input" }
- { "type":"prompt", "text":"prompt under 5001 characters" }
- { "type":"cancel" }

For automation, the worker sends run events with status started/completed/failed/cancelled and a runId, plus output events { type:"output", runId, text } containing the **latest full response snapshot**. There is at most one active automation per owner. Manual control is disabled during an automation; click Stop first to take over.

## Validation / known limitations

Run node --test services/browser-bridge/test/*.test.mjs for ticket and input validation, npm run build and npx tsc --noEmit for main app, and node --check services/browser-bridge/server.mjs. Validate the UI manually on a real ChatGPT account before production use. There is no automated bypass of authentication challenges. ChatGPT can change its selectors, response structure, terms or anti-bot rules, causing failures. Responses are extracted as rendered DOM text, not official token streaming; not every content type is supported. A session may need a reconnect after 30 minutes. The worker is intended for **one private operator only**. It is not designed to provide unaudited, unattended, shared-host multi-tenant browser control. The worker can access websites through Chromium; isolate its network and credentials accordingly.
