// 초급 AI (휴리스틱) — 따내기 바둑과 집 짓는 바둑(정규 대국) 연습용.
// 정규 대국에서는 판 전체의 집 모양(면적 계가 소유)을 보고 빈 곳을 넓히고, 자기 집·눈은 메우지 않으며,
// 둘 만한 곳이 없으면 패스한다. 사석 판정을 하지 않는 규칙이므로 자기 집 안의 약한 상대 돌은 끝까지 쫓아 잡는다.
// 합법 판단은 규칙 엔진(play/undo)에만 맡긴다.
// 난이도: 1 = 초보다운 실수가 잦음, 2 = 가끔 실수, 3 = 한 수 앞의 위험까지 고려(힌트에도 사용)

import { BLACK, EMPTY, WHITE, type Stone, Game, opponent, toXY } from '../rules';

export type Level = 1 | 2 | 3;

export type MoveReason = 'win' | 'capture' | 'escape' | 'atari' | 'connect' | 'territory' | 'shape' | 'pass';

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

  const all = legal.map((p) => ({ point: p, ...evaluate(game, p, me, myAtari, level, oversight, owner, infl) }));
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
      // 내 돌끼리 뭉치기(덩어리·네모 모양)는 집을 넓히지 못하니 피한다
      if (!saving && cap === 0) {
        if (friendly >= 2) score -= 8 * (friendly - 1);
        if (square) score -= 12;
      }
      // 내 울타리 안에 들어온 상대 돌(사석)은 끝까지 쫓아 잡는다 — 이 규칙은 판 위 돌을 모두 산 돌로 세므로
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

    // 3단계: 둔 뒤 상대가 바로 따낼 수 있는 내 돌이 남는지
    if (level === 3 && !game.isOver) {
      const danger = atariGroups(game, me);
      for (const rep of danger) score -= 40 + 8 * game.group(rep).stones.length;
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
