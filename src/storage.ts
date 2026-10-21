// 기기 안 저장 — 같은 주소의 다른 앱과 섞이지 않도록 모든 키에 baduk- 접두어
import type { Level } from './engine/ai/beginner';
import type { GameMode } from './engine/rules';

const KEY_GAME = 'baduk-current-game';
const KEY_STATS = 'baduk-stats';
const KEY_SEEN_RULES = 'baduk-seen-capture-rules';

/** 빈 판이 아닌 배치에서 시작한 판(출발 판 놀이)의 처음 모습. 없으면 빈 판에서 시작 */
export interface GameSetup {
  /** 교차점별 0 빈 곳, 1 흑, 2 백 */
  board: number[];
  toMove: 1 | 2;
}

export interface SavedGame {
  v: 1;
  setup?: GameSetup;
  mode: GameMode;
  size: number;
  level: Level;
  captureTarget: number;
  /** 착수 좌표, 패스는 -1 */
  moves: number[];
  /** 둘 다 넘겨 집 세기 화면에 있을 때: 고른 죽은 돌(앱을 닫았다 열어도 그대로) */
  dead?: number[];
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

const KEY_SEEN_NORMAL_RULES = 'baduk-seen-normal-rules';
/** 대국 방법 안내를 본 적 있는지(따내기 바둑·진짜 바둑 따로) */
export const hasSeenRules = (mode: GameMode = 'capture') =>
  read<boolean>(mode === 'normal' ? KEY_SEEN_NORMAL_RULES : KEY_SEEN_RULES) === true;
export const markRulesSeen = (mode: GameMode = 'capture') =>
  write(mode === 'normal' ? KEY_SEEN_NORMAL_RULES : KEY_SEEN_RULES, true);

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

// ───────── 끝난 판 기록(복습용) ─────────
const KEY_HISTORY = 'baduk-history';
/** 기기에 남겨 두는 끝난 판 수 */
export const HISTORY_MAX = 20;

export interface FinishedGame {
  v: 1;
  /** 고유 번호(끝난 시각 밀리초) */
  id: number;
  /** 출발 판 놀이였으면 처음 배치(복습은 여기서부터 다시 둔다) */
  setup?: GameSetup;
  /** 잘한 수: 잡기·도망가기 횟수(나중에 홈 추천에 씀) */
  good?: { capture: number; escape: number };
  /** 놓친 장면 종류별 횟수 */
  missed?: Record<string, number>;
  mode: GameMode;
  size: number;
  level: Level;
  captureTarget: number;
  /** 착수 좌표, 패스는 -1 (기권은 결과에만) */
  moves: number[];
  outcome: 'win' | 'loss' | 'draw';
  /** 어떻게 끝났나: capture 먼저 잡음, score 집 세기, resign 기권, no-capture 둘 다 넘김 */
  reason: string;
  /** 결과 한 줄(예: '까망이 45점, 하양이 38점') */
  summary: string;
  endedAt: string;
}

export function loadHistory(): FinishedGame[] {
  const h = read<FinishedGame[]>(KEY_HISTORY);
  return Array.isArray(h) ? h.filter((g) => g && g.v === 1 && Array.isArray(g.moves)) : [];
}
/** 새 판을 맨 앞에 넣고 오래된 판은 지운다 */
export function addHistory(g: FinishedGame): void {
  write(KEY_HISTORY, [g, ...loadHistory().filter((h) => h.id !== g.id)].slice(0, HISTORY_MAX));
}

// ───────── 지난 판에서 놓친 장면(내 문제) ─────────
const KEY_SCENES = 'baduk-scenes';
/** 남겨 두는 장면 수(새것부터) */
export const SCENES_MAX = 30;

/** 놓친 장면을 문제로 바꿔 둔 것. 좌표는 문제 판(잘라 낸 판일 수 있음) 기준 [가로, 세로] */
export interface SavedScene {
  v: 1;
  /** `${판 번호}-${몇 번째 수}` */
  id: string;
  gameId: number;
  kind: 'capture' | 'escape';
  size: number;
  b: [number, number][];
  w: [number, number][];
  /** escape: 살릴 까망이 돌 하나 */
  libsOf?: [number, number];
}

export function loadScenes(): SavedScene[] {
  const s = read<SavedScene[]>(KEY_SCENES);
  return Array.isArray(s)
    ? s.filter((x) => x && x.v === 1 && typeof x.id === 'string' && Array.isArray(x.b) && Array.isArray(x.w) && typeof x.size === 'number')
    : [];
}
/** 새 장면을 앞에 넣는다(같은 번호는 하나만) */
export function addScenes(list: SavedScene[]): void {
  if (!list.length) return;
  const ids = new Set(list.map((s) => s.id));
  write(KEY_SCENES, [...list, ...loadScenes().filter((s) => !ids.has(s.id))].slice(0, SCENES_MAX));
}
/** 한 번에 맞힌 장면은 목록에서 뺀다 */
export function removeScene(id: string): void {
  write(KEY_SCENES, loadScenes().filter((s) => s.id !== id));
}

// ───────── 연습 문제 ─────────
const KEY_PRACTICE = 'baduk-practice';

export interface PracticeProgress {
  v: 1;
  /** 기술별로 끝까지 푼 판 수 */
  done: Record<string, number>;
}

export function loadPractice(): PracticeProgress {
  const p = read<PracticeProgress>(KEY_PRACTICE);
  return p && p.done && typeof p.done === 'object' ? p : { v: 1, done: {} };
}
export function markPracticeDone(skill: string): PracticeProgress {
  const p = loadPractice();
  p.done[skill] = (p.done[skill] ?? 0) + 1;
  write(KEY_PRACTICE, p);
  return p;
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
