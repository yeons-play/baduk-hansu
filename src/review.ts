// 복습 화면 — 끝난 판을 한 수씩 다시 보고, 규칙으로 확실히 판단되는 '놓친 장면'을 짚어 준다.
// 화면 문구는 7살 기준. '가장 좋은 수'라는 말은 쓰지 않는다(KataGo 미연결).
import { toXY } from './engine/rules';
import { findMistakes, replay, type Mistake, type MistakeKind } from './engine/ai/review';
import { LESSONS } from './lessons/data';
import { rich } from './lessons/player';
import { levelLabel } from './levels';
import type { FinishedGame } from './storage';
import { renderBoard } from './ui/board';
import { icon } from './ui/icons';

export interface ReviewState {
  game: FinishedGame;
  /** 지금 보는 판: 처음부터 k수까지 둔 모습(0 = 빈 판) */
  k: number;
  mistakes: Mistake[];
}

const cache = new Map<number, Mistake[]>();

/** 기록의 놓친 장면(판마다 한 번만 계산) */
export function mistakesOf(g: FinishedGame): Mistake[] {
  let m = cache.get(g.id);
  if (!m) {
    m = findMistakes(g);
    cache.set(g.id, m);
  }
  return m;
}

export function openReview(g: FinishedGame): ReviewState {
  return { game: g, k: 0, mistakes: mistakesOf(g) };
}

export const MISTAKE_TITLE: Record<MistakeKind, string> = {
  'missed-capture': '잡을 수 있었어요',
  'missed-escape': '도망갈 수 있었어요',
  'self-atari': '스스로 단수가 됐어요',
  'own-eye': '내 집을 메웠어요',
};

/** 장면 설명(쉬운 말 + 바둑 말 괄호) */
export function mistakeText(m: Mistake): string {
  switch (m.kind) {
    case 'missed-capture':
      return '하양이 돌의 숨구멍이 하나뿐이었어요. **점선 동그라미**에 두면 하양이 돌을 **잡을(따내기)** 수 있었어요!';
    case 'missed-escape':
      return '까망이 돌이 **숨구멍 하나(단수)**였어요. **점선 동그라미**로 늘면 **도망갈(달아나기)** 수 있었어요.';
    case 'self-atari':
      return '**빨간 동그라미**에 두니까 까망이 돌의 숨구멍이 하나만 남았어요(단수). 하양이가 바로 잡을 수 있어요.';
    case 'own-eye':
      return '**빨간 동그라미**는 까망이 돌로만 둘러싸인 **내 집(눈)**이었어요. 스스로 메우면 눈이 줄어 위험해요.';
  }
}

export function moveText(g: FinishedGame, k: number): string {
  if (k === 0) return '빈 바둑판이에요. ▶를 눌러 한 수씩 봐요.';
  const m = g.moves[k - 1];
  const blackFirst = (g.setup?.toMove ?? 1) === 1; // 출발 판 놀이는 하양이가 먼저일 수도 있음
  const who = (k % 2 === 1) === blackFirst ? '까망이' : '하양이';
  if (m < 0) return `${k}수: ${who}가 넘겼어요.`;
  const [x, y] = toXY(g.size, m);
  return `${k}수: ${who}가 두었어요. (가로 ${x + 1}, 세로 ${y + 1})`;
}

/** 지금 보는 판이 놓친 장면이면 그 장면 */
export function currentMistake(r: ReviewState): Mistake | null {
  return r.mistakes.find((m) => m.index === r.k) ?? null;
}

