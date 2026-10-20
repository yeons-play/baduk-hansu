// 초급 AI (휴리스틱) — 따내기 바둑·초반 연습용.
// 합법 판단은 규칙 엔진(play/undo)에만 맡긴다.
// 난이도: 1 = 실수가 잦음, 2 = 기본 공수, 3 = 한 수 앞의 위험까지 고려(힌트에도 사용)

import { EMPTY, type Stone, Game, opponent, toXY } from '../rules';

export type Level = 1 | 2 | 3;

export type MoveReason = 'win' | 'capture' | 'escape' | 'atari' | 'connect' | 'shape' | 'pass';

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

export function chooseMove(game: Game, opts: AIOptions): AIChoice {
  const rand = opts.rand ?? Math.random;
  const level = opts.level;
  const me = game.toMove;
  const legal = game.legalMoves();
  if (legal.length === 0) return { point: null, reason: 'pass' };

  const myAtari = atariGroups(game, me);
  const oversight = rand() < OVERSIGHT[level];

  let best: { point: number; score: number; reason: MoveReason } | null = null;
  for (const p of legal) {
    const { score, reason } = evaluate(game, p, me, myAtari, level, oversight);
    const noisy = score + (NOISE[level] ? (rand() - 0.5) * NOISE[level] : 0);
    if (!best || noisy > best.score) best = { point: p, score: noisy, reason };
  }
  return { point: best!.point, reason: best!.reason };
}

function evaluate(
  game: Game,
  p: number,
  me: Stone,
  myAtari: number[],
  level: Level,
  oversight: boolean,
): { score: number; reason: MoveReason } {
  const opp = opponent(me);
  const size = game.size;
  let score = 0;
  let reason: MoveReason = 'shape';

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
