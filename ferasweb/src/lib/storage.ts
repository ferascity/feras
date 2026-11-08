export type AgentPreset = 'Stockfish' | 'Maia' | 'Custom';

export interface AgentDraft {
  id: string;
  name: string;
  preset: AgentPreset;
  opening: string;
  aggression: number;
  createdAt: string;
}

const STORAGE_KEY = 'ferasweb.agent-drafts.v1';
const PRESETS: AgentPreset[] = ['Stockfish', 'Maia', 'Custom'];

function isDraft(value: unknown): value is AgentDraft {
  if (typeof value !== 'object' || value === null) return false;
  const raw = value as Record<string, unknown>;
  return (
    typeof raw.id === 'string' &&
    typeof raw.name === 'string' &&
    raw.name.trim().length > 0 &&
    typeof raw.preset === 'string' &&
    PRESETS.includes(raw.preset as AgentPreset) &&
    typeof raw.opening === 'string' &&
    typeof raw.aggression === 'number' &&
    Number.isFinite(raw.aggression) &&
    typeof raw.createdAt === 'string'
  );
}

export function readAgentDrafts(): AgentDraft[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isDraft).map((draft) => ({
      ...draft,
      aggression: Math.min(5, Math.max(1, Math.round(draft.aggression))),
    }));
  } catch {
    return [];
  }
}

export function writeAgentDrafts(drafts: AgentDraft[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
  } catch {
    // Storage may be unavailable in private browsing; drafts stay in memory.
  }
}

export function createDraftId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `draft-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}
