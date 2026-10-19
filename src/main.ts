import './style.css';
import { BLACK, WHITE, Game, type IllegalReason } from './engine/rules';
import { REASON_TEXT, chooseMove, type Level } from './engine/ai/beginner';
import { pointFromEvent, renderBoard } from './ui/board';
import {
  clearGame,
  hasSeenRules,
  loadGame,
  loadStats,
  markRulesSeen,
  recordResult,
  requestPersistence,
  saveGame,
} from './storage';
import { icon } from './ui/icons';

// ───────── 상태 ─────────
// 아이폰에서는 history API를 쓰지 않는다(홈 화면 앱 뒤로가기 꼬임 방지). 화면 이동은 아래 탭과 '← 뒤로' 버튼만.

type Screen = 'home' | 'game' | 'learn' | 'puzzle' | 'record';
type Sheet = null | 'start' | 'rules' | 'resign' | 'result';

const ui = {
  screen: 'home' as Screen,
  sheet: null as Sheet,
  level: 1 as Level,
  game: null as Game | null,
  preview: null as number | null,
  hint: null as number | null,
  hintText: null as string | null,
  aiThinking: false,
  toast: null as string | null,
  resultText: { title: '', body: '' },
};

const HUMAN = BLACK;
const AI_DELAY = 450;
let aiTimer: number | undefined;
let toastTimer: number | undefined;

const app = document.getElementById('app')!;

const ILLEGAL_TEXT: Record<IllegalReason, string> = {
  occupied: '이미 돌이 있는 곳이에요',
  suicide: '여기에 두면 내 돌이 바로 잡혀요 (자살수라 둘 수 없어요)',
  superko: '같은 모양이 다시 나와서 지금은 둘 수 없어요 (패)',
  'off-board': '바둑판 안의 교차점을 눌러 주세요',
  'game-over': '대국이 끝났어요',
};

const LESSONS = [
  '바둑판과 교차점',
  '흑백 착수 순서',
  '활로',
  '단수',
  '돌 따내기 · 자살수',
  '돌 살리기',
  '연결과 끊기',
  '집의 개념',
  '삶과 두 집',
  '패와 동형반복',
  '대국 종료와 계가',
  '첫 9줄 대국',
];

// ───────── 대국 진행 ─────────

function newGame(level: Level) {
  ui.game = new Game({ size: 9, mode: 'capture', captureTarget: 1 });
  ui.level = level;
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
    if (c.point == null) game.pass();
    else game.play(c.point);
    ui.aiThinking = false;
    persist();
    if (game.isOver) return finishGame();
    render();
  }, AI_DELAY);
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
    ui.resultText =
      outcome === 'win'
        ? { title: '이겼어요!', body: '백 돌을 먼저 따냈어요. 마지막 활로를 정확히 막았어요.' }
        : { title: '아쉬워요', body: '백이 먼저 흑 돌을 따냈어요. 단수가 된 돌은 바로 달아나거나 이어 주세요.' };
  } else if (res.reason === 'resign') {
    ui.resultText = { title: '기권했어요', body: '다음 판에서 다시 도전해 봐요.' };
  } else {
    ui.resultText = { title: '비겼어요', body: '둘 다 돌을 따내지 못하고 패스했어요.' };
  }
  ui.sheet = 'result';
  resetMarks();
  render();
}

function undoTurn() {
  const g = ui.game;
  if (!g || ui.aiThinking) return;
  const hasHumanMove = g.moves.some((m) => m.color === HUMAN);
  if (!hasHumanMove) return showToast('아직 무를 수가 없어요');
  // AI 수까지 함께 물러 다시 흑 차례로
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
  if (c.point == null) return showToast('둘 곳이 없어요');
  ui.hint = c.point;
  ui.hintText = REASON_TEXT[c.reason];
  ui.preview = null;
  render();
}

