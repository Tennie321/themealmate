# Astra — iPhone-first AI Agent

Astra is a mobile AI workspace using Lovable AI credits for inference. **Development happens through GitHub commits**, not Lovable's AI builder chat.

## ChatGPT browser bridge (experimental)

Open **ChatGPT Bridge** in the Astra sidebar to compose a prompt and hand it to
your real `chatgpt.com` session. Sign in on ChatGPT's own website; Astra does
not request your ChatGPT login credentials or use the OpenAI API for this route.
The link pre-fills a new ChatGPT chat for you to review and send.

An optional iPhone **Safari Web Extension** can attempt a one-shot Send click
for an explicitly marked Astra handoff, without reading replies or account
cookies. You must separately package and install the extension using Xcode and
permit access to `chatgpt.com`; it is **not** bundled with the web app.
See [the Safari integration guide](integrations/chatgpt-safari-extension/README.md)
for instructions and limitations. The browser interface is not an official
ChatGPT messaging API; it can change or fail. No existing ChatGPT chats,
memory, or replies are synchronized with Astra.

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


## Live remote ChatGPT browser (self-hosted opt-in)

The **ChatGPT Bridge** view now optionally supports an interactive Chromium browser controlled through a low-latency CDP screencast over WebSocket. It includes manual ChatGPT login/CAPTCHA handling, persistent session profiles, pointer/keyboard/paste input, prompt submission, and streaming DOM-based reply snapshots. The original external ChatGPT handoff remains available without a browser server.

**Do not expect this to work on the standard Lovable-hosted frontend without additional infrastructure.** The browser worker needs a host with Docker, disk persistence, and a WebSocket route, and ChatGPT's website can change its UI or restrict automated access. This is not an official OpenAI API integration, nor guaranteed to work for every account or login provider.

### Local setup

1. Install Docker. Configure `ASTRA_ACCESS_CODE` (12+ characters), `ASTRA_SESSION_SECRET` (32+ characters), and an **independent** `BROWSER_BRIDGE_SECRET` (32+ random characters) in server-only environment settings. The latter must be identical for Astra's server and the worker. Never expose it as a `VITE_` variable.
2. Set `BROWSER_ALLOWED_ORIGIN=http://localhost:3000` (or the exact actual app origin; comma-separated origins are supported). The worker rejects WebSocket requests from other origins.
3. Run `docker compose -f docker-compose.browser.yml up --build -d`; this creates an isolated Chromium worker on `127.0.0.1:8787` with a persistent Docker profile volume.
4. Run `npm install && npm run dev`; Vite proxies `/browser-api` WebSockets to the local worker. Sign in to Astra, open ChatGPT Bridge, click **Connect browser**, and complete ChatGPT login manually inside the streamed browser.
5. Type a prompt and select **Run in ChatGPT**. The worker fills ChatGPT's composer, sends it, and streams response text back. **Stop** halts the active job.

The server route `GET /api/browser/token` only issues 90-second, signed tickets to authenticated Astra beta sessions. Tickets are sent as a WebSocket subprotocol, not URL query parameters. The worker accepts one control connection per Astra session, isolates profiles by signed-session identifier, rate-limits prompts, and deletes no browser cookies or profile files on disconnect. The browser process shuts down after 90 seconds of idle time; its profile persists across container restarts.

### Deployment / security

- Deploy the browser container **privately** behind a TLS reverse proxy supporting WebSockets. Proxy `/browser-api/*` to port 8787 on the worker, or set public `VITE_BROWSER_BRIDGE_URL=https://browser.example.com` in the frontend build. Only the backend may hold `BROWSER_BRIDGE_SECRET`.
- Configure `BROWSER_ALLOWED_ORIGIN` to exactly the HTTPS Astra app origin; never `*`. Restrict worker networking at the firewall; do **not** expose its port directly to the internet. Use individual user auth, durable quotas, auditing, and more restrictive container isolation before multi-tenant production.
- Chromium profiles contain **sensitive logged-in ChatGPT cookies**. The named Docker volume must be encrypted/backed up privately, and not shared between organizations. Logging out of Astra does not log out of the remote ChatGPT account; clear the profile volume if you need to revoke it.
- Manual login and CAPTCHA resolution happen in the visible browser. The worker does not bypass access checks or capture raw passwords as an API; browser input events are transmitted through the authenticated WebSocket.
- The ChatGPT DOM is not a stable integration contract. If selectors change, execution reports an error. A reply timeout is not treated as a completed answer. Do not rely on this for unattended, safety-critical, or mass automation.
- The existing Astra access code is a **shared private beta gate**, not secure per-user account management. Do not deploy shared browser profiles for untrusted users. Short-lived worker tickets are only an additional guard.

Validation: `npm run test:security`, `npx tsc --noEmit`, `npm run lint`, `npm run build`. A browser end-to-end smoke test additionally requires the Docker service and a real ChatGPT login.
