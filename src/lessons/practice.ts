// 강의 연습 문제 — 강을 끝낸 뒤 같은 기술을 여러 판에서 반복한다.
// 문제는 그때그때 무작위로 만들고, 조건(정답이 있는지, 헷갈리는 돌이 없는지)은 모두 규칙 엔진으로 검사한다.
// 만든 문제는 강의 단계(Step)와 똑같은 모양이라 강의 화면(LessonPlayer)으로 그대로 푼다.
import { BLACK, EMPTY, WHITE, Game, toXY, type Stone } from '../engine/rules';
import type { Lesson, Step, XY } from './data';
import { atariGroupsOf, resolve } from './engine';
import { lives } from './life';

export type Skill = 'find' | 'capture' | 'escape' | 'mix' | 'live' | 'kill';
type Basic = 'find' | 'capture' | 'escape';

export interface PracticeSet {
  skill: Skill;
  /** 이 강을 끝내야 열린다 */
  after: number;
  title: string;
  term: string;
  goal: string;
}

export const PRACTICE: PracticeSet[] = [
  { skill: 'find', after: 4, title: '숨구멍 하나 찾기', term: '단수', goal: '숨구멍이 하나 남은 하양이 돌을 찾아요' },
  { skill: 'capture', after: 5, title: '한 수로 잡기', term: '따내기', goal: '하양이 돌을 한 수로 잡아요' },
  { skill: 'escape', after: 6, title: '도망가기', term: '달아나기', goal: '위험한 까망이 돌을 살려요' },
  { skill: 'mix', after: 6, title: '섞어서 풀기', term: '복습', goal: '찾기·잡기·도망가기를 섞어서 풀어요' },
  { skill: 'live', after: 9, title: '두 집 만들기', term: '삶', goal: '가장 중요한 자리에 두어 까망이를 살려요' },
  { skill: 'kill', after: 9, title: '두 집 막기', term: '죽이기', goal: '하양이보다 먼저 가장 중요한 자리를 차지해요' },
];

/** 연습 한 판의 문제 수 */
export const COUNT = 5;
/** 연습 판 크기 */
export const PSIZE = 7;

type Rand = () => number;

/** 0..n-1 무작위 정수 */
const ri = (rand: Rand, n: number) => Math.floor(rand() * n);

/**
 * 돌이 적고 서로 가까이 모인 판을 만든다(7살이 읽기 쉬운 판).
 * 숨구멍이 0인 무리가 생기면 null.
 */
function randomBoard(rand: Rand, size: number, nb: number, nw: number): Uint8Array | null {
  const n = size * size;
  const board = new Uint8Array(n);
  const placed: number[] = [];
  const order: Stone[] = [];
  for (let i = 0; i < Math.max(nb, nw); i++) {
    if (i < nb) order.push(BLACK);
    if (i < nw) order.push(WHITE);
  }
  for (const color of order) {
    let p = -1;
    for (let tries = 0; tries < 20; tries++) {
      let q: number;
      if (placed.length) {
        // 이미 놓인 돌 바로 옆(대각선 포함), 가끔 한 칸 건너
        const base = placed[ri(rand, placed.length)];
        const [x, y] = toXY(size, base);
        const d = rand() < 0.85 ? 1 : 2;
        const nx = x + ri(rand, 2 * d + 1) - d;
        const ny = y + ri(rand, 2 * d + 1) - d;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        q = ny * size + nx;
      } else q = ri(rand, n);
      if (board[q] === EMPTY) {
        p = q;
        break;
      }
    }
    if (p < 0) return null;
    board[p] = color;
    placed.push(p);
  }
  return board;
}

/** 숨구멍이 0인 돌이 있는 배치는 엔진이 거절한다 → null */
function gameOf(board: Uint8Array, size: number): Game | null {
  try {
    return new Game({ size, mode: 'capture', captureTarget: 99 }, { board, toMove: BLACK });
  } catch {
    return null;
  }
}

function setupOf(g: Game): { b: XY[]; w: XY[] } {
  const b: XY[] = [];
  const w: XY[] = [];
  for (let p = 0; p < g.geo.n; p++) {
    const c = g.at(p);
    if (c === BLACK) b.push(toXY(g.size, p) as XY);
    else if (c === WHITE) w.push(toXY(g.size, p) as XY);
  }
  return { b, w };
}

