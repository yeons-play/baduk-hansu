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

describe('집 짓는 바둑 AI', () => {
  const play = (size: number, seed: number, levels: [Level, Level]) => {
    const rand = rng(seed);
    const g = new Game({ size, mode: 'normal' });
    let n = 0;
    while (!g.isOver && n < size * size * 4) {
      const c = chooseMove(g, { level: levels[n % 2], rand });
      if (c.point === null) g.pass();
      else expect(g.play(c.point).ok).toBe(true);
      n++;
    }
    return { g, n };
  };

  it('AI끼리 9줄 바둑을 두면 합법수만 두고 양쪽 패스로 끝난다', () => {
    for (let i = 0; i < 12; i++) {
      const lv = [((i % 3) + 1) as Level, (((i + 1) % 3) + 1) as Level] as [Level, Level];
      const { g } = play(9, 500 + i, lv);
      expect(g.isOver).toBe(true);
      expect(g.result?.reason).toBe('score');
    }
  });

  it('AI끼리 13줄 바둑도 합법수만 두고 양쪽 패스로 끝나며, 한 수가 빠르다', () => {
    for (let i = 0; i < 4; i++) {
      const lv = [((i % 3) + 1) as Level, (((i + 1) % 3) + 1) as Level] as [Level, Level];
      const t = performance.now();
      const { g, n } = play(13, 900 + i, lv);
      expect(g.isOver).toBe(true);
      expect(g.result?.reason).toBe('score');
      expect((performance.now() - t) / n).toBeLessThan(50); // 한 수 평균 50ms 미만
    }
  });

  it('끝난 판에 자기 눈을 메운 흔적이 없다(3단계끼리)', () => {
    const { g } = play(9, 777, [3, 3]);
    expect(g.isOver).toBe(true);
    // 양쪽 모두 판 위에 돌이 남아 있어야 함(스스로 다 메워 죽지 않음)
    const s = g.score();
    expect(s.blackStones).toBeGreaterThan(5);
    expect(s.whiteStones).toBeGreaterThan(5);
  });

  it('자기 집 안의 약한 상대 돌은 패스하기 전에 잡는다', () => {
    // 백 집 안(오른쪽)에 흑 한 점, 백 차례
    const g = Game.fromDiagram(
      [
        '. . . . . X O . .',
        '. . . . . X O . .',
        '. . . . . X O . .',
        '. . . . . X O . .',
        '. . . . . X O X .',
        '. . . . . X O . .',
        '. . . . . X O . .',
        '. . . . . X O . .',
        '. . . . . X O . .',
      ],
      WHITE,
    );
    const c = chooseMove(g, { level: 3, rand: rng(3) });
    expect(c.point).not.toBeNull();
    // 백이 패스하지 않고 흑 돌 옆에서 쫓는다
    const near = [toPoint(9, 7, 3), toPoint(9, 7, 5), toPoint(9, 8, 4)];
    expect(near).toContain(c.point);
  });

  it('둘 곳이 없는 판에서는 패스한다', () => {
    const g = Game.fromDiagram(
      [
        '. . . X O . . . .',
        '. . . X O . . . .',
        '. . . X O . . . .',
        '. . . X O . . . .',
        '. . . X O . . . .',
        '. . . X O . . . .',
        '. . . X O . . . .',
        '. . . X O . . . .',
        '. . . X O . . . .',
      ],
      WHITE,
    );
    expect(chooseMove(g, { level: 3, rand: rng(4) }).point).toBeNull();
    g.pass();
    expect(chooseMove(g, { level: 2, rand: rng(5) }).point).toBeNull();
  });
});

describe('집 짓는 바둑 AI 모양', () => {
  const squares = (g: Game) => {
    let n = 0;
    for (let y = 0; y < g.size - 1; y++)
      for (let x = 0; x < g.size - 1; x++) {
        const c = g.atXY(x, y);
        if (c && c === g.atXY(x + 1, y) && c === g.atXY(x, y + 1) && c === g.atXY(x + 1, y + 1)) n++;
      }
    return n;
  };

  it('초반 20수 동안 돌을 네모(2×2)로 뭉치지 않는다', () => {
    for (let i = 0; i < 10; i++) {
      const rand = rng(900 + i);
      const g = new Game({ size: 9, mode: 'normal' });
      for (let n = 0; n < 20 && !g.isOver; n++) {
        const c = chooseMove(g, { level: (((i + n) % 2) + 2) as Level, rand });
        if (c.point === null) g.pass();
        else g.play(c.point);
      }
      expect(squares(g)).toBe(0);
    }
  });

  it('빈 곳이 넓으면 자기 돌 옆에 붙이기보다 넓은 쪽으로 벌린다', () => {
    // 백 돌 넷이 뭉쳐 있고 오른쪽·아래가 넓게 비어 있음 — 백은 덩어리에 또 붙이지 않는다
    const g = Game.fromDiagram(
      [
        '. . . . . . . . .',
        '. . . . . . . . .',
        '. . O O O . . . .',
        '. . O O . . . . .',
        '. . . . . . . . .',
        '. . X . . . X . .',
        '. . . . . . . . .',
        '. . . . . . . . .',
        '. . . . . . . . .',
      ],
      WHITE,
    );
    const c = chooseMove(g, { level: 3, rand: rng(11) });
    expect(c.point).not.toBeNull();
    const own = g.geo.neighbors[c.point!].filter((q) => g.at(q) === WHITE).length;
    expect(own).toBeLessThanOrEqual(1);
  });
});
