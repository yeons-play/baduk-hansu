import '@fontsource/jua/korean-400.css';
import '@fontsource/jua/latin-400.css';
import '@fontsource/gowun-dodum/korean-400.css';
import '@fontsource/gowun-dodum/latin-400.css';
import './style.css';
import { BLACK, WHITE, Game, type GameMode, type IllegalReason } from './engine/rules';
import { chooseMove, type Level, type MoveReason } from './engine/ai/beginner';
import { pointFromEvent, renderBoard } from './ui/board';
import { type Mood, starBurst, stoneFace } from './ui/faces';
import {
  clearGame,
  hasSeenRules,
  loadGame,
  loadStats,
  markRulesSeen,
  recordResult,
  requestPersistence,
  saveGame,
  loadSettings,
  saveSettings,
  loadLessons,
  markLessonDone,
  loadPractice,
  markPracticeDone,
  resetLessons,
  exportBackup,
  importBackup,
} from './storage';
import { icon } from './ui/icons';
import { sfx, unlockAudio } from './audio';
import { speak, stopSpeaking } from './speech';
import { ALL_TITLES, LESSONS } from './lessons/data';
import { LessonPlayer, rich } from './lessons/player';
import { PRACTICE, COUNT, makePractice, type PracticeSet } from './lessons/practice';

// ───────── 상태 ─────────
// 아이폰·아이패드에서는 history API를 쓰지 않는다(홈 화면 앱 뒤로가기 꼬임 방지).
// 화면 이동은 아래 탭과 '← 뒤로' 버튼만.

type Screen = 'home' | 'game' | 'learn' | 'puzzle' | 'record' | 'lesson';
type Sheet =
  | null
  | 'start'
  | 'rules'
  | 'resign'
  | 'result'
  | 'settings'
  | 'lesson-done'
  | 'practice-done'
  | 'reset-lessons'
  | 'pass'
  | 'score';

const ui = {
  screen: 'home' as Screen,
  sheet: null as Sheet,
  level: 1 as Level,
  /** 따내기 바둑에서 먼저 잡아야 하는 돌 수 */
  target: 1 as Target,
  /** 고르는 중인 놀이: 따내기 바둑(capture) 또는 집 짓는 진짜 바둑(normal) */
  mode: 'capture' as GameMode,
  /** 따내기 바둑 판 크기 */
  size: 7 as BoardSize,
  /** 진짜 바둑 판 크기 */
  normalSize: 9 as NormalSize,
  game: null as Game | null,
  preview: null as number | null,
  hint: null as number | null,
  hintText: null as string | null,
  aiThinking: false,
  toast: null as string | null,
  result: { title: '', body: '', mood: 'happy' as Mood, win: false },
  lesson: null as LessonPlayer | null,
};

const HUMAN = BLACK;
const AI_DELAY = 550;
let aiTimer: number | undefined;
let toastTimer: number | undefined;

const app = document.getElementById('app')!;

// 7살 기준 문구: 짧게, 쉬운 말 먼저, 바둑 용어는 괄호로
const ILLEGAL_TEXT: Record<IllegalReason, string> = {
  occupied: '벌써 돌이 있어요!',
  suicide: '거기는 숨구멍이 없어서 놓을 수 없어요 (자살수)',
  superko: '지금은 거기에 둘 수 없어요. 다른 곳에 먼저 놓아요 (패)',
  'off-board': '선이 만나는 곳을 눌러요',
  'game-over': '놀이가 끝났어요',
};

const HINT_TEXT: Record<MoveReason, string> = {
  win: '여기에 놓으면 하양이를 잡아서 이겨요!',
  capture: '여기에 놓으면 하양이를 잡을 수 있어요!',
  escape: '까망이가 위험해요! 여기로 도망가요',
  atari: '여기에 놓으면 하양이의 숨구멍(활로)이 하나만 남아요',
  joseki: '바둑에서 많이 두는 좋은 순서(정석)예요. 이렇게 두면 서로 튼튼해요',
  corner: '귀(모서리)는 집 짓기가 가장 쉬워요. 빈 귀부터 차지해요',
  approach: '하양이 귀에 다가가요(걸침). 하양이 혼자 귀를 다 갖지 못하게요',
  enclose: '내 귀를 한 번 더 지켜요(굳힘). 그러면 귀가 튼튼한 내 집이 돼요',
  answer: '하양이가 내 귀에 다가왔어요. 귀를 지키면서 받아요',
  side: '귀를 다 차지했으면 이제 변(가장자리)으로 벌려요',
  territory: '아직 누구 집도 아닌 넓은 곳이에요. 여기에 놓아 내 집을 넓혀요',
  connect: '친구 돌 옆에 붙이면 튼튼해져요',
  shape: '다른 돌 가까이에 놓아 볼까요?',
  pass: '놓을 곳이 없어요',
};

type Target = 1 | 2 | 3;
const TARGETS: Target[] = [1, 2, 3];
type BoardSize = 5 | 7 | 9;
const SIZES: BoardSize[] = [5, 7, 9];
/** 진짜 바둑 판 크기 — 덤은 두 판 모두 7(docs/rules.md) */
type NormalSize = 9 | 13;
const NORMAL_SIZES: NormalSize[] = [9, 13];
/** 이 강까지 배우면 준비 끝: 따내기 바둑은 6강(단수·잡기·도망가기), 진짜 바둑은 12강 */
const READY_LESSON: Record<GameMode, number> = { capture: 6, normal: 12 };

const LEVELS: Record<Level, { name: string; stars: string }> = {
  1: { name: '쉬워요', stars: '★' },
  2: { name: '보통', stars: '★★' },
  3: { name: '어려워요', stars: '★★★' },
};


// ───────── 대국 진행 ─────────

function newGame(level: Level, target: Target) {
  ui.game =
    ui.mode === 'normal'
      ? new Game({ size: ui.normalSize, mode: 'normal' })
      : new Game({ size: ui.size, mode: 'capture', captureTarget: target });
  ui.level = level;
  ui.target = target;
  resetMarks();
  persist();
}

