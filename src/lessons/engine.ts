// 강의 단계를 규칙 엔진 위에서 해석한다. 정답은 모두 엔진이 계산.
import { BLACK, WHITE, Game, opponent, toPoint, type Stone } from '../engine/rules';
import type { MoveGoal, Setup, Step, XY } from './data';

export const SIZE = 9;
export const pt = ([x, y]: XY): number => toPoint(SIZE, x, y);

/**
 * 배치로 판을 만든다. toMove를 주지 않으면 돌 수로 차례를 정한다(흑이 먼저 두므로, 흑·백 수가 같으면 흑 차례).
 * 흑돌이가 직접 놓아 보는 단계는 돌 수와 상관없이 흑 차례로 만든다.
 */
export function buildGame(setup: Setup = {}, extraBlack: number[] = [], toMove?: Stone): Game {
  const board = new Uint8Array(SIZE * SIZE);
  for (const xy of setup.b ?? []) board[pt(xy)] = BLACK;
  for (const xy of setup.w ?? []) board[pt(xy)] = WHITE;
  for (const p of extraBlack) board[p] = BLACK;
  const blacks = board.filter((c) => c === BLACK).length;
  const whites = board.filter((c) => c === WHITE).length;
  const turn: Stone = toMove ?? (blacks > whites ? WHITE : BLACK);
  return new Game({ size: SIZE, mode: 'capture', captureTarget: 99 }, { board, toMove: turn });
}

export interface Resolved {
  game: Game;
  /** 눌러야 하는 점 (tap·liberties·move), find에서는 찾아야 하는 돌 전부 */
  targets: number[];
  /** find: 찾아야 하는 돌 무리(무리 하나를 누르면 그 무리 전체를 찾은 것) */
  groups: number[][];
  /** 정답 번호 (choice) */
  answer: number;
  /** 숨구멍 수 (libsOf가 있을 때) */
  libs: number | null;
  /** 동그라미로 보여줄 점 */
  rings: number[];
}

/** 흑돌이가 직접 놓는 단계인지 (흑 차례로 판을 만든다) */
function blackPlays(step: Step): boolean {
  return step.kind === 'move' || step.kind === 'find' || (step.kind === 'choice' && step.answer === 'legal');
}

/**
 * 지금 차례(흑)가 p에 두면 goal을 이루는지 엔진으로 시험한다. 판은 원래대로 되돌린다.
 * 불법인 수는 false.
 */
export function meetsGoal(game: Game, p: number, goal: MoveGoal, libsOf: number | null): boolean {
  const me = game.toMove;
  const r = game.play(p);
  if (!r.ok) return false;
  try {
    if (goal === 'capture') return r.captured.length > 0;
    if (goal === 'escape') return libsOf != null && game.at(libsOf) === me && game.group(libsOf).liberties.length >= 2;
    // atari: 둔 돌 옆의 상대 무리 가운데 숨구멍이 딱 하나 남은 것이 있음
    const opp = opponent(me);
    return game.geo.neighbors[p].some((q) => game.at(q) === opp && game.group(q).liberties.length === 1);
  } finally {
    game.undo();
  }
}

/** 숨구멍이 하나 남은 color 돌 무리들 */
export function atariGroupsOf(game: Game, color: Stone): number[][] {
  const seen = new Set<number>();
  const out: number[][] = [];
  for (let p = 0; p < game.geo.n; p++) {
    if (seen.has(p) || game.at(p) !== color) continue;
    const g = game.group(p);
    g.stones.forEach((s) => seen.add(s));
    if (g.liberties.length === 1) out.push(g.stones);
  }
  return out;
}

export function resolve(step: Step): Resolved {
  const game = buildGame(step.setup, [], blackPlays(step) ? BLACK : undefined);
  const libsList = step.libsOf ? game.group(pt(step.libsOf)).liberties : null;
  const libs = libsList ? libsList.length : null;
  let targets: number[] = [];
  let groups: number[][] = [];
  if (step.kind === 'tap') targets = step.targets.map(pt);
  if (step.kind === 'liberties') targets = libsList ?? [];
  if (step.kind === 'move') {
    const lo = step.libsOf ? pt(step.libsOf) : null;
    for (let p = 0; p < game.geo.n; p++) if (meetsGoal(game, p, step.goal, lo)) targets.push(p);
  }
  if (step.kind === 'find') {
    groups = atariGroupsOf(game, WHITE);
    targets = groups.flat();
  }
  let answer = -1;
  if (step.kind === 'choice') {
    if (step.answer === 'libs') answer = step.options.findIndex((o) => parseInt(o, 10) === libs);
    else if (step.answer === 'turn') answer = game.toMove === BLACK ? 0 : 1;
    else if (step.answer === 'legal') answer = step.probe && game.isLegal(pt(step.probe)) ? 0 : 1;
    else answer = step.answer;
  }
  const rings = [
    ...(step.rings ?? []).map(pt),
    ...(step.probe ? [pt(step.probe)] : []),
    ...(step.showLibs && libsList ? libsList : []),
  ];
  return { game, targets, groups, answer, libs, rings };
}

/** {libs} 자리표시를 엔진 값으로 바꾼다 */
export function fill(text: string, r: Resolved): string {
  return text.replace(/\{libs\}/g, String(r.libs ?? ''));
}
