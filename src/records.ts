// 기록 남기기와 보호자 요약 — '실력이 느는지, 도움을 얼마나 쓰는지'를 숫자로 보게 한다.
// 저장은 storage.ts가 맡고, 여기서는 한 줄 기록 만들기·처음 채우기·기간별 요약(순수 계산)만 한다.
// 요약은 기록을 그대로 센다. '최선수'나 AI가 짐작한 승률 같은 분석은 하지 않는다(KataGo 미연결).
import type { Level } from './engine/ai/beginner';
import { analyzeGame } from './engine/ai/review';
import { BLACK, type GameMode } from './engine/rules';
import type { Step } from './lessons/data';
import {
  addPracticeResult,
  dayKey,
  hasGameLog,
  loadHistory,
  saveGameLog,
  type FinishedGame,
  type GameLogEntry,
  type PracticeLog,
} from './storage';

/** 다시 보기 기록 한 판 → 한 줄 기록. 잘한 수·놓친 장면을 남기기 전의 옛 기록은 처음부터 다시 두어 채운다 */
export function entryFromHistory(h: FinishedGame): GameLogEntry {
  let good = h.good;
  let missed = h.missed;
  if (!good || !missed) {
    try {
      const an = analyzeGame(
        { mode: h.mode, size: h.size, captureTarget: h.captureTarget, moves: h.moves, ...(h.setup ? { setup: h.setup } : {}) },
        BLACK,
      );
      good = { capture: 0, escape: 0 };
      for (const x of an.good) good[x.kind]++;
      missed = {};
      for (const m of an.mistakes) missed[m.kind] = (missed[m.kind] ?? 0) + 1;
    } catch {
      good = undefined; // 망가진 기록은 비워 둔다
      missed = undefined;
    }
  }
  // 집 세기로 끝난 판의 점수는 결과 한 줄('까망이 45점 · 하양이 38점')에만 남아 있다(이름 바꾸기 전 글로 저장됨)
  const sc = h.reason === 'score' ? /까망이 (\d+)점 · 하양이 (\d+)점/.exec(h.summary ?? '') : null;
  return {
    v: 1,
    id: h.id,
    endedAt: h.endedAt,
    mode: h.mode,
    size: h.size,
    level: h.level,
    captureTarget: h.captureTarget,
    outcome: h.outcome,
    reason: h.reason,
    moves: h.moves.length,
    ...(typeof h.hints === 'number' ? { hints: h.hints } : {}),
    ...(typeof h.undos === 'number' ? { undos: h.undos } : {}),
    ...(good && missed ? { good, missed } : {}),
    ...(sc ? { margin: Number(sc[1]) - Number(sc[2]) } : {}),
    ...(h.setup ? { setup: true } : {}),
  };
}

/** 한 줄 기록이 아직 없으면, 남아 있는 다시 보기 기록(최근 20판)으로 처음 한 번 채운다 */
export function ensureGameLog(): void {
  if (hasGameLog()) return;
  saveGameLog(loadHistory().map(entryFromHistory));
}

/** 연습 문제 하나가 어느 기술인지(요약에서 묶는 이름). 지난 판의 놓친 장면 문제는 'scene' */
export function practiceSkillOf(step: Step): string | null {
  if (step.sceneId) return 'scene';
  if (step.kind === 'find') return 'find';
  if (step.kind === 'move' && (step.goal === 'capture' || step.goal === 'escape' || step.goal === 'live' || step.goal === 'kill')) {
    return step.goal;
  }
  return null;
}

/** 연습 문제를 하나 풀 때마다 남긴다(한 번에 맞혔는지까지) */
export function logPractice(step: Step, firstTry: boolean, now = new Date()): void {
  const skill = practiceSkillOf(step);
  if (skill) addPracticeResult(skill, firstTry, now);
}

// ───────── 기간별 요약 ─────────

export interface GroupStat {
  mode: GameMode;
  size: number;
  level: Level;
  /** 따내기 바둑의 먼저 잡을 돌 수(진짜 바둑은 0) */
  captureTarget: number;
  games: number;
  wins: number;
  losses: number;
  draws: number;
}

