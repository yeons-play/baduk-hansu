import '@fontsource/jua/korean-400.css';
import '@fontsource/jua/latin-400.css';
import '@fontsource/gowun-dodum/korean-400.css';
import '@fontsource/gowun-dodum/latin-400.css';
import './style.css';
import { BLACK, EMPTY, WHITE, Game, opponent, type GameMode, type IllegalReason, type Stone } from './engine/rules';
import { chooseMove, type Level } from './engine/ai/beginner';
import {
  alertText,
  hintText,
  NO_ALERTS,
  planHint,
  selfAtari,
  SELF_ATARI_SUB,
  SELF_ATARI_TEXT,
  SELF_ATARI_TITLE,
  turnAlerts,
  type Alerts,
  type HintPlan,
  type HintStep,
} from './coach';
import { estimateDead, countDead } from './engine/ai/dead';
import { hopeless } from './engine/ai/resign';
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
  addHistory,
  loadHistory,
  resetLessons,
  exportBackup,
  importBackup,
  loadScenes,
  addScenes,
  removeScene,
  addGameLog,
  loadGameLog,
  loadPracticeLog,
  type GameSetup,
  type SavedScene,
} from './storage';
import { ensureGameLog, logPractice, summarize } from './records';
import { summaryHTML } from './summary';
import { LEVELS } from './levels';
import { analyzeGame } from './engine/ai/review';
import { makeSceneLesson, sceneFromMistake, SCENES_PER_GAME } from './lessons/scenes';
import { keyCardFor, type KeyCard } from './lessons/keys';
import { applyNames, cleanName, DEFAULT_NAMES, keepName, loadNames, NAME_MAX, suggestCall, type Names } from './names';
import { icon } from './ui/icons';
import { sfx, unlockAudio } from './audio';
import { speak, stopSpeaking } from './speech';
import { ALL_TITLES, LESSONS, type Lesson } from './lessons/data';
import { LessonPlayer, rich } from './lessons/player';
import { PRACTICE, COUNT, makePractice, type PracticeSet } from './lessons/practice';
import { currentMistake, historyItemHTML, mistakeText, openReview, reviewAction, reviewHTML, reviewSeek, type ReviewState } from './review';

// ───────── 상태 ─────────
// 아이폰·아이패드에서는 history API를 쓰지 않는다(홈 화면 앱 뒤로가기 꼬임 방지).
// 화면 이동은 아래 탭과 '← 뒤로' 버튼만.

type Screen = 'home' | 'game' | 'learn' | 'puzzle' | 'record' | 'lesson' | 'review';
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
  | 'score'
  | 'key'
  | 'names'
  | 'resign-offer'
  | 'summary';

const ui = {
  /** 이름 바꾸기 화면에서 고치는 중인 이름(저장 전) */
  nameDraft: null as Names | null,
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
  /** 집 세기 화면에서 들어낼 죽은 돌(앱이 짐작, 눌러서 고침) */
  dead: [] as number[],
  /** 하양이가 '많이 지고 있다'고 본 연속 횟수(두 번 연속이면 기권) */
  hopelessStreak: 0,
  /** 이번 판에서 하양이의 기권을 '끝까지 둘래요'로 거절했는지(한 판에 한 번만 묻는다) */
  resignDeclined: false,
  /** 방금 끝난 판의 기록 번호(결과 화면에서 바로 복습) */
  lastFinishedId: 0,
  /** 복습 중인 판과 보고 있는 수(0 = 빈 판) */
  review: null as ReviewState | null,
  /** 지금 판의 출발 배치(출발 판 놀이). null = 빈 판에서 시작 */
  setup: null as GameSetup | null,
  /** 방금 끝난 판에서 문제로 만든 놓친 장면 */
  lastScenes: [] as SavedScene[],
  /** 방금 끝난 판에서 잘한 것(결과 화면 칭찬) */
  praise: '',
  /** 연습에서 두 번 틀렸을 때 보여 줄 핵심 그림 */
  keyCard: null as KeyCard | null,
  /** 이 판에서 도와줘·되돌리기를 쓴 횟수(보호자 요약용, 이어 두어도 이어서 셈) */
  hints: 0,
  undos: 0,
  /** 이 판에서 도와줘로 정확한 자리(3단계)까지 본 횟수 */
  hintsFull: 0,
  /** 도와줘 단계(0 = 아직 안 누름)와 이번 차례의 도와줘 계획(1~3단계가 같은 수를 가리키게) */
  hintStep: 0 as HintStep,
  hintPlan: null as HintPlan | null,
  /** 미리 보기한 자리가 스스로 단수 자리인지(두는 중 알려 주기가 켜져 있을 때만) */
  warn: false,
  /** 방금 잡혀 들어낸 돌(잠깐 흐리게 보여 줌) */
  ghosts: [] as { p: number; c: Stone }[],
  /** 잡힌 시각(다시 그려도 사라지는 움직임이 처음부터 다시 시작하지 않게) */
  ghostAt: 0,
  /** 알림을 읽어 준 판(같은 판에서 두 번 읽지 않게) */
  alertSpoken: '',
  /** 설정의 '보호자용'을 펼쳐 두었는지(켜고 끄기를 누르면 화면을 다시 그려도 닫히지 않게) */
  parentOpen: false,
  /** 기록 요약에서 고른 기간(일, 0 = 전체) */
  summaryDays: 7,
};

const HUMAN = BLACK;
const AI_DELAY = 550;
/** 잡힌 돌이 작아지며 사라지는 시간(CSS ghost-out과 같게) */
const GHOST_MS = 550;
/** 따내기 바둑이 잡기로 끝나면 돌이 사라지는 것을 본 뒤 결과 창 */
const END_DELAY_MS = 900;
let aiTimer: number | undefined;
let toastTimer: number | undefined;
let ghostTimer: number | undefined;
let resultTimer: number | undefined;

const app = document.getElementById('app')!;

