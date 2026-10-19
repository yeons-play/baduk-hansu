// 2단계 검증: 무작위 대국 불변식 검사 + 3단계: 기존 라이브러리(@sabaki/go-board)와 교차 대조
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { BLACK, EMPTY, WHITE, Game, hashBoard, toXY } from '../src/engine/rules';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const SabakiBoard = require('@sabaki/go-board');

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GAMES = Number(process.env.RANDOM_GAMES ?? 400);
const MAX_MOVES = 300;

describe('무작위 대국 불변식', () => {
  it(`${GAMES}판 × 최대 ${MAX_MOVES}수 동안 규칙이 깨지지 않는다`, () => {
    const stats = { moves: 0, captures: 0, suicide: 0, superko: 0, games: 0 };
    for (let gi = 0; gi < GAMES; gi++) {
      const size = gi % 3 === 0 ? 5 : gi % 3 === 1 ? 7 : 9;
      const rand = rng(1000 + gi);
      const g = new Game({ size });
      const seen = new Set<string>([g.positionKey]);
      let placed = 0;
      let removed = 0;
      for (let m = 0; m < MAX_MOVES && !g.isOver; m++) {
        const empties: number[] = [];
        for (let p = 0; p < g.geo.n; p++) if (g.at(p) === EMPTY) empties.push(p);
        // 무작위로 고르되, 불법이면 이유를 기록하고 다른 곳을 시도
        let played = false;
        for (let t = 0; t < 8 && empties.length; t++) {
          const p = empties[Math.floor(rand() * empties.length)];
          const r = g.play(p);
          if (r.ok) {
            placed++;
            removed += r.captured.length;
            stats.captures += r.captured.length;
            played = true;
            break;
          }
          if (r.reason === 'suicide') stats.suicide++;
          if (r.reason === 'superko') stats.superko++;
        }
        if (!played) g.pass();
        stats.moves++;

        // 불변식 1: 판 위에 활로 0인 그룹이 없다
        for (let p = 0; p < g.geo.n; p++) {
          if (g.at(p) !== EMPTY) expect(g.group(p).liberties.length).toBeGreaterThan(0);
        }
        // 불변식 2: 돌 수 = 놓은 수 − 따낸 수
        let stones = 0;
        for (let p = 0; p < g.geo.n; p++) if (g.at(p) !== EMPTY) stones++;
        expect(stones).toBe(placed - removed);
        // 불변식 3: 점진 해시 = 처음부터 다시 계산한 해시
        expect(g.positionKey).toBe(hashBoard(g.geo, g.board()));
        // 불변식 4: 착수 후 판 모양은 이전에 나온 적이 없다 (패스는 판을 바꾸지 않음)
        if (played) {
          expect(seen.has(g.positionKey)).toBe(false);
          seen.add(g.positionKey);
        }
      }
      stats.games++;
    }
    // 테스트가 실제로 따내기·자살수·동형반복 상황을 겪었는지 확인
    expect(stats.captures).toBeGreaterThan(1000);
    expect(stats.suicide).toBeGreaterThan(0);
    expect(stats.superko).toBeGreaterThan(0);
  });

  it('legalMoves에 나온 수는 모두 실제로 둘 수 있고, 빠진 빈 곳은 실제로 불법이다', () => {
    for (let gi = 0; gi < 60; gi++) {
      const rand = rng(5000 + gi);
      const g = new Game({ size: 7 });
      for (let m = 0; m < 120 && !g.isOver; m++) {
        const legal = new Set(g.legalMoves());
        for (let p = 0; p < g.geo.n; p++) {
          if (g.at(p) !== EMPTY) continue;
          expect(g.isLegal(p)).toBe(legal.has(p));
        }
        const list = [...legal];
        if (list.length === 0) g.pass();
        else g.play(list[Math.floor(rand() * list.length)]);
      }
    }
  });

  it('무르기를 반복해도 처음 상태로 정확히 돌아온다', () => {
    const rand = rng(77);
    const g = new Game({ size: 9 });
    const keys: string[] = [g.positionKey];
    for (let m = 0; m < 150; m++) {
      const list = g.legalMoves();
      if (!list.length) break;
      g.play(list[Math.floor(rand() * list.length)]);
      keys.push(g.positionKey);
    }
    for (let i = keys.length - 1; i > 0; i--) {
      expect(g.positionKey).toBe(keys[i]);
      g.undo();
    }
    expect(g.positionKey).toBe(keys[0]);
    expect(g.moves.length).toBe(0);
  });
});

describe('교차 대조: @sabaki/go-board', () => {
  it('합법수 판정·따낸 돌·결과 판이 매 수 일치한다', () => {
    const stats = { compared: 0, captures: 0, suicide: 0, superko: 0 };
    for (let gi = 0; gi < GAMES; gi++) {
      const size = 9;
      const rand = rng(9000 + gi);
      const g = new Game({ size });
      let sb = SabakiBoard.fromDimensions(size);
      const boards = new Set<string>([boardString(sb.signMap)]);
      for (let m = 0; m < MAX_MOVES && !g.isOver; m++) {
        const empties: number[] = [];
        for (let p = 0; p < g.geo.n; p++) if (g.at(p) === EMPTY) empties.push(p);
        if (!empties.length) break;
        const p = empties[Math.floor(rand() * empties.length)];
        const [x, y] = toXY(size, p);
        const sign = g.toMove === BLACK ? 1 : -1;

        let sabakiNext: { signMap: number[][]; getCaptures(s: number): number } | null = null;
        let sabakiError = '';
        try {
          sabakiNext = sb.makeMove(sign, [x, y], { preventSuicide: true, preventOverwrite: true });
        } catch (e) {
          sabakiError = (e as Error).message;
        }
        const ours = g.play(p);
        stats.compared++;

        if (ours.ok) {
          // 우리가 합법이면 사바키도 합법이고 결과 판이 같아야 함
          expect(sabakiError).toBe('');
          expect(boardString(sabakiNext!.signMap)).toBe(boardString(toSignMap(g)));
          stats.captures += ours.captured.length;
          sb = sabakiNext;
          boards.add(boardString(sb.signMap));
        } else if (ours.reason === 'suicide') {
          expect(sabakiError).toBe('Suicide prevented');
          stats.suicide++;
        } else if (ours.reason === 'superko') {
          // 사바키는 단순 패만 막으므로 둘 수도 있다 — 그 결과 판이 실제로 이전에 나온 판인지 확인
          if (!sabakiError) expect(boards.has(boardString(sabakiNext!.signMap))).toBe(true);
          stats.superko++;
        } else {
          throw new Error(`예상하지 못한 불법 사유: ${ours.reason}`);
        }
        // 흑·백 따낸 수 일치
        expect(g.captures(BLACK)).toBe(sb.getCaptures(1));
        expect(g.captures(WHITE)).toBe(sb.getCaptures(-1));
      }
    }
    expect(stats.captures).toBeGreaterThan(1000);
    expect(stats.suicide).toBeGreaterThan(0);
    expect(stats.superko).toBeGreaterThan(0);
  });
});

function toSignMap(g: Game): number[][] {
  const rows: number[][] = [];
  for (let y = 0; y < g.size; y++) {
    const row: number[] = [];
    for (let x = 0; x < g.size; x++) {
      const c = g.atXY(x, y);
      row.push(c === BLACK ? 1 : c === WHITE ? -1 : 0);
    }
    rows.push(row);
  }
  return rows;
}

function boardString(signMap: number[][]): string {
  return signMap.map((r) => r.map((v) => (v > 0 ? 'X' : v < 0 ? 'O' : '.')).join('')).join('/');
}
