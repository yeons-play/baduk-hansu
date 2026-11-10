// 집 세기 연출 — 둘 다 넘겨 집을 셀 때 숫자를 한 번에 띄우지 않고 '돌 → 집 → 덤 → 발표' 차례로 보여 준다.
// 아이가 가장 좋아하는 순간이고, 돌 + 집 + 덤으로 세는 법(계가)을 눈으로 배우는 자리이기도 하다.
// 여기에는 시간표와 '이때 몇까지 셌나' 계산만 둔다(화면·소리는 main.ts). 시간만 넣으면 답이 정해져서
// 다시 그려도 이어서 보이고(잡힌 돌 효과와 같은 방식), 시험하기도 쉽다.
import { EMPTY, type AreaScore, type Game } from './engine/rules';

export interface ShowInput {
  blackStones: number;
  whiteStones: number;
  komi: number;
  /** 집 네모: 판 위 차례(위 → 아래, 왼쪽 → 오른쪽)대로 [점, 주인(1 까망이·2 하양이)] */
  squares: [number, 1 | 2][];
  /** 산 돌: 판 위 차례대로 [점, 색] — 돌을 세는 물결에 쓴다 */
  stones: [number, 1 | 2][];
}

/** 시간은 모두 연출을 시작한 때부터 잰 ms */
export interface ShowPlan {
  /** 돌 세기: 시작, 하나 세는 시간, 세는 개수(둘 중 많은 쪽) */
  stonesAt: number;
  stoneStep: number;
  stoneCount: number;
  /** 집 세기: 시작, 네모 하나 켜는 시간 */
  areaAt: number;
  squareStep: number;
  /** 덤 더하기: 시작, 한 점 더하는 시간 */
  komiAt: number;
  komiStep: number;
  /** 누가 이겼는지 발표 */
  revealAt: number;
  /** 연출 끝(이 뒤로는 다 센 모습 그대로) */
  endAt: number;
  /** 앞에서부터 k개 켰을 때 까망이 네모 수 */
  blackPrefix: number[];
  /** 점 → 그 집 네모가 켜지는 때 */
  squareAt: Map<number, number>;
  /** 점 → 그 돌을 세는 때 */
  stoneAt: Map<number, number>;
}

export interface ShowFrame {
  /** 지금 세는 칸: 0 시작 전, 1 돌, 2 집, 3 덤, 4 발표 */
  phase: 0 | 1 | 2 | 3 | 4;
  blackStones: number;
  whiteStones: number;
  blackArea: number;
  whiteArea: number;
  /** 지금까지 더한 덤 */
  komi: number;
  blackTotal: number;
  whiteTotal: number;
  /** 덤 칸에 숫자를 보일 때가 됐는지 */
  komiShown: boolean;
  revealed: boolean;
  done: boolean;
}

/** 빠르기 — 아이 반응을 보고 여기만 고친다. 판이 커도 너무 길어지지 않게 단계마다 가장 긴 시간을 둔다 */
export const SHOW_TIMING = {
  /** 창이 뜨고 세기 시작할 때까지 */
  start: 450,
  /** 돌 하나 세는 시간과 이 단계 전체 시간의 [최소, 최대] */
  stone: 22,
  stones: [600, 1300] as [number, number],
  /** 집 네모 하나 켜는 시간과 이 단계 전체 시간의 [최소, 최대] */
  square: 70,
  area: [900, 2400] as [number, number],
  /** 단계 사이 쉬는 시간 */
  gap: 320,
  /** 덤 한 점 더하는 시간 */
  komi: 90,
  /** 다 더한 뒤 발표까지 뜸 들이기 */
  drumroll: 550,
  /** 발표 뒤 연출을 끝낼 때까지 */
  after: 700,
};

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/**
 * 끝난 판에서 연출에 쓸 것을 뽑는다. 숫자는 엔진이 센 점수(score)를 그대로 쓰고,
 * 여기서는 '어느 점이 집 네모이고 어느 점이 산 돌인지'만 판 위 차례대로 모은다(바둑판 그림과 같은 기준).
 */
export function showInputOf(game: Game, dead: Iterable<number>, score: AreaScore): ShowInput {
  const gone = new Set(dead);
  const squares: [number, 1 | 2][] = [];
  const stones: [number, 1 | 2][] = [];
  for (let p = 0; p < game.geo.n; p++) {
    const v = game.at(p);
    if (v !== EMPTY && !gone.has(p)) stones.push([p, v]);
    else if (score.owner[p]) squares.push([p, score.owner[p] as 1 | 2]);
  }
  return { blackStones: score.blackStones, whiteStones: score.whiteStones, komi: score.komi, squares, stones };
}

