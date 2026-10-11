import { DEFAULT_MODEL, isModelId, type ModelId } from './models';

export type ChatMode = 'chat' | 'research' | 'agent';
export type ChatRole = 'user' | 'assistant';
export type MessageStatus = 'done' | 'pending' | 'stopped' | 'error';
export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
  status: MessageStatus;
}
export interface Conversation {
  id: string;
  title: string;
  model: ModelId;
  mode: ChatMode;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}
export type AppTheme = 'dark' | 'light' | 'system';
export interface StoredState {
  conversations: Conversation[];
  selectedId: string | null;
  defaultModel: ModelId;
  theme: AppTheme;
}

const STORAGE_KEY = 'astra.mobile.v1';
export const EMPTY_STORE: StoredState = { conversations: [], selectedId: null, defaultModel: DEFAULT_MODEL, theme: 'dark' };

export function loadStore(): StoredState {
  if (typeof window === 'undefined') return EMPTY_STORE;
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Partial<StoredState>;
    const raw = Array.isArray(stored.conversations) ? stored.conversations : [];
    const conversations = raw.filter((c): c is Conversation =>
      !!c && typeof c.id === 'string' && typeof c.title === 'string' && Array.isArray(c.messages)
    ).slice(0, 100).map((c) => ({
      ...c,
      model: isModelId(c.model) ? c.model : DEFAULT_MODEL,
      mode: c.mode === 'agent' || c.mode === 'research' ? c.mode : 'chat',
      messages: c.messages.filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .slice(-100).map((m) => ({ ...m, status: m.status === 'pending' ? 'stopped' : m.status })),
    }));
    const theme = stored.theme === 'light' || stored.theme === 'system' ? stored.theme : 'dark';
    return {
      conversations,
      selectedId: conversations.some((c) => c.id === stored.selectedId) ? stored.selectedId! : null,
      defaultModel: isModelId(stored.defaultModel) ? stored.defaultModel : DEFAULT_MODEL,
      theme,
    };
  } catch {
    return EMPTY_STORE;
  }
}

export function saveStore(state: StoredState): boolean {
  if (typeof window === 'undefined') return false;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, conversations: state.conversations.slice(0, 100) }));
    return true;
  } catch {
    return false;
  }
}

export function makeId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
