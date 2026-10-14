import { accessSetupError } from './private-access.server';

/** Public, non-secret deployment diagnostics for the Astra frontend. */
export function aiSetupStatus() {
  const hasAIKey = Boolean(process.env.LOVABLE_API_KEY);
  const accessError = accessSetupError();
  const ai = hasAIKey && !accessError;
  const research = ai && Boolean(process.env.PERPLEXITY_API_KEY);

  const aiStatusMessage = !hasAIKey
    ? 'Lovable AI is not configured on this deployment. Enable the built-in AI connector and Lovable Cloud for this project, then republish.'
    : accessError
      ? 'Astra private access is not configured. Set ASTRA_ACCESS_CODE (at least 12 characters) and ASTRA_SESSION_SECRET (at least 32 characters) as server-only deployment secrets.'
      : null;
  const researchStatusMessage = !ai
    ? 'Live research requires working Lovable AI first.'
    : !research
      ? 'Live research needs a server-side PERPLEXITY_API_KEY. Chat and research planning still work without it.'
      : null;

  return { ai, research, aiStatusMessage, researchStatusMessage };
}