function resumeGame(): boolean {
  const saved = loadGame();
  if (!saved || saved.v !== 1) return false;
  const g = new Game({ size: saved.size, mode: saved.mode, captureTarget: saved.captureTarget });
  for (const m of saved.moves) {
    const r = m < 0 ? g.pass() : g.play(m);
    if (!r.ok) {
      clearGame();
      return false;
    }
  }
  if (g.isOver) {
    clearGame();
    return false;
  }
  ui.game = g;
  ui.level = saved.level;
  ui.mode = saved.mode;
  if (saved.mode === 'capture' && SIZES.includes(saved.size as BoardSize)) ui.size = saved.size as BoardSize;
  if (saved.mode === 'normal' && NORMAL_SIZES.includes(saved.size as NormalSize)) ui.normalSize = saved.size as NormalSize;
  if (TARGETS.includes(saved.captureTarget as Target)) ui.target = saved.captureTarget as Target;
  resetMarks();
  return true;
}

function persist() {
  const g = ui.game;
  if (!g) return;
  if (g.isOver) {
    clearGame();
    return;
  }
  saveGame({
    v: 1,
    mode: g.rules.mode,
    size: g.size,
    level: ui.level,
    captureTarget: g.rules.captureTarget,
    moves: g.moves.map((m) => (m.type === 'play' ? m.point : -1)),
    savedAt: new Date().toISOString(),
  });
}

function resetMarks() {
  ui.preview = null;
  ui.hint = null;
  ui.hintText = null;
}

function lastMovePoint(g: Game): number | null {
  const m = g.moves[g.moves.length - 1];
  return m && m.type === 'play' ? m.point : null;
}

function confirmMove() {
  const g = ui.game;
  if (!g || ui.preview == null || ui.aiThinking || g.toMove !== HUMAN) return;
  const r = g.play(ui.preview);
  if (!r.ok) {
    showToast(ILLEGAL_TEXT[r.reason]);
    ui.preview = null;
    render();
    return;
  }
  sfx(r.captured.length ? 'capture' : 'stone');
  resetMarks();
  persist();
  if (g.isOver) return finishGame();
  scheduleAI();
  render();
}

function scheduleAI() {
  const g = ui.game;
  if (!g || g.isOver || g.toMove === HUMAN) return;
  ui.aiThinking = true;
  window.clearTimeout(aiTimer);
  aiTimer = window.setTimeout(() => {
    const game = ui.game;
    if (!game || ui.screen !== 'game') {
      ui.aiThinking = false;
      return;
    }
    const c = chooseMove(game, { level: ui.level });
    if (c.point == null) {
      game.pass();
      ui.aiThinking = false;
      persist();
      if (game.isOver) return endOrScore();
      showToast(game.rules.mode === 'normal' ? '하양이가 차례를 넘겼어요. 다 두었으면 나도 넘겨요' : '하양이가 차례를 넘겼어요');
      return;
    }
    const r = game.play(c.point);
    sfx(r.ok && r.captured.length ? 'capture' : 'stone');
    ui.aiThinking = false;
    persist();
    if (game.isOver) return finishGame();
    render();
  }, AI_DELAY);
}

/** 게임이 끝났을 때: 진짜 바둑에서 둘 다 넘겼으면 먼저 집을 세어 보여주고(더 두기 가능), 아니면 바로 결과 */
function endOrScore() {
  const g = ui.game!;
  if (g.result?.reason === 'score') {
    ui.sheet = 'score';
    resetMarks();
    const s = g.result.score;
    speak(
      `까망이는 ${s.blackTotal}점, 하양이는 덤까지 ${s.whiteTotal}점이에요. ${
        s.margin > 0 ? '까망이가 이겼어요!' : s.margin < 0 ? '하양이가 이겼어요.' : '똑같아요!'
      }`,
    );
    render();
    return;
  }
  finishGame();
}

/** 집 세기 화면에서 '더 둘래요': 넘기기를 되돌려 다시 까망이 차례로 */
function resumeAfterScore() {
  const g = ui.game;
  if (!g) return;
  do {
    g.undo();
  } while (g.moves.length && g.toMove !== HUMAN);
  ui.sheet = null;
  resetMarks();
  persist();
  render();
  scheduleAI();
}

function finishGame() {
  const g = ui.game!;
  const res = g.result!;
  let outcome: 'win' | 'loss' | 'draw' = 'draw';
  if ('winner' in res && res.winner === HUMAN) outcome = 'win';
  else if ('winner' in res && res.winner) outcome = 'loss';
  recordResult(outcome);
  clearGame();
  if (res.reason === 'capture') {
    ui.result =
      outcome === 'win'
        ? { title: '와, 이겼어요!', body: '하양이를 먼저 잡았어요. 숨구멍(활로)을 잘 막았어요!', mood: 'wow', win: true }
        : {
            title: '아쉬워요!',
            body: '하양이가 먼저 잡았어요. 숨구멍이 하나 남으면 얼른 도망가요.',
            mood: 'oops',
            win: false,
          };
  } else if (res.reason === 'resign') {
    ui.result = { title: '다음에 또 해요', body: '다시 하면 더 잘할 수 있어요!', mood: 'happy', win: false };
  } else if (res.reason === 'score') {
    const s = res.score;
    const detail = `까망이 ${s.blackTotal}점, 하양이 ${s.whiteTotal}점(덤 ${s.komi}점 포함)`;
    ui.result =
      outcome === 'win'
        ? { title: '와, 이겼어요!', body: `내 집을 더 많이 지었어요! ${detail}`, mood: 'wow', win: true }
        : outcome === 'loss'
          ? { title: '아쉬워요!', body: `하양이 집이 조금 더 많았어요. ${detail}`, mood: 'oops', win: false }
          : { title: '비겼어요!', body: `점수가 똑같아요. ${detail}`, mood: 'happy', win: false };
  } else {
    ui.result = { title: '비겼어요', body: '둘 다 돌을 잡지 못했어요.', mood: 'happy', win: false };
  }
  ui.sheet = 'result';
  resetMarks();
  if (ui.result.win) window.setTimeout(() => sfx('win'), 250);
  speak(`${ui.result.title} ${ui.result.body}`);
  render();
}