// 7살 기준 문구: 짧게, 쉬운 말 먼저, 바둑 용어는 괄호로
const ILLEGAL_TEXT: Record<IllegalReason, string> = {
  occupied: '벌써 돌이 있어요!',
  suicide: '거기는 숨구멍이 없어서 놓을 수 없어요 (자살수)',
  superko: '지금은 거기에 둘 수 없어요. 다른 곳에 먼저 놓아요 (패)',
  'off-board': '선이 만나는 곳을 눌러요',
  'game-over': '놀이가 끝났어요',
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

// ───────── 대국 진행 ─────────

function newGame(level: Level, target: Target) {
  ui.game =
    ui.mode === 'normal'
      ? new Game({ size: ui.normalSize, mode: 'normal' })
      : new Game({ size: ui.size, mode: 'capture', captureTarget: target });
  ui.setup = null;
  ui.level = level;
  ui.target = target;
  ui.hopelessStreak = 0;
  ui.resignDeclined = false;
  ui.hints = 0;
  ui.undos = 0;
  ui.hintsFull = 0;
  clearGhosts();
  window.clearTimeout(resultTimer);
  resetMarks();
  persist();
}

function resumeGame(): boolean {
  const saved = loadGame();
  if (!saved || saved.v !== 1 || !Array.isArray(saved.moves)) return false;
  let g: Game;
  try {
    g = new Game(
      { size: saved.size, mode: saved.mode, captureTarget: saved.captureTarget },
      saved.setup ? { board: saved.setup.board, toMove: saved.setup.toMove } : undefined,
    );
  } catch {
    clearGame(); // 망가진 저장값(판 크기 등)
    return false;
  }
  for (const m of saved.moves) {
    const r = typeof m !== 'number' ? null : m < 0 ? g.pass() : g.play(m);
    if (!r?.ok) {
      clearGame();
      return false;
    }
  }
  // 둘 다 넘겨 집 세기 화면에 있던 판은 그대로 이어 간다(앱을 닫아도 판이 사라지지 않게)
  if (g.isOver && g.result?.reason !== 'score') {
    clearGame();
    return false;
  }
  ui.game = g;
  ui.setup = saved.setup ?? null;
  ui.hopelessStreak = 0;
  ui.resignDeclined = false;
  ui.hints = typeof saved.hints === 'number' ? saved.hints : 0;
  ui.undos = typeof saved.undos === 'number' ? saved.undos : 0;
  ui.hintsFull = typeof saved.hintsFull === 'number' ? saved.hintsFull : 0;
  clearGhosts();
  window.clearTimeout(resultTimer);
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
  // 끝난 판은 지운다. 단, 둘 다 넘겨 집을 세는 중이면 '끝낼래요'를 누를 때까지 남겨 둔다.
  const scoring = g.result?.reason === 'score';
  if (g.isOver && !scoring) {
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
    ...(ui.setup ? { setup: ui.setup } : {}),
    ...(scoring ? { dead: ui.dead } : {}),
    hints: ui.hints,
    undos: ui.undos,
    hintsFull: ui.hintsFull,
    savedAt: new Date().toISOString(),
  });
}

function resetMarks() {
  ui.preview = null;
  ui.hint = null;
  ui.hintText = null;
  ui.hintStep = 0;
  ui.hintPlan = null;
  ui.warn = false;
}

/** 지금 판의 수순(착수 좌표, 넘기기 -1) — 기록·복습·알림이 같은 모양으로 쓴다 */
function movesOf(g: Game): number[] {
  return g.moves.filter((m) => m.type !== 'resign').map((m) => (m.type === 'play' ? m.point : -1));
}

/** 처음부터 다시 둘 수 있는 기록(출발 배치 포함) */
function specOf(g: Game) {
  return { mode: g.rules.mode, size: g.size, captureTarget: g.rules.captureTarget, moves: movesOf(g), ...(ui.setup ? { setup: ui.setup } : {}) };
}

const coachOn = () => loadSettings().coach;

let alertCache: { key: string; a: Alerts } | null = null;
/** 까망이 차례의 위험·기회 알림(같은 판이면 다시 계산하지 않음) */
function currentAlerts(g: Game): Alerts {
  if (!coachOn() || g.isOver || g.toMove !== HUMAN || ui.aiThinking) return NO_ALERTS;
  const spec = specOf(g);
  const key = `${g.size}:${g.rules.mode}:${spec.moves.join(',')}`;
  if (alertCache?.key !== key) alertCache = { key, a: turnAlerts(g, spec, HUMAN) };
  return alertCache.a;
}

/** 까망이 차례가 되면 알림을 한 번 읽어 준다(어디인지는 말하지 않음) */
function announceAlerts() {
  const g = ui.game;
  if (!g) return;
  const text = alertText(currentAlerts(g));
  const key = alertCache?.key ?? '';
  if (!text || ui.alertSpoken === key) return;
  ui.alertSpoken = key;
  speak(text);
}

/** 방금 잡힌 돌을 잠깐 흐리게 보여 준다 */
function showGhosts(captured: number[], mover: Stone) {
  if (!captured.length) return;
  ui.ghosts = captured.map((p) => ({ p, c: opponent(mover) }));
  ui.ghostAt = Date.now();
  window.clearTimeout(ghostTimer);
  ghostTimer = window.setTimeout(() => {
    ui.ghosts = [];
    if (ui.screen === 'game') render();
  }, GHOST_MS);
}

