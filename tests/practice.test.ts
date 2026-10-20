import { describe, expect, it } from 'vitest';
import { BLACK, EMPTY, WHITE } from '../src/engine/rules';
import { atariGroupsOf, meetsGoal, pt, resolve } from '../src/lessons/engine';
import { COUNT, PRACTICE, PSIZE, makePractice, makeStep } from '../src/lessons/practice';

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

const N = 150;

describe('연습 문제 자동 생성(엔진으로 조건 검사)', () => {
  it('판마다 문제 수가 맞고, 강의 진도에 들어가지 않도록 practice 표시가 있다', () => {
    for (const set of PRACTICE) {
      const l = makePractice(set, rng(1));
      expect(l.steps.length).toBe(COUNT);
      expect(l.practice).toBe(set.skill);
      expect(l.size).toBe(PSIZE);
    }
  });

  it('단수 찾기: 단수인 하양이 무리 1~2개, 헷갈릴 하양이 돌도 있고, 까망이는 안전', () => {
    const rand = rng(11);
    for (let i = 0; i < N; i++) {
      const s = makeStep('find', rand);
      const r = resolve(s, PSIZE);
      expect(r.groups.length).toBeGreaterThanOrEqual(1);
      expect(r.groups.length).toBeLessThanOrEqual(2);
      const atari = new Set(r.groups.flat());
      let other = 0;
      for (let p = 0; p < r.game.geo.n; p++) if (r.game.at(p) === WHITE && !atari.has(p)) other++;
      expect(other).toBeGreaterThan(0);
      expect(atariGroupsOf(r.game, BLACK).length).toBe(0);
    }
  });

  it('한 수로 잡기: 정답 자리 1~2개, 모두 실제로 하양이 돌을 잡는 합법수', () => {
    const rand = rng(22);
    for (let i = 0; i < N; i++) {
      const s = makeStep('capture', rand);
      const r = resolve(s, PSIZE);
      expect(r.game.toMove).toBe(BLACK);
      expect(r.targets.length).toBeGreaterThanOrEqual(1);
      expect(r.targets.length).toBeLessThanOrEqual(2);
      for (const p of r.targets) {
        const res = r.game.play(p);
        expect(res.ok && res.captured.length > 0).toBe(true);
        r.game.undo();
      }
    }
  });

  it('도망가기: 단수인 까망이 무리 하나, 도망가면 숨구멍 3개 이상', () => {
    const rand = rng(33);
    for (let i = 0; i < N; i++) {
      const s = makeStep('escape', rand);
      if (s.kind !== 'move' || !s.libsOf) throw new Error('도망가기 문제 모양이 아님');
      const r = resolve(s, PSIZE);
      const at = pt(s.libsOf, PSIZE);
      expect(r.game.at(at)).toBe(BLACK);
      expect(r.game.group(at).liberties.length).toBe(1);
      expect(r.targets.length).toBeGreaterThanOrEqual(1);
      expect(r.targets.length).toBeLessThanOrEqual(2);
      for (const p of r.targets) {
        expect(meetsGoal(r.game, p, 'escape', at)).toBe(true);
        r.game.play(p);
        expect(r.game.group(at).liberties.length).toBeGreaterThanOrEqual(3);
        r.game.undo();
      }
      // 정답이 아닌 빈 점은 도망가기가 아님
      for (let p = 0; p < r.game.geo.n; p++) {
        if (r.game.at(p) !== EMPTY || r.targets.includes(p)) continue;
        expect(meetsGoal(r.game, p, 'escape', at)).toBe(false);
      }
    }
  });
});
