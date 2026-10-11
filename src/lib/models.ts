/** Lovable AI chat models. IDs are gateway-compatible provider/model slugs.
 * Availability is controlled by the project's Lovable AI workspace settings.
 * https://docs.lovable.dev/features/ai
 */
export const MODELS = [
  { id: 'google/gemini-3.8-flash', name: 'Gemini 3.8 Flash', provider: 'Google', description: 'Fast, capable everyday assistant', tier: 'Balanced', speed: 'Fast', recommended: true },
  { id: 'openai/gpt-6-luna', name: 'GPT-6 Luna', provider: 'OpenAI', description: 'Quick questions and lighter work', tier: 'Economy', speed: 'Fast', recommended: false },
  { id: 'openai/gpt-6-sol', name: 'GPT-6 Sol', provider: 'OpenAI', description: 'Deep problem solving and coding', tier: 'Advanced', speed: 'Balanced', recommended: false },
  { id: 'anthropic/claude-sonnet-5', name: 'Claude Sonnet 5', provider: 'Anthropic', description: 'Writing, analysis and development', tier: 'Advanced', speed: 'Balanced', recommended: false },
  { id: 'google/gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro', provider: 'Google', description: 'Complex reasoning and long context', tier: 'Premium', speed: 'Deliberate', recommended: false },
  { id: 'openai/gpt-6-astra', name: 'GPT-6 Astra', provider: 'OpenAI', description: 'Demanding, multi-step reasoning', tier: 'Premium', speed: 'Deliberate', recommended: false },
  { id: 'anthropic/claude-opus-5-5', name: 'Claude Opus 5.5', provider: 'Anthropic', description: 'High-end technical work', tier: 'Premium', speed: 'Deliberate', recommended: false },
] as const;

export type ModelId = (typeof MODELS)[number]['id'];
export const DEFAULT_MODEL: ModelId = 'google/gemini-3.8-flash';
export const isModelId = (value: unknown): value is ModelId =>
  typeof value === 'string' && MODELS.some((model) => model.id === value);
export function getModel(id: string) {
  return MODELS.find((model) => model.id === id) ?? MODELS[0];
}
