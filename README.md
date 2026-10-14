# Astra — iPhone-first AI Agent

Astra is a mobile AI workspace using Lovable AI credits for inference. **Development happens through GitHub commits**, not Lovable's AI builder chat.

## Remote ChatGPT browser (experimental, self-hosted only)

Astra's **ChatGPT Bridge** now supports a **real browser control panel** when the
optional Playwright service is deployed. The service launches persistent Chromium
inside a separate container, streams Chrome DevTools Protocol JPEG screencast
frames via a same-origin WebSocket, and accepts mouse, keyboard and scroll input.
Sign in **on the live remote browser screen** (including any permitted manual
verification); Astra does not bypass CAPTCHAs, ask for account cookies, or use a
ChatGPT API token. Your profile survives service restarts in a Docker volume.

When signed in, enter an **Automated prompt** and select **Send prompt**.
The service fills ChatGPT's composer, submits the message, and streams the visible
assistant text back as incremental WebSocket events. Use **Stop** or reconnect
when needed. The original link-only handoff below remains available if this
optional service is unavailable.

### Self-hosted browser setup

The existing Lovable Cloud deployment does **not** automatically run Docker or
WebSocket browser containers. This option needs a host running Docker Compose
(or an equivalent deployment with the same-origin `/browser/ws` reverse proxy).

1. Create a local, gitignored `.env` with `ASTRA_ACCESS_CODE` (12+ chars),
   `ASTRA_SESSION_SECRET` (32+ random chars), and **independent**
   `ASTRA_BROWSER_SECRET` (32+ random chars). If using Lovable AI, also
   configure `LOVABLE_API_KEY`. Never put real values in the repo or client
   `VITE_` variables.
2. Set `PUBLIC_ORIGIN=http://localhost:8080` for local Docker access.
   For Internet use put HTTPS termination in front of Caddy, set
   `PUBLIC_ORIGIN` to the precise HTTPS origin and secure firewall access.
3. Run `docker compose -f docker-compose.browser.yml up --build -d`.
   Open `http://localhost:8080`, unlock Astra, and select **ChatGPT Bridge**.

The browser service listens only inside Docker on port 8787; Caddy routes
`/browser/ws` to it. For local app development you can run the browser
container independently on localhost:8787 and `npm run dev` on localhost:5173,
setting `PUBLIC_ORIGIN=http://localhost:5173`; the Vite dev proxy forwards
`/browser/ws` to the service. An unlocked Astra beta session issues a
two-minute, HMAC-authenticated browser ticket, passed in a WebSocket subprotocol;
the browser validates both the ticket and exact WebSocket origin. Connections
expire after 30 minutes and can be re-established from the UI.

**Security and service limits:** This is **single-owner** access tied to
Astra's existing private beta gate, **not multi-user isolation or production
OAuth**. Anyone with the beta code can access the **same** browser profile,
ChatGPT conversations, login session and streamed screen. Do not share that
code. The remote browser can see typed login content; treat its host and
persistent volume as sensitive, restrict access and use TLS. Browser screen
frames are not archived by Astra. No credential capture, CAPTCHA solving,
automated MFA bypass, or proxy that exposes Chromium publicly is included.
ChatGPT's website is not a supported automation API, so DOM changes, login
security measures, usage policies or rate limits may interrupt the flow.
The tool only reports content the browser actually sees; it does not fabricate
replies or sync historic ChatGPT chats to local Astra history.

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
