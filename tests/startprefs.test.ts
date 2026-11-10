// 시작 시트에서 고른 판 크기·실력 기억하기
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

const S = await import('../src/storage');

describe('시작 시트 기억', () => {
  beforeEach(() => mem.clear());

  it('처음에는 기본값', () => {
    expect(S.loadStartPrefs()).toEqual(S.START_DEFAULTS);
  });

  it('고른 13줄·실력을 다시 열어도 그대로', () => {
    S.saveStartPrefs({ level: 2, size: 9, normalSize: 13, target: 3 });
    expect(S.loadStartPrefs()).toEqual({ level: 2, size: 9, normalSize: 13, target: 3 });
    expect([...mem.keys()].every((k) => k.startsWith('baduk-'))).toBe(true);
  });

  it('이상한 값은 기본값으로', () => {
    mem.set('baduk-start', JSON.stringify({ level: 9, size: 11, normalSize: 19, target: 'x' }));
    expect(S.loadStartPrefs()).toEqual(S.START_DEFAULTS);
    mem.set('baduk-start', '깨진 글');
    expect(S.loadStartPrefs()).toEqual(S.START_DEFAULTS);
  });
});
