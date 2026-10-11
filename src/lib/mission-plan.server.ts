import { generateText } from 'ai';
import { aiProvider } from './ai-provider.server';
import type { MissionStepKind } from './mission-types';
import type { ModelId } from './models';

export type ProposedStep = { title: string; kind: MissionStepKind };
const kinds: MissionStepKind[] = ['analyze', 'research', 'verify'];
export function parseProposedSteps(text: string): ProposedStep[] {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end <= start) throw new Error('No steps in model response');
  const value: unknown = JSON.parse(text.slice(start, end + 1));
  if (!Array.isArray(value) || value.length < 2 || value.length > 5) throw new Error('Invalid number of steps');
  return value.map((step): ProposedStep => {
    if (!step || typeof step !== 'object') throw new Error('Invalid step');
    const input = step as Record<string, unknown>;
    if (typeof input.title !== 'string' || input.title.trim().length < 5 || input.title.length > 110 ||
        typeof input.kind !== 'string' || !kinds.includes(input.kind as MissionStepKind))
      throw new Error('Invalid plan step');
    return { title: input.title.trim(), kind: input.kind as MissionStepKind };
  });
}

export async function createMissionPlan(goal: string, model: ModelId): Promise<ProposedStep[]> {
  const answer = await generateText({
    model: aiProvider().chatModel(model),
    system: `You plan small, achievable AI assistant missions. Only these step kinds are available:
"analyze" = work out reasoning, calculations or drafts using the Lovable model.
"research" = use live Perplexity web search IF configured on the server. May block if not configured.
"verify" = have the Lovable model critically verify the evidence and acknowledge uncertainty.
No file modification, external account actions, browser control, or long-running execution is available. Never invent external actions. Return ONLY a JSON array containing 2 to 4 entries, each {"title":"Specific actionable short title","kind":"analyze|research|verify"}. Prefer analyze followed by verify for generic tasks. For time-sensitive evidence requests, insert a research step. Each model step incurs Lovable AI usage credits.`,
    prompt: goal,
    maxOutputTokens: 450,
  });
  return parseProposedSteps(answer.text);
}
