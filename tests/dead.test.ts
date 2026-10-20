import { describe, expect, it } from 'vitest';
import { BLACK, WHITE, Game, toPoint } from '../src/engine/rules';
import { chooseMove } from '../src/engine/ai/beginner';
import { estimateDead } from '../src/engine/ai/dead';

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

describe('계가: 죽은 돌 들어내기(규칙 엔진)', () => {
  // 흑이 왼쪽, 백이 오른쪽. 흑 집 안에 백 한 점(죽은 돌)
  const g = Game.fromDiagram(
    [
      '. . X O . .',
      '. O X O . .',
      '. . X O . .',
      '. . X O . .',
      '. . X O . .',
      '. . X O . .',
    ],
    BLACK,
  );
  const deadW = toPoint(6, 1, 1);

  it('죽은 돌을 주면 그 돌을 빼고, 그 자리와 주변 빈 곳이 둘러싼 쪽 집이 된다', () => {
    const before = g.score();
    expect(before.blackArea).toBe(0); // 백 한 점 때문에 왼쪽 빈 곳은 누구 집도 아님
    const after = g.score([deadW]);
    expect(after.whiteStones).toBe(before.whiteStones - 1);
    expect(after.blackArea).toBe(12); // 왼쪽 두 줄 12점 모두 흑 집
    expect(g.at(deadW)).toBe(WHITE); // 판은 그대로
  });

  it('빈 점이나 판 밖 점을 죽은 돌로 줘도 무시한다', () => {
    expect(g.score([toPoint(6, 0, 0), -1, 999]).blackArea).toBe(g.score().blackArea);
  });

  it('settle: 양쪽이 넘겨 끝난 대국의 결과를 죽은 돌 뺀 계가로 다시 정한다', () => {
    const h = Game.fromDiagram(['. . X O . .', '. O X O . .', '. . X O . .', '. . X O . .', '. . X O . .', '. . X O . .'], BLACK, { komi: 0 });
    h.pass();
    h.pass();
    expect(h.result?.reason).toBe('score');
    expect(h.result && 'winner' in h.result && h.result.winner).toBe(WHITE); // 죽은 돌을 살아 있다고 세면 백 19 : 흑 6
    const r = h.settle([toPoint(6, 1, 1)]);
    expect(r && r.reason === 'score' && r.score.blackTotal).toBe(18);
    expect(r && r.reason === 'score' && r.score.whiteTotal).toBe(18);
    expect(r && 'winner' in r && r.winner).toBeNull(); // 들어내면 18 : 18
    // 되돌리면 다시 둘 수 있음
    expect(h.undo()).toBe(true);
    expect(h.isOver).toBe(false);
  });
});

describe('죽은 돌 짐작', () => {
  it('넓은 흑 집 안에 혼자 있는 백 돌은 죽은 돌로 본다', () => {
    const g = Game.fromDiagram(
      [
        '. . . . X O . . .',
        '. . . . X O . . .',
        '. O . . X O . . .',
        '. . . . X O . . .',
        '. . . . X O . . .',
        '. . . . X O . X .',
        '. . . . X O . . .',
        '. . . . X O . . .',
        '. . . . X O . . .',
      ],
      BLACK,
    );
    const dead = estimateDead(g, { rand: rng(1) });
    expect(dead).toContain(toPoint(9, 1, 2)); // 흑 집 안 백
    expect(dead).toContain(toPoint(9, 7, 5)); // 백 집 안 흑
    expect(dead).not.toContain(toPoint(9, 4, 0)); // 벽은 산 돌
    expect(dead).not.toContain(toPoint(9, 5, 0));
  });

  it('눈이 둘인 무리는 작아도 죽은 돌로 보지 않는다', () => {
    const g = Game.fromDiagram(
      [
        '. X . X O . . . .',
        'X X X X O . . . .',
        'O O O O O . . . .',
        '. . . . . . . . .',
        '. . . . . . . . .',
        '. . . . . . . . .',
        '. . . . . . . . .',
        '. . . . . . . . .',
        '. . . . . . . . .',
      ],
      BLACK,
    );
    const dead = estimateDead(g, { rand: rng(2) });
    expect(dead).not.toContain(toPoint(9, 1, 0));
  });

  it('하양이끼리 끝까지 둔 판(죽은 돌을 다 잡고 끝냄)에서는 거의 짐작하지 않는다', () => {
    let wrong = 0;
    for (let i = 0; i < 6; i++) {
      const rand = rng(40 + i);
      const g = new Game({ size: 9, mode: 'normal' });
      while (!g.isOver) {
        const c = chooseMove(g, { level: 3, rand });
        if (c.point === null) g.pass();
        else g.play(c.point);
      }
      wrong += estimateDead(g, { rand }).length;
    }
    // 애매한 모양(한 수 더 둬 봐야 아는 무리)은 짐작이 틀릴 수 있다 — 그래서 집 세기 화면에서 사람이 눌러 고친다
    expect(wrong).toBeLessThanOrEqual(12);
  });
});
