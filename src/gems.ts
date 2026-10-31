// 보석 — 판을 끝까지 두면 받는 보상. 숫자는 아이 반응을 보고 고치기 쉽게 GEM_RULES 한곳에 모은다.
// 원칙: 받을지 말지는 늘 확실하고(뽑기 아님), 몇 개인지만 조금씩 달라진다.
// 이기면 더 많지만 차이를 너무 크게 두지 않고, 어려운 판일수록 더 준다(쉬운 판만 골라 모으지 않게).
// 그만하기로 끝낸 판은 주지 않는다(시작하자마자 그만둬 모으기 방지).
import type { Level } from './engine/ai/beginner';
import type { GameMode } from './engine/rules';

export const GEM_RULES = {
  /** 졌거나 비겼을 때 [최소, 최대] */
  finish: [2, 4] as [number, number],
  /** 이겼을 때 [최소, 최대] */
  win: [6, 10] as [number, number],
  /** 하양이 단계별 곱 */
  level: { 1: 1, 2: 1.5, 3: 2 } as Record<Level, number>,
  /** 진짜 바둑은 판이 길고 어려워서 곱 */
  normal: 2,
  /** 잘한 수(잡기·도망) 하나마다, 한 판 최대 */
  perGood: 1,
  goodMax: 5,
  /** 결과 화면에서 '놓친 장면 다시 풀기'를 끝내면(그 판에 한 번) */
  sceneRetry: 3,
};

export interface GemInput {
  outcome: 'win' | 'loss' | 'draw';
  /** 까망이가 그만하기로 끝냈는지 */
  quit: boolean;
  mode: GameMode;
  level: Level;
  good: { capture: number; escape: number };
}

export interface GemAward {
  /** 판 결과로 받은 것(단계·진짜 바둑 곱 포함) */
  base: number;
  /** 잘한 수로 더 받은 것 */
  bonus: number;
  total: number;
}

/** 한 판에서 받을 보석. rand는 0 이상 1 미만(시험에서 고정하려고 받는다) */
export function gemsForGame(g: GemInput, rand: () => number = Math.random): GemAward {
  if (g.quit) return { base: 0, bonus: 0, total: 0 };
  const [lo, hi] = g.outcome === 'win' ? GEM_RULES.win : GEM_RULES.finish;
  const roll = lo + Math.floor(rand() * (hi - lo + 1));
  const mult = (GEM_RULES.level[g.level] ?? 1) * (g.mode === 'normal' ? GEM_RULES.normal : 1);
  const base = Math.round(roll * mult);
  const bonus = Math.min(GEM_RULES.goodMax, (g.good.capture + g.good.escape) * GEM_RULES.perGood);
  return { base, bonus, total: base + bonus };
}
