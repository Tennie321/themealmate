# Remote browser control design

Goal: integrate a remote, user-controlled Chromium view into Astra's existing ChatGPT Bridge and stream automation replies into the main UI.

## Components
- Dedicated Docker Playwright worker with persistent per-session Chromium user-data directories in a Docker volume, 1280x800 viewport and CDP screencast JPEG frames sent over WebSocket.
- Astra React viewer sends bounded pointer, keyboard, typed text and reload commands over the same WebSocket. Login/MFA/CAPTCHA are performed interactively by the user; no bot circumvention.
- An automation lane invokes the **official OpenAI Responses API** with a server-side key and streams SSE output as WebSocket deltas. This is **not** the ChatGPT website conversation and must be labeled accordingly. Do not scrape ChatGPT page outputs; https://openai.com/policies/terms-of-use/ prohibits programmatic extraction of ChatGPT Output.
- Existing ChatGPT URL handoff remains available without backend hosting.

## Hosting
Lovable's managed TanStack app cannot itself host long-lived Chromium/WS. Deploy an isolated Docker worker and an HTTPS same-origin reverse proxy forwarding `/browser/*` upgrades to it and all other paths to Astra. Same-origin auth is mandatory. Worker shares only server-side `ASTRA_SESSION_SECRET` with Astra, verifies existing signed `astra_beta_session` cookie (expiry, nonce, HMAC), and exact configured `PUBLIC_ORIGIN`. Store encrypted user profile volume securely. Do not expose worker port publicly.

## Protocol
Client: `input.mouse`, `input.wheel`, `input.key`, `input.text`, `browser.reload`, `prompt.submit`, `prompt.cancel`.
Server: `status`, `frame` (JPEG base64, dimensions), `prompt.delta`, `prompt.done`, `prompt.error`.
Reject malformed/oversized commands, no arbitrary CDP or shell commands, cap one session and one API request, abort on socket close and throttle frames. No server-side logging of user input, image frames, ChatGPT cookies, or API output.

## Acceptance
Authenticated remote view supports manual sign-in; profile persists across reconnect/restart; unauthenticated and cross-origin connections are rejected; remote controls work; official API prompt streams incremental text and handles errors/abort; users are told it is separate from ChatGPT. Browser backend deployment, a real ChatGPT sign-in and API key are prerequisites to end-to-end live testing.