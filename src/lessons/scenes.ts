// 지난 판에서 놓친 장면 → 내 문제. 실전에서 배운 것을 다시 풀어 보게 하는 '되돌아가는 길'.
// 잡기·도망 놓침만 문제로 만든다(정답이 엔진으로 분명한 것). 스스로 단수·눈 메우기는 '하지 말 것'이라 문제로 내지 않는다.
// 13줄처럼 큰 판은 9×9로 잘라 보여 주는데, 잘린 가장자리 때문에 숨구멍 수가 바뀔 수 있다.
// 그래서 잘라 낸 문제의 정답 자리를 엔진으로 다시 구해 원래 판의 정답 자리와 똑같을 때만 쓴다(다르면 판 전체, 그래도 다르면 버림).
import { BLACK, EMPTY, WHITE, type Game } from '../engine/rules';
import { replay, type Mistake, type ReplaySpec } from '../engine/ai/review';
import type { SavedScene } from '../storage';
import type { Lesson, Step, XY } from './data';
import { meetsGoal, resolve } from './engine';
import { makeStep, PSIZE } from './practice';

/** 큰 판에서 잘라 낼 크기 */
export const SCENE_WINDOW = 9;
/** 결과 화면에서 바로 풀어 볼 장면 수(한 판에서) */
export const SCENES_PER_GAME = 2;

type Kind = SavedScene['kind'];

/** 판 g에서 goal을 이루는 모든 자리(규칙 엔진으로 하나씩 시험) */
function answers(g: Game, kind: Kind, libsOf: number | null): number[] {
  const out: number[] = [];
  for (let p = 0; p < g.geo.n; p++) if (g.at(p) === EMPTY && meetsGoal(g, p, kind, libsOf)) out.push(p);
  return out;
}

/** 놓친 장면 하나를 문제로. 문제로 만들 수 없거나 잘라서 정답이 달라지면 null */
export function sceneFromMistake(spec: ReplaySpec, m: Mistake, gameId: number): SavedScene | null {
  const kind: Kind | null = m.kind === 'missed-capture' ? 'capture' : m.kind === 'missed-escape' ? 'escape' : null;
  if (!kind) return null;
  const g = replay(spec, m.index);
  if (g.moves.length !== m.index || g.toMove !== BLACK || g.isOver) return null;
  const size = g.size;

  // 장면의 중심 돌: 잡을 하양이 무리 / 살릴 까망이 무리
  const key: number[] = [];
  let lo: number | null = null;
  if (kind === 'capture') {
    for (const p of m.better)
      for (const q of g.geo.neighbors[p]) if (g.at(q) === WHITE && g.group(q).liberties.length === 1) key.push(...g.group(q).stones);
  } else {
    for (let p = 0; p < g.geo.n && lo == null; p++) {
      if (g.at(p) !== BLACK || g.group(p).liberties.length !== 1) continue;
      if (m.better.some((b) => meetsGoal(g, b, 'escape', p))) {
        lo = p;
        key.push(...g.group(p).stones);
      }
    }
    if (lo == null) return null;
  }
  const full = answers(g, kind, lo);
  if (!full.length) return null;

  // 잘라 볼 창: 중심 돌과 정답 자리가 모두 들어가는 9×9, 가운데에 가까운 것부터. 마지막은 판 전체
  const pts = [...key, ...full];
  const xs = pts.map((p) => p % size);
  const ys = pts.map((p) => Math.floor(p / size));
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const wins: [number, number, number][] = [];
  const W = SCENE_WINDOW;
  if (size > W && maxX - minX < W && maxY - minY < W) {
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    for (let y0 = Math.max(0, maxY - W + 1); y0 <= Math.min(minY, size - W); y0++)
      for (let x0 = Math.max(0, maxX - W + 1); x0 <= Math.min(minX, size - W); x0++) wins.push([x0, y0, W]);
    const off = ([x0, y0]: [number, number, number]) => Math.abs(x0 + (W - 1) / 2 - cx) + Math.abs(y0 + (W - 1) / 2 - cy);
    wins.sort((a, b) => off(a) - off(b));
    wins.length = Math.min(wins.length, 12);
  }
  wins.push([0, 0, size]);

  for (const [x0, y0, w] of wins) {
    const inWin = (p: number) => {
      const x = p % size;
      const y = Math.floor(p / size);
      return x >= x0 && y >= y0 && x < x0 + w && y < y0 + w;
    };
    const local = (p: number): [number, number] => [(p % size) - x0, Math.floor(p / size) - y0];
    const b: [number, number][] = [];
    const wh: [number, number][] = [];
    for (let p = 0; p < g.geo.n; p++) {
      if (!inWin(p)) continue;
      if (g.at(p) === BLACK) b.push(local(p));
      else if (g.at(p) === WHITE) wh.push(local(p));
    }
    const scene: SavedScene = {
      v: 1,
      id: `${gameId}-${m.index}`,
      gameId,
      kind,
      size: w,
      b,
      w: wh,
      ...(lo != null ? { libsOf: local(lo) } : {}),
    };
    let targets: number[];
    try {
      targets = resolve(sceneStep(scene), w).targets; // 잘린 판에서 숨구멍이 없는 돌이 생기면 엔진이 거절
    } catch {
      continue;
    }
    const want = full.map((p) => {
      const [x, y] = local(p);
      return y * w + x;
    });
    if (targets.length === want.length && want.every((p) => targets.includes(p))) return scene;
  }
  return null;
}

/** 저장해 둔 장면 → 강의 화면으로 풀 문제 */
export function sceneStep(s: SavedScene): Step {
  const base = { size: s.size, sceneId: s.id, setup: { b: s.b as XY[], w: s.w as XY[] } };
  if (s.kind === 'capture') {
    return {
      ...base,
      kind: 'move',
      goal: 'capture',
      text: '지난 판에서 놓친 장면이에요! 숨구멍이 하나 남은 하양이 돌을 찾아 **잡아(따내기)** 봐요.',
      done: '잡았어요! 이번에는 놓치지 않았어요!',
      wrong: '거기는 아니에요. 숨구멍이 하나 남은 하양이 돌의 마지막 숨구멍을 막아요.',
    };
  }
  return {
    ...base,
    kind: 'move',
    goal: 'escape',
    libsOf: s.libsOf,
    rings: s.libsOf ? [s.libsOf] : [],
    text: '지난 판에서 놓친 장면이에요! 동그라미 친 까망이 돌이 **숨구멍 하나(단수)**예요. 잡히지 않게 **도망가요(달아나기)**.',
    done: '살았어요! 이번에는 잘 도망갔어요!',
    wrong: '거기 두면 아직 위험해요. 숨구멍이 늘어나는 곳에 놓아요.',
  };
}

/**
 * 장면들로 연습 한 판을 만든다. fill만큼 같은 기술의 새 문제를 뒤에 붙인다
 * (방금 놓친 장면을 맞힌 다음 비슷한 문제로 한 번 더 익히게).
 */
export function makeSceneLesson(scenes: SavedScene[], fill = 0, rand: () => number = Math.random): Lesson {
  const steps: Step[] = scenes.map(sceneStep);
  for (let i = 0; i < fill && scenes.length; i++) steps.push({ ...makeStep(scenes[i % scenes.length].kind, rand), size: PSIZE });
  return {
    id: 0,
    title: '놓친 장면',
    term: '복습',
    goal: '지난 판에서 놓친 장면을 다시 풀어요',
    size: PSIZE,
    steps,
    practice: 'scene',
  };
}
