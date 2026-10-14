# Astra — iPhone-first AI Agent

Astra is a mobile AI workspace using Lovable AI credits for inference. **Development happens through GitHub commits**, not Lovable's AI builder chat.

## ChatGPT browser bridge (experimental)

Open **ChatGPT Bridge** in the Astra sidebar. It now includes an optional remote
browser control mode, plus the existing URL-based handoff. The handoff lets you
compose a prompt for your real `chatgpt.com` session. Sign in on ChatGPT's own website; Astra does
not request your ChatGPT login credentials or use the OpenAI API for this route.
The link pre-fills a new ChatGPT chat for you to review and send.

An optional iPhone **Safari Web Extension** can attempt a one-shot Send click
for an explicitly marked Astra handoff, without reading replies or account
cookies. You must separately package and install the extension using Xcode and
permit access to `chatgpt.com`; it is **not** bundled with the web app.
See [the Safari integration guide](integrations/chatgpt-safari-extension/README.md)
for instructions and limitations. The browser interface is not an official ChatGPT messaging API; it can change
or fail. The remote browser mode can stream the current assistant response to
the panel when configured, but it does not sync other ChatGPT chats or memory.
The handoff mode does not read replies.

## Features

- Native-feeling responsive mobile chat, PWA install, model picker, local chat history and settings.
- **Mission Control (beta):** propose plans through Lovable AI, run genuine AI analysis and critique steps, pause for review, resume interrupted runs, and display actual outputs/timestamps. Autopilot advances through model steps while the tab is open. User confirmation is required between steps in Review/Manual modes.
- **Live research (optional):** search via Perplexity Search API, then synthesize with the selected Lovable AI model, preserving clickable real source links and numbered citations. Clearly displays unavailable state when not configured.
- Chat, Research and Agent planning modes; research chat switches to live research when a search key is present.
- Safe default: no computer control, no account writes, no fake connectors, no uncontrolled payments.

## Set up the backend