function undoTurn() {
  const g = ui.game;
  if (!g || ui.aiThinking) return;
  if (!g.moves.some((m) => m.color === HUMAN)) return showToast('아직 되돌릴 수가 없어요');
  // 하양이 수까지 함께 되돌려 다시 까망이 차례로
  do {
    g.undo();
  } while (g.moves.length && g.toMove !== HUMAN);
  if (g.toMove !== HUMAN) g.undo();
  resetMarks();
  persist();
  render();
}

function showHint() {
  const g = ui.game;
  if (!g || ui.aiThinking || g.toMove !== HUMAN) return;
  const c = chooseMove(g, { level: 3 });
  if (c.point == null) {
    return showToast(g.rules.mode === 'normal' ? '이제 놓을 곳이 거의 없어요. 차례 넘기기를 눌러도 돼요' : '놓을 곳이 없어요');
  }
  ui.hint = c.point;
  ui.hintText = HINT_TEXT[c.reason];
  ui.preview = null;
  speak(ui.hintText);
  render();
}

function tapBoard(p: number | null) {
  const g = ui.game;
  if (!g || p == null || g.isOver) return;
  if (ui.aiThinking || g.toMove !== HUMAN) return showToast('하양이 차례예요. 조금만 기다려요');
  if (ui.preview === p) return confirmMove(); // 같은 곳을 한 번 더 누르면 놓기
  const r = g.check(p);
  if (!r.ok) {
    ui.preview = null;
    showToast(ILLEGAL_TEXT[r.reason]);
    render();
    return;
  }
  ui.preview = p;
  render();
}

// ───────── 화면 ─────────

function showToast(text: string) {
  ui.toast = text;
  speak(text);
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    ui.toast = null;
    render();
  }, 2600);
  render();
}

function render() {
  const nobar = ui.screen === 'game' || ui.screen === 'lesson';
  document.body.classList.toggle('nobar', nobar);
  app.innerHTML =
    screenHTML() +
    (nobar ? '' : tabbarHTML()) +
    sheetHTML() +
    (ui.toast ? `<div class="toast" role="status">${esc(ui.toast)}</div>` : '');
}

function screenHTML(): string {
  switch (ui.screen) {
    case 'home':
      return homeHTML();
    case 'game':
      return gameHTML();
    case 'learn':
      return learnHTML();
    case 'lesson':
      return ui.lesson ? ui.lesson.html() : learnHTML();
    case 'puzzle':
      return puzzleHTML();
    case 'record':
      return recordHTML();
  }
}

function statsHTML(withDraws = false): string {
  const s = loadStats();
  return `<div class="stat-row">
    <div class="stat"><span>해 본 판</span><b>${s.games}</b></div>
    <div class="stat win"><span>이긴 판</span><b>${s.wins}</b></div>
    <div class="stat"><span>진 판</span><b>${s.losses}</b></div>
    ${withDraws ? `<div class="stat"><span>비긴 판</span><b>${s.draws}</b></div>` : ''}
  </div>`;
}

function homeHTML(): string {
  const saved = loadGame();
  return `<main class="screen home">
  <header class="home-head">
    <div>
      <div class="brand"><span class="wordmark">바둑한수</span><span class="seal" aria-hidden="true">手</span></div>
      <p class="sub">하루 한 수씩, 바둑이랑 놀아요</p>
    </div>
    <button class="round-btn" data-action="settings" aria-label="설정">${icon('gear')}</button>
  </header>

  ${learnCardHTML()}

  <div class="play-row">
    <button class="play-card capture" data-action="open-start" data-mode="capture">
      <span class="play-faces" aria-hidden="true"><span class="bob">${stoneFace('black', 64, 'happy')}</span><span class="bob late">${stoneFace('white', 64, 'happy')}</span></span>
      <span class="play-title">따내기 바둑</span>
      <span class="play-sub">하양이 돌을 먼저 <b>${ui.target}개</b> 잡으면 이겨요</span>
      <span class="play-go">${saved?.mode === 'capture' ? '이어서 하기' : '놀기'} ${icon('arrow')}</span>
    </button>
    <button class="play-card normal" data-action="open-start" data-mode="normal">
      <span class="play-faces" aria-hidden="true"><span class="play-house">${icon('house')}</span></span>
      <span class="play-title">진짜 바둑</span>
      <span class="play-sub">${saved?.mode === 'normal' ? `하던 ${saved.size}줄 판이 있어요` : '집을 더 많이 지으면 이겨요'}</span>
      <span class="play-go">${saved?.mode === 'normal' ? '이어서 하기' : '놀기'} ${icon('arrow')}</span>
    </button>
  </div>

  <div class="grid2">
    <button class="card" data-action="tab" data-tab="learn">
      <span class="card-ic mint">${icon('book')}</span>
      <span class="card-title">강의 목록</span>
      <span class="card-sub">${loadLessons().done.length} / ${ALL_TITLES.length}강 배웠어요</span>
    </button>
    <button class="card" data-action="tab" data-tab="puzzle">
      <span class="card-ic sky">${icon('grid')}</span>
      <span class="card-title">문제 놀이</span>
      <span class="card-sub">${practiceOpenCount() ? `연습 ${practiceOpenCount()}가지 열렸어요` : '4강을 배우면 열려요'}</span>
    </button>
  </div>

  ${statsHTML()}
</main>`;
}

