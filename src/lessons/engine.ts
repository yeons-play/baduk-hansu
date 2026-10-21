// 강의 단계를 규칙 엔진 위에서 해석한다. 정답은 모두 엔진이 계산.
import { BLACK, EMPTY, WHITE, Game, opponent, toPoint, type AreaScore, type Stone } from '../engine/rules';
import type { MoveGoal, Setup, Step, XY } from './data';
import { vitalPoints } from './life';

/** 강의 바둑판 기본 크기 */
export const SIZE = 9;
export const pt = ([x, y]: XY, size = SIZE): number => toPoint(size, x, y);

/**
 * 배치로 판을 만든다.
 * - toMove를 주지 않으면 돌 수로 차례를 정한다(흑이 먼저 두므로, 흑·백 수가 같으면 흑 차례).
 * - setup.moves가 있으면 흑부터 번갈아 그 수들을 엔진으로 둔다(되따기 금지 같은 '이전 판' 기억이 필요할 때).
 */
export function buildGame(setup: Setup = {}, extraBlack: number[] = [], toMove?: Stone, size = SIZE): Game {
  const board = new Uint8Array(size * size);
  for (const xy of setup.b ?? []) board[pt(xy, size)] = BLACK;
  for (const xy of setup.w ?? []) board[pt(xy, size)] = WHITE;
  for (const p of extraBlack) board[p] = BLACK;
  const blacks = board.filter((c) => c === BLACK).length;
  const whites = board.filter((c) => c === WHITE).length;
  const first: Stone = setup.moves?.length ? BLACK : (toMove ?? (blacks > whites ? WHITE : BLACK));
  const game = new Game({ size, mode: 'capture', captureTarget: 99 }, { board, toMove: first });
  for (const xy of setup.moves ?? []) {
    const r = game.play(pt(xy, size));
    if (!r.ok) throw new Error(`강의 배치의 수를 둘 수 없음: ${xy} (${r.reason})`);
  }
  return game;
}

export interface Resolved {
  game: Game;
  /** 눌러야 하는 점 (tap·liberties·move·territory), find에서는 찾아야 하는 돌 전부 */
  targets: number[];
  /** find: 찾아야 하는 돌 무리(무리 하나를 누르면 그 무리 전체를 찾은 것) */
  groups: number[][];
  /** 정답 번호 (choice) */
  answer: number;
  /** 숨구멍 수 (libsOf가 있을 때) */
  libs: number | null;
  /** 면적 계가(집·돌 세기) */
  score: AreaScore;
  /** 동그라미로 보여줄 점 */
  rings: number[];
  /** '아니에요' 엑스로 보여줄 점(이 강의 판 크기로 바꾼 것) */
  crosses: number[];
}

/** 이 단계에서 누구 차례로 판을 만들지 */
function turnOf(step: Step): Stone | undefined {
  if (step.as === 'w') return WHITE;
  if (step.kind === 'move' || step.kind === 'find' || (step.kind === 'choice' && step.answer === 'legal')) return BLACK;
  return undefined;
}

/**
 * 지금 차례(흑)가 p에 두면 goal을 이루는지 엔진으로 시험한다. 판은 원래대로 되돌린다.
 * 불법인 수는 false. (cut은 resolve에서 따로 계산)
 */
