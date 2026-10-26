// 보호자 요약용 기록 검사 — 한 줄 기록·문제 기록·강의 날짜·기간별 요약·요약 화면
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
const R = await import('../src/records');
const V = await import('../src/summary');
const { PRACTICE, makePractice } = await import('../src/lessons/practice');

type Entry = import('../src/storage').GameLogEntry;
const entry = (id: number, over: Partial<Entry> = {}): Entry => ({
  v: 1,
  id,
  endedAt: new Date(id).toISOString(),
  mode: 'normal',
  size: 13,
  level: 1,
  captureTarget: 1,
  outcome: 'win',
  reason: 'score',
  moves: 150,
  ...over,
});

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('한 줄 기록(판마다)', () => {
  beforeEach(() => store.clear());

  it('새것부터, 같은 판은 하나만, 최대 개수까지만 남긴다', () => {
    S.addGameLog(entry(1));
    S.addGameLog(entry(3));
    S.addGameLog(entry(2));
    S.addGameLog(entry(3, { outcome: 'loss' }));
    expect(S.loadGameLog().map((e) => e.id)).toEqual([3, 2, 1]);
    expect(S.loadGameLog()[0].outcome).toBe('loss');
    S.saveGameLog(Array.from({ length: S.GAME_LOG_MAX + 5 }, (_, i) => entry(i + 10)));
    expect(S.loadGameLog().length).toBe(S.GAME_LOG_MAX);
    expect(S.loadGameLog()[0].id).toBe(S.GAME_LOG_MAX + 14);
  });

  it('망가진 줄은 무시한다', () => {
    store.setItem('baduk-game-log', JSON.stringify([null, { v: 1, id: 'x' }, entry(5)]));
    expect(S.loadGameLog().map((e) => e.id)).toEqual([5]);
  });

  it('처음 한 번은 남아 있는 다시 보기 기록으로 채운다(옛 기록은 다시 두어 놓친 장면을 채우고, 점수 차는 결과 글에서)', () => {
    const P = (x: number, y: number) => y * 5 + x;
    const old = {
      v: 1,
      id: 1,
      mode: 'capture',
      size: 5,
      level: 1,
      captureTarget: 3,
      moves: [P(1, 2), P(4, 4), P(2, 1), P(4, 3), P(3, 2), P(2, 2), P(0, 0)],
      outcome: 'loss',
      reason: 'resign',
      summary: '까망이 그만하기',
      endedAt: '2026-10-21T02:00:00.000Z',
    };
    const scored = {
      v: 1,
      id: 2,
      mode: 'normal',
      size: 9,
      level: 2,
      captureTarget: 1,
      moves: [40, 41, -1, -1],
      good: { capture: 0, escape: 0 },
      missed: {},
      outcome: 'win',
      reason: 'score',
      summary: '까망이 45점 · 하양이 38점',
      endedAt: '2026-10-22T02:00:00.000Z',
    };
    store.setItem('baduk-history', JSON.stringify([scored, old]));
    expect(S.hasGameLog()).toBe(false);
    R.ensureGameLog();
    const log = S.loadGameLog();
    expect(log.map((e) => e.id)).toEqual([2, 1]);
    const a = log.find((e) => e.id === 1)!;
    expect(a.missed?.['missed-capture']).toBe(1); // 잡을 수 있었는데 다른 곳에 둔 장면(복습 화면 검사와 같은 판)
    expect(a.good).toEqual({ capture: 0, escape: 0 });
    expect(a.moves).toBe(7);
    expect(a.hints).toBeUndefined(); // 옛 판은 도와줘를 세지 않았음
    expect(log.find((e) => e.id === 2)!.margin).toBe(7);
    // 한 번 만든 뒤에는 다시 채우지 않는다(다시 보기 기록은 20판만 남으므로)
    store.setItem('baduk-history', '[]');
    R.ensureGameLog();
    expect(S.loadGameLog().length).toBe(2);
  });

  it('다시 보기 기록이 없어도 빈 기록을 만들어 다음부터 쌓는다', () => {
    R.ensureGameLog();
    expect(S.hasGameLog()).toBe(true);
    expect(S.loadGameLog()).toEqual([]);
  });
});

