import { describe, expect, it } from 'vitest';
import { toPoint } from '../src/engine/rules';
import { findMistakes, replay } from '../src/engine/ai/review';

const P = (x: number, y: number) => toPoint(5, x, y);
const cap = (moves: number[]) => ({ mode: 'capture' as const, size: 5, captureTarget: 3, moves });
const normal = (moves: number[]) => ({ mode: 'normal' as const, size: 5, captureTarget: 1, moves });

describe('복습: 놓친 장면', () => {
  it('잡을 수 있었는데 다른 곳에 두면 missed-capture, 잡는 자리를 알려 준다', () => {
    // 하양이가 까망이 셋 사이(2,2)에 들어와 단수 → 까망이가 (2,3) 대신 (0,0)
    const moves = [P(1, 2), P(4, 4), P(2, 1), P(4, 3), P(3, 2), P(2, 2), P(0, 0)];
    const ms = findMistakes(cap(moves));
    expect(ms).toEqual([{ index: 6, kind: 'missed-capture', played: P(0, 0), better: [P(2, 3)], lesson: 5 }]);
  });

  it('제대로 잡으면 실수가 아니다', () => {
    const moves = [P(1, 2), P(4, 4), P(2, 1), P(4, 3), P(3, 2), P(2, 2), P(2, 3)];
    expect(findMistakes(cap(moves))).toEqual([]);
  });

  it('오래 남은 기회는 한 번만 짚는다(방금 생긴 기회만)', () => {
    const moves = [P(1, 2), P(4, 4), P(2, 1), P(4, 3), P(3, 2), P(2, 2), P(0, 0), P(4, 2), P(0, 1)];
    expect(findMistakes(cap(moves)).map((m) => m.index)).toEqual([6]);
  });

  it('내 돌이 단수인데 도망가지 않으면 missed-escape', () => {
    const moves = [P(2, 2), P(1, 2), P(4, 4), P(2, 1), P(4, 3), P(3, 2), P(0, 0)];
    const ms = findMistakes(cap(moves));
    expect(ms.length).toBe(1);
    expect(ms[0].kind).toBe('missed-escape');
    expect(ms[0].better).toContain(P(2, 3));
    expect(ms[0].lesson).toBe(6);
  });

  it('스스로 단수가 되는 자리에 두면 self-atari', () => {
    const moves = [P(4, 4), P(1, 2), P(4, 3), P(2, 1), P(4, 0), P(3, 2), P(2, 2)];
    const ms = findMistakes(cap(moves));
    expect(ms).toEqual([{ index: 6, kind: 'self-atari', played: P(2, 2), better: [], lesson: 4 }]);
  });

  it('정규 대국에서 내 눈을 스스로 메우면 own-eye, 넘기기는 따지지 않는다', () => {
    const moves = [P(1, 0), P(4, 4), P(0, 1), P(3, 4), P(0, 0), -1];
    const ms = findMistakes(normal(moves));
    expect(ms).toEqual([{ index: 4, kind: 'own-eye', played: P(0, 0), better: [], lesson: 9 }]);
  });

  it('replay: k수까지 다시 둔 판', () => {
    const moves = [P(1, 2), P(4, 4), P(2, 1)];
    const g = replay(cap(moves), 2);
    expect(g.moves.length).toBe(2);
    expect(g.at(P(2, 1))).toBe(0);
  });
});