export function meetsGoal(game: Game, p: number, goal: MoveGoal, libsOf: number | null, join: number | null = null): boolean {
  const me = game.toMove;
  const r = game.play(p);
  if (!r.ok) return false;
  try {
    if (goal === 'capture') return r.captured.length > 0;
    if (goal === 'escape') return libsOf != null && game.at(libsOf) === me && game.group(libsOf).liberties.length >= 2;
    if (goal === 'connect') return libsOf != null && join != null && game.group(libsOf).stones.includes(join);
    if (goal === 'live') {
      // 숨구멍이 2개 이상이고, 상대가 그 어느 숨구멍에도 놓을 수 없음(눈 두 개)
      if (libsOf == null || game.at(libsOf) !== me) return false;
      const libs = game.group(libsOf).liberties;
      return libs.length >= 2 && libs.every((q) => !game.isLegal(q));
    }
    if (goal === 'atari') {
      const opp = opponent(me);
      return game.geo.neighbors[p].some((q) => game.at(q) === opp && game.group(q).liberties.length === 1);
    }
    return false;
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

/** 하양이가 한 수로 a·b 두 돌 무리를 이을 수 있는 점 = 까망이가 끊는 자리 */
function cutPoints(step: Step, size: number, a: number, b: number): number[] {
  const w = buildGame(step.setup, [], WHITE, size);
  const out: number[] = [];
  for (let p = 0; p < w.geo.n; p++) {
    if (w.at(p) !== EMPTY) continue;
    const r = w.play(p);
    if (!r.ok) continue;
    if (w.group(a).stones.includes(b)) out.push(p);
    w.undo();
  }
  return out;
}

export function resolve(step: Step, size = SIZE): Resolved {
  const P = (xy: XY) => pt(xy, size);
  const game = buildGame(step.setup, [], turnOf(step), size);
  const libsList = step.libsOf ? game.group(P(step.libsOf)).liberties : null;
  const libs = libsList ? libsList.length : null;
  const score = game.score();
  let targets: number[] = [];
  let groups: number[][] = [];
  if (step.kind === 'tap') targets = step.targets.map(P);
  if (step.kind === 'liberties') targets = libsList ?? [];
  if (step.kind === 'move') {
    if (step.goal === 'cut') {
      if (!step.cut) throw new Error('cut 단계에는 cut 두 점이 필요');
      targets = cutPoints(step, size, P(step.cut[0]), P(step.cut[1])).filter((p) => game.isLegal(p));
    } else if (step.region && (step.goal === 'live' || step.goal === 'kill')) {
      if (!step.libsOf) throw new Error('사활 단계에는 libsOf(무리의 돌 하나)가 필요');
      targets = vitalPoints(game, P(step.libsOf), step.region.map(P), step.goal);
    } else {
      const lo = step.libsOf ? P(step.libsOf) : null;
      const jo = step.join ? P(step.join) : null;
      for (let p = 0; p < game.geo.n; p++) if (meetsGoal(game, p, step.goal, lo, jo)) targets.push(p);
    }
  }
  if (step.kind === 'find') {
    groups = atariGroupsOf(game, WHITE);
    targets = groups.flat();
  }
  if (step.kind === 'territory') {
    for (let p = 0; p < game.geo.n; p++) if (game.at(p) === EMPTY && score.owner[p] === BLACK) targets.push(p);
  }
  let answer = -1;
  if (step.kind === 'choice') {
    const num = (n: number | null) => step.options.findIndex((o) => parseInt(o, 10) === n);
    if (step.answer === 'libs') answer = num(libs);
    else if (step.answer === 'area') answer = num(score.blackArea);
    else if (step.answer === 'total') answer = num(score.blackStones + score.blackArea);
    else if (step.answer === 'more') answer = score.blackArea > score.whiteArea ? 0 : score.blackArea < score.whiteArea ? 1 : -1;
    else if (step.answer === 'turn') answer = game.toMove === BLACK ? 0 : 1;
    else if (step.answer === 'legal') answer = step.probe && game.isLegal(P(step.probe)) ? 0 : 1;
    else answer = step.answer;
  }
  const rings = [
    ...(step.rings ?? []).map(P),
    ...(step.probe ? [P(step.probe)] : []),
    ...(step.showLibs && libsList ? libsList : []),
  ];
  return { game, targets, groups, answer, libs, score, rings, crosses: (step.crosses ?? []).map(P) };
}

/** 자리표시를 엔진 값으로 바꾼다: {libs} 숨구멍, {area}·{warea} 까망이·하양이 집, {stones} 까망이 돌, {total} 까망이 돌+집 */
export function fill(text: string, r: Resolved): string {
  const s = r.score;
  return text
    .replace(/\{libs\}/g, String(r.libs ?? ''))
    .replace(/\{area\}/g, String(s.blackArea))
    .replace(/\{warea\}/g, String(s.whiteArea))
    .replace(/\{stones\}/g, String(s.blackStones))
    .replace(/\{total\}/g, String(s.blackStones + s.blackArea));
}