function tapBoard(p: number | null) {
  const g = ui.game;
  if (!g || p == null || g.isOver) return;
  if (ui.aiThinking || g.toMove !== HUMAN) return showToast('백이 두는 중이에요');
  if (ui.preview === p) return confirmMove(); // 같은 곳을 한 번 더 누르면 착수
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
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    ui.toast = null;
    render();
  }, 2400);
  render();
}

function render() {
  const nobar = ui.screen === 'game';
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
    case 'puzzle':
      return placeholderHTML('문제 풀기', '단수·따내기 입문 문제는 1~6강과 함께 열려요.');
    case 'record':
      return recordHTML();
  }
}

function homeHTML(): string {
  const saved = loadGame();
  const stats = loadStats();
  return `<main class="screen home">
  <header class="home-head">
    <div>
      <div class="brand"><span class="wordmark">바둑한수</span><span class="seal" aria-hidden="true">手</span></div>
      <p class="sub">하루 한 수씩, 바둑을 배우다</p>
    </div>
  </header>

  <section class="hero">
    <div class="hero-row">
      <div class="hero-text">
        <div class="kicker">지금 해 볼 수 있어요</div>
        <h2>따내기 바둑</h2>
        <p>상대 돌을 먼저 1점 따내면 이기는 입문용 바둑이에요.</p>
      </div>
      <div class="hero-board">${miniBoard()}</div>
    </div>
    <button class="btn light" data-action="open-start">${saved ? '이어서 두기' : 'AI와 한 판 두기'} ${icon('arrow')}</button>
  </section>

  <div class="grid2">
    <button class="card" data-action="tab" data-tab="learn">
      <span class="card-ic">${icon('book')}</span>
      <span class="card-title">바둑 배우기</span>
      <span class="card-sub">기초 12강<br>다음 업데이트에서 열려요</span>
    </button>
    <button class="card" data-action="tab" data-tab="puzzle">
      <span class="card-ic">${icon('grid')}</span>
      <span class="card-title">문제 풀기</span>
      <span class="card-sub">단수·따내기<br>입문 문제 준비 중</span>
    </button>
  </div>

  <div class="stat-row">
    <div class="stat"><span>대국</span><b>${stats.games}<small>판</small></b></div>
    <div class="stat"><span>승</span><b>${stats.wins}</b></div>
    <div class="stat"><span>패</span><b>${stats.losses}</b></div>
  </div>
</main>`;
}

function miniBoard(): string {
  const g = Game.fromDiagram(
    ['. . . . .', '. . X . .', '. X O X .', '. . . . .', '. . . . .'],
    BLACK,
  );
  return renderBoard(g, { hint: 17 });
}

function gameHTML(): string {
  const g = ui.game!;
  const humanTurn = g.toMove === HUMAN && !ui.aiThinking && !g.isOver;
  const canUndo = g.moves.some((m) => m.color === HUMAN) && !ui.aiThinking;
  const confirmBar =
    ui.preview != null
      ? `<div class="confirm">
      <div class="confirm-text"><b>여기에 둘까요?</b><span>같은 곳을 한 번 더 눌러도 돼요</span></div>
      <button class="btn ghost sm" data-action="cancel-preview">취소</button>
      <button class="btn dark sm" data-action="confirm">착수</button>
    </div>`
      : `<div class="guide">${
          ui.hintText
            ? `${icon('bulb')}<span>${esc(ui.hintText)}</span>`
            : humanTurn
              ? '<span>둘 곳을 눌러 보세요. 미리보기 후 착수해요.</span>'
              : '<span class="thinking">백이 생각하는 중…</span>'
        }</div>`;
  return `<main class="screen game">
  <header class="bar">
    <button class="back" data-action="exit-game">${icon('chev')}나가기</button>
    <h1>따내기 바둑</h1>
    <span class="pill">AI ${ui.level}단계</span>
  </header>
  <div class="players">
    <div class="player ${g.toMove === BLACK ? 'turn' : ''} dark-card">
      <span class="pstone black"></span>
      <span class="pname"><b>나 · 흑</b><small>${g.toMove === BLACK ? '내 차례' : '기다리는 중'}</small></span>
      <span class="pcount" aria-label="따낸 돌">${g.captures(BLACK)}</span>
    </div>
    <div class="player ${g.toMove === WHITE ? 'turn' : ''}">
      <span class="pstone white"></span>
      <span class="pname"><b>AI · 백</b><small>${g.toMove === WHITE ? '생각하는 중' : '기다리는 중'}</small></span>
      <span class="pcount" aria-label="따낸 돌">${g.captures(WHITE)}</span>
    </div>
  </div>
  <p class="goal">먼저 돌 ${g.rules.captureTarget}점을 따내면 이겨요 · 숫자는 따낸 돌</p>
  <div class="board-wrap">${renderBoard(g, {
    preview: ui.preview,
    previewColor: HUMAN,
    lastMove: lastMovePoint(g),
    hint: ui.hint,
  })}</div>
  ${confirmBar}
  <nav class="tools" aria-label="대국 도구">
    <button data-action="hint" ${humanTurn ? '' : 'disabled'}>${icon('bulb')}힌트</button>
    <button data-action="undo" ${canUndo ? '' : 'disabled'}>${icon('undo')}무르기</button>
    <button data-action="rules">${icon('help')}규칙</button>
    <button data-action="ask-resign" ${g.isOver ? 'disabled' : ''}>${icon('flag')}기권</button>
  </nav>
</main>`;
}