export function reviewHTML(r: ReviewState): string {
  const g = r.game;
  const total = g.moves.length;
  const board = replay(g, r.k);
  const here = currentMistake(r);
  const last = r.k > 0 && g.moves[r.k - 1] >= 0 ? g.moves[r.k - 1] : null;
  const svg = renderBoard(board, {
    lastMove: here ? null : last,
    rings: here ? here.better : [],
    miss: here ? here.played : null,
  });
  const modeName = g.mode === 'normal' ? '진짜 바둑' : '따내기 바둑';
  const prevM = [...r.mistakes].reverse().find((m) => m.index < r.k);
  const nextM = r.mistakes.find((m) => m.index > r.k);
  const lesson = here ? LESSONS[here.lesson - 1] : null;
  const panel = here
    ? `<div class="lesson-card review-card"><p class="kicker warn">놓친 장면 ${r.mistakes.indexOf(here) + 1} / ${r.mistakes.length} · ${MISTAKE_TITLE[here.kind]}</p><p>${rich(mistakeText(here))}</p></div>
      ${lesson ? `<button class="btn ghost full" data-action="lesson-open" data-id="${lesson.id}">${icon('book')}${lesson.id}강 ${lesson.title} 다시 보기</button>` : ''}`
    : `<div class="lesson-card review-card"><p>${rich(moveText(g, r.k))}</p>${
        r.mistakes.length
          ? `<p class="small">이 판에는 <b>놓친 장면이 ${r.mistakes.length}개</b> 있어요. ‘다음 장면’을 눌러 봐요.</p>`
          : '<p class="small">이 판에는 놓친 장면이 없어요. 아주 잘 두었어요!</p>'
      }</div>`;
  return `<main class="screen game review-screen">
  <header class="bar">
    <button class="back" data-action="tab" data-tab="record">${icon('chev')}기록</button>
    <h1>복습<small>${modeName} · ${g.size}줄</small></h1>
    <span class="pill">${g.outcome === 'win' ? '이김' : g.outcome === 'loss' ? '짐' : '비김'}</span>
  </header>
  <div class="game-layout">
    <div class="board-col"><div class="board-wrap">${svg}</div></div>
    <div class="side">
      <div class="rv-bar">
        <button class="rv-btn" data-action="rv-first" aria-label="처음으로" ${r.k === 0 ? 'disabled' : ''}>⏮</button>
        <button class="rv-btn" data-action="rv-prev" aria-label="이전 수" ${r.k === 0 ? 'disabled' : ''}>◀</button>
        <span class="rv-count"><b>${r.k}</b> / ${total}수</span>
        <button class="rv-btn" data-action="rv-next" aria-label="다음 수" ${r.k >= total ? 'disabled' : ''}>▶</button>
        <button class="rv-btn" data-action="rv-last" aria-label="끝으로" ${r.k >= total ? 'disabled' : ''}>⏭</button>
      </div>
      <input class="rv-seek" type="range" min="0" max="${total}" value="${r.k}" aria-label="몇 번째 수까지 볼지">
      <div class="rv-dyn">${
        r.mistakes.length
          ? `<div class="row2"><button class="btn ghost" data-action="rv-mistake" data-dir="-1" ${prevM ? '' : 'disabled'}>◀ 앞 장면</button><button class="btn primary" data-action="rv-mistake" data-dir="1" ${nextM ? '' : 'disabled'}>다음 장면 ▶</button></div>`
          : ''
      }
      ${panel}</div>
    </div>
  </div>
</main>`;
}

/** 복습 화면 버튼 처리. 바뀌었으면 true */
export function reviewAction(r: ReviewState, action: string, dir = 1): boolean {
  const total = r.game.moves.length;
  const before = r.k;
  if (action === 'rv-first') r.k = 0;
  else if (action === 'rv-prev') r.k = Math.max(0, r.k - 1);
  else if (action === 'rv-next') r.k = Math.min(total, r.k + 1);
  else if (action === 'rv-last') r.k = total;
  else if (action === 'rv-mistake') {
    const m = dir < 0 ? [...r.mistakes].reverse().find((x) => x.index < r.k) : r.mistakes.find((x) => x.index > r.k);
    if (m) r.k = m.index;
  }
  return r.k !== before;
}

export function reviewSeek(r: ReviewState, k: number): void {
  r.k = Math.max(0, Math.min(r.game.moves.length, Math.round(k)));
}

/** 기록 목록 한 줄 */
export function historyItemHTML(g: FinishedGame): string {
  const d = new Date(g.endedAt);
  const when = `${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const n = mistakesOf(g).length;
  const tag = g.outcome === 'win' ? '<span class="badge ok">이김</span>' : g.outcome === 'loss' ? '<span class="badge">짐</span>' : '<span class="badge">비김</span>';
  return `<li><button class="lesson" data-action="review-open" data-id="${g.id}">
    <span class="lnum">${g.size}</span>
    <span class="ltitle">${g.mode === 'normal' ? '진짜 바둑' : '따내기 바둑'}<small class="lgoal">하양이 ${levelLabel(g.level)} · ${when} · ${g.summary}${n ? ` · 놓친 장면 ${n}개` : ''}</small></span>
    ${tag}
  </button></li>`;
}
