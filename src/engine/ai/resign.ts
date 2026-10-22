// 기권 판단 — 진짜 바둑에서 하양이가 크게 지고 있으면 스스로 "졌어요" 하고 끝낸다(바둑 예절).
// 규칙이 아니라 짐작이라 AI 쪽에 둔다. 지금 판에서 무작위로 끝까지 두어 보기(dead.ts의 playout)를 여러 번 해
// 거의 모든 판에서 크게 지면 기권. 아직 판이 덜 찼거나 점수 차가 크지 않으면 절대 기권하지 않는다.
import { BLACK, EMPTY, Game, WHITE, type Stone } from '../rules';
import { playout } from './dead';
import { influence, INFL_T, settledOwner } from './beginner';

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

/**
 * 넓게 벌린 땅까지 쳐 주는 셈(me 기준 점수 차, 덤 포함): 돌은 그 색, 빈 곳은 굳은 집이면 그 색,
 * 아니면 세력 지도에서 한쪽이 확실히 센 곳만 그쪽으로. 무작위로 두어 보기는 넓게 벌린 땅을 지키지 못해
 * 그런 땅을 가진 쪽을 너무 지고 있다고 보므로(13줄 실제 판에서 10집 안팎 차이를 59집으로 봄), 이 셈으로도 크게 질 때만 기권한다.
 */
export function moyoMargin(game: Game, me: Stone): number {
  const infl = influence(game);
  const settled = settledOwner(game);
  let b = 0;
  let w = 0;
  for (let p = 0; p < game.geo.n; p++) {
    const c = game.at(p);
    const o = c !== EMPTY ? c : settled[p] ? settled[p] : infl[p] >= INFL_T ? BLACK : infl[p] <= -INFL_T ? WHITE : EMPTY;
    if (o === BLACK) b++;
    else if (o === WHITE) w++;
  }
  return (b - w - game.rules.komi) * (me === BLACK ? 1 : -1);
}

/** 기권할 만큼 지고 있나: 판이 40% 넘게 찼고, 넓은 땅까지 쳐 줘도 판 넓이의 15% 넘게 지고, 두어 본 판에서도 25% 넘게·95% 이상 진다 */
export function hopeless(game: Game, me: Stone, opts: ResignOptions = {}): boolean {
  if (game.rules.mode !== 'normal' || game.isOver) return false;
  if (filled(game) < 0.4) return false;
  // 넓은 땅까지 쳐 줘도 판 넓이의 15% 넘게 져야 함(빠른 셈이라 먼저 본다)
  if (moyoMargin(game, me) > -game.geo.n * 0.15) return false;
  const N = opts.playouts ?? (game.size <= 9 ? 50 : 36);
  const allowed = Math.floor(N * 0.05); // 이만큼까지는 이겨도 '거의 다 진다'
  const g = guessFinal(game, me, { ...opts, playouts: N, stopAfterWins: allowed + 1 });
  return g.loseRate >= 0.95 && g.margin < -game.geo.n * 0.25;
}
