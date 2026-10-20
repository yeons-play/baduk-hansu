// 초급 AI (휴리스틱) — 따내기 바둑과 집 짓는 바둑(정규 대국) 연습용.
// 정규 대국에서는 판 전체의 집 모양(면적 계가 소유)을 보고 빈 곳을 넓히고, 자기 집·눈은 메우지 않으며,
// 둘 만한 곳이 없으면 패스한다. 사석 판정을 하지 않는 규칙이므로 자기 집 안의 약한 상대 돌은 끝까지 쫓아 잡는다.
// 합법 판단은 규칙 엔진(play/undo)에만 맡긴다.
// 난이도: 1 = 실수가 잦음, 2 = 기본 공수, 3 = 한 수 앞의 위험까지 고려(힌트에도 사용)

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

const NOISE: Record<Level, number> = { 1: 45, 2: 16, 3: 0 };
/** 단수에 걸린 자기 돌을 못 보고 지나칠 확률 */
const OVERSIGHT: Record<Level, number> = { 1: 0.4, 2: 0.1, 3: 0 };
/** 정규 대국: 가장 좋은 수의 점수가 이보다 낮으면 패스(잡음과 상관없이 판단) */
const PASS_BELOW = 4;

export function chooseMove(game: Game, opts: AIOptions): AIChoice {
  const rand = opts.rand ?? Math.random;
  const level = opts.level;
  const me = game.toMove;
  const legal = game.legalMoves();
  if (legal.length === 0) return { point: null, reason: 'pass' };

  const myAtari = atariGroups(game, me);
  const oversight = rand() < OVERSIGHT[level];
  const owner = game.rules.mode === 'normal' ? settledOwner(game) : null;

  let best: { point: number; score: number; reason: MoveReason } | null = null;
  let bestRaw = -Infinity;
  for (const p of legal) {
    const { score, reason } = evaluate(game, p, me, myAtari, level, oversight, owner);
    if (score > bestRaw) bestRaw = score;
    const noisy = score + (NOISE[level] ? (rand() - 0.5) * NOISE[level] : 0);
    if (!best || noisy > best.score) best = { point: p, score: noisy, reason };
  }
  if (owner && bestRaw < PASS_BELOW) return { point: null, reason: 'pass' };
  return { point: best!.point, reason: best!.reason };
}

function evaluate(
  game: Game,
  p: number,
  me: Stone,
  myAtari: number[],
  level: Level,
  oversight: boolean,
  owner: Uint8Array | null,
): { score: number; reason: MoveReason } {
  const opp = opponent(me);
  const size = game.size;
  let score = 0;
  let reason: MoveReason = 'shape';
  // 정규 대국: 두기 전의 집 모양
  const ownedBy = owner ? owner[p] : -1;
  const ownEye = owner ? game.geo.neighbors[p].every((q) => game.at(q) === me) : false;

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
    if (friendly > 0 && myLibs >= 3) {
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
        score += 10; // 아직 누구 집도 아닌 곳 넓히기
        if (reason === 'shape') reason = 'territory';
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
