// 두는 중에 도와주기 검사 — 위험·기회 알림, 스스로 단수 확인, 도와줘 3단계 계획과 글
import { describe, expect, it } from 'vitest';
import { BLACK, EMPTY, Game, WHITE } from '../src/engine/rules';
import { replay, type ReplaySpec } from '../src/engine/ai/review';
import type { MoveReason } from '../src/engine/ai/beginner';
import { alertText, hintText, planHint, selfAtari, SELF_ATARI_TEXT, turnAlerts, zoneAround, type HintStep } from '../src/coach';
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

function alertsOf(spec: ReplaySpec) {
  const g = replay(spec);
  expect(g.moves.length).toBe(spec.moves.length); // 기록이 엔진에서 모두 둘 수 있는 수
  return turnAlerts(g, spec, BLACK);
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

describe('위험·기회 알림', () => {
  it('하양이가 스스로 단수가 되면 기회(어디인지는 글에 없음)', () => {
    const a = alertsOf(spec7(SELF_ATARI_W));
    expect(a).toEqual({ danger: false, chance: true });
    const t = alertText(a)!;
    expect(t).toContain('잡을 수 있는');
    expect(t).not.toMatch(/\d/); // 자리를 말하지 않음
  });

  it('지난 차례에 알린 기회를 놓치고 나면 다시 알리지 않는다(오래 남은 돌로 계속 알리지 않음)', () => {
    expect(alertsOf(spec7([...SELF_ATARI_W, [0, 0], [6, 4]]))).toEqual({ danger: false, chance: false });
  });

  it('내가 단수로 몰았는데 하양이가 도망가지 않으면 기회', () => {
    const s = spec7([
      [3, 2],
      [3, 3],
      [2, 3],
      [6, 6],
      [4, 3],
      [6, 5],
    ]);
    expect(alertsOf(s).chance).toBe(true);
  });

  it('하양이 수로 내 돌이 단수가 되면 위험', () => {
    const a = alertsOf(spec7([
      [0, 0],
      [1, 0],
    ]));
    expect(a).toEqual({ danger: true, chance: false });
    expect(alertText(a)).toContain('위험');
  });

  it('잡아도 바로 되잡히는 패 모양은 기회로 보지 않는다(복습의 잡기 기준과 같음)', () => {
    const start = Game.fromDiagram(['. X O . .', 'X . . O .', '. X O . .', '. . . . .', '. . . . .'], WHITE);
    const spec: ReplaySpec = { mode: 'normal', size: 5, captureTarget: 1, moves: [6], setup: { board: [...start.board()], toMove: WHITE } };
    const g = replay(spec);
    expect(g.moves.length).toBe(1);
    expect(g.group(6).liberties.length).toBe(1); // 하양이 (1,1)은 단수
    expect(turnAlerts(g, spec, BLACK).chance).toBe(false);
  });

  it('따내기 바둑에서 잡으면 이기는 수는 기회', () => {
    expect(alertsOf(spec7(SELF_ATARI_W, 'capture', 1)).chance).toBe(true);
  });

  it('하양이 차례·끝난 판에는 알림 없음', () => {
    const s = spec7(SELF_ATARI_W.slice(0, 5));
    expect(turnAlerts(replay(s), s, BLACK)).toEqual({ danger: false, chance: false });
    expect(alertText({ danger: false, chance: false })).toBeNull();
    expect(alertText({ danger: true, chance: true })).toContain('위험한');
  });

  it('알림을 계산해도 판은 그대로(시험해 본 수는 되돌림)', () => {
    const s = spec7(SELF_ATARI_W);
    const g = replay(s);
    const before = [...g.board()];
    turnAlerts(g, s, BLACK);
    expect([...g.board()]).toEqual(before);
    expect(g.moves.length).toBe(6);
    expect(g.toMove).toBe(BLACK);
  });
});

describe('스스로 단수 확인', () => {
  const g = Game.fromDiagram(['. . O . .', '. O . . .', '. . . . .', '. . . . .', '. . . . .'], BLACK);

  it('두면 숨구멍이 하나만 남고 하양이가 바로 잡을 수 있는 자리', () => {
    expect(selfAtari(g, 1)).toBe(true); // (1,0)
    expect(selfAtari(g, 18)).toBe(false); // (3,3) 숨구멍 넷
    expect(selfAtari(g, 2)).toBe(false); // 돌이 있는 곳
    expect(g.at(1)).toBe(EMPTY);
    expect(g.moves.length).toBe(0);
  });

  it('잡는 수는 숨구멍이 하나여도 묻지 않는다(패 모양)', () => {
    const k = Game.fromDiagram(['. X O . .', 'X O . O .', '. X O . .', '. . . . .', '. . . . .'], BLACK);
    expect(k.check(7).ok).toBe(true); // (2,1)은 백 (1,1)을 잡는 수
    expect(selfAtari(k, 7)).toBe(false);
  });

  it('확인 글은 쉬운 말 + 괄호 속 바둑 말', () => {
    expect(SELF_ATARI_TEXT).toContain('숨구멍 하나(단수)');
    expect(toSpeech(SELF_ATARI_TEXT)).toContain('바둑 말로는 단수라고 해요');
  });
});

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
