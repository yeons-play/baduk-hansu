// 집 세기 연출 시간표 검사 — 화면 없이 '이때 몇까지 셌나'만 본다
import { describe, expect, it } from 'vitest';
import { BLACK, Game } from '../src/engine/rules';
import { SHOW_TIMING, frameAt, planShow, showInputOf, type ShowInput } from '../src/scoreshow';

// 까망이가 왼쪽, 하양이가 오른쪽을 가진 7줄 판(가운데 세로줄은 누구 집도 아님)
const ROWS = [
  '. . X . O . .',
  '. . X . O . .',
  '. . X . O . .',
  '. . X . O . .',
  '. . X . O . .',
  '. . X . O . .',
  '. . X . O . .',
];

function sample() {
  const g = Game.fromDiagram(ROWS, BLACK);
  const score = g.score();
  const input = showInputOf(g, [], score);
  return { g, score, input, plan: planShow(input) };
}

describe('연출에 쓸 것 뽑기', () => {
  it('집 네모와 산 돌 수가 엔진이 센 점수와 같다', () => {
    const { score, input } = sample();
    expect(input.squares.filter(([, c]) => c === 1).length).toBe(score.blackArea);
    expect(input.squares.filter(([, c]) => c === 2).length).toBe(score.whiteArea);
    expect(input.stones.filter(([, c]) => c === 1).length).toBe(score.blackStones);
    expect(input.stones.filter(([, c]) => c === 2).length).toBe(score.whiteStones);
    expect(input.komi).toBe(score.komi);
  });

  it('누구 집도 아닌 곳은 네모가 없고, 차례는 위에서 아래·왼쪽에서 오른쪽', () => {
    const { input } = sample();
    expect(input.squares.some(([p]) => p % 7 === 3)).toBe(false);
    const points = input.squares.map(([p]) => p);
    expect(points).toEqual([...points].sort((a, b) => a - b));
  });

  it('죽은 돌은 세는 돌에서 빠지고 그 자리는 둘러싼 쪽 집 네모가 된다', () => {
    const rows = [...ROWS];
    rows[3] = 'O . X . O . .'; // 까망이 집 안에 들어온 하양이 돌
    const g = Game.fromDiagram(rows, BLACK);
    const dead = [3 * 7];
    const score = g.score(dead);
    const input = showInputOf(g, dead, score);
    expect(input.stones.some(([p]) => p === dead[0])).toBe(false);
    expect(input.squares.find(([p]) => p === dead[0])?.[1]).toBe(1);
    expect(input.squares.filter(([, c]) => c === 1).length).toBe(score.blackArea);
  });
});

