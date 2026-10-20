// 기기 저장·백업 검사 — 브라우저 저장 공간 대신 메모리로 흉내 낸다
import { beforeEach, describe, expect, it } from 'vitest';

class MemoryStorage {
  private m = new Map<string, string>();
  get length() {
    return this.m.size;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
}

const store = new MemoryStorage();
(globalThis as unknown as { localStorage: MemoryStorage }).localStorage = store;

const S = await import('../src/storage');

describe('기기 저장', () => {
  beforeEach(() => store.clear());

  it('설정 기본값에 읽기 빠르기가 있다(예전 설정에도 채워짐)', () => {
    store.setItem('baduk-settings', JSON.stringify({ v: 1, sound: false, voice: true }));
    const st = S.loadSettings();
    expect(st.sound).toBe(false);
    expect(st.rate).toBe('normal');
  });

  it('강의 진도 초기화는 진도만 지운다', () => {
    S.markLessonDone(1);
    S.recordResult('win');
    S.resetLessons();
    expect(S.loadLessons().done).toEqual([]);
    expect(S.loadStats().wins).toBe(1);
  });

  it('백업은 baduk- 키만 담고, 그대로 되살린다', () => {
    S.markLessonDone(1);
    S.markLessonDone(2);
    S.recordResult('win');
    store.setItem('other-app', '"x"');
    const b = S.exportBackup(new Date('2026-10-20T00:00:00Z'));
    expect(Object.keys(b.data).sort()).toEqual(['baduk-lessons', 'baduk-stats']);
    store.clear();
    expect(S.importBackup(JSON.stringify(b))).toBe(true);
    expect(S.loadLessons().done).toEqual([1, 2]);
    expect(S.loadStats().wins).toBe(1);
  });

  it('형식이 틀린 파일은 아무것도 바꾸지 않는다', () => {
    S.markLessonDone(3);
    expect(S.importBackup('그냥 글')).toBe(false);
    expect(S.importBackup(JSON.stringify({ app: 'other', v: 1, data: {} }))).toBe(false);
    expect(S.importBackup(JSON.stringify({ app: 'baduk-hansu', v: 1, data: { 'other-key': '1' } }))).toBe(false);
    expect(S.importBackup(JSON.stringify({ app: 'baduk-hansu', v: 1, data: { 'baduk-lessons': '{깨짐' } }))).toBe(false);
    expect(S.loadLessons().done).toEqual([3]);
  });
});
