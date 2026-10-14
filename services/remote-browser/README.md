# Remote Browser Studio — standalone Docker service

This worker provides an interactive, persistent Chrome browser and a **separate** streamed OpenAI API runner inside Astra's ChatGPT Bridge.

**Important:** this is for a single-owner private beta on infrastructure you control. It is not a managed Lovable Cloud capability. The existing Lovable preview will show the panel but cannot connect until a same-origin reverse proxy forwards \`/browser/*\` to this service. No CAPTCHA bypass, output scraping, or automatic extraction from ChatGPT's website is included. ChatGPT website output automation is restricted by OpenAI Terms: https://openai.com/policies/terms-of-use/.

## Prerequisites

- Docker with Compose and an HTTPS reverse proxy for the **same hostname** serving Astra.
- Existing Astra beta access: \`ASTRA_ACCESS_CODE\` and \`ASTRA_SESSION_SECRET\` configured in the Astra application. Enable the private beta, sign in, and keep its secret server-only.
- Set the SAME \`ASTRA_SESSION_SECRET\` in the worker. WebSocket upgrades validate Astra's existing HTTP-only \`astra_beta_session\` cookie and exact \`PUBLIC_ORIGIN\`.
- An independent \`OPENAI_API_KEY\` and API billing if you wish to run API automation. A ChatGPT paid subscription is **not** an API key.
- A trusted host for browser profile storage. Chrome profiles include sensitive authentication cookies and must be backed up/encrypted at rest.

## Start

From \`services/remote-browser\`:

1. Create a local untracked \`.env\` containing the variables shown in \`.env.example\`. Do **not** commit values.
2. \`docker compose up --build -d\`
3. From the Docker host: \`curl http://127.0.0.1:3100/browser/health\` should return \`{"status":"online"}\`.
4. Terminate TLS at a proxy on the SAME HTTPS hostname used to access Astra. Forward **both HTTP and websocket upgrades** under \`/browser/*\` to \`127.0.0.1:3100\`. Example Caddyfile: \`Caddyfile.example\`. Route all other paths to the existing Astra app.
5. Open Astra → ChatGPT Bridge → Connect browser. Use the remote screen to sign in, satisfy any manual verification and interact with the page. Click a field and use **Type** to insert text; Enter and navigation keys are supported.
6. Run the **Official OpenAI API** pane to stream a new, separate API response. It does **not** execute a prompt in the ChatGPT website session.

## Protocol

URL: \`wss://<ASTRA_HOST>/browser/ws\` via same-origin proxy, no API key or token in URL.

- Client sends JSON \`input.mouse\`, \`input.wheel\`, \`input.key\`, \`input.text\`, \`browser.reload\`, \`prompt.submit\`, \`prompt.cancel\`.
- Worker streams \`status\` and \`frame\` (JPEG base64 in JSON, 1280×800), and API output via \`prompt.started\`, \`prompt.delta\`, \`prompt.done\`, \`prompt.error\`.
- One viewer at a time; additional connections are rejected with 409. Eight API prompts per 10 minutes per connection, one inflight API prompt, 8,000 chars per API prompt.
- The worker has no arbitrary browser navigation, JS evaluation or CDP command endpoint. It accepts only limited mouse/keyboard events and browser reload.
- Frames are dropped when WebSocket backpressure grows; interactive control remains prioritized.
- Disconnect aborts any running API request and closes Chromium while leaving the data volume intact.

## Validation

\`npm install && npm test\` runs signed-cookie, origin, bounded-command and SSE tests. \`docker compose build\` checks browser/container dependency availability. Manual staging tests must also confirm browser pixels, click/typing, login, persistence after a container restart, streaming/cancel, and rejection of forged or cross-origin WebSocket requests.

## Deployment caveats and threat model

- Keep Docker port **bound only to 127.0.0.1** on the host (Compose does this). Only expose \`/browser/*\` through a TLS proxy that forwards the original Origin and Cookie headers; it must not rewrite away the URL path.
- Browser process runs as unprivileged \`pwuser\`, with Linux capabilities dropped and \`no-new-privileges\`. Chromium sandbox is disabled inside this isolated container; keep it private, updated and not exposed to untrusted sites. Production browser sandbox policy requires a separate review.
- The profile is keyed to the beta-session nonce and persists on the volume; rotating the beta signing secret or re-logging in changes the profile identity. **No cross-device session sync or durable workflow scheduler is provided.**
- The private beta code is not per-user authentication. Do not enable this for public users until proper per-user identity, session quotas and profile isolation have been implemented and reviewed.
- The service cannot verify that ChatGPT will accept login in headless Chromium; some checks may block automated browsers. The user must resolve verification manually. Do not bypass CAPTCHAs or protective measures.
- The signed in-site ChatGPT browser view and the OpenAI Responses API run are unrelated conversations. API output is not copied into ChatGPT history.
