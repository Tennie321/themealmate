import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight, CheckCircle2, ChevronDown, ChevronRight, Clock3, ExternalLink,
  Globe2, Layers3, LoaderCircle, Pause, Play, Plus, ShieldCheck, Sparkles,
  Trash2, TriangleAlert, X,
} from 'lucide-react';
import { getModel, type ModelId } from '../lib/models';
import {
  loadMissions, persistMissions, type Mission, type MissionStep,
  type MissionStepKind, type Autonomy,
} from '../lib/mission-types';
import type { ResearchResult } from '../lib/research-types';

type Capabilities = { ai: boolean; research: boolean; persistentMissions: boolean; backgroundExecution: boolean };
type Props = { model: ModelId; active: boolean; onBack: () => void };
const STARTERS = [
  'Analyze this business idea and identify its strongest market advantage',
  'Research the latest developments in AI agents with credible sources',
  'Evaluate the risks and assumptions in a new startup concept',
];
const modeNotes: Record<Autonomy, string> = {
  assist: 'Run one step at a time, with explicit approval every time.',
  supervised: 'Pause after each step so you can review the result.',
  autopilot: 'Continue through model steps automatically within this open tab.',
};

function uid() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
async function requestJson<T>(path: string, payload: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal });
  const data: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = data && typeof data === 'object' && 'error' in data ? (data as { error?: string }).error : undefined;
    throw new Error(error || `Request failed (${res.status})`);
  }
  return data as T;
}
function stageLabel(kind: MissionStepKind): string {
  return kind === 'research' ? 'Live web research' : kind === 'verify' ? 'Critical review' : 'AI analysis';
}

