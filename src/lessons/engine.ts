// 강의 단계를 규칙 엔진 위에서 해석한다. 정답은 모두 엔진이 계산.
import { BLACK, WHITE, Game, toPoint, type Stone } from '../engine/rules';
import type { Setup, Step, XY } from './data';

export const SIZE = 9;
export const pt = ([x, y]: XY): number => toPoint(SIZE, x, y);

export function buildGame(setup: Setup = {}, extraBlack: number[] = []): Game {
  const board = new Uint8Array(SIZE * SIZE);
  for (const xy of setup.b ?? []) board[pt(xy)] = BLACK;
  for (const xy of setup.w ?? []) board[pt(xy)] = WHITE;
  for (const p of extraBlack) board[p] = BLACK;
  const blacks = board.filter((c) => c === BLACK).length;
  const whites = board.filter((c) => c === WHITE).length;
  // 흑이 먼저 두므로, 흑·백 수가 같으면 흑 차례
  const toMove: Stone = blacks > whites ? WHITE : BLACK;
  return new Game({ size: SIZE, mode: 'capture', captureTarget: 99 }, { board, toMove });
}

export interface Resolved {
  game: Game;
  /** 눌러야 하는 점 (tap·liberties) */
  targets: number[];
  /** 정답 번호 (choice) */
  answer: number;
  /** 숨구멍 수 (libsOf가 있을 때) */
  libs: number | null;
  /** 동그라미로 보여줄 점 */
  rings: number[];
}

export function resolve(step: Step): Resolved {
  const game = buildGame(step.setup);
  const libsList = step.libsOf ? game.group(pt(step.libsOf)).liberties : null;
  const libs = libsList ? libsList.length : null;
  let targets: number[] = [];
  if (step.kind === 'tap') targets = step.targets.map(pt);
  if (step.kind === 'liberties') targets = libsList ?? [];
  let answer = -1;
  if (step.kind === 'choice') {
    if (step.answer === 'libs') answer = step.options.findIndex((o) => parseInt(o, 10) === libs);
    else if (step.answer === 'turn') answer = game.toMove === BLACK ? 0 : 1;
    else answer = step.answer;
  }
  const rings = [...(step.rings ?? []).map(pt), ...(step.showLibs && libsList ? libsList : [])];
  return { game, targets, answer, libs, rings };
}

/** {libs} 자리표시를 엔진 값으로 바꾼다 */
export function fill(text: string, r: Resolved): string {
  return text.replace(/\{libs\}/g, String(r.libs ?? ''));
}
