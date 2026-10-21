// 놓친 장면 → 내 문제, 잘한 수 찾기, 핵심 그림 — 모두 규칙 엔진으로 검증
import { describe, expect, it } from 'vitest';
import { BLACK, EMPTY, WHITE, Game, toPoint } from '../src/engine/rules';
import { analyzeGame, replay, type ReplaySpec } from '../src/engine/ai/review';
import { chooseMove } from '../src/engine/ai/beginner';
import { makeSceneLesson, sceneFromMistake, sceneStep } from '../src/lessons/scenes';
import { meetsGoal, resolve } from '../src/lessons/engine';
import { KEY_CARDS, keyCardFor } from '../src/lessons/keys';
import { vitalPoints } from '../src/lessons/life';

const P = (x: number, y: number, size = 5) => toPoint(size, x, y);
const cap = (moves: number[], size = 5): ReplaySpec => ({ mode: 'capture', size, captureTarget: 3, moves });

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('잘한 수 찾기', () => {
  it('하양이 돌을 잡으면 capture', () => {
    const moves = [P(1, 2), P(4, 4), P(2, 1), P(4, 3), P(3, 2), P(2, 2), P(2, 3)];
    expect(analyzeGame(cap(moves)).good).toEqual([{ index: 6, kind: 'capture' }]);
  });
  it('방금 단수가 된 내 돌을 살리면 escape', () => {
    const moves = [P(2, 2), P(1, 2), P(4, 4), P(2, 1), P(4, 3), P(3, 2), P(2, 3)];
    expect(analyzeGame(cap(moves)).good).toEqual([{ index: 6, kind: 'escape' }]);
  });
});

describe('출발 배치에서 시작한 판(기록 형식)', () => {
  const board = new Array(25).fill(EMPTY);
  board[P(1, 2)] = BLACK;
  board[P(2, 1)] = BLACK;
  board[P(3, 2)] = BLACK;
  board[P(2, 2)] = WHITE;
  it('복습은 빈 판이 아니라 출발 배치에서 다시 둔다', () => {
    const spec: ReplaySpec = { ...cap([P(2, 3)]), setup: { board, toMove: BLACK } };
    expect(replay(spec).at(P(2, 2))).toBe(EMPTY); // 출발 배치의 하양이를 잡음
    expect(analyzeGame(spec).good).toEqual([{ index: 0, kind: 'capture' }]);
    expect(replay(spec).at(P(1, 2))).toBe(BLACK);
    // 출발 배치 없이 다시 두면 엉뚱한 판이 된다(그래서 배치를 함께 저장)
    expect(replay(cap([P(2, 3)])).at(P(1, 2))).toBe(EMPTY);
    expect(analyzeGame(cap([P(2, 3)])).good).toEqual([]);
  });
  it('하양이가 먼저 두는 출발 배치도 다시 둔다', () => {
    const spec: ReplaySpec = { ...cap([P(2, 3), P(0, 0)]), setup: { board, toMove: WHITE } };
    const g = replay(spec);
    expect(g.at(P(2, 3))).toBe(WHITE);
    expect(g.at(P(0, 0))).toBe(BLACK);
  });
});

