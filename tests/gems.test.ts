// 보석 계산·저장 검사
import { beforeEach, describe, expect, it } from 'vitest';

const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: unknown }).localStorage = {
  get length() {
    return mem.size;
  },
  key: (i: number) => [...mem.keys()][i] ?? null,
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
};

const { GEM_RULES, gemsForGame } = await import('../src/gems');
const S = await import('../src/storage');

const none = { capture: 0, escape: 0 };
const lo = () => 0;
const hi = () => 0.9999;

describe('한 판에서 받는 보석', () => {
  it('지거나 비겨도 끝까지 두면 늘 받는다', () => {
    for (const outcome of ['loss', 'draw'] as const) {
      const a = gemsForGame({ outcome, quit: false, mode: 'capture', level: 1, good: none }, lo);
      const b = gemsForGame({ outcome, quit: false, mode: 'capture', level: 1, good: none }, hi);
      expect(a.total).toBe(GEM_RULES.finish[0]);
      expect(b.total).toBe(GEM_RULES.finish[1]);
    }
  });

  it('이기면 더 많지만 다섯 배까지 벌어지지 않는다', () => {
    const w = gemsForGame({ outcome: 'win', quit: false, mode: 'capture', level: 1, good: none }, lo);
    expect(w.total).toBe(GEM_RULES.win[0]);
    expect(GEM_RULES.win[0]).toBeGreaterThan(GEM_RULES.finish[1]);
    expect(GEM_RULES.win[1] / GEM_RULES.finish[0]).toBeLessThanOrEqual(5);
  });

  it('그만하기로 끝내면 없다', () => {
    expect(gemsForGame({ outcome: 'loss', quit: true, mode: 'normal', level: 3, good: { capture: 3, escape: 0 } }).total).toBe(0);
  });

  it('어려운 하양이·진짜 바둑일수록 더 준다', () => {
    const at = (level: 1 | 2 | 3, mode: 'capture' | 'normal') =>
      gemsForGame({ outcome: 'win', quit: false, mode, level, good: none }, lo).total;
    expect(at(2, 'capture')).toBeGreaterThan(at(1, 'capture'));
    expect(at(3, 'capture')).toBeGreaterThan(at(2, 'capture'));
    expect(at(1, 'normal')).toBe(2 * at(1, 'capture'));
    // 어려운 하양이에게 지는 것이 쉬운 하양이를 이기는 것보다 아주 적지는 않게
    const hardLoss = gemsForGame({ outcome: 'loss', quit: false, mode: 'capture', level: 3, good: none }, hi).total;
    expect(hardLoss).toBeGreaterThanOrEqual(at(1, 'capture'));
  });

  it('잘한 수는 하나에 하나씩, 한 판 최대까지', () => {
    const a = gemsForGame({ outcome: 'loss', quit: false, mode: 'capture', level: 1, good: { capture: 1, escape: 1 } }, lo);
    expect(a.bonus).toBe(2);
    expect(a.total).toBe(a.base + 2);
    const b = gemsForGame({ outcome: 'loss', quit: false, mode: 'normal', level: 1, good: { capture: 20, escape: 4 } }, lo);
    expect(b.bonus).toBe(GEM_RULES.goodMax);
  });

  it('언제나 정수', () => {
    for (let i = 0; i < 200; i++) {
      const g = gemsForGame({
        outcome: (['win', 'loss', 'draw'] as const)[i % 3],
        quit: false,
        mode: i % 2 ? 'normal' : 'capture',
        level: ((i % 3) + 1) as 1 | 2 | 3,
        good: { capture: i % 4, escape: i % 2 },
      });
      expect(Number.isInteger(g.total)).toBe(true);
      expect(g.total).toBeGreaterThan(0);
    }
  });
});

describe('보석함 저장', () => {
  beforeEach(() => mem.clear());

  it('처음엔 0개, 받으면 늘고 모은 수도 는다', () => {
    expect(S.loadGems()).toEqual({ v: 1, count: 0, earned: 0 });
    S.addGems(7);
    S.addGems(0);
    S.addGems(-3);
    expect(S.loadGems()).toMatchObject({ count: 7, earned: 7 });
  });

  it('목표만큼 모으면 선물로 바꾸고, 모자라면 그대로', () => {
    S.setGemGoal({ count: 10, gift: '  아이스크림  ' });
    S.addGems(8);
    expect(S.spendGemGoal()).toBe(false);
    expect(S.loadGems().count).toBe(8);
    S.addGems(5);
    expect(S.spendGemGoal()).toBe(true);
    expect(S.loadGems()).toMatchObject({ count: 3, earned: 13, goal: { count: 10, gift: '아이스크림' } });
    S.setGemGoal(null);
    expect(S.loadGems().goal).toBeUndefined();
  });

  it('망가진 값은 0으로 읽고, 백업에 함께 들어간다', () => {
    mem.set('baduk-gems', JSON.stringify({ v: 1, count: 'x', earned: -4, goal: { count: 0 } }));
    expect(S.loadGems()).toEqual({ v: 1, count: 0, earned: 0 });
    S.addGems(4);
    expect(Object.keys(S.exportBackup().data)).toContain('baduk-gems');
  });
});