This project is connected to [Astra in Lovable](https://lovable.dev/projects/e5083802-363b-4e08-b0f4-d7d06d7f7082).
Enable Lovable Cloud and the built-in AI connector for that project. Lovable **automatically generates and manages** the server-only `LOVABLE_API_KEY`; do not paste a personal OpenAI key, a workspace API token, or a client-visible `VITE_` key in its place. Lovable AI inference uses project AI credits, not Lovable builder/chat credits.

Configure the following server-only values in the project environment before using billable AI:

- `ASTRA_ACCESS_CODE`: private beta code of at least 12 characters.
- `ASTRA_SESSION_SECRET`: an independent cryptographically random secret of at least 32 characters. Rotate it to log out all sessions.
- `PERPLEXITY_API_KEY` (optional): enables live sourced web research; chat and research planning still work without it.

Check `/api/capabilities` on the deployed app after configuration. The public-safe `aiStatus` and `researchStatus` fields report `ready`, `missing_lovable_api_key`, `access_setup_required`, or `missing_perplexity_api_key` as applicable; they never return secret values. An unavailable live search API is **not** a missing key for core chat. The Connections menu lists planned integrations rather than active OAuth connectors.

Lovable AI requests consume AI usage credits, not Lovable builder/chat credits.

To turn on live research, configure `PERPLEXITY_API_KEY` as a **server-side secret** in the deployment platform. Perplexity Search requests are billed separately by that provider; Lovable AI is used for the final synthesis. Do not put these secrets in any `VITE_` variable, public file or GitHub commit. Local `.env` files are gitignored; `.env.example` contains names only.

```bash
npm install
npm run dev
npm run build
npx tsc --noEmit
```

## Limitations, by design

- Mission execution is **foreground only**. It continues while the browser tab stays alive, but the iPhone may suspend it when locked. Runs persist only to this browser's localStorage; re-open and press Resume to continue interrupted missions. The browser does **not** have a background worker.
- Chat and mission histories are local-device only; there are no authenticated per-user accounts or cross-device sync.
- The AI analysis/verification steps call actual Lovable AI models but **do not browse the web or execute connector actions**. Research steps perform live searching only when Perplexity is configured.
- Connectors listed in UI are informational, not user-OAuth connections. No Gmail, GitHub, Slack, desktop/phone control, or approval-based external actions are activated.
- Every billable AI endpoint requires the private beta code and signed session to be configured. A conservative **instance-local AI request fuse** covers chat, research, and mission calls (default 40 weighted units/hour, configurable via `ASTRA_AI_HOURLY_UNITS`). This is **not a currency cap** and is not durable or shared across replicas. Secure per-user authentication and centrally enforced monetary budgets are still required before public release.
- The selected model must be supported/enabled by the Lovable project. Provider errors and quota exhaustion can still occur.

## Architecture

- `src/components/AgentApp.tsx`: chat experience, model chooser, settings, history and research source rendering.
- `src/components/MissionControl.tsx`: mission planning and step-run UI (foreground-only execution).
- `src/routes/api.chat.ts`: streamed Lovable AI chat.
- `src/routes/api.research.ts`: Perplexity Search results + Lovable AI synthesis.
- `src/routes/api.missions.plan.ts`: restricted AI-generated task plan.
- `src/routes/api.missions.step.ts`: one actual AI analysis or verification step.
- `src/routes/api.capabilities.ts`: feature availability, no secret disclosure.
- `src/lib/mission-types.ts`: mission persistence/restore model.

## Next engineering milestones

1. Auth + row-level secured database for private accounts and synced conversations/missions.
2. **Server-side durable job queue** with cron/worker, retries, concurrency, budgets, notifications and audit logs (this is required for real closed-phone autonomy).
3. OAuth connector registry with per-user grants, token rotation and approval policies.
4. Research task decomposition, parallel multi-source evidence checks, fact confidence and citation auditing.
5. Optional secure Mac/Windows computer bridge (no mobile-use automation until separately prioritized).

This is active development; see CI and validate staging deployments before exposing public AI billing.

## Required private AI access protection

When `LOVABLE_API_KEY` is configured, Astra **fails closed** until **both** server-only `ASTRA_ACCESS_CODE` (at least 12 characters) and `ASTRA_SESSION_SECRET` (random value at least 32 characters) are configured. The AI endpoints reject requests and the app shows a setup-required screen until this is done. Valid credentials unlock signed, HTTP-only, SameSite=Strict seven-day sessions. Changing the signing secret revokes all sessions. Never commit these values; test in staging. Without an AI key or any access credentials, the non-billable UI remains accessible.

`ASTRA_AI_HOURLY_UNITS` is an optional integer from 1 to 1000 (default 40). Standard chat/plan/analysis steps cost one request unit; premium chat/steps cost three; live research costs two. Invalid values fail closed. This is a best-effort **per-process request fuse, not actual dollars/tokens, not a shared database quota, and not safe for multi-instance public deployment**. A production rollout still requires individual accounts, centrally enforced budgets, and usage metering.

## Local data backup

Settings → Privacy offers **Export workspace backup** and **Import workspace backup** for portable JSON copies of chats and Mission Control history. Imports are validated and require explicit confirmation before replacing local data. Backups contain conversation contents, so store them privately. Cloud sync remains a separate future feature.

## Optional persistent ChatGPT remote browser

A separate **single-owner Docker service** provides a persistent Playwright
Chromium profile, a Chrome DevTools Protocol JPEG screencast over authenticated
WebSocket, manual mouse/keyboard/paste control for sign-in/verification, and
automation of prompts in the active `chatgpt.com` tab with response snapshots
streamed to Astra. This is separate from Lovable AI. It is **not deployed by
Lovable Cloud automatically**; deploy the sidecar on a Docker-capable host.

1. Configure `ASTRA_ACCESS_CODE` (12+ characters) and
   `ASTRA_SESSION_SECRET` (32+ random characters) in the Astra app, and sign
   in through its usual private gate. Both are required even when Lovable AI
   is not enabled. Do not enable the remote browser on a publicly shared app.
2. Generate an **independent** random 32+ character
   `ASTRA_BROWSER_SHARED_SECRET`. Set it in **both** the Astra server
   environment and the browser service environment. Do not expose this
   secret to `VITE_` variables or the client.
3. Set `ASTRA_BROWSER_WS_URL` in Astra to the public **WebSocket base
   origin**, e.g. `wss://browser.example.com`. Set `ASTRA_ALLOWED_ORIGIN`
   in the browser service to the exact Astra origin,
   e.g. `https://my-astra.example.com` (no trailing slash).
4. For local development, with Astra at `http://localhost:3000`, you can
   set `ASTRA_BROWSER_WS_URL=ws://localhost:8787`,
   `ASTRA_ALLOWED_ORIGIN=http://localhost:3000`, and run:

   ```bash
   cd browser-service
   docker compose up --build -d
   ```

   Docker Compose only publishes the service to `127.0.0.1:8787`; remote
   deployment requires an HTTPS/TLS reverse proxy that forwards WebSocket
   upgrades to this port and exposes the sidecar at `wss://...`.
   **Never expose port 8787 directly to the public Internet.**
5. In Astra select **ChatGPT Bridge → Remote browser**, then sign in
   yourself in the browser stream and handle any verification normally.
   Use the automated prompt box to send a prompt. The current response is
   streamed into the panel in incremental text snapshots.

The browser profile is stored in the persistent Docker volume
`browser_profile` and survives restarts. Protect the Docker host, volume,
reverse-proxy logs (which must redact `ticket` query parameters), and the
browser's signed-in account. No browser password, session cookie, frame or
answer is intentionally saved into Astra storage; the Docker profile itself
**does** contain sensitive ChatGPT login state. Only one live remote controller
can own the session at a time; connecting another replaces it. Connection
tickets expire after 45 seconds and may be redeemed only once by the service.
Login/verification may fail if ChatGPT does not accept this browser; the
service never attempts to bypass CAPTCHAs.

To test the protocol independently:

```bash
cd browser-service
npm install
npm test
```

The DOM selectors and completion polling use ChatGPT's **unofficial web UI**,
so changes to that UI can break automation. Completion is inferred from visible
generation controls and text stability, not a guaranteed server-side completion
event. A cancelled run stops monitoring, not necessarily ChatGPT generation.
For production integrations use the supported OpenAI API rather than relying
on browser-driven ChatGPT sessions. This sidecar is for a trusted single owner,
not a multi-tenant public service.
