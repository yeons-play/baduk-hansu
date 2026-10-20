// 끝난 판에서 '죽은 돌' 짐작 — 규칙이 아니라 짐작이라서 AI 쪽에 둔다(사람이 집 세기 화면에서 고칠 수 있음).
// 방법: 지금 판에서 양쪽이 무작위로(자기 눈은 메우지 않고) 끝까지 두어 보기를 여러 번 한다.
// 어떤 돌 무리가 대부분의 판에서 상대 땅이 되면 죽은 돌로 본다. 합법 판단은 규칙 엔진(play)에만 맡긴다.
import { BLACK, EMPTY, Game, type Stone } from '../rules';

export interface DeadOptions {
  playouts?: number;
  rand?: () => number;
  /** 자기 색 땅으로 남는 비율이 이보다 낮으면 죽은 돌 */
  threshold?: number;
}

/** 내 돌로만 둘러싸인 빈 점(내 눈) — 무작위로 둘 때도 메우지 않는다 */
function isOwnEye(g: Game, p: number, me: Stone): boolean {
  return g.geo.neighbors[p].every((q) => g.at(q) === me);
}

/** 한 판을 끝까지 무작위로 두고 교차점별 땅 주인을 돌려준다 */
function playout(start: Game, rand: () => number): Uint8Array {
  const n = start.geo.n;
  const board = new Uint8Array(n);
  for (let p = 0; p < n; p++) board[p] = start.at(p);
  const g = new Game({ size: start.size, mode: 'normal', komi: 0 }, { board, toMove: start.toMove });
  let passes = 0;
  const empties: number[] = [];
  for (let moves = 0; moves < n * 3 && passes < 2; moves++) {
    empties.length = 0;
    for (let p = 0; p < n; p++) if (g.at(p) === EMPTY) empties.push(p);
    const me = g.toMove;
    let played = false;
    while (empties.length) {
      const i = Math.floor(rand() * empties.length);
      const p = empties[i];
      empties[i] = empties[empties.length - 1];
      empties.pop();
      if (isOwnEye(g, p, me)) continue;
      if (g.play(p).ok) {
        played = true;
        break;
      }
    }
    if (played) passes = 0;
    else {
      g.pass();
      passes++;
    }
  }
  return g.score().owner;
}

/** 죽은 돌로 짐작한 점들(무리 단위로 통째로) */
export function estimateDead(game: Game, opts: DeadOptions = {}): number[] {
  const rand = opts.rand ?? Math.random;
  const N = opts.playouts ?? (game.size <= 9 ? 120 : 70);
  const threshold = opts.threshold ?? 0.5;
  const n = game.geo.n;
  const keep = new Float32Array(n);
  for (let k = 0; k < N; k++) {
    const owner = playout(game, rand);
    for (let p = 0; p < n; p++) if (game.at(p) !== EMPTY && owner[p] === game.at(p)) keep[p]++;
  }
  const dead: number[] = [];
  const seen = new Uint8Array(n);
  for (let p = 0; p < n; p++) {
    if (seen[p] || game.at(p) === EMPTY) continue;
    const grp = game.group(p).stones;
    grp.forEach((q) => (seen[q] = 1));
    const avg = grp.reduce((a, q) => a + keep[q], 0) / grp.length / N;
    if (avg < threshold) dead.push(...grp);
  }
  return dead;
}

/** 흑·백 중 죽은 돌 수 */
export function countDead(game: Game, dead: number[]): { black: number; white: number } {
  let black = 0;
  let white = 0;
  for (const p of dead) (game.at(p) === BLACK ? black++ : white++);
  return { black, white };
}