describe('집 세기 연출 시간표', () => {
  it('처음에는 모두 0이고 발표 전', () => {
    const { input, plan } = sample();
    const f = frameAt(plan, input, 0);
    expect([f.blackStones, f.whiteStones, f.blackArea, f.whiteArea, f.komi, f.blackTotal, f.whiteTotal]).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(f.phase).toBe(0);
    expect(f.revealed || f.done || f.komiShown).toBe(false);
  });

  it('발표 때는 엔진이 센 점수와 똑같다', () => {
    const { score, input, plan } = sample();
    for (const t of [plan.revealAt, plan.endAt, plan.endAt + 60000]) {
      const f = frameAt(plan, input, t);
      expect(f.blackStones).toBe(score.blackStones);
      expect(f.whiteStones).toBe(score.whiteStones);
      expect(f.blackArea).toBe(score.blackArea);
      expect(f.whiteArea).toBe(score.whiteArea);
      expect(f.komi).toBe(score.komi);
      expect(f.blackTotal).toBe(score.blackTotal);
      expect(f.whiteTotal).toBe(score.whiteTotal);
      expect(f.revealed).toBe(true);
      expect(f.phase).toBe(4);
    }
    expect(frameAt(plan, input, plan.revealAt).done).toBe(false);
    expect(frameAt(plan, input, plan.endAt).done).toBe(true);
  });

  it('숫자는 줄지 않고, 돌 → 집 → 덤 → 발표 차례로 센다', () => {
    const { score, input, plan } = sample();
    let prev = frameAt(plan, input, -100);
    for (let t = 0; t <= plan.endAt; t += 7) {
      const f = frameAt(plan, input, t);
      for (const k of ['blackStones', 'whiteStones', 'blackArea', 'whiteArea', 'komi', 'blackTotal', 'whiteTotal', 'phase'] as const) {
        expect(f[k]).toBeGreaterThanOrEqual(prev[k]);
      }
      expect(f.blackTotal).toBe(f.blackStones + f.blackArea);
      expect(f.whiteTotal).toBe(f.whiteStones + f.whiteArea + f.komi);
      // 집을 세기 시작하면 돌은 다 센 뒤, 덤을 더하기 시작하면 집은 다 센 뒤
      if (f.blackArea + f.whiteArea > 0) expect(f.blackStones + f.whiteStones).toBe(score.blackStones + score.whiteStones);
      if (f.komi > 0) expect(f.blackArea + f.whiteArea).toBe(score.blackArea + score.whiteArea);
      if (!f.revealed) expect(f.komiShown).toBe(f.phase === 3);
      prev = f;
    }
    expect(plan.stonesAt).toBeLessThan(plan.areaAt);
    expect(plan.areaAt).toBeLessThan(plan.komiAt);
    expect(plan.komiAt).toBeLessThan(plan.revealAt);
  });

  it('표의 숫자는 바둑판에서 켜진 네모·센 돌 수와 늘 같다', () => {
    const { input, plan } = sample();
    for (let t = 0; t <= plan.revealAt; t += 13) {
      const f = frameAt(plan, input, t);
      const lit = input.squares.filter(([p]) => plan.squareAt.get(p)! <= t);
      expect(f.blackArea).toBe(lit.filter(([, c]) => c === 1).length);
      expect(f.whiteArea).toBe(lit.filter(([, c]) => c === 2).length);
      const told = input.stones.filter(([p]) => plan.stoneAt.get(p)! <= t);
      expect(f.blackStones).toBe(told.filter(([, c]) => c === 1).length);
      expect(f.whiteStones).toBe(told.filter(([, c]) => c === 2).length);
    }
  });

  it('덤은 집을 다 센 뒤 하양이에게만 더한다(뒤집히는 판도 발표 전에 보임)', () => {
    const { score, input, plan } = sample();
    const before = frameAt(plan, input, plan.komiAt - 1);
    expect(before.blackTotal).toBe(score.blackTotal);
    expect(before.whiteTotal).toBe(score.whiteTotal - score.komi);
    expect(before.komiShown).toBe(false);
    const during = frameAt(plan, input, plan.komiAt + SHOW_TIMING.komi * 2);
    expect(during.phase).toBe(3);
    expect(during.komiShown).toBe(true);
    expect(during.komi).toBeGreaterThan(0);
    expect(during.komi).toBeLessThan(score.komi);
    expect(during.blackTotal).toBe(score.blackTotal);
  });

  it('13줄처럼 큰 판도 너무 길지 않고, 작은 판도 너무 짧지 않다', () => {
    const big: ShowInput = {
      blackStones: 80,
      whiteStones: 75,
      komi: 7,
      squares: Array.from({ length: 90 }, (_, i) => [200 + i, i % 2 ? 2 : 1] as [number, 1 | 2]),
      stones: Array.from({ length: 155 }, (_, i) => [20 + i, i < 80 ? 1 : 2] as [number, 1 | 2]),
    };
    expect(planShow(big).revealAt).toBeLessThanOrEqual(7000);
    const small: ShowInput = { blackStones: 3, whiteStones: 2, komi: 7, squares: [[0, 1]], stones: [[1, 1], [2, 1], [3, 1], [4, 2], [5, 2]] };
    expect(planShow(small).revealAt).toBeGreaterThanOrEqual(2500);
  });

  it('덤이 없으면 덤 칸을 건너뛴다', () => {
    const { input } = sample();
    const noKomi = { ...input, komi: 0 };
    const plan = planShow(noKomi);
    for (let t = 0; t <= plan.endAt; t += 11) {
      const f = frameAt(plan, noKomi, t);
      expect(f.phase).not.toBe(3);
      expect(f.komi).toBe(0);
      expect(f.komiShown).toBe(false);
    }
    expect(plan.revealAt - plan.komiAt).toBe(SHOW_TIMING.drumroll);
  });

  it('반 집 덤(6.5)도 끝에는 정확히 더한다', () => {
    const { input } = sample();
    const half = { ...input, komi: 6.5 };
    const plan = planShow(half);
    let prev = 0;
    for (let t = 0; t <= plan.endAt; t += 9) {
      const k = frameAt(plan, half, t).komi;
      expect(k).toBeGreaterThanOrEqual(prev);
      expect(k).toBeLessThanOrEqual(6.5);
      prev = k;
    }
    expect(frameAt(plan, half, plan.revealAt).komi).toBe(6.5);
  });

  it('돌도 집도 없는 빈 판에서도 숫자가 깨지지 않는다', () => {
    const empty: ShowInput = { blackStones: 0, whiteStones: 0, komi: 7, squares: [], stones: [] };
    const plan = planShow(empty);
    for (const v of [plan.stonesAt, plan.areaAt, plan.komiAt, plan.revealAt, plan.endAt, plan.stoneStep, plan.squareStep, plan.komiStep]) {
      expect(Number.isFinite(v)).toBe(true);
    }
    const f = frameAt(plan, empty, plan.revealAt);
    expect([f.blackTotal, f.whiteTotal]).toEqual([0, 7]);
  });
});