function gameHTML(): string {
  const g = ui.game!;
  const humanTurn = g.toMove === HUMAN && !ui.aiThinking && !g.isOver;
  const canUndo = g.moves.some((m) => m.color === HUMAN) && !ui.aiThinking;
  const status =
    ui.preview != null
      ? `<div class="confirm">
      <div class="confirm-text"><b>여기에 놓을까요?</b><span>한 번 더 눌러도 돼요</span></div>
      <button class="btn ghost" data-action="cancel-preview">아니요</button>
      <button class="btn primary" data-action="confirm">놓기</button>
    </div>`
      : `<div class="guide ${ui.hintText ? 'has-hint' : ''}">${
          ui.hintText
            ? `${icon('bulb')}<span>${esc(ui.hintText)}</span>`
            : g.isOver
              ? '<span>다 두었어요</span>'
              : humanTurn
              ? '<span>놓고 싶은 곳을 눌러요</span>'
              : '<span class="thinking">하양이가 생각하고 있어요…</span>'
        }</div>`;
  return `<main class="screen game">
  <header class="bar">
    <button class="back" data-action="exit-game">${icon('chev')}나가기</button>
    <h1>${g.rules.mode === 'normal' ? '진짜 바둑' : '따내기 바둑'}</h1>
    <span class="pill" aria-label="하양이 실력 ${LEVELS[ui.level].name}">${LEVELS[ui.level].stars}<span class="pill-name"> ${LEVELS[ui.level].name}</span></span>
  </header>
  <div class="game-layout">
    <div class="board-col">
      <div class="board-wrap">${renderBoard(g, {
        preview: ui.preview,
        previewColor: HUMAN,
        lastMove: lastMovePoint(g),
        hint: ui.hint,
      })}</div>
    </div>
    <div class="side">
      <div class="players">
        <div class="player me ${g.toMove === BLACK ? 'turn' : ''}">
          ${stoneFace('black', 56, g.toMove === BLACK ? 'happy' : 'think')}
          <span class="pname"><b>나 · 까망이</b><small>${g.toMove === BLACK ? '내 차례!' : '기다려요'}</small></span>
          <span class="pcount" aria-label="잡은 돌">${g.captures(BLACK)}</span>
        </div>
        <div class="player ${g.toMove === WHITE ? 'turn' : ''}">
          ${stoneFace('white', 56, g.toMove === WHITE ? 'think' : 'happy')}
          <span class="pname"><b>하양이</b><small>${g.toMove === WHITE ? '생각 중' : '기다려요'}</small></span>
          <span class="pcount" aria-label="잡은 돌">${g.captures(WHITE)}</span>
        </div>
      </div>
      ${
        g.rules.mode === 'normal'
          ? `<p class="goal">집을 더 많이 지으면 이겨요 · 하양이는 <b>덤 ${g.rules.komi}점</b> · 숫자는 잡은 돌</p>`
          : `<p class="goal">먼저 돌 <b>${g.rules.captureTarget}개</b>를 잡으면 이겨요 · 숫자는 잡은 돌</p>`
      }
      ${status}
      <nav class="tools ${g.rules.mode === 'normal' ? 'five' : ''}" aria-label="놀이 도구">
        <button data-action="hint" ${humanTurn ? '' : 'disabled'}><span class="tool-ic yellow">${icon('bulb')}</span>도와줘</button>
        <button data-action="undo" ${canUndo ? '' : 'disabled'}><span class="tool-ic sky">${icon('undo')}</span>되돌리기</button>
        ${
          g.rules.mode === 'normal'
            ? `<button data-action="ask-pass" ${humanTurn ? '' : 'disabled'}><span class="tool-ic mint">${icon('skip')}</span>넘기기</button>`
            : ''
        }
        <button data-action="rules"><span class="tool-ic mint">${icon('help')}</span>규칙</button>
        <button data-action="ask-resign" ${humanTurn ? '' : 'disabled'}><span class="tool-ic pink">${icon('flag')}</span>그만하기</button>
      </nav>
    </div>
  </div>
</main>`;
}

function nextLessonId(): number | null {
  const done = loadLessons().done;
  const l = LESSONS.find((x) => !done.includes(x.id));
  return l ? l.id : null;
}

function isOpen(id: number): boolean {
  if (id > LESSONS.length) return false;
  const done = loadLessons().done;
  return id === 1 || done.includes(id - 1) || done.includes(id);
}

function learnCardHTML(): string {
  const id = nextLessonId();
  if (id == null) {
    return `<section class="learn-card done"><div><div class="kicker">바둑 배우기</div><h2>${LESSONS.length}강까지 다 배웠어요!</h2><p>이제 하양이와 진짜 바둑을 둬 볼까요?</p></div></section>`;
  }
  const l = LESSONS[id - 1];
  return `<section class="learn-card">
    <div class="learn-num">${id}<small>강</small></div>
    <div class="learn-text"><div class="kicker">오늘 배울 것</div><h2>${l.title}<span class="term">${l.term}</span></h2><p>${l.goal}</p></div>
    <button class="btn primary" data-action="lesson-open" data-id="${id}">${icon('play')}배우기</button>
  </section>`;
}

function learnHTML(): string {
  const done = loadLessons().done;
  const items = ALL_TITLES.map((t, i) => {
    const id = i + 1;
    const open = isOpen(id);
    const fin = done.includes(id);
    const tag = fin ? `<span class="badge ok">${icon('check')}다 했어요</span>` : open ? '<span class="badge go">배우기</span>' : icon('lock');
    const inner = `<span class="lnum">${id}</span><span class="ltitle">${t.title}<span class="term">${t.term}</span></span>${tag}`;
    return open
      ? `<li><button class="lesson ${fin ? 'fin' : ''}" data-action="lesson-open" data-id="${id}">${inner}</button></li>`
      : `<li><div class="lesson locked">${inner}</div></li>`;
  }).join('');
  return `<main class="screen">
  <header class="page-head"><h1>바둑 배우기</h1><p>하나씩 배우면 다음 강이 열려요. 파란 “바둑 말” 꼬리표는 바둑에서 쓰는 이름이에요.</p></header>
  <ol class="lessons">${items}</ol>
</main>`;
}

function recordHTML(): string {
  return `<main class="screen">
  <header class="page-head"><h1>내 기록</h1><p>이 기기에만 저장돼요</p></header>
  ${statsHTML(true)}
</main>`;
}

