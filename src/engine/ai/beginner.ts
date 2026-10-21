// 초급 AI (휴리스틱) — 따내기 바둑과 집 짓는 바둑(정규 대국) 연습용.
// 정규 대국에서는 판 전체의 집 모양(면적 계가 소유)을 보고 빈 곳을 넓히고, 자기 집·눈은 메우지 않으며,
// 둘 만한 곳이 없으면 패스한다. 사석은 계가 때 들어내지만(짐작이 틀릴 수 있어) 자기 집 안의 약한 상대 돌은 끝까지 쫓아 잡는 편이다.
// 합법 판단은 규칙 엔진(play/undo)에만 맡긴다.
// 난이도: 1 = 초보다운 실수가 잦음, 2 = 가끔 실수, 3 = 한 수 앞의 위험까지 고려(힌트에도 사용)

import { BLACK, EMPTY, WHITE, type Stone, Game, opponent, toXY } from '../rules';

export type Level = 1 | 2 | 3;

export type MoveReason =
  | 'win'
  | 'capture'
  | 'escape'
  | 'atari'
  | 'connect'
  | 'joseki'
  | 'corner'
  | 'approach'
  | 'enclose'
  | 'answer'
  | 'side'
  | 'territory'
  | 'shape'
  | 'pass';

export interface AIChoice {
  point: number | null;
  reason: MoveReason;
}

export interface AIOptions {
  level: Level;
  rand?: () => number;
}

// 초보다운 실수만 한다: 아무 데나 두는 무작위 대신, 사람 초보가 실제로 하는 실수를 흉내 낸다.
// (1) 비슷하게 좋은 수 여럿 중에서 고르기 — 점수 차가 MARGIN 안인 수만 후보라서 집 메우기·1선 같은 이상한 수는 나오지 않는다.
// (2) 단수에 걸린 자기 돌을 못 보고 지나치기(OVERSIGHT). (3) 잡을 수 있는 돌을 못 보기(BLIND).
// 아이가 하양이의 실수를 '혼내 줄 수 있게' 해서 강의에서 배운 것(단수·잡기·도망가기)을 실전에서 쓰게 한다.
/** 가장 좋은 수와 이만큼 차이 나는 수까지 후보로 본다 */
const MARGIN: Record<Level, number> = { 1: 8, 2: 4, 3: 0 };
/** 단수에 걸린 자기 돌을 못 보고 지나칠 확률 */
const OVERSIGHT: Record<Level, number> = { 1: 0.5, 2: 0.15, 3: 0 };
/** 잡을 수 있는 상대 돌을 못 볼 확률 */
const BLIND: Record<Level, number> = { 1: 0.5, 2: 0.15, 3: 0 };
/** 정규 대국: 가장 좋은 수의 점수가 이보다 낮으면 패스 */
const PASS_BELOW = 4;

export function chooseMove(game: Game, opts: AIOptions): AIChoice {
  const rand = opts.rand ?? Math.random;
  const level = opts.level;
  const me = game.toMove;
  const legal = game.legalMoves();
  if (legal.length === 0) return { point: null, reason: 'pass' };

  const myAtari = atariGroups(game, me);
  const oversight = rand() < OVERSIGHT[level];
  const blind = rand() < BLIND[level];
  const owner = game.rules.mode === 'normal' ? settledOwner(game) : null;
  const infl = owner ? influence(game) : null;
  const book = owner ? josekiMoves(game, me) : null;

  const all = legal.map((p) => ({ point: p, ...evaluate(game, p, me, myAtari, level, oversight, owner, infl, book) }));
  const bestRaw = Math.max(...all.map((c) => c.score));
  if (owner && bestRaw < PASS_BELOW) return { point: null, reason: 'pass' };

  // 못 본 잡기는 후보에서 빠진다(다른 수가 하나도 없으면 그대로 둠)
  let pool = blind ? all.filter((c) => c.reason !== 'capture' && c.reason !== 'win') : all;
  if (pool.length === 0) pool = all;
  const top = Math.max(...pool.map((c) => c.score));
  const cands = pool.filter((c) => c.score >= top - MARGIN[level]);
  const pick = cands[Math.floor(rand() * cands.length)] ?? cands[0];
  return { point: pick.point, reason: pick.reason };
}

