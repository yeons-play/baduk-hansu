// 기권 판단 — 진짜 바둑에서 하양이가 크게 지고 있으면 스스로 "졌어요" 하고 끝낸다(바둑 예절).
// 규칙이 아니라 짐작이라 AI 쪽에 둔다. 지금 판에서 무작위로 끝까지 두어 보기(dead.ts의 playout)를 여러 번 해
// 거의 모든 판에서 크게 지면 기권. 아직 판이 덜 찼거나 점수 차가 크지 않으면 절대 기권하지 않는다.
import { BLACK, EMPTY, Game, WHITE, type Stone } from '../rules';
import { playout } from './dead';

export interface ResignOptions {
  playouts?: number;
  rand?: () => number;
}

export interface FinalGuess {
  /** me 기준 평균 점수 차(덤 포함, 음수면 지는 중) */
  margin: number;
  /** me가 지는 판의 비율 */
  loseRate: number;
}

/** 판이 얼마나 찼는지(돌 수 / 교차점 수) */
export function filled(game: Game): number {
  let k = 0;
  for (let p = 0; p < game.geo.n; p++) if (game.at(p) !== EMPTY) k++;
  return k / game.geo.n;
}

/**
 * 두어 본 판들의 평균 점수 차와 지는 비율. stopAfterWins를 주면 me가 그만큼 이기는 순간 멈춘다
 * (비슷한 판에서는 몇 번 만에 끝나서 빠르다).
 */
export function guessFinal(game: Game, me: Stone, opts: ResignOptions & { stopAfterWins?: number } = {}): FinalGuess {
  const rand = opts.rand ?? Math.random;
  const N = opts.playouts ?? (game.size <= 9 ? 50 : 36);
  const komi = game.rules.komi;
  let sum = 0;
  let lose = 0;
  let wins = 0;
  let k = 0;
  for (; k < N; k++) {
    const owner = playout(game, rand);
    let b = 0;
    let w = 0;
    for (let p = 0; p < owner.length; p++) {
      if (owner[p] === BLACK) b++;
      else if (owner[p] === WHITE) w++;
    }
    const d = (b - w - komi) * (me === BLACK ? 1 : -1);
    sum += d;
    if (d < 0) lose++;
    else if (opts.stopAfterWins != null && ++wins >= opts.stopAfterWins) {
      k++;
      break;
    }
  }
  return { margin: sum / k, loseRate: lose / k };
}

/** 기권할 만큼 지고 있나: 판이 40% 넘게 찼고, 판 넓이의 25% 넘게 지며, 두어 본 판의 95% 이상에서 진다 */
export function hopeless(game: Game, me: Stone, opts: ResignOptions = {}): boolean {
  if (game.rules.mode !== 'normal' || game.isOver) return false;
  if (filled(game) < 0.4) return false;
  const N = opts.playouts ?? (game.size <= 9 ? 50 : 36);
  const allowed = Math.floor(N * 0.05); // 이만큼까지는 이겨도 '거의 다 진다'
  const g = guessFinal(game, me, { ...opts, playouts: N, stopAfterWins: allowed + 1 });
  return g.loseRate >= 0.95 && g.margin < -game.geo.n * 0.25;
}