function learnHTML(): string {
  const items = LESSONS.map(
    (t, i) => `<li class="lesson locked"><span class="lnum">${i + 1}</span><span class="ltitle">${t}</span>${icon('lock')}</li>`,
  ).join('');
  return `<main class="screen">
  <header class="page-head"><h1>바둑 배우기</h1><p>기초 12강 · 다음 업데이트에서 1~6강부터 열려요</p></header>
  <ol class="lessons">${items}</ol>
</main>`;
}

function recordHTML(): string {
  const s = loadStats();
  return `<main class="screen">
  <header class="page-head"><h1>기록</h1><p>이 기기에만 저장돼요</p></header>
  <div class="stat-row">
    <div class="stat"><span>대국</span><b>${s.games}<small>판</small></b></div>
    <div class="stat"><span>승</span><b>${s.wins}</b></div>
    <div class="stat"><span>패</span><b>${s.losses}</b></div>
    <div class="stat"><span>무</span><b>${s.draws}</b></div>
  </div>
</main>`;
}

function placeholderHTML(title: string, body: string): string {
  return `<main class="screen"><header class="page-head"><h1>${title}</h1><p>${body}</p></header></main>`;
}

function tabbarHTML(): string {
  const tabs: [Screen, string, string][] = [
    ['home', '홈', 'home'],
    ['learn', '배우기', 'book'],
    ['puzzle', '문제', 'grid'],
    ['record', '기록', 'chart'],
  ];
  return `<nav class="tabbar" aria-label="주 메뉴">${tabs
    .map(
      ([id, label, ic]) =>
        `<button data-action="tab" data-tab="${id}" ${ui.screen === id ? 'aria-current="page"' : ''}>${icon(ic)}<span>${label}</span></button>`,
    )
    .join('')}</nav>`;
}