function evaluate(
  game: Game,
  p: number,
  me: Stone,
  myAtari: number[],
  level: Level,
  oversight: boolean,
  owner: Uint8Array | null,
  infl: Int16Array | null,
  book: Set<number> | null = null,
): { score: number; reason: MoveReason } {
  const opp = opponent(me);
  const size = game.size;
  let score = 0;
  let reason: MoveReason = 'shape';
  // 정규 대국: 두기 전의 집 모양
  const ownedBy = owner ? owner[p] : -1;
  const ownEye = owner ? game.geo.neighbors[p].every((q) => game.at(q) === me) : false;
  // 정규 대국: 이 수로 내 세력권이 얼마나 넓어지는지(뭉쳐 두면 거의 늘지 않음)
  const gain = infl ? territoryGain(game, infl, p, me) : 0;
  const opening = owner ? openingPlan(game, p, me) : null;
  const square = owner ? makesSquare(game, p, me) : false;

  // 모양 점수: 1·2선은 초반에 피하고, 다른 돌 근처를 선호
  const [x, y] = toXY(size, p);
  const line = Math.min(x, y, size - 1 - x, size - 1 - y);
  if (line === 0) score -= 10;
  else if (line === 1) score -= 3;
  if (nearStone(game, x, y, 2)) score += 6;

  const r = game.play(p);
  if (!r.ok) return { score: -Infinity, reason };
  try {
    const cap = r.captured.length;
    const myLibs = game.group(p).liberties.length;

    if (game.isOver && game.result && 'winner' in game.result && game.result.winner === me) {
      return { score: 10000, reason: 'win' };
    }
    if (cap > 0) {
      score += 120 + 15 * cap;
      reason = 'capture';
    }

    // 단수에 걸린 내 돌 살리기
    if (!oversight) {
      for (const rep of myAtari) {
        if (game.at(rep) === me && game.group(rep).liberties.length >= 2) {
          score += 100 + 10 * game.group(rep).stones.length;
          if (reason !== 'capture') reason = 'escape';
        }
      }
    }

    // 상대를 단수로 몰기
    const seen = new Set<number>();
    for (const nb of game.geo.neighbors[p]) {
      if (game.at(nb) !== opp) continue;
      const g = game.group(nb);
      if (seen.has(g.stones[0])) continue;
      g.stones.forEach((s) => seen.add(s));
      if (g.liberties.length === 1) {
        score += myLibs >= 2 ? 35 : 5;
        if (reason === 'shape') reason = 'atari';
      }
    }

    // 스스로 단수 되는 수 피하기
    if (cap === 0 && myLibs === 1) score -= 90;
    else if (myLibs === 2) score -= 8;

    // 이어서 활로가 늘어나면 가산
    let friendly = 0;
    for (const nb of game.geo.neighbors[p]) if (game.at(nb) === me) friendly++;
    if (friendly > 0 && myLibs >= 3 && !owner) {
      score += 6;
      if (reason === 'shape') reason = 'connect';
    }

    // 정규 대국: 집 모양
    if (owner) {
      const saving = reason === 'capture' || reason === 'escape';
      if (ownEye && !saving) score -= 200; // 내 눈 메우기 금지
      if (ownedBy === me && !saving) score -= 25; // 이미 내 집
      else if (ownedBy === opp && cap === 0) score -= 18; // 상대 집 안에 뛰어들기는 자제
      else if (ownedBy === EMPTY) {
        score += 4 * gain; // 아직 누구 집도 아닌 곳을 넓히는 만큼
        if (gain > 0 && reason === 'shape') reason = 'territory';
      }
      // 기본 정석: 귀에서 정해진 좋은 순서를 이어 둔다(싸움보다는 낮고, 포석보다는 높게)
      if (!saving && cap === 0 && book?.has(p)) {
        score += 110;
        if (reason === 'shape' || reason === 'territory' || reason === 'connect' || reason === 'atari') reason = 'joseki';
      }
      // 초반 운영(포석): 귀 → 걸침·굳힘·받기 → 변 → 가운데
      if (!saving && cap === 0 && ownedBy === EMPTY && opening) {
        if (opening.score) {
          score += opening.score;
          if (reason === 'shape' || reason === 'territory' || reason === 'connect') reason = opening.reason;
        }
      }
      // 내 돌끼리 뭉치기(덩어리·네모 모양)는 집을 넓히지 못하니 피한다
      if (!saving && cap === 0) {
        if (friendly >= 2) score -= 8 * (friendly - 1);
        if (square) score -= 12;
      }
      // 내 울타리 안에 들어온 상대 돌(사석)은 끝까지 쫓아 잡는다 — 계가 때 들어내긴 하지만 죽은 돌 짐작이 틀릴 여지를 줄이려고
      if (myLibs >= 2) {
        const chased = new Set<number>();
        for (const nb of game.geo.neighbors[p]) {
          if (game.at(nb) !== opp) continue;
          const g = game.group(nb);
          if (chased.has(g.stones[0])) continue;
          g.stones.forEach((s) => chased.add(s));
          if (isInvader(game, g.stones, me)) {
            score += 30;
            if (reason === 'shape' || reason === 'territory') reason = 'atari';
          } else if (g.liberties.length <= 2 && g.stones.length <= 4) score += 12;
        }
      }
    }

    // 3단계: 이 수 때문에 새로 단수가 되는 내 돌이 있는지.
    // 두기 전부터 단수였던 돌(살릴 수 없으면 어느 수를 둬도 그대로)은 세지 않는다 — 세면 모든 수가 똑같이 깎여
    // '둘 곳이 없다'고 착각해 계속 넘기게 된다. 그런 돌을 살리는 수는 위의 살리기 점수가 맡는다.
    if (level === 3 && !game.isOver) {
      const before = new Set<number>();
      for (const rep of myAtari) game.group(rep).stones.forEach((q) => before.add(q));
      for (const rep of atariGroups(game, me)) {
        const grp = game.group(rep).stones;
        if (grp.some((q) => before.has(q)) && !grp.includes(p)) continue;
        score -= 40 + 8 * grp.length;
      }
    }
  } finally {
    game.undo();
  }
  return { score, reason };
}

