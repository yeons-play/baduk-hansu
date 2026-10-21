// 강의 데이터 검증 — 앱에 들어가는 모든 단계가 규칙 엔진에서 말이 되는지 확인
import { describe, expect, it } from 'vitest';
import { EMPTY, WHITE } from '../src/engine/rules';
import { LESSONS } from '../src/lessons/data';
import { fill, pt, resolve } from '../src/lessons/engine';
import type { XY } from '../src/lessons/data';
import { toSpeech } from '../src/speech';

describe('기초 강의 데이터', () => {
  it('강 번호가 1부터 12까지 차례대로다', () => {
    LESSONS.forEach((l, i) => expect(l.id).toBe(i + 1));
    expect(LESSONS.length).toBe(12);
  });

  it('바둑판은 작은 판에서 시작해 차츰 커지고, 1강·12강은 9줄', () => {
    const sizes = LESSONS.map((l) => l.size);
    for (const n of sizes) expect([5, 7, 9]).toContain(n);
    expect(sizes[0]).toBe(9);
    expect(sizes[11]).toBe(9);
    for (let i = 2; i < sizes.length; i++) expect(sizes[i]).toBeGreaterThanOrEqual(sizes[i - 1]);
  });

  for (const lesson of LESSONS) {
    describe(`${lesson.id}강 ${lesson.title}(${lesson.term})`, () => {
      lesson.steps.forEach((step, i) => {
        it(`${i + 1}단계 (${step.kind})`, () => {
          const size = lesson.size;
          const P = (xy: XY) => pt(xy, size);
          const r = resolve(step, size); // 배치가 엔진 규칙에 맞지 않으면 여기서 예외
          // 모든 좌표가 판 안에 있음
          const all: XY[] = [
            ...(step.setup?.b ?? []),
            ...(step.setup?.w ?? []),
            ...(step.setup?.moves ?? []),
            ...(step.rings ?? []),
            ...(step.crosses ?? []),
            ...(step.libsOf ? [step.libsOf] : []),
            ...(step.probe ? [step.probe] : []),
            ...(step.join ? [step.join] : []),
            ...(step.cut ?? []),
            ...(step.kind === 'tap' ? step.targets : []),
          ];
          for (const [x, y] of all) {
            expect(x >= 0 && y >= 0 && x < size && y < size).toBe(true);
          }
          const texts = [step.text, 'done' in step ? step.done : '', 'wrong' in step ? step.wrong : ''];
          for (const t of texts) {
            const filled = fill(t, r);
            expect(filled).not.toMatch(/\{\w+\}/);
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
          if (step.kind === 'territory') expect(r.targets.length).toBeGreaterThan(0);
          if (step.kind === 'choice' && step.answer === 'more') expect(r.score.blackArea).not.toBe(r.score.whiteArea);
          if (step.as === 'w') expect(r.game.toMove).toBe(WHITE);
          if (step.probe) expect(r.game.at(P(step.probe))).toBe(EMPTY);
          for (const xy of step.crosses ?? []) expect(r.game.at(P(xy))).toBe(EMPTY);
        });
      });
    });
  }

  const L = (id: number) => LESSONS[id - 1];
  const R = (id: number, step: number) => resolve(L(id).steps[step], L(id).size);
  const sorted = (id: number, xs: XY[]) => xs.map((xy) => pt(xy, L(id).size)).sort((a, b) => a - b);
  const targetsOf = (id: number, step: number) => [...R(id, step).targets].sort((a, b) => a - b);

  it('3강: 숨구멍 수가 가운데 4·끝줄 3·구석 2·옆에 붙으면 3·이어지면 6', () => {
    expect(R(3, 1).libs).toBe(4);
    expect(R(3, 3).libs).toBe(3);
    expect(R(3, 4).libs).toBe(2);
    expect(R(3, 5).libs).toBe(3);
    expect(R(3, 6).libs).toBe(6);
  });

  it('4강: 단수 숨구멍 1개, 단수 찾기 2무리, 단수 만들기는 남은 두 숨구멍', () => {
    expect(R(4, 0).libs).toBe(1);
    expect(R(4, 2).libs).toBe(1);
    expect(R(4, 3).groups.length).toBe(2);
    expect(targetsOf(4, 4)).toEqual(sorted(4, [[4, 3], [3, 4]]));
    expect(R(4, 5).libs).toBe(1);
  });

  it('5강: 잡는 점은 마지막 숨구멍 하나뿐, 자살수는 못 두고 잡는 수는 둘 수 있다', () => {
    expect(targetsOf(5, 1)).toEqual(sorted(5, [[3, 4]]));
    expect(targetsOf(5, 2)).toEqual(sorted(5, [[0, 1]]));
    expect(targetsOf(5, 3)).toEqual(sorted(5, [[5, 3]]));
    expect(R(5, 5).answer).toBe(1); // 놓을 수 없어요
    expect(R(5, 6).answer).toBe(0); // 놓을 수 있어요(잡으니까)
  });

  it('6강: 도망가기, 잡아서 살리기, 계단 쫓기(축)는 숨구멍 1개', () => {
    expect(R(6, 0).libs).toBe(1);
    expect(targetsOf(6, 1)).toEqual(sorted(6, [[3, 4]]));
    expect(R(6, 2).libs).toBe(3);
    expect(targetsOf(6, 3)).toEqual(sorted(6, [[3, 1], [3, 4]])); // 늘기 + 잡아서 살리기
    expect(R(6, 4).libs).toBe(1);
  });

  it('7강: 잇는 자리·끊는 자리는 가운데 한 곳', () => {
    expect(R(7, 0).libs).toBe(6);
    expect(R(7, 1).libs).toBe(4);
    expect(targetsOf(7, 2)).toEqual(sorted(7, [[3, 3]]));
    expect(targetsOf(7, 4)).toEqual(sorted(7, [[3, 3]]));
  });

  it('8강: 구석 집 4개, 가운데 줄은 누구 집도 아님, 까망이 집이 더 많음', () => {
    expect(targetsOf(8, 1).length).toBe(4);
    expect(R(8, 2).score.blackArea).toBe(4);
    expect(R(8, 2).answer).toBe(1); // '4개'
    const s = R(8, 3).score;
    expect([s.blackArea, s.whiteArea, s.neutral]).toEqual([14, 14, 7]);
    expect(R(8, 4).answer).toBe(0);
  });

  it('9강: 눈 하나는 하양이가 놓아 잡고, 눈 둘은 못 놓고, 눈 만드는 자리는 가운데', () => {
    expect(R(9, 0).libs).toBe(1);
    expect(R(9, 1).answer).toBe(0);
    expect(R(9, 2).libs).toBe(2);
    expect(R(9, 3).answer).toBe(1);
    expect(targetsOf(9, 4)).toEqual(sorted(9, [[0, 1]]));
  });

  it('10강: 바로 되따기는 안 되고, 한 번씩 다른 곳에 두면 된다', () => {
    expect(targetsOf(10, 1)).toEqual(sorted(10, [[3, 3]]));
    expect(R(10, 2).answer).toBe(1);
    expect(R(10, 4).answer).toBe(0);
  });

  it('11강: 집 안 하양이 돌이 있으면 집이 없어지고, 잡으면 돌아온다. 돌 7 + 집 21 = 28', () => {
    expect(R(11, 0).score.blackArea).toBe(21);
    expect(R(11, 1).score.blackArea).toBe(0);
    expect(targetsOf(11, 2)).toEqual(sorted(11, [[0, 1]]));
    const r = R(11, 2);
    r.game.play(pt([0, 1], 7));
    expect(r.game.score().blackArea).toBe(19); // 21칸 가운데 흑돌 2개 자리는 집이 아니라 돌로 셈
    expect(R(11, 4).score.blackStones + R(11, 4).score.blackArea).toBe(28);
    expect(R(11, 4).answer).toBe(1);
  });

  it('2강 "다음 차례" 정답은 하양이', () => {
    expect(R(2, 3).answer).toBe(1);
  });
});

describe('읽어 주기 문장', () => {
  it('괄호 속 바둑 용어는 문장 끝에 덧붙여 읽는다', () => {
    expect(toSpeech('숨 쉬는 **숨구멍(활로)**이에요.')).toBe('숨 쉬는 숨구멍이에요. 바둑 말로는 활로라고 해요.');
    expect(toSpeech('**점(교차점)**이라고 해요.')).toBe('점이라고 해요. 바둑 말로는 교차점이라고 해요.');
  });
});

describe('강의 엑스 표시(아니에요)', () => {
  it('엑스는 그 강의 판 안의 빈 점에 그려진다(판 크기로 좌표 변환)', () => {
    for (const l of LESSONS)
      for (const s of l.steps) {
        if (!s.crosses) continue;
        const r = resolve(s, l.size);
        expect(r.crosses).toEqual(s.crosses.map(([x, y]) => y * l.size + x));
        for (const p of r.crosses) expect(r.game.at(p)).toBe(0);
      }
  });

  it('3강: 대각선 엑스 네 개는 까망이 돌의 비스듬한 네 곳', () => {
    const l = LESSONS[2];
    const s = l.steps.find((x) => x.crosses?.length === 4)!;
    const r = resolve(s, l.size);
    const stone = [...Array(l.size * l.size).keys()].find((p) => r.game.at(p) !== 0)!;
    const [sx, sy] = [stone % l.size, Math.floor(stone / l.size)];
    const diag = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([dx, dy]) => (sy + dy) * l.size + sx + dx);
    expect([...r.crosses].sort((a, b) => a - b)).toEqual(diag.sort((a, b) => a - b));
  });
});