function practiceOpen(set: PracticeSet): boolean {
  return loadLessons().done.includes(set.after);
}

function practiceOpenCount(): number {
  return PRACTICE.filter(practiceOpen).length;
}

function puzzleHTML(): string {
  const done = loadPractice().done;
  const items = PRACTICE.map((set, i) => {
    const open = practiceOpen(set);
    const n = done[set.skill] ?? 0;
    const tag = !open
      ? `<span class="badge">${icon('lock')}${set.after}강 먼저</span>`
      : n
        ? `<span class="badge ok">${icon('check')}${n}번 했어요</span>`
        : '<span class="badge go">풀기</span>';
    const inner = `<span class="lnum">${set.skill === 'mix' ? '★' : set.after}</span><span class="ltitle">${set.title}<span class="term">${set.term}</span><small class="lgoal">${set.goal}</small></span>${tag}`;
    return open
      ? `<li><button class="lesson ${n ? 'fin' : ''}" data-action="practice-open" data-i="${i}">${inner}</button></li>`
      : `<li><div class="lesson locked">${inner}</div></li>`;
  }).join('');
  return `<main class="screen">
  <header class="page-head"><h1>문제 놀이</h1><p>강에서 배운 걸 여러 번 풀어 봐요. 한 번에 ${COUNT}문제, 할 때마다 새 문제가 나와요.</p></header>
  <ol class="lessons">${items}</ol>
</main>`;
}

function openPractice(i: number) {
  const set = PRACTICE[i];
  if (!set || !practiceOpen(set)) return;
  ui.lesson?.stop();
  ui.sheet = null;
  ui.screen = 'lesson';
  ui.lesson = new LessonPlayer(makePractice(set), render);
}

function tabbarHTML(): string {
  const tabs: [Screen, string, string][] = [
    ['home', '홈', 'home'],
    ['learn', '배우기', 'book'],
    ['puzzle', '문제', 'grid'],
    ['record', '기록', 'chart'],
  ];
  return `<nav class="tabbar" aria-label="주 메뉴"><div class="tabbar-in">${tabs
    .map(
      ([id, label, ic]) =>
        `<button data-action="tab" data-tab="${id}" ${ui.screen === id ? 'aria-current="page"' : ''}>${icon(ic)}<span>${label}</span></button>`,
    )
    .join('')}</div></nav>`;
}

