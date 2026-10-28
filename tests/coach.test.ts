// 도와줘 3단계 계획과 글 검사
import { describe, expect, it } from 'vitest';
import { Game } from '../src/engine/rules';
import { replay, type ReplaySpec } from '../src/engine/ai/review';
import type { MoveReason } from '../src/engine/ai/beginner';
import { hintText, planHint, zoneAround, type HintStep } from '../src/coach';
import { toSpeech } from '../src/speech';

const P7 = (x: number, y: number) => y * 7 + x;

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 7줄 판 기록(흑부터 번갈아) */
function spec7(moves: [number, number][], mode: 'normal' | 'capture' = 'normal', captureTarget = 1): ReplaySpec {
  return { mode, size: 7, captureTarget, moves: moves.map(([x, y]) => P7(x, y)) };
}

// 하양이가 스스로 단수가 된 판: 흑 (3,2)·(2,3)·(4,3)에 둘러싸인 백 (3,3)
const SELF_ATARI_W: [number, number][] = [
  [2, 3],
  [6, 6],
  [3, 2],
  [6, 5],
  [4, 3],
  [3, 3],
];

describe('도와줘 3단계', () => {
  it('잡기: 2단계는 잡을 하양이 돌에 동그라미, 3단계는 그 마지막 숨구멍', () => {
    const plan = planHint(replay(spec7(SELF_ATARI_W)), rng(1))!;
    expect(plan.reason).toBe('capture');
    expect(plan.point).toBe(P7(3, 4));
    expect(plan.stones).toEqual([P7(3, 3)]);
    expect(plan.zone).toBeNull();
    expect(hintText(plan, 1)).toContain('숨구멍이 하나 남은 하양이 돌');
    expect(hintText(plan, 2)).toContain('동그라미');
    expect(hintText(plan, 3)).toContain('잡을 수 있어요');
  });

  it('도망가기: 2단계는 위험한 까망이 돌(답이 될 자리는 아님)', () => {
    const plan = planHint(replay(spec7([[0, 0], [1, 0]])), rng(2))!;
    expect(plan.reason).toBe('escape');
    expect(plan.point).toBe(P7(0, 1));
    expect(plan.stones).toEqual([P7(0, 0)]);
    expect(hintText(plan, 2)).toContain('도망');
  });

  it('단수로 몰기: 2단계는 몰 하양이 돌', () => {
    const plan = planHint(replay(spec7([[3, 2], [3, 3], [2, 3], [6, 6]], 'capture', 3)), rng(3))!;
    expect(plan.reason).toBe('atari');
    expect([P7(4, 3), P7(3, 4)]).toContain(plan.point);
    expect(plan.stones).toEqual([P7(3, 3)]);
    expect(hintText(plan, 1)).toContain('숨구멍 하나(단수)');
  });

  it('집 짓기 수: 2단계는 돌 대신 어디쯤 네모(판 안, 다섯 칸)', () => {
    const g = new Game({ size: 9, mode: 'normal' });
    const plan = planHint(g, rng(4))!;
    expect(plan.reason).toBe('corner');
    expect(plan.stones).toEqual([]);
    const [x0, y0, x1, y1] = plan.zone!;
    const [x, y] = [plan.point % 9, Math.floor(plan.point / 9)];
    expect([x1 - x0, y1 - y0]).toEqual([4, 4]);
    expect(x >= x0 && x <= x1 && y >= y0 && y <= y1).toBe(true);
    expect(Math.min(x0, y0)).toBeGreaterThanOrEqual(0);
    expect(Math.max(x1, y1)).toBeLessThanOrEqual(8);
    expect(hintText(plan, 2)).toContain('네모');
  });

  it('계획을 만들어도 판은 그대로', () => {
    const g = replay(spec7([[0, 0], [1, 0]]));
    const before = [...g.board()];
    planHint(g, rng(5));
    expect([...g.board()]).toEqual(before);
    expect(g.moves.length).toBe(2);
  });

  it('네모 구역은 판 끝에서 안쪽으로 밀려 늘 판 안에', () => {
    expect(zoneAround(9, 0)).toEqual([0, 0, 4, 4]);
    expect(zoneAround(9, 80)).toEqual([4, 4, 8, 8]);
    expect(zoneAround(9, 40)).toEqual([2, 2, 6, 6]);
    expect(zoneAround(5, 12)).toEqual([0, 0, 4, 4]);
    expect(zoneAround(3, 4)).toEqual([0, 0, 2, 2]);
  });

  it('모든 까닭·단계의 글: 비지 않고, 굵게·괄호 짝이 맞고, 읽어 주기에 기호가 남지 않음', () => {
    const reasons: MoveReason[] = [
      'win', 'capture', 'escape', 'atari', 'connect', 'joseki', 'corner', 'approach', 'enclose', 'answer', 'side', 'territory', 'shape', 'pass',
    ];
    for (const reason of reasons)
      for (const stones of [[], [3]])
        for (const step of [1, 2, 3] as HintStep[]) {
          const t = hintText({ point: 0, reason, stones, zone: stones.length ? null : [0, 0, 4, 4] }, step);
          expect(t.length).toBeGreaterThan(5);
          if (step === 3 && reason !== 'pass') expect(t).toContain('여기'); // 3단계는 점선 동그라미를 가리킨다
          if (step < 3) expect(t).not.toContain('여기'); // 1·2단계는 자리를 말하지 않는다
          expect(t.split('**').length % 2).toBe(1);
          expect((t.match(/\(/g) ?? []).length).toBe((t.match(/\)/g) ?? []).length);
          expect(toSpeech(t)).not.toMatch(/[*(){}]/);
        }
  });
});