export interface Summary {
  /** 기간 안에 끝난 판 수 */
  games: number;
  /** 놀이·판 크기·하양이 단계(따내기 바둑은 잡을 돌 수까지)별, 많이 둔 것부터 */
  groups: GroupStat[];
  /** 이긴 판 가운데 하양이 기권, 진 판 가운데 까망이 그만하기 */
  aiResigned: number;
  quit: number;
  /** 도와줘·되돌리기를 센 판 수와 합계(센 판만 나눈다) */
  help: { games: number; hints: number; undos: number };
  /** 잘한 수·놓친 장면을 센 판 수와 합계 */
  play: { games: number; capture: number; escape: number; missed: Record<string, number> };
  /** 문제 놀이: 기술별 [푼 문제 수, 한 번에 맞힌 수] */
  practice: Record<string, [number, number]>;
  /** 기간 안에 처음 끝낸 강 */
  lessons: number[];
}

/** 기간의 첫날 자정(이 기기 시간). days가 null이면 처음부터(null) */
export function rangeStart(now: Date, days: number | null): Date | null {
  return days == null ? null : new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1));
}

/** 오늘을 포함한 최근 days일(null이면 전체)의 기록을 센다 */
export function summarize(
  log: GameLogEntry[],
  practice: PracticeLog,
  lessonAt: Record<string, string> | undefined,
  now: Date,
  days: number | null,
): Summary {
  const start = rangeStart(now, days);
  const t0 = start ? start.getTime() : -Infinity;
  const day0 = start ? dayKey(start) : '';
  const s: Summary = {
    games: 0,
    groups: [],
    aiResigned: 0,
    quit: 0,
    help: { games: 0, hints: 0, undos: 0 },
    play: { games: 0, capture: 0, escape: 0, missed: {} },
    practice: {},
    lessons: [],
  };
  const groups = new Map<string, GroupStat>();
  for (const e of log) {
    const t = Date.parse(e.endedAt);
    if (!(t >= t0)) continue; // 기간 밖, 또는 날짜가 망가진 기록
    s.games++;
    const target = e.mode === 'capture' ? e.captureTarget : 0;
    const key = `${e.mode}|${e.size}|${e.level}|${target}`;
    let g = groups.get(key);
    if (!g) {
      g = { mode: e.mode, size: e.size, level: e.level, captureTarget: target, games: 0, wins: 0, losses: 0, draws: 0 };
      groups.set(key, g);
    }
    g.games++;
    if (e.outcome === 'win') g.wins++;
    else if (e.outcome === 'loss') g.losses++;
    else g.draws++;
    if (e.reason === 'resign') {
      if (e.outcome === 'win') s.aiResigned++;
      else if (e.outcome === 'loss') s.quit++;
    }
    if (typeof e.hints === 'number' && typeof e.undos === 'number') {
      s.help.games++;
      s.help.hints += e.hints;
      s.help.undos += e.undos;
    }
    if (e.good && e.missed) {
      s.play.games++;
      s.play.capture += e.good.capture ?? 0;
      s.play.escape += e.good.escape ?? 0;
      for (const [k, n] of Object.entries(e.missed)) if (typeof n === 'number') s.play.missed[k] = (s.play.missed[k] ?? 0) + n;
    }
  }
  s.groups = [...groups.values()].sort((a, b) => b.games - a.games || b.size - a.size || a.level - b.level);
  for (const [d, skills] of Object.entries(practice)) {
    if (d < day0 || !skills || typeof skills !== 'object') continue;
    for (const [k, v] of Object.entries(skills)) {
      if (!Array.isArray(v) || typeof v[0] !== 'number' || typeof v[1] !== 'number') continue;
      const cur = s.practice[k] ?? [0, 0];
      s.practice[k] = [cur[0] + v[0], cur[1] + v[1]];
    }
  }
  for (const [id, at] of Object.entries(lessonAt ?? {})) {
    const n = Number(id);
    if (Number.isInteger(n) && Date.parse(at) >= t0) s.lessons.push(n);
  }
  s.lessons.sort((a, b) => a - b);
  return s;
}