/** 문제 하나를 만들어 본다. 조건에 안 맞으면 null */
function tryMake(skill: Basic, rand: Rand, size: number): Step | null {
  const board = randomBoard(rand, size, 3 + ri(rand, 4), 3 + ri(rand, 4));
  if (!board) return null;
  const g = gameOf(board, size);
  if (!g) return null;
  const wAtari = atariGroupsOf(g, WHITE);
  const bAtari = atariGroupsOf(g, BLACK);
  let step: Step;
  if (skill === 'find') {
    // 단수인 하양이 무리 1~2개 + 숨구멍이 더 있는 하양이 무리도 하나 이상(헷갈릴 거리), 까망이는 안전
    if (wAtari.length < 1 || wAtari.length > 2 || bAtari.length) return null;
    const atariStones = new Set(wAtari.flat());
    let safe = false;
    for (let p = 0; p < g.geo.n; p++) if (g.at(p) === WHITE && !atariStones.has(p)) safe = true;
    if (!safe) return null;
    step = {
      kind: 'find',
      text: `**숨구멍이 하나 남은(단수)** 하양이 돌을 모두 찾아 눌러요.`,
      setup: setupOf(g),
      done: '다 찾았어요! 눈이 아주 좋아요!',
      wrong: '그 돌은 숨구멍이 더 있어요. 돌 옆 빈 점을 하나씩 세어 봐요.',
    };
  } else if (skill === 'capture') {
    // 잡는 자리가 1~2개, 까망이는 안전(먼저 도망갈 일 없음)
    if (wAtari.length < 1 || bAtari.length) return null;
    step = {
      kind: 'move',
      goal: 'capture',
      text: `하양이 돌을 **잡아(따내기)** 봐요! 숨구멍이 하나 남은 하양이 돌을 찾아요.`,
      setup: setupOf(g),
      done: '잡았어요! 정말 잘했어요!',
      wrong: '거기는 아니에요. 숨구멍이 하나 남은 하양이 돌의 마지막 숨구멍을 막아요.',
    };
  } else {
    // 단수인 까망이 무리가 딱 하나(1~3점), 하양이는 단수 없음(도망가기에 집중)
    if (bAtari.length !== 1 || bAtari[0].length > 3 || wAtari.length) return null;
    const stone = toXY(size, bAtari[0][0]) as XY;
    step = {
      kind: 'move',
      goal: 'escape',
      libsOf: stone,
      rings: [stone],
      text: `동그라미 친 까망이 돌이 **숨구멍 하나(단수)**예요! 잡히지 않게 **도망가요(달아나기)**.`,
      setup: setupOf(g),
      done: '살았어요! 숨구멍이 늘었어요!',
      wrong: '거기 두면 아직 위험해요. 숨구멍이 늘어나는 곳에 놓아요.',
    };
  }
  const r = resolve(step, size);
  if (step.kind === 'move') {
    // 정답 자리는 1~2개: 너무 많으면 아무 데나 눌러도 맞아서 연습이 안 됨
    if (r.targets.length < 1 || r.targets.length > 2) return null;
    if (step.goal === 'escape') {
      // 도망간 뒤 숨구멍이 3개 이상: 바로 다시 쫓기는(계단 쫓기) 문제는 빼서 '도망가면 산다'를 확실히 보여 줌
      const g2 = r.game;
      const at = bAtari[0][0];
      for (const p of r.targets) {
        g2.play(p);
        const libs = g2.group(at).liberties.length;
        g2.undo();
        if (libs < 3) return null;
      }
    }
  }
  if (step.kind === 'find' && r.groups.length < 1) return null;
  return step;
}

export function makeStep(skill: Exclude<Skill, 'mix'>, rand: Rand = Math.random, size = PSIZE): Step {
  for (let i = 0; i < 4000; i++) {
    const s = skill === 'live' || skill === 'kill' ? tryLife(skill, rand, size) : tryMake(skill, rand, size);
    if (s) return s;
  }
  throw new Error(`연습 문제를 만들지 못함: ${skill}`);
}

/** 연습 한 판(문제 COUNT개)을 강의 모양으로 만든다 */
export function makePractice(set: PracticeSet, rand: Rand = Math.random): Lesson {
  const kinds: Exclude<Skill, 'mix'>[] =
    set.skill === 'mix' ? shuffle(['find', 'capture', 'capture', 'escape', 'escape'], rand) : Array(COUNT).fill(set.skill);
  const steps = kinds.map((k) => makeStep(k, rand));
  return { id: set.after, title: set.title, term: set.term, goal: set.goal, size: PSIZE, steps, practice: set.skill };
}

function shuffle<T>(a: T[], rand: Rand): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = ri(rand, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ───────── 사활(두 집 만들기·죽이기) ─────────
// 빈 곳 모양(눈 모양)을 판 가장자리에 놓고, 그 둘레를 지키는 쪽 돌로, 다시 그 둘레를 상대 돌로 감싼다.
// 그다음 사활 풀이로 '먼저 두는 쪽에 따라 살고 죽는' 문제만 고른다(이미 살았거나 이미 죽은 모양은 버림).
// 좌표: [가로, 위로 몇 줄] — 0줄이 판 가장자리.
const EYE_SHAPES: [number, number][][] = [
  [[0, 0], [1, 0], [2, 0]], // 일자 세 칸
  [[0, 0], [1, 0], [1, 1]], // 구부러진 세 칸
  [[0, 0], [0, 1], [1, 1]],
  [[0, 0], [1, 0], [2, 0], [1, 1]], // 볼록 네 칸
  [[1, 0], [0, 1], [1, 1], [2, 1]],
  [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1]], // 뭉친 다섯 칸
  [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]], // 십자 다섯 칸
  [[0, 0], [1, 0], [2, 0], [3, 0]], // 일자 네 칸(이미 산 모양 — 걸러짐)
  [[0, 0], [1, 0], [0, 1], [1, 1]], // 네모 네 칸(이미 죽은 모양 — 걸러짐)
];