/**
 * 정규 대국용 '굳은 집' 추정: 한쪽 돌로만 둘러싸인 빈 곳이 작거나, 둘러싼 돌이 충분히 많으면 그 색의 집으로 본다.
 * 돌 몇 개만 있는 넓은 곳은 아직 누구 집도 아님(0) — 그래야 초반 빈 판을 '이미 상대 집'으로 착각하지 않는다.
 */
function closed(size: number, border: number, limit: number): boolean {
  return size <= limit || border * 4 >= size;
}

export function settledOwner(game: Game): Uint8Array {
  const n = game.geo.n;
  const limit = Math.max(6, Math.floor(n / 3));
  const owner = new Uint8Array(n);
  const seen = new Uint8Array(n);
  for (let p = 0; p < n; p++) {
    if (seen[p] || game.at(p) !== EMPTY) continue;
    const region: number[] = [];
    const border = new Set<number>();
    const stack = [p];
    seen[p] = 1;
    let touch = 0;
    while (stack.length) {
      const q = stack.pop()!;
      region.push(q);
      for (const r of game.geo.neighbors[q]) {
        const c = game.at(r);
        if (c === EMPTY) {
          if (!seen[r]) {
            seen[r] = 1;
            stack.push(r);
          }
        } else {
          touch |= c;
          border.add(r);
        }
      }
    }
    if ((touch === BLACK || touch === WHITE) && closed(region.length, border.size, limit)) {
      for (const q of region) owner[q] = touch;
    }
  }
  return owner;
}

/** 상대 돌 무리가 내 돌로만 둘러싸인 작은 빈 곳 안에 갇혀 있는지(= 끝까지 잡아야 할 침입자) */
function isInvader(game: Game, stones: number[], me: Stone): boolean {
  const n = game.geo.n;
  const limit = Math.max(8, Math.floor(n / 4));
  const seen = new Uint8Array(n);
  const stack = [...stones];
  stones.forEach((s) => (seen[s] = 1));
  let size = 0;
  const border = new Set<number>();
  const opp = opponent(me);
  while (stack.length) {
    const q = stack.pop()!;
    size++;
    for (const r of game.geo.neighbors[q]) {
      if (seen[r]) continue;
      const c = game.at(r);
      if (c === me) {
        border.add(r);
        continue;
      }
      if (c === opp && !stones.includes(r)) return false; // 다른 상대 돌과 이어진 넓은 곳
      seen[r] = 1;
      stack.push(r);
    }
  }
  // 넓은 곳에 둘러싸인 큰 무리는 스스로 살 수 있으니 침입자로 보지 않는다(작은 곳만)
  return size <= limit && border.size > 0;
}

