import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { DEFAULT_MODEL } from './models';

export function aiProvider() {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error('Lovable AI is not configured for this deployment.');
  return createOpenAICompatible({
    name: 'lovable',
    baseURL: 'https://ai.gateway.lovable.dev/v1',
    apiKey,
    headers: { 'Lovable-API-Key': apiKey, 'X-Lovable-AIG-SDK': 'vercel-ai-sdk' },
  });
}
export const plannerModel = () => process.env.ASTRA_PLANNER_MODEL || DEFAULT_MODEL;