export function MissionControl({ model, active, onBack }: Props) {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [goal, setGoal] = useState('');
  const [autonomy, setAutonomy] = useState<Autonomy>('supervised');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [error, setError] = useState('');
  const working = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);
  const missionsRef = useRef<Mission[]>([]);

  useEffect(() => {
    const saved = loadMissions();
    missionsRef.current = saved;
    setMissions(saved);
    setHydrated(true);
    const restore = () => {
      controllerRef.current?.abort();
      controllerRef.current = null;
      working.current = false;
      const restored = loadMissions();
      missionsRef.current = restored;
      setMissions(restored);
      setSelectedId(null);
    };
    window.addEventListener('astra:missions-restored', restore);
    void fetch('/api/capabilities').then(r => r.json()).then((data: Capabilities) => setCapabilities(data)).catch(() => {});
    return () => { window.removeEventListener('astra:missions-restored', restore); controllerRef.current?.abort(); };
  }, []);

  const updateMissions = useCallback((updater: (previous: Mission[]) => Mission[]) => {
    const next = updater(missionsRef.current);
    missionsRef.current = next;
    setMissions(next);
    if (!persistMissions(next)) setError('Local storage is full. Your mission progress may not be saved.');
  }, []);
  const patch = useCallback((id: string, change: Partial<Mission>) => {
    updateMissions((previous) => previous.map(m => m.id === id ? { ...m, ...change, updatedAt: Date.now() } : m));
  }, [updateMissions]);
  const selected = missions.find(m => m.id === selectedId) ?? missions[0] ?? null;
  const live = missions.some(m => m.status === 'running' || m.status === 'planning');

  const plan = async () => {
    const text = goal.trim();
    if (text.length < 8 || text.length > 1500 || working.current || capabilities?.ai !== true) return;
    const id = uid();
    const controller = new AbortController();
    working.current = true; controllerRef.current = controller;
    setError('');
    const started: Mission = {
      id, goal: text, model, autonomy, status: 'planning', steps: [],
      createdAt: Date.now(), updatedAt: Date.now(),
    };
    updateMissions(prev => [started, ...prev].slice(0, 50));
    setSelectedId(id);
    setGoal('');
    try {
      const result = await requestJson<{ steps: { title: string; kind: MissionStepKind }[] }>(
        '/api/missions/plan', { goal: text, model }, controller.signal,
      );
      if (!Array.isArray(result.steps) || result.steps.length < 2 || result.steps.length > 5) throw new Error('Invalid plan returned.');
      const steps: MissionStep[] = result.steps.map(s => ({
        id: uid(), title: s.title, kind: s.kind, status: 'pending', output: '',
      }));
      patch(id, { status: 'ready', steps });
    } catch (cause) {
      if (!controller.signal.aborted) patch(id, { status: 'failed', error: cause instanceof Error ? cause.message : 'Planning failed' });
    } finally {
      if (controllerRef.current === controller) { controllerRef.current = null; working.current = false; }
    }
  };

  const run = async (missionId: string) => {
    const mission = missionsRef.current.find(m => m.id === missionId);
    if (!mission || working.current || capabilities?.ai !== true || !mission.steps.length || mission.status === 'complete') return;
    const controller = new AbortController();
    controllerRef.current = controller;
    working.current = true;
    setError('');
    patch(missionId, { status: 'running', error: undefined });
    let attempted = 0;
    try {
      for (let index = 0; index < mission.steps.length; index++) {
        const latest = missionsRef.current.find(m => m.id === missionId);
        if (!latest) return;
        const step = latest.steps[index];
        if (step.status === 'completed') continue;
        if (controller.signal.aborted) return;
        if (step.kind === 'research' && !capabilities?.research) {
          const steps = latest.steps.map((s, i) => i === index ? { ...s, status: 'blocked' as const, output: 'Live research requires a server-side Perplexity Search API key.' } : s);
          patch(missionId, { status: 'paused', steps, error: 'Research provider not configured. Other steps remain pending.' });
          return;
        }
        const steps = latest.steps.map((s, i) => i === index ? { ...s, status: 'running' as const, startedAt: Date.now(), output: '' } : s);
        patch(missionId, { steps });
        let output = '';
        let sources: MissionStep['sources'];
        if (step.kind === 'research') {
          const research = await requestJson<ResearchResult>('/api/research', {
            query: `${latest.goal}\n${step.title}`, model: latest.model,
          }, controller.signal);
          output = research.answer;
          sources = research.sources;
        } else {
          const context = latest.steps.slice(0, index).filter(s => s.status === 'completed')
            .map(s => `${s.title}:\n${s.output}`).join('\n\n').slice(-6500);
          const response = await requestJson<{ output: string }>('/api/missions/step', {
            goal: latest.goal, title: step.title, kind: step.kind, context, model: latest.model,
          }, controller.signal);
          output = response.output;
        }
        if (controller.signal.aborted) return;
        const refreshed = missionsRef.current.find(m => m.id === missionId);
        if (!refreshed) return;
        const finished = refreshed.steps.map((s, i) => i === index ? {
          ...s, status: 'completed' as const, finishedAt: Date.now(), output, sources,
        } : s);
        attempted++;
        const done = finished.every(s => s.status === 'completed');
        patch(missionId, {
          status: done ? 'complete' : 'running',
          steps: finished,
          finalResult: done ? output : undefined,
        });
        if (done) return;
        if (latest.autonomy !== 'autopilot' && attempted >= 1) {
          patch(missionId, { status: 'paused' });
          return;
        }
      }
    } catch (cause) {
      if (!controller.signal.aborted) {
        const latest = missionsRef.current.find(m => m.id === missionId);
        if (latest) patch(missionId, {
          status: 'paused',
          steps: latest.steps.map(s => s.status === 'running' ? { ...s, status: 'failed' as const, output: '' } : s),
          error: cause instanceof Error ? cause.message : 'A mission step failed',
        });
      }
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        working.current = false;
        const latest = missionsRef.current.find(m => m.id === missionId);
        if (controller.signal.aborted && latest && latest.status === 'running') {
          patch(missionId, {
            status: 'paused',
            steps: latest.steps.map(s => s.status === 'running' ? { ...s, status: 'pending' as const, output: '' } : s),
          });
        }
      }
    }
  };

  const pause = () => controllerRef.current?.abort();
  const deleteMission = (id: string) => {
    if (missionsRef.current.some(m => m.id === id && (m.status === 'planning' || m.status === 'running'))) return;
    updateMissions(prev => prev.filter(m => m.id !== id));
    if (selectedId === id) setSelectedId(null);
  };
  const counts = { complete: missions.filter(m => m.status === 'complete').length, active: missions.filter(m => m.status === 'running' || m.status === 'planning').length };

  return <div className="missions-page" style={!active ? { display: 'none' } : undefined}>
    <div className="missions-heading">
      <div>
        <span className="missions-eyebrow"><Layers3 size={14} /> MISSION CONTROL</span>
        <h1>Make progress, <em>automatically.</em></h1>
        <p>Give Astra a goal. It breaks down the work, executes AI steps, and shows its actual results.</p>
      </div>
      <button className="mission-back" type="button" onClick={onBack}><X size={17} /> Close</button>
    </div>
    {capabilities?.ai === false && <div className="mode-disclaimer" role="alert">AI missions are unavailable until Lovable AI is enabled and private access secrets are configured on the server. <a href="https://docs.lovable.dev/features/ai" target="_blank" rel="noopener noreferrer">Setup guide</a></div>}
    <div className="missions-stats">
      <div><strong>{missions.length}</strong><span>Total missions</span></div>
      <div><strong>{counts.active}</strong><span>Working now</span></div>
      <div><strong>{counts.complete}</strong><span>Completed</span></div>
    </div>
    <div className="missions-board">
      <div className="missions-left">
        <section className="mission-create">
          <div className="mission-panel-head"><Sparkles size={17} /> <strong>New mission</strong></div>
          <label className="mission-label" htmlFor="mission-goal">What should Astra work on?</label>
          <textarea id="mission-goal" value={goal} maxLength={1500}
            onChange={e => setGoal(e.target.value)}
            placeholder="Investigate an idea, compare solutions, produce an actionable report..." />
          <label className="mission-label" htmlFor="mission-autonomy">Execution style</label>
          <div className="mission-choice-row">
            {(['assist','supervised','autopilot'] as Autonomy[]).map(a =>
              <button type="button" key={a} className={autonomy === a ? 'chosen' : ''} onClick={() => setAutonomy(a)}>{a === 'assist' ? 'Manual' : a === 'supervised' ? 'Review' : 'Auto'}</button>)}
          </div>
          <p className="mission-mode-note">{modeNotes[autonomy]}</p>
          <button type="button" className="mission-primary" disabled={goal.trim().length < 8 || live || !hydrated || capabilities?.ai !== true}
            onClick={() => void plan()}><Plus size={17} /> Create AI mission <ArrowRight size={16} /></button>
          <p className="mission-tiny"><ShieldCheck size={13} /> No external account actions. AI calls use Lovable credits. Research requires a separate search API key.</p>
          {!missions.length && <div className="mission-starters"><span>START WITH A GOAL</span>
            {STARTERS.map(s => <button key={s} type="button" onClick={() => setGoal(s)}>{s}<ChevronRight size={14}/></button>)}
          </div>}
        </section>
        <section className="mission-history">
          <div className="mission-panel-head"><Clock3 size={16} /> <strong>Mission history</strong></div>
          {missions.length ? missions.map(m => <button type="button" key={m.id}
            className={`mission-history-item ${selected?.id === m.id ? 'selected' : ''}`}
            onClick={() => setSelectedId(m.id)}>
            <span className={`mission-dot status-${m.status}`} />
            <span className="mission-history-copy"><strong>{m.goal}</strong><small>{m.status} · {new Date(m.createdAt).toLocaleDateString()}</small></span>
            <ChevronRight size={15}/>
          </button>) : <p className="mission-empty">Your missions will appear here.</p>}
        </section>
      </div>
      <section className="mission-details">
        {!selected ? <div className="mission-placeholder"><Layers3 size={30} /><h2>No mission selected</h2><p>Start with a goal to see a real execution timeline here.</p></div> :
          <>
            <div className="mission-detail-top">
              <span className={`mission-status-badge status-${selected.status}`}>{selected.status === 'complete' ? 'Completed' : selected.status === 'running' ? 'Executing' : selected.status === 'planning' ? 'Planning' : selected.status === 'paused' ? 'Paused' : selected.status === 'failed' ? 'Needs attention' : 'Ready'}</span>
              <button className="mission-trash" type="button" aria-label="Delete mission" disabled={selected.status === 'running' || selected.status === 'planning'}
                onClick={() => deleteMission(selected.id)}><Trash2 size={17}/></button>
            </div>
            <h2>{selected.goal}</h2>
            <div className="mission-meta"><span><Sparkles size={13}/>{getModel(selected.model).name}</span><span><ShieldCheck size={13}/>{selected.autonomy}</span></div>
            {selected.status === 'planning' && <div className="mission-working"><LoaderCircle size={17} className="spin"/> Building a plan with Lovable AI...</div>}
            {selected.steps.length > 0 && <div className="mission-step-list">{selected.steps.map((step,index) =>
              <article className={`mission-step state-${step.status}`} key={step.id}>
                <div className="mission-step-marker">{step.status === 'completed' ? <CheckCircle2 size={18}/> : step.status === 'running' ? <LoaderCircle size={18} className="spin"/> : <span>{index+1}</span>}</div>
                <div className="mission-step-content"><div className="mission-step-top"><strong>{step.title}</strong><span>{stageLabel(step.kind)}</span></div>
                  {step.output && <div className="mission-step-output">{step.output}</div>}
                  {!!step.sources?.length && <div className="mission-sources"><span>LIVE SOURCES</span>{step.sources.map(source =>
                    <a key={source.id} href={source.url} target="_blank" rel="noopener noreferrer"><Globe2 size={13}/>{source.title}<ExternalLink size={12}/></a>)}</div>}
                  {step.status === 'running' && <p className="mission-running-label">Working on this step...</p>}
                </div>
              </article>)}</div>}
            {selected.error && <div className="mission-alert"><TriangleAlert size={17}/>{selected.error}</div>}
            {selected.status === 'complete' && <div className="mission-done"><CheckCircle2 size={17}/> Mission complete. Results above reflect actual model/search executions.</div>}
            {(selected.status === 'ready' || selected.status === 'paused' || selected.status === 'failed') && selected.steps.length > 0 &&
              <button type="button" className="mission-primary" disabled={live}
                onClick={() => void run(selected.id)}><Play size={16}/>{selected.status === 'ready' ? 'Start mission' : selected.autonomy === 'autopilot' ? 'Resume mission' : 'Approve next step'}<ArrowRight size={16}/></button>}
            {selected.status === 'running' && <button type="button" className="mission-pause" onClick={pause}><Pause size={17}/> Pause mission</button>}
          </>
        }
      </section>
    </div>
    {error && <div role="alert" className="mission-alert"><TriangleAlert size={16}/>{error}</div>}
    <div className="mission-footer-note"><ShieldCheck size={15}/>
      <span>Execution currently runs while this tab remains open. Progress is saved on this device and can be resumed after interruptions. Server-side background jobs, app connectors, and notifications are not enabled.</span>
    </div>
  </div>;
}
