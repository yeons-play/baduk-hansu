// 강의 데이터 검증 — 앱에 들어가는 모든 단계가 규칙 엔진에서 말이 되는지 확인
import { describe, expect, it } from 'vitest';
import { EMPTY } from '../src/engine/rules';
import { LESSONS } from '../src/lessons/data';
import { fill, pt, resolve } from '../src/lessons/engine';
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

  it('2강 "다음 차례" 정답은 백돌이', () => {
    expect(resolve(LESSONS[1].steps[3]).answer).toBe(1);
  });
});

describe('읽어 주기 문장', () => {
  it('괄호 속 바둑 용어는 문장 끝에 덧붙여 읽는다', () => {
    expect(toSpeech('숨 쉬는 **숨구멍(활로)**이에요.')).toBe('숨 쉬는 숨구멍이에요. 바둑 말로는 활로라고 해요.');
    expect(toSpeech('**점(교차점)**이라고 해요.')).toBe('점이라고 해요. 바둑 말로는 교차점이라고 해요.');
  });
});