/** t 때까지 센 개수: 하나 세는 시간의 가운데에서 숫자가 오른다 */
function counted(t: number, at: number, step: number, max: number): number {
  if (max <= 0) return 0;
  if (step <= 0) return t >= at ? max : 0;
  return clamp(Math.floor((t - at) / step + 0.5), 0, max);
}

export function planShow(input: ShowInput): ShowPlan {
  const T = SHOW_TIMING;
  const stoneCount = Math.max(0, input.blackStones, input.whiteStones);
  const stonesMs = stoneCount ? clamp(stoneCount * T.stone, T.stones[0], T.stones[1]) : 0;
  const stoneStep = stoneCount ? stonesMs / stoneCount : 0;
  const stonesAt = T.start;

  const n = input.squares.length;
  const areaMs = n ? clamp(n * T.square, T.area[0], T.area[1]) : 0;
  const squareStep = n ? areaMs / n : 0;
  const areaAt = stonesAt + stonesMs + (stonesMs ? T.gap : 0);

  const komiPoints = Math.max(0, Math.floor(input.komi));
  const komiMs = input.komi > 0 ? Math.max(1, komiPoints) * T.komi : 0;
  const komiStep = komiPoints ? komiMs / komiPoints : komiMs;
  // 덤이 없으면 덤 칸을 건너뛴다(발표로 바로)
  const komiAt = areaAt + areaMs + (areaMs ? T.gap : 0);
  const revealAt = komiAt + komiMs + T.drumroll;

  const blackPrefix = [0];
  const squareAt = new Map<number, number>();
  input.squares.forEach(([p, c], i) => {
    blackPrefix.push(blackPrefix[i] + (c === 1 ? 1 : 0));
    squareAt.set(p, areaAt + (i + 0.5) * squareStep);
  });

  // 돌은 색마다 따로 차례를 매긴다: 숫자가 둘 다 1, 2, 3… 같이 오르므로 k번째 까망이 돌과 k번째 하양이 돌이 같이 반짝인다
  const stoneAt = new Map<number, number>();
  const seen = [0, 0, 0];
  for (const [p, c] of input.stones) {
    stoneAt.set(p, stonesAt + (seen[c] + 0.5) * stoneStep);
    seen[c]++;
  }

  return {
    stonesAt,
    stoneStep,
    stoneCount,
    areaAt,
    squareStep,
    komiAt,
    komiStep,
    revealAt,
    endAt: revealAt + T.after,
    blackPrefix,
    squareAt,
    stoneAt,
  };
}

/** 연출을 시작하고 t ms가 지났을 때 표에 보일 숫자 */
export function frameAt(plan: ShowPlan, input: ShowInput, t: number): ShowFrame {
  const n = input.squares.length;
  const revealed = t >= plan.revealAt;
  const k = revealed ? plan.stoneCount : counted(t, plan.stonesAt, plan.stoneStep, plan.stoneCount);
  const blackStones = Math.min(k, input.blackStones);
  const whiteStones = Math.min(k, input.whiteStones);
  const lit = revealed ? n : counted(t, plan.areaAt, plan.squareStep, n);
  const blackArea = plan.blackPrefix[lit];
  const whiteArea = lit - blackArea;
  const komiPoints = Math.max(0, Math.floor(input.komi));
  const komiEnd = plan.komiAt + plan.komiStep * Math.max(1, komiPoints);
  const komi = input.komi <= 0 ? 0 : revealed || t >= komiEnd ? input.komi : counted(t, plan.komiAt, plan.komiStep, komiPoints);
  const hasKomi = input.komi > 0;
  const phase = revealed ? 4 : hasKomi && t >= plan.komiAt ? 3 : n > 0 && t >= plan.areaAt ? 2 : t >= plan.stonesAt ? 1 : 0;
  return {
    phase,
    blackStones,
    whiteStones,
    blackArea,
    whiteArea,
    komi,
    blackTotal: blackStones + blackArea,
    whiteTotal: whiteStones + whiteArea + komi,
    komiShown: hasKomi && (revealed || t >= plan.komiAt),
    revealed,
    done: t >= plan.endAt,
  };
}
