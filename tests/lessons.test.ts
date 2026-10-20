// 강의 데이터 검증 — 앱에 들어가는 모든 단계가 규칙 엔진에서 말이 되는지 확인
import { describe, expect, it } from 'vitest';
import { EMPTY } from '../src/engine/rules';
import { LESSONS } from '../src/lessons/data';
import { fill, pt, resolve } from '../src/lessons/engine';
import type { XY } from '../src/lessons/data';
import { toSpeech } from '../src/speech';

describe('기초 강의 데이터', () => {
  it('강 번호가 1부터 차례대로다', () => {
    LESSONS.forEach((l, i) => expect(l.id).toBe(i + 1));
  });

  for (const lesson of LESSONS) {
    describe(`${lesson.id}강 ${lesson.title}(${lesson.term})`, () => {
      lesson.steps.forEach((step, i) => {
        it(`${i + 1}단계 (${step.kind})`, () => {
          const r = resolve(step); // 배치가 엔진 규칙에 맞지 않으면 여기서 예외
          const texts = [step.text, 'done' in step ? step.done : '', 'wrong' in step ? step.wrong : ''];
          for (const t of texts) {
            const filled = fill(t, r);
            expect(filled).not.toMatch(/\{libs\}/);
            expect(filled.split('**').length % 2).toBe(1); // 굵게 표시 짝 맞음
            expect(toSpeech(filled)).not.toMatch(/[*{}]/);
          }
          if (/\{libs\}/.test(texts.join(''))) expect(r.libs).toBeGreaterThan(0);

          if (step.kind === 'tap') {
            expect(r.targets.length).toBeGreaterThan(0);
            for (const p of r.targets) {
              expect(r.game.at(p)).toBe(EMPTY);
              if (step.place) expect(r.game.isLegal(p)).toBe(true);
            }
          }
          if (step.kind === 'liberties') {
            expect(r.targets.length).toBeGreaterThan(0);
            for (const p of r.targets) expect(r.game.at(p)).toBe(EMPTY);
          }
          if (step.kind === 'choice') {
            expect(r.answer).toBeGreaterThanOrEqual(0);
            expect(r.answer).toBeLessThan(step.options.length);
          }
          if (step.kind === 'move') {
            // 맞는 수가 있어야 하고, 모두 실제로 둘 수 있는 빈 점
            expect(r.targets.length).toBeGreaterThan(0);
            for (const p of r.targets) {
              expect(r.game.at(p)).toBe(EMPTY);
              expect(r.game.isLegal(p)).toBe(true);
            }
            if (step.goal === 'escape') expect(step.libsOf).toBeDefined();
          }
          if (step.kind === 'find') {
            expect(r.groups.length).toBeGreaterThan(0);
            for (const g of r.groups) expect(r.game.group(g[0]).liberties.length).toBe(1);
          }
          if (step.probe) expect(r.game.at(pt(step.probe))).toBe(EMPTY);
          for (const xy of step.crosses ?? []) expect(r.game.at(pt(xy))).toBe(EMPTY);
        });
      });
    });
  }

  it('숨구멍 수가 가운데 4·끝줄 3·구석 2·옆에 붙으면 3·이어지면 6', () => {
    const l3 = LESSONS[2].steps;
    expect(resolve(l3[1]).libs).toBe(4);
    expect(resolve(l3[3]).libs).toBe(3);
    expect(resolve(l3[4]).libs).toBe(2);
    expect(resolve(l3[5]).libs).toBe(3);
    expect(resolve(l3[6]).libs).toBe(6);
  });

  const sorted = (xs: XY[]) => xs.map(pt).sort((a, b) => a - b);
  const targetsOf = (lesson: number, step: number) => [...resolve(LESSONS[lesson - 1].steps[step]).targets].sort((a, b) => a - b);

  it('4강: 단수 숨구멍 1개, 단수 찾기 2무리, 단수 만들기는 남은 두 숨구멍', () => {
    const l4 = LESSONS[3].steps;
    expect(resolve(l4[0]).libs).toBe(1);
    expect(resolve(l4[2]).libs).toBe(1);
    expect(resolve(l4[3]).groups.length).toBe(2);
    expect(targetsOf(4, 4)).toEqual(sorted([[5, 4], [4, 5]]));
    expect(resolve(l4[5]).libs).toBe(1);
  });

  it('5강: 잡는 점은 마지막 숨구멍 하나뿐, 자살수는 못 두고 잡는 수는 둘 수 있다', () => {
    expect(targetsOf(5, 1)).toEqual(sorted([[4, 5]]));
    expect(targetsOf(5, 2)).toEqual(sorted([[0, 1]]));
    expect(targetsOf(5, 3)).toEqual(sorted([[6, 4]]));
    expect(resolve(LESSONS[4].steps[5]).answer).toBe(1); // 놓을 수 없어요
    expect(resolve(LESSONS[4].steps[6]).answer).toBe(0); // 놓을 수 있어요(잡으니까)
  });

  it('6강: 도망가기, 잡아서 살리기, 계단 쫓기(축)는 숨구멍 1개', () => {
    expect(resolve(LESSONS[5].steps[0]).libs).toBe(1);
    expect(targetsOf(6, 1)).toEqual(sorted([[4, 5]]));
    expect(resolve(LESSONS[5].steps[2]).libs).toBe(3);
    expect(targetsOf(6, 3)).toEqual(sorted([[4, 2], [4, 5]])); // 늘기 + 잡아서 살리기
    expect(resolve(LESSONS[5].steps[4]).libs).toBe(1);
  });

  it('2강 "다음 차례" 정답은 하양이', () => {
    expect(resolve(LESSONS[1].steps[3]).answer).toBe(1);
  });
});

describe('읽어 주기 문장', () => {
  it('괄호 속 바둑 용어는 문장 끝에 덧붙여 읽는다', () => {
    expect(toSpeech('숨 쉬는 **숨구멍(활로)**이에요.')).toBe('숨 쉬는 숨구멍이에요. 바둑 말로는 활로라고 해요.');
    expect(toSpeech('**점(교차점)**이라고 해요.')).toBe('점이라고 해요. 바둑 말로는 교차점이라고 해요.');
  });
});
