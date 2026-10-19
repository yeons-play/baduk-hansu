// 1단계 검증: 함정 사례 단위 테스트
import { describe, expect, it } from 'vitest';
import { BLACK, WHITE, Game, toPoint } from '../src/engine/rules';

const P = (g: Game, x: number, y: number) => toPoint(g.size, x, y);

describe('착수 기본', () => {
  it('흑이 먼저 두고 교대로 둔다', () => {
    const g = new Game();
    expect(g.toMove).toBe(BLACK);
    expect(g.playXY(4, 4).ok).toBe(true);
    expect(g.toMove).toBe(WHITE);
    expect(g.atXY(4, 4)).toBe(BLACK);
  });

  it('돌이 있는 곳과 판 밖에는 둘 수 없다', () => {
    const g = new Game();
    g.playXY(0, 0);
    expect(g.playXY(0, 0)).toEqual({ ok: false, reason: 'occupied' });
    expect(g.playXY(9, 0)).toEqual({ ok: false, reason: 'off-board' });
    expect(g.playXY(-1, 3)).toEqual({ ok: false, reason: 'off-board' });
  });

  it('귀·변·중앙의 활로 수가 맞다', () => {
    const g = new Game();
    g.playXY(0, 0);
    g.playXY(4, 0);
    g.playXY(4, 4);
    expect(g.group(P(g, 0, 0)).liberties.length).toBe(2);
    expect(g.group(P(g, 4, 0)).liberties.length).toBe(3);
    expect(g.group(P(g, 4, 4)).liberties.length).toBe(4);
  });
});

describe('따내기', () => {
  it('마지막 활로를 막으면 돌을 따낸다', () => {
    const g = Game.fromDiagram(['. X . . .', 'X O X . .', '. . . . .', '. . . . .', '. . . . .'], BLACK);
    const r = g.playXY(1, 2);
    expect(r.ok).toBe(true);
    expect(r.ok && r.captured).toEqual([P(g, 1, 1)]);
    expect(g.atXY(1, 1)).toBe(0);
    expect(g.captures(BLACK)).toBe(1);
  });

  it('한 수로 서로 다른 그룹 두 개를 동시에 따낸다', () => {
    const g = Game.fromDiagram(['X O . O X', '. X . X .', '. . . . .', '. . . . .', '. . . . .'], BLACK);
    const r = g.playXY(2, 0);
    expect(r.ok && r.captured.length).toBe(2);
    expect(g.atXY(1, 0)).toBe(0);
    expect(g.atXY(3, 0)).toBe(0);
  });

  it('착수 직후 활로가 0이어도 상대를 따내면 합법 (따내기를 먼저 판정)', () => {
    const g = Game.fromDiagram(['. X O . .', 'X O . O .', '. X O . .', '. . . . .', '. . . . .'], BLACK);
    const r = g.playXY(2, 1);
    expect(r.ok).toBe(true);
    expect(g.atXY(1, 1)).toBe(0);
  });
});

describe('자살수 금지', () => {
  it('한 점 자살수는 둘 수 없다', () => {
    const g = Game.fromDiagram(['. O . . .', 'O . . . .', '. . . . .', '. . . . .', '. . . . .'], BLACK);
    expect(g.playXY(0, 0)).toEqual({ ok: false, reason: 'suicide' });
    expect(g.toMove).toBe(BLACK);
  });

  it('여러 점 자살수도 둘 수 없다', () => {
    const g = Game.fromDiagram(['X . O . .', 'O O . . .', '. . . . .', '. . . . .', '. . . . .'], BLACK);
    expect(g.playXY(1, 0)).toEqual({ ok: false, reason: 'suicide' });
  });
});

describe('패와 동형반복 금지', () => {
  const ko = () => Game.fromDiagram(['. X O . .', 'X O . O .', '. X O . .', '. . . . .', '. . . . .'], BLACK);

  it('패를 따낸 직후 바로 되따기는 불법', () => {
    const g = ko();
    g.playXY(2, 1); // 흑이 패를 따냄
    expect(g.playXY(1, 1)).toEqual({ ok: false, reason: 'superko' });
  });

  it('다른 곳에 한 수씩 둔 뒤에는 되따기 가능', () => {
    const g = ko();
    g.playXY(2, 1);
    g.playXY(4, 4); // 백 팻감
    g.playXY(4, 3); // 흑 받음
    expect(g.playXY(1, 1).ok).toBe(true);
  });

  it('패스는 판을 바꾸지 않으므로 이력에 새로 들어가지 않는다', () => {
    const g = ko();
    const before = g.positionKey;
    g.playXY(2, 1);
    g.pass(); // 백 패스
    g.playXY(4, 4); // 흑 다른 곳
    // 판이 처음과 다르므로 백의 되따기는 합법
    expect(g.playXY(1, 1).ok).toBe(true);
    expect(g.positionKey).not.toBe(before);
  });

  it('되따기로 두 점 이상을 따내는 경우는 패가 아니므로 합법', () => {
    const g = Game.fromDiagram(['O X O . .', '. X O . .', 'O O . . .', '. . . . .', '. . . . .'], BLACK);
    const r1 = g.playXY(0, 1); // 흑이 귀의 백 한 점을 따냄
    expect(r1.ok && r1.captured).toEqual([P(g, 0, 0)]);
    const r2 = g.playXY(0, 0); // 백이 따낸 자리에 되두어 흑 3점을 따냄(되따기)
    expect(r2.ok).toBe(true);
    expect(r2.ok && r2.captured.length).toBe(3);
  });
});

