// 강의 진행 — 한 강의 단계를 차례로 보여주고, 누르기·고르기에 반응한다.
import { EMPTY, WHITE, type Game, type IllegalReason } from '../engine/rules';
import { chooseMove } from '../engine/ai/beginner';
import { sfx } from '../audio';
import { speak } from '../speech';
import { renderBoard } from '../ui/board';
import { icon } from '../ui/icons';
import type { Lesson, Step } from './data';
import { buildGame, fill, resolve, type Resolved } from './engine';

export class LessonPlayer {
  stepIdx = 0;
  private r!: Resolved;
  private found = new Set<number>();
  private placed: number[] = [];
  private freeGame: Game | null = null;
  private freeCount = 0;
  /** move 단계에서 맞게 놓은 점 */
  private moved: number | null = null;
  private busy = false;
  private timer: number | undefined;
  done = false;
  feedback: { text: string; ok: boolean } | null = null;
  chosen: number | null = null;
  miss: number | null = null;
  /** 이 단계에서 틀린 횟수(줄 밖을 누른 것은 빼고) */
  misses = 0;

  constructor(
    readonly lesson: Lesson,
    private rerender: () => void,
    /** 연습에서 같은 문제를 두 번 틀렸을 때(핵심 그림 보여 주기) */
    private onStuck?: (step: Step) => void,
  ) {
    this.enter(0);
  }

  /** 지금 단계의 바둑판 줄 수(단계마다 다를 수 있음: 놓친 장면 문제) */
  get size(): number {
    return this.step.size ?? this.lesson.size;
  }

  /** 지금 단계를 한 번에 맞혔나 */
  get firstTry(): boolean {
    return this.done && this.misses === 0;
  }

  get step(): Step {
    return this.lesson.steps[this.stepIdx];
  }
  get isLast(): boolean {
    return this.stepIdx === this.lesson.steps.length - 1;
  }

  enter(i: number) {
    window.clearTimeout(this.timer);
    this.stepIdx = i;
    this.r = resolve(this.step, this.size);
    this.found = new Set();
    this.placed = [];
    this.freeGame = this.step.kind === 'free' ? buildGame(this.step.setup, [], undefined, this.size) : null;
    this.freeCount = 0;
    this.moved = null;
    this.busy = false;
    this.done = this.step.kind === 'explain';
    this.feedback = null;
    this.chosen = null;
    this.miss = null;
    this.misses = 0;
    speak(this.text());
  }

  /** 다음 단계로. 마지막이면 true(강의 끝) */
  next(): boolean {
    if (!this.done) return false;
    if (this.isLast) return true;
    this.enter(this.stepIdx + 1);
    return false;
  }

  stop() {
    window.clearTimeout(this.timer);
  }

  text(): string {
    return fill(this.step.text, this.r);
  }

  sayAgain() {
    speak(this.feedback ? this.feedback.text : this.text(), true);
  }

  private ok(text: string) {
    this.done = true;
    this.feedback = { text: fill(text, this.r), ok: true };
    this.miss = null;
    sfx('correct');
    speak(this.feedback.text);
  }

  private no(text: string, miss: number | null = null) {
    this.feedback = { text: fill(text, this.r), ok: false };
    this.miss = miss;
    sfx('wrong');
    speak(this.feedback.text);
    // 점을 잘못 고른 것만 센다(줄 밖 누르기는 실수가 아님). 연습에서 두 번째로 틀리면 핵심 그림
    if (miss != null || this.step.kind === 'choice') {
      this.misses++;
      if (this.misses === 2 && this.lesson.practice) this.onStuck?.(this.step);
    }
  }

  tapPoint(p: number | null) {
    const s = this.step;
    if (this.done && s.kind !== 'free') return;
    if (s.kind === 'tap' || s.kind === 'liberties' || s.kind === 'territory') {
      if (p == null) {
        this.no('줄과 줄이 만나는 점을 눌러요');
        this.rerender();
        return;
      }
      if (this.found.has(p)) return;
      if (this.r.targets.includes(p)) {
        this.found.add(p);
        if (s.kind === 'tap' && s.place) {
          this.placed.push(p);
          sfx('stone');
        } else sfx('correct');
        this.miss = null;
        const need = s.kind === 'tap' && s.need === 'one' ? 1 : this.r.targets.length;
        if (this.found.size >= need) this.ok(s.done);
        else {
          this.feedback = { text: `좋아요! ${this.r.targets.length - this.found.size}개 남았어요`, ok: true };
          speak(this.feedback.text);
        }
      } else {
        this.no(s.wrong, p);
      }
      this.rerender();
      return;
    }
    if (s.kind === 'move') {
      if (p == null) this.no('줄과 줄이 만나는 점을 눌러요');
      else {
        const c = this.r.game.check(p);
        if (!c.ok) this.no(ILLEGAL[c.reason], p);
        else if (!this.r.targets.includes(p)) this.no(s.wrong, p);
        else {
          const res = this.r.game.play(p); // 엔진이 둔 결과(잡힌 돌 들어내기)를 그대로 보여줌
          this.moved = p;
          sfx(res.ok && res.captured.length ? 'capture' : 'stone');
          this.ok(s.done);
        }
      }
      this.rerender();
      return;
    }
    if (s.kind === 'find') {
      if (p == null) this.no('줄과 줄이 만나는 점을 눌러요');
      else if (this.found.has(p)) return;
      else if (this.r.game.at(p) === EMPTY) this.no('하양이 돌을 눌러요', p);
      else if (this.r.game.at(p) !== WHITE) this.no('까망이 돌 말고 하양이 돌을 찾아요', p);
      else {
        const grp = this.r.groups.find((g) => g.includes(p));
        if (!grp) this.no(s.wrong, p);
        else {
          grp.forEach((q) => this.found.add(q));
          this.miss = null;
          const left = this.r.groups.filter((g) => !g.some((q) => this.found.has(q))).length;
          if (left === 0) this.ok(s.done);
          else {
            sfx('correct');
            this.feedback = { text: `좋아요! ${left}개 남았어요`, ok: true };
            speak(this.feedback.text);
          }
        }
      }
      this.rerender();
      return;
    }
    if (s.kind === 'free') {
      const g = this.freeGame!;
      if (this.done || this.busy || p == null) {
        if (p == null && !this.done) this.no('줄과 줄이 만나는 점을 눌러요');
        this.rerender();
        return;
      }
      const res = g.play(p);
      if (!res.ok) {
        this.no(res.reason === 'occupied' ? '벌써 돌이 있어요! 빈 점에 놓아요' : '거기는 놓을 수 없어요');
        this.rerender();
        return;
      }
      sfx('stone');
      this.feedback = null;
      this.busy = true;
      this.rerender();
      this.timer = window.setTimeout(() => {
        const c = chooseMove(g, { level: 1 });
        // 하양이가 놓을 곳이 없으면 넘긴다(넘기지 않으면 까망이가 하양이 차례에 두게 됨)
        if (c.point != null) g.play(c.point);
        else g.pass();
        sfx('stone');
        this.busy = false;
        this.freeCount++;
        if (this.freeCount >= s.rounds) this.ok(s.done);
        else {
          this.feedback = { text: `하양이가 놓았어요. 이제 다시 까망이 차례! — ${this.freeCount}번 했어요, ${s.rounds - this.freeCount}번 남았어요`, ok: true };
          speak('하양이가 놓았어요. 이제 다시 까망이 차례!');
        }
        this.rerender();
      }, 650);
    }
  }

