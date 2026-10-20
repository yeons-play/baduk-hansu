// 기기 안 저장 — 같은 주소의 다른 앱과 섞이지 않도록 모든 키에 baduk- 접두어
import type { Level } from './engine/ai/beginner';
import type { GameMode } from './engine/rules';

const KEY_GAME = 'baduk-current-game';
const KEY_STATS = 'baduk-stats';
const KEY_SEEN_RULES = 'baduk-seen-capture-rules';

export interface SavedGame {
  v: 1;
  mode: GameMode;
  size: number;
  level: Level;
  captureTarget: number;
  /** 착수 좌표, 패스는 -1 */
  moves: number[];
  savedAt: string;
}

export interface Stats {
  v: 1;
  games: number;
  wins: number;
  losses: number;
  draws: number;
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 저장 공간이 막혀 있어도 앱은 계속 동작 */
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* 무시 */
  }
}

export const loadGame = () => read<SavedGame>(KEY_GAME);
export const saveGame = (g: SavedGame) => write(KEY_GAME, g);
export const clearGame = () => remove(KEY_GAME);

export function loadStats(): Stats {
  return read<Stats>(KEY_STATS) ?? { v: 1, games: 0, wins: 0, losses: 0, draws: 0 };
}
export function recordResult(outcome: 'win' | 'loss' | 'draw'): Stats {
  const s = loadStats();
  s.games++;
  if (outcome === 'win') s.wins++;
  else if (outcome === 'loss') s.losses++;
  else s.draws++;
  write(KEY_STATS, s);
  return s;
}

export const hasSeenRules = () => read<boolean>(KEY_SEEN_RULES) === true;
export const markRulesSeen = () => write(KEY_SEEN_RULES, true);

/** 브라우저가 저장 공간을 임의로 비우지 않도록 요청 */
export function requestPersistence(): void {
  try {
    navigator.storage?.persist?.().catch(() => {});
  } catch {
    /* 무시 */
  }
}

// ───────── 설정 ─────────
const KEY_SETTINGS = 'baduk-settings';

export interface Settings {
  v: 1;
  /** 돌 놓는 소리 등 효과음 */
  sound: boolean;
  /** 안내 문장 읽어 주기 */
  voice: boolean;
  /** 읽어 주기 빠르기 */
  rate: 'slow' | 'normal';
}

export function loadSettings(): Settings {
  return { v: 1, sound: true, voice: true, rate: 'normal', ...(read<Partial<Settings>>(KEY_SETTINGS) ?? {}) } as Settings;
}
export function saveSettings(s: Settings): void {
  write(KEY_SETTINGS, s);
}

// ───────── 강의 진도 ─────────
const KEY_LESSONS = 'baduk-lessons';

export interface LessonProgress {
  v: 1;
  /** 끝낸 강 번호 */
  done: number[];
}

export function loadLessons(): LessonProgress {
  const p = read<LessonProgress>(KEY_LESSONS);
  return p && Array.isArray(p.done) ? p : { v: 1, done: [] };
}
export function markLessonDone(id: number): LessonProgress {
  const p = loadLessons();
  if (!p.done.includes(id)) p.done.push(id);
  write(KEY_LESSONS, p);
  return p;
}

/** 강의 진도를 처음부터(전적·설정은 그대로) */
export function resetLessons(): void {
  remove(KEY_LESSONS);
}

// ───────── 백업 ─────────
// baduk- 로 시작하는 저장값만 묶어서 JSON으로 내보내고 불러온다.
const BACKUP_APP = 'baduk-hansu';

export interface Backup {
  app: typeof BACKUP_APP;
  v: 1;
  exportedAt: string;
  data: Record<string, string>;
}

export function exportBackup(now = new Date()): Backup {
  const data: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith('baduk-')) continue;
      const v = localStorage.getItem(k);
      if (v != null) data[k] = v;
    }
  } catch {
    /* 저장 공간을 못 읽으면 빈 백업 */
  }
  return { app: BACKUP_APP, v: 1, exportedAt: now.toISOString(), data };
}

/** 백업 글을 검사해 되살린다. 형식이 맞지 않으면 아무것도 바꾸지 않고 false */
export function importBackup(text: string): boolean {
  let b: Backup;
  try {
    b = JSON.parse(text) as Backup;
  } catch {
    return false;
  }
  if (!b || b.app !== BACKUP_APP || b.v !== 1 || typeof b.data !== 'object' || b.data === null) return false;
  const entries = Object.entries(b.data);
  if (!entries.every(([k, v]) => k.startsWith('baduk-') && typeof v === 'string')) return false;
  for (const [, v] of entries) {
    try {
      JSON.parse(v);
    } catch {
      return false;
    }
  }
  try {
    for (const [k, v] of entries) localStorage.setItem(k, v);
  } catch {
    return false;
  }
  return true;
}