describe('대국 종료', () => {
  it('연속 패스 2회로 끝나고 면적 계가로 승패를 낸다', () => {
    const g = new Game({ size: 5, komi: 7 });
    for (let y = 0; y < 5; y++) {
      g.playXY(1, y);
      g.playXY(3, y);
    }
    g.pass();
    expect(g.isOver).toBe(false);
    g.pass();
    expect(g.isOver).toBe(true);
    const r = g.result!;
    expect(r.reason).toBe('score');
    if (r.reason === 'score') {
      expect(r.score.blackTotal).toBe(10);
      expect(r.score.whiteTotal).toBe(17);
      expect(r.score.neutral).toBe(5); // 가운데 줄은 양쪽에 닿아 중립
      expect(r.winner).toBe(WHITE);
    }
  });

  it('패스 사이에 착수가 있으면 연속 패스가 아니다', () => {
    const g = new Game();
    g.pass();
    g.playXY(4, 4);
    g.pass();
    expect(g.isOver).toBe(false);
  });

  it('끝난 대국에는 둘 수 없다', () => {
    const g = new Game();
    g.pass();
    g.pass();
    expect(g.playXY(4, 4)).toEqual({ ok: false, reason: 'game-over' });
    expect(g.pass()).toEqual({ ok: false, reason: 'game-over' });
  });

  it('기권하면 상대가 이긴다', () => {
    const g = new Game();
    g.resign();
    expect(g.result).toEqual({ winner: WHITE, reason: 'resign' });
  });

  it('덤과 점수가 같으면 무승부', () => {
    const g = new Game({ size: 5, komi: 0 });
    for (let y = 0; y < 5; y++) {
      g.playXY(1, y);
      g.playXY(3, y);
    }
    g.pass();
    g.pass();
    expect(g.result?.winner).toBe(null);
  });
});

describe('면적 계가', () => {
  it('빅처럼 양쪽 돌에 닿는 빈 곳은 누구 집도 아니다', () => {
    // 가운데 두 칸이 흑·백 모두에 닿음
    const g = Game.fromDiagram(['X X O O .', 'X . . O .', 'X X O O .', '. X O . .', '. X O . .'], BLACK, {
      komi: 0,
    });
    const s = g.score();
    expect(s.owner[P(g, 1, 1)]).toBe(0);
    expect(s.owner[P(g, 2, 1)]).toBe(0);
    expect(s.owner[P(g, 0, 3)]).toBe(BLACK);
    expect(s.owner[P(g, 4, 0)]).toBe(WHITE);
  });

  it('판 위의 돌은 모두 산 돌로 센다(사석 자동 판정 없음)', () => {
    const g = Game.fromDiagram(['. . . . .', '. . . . .', '. . O . .', '. . . . .', '. . . . .'], BLACK, {
      komi: 0,
    });
    const s = g.score();
    expect(s.whiteTotal).toBe(25);
    expect(s.blackTotal).toBe(0);
  });
});

describe('따내기 바둑', () => {
  it('목표만큼 먼저 따내면 이긴다', () => {
    const g = Game.fromDiagram(['. X . . .', 'X O X . .', '. . . . .', '. . . . .', '. . . . .'], BLACK, {
      mode: 'capture',
      captureTarget: 1,
    });
    g.playXY(1, 2);
    expect(g.result).toEqual({ winner: BLACK, reason: 'capture' });
  });

  it('목표가 3점이면 2점까지는 계속 둔다', () => {
    const g = Game.fromDiagram(['. X . . .', 'X O X . .', '. . . . .', '. . . . .', '. . . . .'], BLACK, {
      mode: 'capture',
      captureTarget: 3,
    });
    g.playXY(1, 2);
    expect(g.isOver).toBe(false);
  });

  it('아무도 못 따내고 둘 다 패스하면 무승부', () => {
    const g = new Game({ mode: 'capture' });
    g.pass();
    g.pass();
    expect(g.result).toEqual({ winner: null, reason: 'no-capture' });
  });
});

describe('무르기', () => {
  it('따낸 수를 무르면 판·따낸 수·이력이 모두 돌아온다', () => {
    const g = Game.fromDiagram(['. X O . .', 'X O . O .', '. X O . .', '. . . . .', '. . . . .'], BLACK);
    const before = g.board();
    g.playXY(2, 1);
    expect(g.undo()).toBe(true);
    expect(Array.from(g.board())).toEqual(Array.from(before));
    expect(g.captures(BLACK)).toBe(0);
    expect(g.toMove).toBe(BLACK);
    // 이력에서 지워졌으므로 같은 수를 다시 둘 수 있어야 함
    expect(g.playXY(2, 1).ok).toBe(true);
  });

  it('종료 후 무르면 대국이 다시 열린다', () => {
    const g = new Game();
    g.pass();
    g.pass();
    g.undo();
    expect(g.isOver).toBe(false);
    expect(g.consecutivePasses).toBe(1);
  });
});
