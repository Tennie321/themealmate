import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type ChangeEvent } from 'react';
import {
  ArrowRight, ArrowUp, BookOpen, Bot, BrainCircuit, Check, ChevronDown,
  ChevronRight, CircleHelp, Cloud, Code2, Copy, Database,
  ExternalLink, Globe2, Layers3, Lightbulb, Menu, MessageCircle,
  MessageSquare, PanelLeftClose, Plus, RotateCcw,
  Search, Settings2, ShieldCheck, Sparkles, Square, Trash2, X, Zap,
} from 'lucide-react';
import { MODELS, getModel, type ModelId } from '../lib/models';
import { MissionControl } from './MissionControl';
import { ChatGPTBridge } from './ChatGPTBridge';
import type { ResearchResult } from '../lib/research-types';
import { createBackup, parseBackup } from '../lib/backup';
import { loadMissions, persistMissions } from '../lib/mission-types';
import {
  EMPTY_STORE, loadStore, makeId, saveStore,
  type AppTheme, type ChatMessage, type ChatMode, type Conversation, type StoredState,
} from '../lib/storage';

type Sheet = 'models' | 'settings' | 'connections' | null;
type SettingsSection = 'general' | 'models' | 'privacy';
type CapabilitySnapshot = {
  ai: boolean;
  research: boolean;
  aiStatus?: 'ready' | 'missing_lovable_api_key' | 'access_setup_required' | 'unreachable';
  researchStatus?: string;
};

const SUGGESTIONS = [
  { icon: Lightbulb, label: 'Explore an idea', sample: 'Help me pressure-test a new business idea and find the weaknesses.', tint: 'blue' },
  { icon: BookOpen, label: 'Research a topic', sample: 'Create a thorough research plan for the next big trend in AI.', tint: 'violet', mode: 'research' as ChatMode },
  { icon: Code2, label: 'Build something', sample: 'Help me design a useful web app from scratch.', tint: 'peach' },
  { icon: Bot, label: 'Plan a workflow', sample: 'Break down an automated workflow for managing my daily tasks.', tint: 'mint', mode: 'agent' as ChatMode },
];

const CONNECTORS = [
  { name: 'Google Drive', detail: 'Find and work with documents', mark: 'GD', shade: 'gold' },
  { name: 'Gmail', detail: 'Read, search and draft email', mark: 'GM', shade: 'red' },
  { name: 'Google Calendar', detail: 'Schedules, meetings and events', mark: 'GC', shade: 'blue' },
  { name: 'GitHub', detail: 'Repositories, pull requests and issues', mark: 'GH', shade: 'neutral' },
  { name: 'Notion', detail: 'Workspace pages and knowledge', mark: 'N', shade: 'neutral' },
  { name: 'Slack', detail: 'Messages, channels and context', mark: 'SL', shade: 'violet' },
  { name: 'Web research', detail: 'Cited information from live websites', mark: 'WEB', shade: 'mint' },
];

function dayGroup(time: number): string {
  const date = new Date(time);
  const now = new Date();
  const beginning = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (date.getTime() >= beginning) return 'Today';
  if (date.getTime() >= beginning - 86_400_000) return 'Yesterday';
  if (date.getTime() >= beginning - 604_800_000) return 'Previous 7 days';
  return 'Older';
}