function sheetHTML(): string {
  if (!ui.sheet) return '';
  let body = '';
  if (ui.sheet === 'start') {
    const saved = loadGame();
    const normal = ui.mode === 'normal';
    const savedName = saved?.mode === 'normal' ? '진짜 바둑' : '따내기 바둑';
    body = `<h2>${normal ? '하양이와 진짜 바둑' : '하양이와 따내기 바둑'}</h2>
    ${saved ? `<button class="btn primary full big" data-action="resume">하던 ${savedName} 이어서 하기</button><div class="or">또는 새로 시작해요${saved.mode !== ui.mode ? ' (하던 판은 지워져요)' : ''}</div>` : ''}
    <p class="sheet-label">하양이 실력</p>
    <div class="chips" role="radiogroup" aria-label="하양이 실력">
      ${([1, 2, 3] as Level[])
        .map(
          (l) =>
            `<button role="radio" aria-checked="${ui.level === l}" class="chip ${ui.level === l ? 'on' : ''}" data-action="level" data-level="${l}"><span class="chip-stars">${LEVELS[l].stars}</span>${LEVELS[l].name}</button>`,
        )
        .join('')}
    </div>
    ${
      normal
        ? `<p class="sheet-label">바둑판 크기</p>
    <div class="chips" role="radiogroup" aria-label="바둑판 크기">
      ${NORMAL_SIZES.map(
        (n) =>
          `<button role="radio" aria-checked="${ui.normalSize === n}" class="chip ${ui.normalSize === n ? 'on' : ''}" data-action="normal-size" data-size="${n}"><span class="chip-num">${n}줄</span>${n === 9 ? '처음' : '크게'}</button>`,
      ).join('')}
    </div>
    <p class="sheet-p small">${
      ui.normalSize === 13 ? '13줄은 9줄보다 두 배쯤 오래 걸려요. ' : ''
    }하양이는 나중에 두니까 덤 7점을 받아요. 다 두었으면 '넘기기'를 눌러요.</p>`
        : `<p class="sheet-label">바둑판 크기</p>
    <div class="chips" role="radiogroup" aria-label="바둑판 크기">
      ${SIZES.map(
        (n) =>
          `<button role="radio" aria-checked="${ui.size === n}" class="chip ${ui.size === n ? 'on' : ''}" data-action="size" data-size="${n}"><span class="chip-num">${n}줄</span>${n === 5 ? '작게' : n === 7 ? '보통' : '크게'}</button>`,
      ).join('')}
    </div>
    <p class="sheet-label">먼저 잡을 돌</p>
    <div class="chips" role="radiogroup" aria-label="먼저 잡을 돌 수">
      ${TARGETS.map(
        (t) =>
          `<button role="radio" aria-checked="${ui.target === t}" class="chip ${ui.target === t ? 'on' : ''}" data-action="target" data-target="${t}"><span class="chip-num">${t}개</span>${t === 1 ? '처음' : t === 2 ? '조금 더' : '길게'}</button>`,
      ).join('')}
    </div>`
    }
    ${readyNudgeHTML()}
    <button class="btn ${saved ? 'ghost' : 'primary'} full big" data-action="start">새로 시작</button>
    <button class="btn text full" data-action="close-sheet">닫기</button>`;
  } else if (ui.sheet === 'rules' && ui.game?.rules.mode === 'normal') {
    const g = Game.fromDiagram(['X . X . .', 'X X X . .', '. . O O O', '. . O . O', '. . O O O'], BLACK);
    body = `<h2>진짜 바둑 놀이 방법</h2>
    <div class="rules-board">${renderBoard(g, { owner: g.score().owner })}</div>
    <ol class="rules">
      <li><b>까망이(나)</b>와 <b>하양이</b>가 번갈아 돌을 놓아요.</li>
      <li>내 돌로 둘러싼 빈 곳이 <b>내 집</b>이에요. 그림의 네모가 집이에요.</li>
      <li>처음에는 <b>귀(모서리) → 변(가장자리) → 가운데</b> 순서로 두면 집 짓기가 쉬워요.</li>
      <li>더 놓을 곳이 없으면 <b>넘기기</b>를 눌러요. 둘 다 넘기면 앱이 세어 줘요.</li>
      <li>내 집 안의 하양이 돌은 끝나기 전에 <b>꼭 잡아요!</b> 판 위에 남은 돌은 다 살아 있는 돌로 세요.</li>
      <li>돌 + 집이 더 많으면 이겨요. 하양이는 <b>덤 7점</b>을 더 받아요.</li>
    </ol>
    <button class="btn primary full big" data-action="close-rules">알았어요!</button>`;
  } else if (ui.sheet === 'pass') {
    body = `<h2>차례를 넘길까요?</h2><p class="sheet-p">더 놓을 곳이 없을 때 넘겨요. 하양이도 넘기면 바둑이 끝나고 집을 세어요.</p>
    <div class="row2"><button class="btn ghost" data-action="close-sheet">더 둘래요</button><button class="btn primary" data-action="pass">넘길래요</button></div>`;
  } else if (ui.sheet === 'score' && ui.game?.result?.reason === 'score') {
    const g = ui.game;
    const s = ui.game.result.score;
    const verdict = s.margin > 0 ? '까망이가 이겼어요!' : s.margin < 0 ? '하양이가 이겼어요' : '똑같아요! 비겼어요';
    body = `<h2>집을 세어 봐요</h2>
    <div class="rules-board score-board">${renderBoard(g, { owner: s.owner })}</div>
    <table class="score-table">
      <thead><tr><th></th><th>돌</th><th>집</th><th>덤</th><th>합계</th></tr></thead>
      <tbody>
        <tr><th>까망이</th><td>${s.blackStones}</td><td>${s.blackArea}</td><td>-</td><td><b>${s.blackTotal}</b></td></tr>
        <tr><th>하양이</th><td>${s.whiteStones}</td><td>${s.whiteArea}</td><td>${s.komi}</td><td><b>${s.whiteTotal}</b></td></tr>
      </tbody>
    </table>
    <p class="sheet-p center"><b>${verdict}</b></p>
    <p class="sheet-p small center">집 안에 잡지 않은 돌이 남아 있으면 '더 둘래요'를 눌러 마저 잡아요.</p>
    <div class="row2"><button class="btn ghost" data-action="resume-play">더 둘래요</button><button class="btn primary" data-action="finish-score">끝낼래요</button></div>`;
  } else if (ui.sheet === 'rules') {
    const g = Game.fromDiagram(['. . . . .', '. . X . .', '. X O X .', '. . . . .', '. . . . .'], BLACK);
    body = `<h2>따내기 바둑 놀이 방법</h2>
    <div class="rules-board">${renderBoard(g, { hint: 17 })}</div>
    <ol class="rules">
      <li><b>까망이(나)</b>와 <b>하양이</b>가 번갈아 선이 만나는 곳에 돌을 놓아요.</li>
      <li>돌 옆 위·아래·왼쪽·오른쪽 빈 곳은 돌이 숨 쉬는 <b>숨구멍</b>이에요. <small>(바둑 말로 '활로')</small></li>
      <li>숨구멍을 모두 막으면 그 돌을 <b>잡아요!</b> 그림의 점선에 놓으면 하양이를 잡아요.</li>
      <li>먼저 <b>${ui.game?.rules.captureTarget ?? ui.target}개</b>를 잡으면 이겨요. 내 숨구멍이 하나 남으면 얼른 도망가요!</li>
    </ol>
    <button class="btn primary full big" data-action="close-rules">알았어요!</button>`;
  } else if (ui.sheet === 'resign') {
    body = `<h2>그만할까요?</h2><p class="sheet-p">그만하면 이번 판은 진 판으로 적혀요.</p>
    <div class="row2"><button class="btn primary" data-action="close-sheet">계속할래요</button><button class="btn ghost" data-action="resign">그만할래요</button></div>`;
  } else if (ui.sheet === 'settings') {
    const st = loadSettings();
    body = `<h2>설정</h2>
    <button class="toggle" data-action="toggle-sound" role="switch" aria-checked="${st.sound}"><span>${icon('play')}돌 놓는 소리·효과음</span><span class="sw ${st.sound ? 'on' : ''}"></span></button>
    <button class="toggle" data-action="toggle-voice" role="switch" aria-checked="${st.voice}"><span>${icon('speaker')}글 읽어 주기</span><span class="sw ${st.voice ? 'on' : ''}"></span></button>
    <p class="sheet-label">읽어 주기 빠르기</p>
    <div class="chips two" role="radiogroup" aria-label="읽어 주기 빠르기">
      ${(
        [
          ['slow', '천천히'],
          ['normal', '보통'],
        ] as const
      )
        .map(
          ([r, name]) =>
            `<button role="radio" aria-checked="${st.rate === r}" class="chip ${st.rate === r ? 'on' : ''}" data-action="rate" data-rate="${r}">${name}</button>`,
        )
        .join('')}
    </div>
    <p class="sheet-p small">소리가 안 나면 아이패드 옆 소리 크기 버튼을 올려 주세요.</p>
    <details class="parent">
      <summary>보호자용</summary>
      <div class="parent-in">
        <button class="btn ghost full" data-action="backup-export">기록 백업하기</button>
        <button class="btn ghost full" data-action="backup-import">기록 불러오기</button>
        <input type="file" id="backup-file" accept="application/json,.json" hidden />
        <button class="btn ghost full" data-action="ask-reset-lessons">강의 처음부터 다시</button>
        <p class="sheet-p small">백업 파일에는 강의 진도·전적·설정·하던 판이 들어 있어요. 다른 기기나 Safari에서 불러올 수 있어요.</p>
      </div>
    </details>
    <button class="btn primary full big" data-action="close-sheet">닫기</button>`;
  } else if (ui.sheet === 'reset-lessons') {
    body = `<h2>강의를 처음부터 할까요?</h2><p class="sheet-p">배운 강 표시가 모두 지워져요. 전적과 하던 판은 그대로예요.</p>
    <div class="row2"><button class="btn primary" data-action="settings">아니요</button><button class="btn ghost" data-action="reset-lessons">처음부터</button></div>`;
  } else if (ui.sheet === 'lesson-done') {
    const l = ui.lesson!.lesson;
    const next = LESSONS[l.id];
    const pi = PRACTICE.findIndex((p) => p.after === l.id && p.skill !== 'mix');
    body = `<div class="result-face">${starBurst()}${stoneFace('black', 120, 'wow')}</div>
    <h2 class="result-title">${l.id}강 끝!</h2>
    <p class="sheet-p center">${rich(`**${l.title}(${l.term})**${objJosa(l.title)} 다 배웠어요. 정말 잘했어요!`)}</p>
    ${pi >= 0 ? `<button class="btn primary full big" data-action="practice-open" data-i="${pi}">${icon('grid')}연습 문제 ${COUNT}개 풀기</button><p class="sheet-p small center">여러 번 풀면 실전에서 금방 보여요!</p>` : ''}
    <div class="row2">${
      next
        ? `<button class="btn ghost" data-action="tab" data-tab="learn">목록으로</button><button class="btn primary" data-action="lesson-open" data-id="${next.id}">${next.id}강 하러 가기</button>`
        : `<button class="btn ghost" data-action="tab" data-tab="learn">목록으로</button><button class="btn primary" data-action="open-start" data-mode="normal">하양이랑 진짜 바둑</button>`
    }</div>`;
  } else if (ui.sheet === 'practice-done') {
    const l = ui.lesson!.lesson;
    const i = PRACTICE.findIndex((p) => p.skill === l.practice);
    body = `<div class="result-face">${starBurst()}${stoneFace('black', 120, 'wow')}</div>
    <h2 class="result-title">${COUNT}문제 다 풀었어요!</h2>
    <p class="sheet-p center">${rich(`**${l.title}(${l.term})** 연습 끝. 정말 잘했어요!`)}</p>
    <div class="row2"><button class="btn ghost" data-action="tab" data-tab="puzzle">목록으로</button><button class="btn primary" data-action="practice-open" data-i="${i}">새 문제 더!</button></div>`;
  } else if (ui.sheet === 'result') {
    const r = ui.result;
    body = `<div class="result-face">${r.win ? starBurst() : ''}${stoneFace('black', 120, r.mood)}</div>
    <h2 class="result-title">${esc(r.title)}</h2><p class="sheet-p center">${esc(r.body)}</p>
    <div class="row2"><button class="btn ghost" data-action="go-home">홈으로</button><button class="btn primary" data-action="again">한 판 더!</button></div>`;
  }
  const dismissable =
    ui.sheet === 'start' || ui.sheet === 'resign' || ui.sheet === 'settings' || ui.sheet === 'reset-lessons' || ui.sheet === 'pass';
  return `<div class="sheet-backdrop" ${dismissable ? 'data-action="close-sheet"' : ''}></div>
  <div class="sheet" role="dialog" aria-modal="true"><div class="sheet-handle"></div>${body}</div>`;
}