describe('문제 놀이 기록(날짜·기술별)', () => {
  beforeEach(() => store.clear());

  it('푼 수와 한 번에 맞힌 수를 날짜·기술별로 더한다', () => {
    const d = new Date(2026, 9, 26, 10, 0);
    S.addPracticeResult('capture', true, d);
    S.addPracticeResult('capture', false, d);
    S.addPracticeResult('find', true, d);
    expect(S.loadPracticeLog()).toEqual({ '2026-10-26': { capture: [2, 1], find: [1, 1] } });
  });

  it('오래된 날부터 지워 정해진 날 수만 남긴다', () => {
    for (let i = 0; i < S.PRACTICE_LOG_DAYS + 3; i++) S.addPracticeResult('find', true, new Date(2024, 0, 1 + i));
    const keys = Object.keys(S.loadPracticeLog());
    expect(keys.length).toBe(S.PRACTICE_LOG_DAYS);
    expect(keys).not.toContain('2024-01-01');
    expect(keys).not.toContain('2024-01-03');
    expect(keys).toContain('2024-01-04');
  });

  it('연습 문제마다 기술 이름이 있다(섞어서 풀기도 문제별로, 놓친 장면은 scene)', () => {
    const rand = rng(7);
    for (const set of PRACTICE) for (const st of makePractice(set, rand).steps) expect(R.practiceSkillOf(st)).not.toBeNull();
    expect(R.practiceSkillOf({ kind: 'move', goal: 'escape', sceneId: '1-2', text: '', done: '', wrong: '' })).toBe('scene');
    expect(R.practiceSkillOf({ kind: 'move', goal: 'atari', text: '', done: '', wrong: '' })).toBeNull();
    expect(R.practiceSkillOf({ kind: 'explain', text: '' })).toBeNull();
  });

  it('logPractice는 기술을 알 때만 남긴다', () => {
    const d = new Date(2026, 9, 26, 10, 0);
    R.logPractice({ kind: 'find', text: '', done: '', wrong: '' }, true, d);
    R.logPractice({ kind: 'explain', text: '' }, true, d);
    expect(S.loadPracticeLog()).toEqual({ '2026-10-26': { find: [1, 1] } });
  });
});

describe('강의를 처음 끝낸 날', () => {
  beforeEach(() => store.clear());

  it('처음 끝낸 날만 적고, 다시 끝내도 바꾸지 않는다', () => {
    S.markLessonDone(3, new Date('2026-10-20T01:00:00Z'));
    S.markLessonDone(3, new Date('2026-10-26T01:00:00Z'));
    expect(S.loadLessons().at).toEqual({ '3': '2026-10-20T01:00:00.000Z' });
  });

  it('이 기록 전에 끝낸 강은 날짜 없이 그대로', () => {
    store.setItem('baduk-lessons', JSON.stringify({ v: 1, done: [1, 2] }));
    S.markLessonDone(2, new Date('2026-10-26T01:00:00Z'));
    expect(S.loadLessons().at).toBeUndefined();
    S.markLessonDone(4, new Date('2026-10-26T01:00:00Z'));
    expect(S.loadLessons()).toEqual({ v: 1, done: [1, 2, 4], at: { '4': '2026-10-26T01:00:00.000Z' } });
  });
});

