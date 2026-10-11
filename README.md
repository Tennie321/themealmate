# Astra — Mobile AI Workspace

An iPhone-first AI chat application with a model switcher, conversation history, research/agent **planning** modes, responsive settings, and Lovable AI Gateway integration.

## How this was developed

**Code changes are made through GitHub.** No Lovable builder/agent-chat credits are needed for GitHub commits. **Inference from inside the running app uses Lovable AI usage credits.** These are separate billable products.

## Features (V1)

- iPhone-oriented responsive interface with safe-area layout, home-screen icon, installable web manifest, light/dark/system modes, and mobile sidebar.
- Real server-side streaming AI through Lovable's AI Gateway; per-message model selection with a server-enforced allowlist.
- Models: Gemini 3.8 Flash (default), GPT-6 Luna / Sol / Astra, Claude Sonnet 5 / Opus 5.5, Gemini 3.1 Pro Preview. Availability depends on project AI connector settings.
- Chat history, selected model, and settings saved **locally to the current browser**. No server-side chat sync or authenticated accounts yet.
- Research mode currently provides **research planning**, without live web access or citations. Agent mode currently provides **task planning** without tool execution. Connectors are **not connected**; the UI does not pretend they are.
- Server validates input sizes and model IDs. Best-effort hourly instance-level limits reduce incidental runaway costs; not a substitute for production authentication, centrally enforced rate limiting and billing controls.

## Lovable AI setup

The linked Lovable Cloud project manages a server-only `LOVABLE_API_KEY` for its built-in **AI** connector. Ensure AI is enabled for the project in Lovable > Connectors > AI. The key must be injected into the server's runtime environment, **never** into `VITE_*` or browser JavaScript. No separate OpenAI/Google/Anthropic provider key is needed.

On a non-Lovable host, supply `LOVABLE_API_KEY` securely as a server environment variable. Chat calls will fail with a clear 503 explanation if not configured.

## Local development

```bash
npm ci
npm run dev
npm run build
```

This app uses the existing Lovable TanStack Start + React 19/Vite toolchain. File routing regenerates `src/routeTree.gen.ts` during development/build (do not hand edit).

## Production checklist

- Add authenticated user accounts and database tables with RLS for private, cross-device chats.
- Replace in-memory IP rate limits with centrally enforced per-user quotas and budget alerts, especially before public publishing.
- Add per-user OAuth connectors for Google, GitHub, Slack, and others; workspace builder connectors are **not** end-user authorizations.
- Integrate a live search/research provider and only then enable actual source citations.
- Add an approved tool execution layer, permissions, and audit logs before enabling agent actions.
- Check model IDs and quota status against your Lovable workspace. Some models may require different feature permissions or have provider availability constraints.
- Disable the old site's service worker in browsers, or clear site data if old pages remain cached; this starter no longer registers any service worker.

## Reference

- [Lovable in-app AI and supported models](https://docs.lovable.dev/features/ai)
- [TanStack Start server routes](https://tanstack.com/start/latest/docs/framework/react/guide/server-routes)