/** 4~6강(단수·잡기·도망가기)을 아직 안 배웠으면 먼저 배우도록 살짝 안내(막지는 않음) */
function readyNudgeHTML(): string {
  const done = loadLessons().done;
  const ready = READY_LESSON[ui.mode];
  if (done.includes(ready) || ready > LESSONS.length) return '';
  const id = nextLessonId();
  if (id == null || id > ready) return '';
  const what = ui.mode === 'normal' ? '진짜 바둑이' : '돌 잡기가';
  return `<div class="nudge">${icon('bulb')}<span>${ready}강까지 배우면 ${what} 더 쉬워져요!</span><button class="btn ghost" data-action="lesson-open" data-id="${id}">${id}강 배우기</button></div>`;
}

/** 받침에 따라 을/를 */
function objJosa(word: string): string {
  const c = word.charCodeAt(word.length - 1);
  return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0 ? '을' : '를';
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

// ───────── 입력 ─────────

app.addEventListener('click', (ev) => {
  const target = ev.target as Element;
  const lsvg = target.closest('.lesson-screen .board-svg') as SVGSVGElement | null;
  if (lsvg && ui.lesson && !ui.sheet) {
    ui.lesson.tapPoint(pointFromEvent(lsvg, ui.lesson.size, (ev as MouseEvent).clientX, (ev as MouseEvent).clientY));
    return;
  }
  const svg = target.closest('.game:not(.lesson-screen) .board-svg') as SVGSVGElement | null;
  if (svg && ui.game && !ui.sheet) {
    tapBoard(pointFromEvent(svg, ui.game.size, (ev as MouseEvent).clientX, (ev as MouseEvent).clientY));
    return;
  }
  const el = target.closest('[data-action]') as HTMLElement | null;
  if (!el || (el as HTMLButtonElement).disabled) return;
  switch (el.dataset.action) {
    case 'tab':
      ui.lesson?.stop();
      stopSpeaking();
      ui.screen = el.dataset.tab as Screen;
      ui.sheet = null;
      break;
    case 'lesson-open': {
      const l = LESSONS[Number(el.dataset.id) - 1];
      if (!l) break;
      ui.lesson?.stop();
      ui.sheet = null;
      ui.screen = 'lesson';
      ui.lesson = new LessonPlayer(l, render);
      break;
    }
    case 'lesson-next': {
      const lp = ui.lesson;
      if (!lp?.next()) break;
      if (lp.lesson.practice) {
        markPracticeDone(lp.lesson.practice);
        ui.sheet = 'practice-done';
        speak(`${COUNT}문제 다 풀었어요! 정말 잘했어요!`);
      } else {
        markLessonDone(lp.lesson.id);
        ui.sheet = 'lesson-done';
        speak(`${lp.lesson.id}강 끝! 정말 잘했어요!`);
      }
      sfx('win');
      break;
    }
    case 'lesson-choose':
      ui.lesson?.choose(Number(el.dataset.i));
      return;
    case 'lesson-say':
      ui.lesson?.sayAgain();
      return;
    case 'lesson-exit':
      ui.lesson?.stop();
      stopSpeaking();
      ui.screen = ui.lesson?.lesson.practice ? 'puzzle' : 'learn';
      break;
    case 'practice-open':
      openPractice(Number(el.dataset.i));
      break;
    case 'settings':
      ui.sheet = 'settings';
      break;
    case 'toggle-sound': {
      const st = loadSettings();
      st.sound = !st.sound;
      saveSettings(st);
      if (st.sound) sfx('stone');
      break;
    }
    case 'toggle-voice': {
      const st = loadSettings();
      st.voice = !st.voice;
      saveSettings(st);
      if (st.voice) speak('글을 읽어 줄게요');
      else stopSpeaking();
      break;
    }
    case 'rate': {
      const st = loadSettings();
      st.rate = el.dataset.rate === 'slow' ? 'slow' : 'normal';
      saveSettings(st);
      speak('이 빠르기로 읽어 줄게요');
      break;
    }
    case 'ask-reset-lessons':
      ui.sheet = 'reset-lessons';
      break;
    case 'reset-lessons':
      ui.lesson?.stop();
      ui.lesson = null;
      resetLessons();
      ui.sheet = null;
      showToast('강의를 처음부터 할 수 있어요');
      return;
    case 'backup-export':
      void shareBackup();
      return;
    case 'backup-import':
      (document.getElementById('backup-file') as HTMLInputElement | null)?.click();
      return;
    case 'open-start':
      if (ui.screen === 'lesson') ui.screen = 'home';
      ui.mode = el.dataset.mode === 'normal' ? 'normal' : 'capture';
      ui.sheet = 'start';
      break;
    case 'size':
      ui.size = Number(el.dataset.size) as BoardSize;
      break;
    case 'normal-size':
      ui.normalSize = Number(el.dataset.size) === 13 ? 13 : 9;
      break;
    case 'ask-pass':
      ui.sheet = 'pass';
      break;
    case 'pass': {
      const g = ui.game;
      ui.sheet = null;
      if (!g || g.isOver || ui.aiThinking || g.toMove !== HUMAN) break;
      g.pass();
      resetMarks();
      persist();
      if (g.isOver) return endOrScore();
      render();
      scheduleAI();
      return;
    }
    case 'resume-play':
      return resumeAfterScore();
    case 'finish-score':
      return finishGame();
    case 'level':
      ui.level = Number(el.dataset.level) as Level;
      break;
    case 'target':
      ui.target = Number(el.dataset.target) as Target;
      break;
    case 'resume':
      if (resumeGame()) enterGame();
      else showToast('이어서 할 판을 찾지 못했어요');
      break;
    case 'start':
    case 'again':
      newGame(ui.level, ui.target);
      enterGame();
      break;
    case 'close-sheet':
      ui.sheet = null;
      break;
    case 'close-rules':
      markRulesSeen(ui.game?.rules.mode ?? 'capture');
      ui.sheet = null;
      break;
    case 'rules':
      ui.sheet = 'rules';
      break;
    case 'confirm':
      return confirmMove();
    case 'cancel-preview':
      ui.preview = null;
      break;
    case 'hint':
      return showHint();
    case 'undo':
      return undoTurn();
    case 'ask-resign':
      ui.sheet = 'resign';
      break;
    case 'resign':
      ui.sheet = null;
      // 그만하기는 까망이 차례에만(하양이 차례에 누르면 하양이가 그만둔 것으로 처리되는 문제 방지)
      if (!ui.game || ui.game.isOver || ui.aiThinking || ui.game.toMove !== HUMAN) break;
      ui.game.resign();
      return finishGame();
    case 'exit-game':
      window.clearTimeout(aiTimer);
      ui.aiThinking = false;
      persist();
      ui.screen = 'home';
      ui.sheet = null;
      break;
    case 'go-home':
      ui.screen = 'home';
      ui.sheet = null;
      ui.game = null;
      break;
  }
  render();
});

// ───────── 백업 ─────────

async function shareBackup() {
  const json = JSON.stringify(exportBackup(), null, 2);
  const day = new Date().toISOString().slice(0, 10);
  const name = `baduk-hansu-backup-${day}.json`;
  const file = new File([json], name, { type: 'application/json' });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: '바둑한수 백업' });
      return;
    }
  } catch (e) {
    if ((e as DOMException)?.name === 'AbortError') return; // 공유 창을 닫음
  }
  // 공유 시트가 없으면 파일로 내려받기
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

app.addEventListener('change', (ev) => {
  const input = ev.target as HTMLInputElement;
  if (input.id !== 'backup-file' || !input.files?.[0]) return;
  input.files[0]
    .text()
    .then((text) => {
      if (!importBackup(text)) return showToast('백업 파일이 아니에요');
      ui.game = null;
      ui.lesson = null;
      ui.sheet = null;
      ui.screen = 'home';
      showToast('기록을 불러왔어요');
    })
    .catch(() => showToast('파일을 읽지 못했어요'));
});

function enterGame() {
  ui.screen = 'game';
  ui.sheet = hasSeenRules(ui.game?.rules.mode ?? 'capture') ? null : 'rules';
  render();
  scheduleAI();
}

// ───────── 시작 ─────────

requestPersistence();
// 아이패드는 첫 터치 뒤에만 소리가 난다
document.addEventListener('pointerdown', () => unlockAudio(), { once: true });
render();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .catch(() => {});
  });
}
