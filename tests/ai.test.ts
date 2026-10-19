import { describe, expect, it } from 'vitest';
import { BLACK, WHITE, Game, toPoint } from '../src/engine/rules';
import { chooseMove, type Level } from '../src/engine/ai/beginner';

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

describe('초급 AI', () => {
  it('3단계는 따낼 수 있으면 따낸다', () => {
    const g = Game.fromDiagram(['. X . . .', 'X O X . .', '. . . . .', '. . . . .', '. . . . .'], BLACK, {
      mode: 'capture',
    });
    const c = chooseMove(g, { level: 3, rand: rng(1) });
    expect(c.point).toBe(toPoint(5, 1, 2));
    expect(c.reason).toBe('win');
  });

  it('3단계는 단수에 걸린 돌을 살린다', () => {
    // 백 한 점이 단수, 아래로 달아날 수 있음
    const g = Game.fromDiagram(['. X . . .', 'X O X . .', '. . . . .', '. . . . .', '. . . . .'], WHITE, {
      mode: 'capture',
    });
    const c = chooseMove(g, { level: 3, rand: rng(2) });
    expect(c.point).toBe(toPoint(5, 1, 2));
  });

  it('AI끼리 따내기 바둑을 두면 항상 합법수로 끝까지 간다', () => {
    for (let i = 0; i < 40; i++) {
      const rand = rng(100 + i);
      const g = new Game({ mode: 'capture', captureTarget: 1 });
      const levels: Level[] = [((i % 3) + 1) as Level, (((i + 1) % 3) + 1) as Level];
      let n = 0;
      while (!g.isOver && n < 200) {
        const c = chooseMove(g, { level: levels[n % 2], rand });
        if (c.point === null) g.pass();
        else expect(g.play(c.point).ok).toBe(true);
        n++;
      }
      expect(g.isOver).toBe(true);
    }
  });

  it('정규 대국에서도 불법수를 두지 않는다', () => {
    const rand = rng(9);
    const g = new Game();
    for (let n = 0; n < 150 && !g.isOver; n++) {
      const c = chooseMove(g, { level: 2, rand });
      if (c.point === null) g.pass();
      else expect(g.play(c.point).ok).toBe(true);
    }
  });
});
