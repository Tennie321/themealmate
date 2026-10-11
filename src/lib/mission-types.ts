import type { ModelId } from './models';
import type { ResearchSource } from './research-types';
export type MissionStepKind = 'analyze' | 'research' | 'verify';
export type MissionStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'blocked';
export type MissionStatus = 'planning' | 'ready' | 'running' | 'paused' | 'complete' | 'failed';
export type Autonomy = 'assist' | 'supervised' | 'autopilot';
export type MissionStep = {
  id: string;
  title: string;
  kind: MissionStepKind;
  status: MissionStepStatus;
  output: string;
  startedAt?: number;
  finishedAt?: number;
  sources?: ResearchSource[];
};
export type Mission = {
  id: string;
  goal: string;
  model: ModelId;
  autonomy: Autonomy;
  status: MissionStatus;
  steps: MissionStep[];
  createdAt: number;
  updatedAt: number;
  finalResult?: string;
  error?: string;
};
export const MISSION_STORAGE_KEY = 'astra.missions.v1';
export function recoverMission(mission: Mission): Mission {
  const interrupted = mission.status === 'running' || mission.status === 'planning';
  return {
    ...mission,
    status: interrupted ? 'paused' : mission.status,
    steps: mission.steps.map(step =>
      step.status === 'running' ? { ...step, status: 'pending' as const, output: '' } : step,
    ),
  };
}
export function loadMissions(): Mission[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(MISSION_STORAGE_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw.filter((entry): entry is Mission =>
      !!entry && typeof entry.id === 'string' && typeof entry.goal === 'string' &&
      Array.isArray(entry.steps) && entry.goal.length <= 2000,
    ).slice(0, 50).map(recoverMission);
  } catch { return []; }
}
export function persistMissions(missions: Mission[]): boolean {
  try {
    localStorage.setItem(MISSION_STORAGE_KEY, JSON.stringify(missions.slice(0, 50)));
    return true;
  } catch { return false; }
}
