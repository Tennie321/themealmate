# Astra remote ChatGPT browser

This optional service runs a persistent Playwright Chromium browser in a separate container. It is **not** part of the Lovable Cloud runtime, and it does not use an undocumented ChatGPT API or bypass authentication/CAPTCHAs.

## Local setup

Create private environment values for Docker Compose (do not commit them):

~~~bash
cd integrations/remote-browser
# A 32+ character random token, e.g. from: openssl rand -hex 32
export REMOTE_BROWSER_TOKEN="replace-with-private-random-value"
# Must match the exact origin of the Astra frontend:
export REMOTE_BROWSER_ALLOWED_ORIGINS="http://localhost:5173"
docker compose up --build -d
curl http://127.0.0.1:8787/healthz
~~~

Run the web app from the repository root with npm run dev. The Vite development proxy forwards /remote-browser/ws to the container's /ws endpoint. If Vite uses another port, configure the matching origin above. Open **ChatGPT Bridge**, scroll to **Remote browser control**, enter your service token and choose a profile such as "default". The browser launches at chatgpt.com; interact with the screen to log in and complete challenges yourself. You can click the remote image, use the keyboard with the image focused, use the mobile typing bar, scroll, go back and reload. Enter a prompt and click **Run prompt** to stream assistant text into Astra. **Stop** requests cancellation.

Browser profile directories live in the named Docker volume browser-profiles, surviving container restarts. Back it up and restrict filesystem access; it contains sensitive signed-in browser state. Up to two simultaneous profiles are supported, with one prompt executing per profile.

## Production setup

This is a **single-owner service**. Anyone with REMOTE_BROWSER_TOKEN can control and read every profile. It is not designed for public multi-user access. Keep Docker port 8787 bound to localhost or a trusted private network. Use a TLS terminator with WebSocket upgrade support and an exact origin allowlist.

If Astra is hosted on a platform that permits reverse-proxy routing, forward /remote-browser/ws to http://127.0.0.1:8787/ws with Upgrade, Connection and Origin headers preserved. If it doesn't, expose only the authenticated WebSocket through your own HTTPS reverse proxy, e.g. wss://browser.example.com/ws, and set VITE_REMOTE_BROWSER_WS_URL to that public WSS endpoint at frontend build time. Do not set a VITE_ variable containing REMOTE_BROWSER_TOKEN. Set REMOTE_BROWSER_ALLOWED_ORIGINS to the exact public origin of the Astra app. The separate worker must be actually running and reachable; deploying frontend code to Lovable alone does not start Chromium.

## Security and limitations

- REMOTE_BROWSER_TOKEN is held in page memory for the active connection only, and is sent after WebSocket connection in an auth message. Authentication and exact origin checking happen before browser actions. Rotate the token to revoke service access; existing live connections require restart/disconnection.
- Profile IDs are restricted to alphanumeric characters, underscores and hyphens, so clients cannot choose arbitrary filesystem paths.
- ChatGPT account login, CAPTCHA, and MFA are performed manually by the user. Never automate challenge solving or send ChatGPT credentials as automated prompts.
- The service streams JPEG screencast frames and text extracted from the visible ChatGPT DOM. It does not read ChatGPT cookies or offer browser debugging commands to the client, and does not read existing conversations automatically.
- ChatGPT's HTML structure and controls can change without notice; the prompt composer, send button and assistant message selectors may require maintenance.
- The service is intentionally not a general web automation platform, a background queue, or a replacement for OpenAI's official API. Browser sessions may be subject to site terms and anti-automation measures.
- Access must be restricted with HTTPS/WSS, firewalls, an exact origin allowlist and a strong token. The worker runs in an isolated container with a non-root user, but a production security review is still required.

## Validation

~~~bash
node --test integrations/remote-browser/tests/*.test.mjs
# Or, after cd integrations/remote-browser:
npm test
~~~

The tests check token comparisons, exact WebSocket origins, profile ID traversal, ChatGPT-only navigation, and input validation. Full browser/CAPTCHA/login behavior requires a running container and manual staging smoke testing.
