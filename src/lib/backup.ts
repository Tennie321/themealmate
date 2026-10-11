import { DEFAULT_MODEL, isModelId } from './models';
import type { ChatMessage, ChatMode, Conversation, StoredState } from './storage';
import type { Autonomy, Mission, MissionStep, MissionStepKind, MissionStepStatus, MissionStatus } from './mission-types';
import { recoverMission } from './mission-types';
import type { ResearchSource } from './research-types';

type Backup = { schema: 'astra-workspace-backup'; version: 1; createdAt: string; chats: StoredState; missions: Mission[] };
const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, max = 1000): string =>
  typeof value === 'string' ? value.slice(0, max) : '';
const timestamp = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : Date.now();
const modes: ChatMode[] = ['chat', 'research', 'agent'];
const steps: MissionStepKind[] = ['analyze', 'research', 'verify'];
const stepStatuses: MissionStepStatus[] = ['pending', 'running', 'completed', 'failed', 'blocked'];
const missionStatuses: MissionStatus[] = ['planning', 'ready', 'running', 'paused', 'complete', 'failed'];
const autonomyValues: Autonomy[] = ['assist', 'supervised', 'autopilot'];

function safeSources(value: unknown): ResearchSource[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const sources: ResearchSource[] = [];
  for (const item of value.slice(0, 12)) {
    if (!isRecord(item) || typeof item.url !== 'string') continue;
    try {
      const url = new URL(item.url);
      if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password) continue;
      sources.push({
        id: sources.length + 1,
        title: text(item.title, 180) || url.hostname,
        url: url.toString(),
        snippet: text(item.snippet, 1250),
        publishedAt: text(item.publishedAt, 32) || undefined,
      });
    } catch { /* Ignore malicious or malformed source links. */ }
  }
  return sources.length ? sources : undefined;
}
function restoreMessage(raw: unknown): ChatMessage | null {
  if (!isRecord(raw) || (raw.role !== 'assistant' && raw.role !== 'user') ||
      typeof raw.content !== 'string' || typeof raw.id !== 'string') return null;
  const status: ChatMessage['status'] = raw.status === 'error' || raw.status === 'stopped' ? raw.status : 'done';
  return {
    id: text(raw.id, 100), role: raw.role, content: text(raw.content, 8000),
    status, createdAt: timestamp(raw.createdAt), sources: safeSources(raw.sources),
  };
}
function restoreConversation(raw: unknown): Conversation | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || typeof raw.title !== 'string' || !Array.isArray(raw.messages)) return null;
  const messages = raw.messages.slice(-100).map(restoreMessage).filter((v): v is ChatMessage => v !== null);
  return {
    id: text(raw.id, 100), title: text(raw.title, 150),
    model: isModelId(raw.model) ? raw.model : DEFAULT_MODEL,
    mode: modes.includes(raw.mode as ChatMode) ? raw.mode as ChatMode : 'chat',
    messages, createdAt: timestamp(raw.createdAt), updatedAt: timestamp(raw.updatedAt),
  };
}
function restoreStep(raw: unknown): MissionStep | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || typeof raw.title !== 'string' ||
      !steps.includes(raw.kind as MissionStepKind)) return null;
  return {
    id: text(raw.id, 100), title: text(raw.title, 110),
    kind: raw.kind as MissionStepKind,
    status: stepStatuses.includes(raw.status as MissionStepStatus) ? raw.status as MissionStepStatus : 'pending',
    output: text(raw.output, 9000), startedAt: timestamp(raw.startedAt),
    finishedAt: timestamp(raw.finishedAt), sources: safeSources(raw.sources),
  };
}
function restoreMission(raw: unknown): Mission | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || typeof raw.goal !== 'string' || !Array.isArray(raw.steps)) return null;
  const mission: Mission = {
    id: text(raw.id, 100), goal: text(raw.goal, 1500),
    model: isModelId(raw.model) ? raw.model : DEFAULT_MODEL,
    autonomy: autonomyValues.includes(raw.autonomy as Autonomy) ? raw.autonomy as Autonomy : 'supervised',
    status: missionStatuses.includes(raw.status as MissionStatus) ? raw.status as MissionStatus : 'paused',
    steps: raw.steps.slice(0, 5).map(restoreStep).filter((v): v is MissionStep => v !== null),
    createdAt: timestamp(raw.createdAt), updatedAt: timestamp(raw.updatedAt),
    finalResult: text(raw.finalResult, 9000) || undefined,
    error: text(raw.error, 1000) || undefined,
  };
  return recoverMission(mission);
}
export function createBackup(chats: StoredState, missions: Mission[]): string {
  const payload: Backup = { schema: 'astra-workspace-backup', version: 1, createdAt: new Date().toISOString(), chats, missions };
  return JSON.stringify(payload, null, 2);
}
export function parseBackup(json: string): { chats: StoredState; missions: Mission[] } {
  if (json.length > 5_000_000) throw new Error('Backup exceeds the 5 MB import limit.');
  let raw: unknown;
  try { raw = JSON.parse(json); } catch { throw new Error('Not a valid JSON backup.'); }
  if (!isRecord(raw) || raw.schema !== 'astra-workspace-backup' || raw.version !== 1 || !isRecord(raw.chats) || !Array.isArray(raw.missions)) {
    throw new Error('This file is not a supported Astra workspace backup.');
  }
  const conversations = Array.isArray(raw.chats.conversations) ? raw.chats.conversations.slice(0, 100)
    .map(restoreConversation).filter((v): v is Conversation => v !== null) : [];
  const importedSelectedId = raw.chats.selectedId;
  const selectedId = typeof importedSelectedId === 'string' && conversations.some(c => c.id === importedSelectedId)
    ? importedSelectedId : null;
  const theme = raw.chats.theme === 'light' || raw.chats.theme === 'system' ? raw.chats.theme : 'dark';
  return {
    chats: {
      conversations, selectedId,
      defaultModel: isModelId(raw.chats.defaultModel) ? raw.chats.defaultModel : DEFAULT_MODEL,
      theme,
    },
    missions: raw.missions.slice(0, 50).map(restoreMission).filter((v): v is Mission => v !== null),
  };
}