function clearGhosts() {
  ui.ghosts = [];
  window.clearTimeout(ghostTimer);
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
  showGhosts(r.captured, HUMAN);
  resetMarks();
  persist();
  // 따내기 바둑을 잡기로 이기면 잡힌 돌을 잠깐 보여 준 뒤 결과 창
  if (g.isOver) return finishGame(r.captured.length ? END_DELAY_MS : 0);
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
    // 진짜 바둑에서 크게 지고 있으면(두 번 연속 그렇게 보이면) 하양이가 기권을 청한다.
    // 갑자기 끝나면 아이가 당황하므로 받을지·끝까지 둘지 묻는다(한 판에 한 번만)
    if (game.rules.mode === 'normal' && !ui.resignDeclined) {
      ui.hopelessStreak = hopeless(game, game.toMove) ? ui.hopelessStreak + 1 : 0;
      if (ui.hopelessStreak >= 2) {
        ui.hopelessStreak = 0;
        ui.aiThinking = false;
        ui.sheet = 'resign-offer';
        render();
        speak('하양이가 제가 졌어요 하고 인사했어요. 받아 줄까요, 더 둘까요?');
        return;
      }
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
    const captured = r.ok ? r.captured : [];
    sfx(captured.length ? 'capture' : 'stone');
    showGhosts(captured, opponent(HUMAN));
    ui.aiThinking = false;
    persist();
    // 하양이가 잡아서 이기면 어느 돌이 잡혔는지 잠깐 보여 준 뒤 결과 창
    if (game.isOver) return finishGame(captured.length ? END_DELAY_MS : 0);
    announceAlerts();
    render();
  }, AI_DELAY);
}

