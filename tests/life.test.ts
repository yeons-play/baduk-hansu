import { describe, expect, it } from 'vitest';
import { BLACK, WHITE, Game, toPoint } from '../src/engine/rules';
import { lives, vitalPoints } from '../src/lessons/life';
import { resolve } from '../src/lessons/engine';
import { makeStep, PSIZE } from '../src/lessons/practice';

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

const WALL = ['. . . . . . .', '. . . . . . .', '. . . . . . .', '. . . . . . .', 'X X X X X X X'];
const at = (x: number, y: number) => toPoint(7, x, y);
const solve = (rows: string[], region: [number, number][], first: number) => {
  const g = Game.fromDiagram(rows, first as 1 | 2, { mode: 'capture', captureTarget: 99 });
  return { g, R: region.map(([x, y]) => at(x, y)) };
};

describe('사활 풀이(교과서 모양)', () => {
  it('일자 세 칸: 먼저 두는 쪽이 이긴다, 급소는 가운데', () => {
    const rows = [...WALL, 'X O O O O O X', 'X O . . . O X'];
    const reg: [number, number][] = [[2, 6], [3, 6], [4, 6]];
    expect(lives(solve(rows, reg, WHITE).g, at(1, 5), solve(rows, reg, WHITE).R)).toBe(true);
    const b = solve(rows, reg, BLACK);
    expect(lives(b.g, at(1, 5), b.R)).toBe(false);
    expect(vitalPoints(b.g, at(1, 5), b.R, 'kill')).toEqual([at(3, 6)]);
  });

  it('일자 네 칸(직사궁)은 까망이가 먼저 둬도 산다 — 사용자 그림 모양', () => {
    const rows = [...WALL, 'X O O O O O O', 'X O . . . . O'];
    const b = solve(rows, [[2, 6], [3, 6], [4, 6], [5, 6]], BLACK);
    expect(lives(b.g, at(1, 5), b.R)).toBe(true);
    expect(vitalPoints(b.g, at(1, 5), b.R, 'kill')).toEqual([]);
  });

  it('네모 네 칸은 하양이가 먼저 둬도 죽는다', () => {
    const rows = ['. . . . . . .', '. . . . . . .', '. . . . . . .', 'X X X X X X .', 'X O O O O X .', 'X O . . O X .', 'X O . . O X .'];
    const w = solve(rows, [[2, 5], [3, 5], [2, 6], [3, 6]], WHITE);
    expect(lives(w.g, at(1, 4), w.R)).toBe(false);
  });

  it('볼록 네 칸: 급소는 가운데', () => {
    const rows = ['. . . . . . .', '. . . . . . .', '. . . . . . .', 'X X X X X X X', 'X O O O O O X', 'X O O . O O X', 'X O . . . O X'];
    const b = solve(rows, [[3, 5], [2, 6], [3, 6], [4, 6]], BLACK);
    expect(vitalPoints(b.g, at(1, 4), b.R, 'kill')).toEqual([at(3, 6)]);
    const w = solve(rows, [[3, 5], [2, 6], [3, 6], [4, 6]], WHITE);
    expect(lives(w.g, at(1, 4), w.R)).toBe(true);
  });
});

describe('사활 연습 문제 자동 생성', () => {
  for (const skill of ['live', 'kill'] as const) {
    it(`${skill === 'live' ? '두 집 만들기' : '죽이기'}: 급소 1~2곳, 상대가 먼저 두면 결과가 반대`, () => {
      const rand = rng(skill === 'live' ? 7 : 8);
      for (let i = 0; i < 40; i++) {
        const s = makeStep(skill, rand);
        if (s.kind !== 'move' || !s.region || !s.libsOf) throw new Error('사활 문제 모양이 아님');
        const r = resolve(s, PSIZE);
        expect(r.game.toMove).toBe(BLACK);
        expect(r.targets.length).toBeGreaterThanOrEqual(1);
        expect(r.targets.length).toBeLessThanOrEqual(2);
        const target = toPoint(PSIZE, ...s.libsOf);
        const region = s.region.map(([x, y]) => toPoint(PSIZE, x, y));
        expect(r.game.at(target)).toBe(skill === 'live' ? BLACK : WHITE);
        // 정답을 두면 목표 달성, 정답 아닌 빈 곳은 실패
        for (const p of region) {
          r.game.play(p);
          const alive = lives(r.game, target, region);
          r.game.undo();
          const good = skill === 'live' ? alive : !alive;
          expect(good).toBe(r.targets.includes(p));
        }
        // 상대가 먼저 두면 반대 결과
        const board = new Uint8Array(PSIZE * PSIZE);
        for (let p = 0; p < board.length; p++) board[p] = r.game.at(p);
        const w = new Game({ size: PSIZE, mode: 'capture', captureTarget: 99 }, { board, toMove: WHITE });
        expect(lives(w, target, region)).toBe(skill === 'kill');
      }
    });
  }
});