/**
 * 세력 지도: 돌마다 거리 3까지 (4 - 거리)만큼 영향을 준다(흑 +, 백 -).
 * 값이 ±INFL_T 이상이면 그쪽 세력권으로 본다. 집 계산이 아니라 '어디가 넓은 곳인지' 고르는 데만 쓴다.
 */
const INFL_R = 3;
const INFL_T = 3;

function influence(game: Game): Int16Array {
  const n = game.geo.n;
  const size = game.size;
  const infl = new Int16Array(n);
  for (let p = 0; p < n; p++) {
    const c = game.at(p);
    if (c === EMPTY) continue;
    const sgn = c === BLACK ? 1 : -1;
    const [x, y] = toXY(size, p);
    forNear(size, x, y, (q, d) => (infl[q] += sgn * (INFL_R + 1 - d)));
  }
  return infl;
}

function forNear(size: number, x: number, y: number, f: (q: number, d: number) => void): void {
  for (let dy = -INFL_R; dy <= INFL_R; dy++) {
    for (let dx = -INFL_R; dx <= INFL_R; dx++) {
      const d = Math.abs(dx) + Math.abs(dy);
      if (d > INFL_R) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      f(ny * size + nx, d);
    }
  }
}

/** p에 me가 두면 내 세력권(빈 점) 수에서 상대 세력권 수를 뺀 값이 얼마나 느는지 */
function territoryGain(game: Game, infl: Int16Array, p: number, me: Stone): number {
  const sgn = me === BLACK ? 1 : -1;
  const cls = (v: number) => (v >= INFL_T ? 1 : v <= -INFL_T ? -1 : 0);
  const [x, y] = toXY(game.size, p);
  let gain = 0;
  forNear(game.size, x, y, (q, d) => {
    if (q !== p && game.at(q) !== EMPTY) return;
    const before = infl[q] * sgn;
    gain += cls(before + (INFL_R + 1 - d)) - cls(before);
  });
  return gain;
}

/** p에 두면 내 돌 네 개가 네모(2×2)로 뭉치는지 */
function makesSquare(game: Game, p: number, me: Stone): boolean {
  const size = game.size;
  const [x, y] = toXY(size, p);
  for (const [ax, ay] of [
    [-1, -1],
    [0, -1],
    [-1, 0],
    [0, 0],
  ]) {
    let all = true;
    for (const [bx, by] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ]) {
      const cx = x + ax + bx;
      const cy = y + ay + by;
      if (cx < 0 || cy < 0 || cx >= size || cy >= size) {
        all = false;
        break;
      }
      const q = cy * size + cx;
      if (q !== p && game.at(q) !== me) {
        all = false;
        break;
      }
    }
    if (all) return true;
  }
  return false;
}

/** 해당 색의 단수(활로 1) 그룹 대표점 목록 */
export function atariGroups(game: Game, color: Stone): number[] {
  const seen = new Uint8Array(game.geo.n);
  const out: number[] = [];
  for (let p = 0; p < game.geo.n; p++) {
    if (seen[p] || game.at(p) !== color) continue;
    const g = game.group(p);
    for (const s of g.stones) seen[s] = 1;
    if (g.liberties.length === 1) out.push(p);
  }
  return out;
}

function nearStone(game: Game, x: number, y: number, d: number): boolean {
  const size = game.size;
  for (let dy = -d; dy <= d; dy++) {
    for (let dx = -d; dx <= d; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      if (game.atXY(nx, ny) !== EMPTY) return true;
    }
  }
  return false;
}
// 힌트 문구는 화면 쪽(src/main.ts의 HINT_TEXT)에서 7살 말투로 관리한다.

// ───────── 초반 운영(포석) ─────────
// 바둑의 기본 요령 "귀 → 변 → 가운데"(금귀 은변 초중앙)를 점수로 옮긴다. 정석 책을 외우는 대신 기본 모양만:
//  빈 귀 차지(3·4선) · 상대 귀에 걸치기(날일자·한 칸) · 내 귀 굳히기 · 걸쳐 오면 받기 · 귀가 다 차면 변으로 벌리기.
// 싸움(잡기·살리기·단수)은 점수가 훨씬 커서 언제나 이쪽보다 먼저 본다.

