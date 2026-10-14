# Astra: fix missing APIs and setup-required screens

This application uses the **Lovable built-in AI connector** for chat and
Mission Control. It does not use the OpenAI API directly. Do not create an
OpenAI API key or place any secrets in Vite environment variables.

## 1. Activate project AI (required for chat and missions)

In [Lovable's Astra project](https://lovable.dev/projects/e5083802-363b-4e08-b0f4-d7d06d7f7082),
open **Connectors → AI** and make sure the built-in AI connector is enabled
for the project/workspace. Ensure the deployment is using Lovable Cloud or
another backend that can serve TanStack Start API routes.

Lovable manages and provisions the project's `LOVABLE_API_KEY` automatically
when built-in AI is enabled. It must be present **only on the server**.
If hosting outside Lovable, the hosting environment must supply this key
server-side according to Lovable's supported configuration. Do not paste
a workspace API key or an OpenAI API key in its place.

Lovable's guide: https://docs.lovable.dev/features/ai

## 2. Add the private beta protection (required once any AI setting is present)

In the server-side environment / deployment secrets, set:

| Variable | Required value |
| --- | --- |
| `ASTRA_ACCESS_CODE` | A private access code, **at least 12 characters** |
| `ASTRA_SESSION_SECRET` | Random high-entropy signing secret, **at least 32 characters** |
| `LOVABLE_API_KEY` | Project-managed server-side Lovable AI key (from step 1) |

The app intentionally **fails closed** if AI is enabled but access protection
is incomplete. Generate unique secrets, keep them in your deployment's secret
manager, and never commit them to GitHub. Changing the session signing
secret logs everyone out. Unlock the app using the access code after
republishing / redeploying with the new secrets.

## 3. Optional: enable live web research

If desired, set `PERPLEXITY_API_KEY` server-side. Without it the Research
tab can only plan research using existing model knowledge, rather than
performing live web searches. No Perplexity key is needed for normal chat.

## 4. Verify after deployment

Run these GET requests against **your deployed app**, not github.com:

- `/api/access/status` should return
  `{"protected":true,"authenticated":false,"misconfigured":false}`
  before login; `authenticated` becomes `true` for a valid session.
- `/api/capabilities` should return `"ai":true`. It returns
  `"research":true` only if the optional Perplexity key is also configured.
- Unlock the app, send a short message with the default Gemini 3.8 Flash
  model and verify that the reply streams successfully. Then test a
  Mission Control plan. Optional live research should return source links.

If either endpoint responds with a 404/HTML page, the deployment may not
be serving the TanStack Start backend routes; confirm SSR/full-stack
hosting rather than deploying the app as static HTML only. If status
has `"misconfigured":true`, finish step 2. If capabilities report
`"ai":false` after unlocking, check step 1 and redeploy.

These endpoints intentionally do not reveal secrets or secret values.

## Limits

The in-app connector list currently describes planned integrations,
**not working OAuth connectors**. GitHub, Gmail and other external account
functions require a separate integration and permission flow; adding
arbitrary API keys will not automatically make those integrations real.
