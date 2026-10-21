import { describe, expect, it } from 'vitest';
import { BLACK, WHITE, Game, toPoint } from '../src/engine/rules';
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

  it('경계가 다 정해지고 침입한 돌이 없는 판에서는 죽은 돌이 없다', () => {
    // (전에는 '하양이끼리 끝까지 둔 판'으로 시험했지만, 사석을 들어내는 규칙이 되면서 하양이가 죽은 돌을 남긴 채
    //  끝내는 일이 생겨 정답을 알 수 없는 시험이 됨 → 정답이 분명한 판으로 바꿈)
    const g = Game.fromDiagram(
      [
        '. . . . X O . . .',
        '. . . . X O . . .',
        '. . . . X O . . .',
        '. . . X X O O . .',
        '. . . X . X O . .',
        '. . . X X X O . .',
        '. . . . X O O . .',
        '. . . . X O . . .',
        '. . . . X O . . .',
      ],
      BLACK,
    );
    for (let i = 0; i < 5; i++) expect(estimateDead(g, { rand: rng(60 + i) })).toEqual([]);
  });
});