function sheetHTML(): string {
  if (!ui.sheet) return '';
  let body = '';
  if (ui.sheet === 'start') {
    const saved = loadGame();
    body = `<h2>따내기 바둑</h2>
    ${saved ? `<button class="btn dark full" data-action="resume">이어서 두기 <small>${saved.moves.length}수째</small></button><div class="or">또는 새로 시작</div>` : ''}
    <p class="sheet-label">AI 난이도</p>
    <div class="chips" role="radiogroup" aria-label="AI 난이도">
      ${([1, 2, 3] as Level[])
        .map(
          (l) =>
            `<button role="radio" aria-checked="${ui.level === l}" class="chip ${ui.level === l ? 'on' : ''}" data-action="level" data-level="${l}">${l}단계<small>${l === 1 ? '처음이라면' : l === 2 ? '조금 익숙하면' : '도전'}</small></button>`,
        )
        .join('')}
    </div>
    <button class="btn ${saved ? 'ghost' : 'dark'} full" data-action="start">새로 시작</button>
    <button class="btn text full" data-action="close-sheet">닫기</button>`;
  } else if (ui.sheet === 'rules') {
    const g = Game.fromDiagram(['. . . . .', '. . X . .', '. X O X .', '. . . . .', '. . . . .'], BLACK);
    body = `<h2>따내기 바둑 규칙</h2>
    <div class="rules-board">${renderBoard(g, { hint: 17 })}</div>
    <ol class="rules">
      <li>흑과 백이 번갈아 <b>선이 만나는 곳(교차점)</b>에 돌을 하나씩 둬요. 흑(나)이 먼저예요.</li>
      <li>돌에서 위·아래·왼쪽·오른쪽으로 이어진 빈 곳이 <b>활로</b>예요. 상대 돌의 활로를 모두 막으면 그 돌을 <b>따내요</b>.</li>
      <li>위 그림처럼 백 돌의 활로가 하나만 남은 상태가 <b>단수</b>예요. 점선 자리에 흑을 두면 백을 따내요.</li>
      <li>먼저 <b>1점</b>을 따내면 이겨요. 내 돌이 단수가 되면 바로 달아나거나 이어 주세요.</li>
    </ol>
    <button class="btn dark full" data-action="close-rules">알겠어요</button>`;
  } else if (ui.sheet === 'resign') {
    body = `<h2>기권할까요?</h2><p class="sheet-p">기권하면 이번 판은 진 것으로 기록돼요.</p>
    <div class="row2"><button class="btn ghost" data-action="close-sheet">계속 두기</button><button class="btn dark" data-action="resign">기권</button></div>`;
  } else if (ui.sheet === 'result') {
    body = `<h2 class="result-title">${esc(ui.resultText.title)}</h2><p class="sheet-p">${esc(ui.resultText.body)}</p>
    <div class="row2"><button class="btn ghost" data-action="go-home">홈으로</button><button class="btn dark" data-action="again">한 판 더</button></div>`;
  }
  const dismissable = ui.sheet === 'start' || ui.sheet === 'resign';
  return `<div class="sheet-backdrop" ${dismissable ? 'data-action="close-sheet"' : ''}></div>
  <div class="sheet" role="dialog" aria-modal="true"><div class="sheet-handle"></div>${body}</div>`;
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

// ───────── 입력 ─────────

app.addEventListener('click', (ev) => {
  const target = ev.target as Element;
  const svg = target.closest('.game .board-svg') as SVGSVGElement | null;
  if (svg && ui.game && !ui.sheet) {
    tapBoard(pointFromEvent(svg, ui.game.size, (ev as MouseEvent).clientX, (ev as MouseEvent).clientY));
    return;
  }
  const el = target.closest('[data-action]') as HTMLElement | null;
  if (!el || (el as HTMLButtonElement).disabled) return;
  switch (el.dataset.action) {
    case 'tab':
      ui.screen = el.dataset.tab as Screen;
      ui.sheet = null;
      break;
    case 'open-start':
      ui.sheet = 'start';
      break;
    case 'level':
      ui.level = Number(el.dataset.level) as Level;
      break;
    case 'resume':
      if (resumeGame()) enterGame();
      else showToast('이어둘 대국을 찾지 못했어요');
      break;
    case 'start':
    case 'again':
      newGame(ui.level);
      enterGame();
      break;
    case 'close-sheet':
      ui.sheet = null;
      break;
    case 'close-rules':
      markRulesSeen();
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
      window.clearTimeout(aiTimer);
      ui.aiThinking = false;
      ui.game?.resign();
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

function enterGame() {
  ui.screen = 'game';
  ui.sheet = hasSeenRules() ? null : 'rules';
  render();
  scheduleAI();
}

// ───────── 시작 ─────────

requestPersistence();
render();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }).catch(() => {});
  });
}