function tryLife(skill: 'live' | 'kill', rand: Rand, size: number): Step | null {
  const shape = EYE_SHAPES[ri(rand, EYE_SHAPES.length)];
  const w = Math.max(...shape.map(([x]) => x)) + 1;
  const ox = ri(rand, size - w + 1); // 0이면 귀(모서리)
  // 아래 가장자리에 놓고 나중에 돌리거나 뒤집는다
  const cells = shape.map(([x, up]) => [ox + x, size - 1 - up] as XY);
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < size && y < size;
  const key = (x: number, y: number) => y * size + x;
  const region = new Set(cells.map(([x, y]) => key(x, y)));
  const ring = (from: Set<number>, skip: Set<number>) => {
    const out = new Set<number>();
    for (const p of from) {
      const [x, y] = [p % size, Math.floor(p / size)];
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!inside(x + dx, y + dy)) continue;
          const q = key(x + dx, y + dy);
          if (!from.has(q) && !skip.has(q)) out.add(q);
        }
    }
    return out;
  };
  const wall = ring(region, new Set());
  const outer = ring(wall, region);
  // 귀가 아닌 곳에서 둘레가 판 밖으로 나가면 모양이 깨짐 → 너무 위로 솟은 모양은 판 안에 맞는지만 확인
  const [mine, theirs] = skill === 'live' ? [BLACK, WHITE] : [WHITE, BLACK];
  const board = new Uint8Array(size * size);
  for (const p of wall) board[p] = mine;
  for (const p of outer) board[p] = theirs;
  // 돌리거나 뒤집기(8가지)
  const t = ri(rand, 8);
  const tf = (x: number, y: number): [number, number] => {
    let [a, b] = t & 4 ? [y, x] : [x, y];
    if (t & 1) a = size - 1 - a;
    if (t & 2) b = size - 1 - b;
    return [a, b];
  };
  const tb = new Uint8Array(size * size);
  for (let p = 0; p < size * size; p++) {
    if (!board[p]) continue;
    const [x, y] = tf(p % size, Math.floor(p / size));
    tb[key(x, y)] = board[p];
  }
  const R = [...region].map((p) => {
    const [x, y] = tf(p % size, Math.floor(p / size));
    return key(x, y);
  });
  const g = gameOf(tb, size);
  if (!g) return null;
  // 지키는 무리는 하나로 이어져 있고, 숨구멍은 빈 곳 안에만 / 감싸는 돌은 숨구멍이 넉넉(잡힐 걱정 없음)
  const wallPts = [...wall].map((p) => {
    const [x, y] = tf(p % size, Math.floor(p / size));
    return key(x, y);
  });
  const grp = g.group(wallPts[0]);
  if (grp.stones.length !== wallPts.length) return null;
  if (grp.liberties.some((q) => !R.includes(q))) return null;
  for (let p = 0; p < g.geo.n; p++) if (g.at(p) === theirs && g.group(p).liberties.length < 2) return null;
  // 문제 조건: 상대가 먼저 두면 결과가 반대가 되어야 '급소 문제'
  const other = new Game({ size, mode: 'capture', captureTarget: 99 }, { board: tb, toMove: WHITE });
  const aliveIfWhiteFirst = lives(other, wallPts[0], R);
  if (skill === 'live' ? aliveIfWhiteFirst : !aliveIfWhiteFirst) return null;
  const target = toXY(size, wallPts[0]) as XY;
  const step: Step =
    skill === 'live'
      ? {
          kind: 'move',
          goal: 'live',
          libsOf: target,
          region: R.map((p) => toXY(size, p) as XY),
          text: '까망이가 둘러싸였어요! **가장 중요한 자리(급소)**에 먼저 두어 **두 집(삶)**을 만들어요.',
          setup: setupOf(g),
          done: '두 집이 생겼어요! 이제 까망이는 절대 안 잡혀요.',
          wrong: '거기 두면 하양이가 급소를 차지해서 한 집만 남아요. 빈 곳을 둘로 나누는 자리를 찾아봐요.',
        }
      : {
          kind: 'move',
          goal: 'kill',
          libsOf: target,
          region: R.map((p) => toXY(size, p) as XY),
          text: '하양이 집 안의 **가장 중요한 자리(급소)**에 먼저 두어서, 하양이가 **두 집(삶)**을 못 만들게 해요!',
          setup: setupOf(g),
          done: '급소를 차지했어요! 이제 하양이는 두 집을 못 만들어요.',
          wrong: '거기 두면 하양이가 급소에 두어 두 집을 만들어요. 빈 곳 한가운데쯤을 찾아봐요.',
        };
  const r = resolve(step, size);
  if (r.targets.length < 1 || r.targets.length > 2) return null;
  return step;
}
