# Astra Stock Intelligence architecture

## Goal
Provide user-scoped, evidence-backed equity research, without implying unconfigured data sources work. Preserve existing Lovable AI inference, and never run paid inference during development tests.

## Provider registry
Each adapter declares `id`, capabilities, authentication requirements, licensing restrictions, freshness SLA, rate limits, and health status. Initially support SEC EDGAR company facts/filings and FRED public data only after implementation and validation. Optional providers: market prices (licensed API), earnings transcripts, analyst estimates, news, Reddit, Google Trends, and other public social signals. Do not scrape sites that disallow automation, bypass paywalls, or claim paid feeds are free.

## Research pipeline
1. Authenticate user; enforce per-user budgets and quotas before fan-out.
2. Normalize ticker to issuer identifiers (CIK, exchange, security class); guard against ambiguous symbols.
3. Plan research by question, horizon, and available providers.
4. Fetch concurrently with bounded concurrency, timeouts, retries with jitter, caching, and circuit breakers.
5. Persist evidence records: provider, original URL, retrieval time, publication time, document ID, quoted excerpt, content hash, and license metadata.
6. Normalize currency, units, fiscal periods, and split-adjusted prices; retain original values.
7. Analyze financial statements, valuation, catalysts, technicals, insider activity, and social acceleration only when supported by data.
8. Produce bull/base/bear scenarios with explicitly labeled assumptions; never present invented probabilities as statistically calibrated.
9. Verify each citation references an evidence record; flag unsupported claims and conflicting data.
10. Persist mission checkpoints and audit events with user isolation and retention controls.

## Safety and reliability gates
- External actions (trades, messages, subscriptions) require explicit approval and must be disabled by default.
- Never put provider keys in client bundles; enforce server-side authorization and egress allowlists to prevent SSRF.
- Separate source freshness from confidence; distinguish missing, stale, delayed, and live data.
- Enforce request, token, provider-call, and monetary budgets server-side; fail closed when a shared quota store is unavailable.
- Do not call paid provider APIs or Lovable AI in CI. Use deterministic fixtures for contract tests.
- Track evidence-to-claim links and data provenance; support user-visible source inspection.

## Implementation milestones
1. Read-only provider registry, typed evidence schema, deterministic fixture tests.
2. SEC EDGAR adapter with fair-use user-agent and throttling; issuer mapping and XBRL normalization.
3. Citation-backed report endpoint with source health/freshness disclosure.
4. Durable research missions with leases, idempotency, cancellation, retry budgets, and per-user audit history.
5. Optional licensed market/news/social connectors with user-scoped credentials and approval controls.
6. Scenario engine and evaluation harness using historical point-in-time data to prevent look-ahead bias.

No external integration is activated by this document alone.
