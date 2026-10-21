import { describe, expect, it } from 'vitest';
import { BLACK, WHITE, Game } from '../src/engine/rules';
import { chooseMove, type Level } from '../src/engine/ai/beginner';
import { estimateDead } from '../src/engine/ai/dead';
import { hopeless } from '../src/engine/ai/resign';

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

describe('하양이 기권', () => {
  it('크게 지고 있는 판(실제 대국 화면)에서는 기권한다', () => {
    const g = Game.fromDiagram(
      [
        '. . . . . X . O O X . . .',
        '. . . . . X . O X X X . .',
        '. . X X X O O O O X X . .',
        '. . . O X X X X X . . X .',
        '. . X X X . . . X X . X X',
        '. . X O O . . . . X . . X',
        '. . X X O . O X X X X X O',
        '. . X . X . X X O O X X .',
        '. O X . X . X O O O O X .',
        '. X X X . X . O O X X . .',
        '. . X . . . X O X X . . .',
        '. O X X X X X O O X . . O',
        '. O . . . . . X X X . . .',
      ],
      WHITE,
      { mode: 'normal' },
    );
    for (let i = 0; i < 3; i++) expect(hopeless(g, WHITE, { rand: rng(i) })).toBe(true);
    expect(hopeless(g, BLACK, { rand: rng(9) })).toBe(false); // 이기는 쪽은 당연히 아님
  }, 20000);

  it('판이 덜 찼거나 따내기 바둑이면 기권하지 않는다', () => {
    const g = new Game({ size: 9, mode: 'normal' });
    g.play(40);
    expect(hopeless(g, WHITE)).toBe(false);
    const c = Game.fromDiagram(['X X X . .', 'X X X . .', 'X X X . .', '. . . . .', '. . . O .'], WHITE, { mode: 'capture' });
    expect(hopeless(c, WHITE)).toBe(false);
  });

  it('하양이끼리 둘 때 두 번 연속 기권 판단이 나온 쪽은 끝까지 둬도 진다', () => {
    let resigned = 0;
    for (let i = 0; i < 10; i++) {
      const rand = rng(500 + i);
      const g = new Game({ size: 9, mode: 'normal' });
      const lv: [Level, Level] = [((i % 3) + 1) as Level, (((i + 2) % 3) + 1) as Level];
      const streak = { [BLACK]: 0, [WHITE]: 0 } as Record<number, number>;
      let quitter: number | null = null;
      while (!g.isOver) {
        const me = g.toMove;
        if (quitter == null) {
          streak[me] = hopeless(g, me, { rand }) ? streak[me] + 1 : 0;
          if (streak[me] >= 2) quitter = me;
        }
        const c = chooseMove(g, { level: lv[me === BLACK ? 0 : 1], rand });
        if (c.point === null) g.pass();
        else g.play(c.point);
      }
      if (quitter == null) continue;
      resigned++;
      const r = g.settle(estimateDead(g, { rand }));
      expect(r && 'winner' in r && r.winner).not.toBe(quitter);
    }
    expect(resigned).toBeLessThanOrEqual(10);
  }, 60000);
});