/** 게임이 끝났을 때: 진짜 바둑에서 둘 다 넘겼으면 먼저 집을 세어 보여주고(더 두기 가능), 아니면 바로 결과 */
function endOrScore(savedDead?: number[]) {
  const g = ui.game!;
  if (g.result?.reason === 'score') {
    ui.sheet = 'score';
    resetMarks();
    // 저장해 둔 죽은 돌이 있으면(앱을 닫았다 연 경우) 그대로, 없으면 앱이 짐작
    ui.dead = savedDead
      ? savedDead.filter((p) => Number.isInteger(p) && p >= 0 && p < g.geo.n && g.at(p) !== EMPTY)
      : estimateDead(g);
    const r = g.settle(ui.dead);
    persist();
    const s = r && r.reason === 'score' ? r.score : g.result.score;
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

/** 집 세기 화면에서 돌을 누르면 그 무리를 죽은 돌 ↔ 산 돌로 바꾼다 */
function toggleDead(p: number | null) {
  const g = ui.game;
  if (!g || p == null || g.at(p) === EMPTY) return;
  const grp = g.group(p).stones;
  const isDead = ui.dead.includes(p);
  ui.dead = isDead ? ui.dead.filter((q) => !grp.includes(q)) : [...ui.dead, ...grp];
  g.settle(ui.dead);
  persist();
  sfx('stone');
  render();
}

/** 집 세기 화면에서 '더 둘래요': 넘기기를 되돌려 다시 까망이 차례로 */
function resumeAfterScore() {
  const g = ui.game;
  if (!g) return;
  do {
    g.undo();
  } while (g.moves.length && g.toMove !== HUMAN);
  ui.sheet = null;
  ui.dead = [];
  resetMarks();
  persist();
  render();
  scheduleAI();
}

/** 기록 목록에 보일 결과 한 줄 */
function historySummary(g: Game): string {
  const res = g.result!;
  if (res.reason === 'score') return `까망이 ${res.score.blackTotal}점 · 하양이 ${res.score.whiteTotal}점`;
  if (res.reason === 'resign') return res.winner === HUMAN ? '하양이 기권' : '까망이 그만하기';
  if (res.reason === 'capture') return `${g.rules.captureTarget}개 먼저 잡기`;
  return '둘 다 넘김(비김)';
}

/** 끝난 판을 기록하고 결과 창을 띄운다. delay를 주면 결과 창만 그만큼 늦게(잡힌 돌을 먼저 보여 주려고) */
function finishGame(delay = 0) {
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
  } else if (res.reason === 'resign' && outcome === 'win') {
    ui.result = {
      title: '와, 이겼어요!',
      body: '하양이가 "졌어요" 하고 돌을 던졌어요(기권). 바둑에서는 많이 지고 있으면 이렇게 인사하고 끝내요.',
      mood: 'wow',
      win: true,
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
    ui.result = { title: '비겼어요', body: '둘 다 더 놓을 곳이 없어서 끝났어요.', mood: 'happy', win: false };
  }
  // 복습용으로 끝난 판을 남긴다. 처음부터 다시 두어 보며 잘한 수는 칭찬하고, 놓친 장면은 문제로 만든다
  const id = Date.now();
  const spec = specOf(g);
  const moves = spec.moves;
  const an = analyzeGame(spec, HUMAN);
  const good = { capture: 0, escape: 0 };
  for (const x of an.good) good[x.kind]++;
  const missed: Record<string, number> = {};
  for (const m of an.mistakes) missed[m.kind] = (missed[m.kind] ?? 0) + 1;
  // 놓친 장면은 마지막 것부터 두 개까지(방금 둔 장면이 기억에 남아 있으니까)
  const scenes: SavedScene[] = [];
  for (const m of [...an.mistakes].reverse()) {
    if (scenes.length >= SCENES_PER_GAME) break;
    const s = sceneFromMistake(spec, m, id);
    if (s) scenes.unshift(s);
  }
  addScenes(scenes);
  ui.lastScenes = scenes;
  ui.praise = praiseText(good);
  // 보호자 요약용 한 줄 기록: 처음이면 남아 있는 다시 보기 기록으로 먼저 채운 뒤 이 판을 더한다
  ensureGameLog();
  const endedAt = new Date(id).toISOString();
  addHistory({
    v: 1,
    id,
    ...(ui.setup ? { setup: ui.setup } : {}),
    mode: g.rules.mode,
    size: g.size,
    level: ui.level,
    captureTarget: g.rules.captureTarget,
    moves,
    good,
    missed,
    hints: ui.hints,
    undos: ui.undos,
    hintsFull: ui.hintsFull,
    outcome,
    reason: res.reason,
    summary: historySummary(g),
    endedAt,
  });
  addGameLog({
    v: 1,
    id,
    endedAt,
    mode: g.rules.mode,
    size: g.size,
    level: ui.level,
    captureTarget: g.rules.captureTarget,
    outcome,
    reason: res.reason,
    moves: moves.length,
    hints: ui.hints,
    undos: ui.undos,
    hintsFull: ui.hintsFull,
    coach: coachOn(),
    good,
    missed,
    ...(res.reason === 'score' ? { margin: res.score.margin } : {}),
    ...(ui.setup ? { setup: true } : {}),
  });
  ui.lastFinishedId = id;
  resetMarks();
  const show = () => {
    ui.sheet = 'result';
    if (ui.result.win) window.setTimeout(() => sfx('win'), 250);
    speak(`${ui.result.title} ${ui.result.body} ${ui.praise}`);
    render();
  };
  window.clearTimeout(resultTimer);
  if (delay <= 0) return show();
  // 기록은 이미 남겼다. 그사이 '나가기'로 홈에 갔으면 결과 창은 띄우지 않는다
  ui.sheet = null;
  render();
  resultTimer = window.setTimeout(() => {
    if (ui.screen === 'game' && ui.game === g) show();
  }, delay);
}

/** 잘한 수 칭찬 한 줄(없으면 빈 글) */
function praiseText(good: { capture: number; escape: number }): string {
  const parts: string[] = [];
  if (good.capture) parts.push(`잡기(따내기) ${good.capture}번`);
  if (good.escape) parts.push(`도망가기(달아나기) ${good.escape}번`);
  return parts.length ? `배운 대로 ${parts.join(', ')} 했어요!` : '';
}

function undoTurn() {
  const g = ui.game;
  if (!g || ui.aiThinking || g.isOver) return; // 끝난 판(잡힌 돌을 보여 주는 중)은 되돌리지 않음 — 이미 기록됨
  if (!g.moves.some((m) => m.color === HUMAN)) return showToast('아직 되돌릴 수가 없어요');
  // 하양이 수까지 함께 되돌려 다시 까망이 차례로
  do {
    g.undo();
  } while (g.moves.length && g.toMove !== HUMAN);
  if (g.toMove !== HUMAN) g.undo();
  ui.hopelessStreak = 0;
  ui.undos++;
  clearGhosts();
  resetMarks();
  persist();
  render();
}

/**
 * 도와줘 3단계: 누를 때마다 한 단계씩 — ① 무엇을 찾을지(말) ② 어느 돌·어디쯤(동그라미·네모) ③ 정확한 자리.
 * 한 차례에 한 번 만든 계획을 끝까지 쓴다. 센 횟수: 이 차례에 처음 누르면 hints, 3단계까지 가면 hintsFull
 */
function showHint() {
  const g = ui.game;
  if (!g || ui.aiThinking || g.toMove !== HUMAN || g.isOver) return;
  if (!ui.hintPlan) {
    const plan = planHint(g);
    if (!plan) {
      return showToast(g.rules.mode === 'normal' ? '이제 놓을 곳이 거의 없어요. 차례 넘기기를 눌러도 돼요' : '놓을 곳이 없어요');
    }
    ui.hintPlan = plan;
  }
  const before = ui.hintStep;
  if (before === 0) ui.hints++;
  if (before === 2) ui.hintsFull++;
  ui.hintStep = Math.min(3, before + 1) as HintStep;
  ui.hint = ui.hintStep === 3 ? ui.hintPlan.point : null;
  ui.hintText = hintText(ui.hintPlan, ui.hintStep);
  ui.preview = null;
  ui.warn = false;
  persist();
  speak(ui.hintText);
  render();
}

function tapBoard(p: number | null) {
  const g = ui.game;
  if (!g || p == null || g.isOver) return;
  if (ui.aiThinking || g.toMove !== HUMAN) return showToast('하양이 차례예요. 조금만 기다려요');
  if (ui.preview === p) {
    // 같은 곳을 한 번 더 누르면 놓기. 스스로 단수 자리는 버릇처럼 두 번 눌러 놓지 않게 '놓기' 버튼으로만
    if (ui.warn) return speak(SELF_ATARI_TEXT);
    return confirmMove();
  }
  const r = g.check(p);
  if (!r.ok) {
    ui.preview = null;
    ui.warn = false;
    showToast(ILLEGAL_TEXT[r.reason]);
    render();
    return;
  }
  ui.preview = p;
  ui.warn = coachOn() && selfAtari(g, p);
  if (ui.warn) speak(SELF_ATARI_TEXT);
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
  const nobar = ui.screen === 'game' || ui.screen === 'lesson' || ui.screen === 'review';
  document.body.classList.toggle('nobar', nobar);
  // 글 속 '까망이·하양이'는 여기서 한 번에 보호자가 정한 이름으로 바꾼다(src/names.ts)
  app.innerHTML = applyNames(
    screenHTML() +
      (nobar ? '' : tabbarHTML()) +
      sheetHTML() +
      (ui.toast ? `<div class="toast" role="status">${esc(ui.toast)}</div>` : ''),
  );
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
    case 'review':
      return ui.review ? reviewHTML(ui.review) : recordHTML();
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
  // 따내기 바둑에는 보통 넘기기가 없지만, 놓을 곳이 하나도 없으면 넘길 수 있게 한다(갇혀서 그만하기밖에 없는 일 방지)
  const canPass = humanTurn && (g.rules.mode === 'normal' || g.legalMoves().length === 0);
  const stuck = canPass && g.rules.mode === 'capture';
  const canUndo = g.moves.some((m) => m.color === HUMAN) && !ui.aiThinking && !g.isOver;
  // 두는 중에 알려 주기: 위험(내 돌이 새로 단수)·기회(하양이 돌을 새로 잡을 수 있음). 어느 돌인지는 안 알려 줌
  const alerts = humanTurn ? currentAlerts(g) : NO_ALERTS;
  const alertMsg = alertText(alerts);
  const res = g.result;
  const endText =
    res?.reason === 'capture' ? (res.winner === HUMAN ? '와, 잡았어요!' : '앗, 잡혔어요!') : '다 두었어요';
  const status =
    ui.preview != null
      ? ui.warn
        ? `<div class="confirm warn">
      <div class="confirm-text"><b>${SELF_ATARI_TITLE}</b><span>${SELF_ATARI_SUB}</span></div>
      <button class="btn ghost" data-action="cancel-preview">아니요</button>
      <button class="btn primary" data-action="confirm">놓기</button>
    </div>`
        : `<div class="confirm">
      <div class="confirm-text"><b>여기에 놓을까요?</b><span>한 번 더 눌러도 돼요</span></div>
      <button class="btn ghost" data-action="cancel-preview">아니요</button>
      <button class="btn primary" data-action="confirm">놓기</button>
    </div>`
      : `<div class="guide ${ui.hintText ? 'has-hint' : alertMsg && !stuck ? 'alert' : ''}">${
          ui.hintText
            ? `${icon('bulb')}<span>${rich(ui.hintText)}</span>`
            : g.isOver
              ? `<span>${endText}</span>`
              : stuck
              ? '<span>놓을 곳이 없어요. 넘기기를 눌러요</span>'
              : alertMsg
              ? `${icon('help')}<span>${esc(alertMsg)}</span>`
              : humanTurn
              ? '<span>놓고 싶은 곳을 눌러요</span>'
              : '<span class="thinking">하양이가 생각하고 있어요…</span>'
        }</div>`;
  const plan = ui.hintPlan;
  const step2 = ui.hintStep === 2 && plan;
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
        rings: step2 ? plan.stones : [],
        zone: step2 ? plan.zone : null,
        ghosts: ui.ghosts,
        ghostAge: Date.now() - ui.ghostAt,
      })}</div>
    </div>
    <div class="side">
      <div class="players">
        <div class="player me ${g.toMove === BLACK ? 'turn' : ''} ${alerts.danger ? 'alert' : ''}">
          ${stoneFace('black', 56, alerts.danger ? 'oops' : g.toMove === BLACK ? 'happy' : 'think')}
          <span class="pname"><b>나 · 까망이</b><small>${alerts.danger ? '앗, 위험해요!' : g.toMove === BLACK ? '내 차례!' : '기다려요'}</small></span>
          <span class="pcount" aria-label="잡은 돌">${g.captures(BLACK)}</span>
        </div>
        <div class="player ${g.toMove === WHITE ? 'turn' : ''} ${alerts.chance ? 'alert' : ''}">
          ${stoneFace('white', 56, alerts.chance ? 'oops' : g.toMove === WHITE ? 'think' : 'happy')}
          <span class="pname"><b>하양이</b><small>${alerts.chance ? '덜덜 떨고 있어요' : g.toMove === WHITE ? '생각 중' : '기다려요'}</small></span>
          <span class="pcount" aria-label="잡은 돌">${g.captures(WHITE)}</span>
        </div>
      </div>
      ${
        g.rules.mode === 'normal'
          ? `<p class="goal">집을 더 많이 지으면 이겨요 · 하양이는 <b>덤 ${g.rules.komi}점</b> · 숫자는 잡은 돌</p>`
          : `<p class="goal">먼저 돌 <b>${g.rules.captureTarget}개</b>를 잡으면 이겨요 · 숫자는 잡은 돌</p>`
      }
      ${status}
      <nav class="tools ${g.rules.mode === 'normal' || stuck ? 'five' : ''}" aria-label="놀이 도구">
        <button data-action="hint" ${humanTurn ? '' : 'disabled'}><span class="tool-ic yellow">${icon('bulb')}</span>${
          ui.hintStep === 1 || ui.hintStep === 2 ? '더 도와줘' : '도와줘'
        }</button>
        <button data-action="undo" ${canUndo ? '' : 'disabled'}><span class="tool-ic sky">${icon('undo')}</span>되돌리기</button>
        ${
          g.rules.mode === 'normal' || stuck
            ? `<button data-action="ask-pass" ${canPass ? '' : 'disabled'}><span class="tool-ic mint">${icon('skip')}</span>넘기기</button>`
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
  const history = loadHistory();
  return `<main class="screen">
  <header class="page-head"><h1>내 기록</h1><p>이 기기에만 저장돼요</p></header>
  ${statsHTML(true)}
  <h2 class="section-title">지난 판 다시 보기(복습)</h2>
  ${
    history.length
      ? `<p class="section-sub">최근 ${history.length}판 · 눌러서 한 수씩 다시 봐요</p><ol class="lessons">${history.map(historyItemHTML).join('')}</ol>`
      : '<p class="section-sub">아직 끝난 판이 없어요. 하양이와 한 판 두면 여기서 다시 볼 수 있어요.</p>'
  }
</main>`;
}

