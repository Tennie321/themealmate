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

## Restore a deployment showing missing APIs

The **Chat**, **Research**, and **Mission Control** screens use real server routes; this is not a browser-only application. A successful front-end deployment alone does not make the AI services available.

1. Open the [Astra Lovable project](https://lovable.dev/projects/e5083802-363b-4e08-b0f4-d7d06d7f7082) and verify its Cloud AI integration and server-side environment. Lovable Cloud projects receive a `LOVABLE_API_KEY` for the AI gateway; the deployed server must actually have this variable available.
2. Configure `ASTRA_ACCESS_CODE` (at least 12 characters) and `ASTRA_SESSION_SECRET` (a separate cryptographically random value, at least 32 characters) as **server-only secrets**. These are required by Astra's private beta gate when AI is on. Share the access code only with authorized users; never publish it in GitHub or a client-side `VITE_` setting.
3. For **Live Research only**, configure `PERPLEXITY_API_KEY` as an additional server-side secret. Chat and ordinary mission analysis do not need this optional key.
4. Redeploy from the intended branch. Open `/api/capabilities` on the **deployed app host**. The public response contains safe status codes in `setup.ai` and `setup.research`, not secret values. `setup.ai: "ready"` means the required environment values exist; it does **not** prove upstream authorization, workspace credits, or model entitlement. Test a real chat after setup.
5. If chat still fails with a configured backend, verify Lovable AI workspace credits and supported models. A provider error, a 402/429, and a GitHub Actions runner failure are separate issues from missing environment values.

| `setup.ai` | Meaning | Action |
| --- | --- | --- |
| `missing-ai-key` | Deployed server cannot see `LOVABLE_API_KEY` | Set up Lovable Cloud AI and the server environment |
| `access-configuration-required` | Private beta protection is not fully configured | Supply valid access code and signing secret |
| `ready` | Server has the required AI configuration | Unlock Astra and test a chat request |

If `setup.research` is `missing-search-key`, add the optional Perplexity secret to enable live source-backed research. `ai-unavailable` means research must wait until the main AI setup works.

**Never commit API keys or ask the frontend to hold them.** GitHub Actions build failure with no recorded job steps should be investigated in GitHub Actions runner/account settings; it does not demonstrate a TypeScript failure.

## Set up the backend

The Lovable project must expose `LOVABLE_API_KEY` **only to the server**. Lovable AI requests consume AI usage credits, not Lovable builder/chat credits.

To turn on live research, configure `PERPLEXITY_API_KEY` as a **server-side secret** in the deployment platform. Perplexity Search requests are billed separately by that provider; Lovable AI is used for the final synthesis. Do not put these secrets in any `VITE_` variable, public file or GitHub commit.

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