  choose(i: number) {
    const s = this.step;
    if (s.kind !== 'choice' || this.done) return;
    this.chosen = i;
    if (i === this.r.answer) this.ok(s.done);
    else this.no(s.wrong);
    this.rerender();
  }

  // ───────── 화면 ─────────

  html(): string {
    const s = this.step;
    const l = this.lesson;
    const game =
      s.kind === 'free'
        ? this.freeGame!
        : this.placed.length
          ? buildGame(s.setup, this.placed, undefined, this.size)
          : this.r.game;
    const showOwner = s.showOwner && (s.kind !== 'territory' || this.done);
    const board = renderBoard(game, {
      owner: showOwner ? game.score().owner : null,
      rings:
        s.kind === 'liberties' || s.kind === 'territory' || (s.kind === 'move' && this.done)
          ? []
          : this.r.rings.filter((p) => !this.found.has(p)),
      goods: s.kind === 'liberties' || s.kind === 'find' || (s.kind === 'territory' && !this.done) ? [...this.found] : [],
      crosses: this.r.crosses,
      miss: this.miss,
      lastMove: s.kind === 'free' ? lastPlay(game) : s.kind === 'move' ? this.moved : null,
    });
    const dots = l.steps
      .map((_, i) => `<span class="dot ${i < this.stepIdx ? 'past' : i === this.stepIdx ? 'now' : ''}"></span>`)
      .join('');
    const choices =
      s.kind === 'choice'
        ? `<div class="choices">${s.options
            .map((o, i) => {
              const state = this.chosen === i ? (i === this.r.answer ? 'right' : 'wrong') : '';
              return `<button class="choice ${state}" data-action="lesson-choose" data-i="${i}" ${this.done ? 'disabled' : ''}>${esc(o)}</button>`;
            })
            .join('')}</div>`
        : '';
    const fb = this.feedback
      ? `<div class="feedback ${this.feedback.ok ? 'ok' : 'no'}" role="status">${this.feedback.ok ? icon('check') : icon('help')}<span>${rich(this.feedback.text)}</span></div>`
      : '';
    return `<main class="screen game lesson-screen">
  <header class="bar">
    <button class="back" data-action="lesson-exit">${icon('chev')}뒤로</button>
    <h1>${l.practice ? "연습" : `${l.id}강`} · ${esc(l.title)}<small>(${esc(l.term)})</small></h1>
    <button class="say" data-action="lesson-say" aria-label="다시 듣기">${icon('speaker')}</button>
  </header>
  <div class="dots" aria-label="${l.steps.length}단계 중 ${this.stepIdx + 1}단계">${dots}</div>
  <div class="game-layout">
    <div class="board-col"><div class="board-wrap">${board}</div></div>
    <div class="side">
      <div class="lesson-card"><p>${rich(this.text())}</p></div>
      ${choices}
      ${fb}
      <button class="btn primary big full next" data-action="lesson-next" ${this.done ? '' : 'disabled'}>${
        this.done ? (this.isLast ? '다 했어요!' : '다음') : s.kind === 'choice' ? '답을 골라요' : '바둑판을 눌러요'
      } ${this.done ? icon('arrow') : ''}</button>
    </div>
  </div>
</main>`;
  }
}

const ILLEGAL: Record<IllegalReason, string> = {
  occupied: '벌써 돌이 있어요! 빈 점에 놓아요',
  suicide: '거기는 숨구멍이 없어서 놓을 수 없어요(자살수)',
  superko: '지금은 거기에 놓을 수 없어요',
  'off-board': '줄과 줄이 만나는 점을 눌러요',
  'game-over': '다음으로 넘어가요',
};

function lastPlay(g: Game): number | null {
  const m = g.moves[g.moves.length - 1];
  return m && m.type === 'play' ? m.point : null;
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

/** **굵게** → <b>, 괄호 속 바둑 용어는 작은 꼬리표로 */
export function rich(text: string): string {
  return esc(text)
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\(([^)]+)\)/g, '<span class="term">$1</span>');
}

