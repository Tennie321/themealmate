/**
 * Non-sensitive deployment diagnostics. Never send API keys, access codes,
 * session secrets or their values to the browser.
 */
export type AiSetupStatus = 'ready' | 'missing-ai-key' | 'access-configuration-required';
export type ResearchSetupStatus = 'ready' | 'missing-search-key' | 'ai-unavailable';

export function resolveCapabilities(input: {
  aiKeyPresent: boolean;
  searchKeyPresent: boolean;
  accessReady: boolean;
}) {
  const ai = input.aiKeyPresent && input.accessReady;
  const research = ai && input.searchKeyPresent;
  const aiStatus: AiSetupStatus = !input.aiKeyPresent
    ? 'missing-ai-key'
    : !input.accessReady ? 'access-configuration-required' : 'ready';
  const researchStatus: ResearchSetupStatus = !ai
    ? 'ai-unavailable'
    : !input.searchKeyPresent ? 'missing-search-key' : 'ready';

  return {
    ai,
    research,
    setup: { ai: aiStatus, research: researchStatus },
    persistentMissions: false,
    backgroundExecution: false,
    oauthConnectors: false,
    computerUse: false,
  };
}