/** 1부터 세는 선(1선 = 맨 가장자리) */
const lineOf = (size: number, i: number) => Math.min(i, size - 1 - i) + 1;

/** 귀 구역: 두 방향 모두 이 선 안쪽 */
const cornerLine = (size: number) => (size >= 13 ? 5 : 4);

/** 초반으로 보는 돌 수(판의 18% 미만) */
const isOpening = (game: Game) => {
  let n = 0;
  for (let p = 0; p < game.geo.n; p++) if (game.at(p) !== EMPTY) n++;
  return n < game.geo.n * 0.18;
};

/** 판 가운데 줄을 뺀, p가 속한 귀 번호(0~3). 가운데 줄이면 -1 */
function quadrant(size: number, x: number, y: number): number {
  const mid = (size - 1) / 2;
  if (x === mid || y === mid) return -1;
  return (x < mid ? 0 : 1) + (y < mid ? 0 : 2);
}

/** 귀 구역(굳힘·걸침 돌까지 보려고 한 선 더 넓게) 안의 돌(색별) */
function cornerStones(game: Game, q: number): { mine: number[]; theirs: number[]; all: number } {
  const size = game.size;
  const c = cornerLine(size) + 1;
  const out = { [BLACK]: [] as number[], [WHITE]: [] as number[] } as Record<number, number[]>;
  for (let p = 0; p < game.geo.n; p++) {
    const v = game.at(p);
    if (v === EMPTY) continue;
    const [x, y] = toXY(size, p);
    if (lineOf(size, x) <= c && lineOf(size, y) <= c && quadrant(size, x, y) === q) out[v].push(p);
  }
  return { mine: out[BLACK], theirs: out[WHITE], all: out[BLACK].length + out[WHITE].length };
}

const knightOrJump = (dx: number, dy: number) => {
  const a = Math.abs(dx);
  const b = Math.abs(dy);
  return (a === 1 && b === 2) || (a === 2 && b === 1) || (a === 0 && b === 2) || (a === 2 && b === 0);
};

export function openingPlan(game: Game, p: number, me: Stone): { score: number; reason: MoveReason } | null {
  if (!isOpening(game)) return null;
  const size = game.size;
  const [x, y] = toXY(size, p);
  const lx = lineOf(size, x);
  const ly = lineOf(size, y);
  const low = Math.min(lx, ly);
  if (low <= 2) return { score: 0, reason: 'shape' }; // 초반 1·2선은 점수 없음(기존 감점 그대로)
  const q = quadrant(size, x, y);
  const c = cornerLine(size);

  // 귀 네 곳의 상태
  const corners = [0, 1, 2, 3].map((k) => cornerStones(game, k));
  const flip = (cs: { mine: number[]; theirs: number[]; all: number }) =>
    me === BLACK ? cs : { mine: cs.theirs, theirs: cs.mine, all: cs.all };

  if (q >= 0) {
    const cs = flip(corners[q]);
    const near = (list: number[]) =>
      list.some((s) => {
        const [sx, sy] = toXY(size, s);
        return knightOrJump(x - sx, y - sy);
      });
    const inCorner = lx <= c && ly <= c;
    const good = lx <= 4 && ly <= 4; // 3·4선 자리(3-3, 3-4, 4-4)
    if (cs.all === 0 && inCorner && good) {
      // 빈 귀 차지: 화점(9줄 3-3, 13줄 4-4)을 조금 더 좋아함
      const star = size >= 13 ? lx === 4 && ly === 4 : lx === 3 && ly === 3;
      return { score: 60 + (star ? 4 : 0), reason: 'corner' };
    }
    if (cs.mine.length === 0 && cs.theirs.length === 1 && near(cs.theirs) && low <= 4 && Math.max(lx, ly) <= c + 1) {
      return { score: 28, reason: 'approach' }; // 상대 귀에 걸치기
    }
    if (cs.mine.length === 1 && cs.theirs.length === 0 && near(cs.mine) && low <= 4 && Math.max(lx, ly) <= c + 1) {
      return { score: 24, reason: 'enclose' }; // 내 귀 굳히기
    }
    if (cs.mine.length === 1 && cs.theirs.length === 1 && near(cs.mine) && low <= 4) {
      // 걸쳐 오면 받기: 내 돌에서 날일자·한 칸이고, 걸쳐 온 돌 가까이(3칸 안)
      const [ax, ay] = toXY(size, cs.theirs[0]);
      if (Math.max(Math.abs(x - ax), Math.abs(y - ay)) <= 3) return { score: 40, reason: 'answer' };
    }
  }

  // 귀가 다 찼으면 변(3·4선)으로 벌리기, 가운데는 아직
  const cornersTaken = corners.every((cs) => cs.all > 0);
  const onSide = low <= 4 && !(lx <= c && ly <= c);
  if (cornersTaken && onSide) {
    if (nearStone(game, x, y, 1)) return { score: 0, reason: 'shape' };
    const open = !nearStone(game, x, y, 2);
    return { score: open ? 16 : 8, reason: 'side' };
  }
  if (low > 4 && !cornersTaken) return { score: -8, reason: 'shape' }; // 귀가 남았는데 가운데부터 두지 않기
  return { score: 0, reason: 'shape' };
}

