# Signal — Kalshi Research Desk

Signal is a Lovable-connected research and paper-strategy app. It loads Kalshi market data, sends the settlement rules and retrieved source evidence to Lovable AI for two estimates, compares eligible estimates with order-book quotes and estimated fees, and provides a paper strategy journal. It does not place trades or guarantee returns.

## Setup

1. Open the connected project in Lovable. Lovable AI must be enabled and `LOVABLE_API_KEY` available to the server.
2. Optional: configure `PERPLEXITY_API_KEY` for search excerpts. Without it, research uses Google News RSS headlines only; the model is told it has not read the articles, and the app withholds numerical AI estimates and trade rankings because headlines alone do not provide sufficient evidence. Search may return no useful evidence, in which case no research result is produced.
3. Install with `npm install`, then run `npm run dev`. Run `npm test` and `npm run build` before changes are shipped.

The app and research endpoint are accessible without an access code; anyone who can reach the deployment may use its billable AI. Research uses two model calls per market and can incur Lovable AI and search-provider charges. The hourly in-process safety fuse is not a distributed spend cap. The paper journal and tracked forecasts are browser-local and do not synchronize between devices. Win rate and profit factor derive only from the user's selected simulated entries, not a historical backtest or real fills. Live data, source relevance, exact fees and settlement rules must be independently verified.