describe('놓친 장면 → 문제', () => {
  it('잡기를 놓친 장면: 같은 판, 정답은 놓친 자리', () => {
    const spec = cap([P(1, 2), P(4, 4), P(2, 1), P(4, 3), P(3, 2), P(2, 2), P(0, 0)]);
    const [m] = analyzeGame(spec).mistakes;
    const s = sceneFromMistake(spec, m, 77)!;
    expect(s).toMatchObject({ id: '77-6', kind: 'capture', size: 5 });
    expect(resolve(sceneStep(s), s.size).targets).toEqual([P(2, 3)]);
  });

  it('도망을 놓친 장면: 살릴 돌에 동그라미, 정답은 늘기', () => {
    const spec = cap([P(2, 2), P(1, 2), P(4, 4), P(2, 1), P(4, 3), P(3, 2), P(0, 0)]);
    const [m] = analyzeGame(spec).mistakes;
    const s = sceneFromMistake(spec, m, 5)!;
    expect(s.kind).toBe('escape');
    expect(s.libsOf).toEqual([2, 2]);
    expect(resolve(sceneStep(s), s.size).targets).toEqual([P(2, 3)]);
  });

  it('13줄 장면은 9×9로 잘라 내고, 정답 자리는 그대로', () => {
    const Q = (x: number, y: number) => toPoint(13, x, y);
    const spec: ReplaySpec = {
      mode: 'normal',
      size: 13,
      captureTarget: 1,
      moves: [Q(1, 2), Q(12, 12), Q(2, 1), Q(12, 11), Q(3, 2), Q(2, 2), Q(0, 0)],
    };
    const [m] = analyzeGame(spec).mistakes;
    expect(m.kind).toBe('missed-capture');
    const s = sceneFromMistake(spec, m, 1)!;
    expect(s.size).toBe(9);
    expect(s.w.length).toBe(1); // 멀리 있는 하양이 돌은 잘려 나감
    const [wx, wy] = s.w[0];
    expect(resolve(sceneStep(s), 9).targets).toEqual([(wy + 1) * 9 + wx]);
  });

  it('실제 대국에서 만든 문제는 모두 원래 판과 정답 수가 같다', () => {
    let made = 0;
    for (const [size, mode] of [[7, 'capture'], [9, 'normal'], [13, 'normal']] as const) {
      for (let seed = 1; seed <= 3; seed++) {
        const rand = rng(seed * 31 + size);
        const g = new Game({ size, mode, captureTarget: 3 });
        for (let i = 0; i < size * size * 2 && !g.isOver; i++) {
          const c = chooseMove(g, { level: g.toMove === BLACK ? 1 : 2, rand });
          if (c.point == null) g.pass();
          else g.play(c.point);
        }
        const spec: ReplaySpec = { mode, size, captureTarget: 3, moves: g.moves.filter((x) => x.type !== 'resign').map((x) => (x.type === 'play' ? x.point : -1)) };
        for (const m of analyzeGame(spec).mistakes) {
          const s = sceneFromMistake(spec, m, seed);
          if (!s) continue;
          made++;
          const kind = s.kind;
          const before = replay(spec, m.index);
          const lo = kind === 'escape' ? findAtari(before) : null;
          const full = [...Array(before.geo.n).keys()].filter((p) => meetsGoal(before, p, kind, lo));
          const t = resolve(sceneStep(s), s.size).targets;
          expect(t.length).toBe(full.length);
          expect(t.length).toBeGreaterThan(0);
          expect([size, 9]).toContain(s.size); // 판 전체 또는 9×9로 자른 판
        }
      }
    }
    expect(made).toBeGreaterThan(0);
  });

  it('장면 연습: 장면 다음에 같은 기술의 새 문제를 붙인다', () => {
    const spec = cap([P(1, 2), P(4, 4), P(2, 1), P(4, 3), P(3, 2), P(2, 2), P(0, 0)]);
    const s = sceneFromMistake(spec, analyzeGame(spec).mistakes[0], 1)!;
    const l = makeSceneLesson([s], 2, rng(3));
    expect(l.practice).toBe('scene');
    expect(l.steps.length).toBe(3);
    expect(l.steps[0]).toMatchObject({ sceneId: '1-6', size: 5 });
    for (const st of l.steps.slice(1)) {
      expect(st).toMatchObject({ kind: 'move', goal: 'capture', size: 7 });
      expect(st.sceneId).toBeUndefined();
    }
  });
});

/** 단수인 까망이 무리 중 살릴 수 있는 것의 돌 하나(시험용) */
function findAtari(g: Game): number | null {
  for (let p = 0; p < g.geo.n; p++) {
    if (g.at(p) !== BLACK || g.group(p).liberties.length !== 1) continue;
    if ([...Array(g.geo.n).keys()].some((q) => meetsGoal(g, q, 'escape', p))) return p;
  }
  return null;
}

describe('핵심 그림(두 번 틀리면)', () => {
  const at = (c: { ring: [number, number] }) => c.ring[1] * 5 + c.ring[0];
  it('단수·잡기: 동그라미가 하양이의 마지막 숨구멍이고, 두면 잡힌다', () => {
    for (const c of [KEY_CARDS.find, KEY_CARDS.capture]) {
      const g = Game.fromDiagram(c.rows, BLACK);
      expect(g.group(P(2, 2)).liberties).toEqual([at(c)]);
      expect(meetsGoal(g, at(c), 'capture', null)).toBe(true);
    }
  });
  it('도망가기: 동그라미에 두면 숨구멍이 늘어 산다', () => {
    const c = KEY_CARDS.escape;
    const g = Game.fromDiagram(c.rows, BLACK);
    expect(g.group(P(2, 2)).liberties.length).toBe(1);
    expect(meetsGoal(g, at(c), 'escape', P(2, 2))).toBe(true);
  });
  it('삶·죽이기: 동그라미가 유일한 급소', () => {
    const region = [P(1, 4), P(2, 4), P(3, 4)];
    const live = Game.fromDiagram(KEY_CARDS.live.rows, BLACK);
    expect(vitalPoints(live, P(0, 3), region, 'live')).toEqual([at(KEY_CARDS.live)]);
    const kill = Game.fromDiagram(KEY_CARDS.kill.rows, BLACK);
    expect(vitalPoints(kill, P(0, 3), region, 'kill')).toEqual([at(KEY_CARDS.kill)]);
  });
  it('문제 종류에 맞는 그림을 고른다', () => {
    expect(keyCardFor({ kind: 'find', text: '', done: '', wrong: '' })?.lesson).toBe(4);
    expect(keyCardFor({ kind: 'move', goal: 'escape', text: '', done: '', wrong: '' })?.lesson).toBe(6);
    expect(keyCardFor({ kind: 'explain', text: '' })).toBeNull();
  });
});