// ───────── 기본 정석 ─────────
// 화점(4-4)의 입문 정석만. 좌표는 그 귀 꼭짓점에서 센 (가로 줄, 세로 줄), 1부터. A = 화점 주인, B = 상대, 번갈아 둔다.
// 귀 네 곳 × 가로·세로 뒤집기로 맞춰 본다. 귀 구역(7줄×7줄) 안의 돌이 어떤 수순의 앞부분과 똑같을 때만 다음 수를 낸다.
// 13줄 이상에서만 쓴다(9줄은 귀끼리 너무 가까워 정석 모양이 맞지 않음).
export const JOSEKI: { name: string; moves: [number, number][] }[] = [
  // 날일자 걸침(3-6) → 날일자 받기 → 두 칸 벌림
  { name: '걸침·날일자 받기', moves: [[4, 4], [3, 6], [6, 3], [3, 9]] },
  // 날일자 걸침 → 한 칸 받기 → 두 칸 벌림
  { name: '걸침·한 칸 받기', moves: [[4, 4], [3, 6], [6, 4], [3, 9]] },
  // 3-3 침입: 막기 → 기기 → 젖히기 → 젖히기 → 젖히기 → 잇기 → 잇기
  { name: '3-3 침입', moves: [[4, 4], [3, 3], [4, 3], [3, 4], [3, 5], [2, 5], [2, 6], [2, 4], [3, 6]] },
];

const JOSEKI_AREA = 7;

/** 지금 차례(me)가 정석대로 둘 수 있는 점들 */
export function josekiMoves(game: Game, me: Stone): Set<number> {
  const out = new Set<number>();
  const size = game.size;
  if (size < 13) return out;
  for (let corner = 0; corner < 4; corner++) {
    const fx = corner & 1;
    const fy = corner >> 1;
    for (const swap of [false, true]) {
      // 귀 좌표 (a, b) → 판 위 점
      const toBoard = (a: number, b: number) => {
        const [c, r] = swap ? [b, a] : [a, b];
        const x = fx ? size - c : c - 1;
        const y = fy ? size - r : r - 1;
        return y * size + x;
      };
      // 이 귀 구역 안의 돌
      const local = new Map<number, Stone>();
      for (let a = 1; a <= JOSEKI_AREA; a++)
        for (let b = 1; b <= JOSEKI_AREA; b++) {
          const p = toBoard(a, b);
          const v = game.at(p);
          if (v !== EMPTY) local.set(p, v as Stone);
        }
      if (local.size === 0) continue;
      const ownerA = game.at(toBoard(4, 4));
      if (ownerA === EMPTY) continue;
      for (const j of JOSEKI) {
        const k = local.size;
        // 걸침·침입(2번째 수)은 정석 책에서 내지 않는다: 빈 귀가 먼저이고, 걸침은 포석 점수가 맡음
        if (k < 2 || k >= j.moves.length) continue;
        let ok = true;
        for (let i = 0; i < k && ok; i++) {
          const want = i % 2 === 0 ? ownerA : opponent(ownerA as Stone);
          const p = toBoard(...j.moves[i]);
          if (local.get(p) !== want) ok = false;
        }
        if (!ok) continue;
        const nextColor = k % 2 === 0 ? ownerA : opponent(ownerA as Stone);
        if (nextColor !== me) continue;
        const p = toBoard(...j.moves[k]);
        if (game.at(p) === EMPTY && game.isLegal(p)) out.add(p);
      }
    }
  }
  return out;
}