describe('기간별 요약', () => {
  const now = new Date(2026, 9, 26, 20, 0); // 10월 26일 저녁(기기 시간)
  const at = (day: number, hour = 12) => new Date(2026, 9, day, hour).toISOString();
  const log: Entry[] = [
    entry(1, { endedAt: at(26), outcome: 'win', hints: 2, undos: 1, good: { capture: 3, escape: 1 }, missed: { 'missed-capture': 1 } }),
    entry(2, { endedAt: at(25), outcome: 'loss', hints: 0, undos: 3, good: { capture: 1, escape: 0 }, missed: { 'self-atari': 2 } }),
    entry(3, { endedAt: at(20, 0), outcome: 'win', reason: 'resign' }), // 7일째 자정 — 들어감
    entry(4, { endedAt: at(19, 23), outcome: 'loss' }), // 8일 전 — 빠짐
    entry(5, { endedAt: at(26), mode: 'capture', size: 7, captureTarget: 1, outcome: 'loss', reason: 'resign' }),
    entry(6, { endedAt: at(26), mode: 'capture', size: 7, captureTarget: 3, outcome: 'draw', reason: 'no-capture' }),
    entry(7, { endedAt: '망가진 날짜' }),
  ];

  it('최근 7일(오늘 포함) 안의 판만, 놀이·판 크기·단계별로 센다', () => {
    const s = R.summarize(log, {}, undefined, now, 7);
    expect(s.games).toBe(5);
    const g13 = s.groups.find((g) => g.mode === 'normal' && g.size === 13)!;
    expect([g13.games, g13.wins, g13.losses, g13.draws]).toEqual([3, 2, 1, 0]);
    expect(s.groups[0]).toBe(g13); // 많이 둔 것부터
    expect(s.groups.filter((g) => g.mode === 'capture').map((g) => g.captureTarget).sort()).toEqual([1, 3]);
    expect(s.aiResigned).toBe(1);
    expect(s.quit).toBe(1);
  });

  it('도와줘·되돌리기와 잘한 수·놓친 장면은 센 판으로만 나눈다', () => {
    const s = R.summarize(log, {}, undefined, now, 7);
    expect(s.help).toEqual({ games: 2, hints: 2, undos: 4 });
    expect(s.play).toEqual({ games: 2, capture: 4, escape: 1, missed: { 'missed-capture': 1, 'self-atari': 2 } });
  });

  it('전체 기간은 날짜가 멀쩡한 판을 모두 센다', () => {
    expect(R.summarize(log, {}, undefined, now, null).games).toBe(6);
  });

  it('문제 기록과 강의 날짜도 기간으로 거른다(망가진 값은 무시)', () => {
    const practice = {
      '2026-10-19': { capture: [5, 5] },
      '2026-10-20': { capture: [5, 2], find: [3, 3] },
      '2026-10-26': { scene: [2, 1], bad: 'x' },
    } as unknown as import('../src/storage').PracticeLog;
    const lessonAt = { '7': at(19), '8': at(21), x: at(22), '9': '망가짐' };
    const s = R.summarize([], practice, lessonAt, now, 7);
    expect(s.practice).toEqual({ capture: [5, 2], find: [3, 3], scene: [2, 1] });
    expect(s.lessons).toEqual([8]);
    expect(R.summarize([], practice, lessonAt, now, null).lessons).toEqual([7, 8]);
  });
});

describe('요약 화면', () => {
  const now = new Date(2026, 9, 26, 20, 0);
  it('대국·도움·문제·강의 숫자가 보인다', () => {
    const log: Entry[] = [
      entry(1, { endedAt: new Date(2026, 9, 26, 9).toISOString(), outcome: 'win', hints: 1, undos: 0, good: { capture: 2, escape: 0 }, missed: {} }),
      entry(2, { endedAt: new Date(2026, 9, 26, 10).toISOString(), outcome: 'loss', hints: 2, undos: 1, good: { capture: 0, escape: 1 }, missed: { 'own-eye': 1 } }),
      entry(3, { endedAt: new Date(2026, 9, 26, 11).toISOString(), outcome: 'win', reason: 'resign' }),
    ];
    const practice: import('../src/storage').PracticeLog = { '2026-10-26': { kill: [4, 3] } };
    const html = V.summaryHTML(R.summarize(log, practice, undefined, now, 7), 7, 9, 12);
    expect(html).toContain('진짜 바둑 13줄');
    expect(html).toContain('★ 쉬워요');
    expect(html).toContain('67%'); // 3판 중 2판 이김
    expect(html).toContain('판마다 도와줘 <b>1.5번</b>');
    expect(html).toContain('하양이 기권 1판');
    expect(html).toContain('두 집 막기');
    expect(html).toContain('75%');
    expect(html).toContain('9 / 12강');
    expect(html).toContain('aria-checked="true" class="chip on" data-action="summary-days" data-days="7"');
  });

  it('기록이 없으면 안내 글', () => {
    const html = V.summaryHTML(R.summarize([], {}, undefined, now, 7), 7, 0, 12);
    expect(html).toContain('끝난 판이 없어요');
    expect(html).toContain('아직 센 판이 없어요');
    expect(html).toContain('푼 문제가 없어요');
    expect(html).not.toContain('<table');
  });
});