function ShortText({ text }: { text: string }) {
  const segments = text.split(/(https?:\/\/[^\s<>"']+)/g);
  return <>{segments.map((s, i) => /^https?:\/\//.test(s) ?
    <a key={i} href={s} target="_blank" rel="noopener noreferrer">{s}</a> :
    <span key={i}>{s}</span>)}</>;
}

function AstraMark({ size = 'normal' }: { size?: 'normal' | 'large' }) {
  return <div className={`astra-mark ${size === 'large' ? 'astra-mark-large' : ''}`} aria-hidden="true">
    <svg width="26" height="26" viewBox="0 0 32 32" fill="none">
      <path d="M16 3.5 29 26H3L16 3.5Z" stroke="currentColor" strokeWidth="2.15" strokeLinejoin="round" />
      <path d="M10.1 21H21.9" stroke="currentColor" strokeWidth="2.15" strokeLinecap="round" />
      <path d="m16 12 4.6 9h-9.2l4.6-9Z" fill="currentColor" opacity="0.8" />
    </svg>
  </div>;
}

function IconButton({ children, label, onClick, className = '', disabled = false }: {
  children: ReactNode; label: string; onClick: () => void; className?: string; disabled?: boolean;
}) {
  return <button type="button" aria-label={label} title={label} className={`icon-button ${className}`} onClick={onClick} disabled={disabled}>{children}</button>;
}

export function AgentApp() {
  const [store, setStore] = useState<StoredState>(EMPTY_STORE);
  const [hydrated, setHydrated] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [view, setView] = useState<'chat' | 'missions' | 'chatgpt'>('chat');
  const [capabilities, setCapabilities] = useState<CapabilitySnapshot | null>(null);
  const researchAvailable = Boolean(capabilities?.research);
  const [privateBetaProtected, setPrivateBetaProtected] = useState(false);
  const backupInputRef = useRef<HTMLInputElement | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('general');
  const [draft, setDraft] = useState('');
  const [draftMode, setDraftMode] = useState<ChatMode>('chat');
  const [historySearch, setHistorySearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const textRef = useRef<HTMLTextAreaElement | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const requestLock = useRef(false);
  const lastSavedRef = useRef('');

  useEffect(() => { setStore(loadStore()); setHydrated(true); }, []);
  useEffect(() => {
    void fetch('/api/capabilities', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Unable to check AI service');
        return await response.json() as CapabilitySnapshot;
      })
      .then(setCapabilities)
      .catch(() => setCapabilities({ ai: false, research: false, aiStatus: 'unreachable' }));
  }, []);
  useEffect(() => { void fetch('/api/access/status').then(r => r.json()).then((x: { protected?: boolean }) => setPrivateBetaProtected(Boolean(x.protected))).catch(() => {}); }, []);
  useEffect(() => {
    if (!hydrated) return;
    const serialized = JSON.stringify(store);
    if (lastSavedRef.current === serialized) return;
    lastSavedRef.current = serialized;
    if (!saveStore(store)) setToast('Device storage is full. This conversation may not be saved.');
  }, [store, hydrated]);
  useEffect(() => {
    const applyTheme = () => {
      document.documentElement.dataset.theme = store.theme === 'system'
        ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
        : store.theme;
    };
    applyTheme();
    const media = window.matchMedia('(prefers-color-scheme: light)');
    media.addEventListener('change', applyTheme);
    return () => media.removeEventListener('change', applyTheme);
  }, [store.theme]);
  useEffect(() => { if (toast) { const id = window.setTimeout(() => setToast(''), 3600); return () => window.clearTimeout(id); } }, [toast]);

  const current = store.conversations.find((c) => c.id === store.selectedId) ?? null;
  const model = current?.model ?? store.defaultModel;
  const mode = current?.mode ?? draftMode;
  const activeModel = getModel(model);
  const groups = useMemo(() => {
    const grouped = new Map<string, Conversation[]>();
    [...store.conversations]
      .filter((c) => (c.title + ' ' + c.messages.map((m) => m.content).join(' ')).toLowerCase().includes(historySearch.trim().toLowerCase()))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .forEach((c) => { const key = dayGroup(c.updatedAt); grouped.set(key, [...(grouped.get(key) ?? []), c]); });
    return [...grouped.entries()];
  }, [store.conversations, historySearch]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: loading ? 'auto' : 'smooth', block: 'end' }); }, [current?.messages, loading]);
  useEffect(() => {
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') { setSheet(null); setDrawerOpen(false); }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  const createNew = () => {
    if (requestRef.current) requestRef.current.abort();
    requestRef.current = null;
    requestLock.current = false;
    setLoading(false);
    setStore((s) => ({ ...s, selectedId: null }));
    setDraft(''); setDraftMode('chat'); setView('chat'); setDrawerOpen(false); setSheet(null);
    window.setTimeout(() => textRef.current?.focus(), 40);
  };
  const setModel = (id: ModelId) => {
    setStore((s) => ({ ...s, defaultModel: id, conversations: s.conversations.map((c) => c.id === s.selectedId ? { ...c, model: id } : c) }));
    setSheet(null);
  };
  const setMode = (next: ChatMode) => {
    setDraftMode(next);
    setStore((s) => ({ ...s, conversations: s.conversations.map((c) => c.id === s.selectedId ? { ...c, mode: next } : c) }));
  };
  const chooseConversation = (id: string) => {
    if (requestRef.current) requestRef.current.abort();
    setLoading(false); requestLock.current = false; requestRef.current = null;
    setStore((s) => ({ ...s, selectedId: id }));
    setView('chat'); setDraft(''); setDrawerOpen(false); setSheet(null);
  };
  const deleteConversation = (id: string) => {
    if (requestRef.current && id === store.selectedId) { requestRef.current.abort(); requestLock.current = false; requestRef.current = null; setLoading(false); }
    setStore((s) => ({ ...s, selectedId: s.selectedId === id ? null : s.selectedId, conversations: s.conversations.filter((c) => c.id !== id) }));
    setToast('Conversation deleted from this device');
  };

  const updateAssistant = useCallback((conversationId: string, assistantId: string, transform: (m: ChatMessage) => ChatMessage) => {
    setStore((s) => ({ ...s, conversations: s.conversations.map((c) => c.id === conversationId
      ? { ...c, updatedAt: Date.now(), messages: c.messages.map((m) => m.id === assistantId ? transform(m) : m) }
      : c) }));
  }, []);

  const runReply = async (conversationId: string, messages: ChatMessage[], assistantId: string, whichModel: ModelId, whichMode: ChatMode) => {
    const controller = new AbortController();
    requestRef.current = controller;
    requestLock.current = true;
    setLoading(true);
    try {
      if (whichMode === 'research' && researchAvailable) {
        const lastQuestion = messages.filter(m => m.role === 'user').at(-1)?.content || '';
        const response = await fetch('/api/research', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: lastQuestion, model: whichModel }),
          signal: controller.signal,
        });
        const data: unknown = await response.json().catch(() => ({}));
        if (!response.ok) {
          const message = data && typeof data === 'object' && 'error' in data ? (data as {error: string}).error : undefined;
          throw new Error(message || 'Live research failed.');
        }
        const result = data as ResearchResult;
        updateAssistant(conversationId, assistantId, m => ({
          ...m, content: result.answer, sources: result.sources, status: 'done',
        }));
        return;
      }
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: whichModel, mode: whichMode, messages: messages.slice(-20).map(({ role, content }) => ({ role, content })) }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error || `AI request failed (${response.status})`);
      }
      if (!response.body) throw new Error('The AI provider did not return a response stream.');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let output = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        output += decoder.decode(value, { stream: true });
        updateAssistant(conversationId, assistantId, (m) => ({ ...m, content: output, status: 'pending' }));
      }
      output += decoder.decode();
      updateAssistant(conversationId, assistantId, (m) => ({ ...m, content: output.trim() || 'The model returned an empty response. Please try again.', status: output.trim() ? 'done' : 'error' }));
    } catch (error) {
      const aborted = controller.signal.aborted;
      const detail = error instanceof Error ? error.message : 'Unknown AI error';
      updateAssistant(conversationId, assistantId, (m) => ({
        ...m,
        content: m.content || (aborted ? 'Response stopped.' : detail),
        status: aborted ? 'stopped' : 'error',
      }));
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        requestLock.current = false;
        setLoading(false);
      }
    }
  };

  const sendMessage = async () => {
    const content = draft.trim();
    if (!content || requestLock.current || content.length > 8000 || !capabilities?.ai) return;
    const now = Date.now();
    const convoId = current?.id || makeId();
    const userMessage: ChatMessage = { id: makeId(), role: 'user', content, createdAt: now, status: 'done' };
    const answerId = makeId();
    const answer: ChatMessage = { id: answerId, role: 'assistant', content: '', createdAt: now, status: 'pending' };
    const previous = current?.messages ?? [];
    const requestMessages = [...previous.filter((m) => m.content && m.status !== 'error'), userMessage];
    setStore((s) => {
      const existing = s.conversations.find((c) => c.id === convoId);
      if (!existing) {
        const chat: Conversation = { id: convoId, title: content.slice(0, 56), model, mode, messages: [userMessage, answer], createdAt: now, updatedAt: now };
        return { ...s, selectedId: convoId, conversations: [chat, ...s.conversations] };
      }
      return { ...s, selectedId: convoId, conversations: s.conversations.map((c) => c.id === convoId ? { ...c, messages: [...c.messages, userMessage, answer], updatedAt: now } : c) };
    });
    setDraft('');
    await runReply(convoId, requestMessages, answerId, model, mode);
  };

  const retry = async () => {
    if (!current || requestLock.current || current.messages.length < 2 || !capabilities?.ai) return;
    const last = current.messages.at(-1);
    if (last?.role !== 'assistant') return;
    const turns = current.messages.slice(0, -1).filter((m) => m.content && m.status !== 'error');
    if (turns.at(-1)?.role !== 'user') return;
    updateAssistant(current.id, last.id, (m) => ({ ...m, content: '', status: 'pending' }));
    await runReply(current.id, turns, last.id, model, mode);
  };
  const stop = () => requestRef.current?.abort();
  const exportWorkspace = () => {
    try {
      const data = createBackup(store, loadMissions());
      const blob = new Blob([data], { type: 'application/json' });
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `astra-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
      setToast('Workspace backup prepared');
    } catch { setToast('Could not export workspace'); }
  };
  const importWorkspace = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 5_000_000) throw new Error('Backup is larger than 5 MB.');
      const restored = parseBackup(await file.text());
      if (!window.confirm(`Replace this device's chat and mission history with ${restored.chats.conversations.length} conversations and ${restored.missions.length} missions? This cannot be undone.`)) return;
      requestRef.current?.abort();
      requestRef.current = null;
      requestLock.current = false;
      setLoading(false);
      if (!persistMissions(restored.missions)) throw new Error('Could not save missions on this device.');
      window.dispatchEvent(new Event('astra:missions-restored'));
      setStore(restored.chats);
      setSheet(null);
      setToast('Workspace restored on this device');
    } catch (cause) {
      setToast(cause instanceof Error ? cause.message : 'Could not import workspace');
    }
  };
  const copy = (content: string) => {
    navigator.clipboard?.writeText(content).then(() => setToast('Copied to clipboard')).catch(() => setToast('Could not copy text'));
  };
  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !/iPhone|iPad|Android/i.test(navigator.userAgent)) {
      e.preventDefault(); void sendMessage();
    }
  };
  const pickSuggestion = (sample: string, nextMode: ChatMode = 'chat') => {
    setMode(nextMode); setDraft(sample);
    window.setTimeout(() => textRef.current?.focus(), 35);
  };
  const openSettings = (section: SettingsSection = 'general') => {
    setSettingsSection(section); setDrawerOpen(false); setSheet('settings');
  };

  return <div className="astra-app">
    {drawerOpen && <button type="button" className="drawer-scrim" aria-label="Close navigation" onClick={() => setDrawerOpen(false)} />}
    <aside className={`sidebar ${drawerOpen ? 'sidebar-open' : ''}`} aria-label="Conversations sidebar">
      <div className="sidebar-brand">
        <div className="brand-lockup"><AstraMark /><div className="brand-name">astra<span>.</span></div></div>
        <IconButton label="Close navigation" onClick={() => setDrawerOpen(false)} className="hide-on-desktop"><PanelLeftClose size={20} /></IconButton>
      </div>
      <button type="button" className="new-chat" onClick={createNew}><Plus size={18} strokeWidth={2.2} /> New conversation</button>
      <label className="history-search"><Search size={17} /><input value={historySearch} onChange={(e) => setHistorySearch(e.target.value)} placeholder="Search conversations" aria-label="Search conversations" /></label>
      <div className="sidebar-section-heading">WORKSPACE</div>
      <button type="button" className={`sidebar-nav ${view === 'chat' ? 'selected' : ''}`} onClick={() => { createNew(); }}><MessageSquare size={18} /> Chat <ChevronRight size={14} className="nav-end" /></button>
      <button type="button" className={`sidebar-nav ${view === 'missions' ? 'selected' : ''}`} onClick={() => { setView('missions'); setDrawerOpen(false); setSheet(null); }}><Layers3 size={18} /> Mission Control <ChevronRight size={14} className="nav-end" /></button>
      <button type="button" className={`sidebar-nav ${view === 'chatgpt' ? 'selected' : ''}`} onClick={() => { setView('chatgpt'); setDrawerOpen(false); setSheet(null); }}><ExternalLink size={18} /> ChatGPT Bridge <span className="nav-tiny">NEW</span></button>
      <button type="button" className="sidebar-nav" onClick={() => { setView('chat'); setDrawerOpen(false); setMode('research'); setSheet(null); }}><Globe2 size={18} /> Research planner <span className="nav-tiny">PLAN</span></button>
      <button type="button" className="sidebar-nav" onClick={() => { setView('missions'); setDrawerOpen(false); setSheet(null); }}><Bot size={18} /> Agent missions <span className="nav-tiny">BETA</span></button>
      <div className="history-section"><div className="sidebar-section-heading">RECENTS <span>{store.conversations.length}</span></div>
        {groups.length ? groups.map(([groupName, entries]) => <section key={groupName} className="history-group"><div className="history-label">{groupName}</div>{entries.map((c) =>
          <div className={`history-item ${store.selectedId === c.id ? 'history-active' : ''}`} key={c.id}>
            <button type="button" className="history-select" onClick={() => chooseConversation(c.id)} title={c.title}><MessageCircle size={15} /><span>{c.title}</span></button>
            <IconButton className="history-delete" label={`Delete ${c.title}`} onClick={() => deleteConversation(c.id)}><Trash2 size={15} /></IconButton>
          </div>)}</section>) : <p className="empty-history">{historySearch ? 'No matching conversations' : 'Your conversations will appear here.'}</p>}
      </div>
      <div className="sidebar-bottom">
        <div className="workspace-note"><div className="status-light" /><div><strong>{capabilities?.ai ? 'Lovable AI Gateway' : capabilities ? 'AI setup required' : 'Checking AI connection'}</strong><small>{capabilities?.ai ? 'Usage billed by Lovable AI' : capabilities ? 'Chat and missions unavailable' : 'Awaiting server status'}</small></div></div>
        <button type="button" className="sidebar-nav" onClick={() => { setDrawerOpen(false); setSheet('connections'); }}><Layers3 size={18} /> Connections <ChevronRight size={16} className="nav-end" /></button>
        <button type="button" className="sidebar-nav" onClick={() => openSettings()}><Settings2 size={18} /> Settings <ChevronRight size={16} className="nav-end" /></button>
      </div>
    </aside>

    <div className="workspace">
      <header className="topbar">
        <div className="topbar-left"><IconButton label="Open navigation" className="hide-on-desktop menu-btn" onClick={() => setDrawerOpen(true)}><Menu size={21} /></IconButton>
          <div className="topbar-title"><span className="topbar-kicker">YOUR WORKSPACE</span><strong>{view === 'missions' ? 'Mission Control' : view === 'chatgpt' ? 'ChatGPT Bridge' : current?.title || 'New conversation'}</strong></div>
        </div>
        <div className="topbar-right">
          <IconButton label="Mission Control" onClick={() => { setView('missions'); setSheet(null); }} className="missions-shortcut"><Layers3 size={19}/></IconButton>
          <button type="button" className="model-chip" onClick={() => setSheet('models')} aria-label={`Select model, currently ${activeModel.name}`}>
            <span className="model-status-dot" /><span className="model-chip-name">{activeModel.name}</span><ChevronDown size={15} />
          </button>
          <IconButton label="New conversation" onClick={createNew} className="top-new"><Plus size={20} /></IconButton>
        </div>
      </header>

      <MissionControl model={model} active={view === 'missions'} onBack={() => setView('chat')} />
      {view === 'chatgpt' && <ChatGPTBridge />}
      <div className="chat-workspace" style={view !== 'chat' ? { display: 'none' } : undefined}>
      {capabilities && !capabilities.ai && (
        <div className="mode-disclaimer" role="status" style={{ margin: '12px 20px', padding: '12px 14px', borderRadius: 12 }}>
          <span className="disclaimer-dot" />
          <span>{capabilities.aiStatus === 'missing_lovable_api_key'
            ? 'AI chat needs Lovable AI enabled for this deployment (LOVABLE_API_KEY is missing).'
            : capabilities.aiStatus === 'access_setup_required'
              ? 'AI is locked until ASTRA_ACCESS_CODE and ASTRA_SESSION_SECRET are configured on the server.'
              : 'Could not check AI service availability. Try reloading Astra.'}</span>
          <button type="button" onClick={() => setView('chatgpt')}>Use ChatGPT Bridge <ChevronRight size={12}/></button>
        </div>
      )}
      <main className={`chat-main ${!current?.messages.length ? 'chat-is-empty' : ''}`}>
        {!current?.messages.length ? <div className="welcome">
          <div className="welcome-orbit"><div className="orbit-ring ring-one" /><div className="orbit-ring ring-two" /><AstraMark size="large" /></div>
          <div className="welcome-tag"><Sparkles size={13} /> INTELLIGENCE, ON DEMAND</div>
          <h1>What should we<br/><em>work on?</em></h1>
          <p className="welcome-description">One workspace. The best models. Whatever's on your mind.</p>
          <div className="suggestion-grid">{SUGGESTIONS.map((s) => <button type="button" key={s.label} className="suggestion" onClick={() => pickSuggestion(s.sample, s.mode)}>
            <span className={`suggestion-icon tint-${s.tint}`}><s.icon size={19} strokeWidth={1.8}/></span>
            <span className="suggestion-label">{s.label}</span><ArrowRight size={15} className="suggestion-arrow" />
          </button>)}</div>
          <p className="welcome-subtle">Your ideas deserve a powerful place to grow.</p>
        </div> : <div className="messages" aria-live="polite">
          <div className="session-caption"><Sparkles size={13} /> ASTRA · {getModel(current.model).name.toUpperCase()}</div>
          {current.messages.map((message) => <article key={message.id} className={`message message-${message.role}`}>
            {message.role === 'assistant' && <div className="assistant-avatar"><AstraMark /></div>}
            <div className="message-body">
              {message.role === 'assistant' && <div className="message-author">Astra <span>· {getModel(current.model).name}</span></div>}
              <div className="message-text">{message.status === 'pending' && !message.content ? <div className="thinking-indicator"><span/><span/><span/></div> : <ShortText text={message.content} />}</div>
              {message.role === 'assistant' && !!message.sources?.length && <div className="chat-sources"><strong>Sources · Live web search</strong>{message.sources.map(source => <a key={source.id} href={source.url} target="_blank" rel="noopener noreferrer"><Globe2 size={13} /><span>[{source.id}] {source.title}</span><ExternalLink size={12}/></a>)}</div>}
              {message.role === 'assistant' && message.status === 'error' && <div className="message-error">Response failed</div>}
              {message.role === 'assistant' && message.status === 'stopped' && <div className="message-stopped">Generation stopped</div>}
              {message.role === 'assistant' && !!message.content && <div className="message-actions"><IconButton label="Copy response" onClick={() => copy(message.content)}><Copy size={15}/></IconButton>{message.id === current.messages.at(-1)?.id && !loading && <IconButton label="Regenerate response" onClick={() => void retry()}><RotateCcw size={15}/></IconButton>}</div>}
            </div>
          </article>)}
          <div ref={bottomRef} className="chat-bottom-anchor" />
        </div>}
      </main>

      <footer className="composer-area">
        <div className="composer-wrap">
          {mode !== 'chat' && <div className="mode-disclaimer"><span className="disclaimer-dot" />{mode === 'research' ? (researchAvailable ? 'Live research enabled · sources from Perplexity Search' : 'Research planning only · search provider not configured') : 'Agent planning only · open Mission Control to run tasks'}<button type="button" onClick={() => mode === 'agent' ? setView('missions') : setSheet('connections')}>{mode === 'agent' ? 'Missions' : 'Details'} <ChevronRight size={12}/></button></div>}
          <div className={`composer ${loading ? 'composer-loading' : ''}`}>
            <textarea ref={textRef} value={draft} rows={1} maxLength={8000} onChange={(e) => setDraft(e.target.value)} onKeyDown={handleKey} placeholder={mode === 'research' ? 'What do you want to investigate?' : mode === 'agent' ? 'What should we plan?' : 'Message Astra...'} aria-label="Message Astra" />
            <div className="composer-controls">
              <div className="mode-pills" role="group" aria-label="Conversation mode">
                <button type="button" className={`mode-pill ${mode === 'chat' ? 'active' : ''}`} aria-pressed={mode === 'chat'} onClick={() => setMode('chat')}><MessageSquare size={14} /> Chat</button>
                <button type="button" className={`mode-pill ${mode === 'research' ? 'active' : ''}`} aria-pressed={mode === 'research'} onClick={() => setMode('research')}><Globe2 size={14} /> Research</button>
                <button type="button" className={`mode-pill ${mode === 'agent' ? 'active' : ''}`} aria-pressed={mode === 'agent'} onClick={() => setMode('agent')}><Bot size={14} /> Agent</button>
              </div>
              <div className="composer-send">
                {loading ? <button type="button" className="send-button stop-button" onClick={stop} aria-label="Stop response"><Square size={16} fill="currentColor" /></button>
                  : <button type="button" className="send-button" onClick={() => void sendMessage()} aria-label="Send message" disabled={!draft.trim() || !hydrated || !capabilities?.ai}><ArrowUp size={20} strokeWidth={2.6}/></button>}
              </div>
            </div>
          </div>
          <div className="composer-caption"><ShieldCheck size={12} /> Conversations are saved on this device. AI responses may contain mistakes.</div>
        </div>
      </footer>
      </div>
    </div>

    {sheet && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setSheet(null); }}>
      <section className={`sheet ${sheet === 'models' ? 'sheet-models' : ''}`} role="dialog" aria-modal="true" aria-label={sheet === 'models' ? 'Select AI model' : sheet === 'settings' ? 'Settings' : 'Connections'}>
        <div className="sheet-handle" />
        <div className="sheet-header"><div><span className="sheet-eyebrow">ASTRA WORKSPACE</span><h2>{sheet === 'models' ? 'Choose a model' : sheet === 'settings' ? 'Settings' : 'Connections'}</h2></div><IconButton label="Close" onClick={() => setSheet(null)}><X size={20}/></IconButton></div>
        {sheet === 'models' && <><div className="sheet-intro">Switch models any time. Responses use your project's <strong>Lovable AI</strong> balance.</div><div className="model-list">
          {MODELS.map((m) => <button type="button" key={m.id} className={`model-option ${model === m.id ? 'model-selected' : ''}`} onClick={() => setModel(m.id)}>
            <span className={`provider-badge provider-${m.provider.toLowerCase()}`}>{m.provider === 'Google' ? 'G' : m.provider === 'OpenAI' ? 'O' : 'A'}</span>
            <span className="model-option-body"><span className="model-option-top"><strong>{m.name}</strong>{m.recommended && <span className="recommended">DEFAULT</span>}</span><small>{m.description}</small><span className="model-option-meta">{m.provider} <span>·</span> {m.speed} <span>·</span> {m.tier}</span></span>
            {model === m.id ? <span className="selected-check"><Check size={16}/></span> : <ChevronRight size={16} className="model-chevron"/>}
          </button>)}
        </div><p className="sheet-footnote"><CircleHelp size={14}/> Model availability and billing depend on your Lovable workspace. Premium models consume more usage credits.</p></>}
        {sheet === 'settings' && <div className="settings-content">
          <div className="settings-tabs" role="tablist" aria-label="Settings sections">
            {(['general','models','privacy'] as SettingsSection[]).map((tab) => <button type="button" role="tab" aria-selected={settingsSection === tab} className={settingsSection === tab ? 'tab-active' : ''} onClick={() => setSettingsSection(tab)} key={tab}>{tab === 'general' ? 'General' : tab === 'models' ? 'AI Models' : 'Privacy'}</button>)}
          </div>
          {settingsSection === 'general' && <div className="settings-pane"><div className="setting-label">Appearance</div><div className="setting-row"><div><strong>Color theme</strong><p>Choose the appearance of your workspace.</p></div></div><div className="theme-options">{(['dark','light','system'] as AppTheme[]).map((value) => <button key={value} type="button" className={store.theme === value ? 'theme-selected' : ''} onClick={() => setStore((s) => ({ ...s, theme: value }))}>{value === 'dark' ? 'Dark' : value === 'light' ? 'Light' : 'System'}{store.theme === value && <Check size={14}/>}</button>)}</div>
            <div className="settings-divider"/><div className="setting-label">Workspace</div>
            <button type="button" className="setting-link" onClick={() => setSheet('connections')}><span><strong>Connected apps</strong><small>Manage services and future integrations</small></span><ChevronRight size={18}/></button>
            <div className="setting-info"><Cloud size={18}/><span>AI inference runs through Lovable's backend gateway. Build credits aren't consumed by editing this code on GitHub.</span></div>
          </div>}
          {settingsSection === 'models' && <div className="settings-pane"><div className="setting-label">Default AI model</div><p className="setting-copy">The selected model is used for new conversations and this current chat.</p>
            <button type="button" className="current-model-setting" onClick={() => setSheet('models')}><span className="provider-badge provider-google"><BrainCircuit size={17}/></span><span><strong>{activeModel.name}</strong><small>{activeModel.provider} · {activeModel.tier}</small></span><ChevronRight size={19}/></button>
            <div className="setting-info"><Zap size={18}/><span>Gemini 3.8 Flash is the recommended balance of intelligence and speed. Change to a premium model for challenging work.</span></div>
          </div>}
          {settingsSection === 'privacy' && <div className="settings-pane"><div className="setting-label">Data and privacy</div><div className="data-actions">
              <button type="button" onClick={exportWorkspace}><Database size={16}/> Export workspace backup</button>
              <button type="button" onClick={() => backupInputRef.current?.click()}><ArrowRight size={16}/> Import workspace backup</button>
              <input ref={backupInputRef} type="file" accept=".json,application/json" onChange={e => { void importWorkspace(e); }} aria-label="Choose Astra backup file" className="backup-file-input" />
            </div><p className="setting-copy">Backups are saved to your device, not uploaded to a server. Importing replaces local chats and missions.</p>
            {privateBetaProtected && <button type="button" className="clear-history" onClick={() => window.dispatchEvent(new Event('astra:lock'))}><ShieldCheck size={16}/> Lock private workspace</button>}<div className="privacy-note"><Database size={21}/><div><strong>Local conversation history</strong><p>Your chat history is stored in this browser's local storage, not synced across devices. Prompts are sent to Lovable AI only when you send them.</p></div></div>
            <button type="button" className="clear-history" onClick={() => { if (window.confirm('Delete all Astra chats saved on this device? This cannot be undone.')) { requestRef.current?.abort(); setLoading(false); requestLock.current = false; requestRef.current = null; setStore((s) => ({ ...s, conversations: [], selectedId: null })); setSheet(null); setToast('Local chat history cleared'); } }}><Trash2 size={16} /> Clear local chat history</button>
            <p className="setting-copy">For multi-user access, per-user connector permissions and cross-device sync, account authentication and a secured database must be configured before launch.</p>
          </div>}
        </div>}
        {sheet === 'connections' && <div className="connections-content"><div className="sheet-intro">The app is ready for integrations. Each connector requires explicit server-side authentication and permissions before it can access your data.</div>
          <div className="connector-list">{CONNECTORS.map((c) => <div className="connector-row" key={c.name}><div className={`connector-logo logo-${c.shade}`}>{c.mark}</div><div className="connector-text"><strong>{c.name}</strong><small>{c.detail}</small></div><span className="connector-status">Not connected</span></div>)}</div>
          <div className="connector-callout"><ShieldCheck size={19}/><div><strong>Connections are not active yet</strong><p>Lovable workspace/build-time connectors do not automatically authorize end users of this app. Live research works when the server has a Perplexity Search API key. User-scoped OAuth and background workers are still pending.</p></div></div>
          <a href="https://docs.lovable.dev/integrations/introduction" rel="noopener noreferrer" target="_blank" className="doc-link">Lovable integration documentation <ExternalLink size={15}/></a>
        </div>}
      </section>
    </div>}
    {!!toast && <div className="toast" role="status"><Check size={15}/>{toast}</div>}
  </div>;
}