function openReviewById(id: number) {
  const g = loadHistory().find((h) => h.id === id);
  if (!g) return showToast('그 판 기록이 없어요');
  ui.lesson?.stop();
  stopSpeaking();
  ui.sheet = null;
  ui.review = openReview(g);
  ui.screen = 'review';
  render();
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
  const scenes = loadScenes();
  const sceneItem = scenes.length
    ? `<li><button class="lesson" data-action="scenes-open"><span class="lnum">${icon('undo')}</span><span class="ltitle">내가 놓친 장면<span class="term">복습</span><small class="lgoal">지난 판에서 놓친 장면 ${scenes.length}개를 다시 풀어요</small></span><span class="badge go">풀기</span></button></li>`
    : '';
  return `<main class="screen">
  <header class="page-head"><h1>문제 놀이</h1><p>강에서 배운 걸 여러 번 풀어 봐요. 한 번에 ${COUNT}문제, 할 때마다 새 문제가 나와요.</p></header>
  <ol class="lessons">${sceneItem}${items}</ol>
</main>`;
}

function openPractice(i: number) {
  const set = PRACTICE[i];
  if (!set || !practiceOpen(set)) return;
  startLesson(makePractice(set));
}

/** 강의·연습 화면 열기. 연습에서 같은 문제를 두 번 틀리면 그 강의 핵심 그림 한 장을 보여 준다 */
function startLesson(l: Lesson) {
  ui.lesson?.stop();
  ui.sheet = null;
  ui.screen = 'lesson';
  ui.lesson = new LessonPlayer(
    l,
    render,
    (step) => {
      const card = keyCardFor(step);
      if (!card) return;
      ui.keyCard = card;
      ui.sheet = 'key';
      speak(card.text);
    },
    // 연습 문제를 하나 풀 때마다 한 번에 맞혔는지 남긴다(보호자 요약)
    (step, firstTry) => logPractice(step, firstTry),
  );
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
    ${saved ? `<button class="btn primary full big" data-action="resume">하던 ${savedName} 이어서 하기</button><div class="or">또는 새로 시작해요 (하던 ${savedName} 판은 지워져요)</div>` : ''}
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
      <li>둘 다 넘기면 앱이 <b>죽은 돌</b>(살 수 없는 돌)을 흐리게 보여 주고 빼고 세요. 틀렸으면 그 돌을 눌러 고쳐요.</li>
      <li>돌 + 집이 더 많으면 이겨요. 하양이는 <b>덤 7점</b>을 더 받아요.</li>
    </ol>
    <button class="btn primary full big" data-action="close-rules">알았어요!</button>`;
  } else if (ui.sheet === 'pass') {
    body = `<h2>차례를 넘길까요?</h2><p class="sheet-p">${
      ui.game?.rules.mode === 'capture'
        ? '놓을 곳이 없으면 넘겨요. 하양이도 넘기면 비겨요.'
        : '더 놓을 곳이 없을 때 넘겨요. 하양이도 넘기면 바둑이 끝나고 집을 세어요.'
    }</p>
    <div class="row2"><button class="btn ghost" data-action="close-sheet">더 둘래요</button><button class="btn primary" data-action="pass">넘길래요</button></div>`;
  } else if (ui.sheet === 'score' && ui.game?.result?.reason === 'score') {
    const g = ui.game;
    const s = ui.game.result.score;
    const verdict = s.margin > 0 ? '까망이가 이겼어요!' : s.margin < 0 ? '하양이가 이겼어요' : '똑같아요! 비겼어요';
    const dc = countDead(g, ui.dead);
    body = `<h2>집을 세어 봐요</h2>
    <div class="rules-board score-board">${renderBoard(g, { owner: s.owner, dead: ui.dead })}</div>
    <p class="sheet-p small center">${
      ui.dead.length
        ? `흐린 돌은 <b>죽은 돌(사석)</b>이라 빼고 세요 · 까망이 ${dc.black}개, 하양이 ${dc.white}개`
        : '죽은 돌(사석)이 없어요'
    }<br>틀렸으면 바둑판의 돌을 눌러 바꿔요.</p>
    <table class="score-table">
      <thead><tr><th></th><th>돌</th><th>집</th><th>덤</th><th>합계</th></tr></thead>
      <tbody>
        <tr><th>까망이</th><td>${s.blackStones}</td><td>${s.blackArea}</td><td>-</td><td><b>${s.blackTotal}</b></td></tr>
        <tr><th>하양이</th><td>${s.whiteStones}</td><td>${s.whiteArea}</td><td>${s.komi}</td><td><b>${s.whiteTotal}</b></td></tr>
      </tbody>
    </table>
    <p class="sheet-p center"><b>${verdict}</b></p>
    <p class="sheet-p small center">아직 싸우는 중인 돌이 있으면 '더 둘래요'를 눌러 마저 둬요.</p>
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
    <button class="toggle" data-action="names-open"><span>${icon('pencil')}이름 바꾸기</span><span class="name-now">까망이 · 하양이</span></button>
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
    <details class="parent" ${ui.parentOpen ? 'open' : ''}>
      <summary>보호자용</summary>
      <div class="parent-in">
        <button class="toggle" data-action="toggle-coach" role="switch" aria-checked="${st.coach}"><span>${icon('bulb')}두는 중에 알려 주기</span><span class="sw ${st.coach ? 'on' : ''}"></span></button>
        <p class="sheet-p small">위험한 돌·잡을 수 있는 돌이 새로 생기면 얼굴과 말로 알려 주고(어디인지는 안 알려 줌), 스스로 숨구멍 하나(단수)가 되는 자리는 한 번 더 물어요.</p>
        <button class="btn ghost full" data-action="summary-open">${icon('chart')}기록 요약 보기</button>
        <button class="btn ghost full" data-action="backup-export">기록 백업하기</button>
        <button class="btn ghost full" data-action="backup-import">기록 불러오기</button>
        <input type="file" id="backup-file" accept="application/json,.json" hidden />
        <button class="btn ghost full" data-action="ask-reset-lessons">강의 처음부터 다시</button>
        <p class="sheet-p small">백업 파일에는 강의 진도·전적·설정·하던 판이 들어 있어요. 다른 기기나 Safari에서 불러올 수 있어요.</p>
      </div>
    </details>
    <button class="btn primary full big" data-action="close-sheet">닫기</button>`;
  } else if (ui.sheet === 'resign-offer') {
    body = `<div class="result-face">${stoneFace('white', 110, 'oops')}</div>
    <h2 class="result-title">하양이가 인사했어요</h2>
    <p class="sheet-p center">${rich('하양이가 “제가 졌어요” 하고 고개를 숙였어요(기권). 바둑에서는 많이 지고 있으면 이렇게 인사하고 끝내요.')}</p>
    <p class="sheet-p center small">받으면 까망이가 이겨요. 더 두고 싶으면 끝까지 두고 집을 세어도 돼요.</p>
    <div class="row2"><button class="btn ghost" data-action="resign-decline">더 둘래요</button><button class="btn primary" data-action="resign-accept">받을래요!</button></div>`;
  } else if (ui.sheet === 'names') {
    body = namesSheetHTML();
  } else if (ui.sheet === 'summary') {
    const lp = loadLessons();
    const s = summarize(loadGameLog(), loadPracticeLog(), lp.at, new Date(), ui.summaryDays || null);
    body = summaryHTML(s, ui.summaryDays, lp.done.length, LESSONS.length);
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
    // 놓친 장면 연습은 실전에서 왔으니 다시 실전으로 이어 준다
    const more =
      l.practice === 'scene'
        ? `<button class="btn primary" data-action="open-start" data-mode="${ui.mode}">하양이랑 한 판 더</button>`
        : `<button class="btn primary" data-action="practice-open" data-i="${i}">새 문제 더!</button>`;
    body = `<div class="result-face">${starBurst()}${stoneFace('black', 120, 'wow')}</div>
    <h2 class="result-title">${l.steps.length}문제 다 풀었어요!</h2>
    <p class="sheet-p center">${rich(`**${l.title}(${l.term})** 연습 끝. 정말 잘했어요!`)}</p>
    <div class="row2"><button class="btn ghost" data-action="tab" data-tab="puzzle">목록으로</button>${more}</div>`;
  } else if (ui.sheet === 'key' && ui.keyCard) {
    const c = ui.keyCard;
    const kg = Game.fromDiagram(c.rows, BLACK);
    const kl = LESSONS[c.lesson - 1];
    body = `<h2>잠깐! ${c.lesson}강 다시 보기</h2>
    <div class="rules-board">${renderBoard(kg, { rings: [c.ring[1] * kg.size + c.ring[0]] })}</div>
    <p class="sheet-p">${rich(c.text)}</p>
    <button class="btn primary full big" data-action="close-sheet">알았어요! 다시 풀래요</button>
    ${kl ? `<button class="btn text full" data-action="lesson-open" data-id="${kl.id}">${kl.id}강 ${kl.title} 처음부터 보기</button>` : ''}`;
  } else if (ui.sheet === 'result') {
    const r = ui.result;
    body = `<div class="result-face">${r.win ? starBurst() : ''}${stoneFace('black', 120, r.mood)}</div>
    <h2 class="result-title">${esc(r.title)}</h2><p class="sheet-p center">${esc(r.body)}</p>
    ${ui.praise ? `<div class="feedback ok praise">${icon('check')}<span>${rich(ui.praise)}</span></div>` : ''}
    ${ui.lastScenes.length ? `<button class="btn ghost full" data-action="scene-retry">${icon('grid')}놓친 장면 다시 풀어 볼까요?</button>` : ''}
    <div class="row2"><button class="btn ghost" data-action="go-home">홈으로</button><button class="btn primary" data-action="again">한 판 더!</button></div>
    ${ui.lastFinishedId ? `<button class="btn text full" data-action="review-open" data-id="${ui.lastFinishedId}">${icon('undo')}둔 수 다시 보기(복습)</button>` : ''}`;
  }
  const dismissable =
    ui.sheet === 'start' ||
    ui.sheet === 'resign' ||
    ui.sheet === 'settings' ||
    ui.sheet === 'names' ||
    ui.sheet === 'summary' ||
    ui.sheet === 'reset-lessons' ||
    ui.sheet === 'pass' ||
    ui.sheet === 'key';
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

/** 이름 바꾸기: 까만 돌(나)·하얀 돌(상대). 안의 이름은 keepName으로 감싸 화면 그리기 때 바뀌지 않게 */
function namesSheetHTML(): string {
  const d = ui.nameDraft ?? loadNames();
  const row = (who: 'black' | 'white', label: string) => `<label class="name-row">${stoneFace(who, 56, 'happy')}
      <span class="name-field"><span class="sheet-label">${label}</span>
      <input class="name-input" data-who="${who}" type="text" maxlength="${NAME_MAX + 1}" autocomplete="off" enterkeyhint="done"
        value="${keepName(esc(d[who]))}" placeholder="${keepName(DEFAULT_NAMES[who])}" /></span></label>
    <div class="name-hint" data-for="${who}">${keepName(nameHintHTML(who, d[who]))}</div>`;
  return `<h2>이름 바꾸기</h2>
    <p class="sheet-p small">아이 이름으로 바꾸면 강의·대국·읽어 주기에 모두 그 이름이 나와요. 까만 돌이 나예요.</p>
    ${row('black', '까만 돌(나)')}
    ${row('white', '하얀 돌(상대)')}
    <p class="name-preview" id="name-preview">${keepName(esc(namePreview(d)))}</p>
    <div class="row2"><button class="btn ghost" data-action="names-reset">원래대로</button><button class="btn primary" data-action="names-save">저장</button></div>`;
}

/** '민준'처럼 받침으로 끝나면 '민준이로 부를까요?' 버튼 */
function nameHintHTML(who: 'black' | 'white', name: string): string {
  const call = suggestCall(cleanName(name));
  return call
    ? `<button class="chip on" data-action="name-call" data-who="${who}" data-name="${esc(call)}">‘${esc(call)}’로 부를까요?</button>`
    : '';
}

function namePreview(d: Names): string {
  const n = { black: cleanName(d.black) || DEFAULT_NAMES.black, white: cleanName(d.white) || DEFAULT_NAMES.white };
  return applyNames('까망이가 하양이를 잡았어요! 하양이는 덤을 받아요.', n);
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
  const ssvg = target.closest('.score-board .board-svg') as SVGSVGElement | null;
  if (ssvg && ui.sheet === 'score' && ui.game) {
    toggleDead(pointFromEvent(ssvg, ui.game.size, (ev as MouseEvent).clientX, (ev as MouseEvent).clientY));
    return;
  }
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
      startLesson(l);
      break;
    }
    case 'scene-retry':
      // 방금 판에서 놓친 장면 + 같은 기술의 새 문제 두 개
      if (ui.lastScenes.length) startLesson(makeSceneLesson(ui.lastScenes, 2));
      break;
    case 'scenes-open': {
      const list = loadScenes().slice(0, COUNT);
      if (list.length) startLesson(makeSceneLesson(list));
      break;
    }
    case 'lesson-next': {
      const lp = ui.lesson;
      // 놓친 장면을 한 번에 맞히면 '내가 놓친 장면' 목록에서 뺀다(틀렸으면 다음에 또 나옴)
      if (lp?.step.sceneId && lp.firstTry) removeScene(lp.step.sceneId);
      if (!lp?.next()) break;
      if (lp.lesson.practice) {
        markPracticeDone(lp.lesson.practice);
        ui.sheet = 'practice-done';
        speak(`${lp.lesson.steps.length}문제 다 풀었어요! 정말 잘했어요!`);
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
    case 'review-open':
      return openReviewById(Number(el.dataset.id));
    case 'rv-first':
    case 'rv-prev':
    case 'rv-next':
    case 'rv-last':
    case 'rv-mistake': {
      const r = ui.review;
      if (!r || !reviewAction(r, el.dataset.action, Number(el.dataset.dir ?? 1))) return;
      const m = currentMistake(r);
      if (m) speak(mistakeText(m).replace(/\*\*/g, ''));
      else if (el.dataset.action !== 'rv-mistake') sfx('stone');
      break;
    }
    case 'settings':
      ui.nameDraft = null;
      ui.parentOpen = false; // 설정을 새로 열면 '보호자용'은 접힌 채로
      ui.sheet = 'settings';
      break;
    case 'names-open':
      ui.nameDraft = loadNames();
      ui.sheet = 'names';
      break;
    case 'name-call': {
      const who = el.dataset.who === 'white' ? 'white' : 'black';
      ui.nameDraft = { ...(ui.nameDraft ?? loadNames()), [who]: cleanName(el.dataset.name ?? '') };
      break;
    }
    case 'names-reset':
      ui.nameDraft = { ...DEFAULT_NAMES };
      break;
    case 'names-save': {
      const d = ui.nameDraft ?? loadNames();
      const black = cleanName(d.black) || DEFAULT_NAMES.black;
      const white = cleanName(d.white) || DEFAULT_NAMES.white;
      if (black === white) {
        showToast('두 이름을 다르게 지어 주세요');
        return;
      }
      const st = loadSettings();
      if (black === DEFAULT_NAMES.black && white === DEFAULT_NAMES.white) delete st.names;
      else st.names = { black, white };
      saveSettings(st);
      ui.nameDraft = null;
      ui.sheet = 'settings';
      speak('까망이랑 하양이, 바둑 한 판 두자!');
      break;
    }
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
    case 'toggle-coach': {
      const st = loadSettings();
      st.coach = !st.coach;
      saveSettings(st);
      alertCache = null;
      break;
    }
    case 'summary-open':
      ensureGameLog(); // 처음 열면 남아 있는 최근 판들로 채운다
      ui.summaryDays = 7;
      ui.sheet = 'summary';
      break;
    case 'summary-days': {
      const d = Number(el.dataset.days);
      ui.summaryDays = d === 7 || d === 30 || d === 0 ? d : 7;
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
      if (g.rules.mode === 'capture' && g.legalMoves().length) break; // 따내기 바둑은 놓을 곳이 없을 때만
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
    case 'resume': {
      const saved = loadGame();
      if (!resumeGame()) {
        showToast('이어서 할 판을 찾지 못했어요');
        break;
      }
      enterGame();
      // 집 세기 화면에서 앱을 닫았던 판: 고른 죽은 돌 그대로 집 세기 화면을 다시 연다
      if (ui.game?.isOver) return endOrScore(Array.isArray(saved?.dead) ? saved.dead : undefined);
      break;
    }
    case 'start':
    case 'again':
      newGame(ui.level, ui.target);
      enterGame();
      break;
    case 'close-sheet':
      ui.sheet = null;
      ui.nameDraft = null;
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
      ui.warn = false;
      break;
    case 'hint':
      return showHint();
    case 'undo':
      return undoTurn();
    case 'ask-resign':
      ui.sheet = 'resign';
      break;
    case 'resign-accept': {
      const g = ui.game;
      ui.sheet = null;
      if (!g || g.isOver || g.toMove === HUMAN) break;
      g.resign(); // 하양이 차례에 기권 → 하양이가 진다
      return finishGame();
    }
    case 'resign-decline':
      ui.sheet = null;
      ui.resignDeclined = true;
      render();
      scheduleAI();
      return;
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

app.addEventListener('input', (ev) => {
  const input = ev.target as HTMLInputElement;
  // 이름 바꾸기: 다시 그리면 키보드가 닫히므로 미리보기·'~이로 부를까요?'만 바꾼다
  if (input.classList.contains('name-input') && ui.sheet === 'names') {
    const who = input.dataset.who === 'white' ? 'white' : 'black';
    ui.nameDraft = { ...(ui.nameDraft ?? loadNames()), [who]: input.value };
    const pv = app.querySelector('#name-preview');
    if (pv) pv.textContent = namePreview(ui.nameDraft);
    const hint = app.querySelector(`.name-hint[data-for="${who}"]`);
    if (hint) hint.innerHTML = nameHintHTML(who, input.value);
    return;
  }
  if (!input.classList.contains('rv-seek') || !ui.review) return;
  reviewSeek(ui.review, Number(input.value));
  // 끄는 중에는 슬라이더는 그대로 두고 바둑판·수 세기·설명만 바꾼다(전체를 다시 그리면 손가락이 끊김)
  const tmp = document.createElement('div');
  tmp.innerHTML = applyNames(reviewHTML(ui.review));
  for (const sel of ['.board-wrap', '.rv-bar', '.rv-dyn']) {
    const now = app.querySelector(sel);
    const next = tmp.querySelector(sel);
    if (now && next) now.replaceWith(next);
  }
});

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
  ui.alertSpoken = '';
  if (!ui.sheet) announceAlerts(); // 이어 두는 판이 까망이 차례이고 알릴 것이 있으면
  render();
  scheduleAI();
}

// 설정의 '보호자용'이 펼쳐져 있는지 기억한다(안의 켜고 끄기를 눌러 화면을 다시 그려도 닫히지 않게).
// toggle 이벤트는 위로 퍼지지 않아서 잡는 단계(capture)에서 듣는다
app.addEventListener(
  'toggle',
  (ev) => {
    const d = ev.target as HTMLDetailsElement;
    if (d.classList?.contains('parent')) ui.parentOpen = d.open;
  },
  true,
);

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
