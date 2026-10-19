// 바둑한수 규칙 엔진 — 규칙 판단은 이 파일에서만 한다.
// 규칙 명세(docs/rules.md)와 1:1로 대응:
//  - 착수: 빈 교차점에만, 흑 선, 교대
//  - 따내기 먼저, 그다음 자기 활로 검사 (따내는 수는 활로 0이어도 합법)
//  - 자살수 금지 (한 점·여러 점 모두)
//  - 동형반복 금지: 판 모양만 비교(차례 무시). 패스는 판을 바꾸지 않으므로 이력에 새로 넣지 않는다.
//  - 종료: 연속 패스 2회 또는 기권. 따내기 바둑은 목표 점수만큼 먼저 따내면 승리.
//  - 계가: 면적 계가 — 자기 돌 + 자기 돌로만 둘러싸인 빈 곳. 양쪽 돌에 닿는 빈 곳은 누구 것도 아님(빅 포함).
//  - 사석 자동 판정 없음: 판 위에 남은 돌은 모두 살아 있는 것으로 센다.

import {
  BLACK,
  EMPTY,
  WHITE,
  type Cell,
  type Geometry,
  type Stone,
  geometry,
  hashKey,
  opponent,
  toPoint,
} from './board';

export type GameMode = 'normal' | 'capture';

export interface RuleConfig {
  size: number;
  /** 백에게 주는 덤 (면적 계가) */
  komi: number;
  /** normal: 정규 대국, capture: 따내기 바둑 */
  mode: GameMode;
  /** 따내기 바둑에서 이기는 데 필요한 따낸 돌 수 */
  captureTarget: number;
}

export const DEFAULT_RULES: RuleConfig = { size: 9, komi: 7, mode: 'normal', captureTarget: 1 };

export type IllegalReason = 'game-over' | 'off-board' | 'occupied' | 'suicide' | 'superko';

export type MoveResult =
  | { ok: true; captured: number[] }
  | { ok: false; reason: IllegalReason };

export type Move =
  | { type: 'play'; color: Stone; point: number; captured: number[] }
  | { type: 'pass'; color: Stone }
  | { type: 'resign'; color: Stone };

export type GameResult =
  | { winner: Stone; reason: 'resign' | 'capture' }
  | { winner: Stone | null; reason: 'score'; score: AreaScore }
  | { winner: null; reason: 'no-capture' };

export interface AreaScore {
  /** 흑 돌 수 */
  blackStones: number;
  whiteStones: number;
  /** 흑 돌로만 둘러싸인 빈 곳 */
  blackArea: number;
  whiteArea: number;
  /** 어느 쪽 것도 아닌 빈 곳 (공배·빅) */
  neutral: number;
  komi: number;
  blackTotal: number;
  /** 덤 포함 */
  whiteTotal: number;
  /** 흑 기준 차이 (양수면 흑 승, 0이면 무승부) */
  margin: number;
  /** 교차점별 소유: 0 = 중립, 1 = 흑, 2 = 백 */
  owner: Uint8Array;
}

interface Snapshot {
  board: Uint8Array;
  toMove: Stone;
  captures: [number, number];
  passes: number;
  hi: number;
  lo: number;
  result: GameResult | null;
  addedKey: string | null;
}

interface Attempt {
  board: Uint8Array;
  captured: number[];
  hi: number;
  lo: number;
  key: string;
}

export class Game {
  readonly rules: RuleConfig;
  readonly geo: Geometry;
  private _board: Uint8Array;
  private _toMove: Stone;
  /** [흑이 따낸 수, 백이 따낸 수] */
  private _captures: [number, number] = [0, 0];
  private _passes = 0;
  private _hi = 0;
  private _lo = 0;
  private _seen = new Set<string>();
  private _result: GameResult | null = null;
  private _moves: Move[] = [];
  private _undo: Snapshot[] = [];
  // 그룹 탐색용 작업 공간 (매번 새로 만들지 않음)
  private _mark: Uint32Array;
  private _stamp = 0;

  constructor(rules: Partial<RuleConfig> = {}, setup?: { board: ArrayLike<number>; toMove: Stone }) {
    this.rules = { ...DEFAULT_RULES, ...rules };
    this.geo = geometry(this.rules.size);
    this._board = new Uint8Array(this.geo.n);
    this._mark = new Uint32Array(this.geo.n);
    this._toMove = BLACK;
    if (setup) {
      if (setup.board.length !== this.geo.n) throw new Error('판 크기와 배치가 맞지 않음');
      for (let p = 0; p < this.geo.n; p++) {
        const c = setup.board[p];
        if (c !== EMPTY && c !== BLACK && c !== WHITE) throw new Error(`잘못된 칸 값: ${c}`);
        if (c !== EMPTY) this.xorStone(p, c as Stone);
        this._board[p] = c;
      }
      this._toMove = setup.toMove;
      for (let p = 0; p < this.geo.n; p++) {
        if (this._board[p] !== EMPTY && this.libertyCount(this._board, p) === 0) {
          throw new Error('활로가 없는 돌이 있는 배치');
        }
      }
    }
    this._seen.add(hashKey(this._hi, this._lo));
  }

  /** 'X' 흑, 'O' 백, '.' 빈 곳. 공백은 무시. 첫 줄이 맨 위. */
  static fromDiagram(rows: string[], toMove: Stone = BLACK, rules: Partial<RuleConfig> = {}): Game {
    const cleaned = rows.map((r) => r.replace(/\s+/g, ''));
    const size = cleaned.length;
    if (cleaned.some((r) => r.length !== size)) throw new Error('정사각형 배치가 아님');
    const board = new Uint8Array(size * size);
    cleaned.forEach((row, y) => {
      for (let x = 0; x < size; x++) {
        const ch = row[x];
        board[y * size + x] = ch === 'X' ? BLACK : ch === 'O' ? WHITE : EMPTY;
        if (!'XO.'.includes(ch)) throw new Error(`알 수 없는 기호: ${ch}`);
      }
    });
    return new Game({ ...rules, size }, { board, toMove });
  }

  // ───────── 읽기 ─────────

  get size(): number {
    return this.rules.size;
  }
  get toMove(): Stone {
    return this._toMove;
  }
  get isOver(): boolean {
    return this._result !== null;
  }
  get result(): GameResult | null {
    return this._result;
  }
  get moves(): readonly Move[] {
    return this._moves;
  }
  get consecutivePasses(): number {
    return this._passes;
  }
  /** 해당 색이 지금까지 따낸 돌 수 */
  captures(color: Stone): number {
    return this._captures[color - 1];
  }
  at(point: number): Cell {
    return this._board[point] as Cell;
  }
  atXY(x: number, y: number): Cell {
    return this.at(toPoint(this.size, x, y));
  }
  /** 판 복사본 */
  board(): Uint8Array {
    return this._board.slice();
  }
  /** 판 모양 해시 (차례 미포함) */
  get positionKey(): string {
    return hashKey(this._hi, this._lo);
  }

  /** 한 점이 속한 그룹과 그 활로 */
  group(point: number): { stones: number[]; liberties: number[] } {
    const color = this._board[point];
    if (color === EMPTY) return { stones: [], liberties: [] };
    return this.collectGroup(this._board, point);
  }

  // ───────── 합법성 ─────────

  /** 지금 차례인 쪽이 이 점에 둘 수 있는지 */
  check(point: number): MoveResult {
    const a = this.attempt(point, this._toMove);
    return 'reason' in a ? { ok: false, reason: a.reason } : { ok: true, captured: a.captured };
  }

  isLegal(point: number): boolean {
    return this.check(point).ok;
  }

  legalMoves(): number[] {
    if (this._result) return [];
    const out: number[] = [];
    for (let p = 0; p < this.geo.n; p++) if (this._board[p] === EMPTY && this.isLegal(p)) out.push(p);
    return out;
  }

  // ───────── 진행 ─────────

  play(point: number): MoveResult {
    const color = this._toMove;
    const a = this.attempt(point, color);
    if ('reason' in a) return { ok: false, reason: a.reason };
    this.pushUndo(a.key);
    this._board = a.board;
    this._hi = a.hi;
    this._lo = a.lo;
    this._seen.add(a.key);
    this._captures[color - 1] += a.captured.length;
    this._passes = 0;
    this._moves.push({ type: 'play', color, point, captured: a.captured });
    this._toMove = opponent(color);
    if (
      this.rules.mode === 'capture' &&
      a.captured.length > 0 &&
      this._captures[color - 1] >= this.rules.captureTarget
    ) {
      this._result = { winner: color, reason: 'capture' };
    }
    return { ok: true, captured: a.captured };
  }

  playXY(x: number, y: number): MoveResult {
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return { ok: false, reason: 'off-board' };
    return this.play(toPoint(this.size, x, y));
  }

  pass(): MoveResult {
    if (this._result) return { ok: false, reason: 'game-over' };
    const color = this._toMove;
    this.pushUndo(null);
    this._passes += 1;
    this._moves.push({ type: 'pass', color });
    this._toMove = opponent(color);
    if (this._passes >= 2) {
      if (this.rules.mode === 'capture') {
        this._result = { winner: null, reason: 'no-capture' };
      } else {
        const score = this.score();
        this._result = {
          winner: score.margin > 0 ? BLACK : score.margin < 0 ? WHITE : null,
          reason: 'score',
          score,
        };
      }
    }
    return { ok: true, captured: [] };
  }

  resign(): MoveResult {
    if (this._result) return { ok: false, reason: 'game-over' };
    const color = this._toMove;
    this.pushUndo(null);
    this._moves.push({ type: 'resign', color });
    this._result = { winner: opponent(color), reason: 'resign' };
    return { ok: true, captured: [] };
  }

  /** 마지막 한 수(착수·패스·기권) 되돌리기 */
  undo(): boolean {
    const s = this._undo.pop();
    if (!s) return false;
    if (s.addedKey) this._seen.delete(s.addedKey);
    this._board = s.board;
    this._toMove = s.toMove;
    this._captures = s.captures;
    this._passes = s.passes;
    this._hi = s.hi;
    this._lo = s.lo;
    this._result = s.result;
    this._moves.pop();
    return true;
  }

  // ───────── 계가 ─────────

  /** 면적 계가. 판 위의 돌은 모두 산 돌로 센다. */
  score(): AreaScore {
    const { n, neighbors } = this.geo;
    const b = this._board;
    const owner = new Uint8Array(n);
    let blackStones = 0;
    let whiteStones = 0;
    let blackArea = 0;
    let whiteArea = 0;
    let neutral = 0;
    const visited = new Uint8Array(n);
    const stack: number[] = [];
    const region: number[] = [];
    for (let p = 0; p < n; p++) {
      if (b[p] === BLACK) {
        blackStones++;
        owner[p] = BLACK;
      } else if (b[p] === WHITE) {
        whiteStones++;
        owner[p] = WHITE;
      } else if (!visited[p]) {
        region.length = 0;
        let touch = 0; // 비트 1 = 흑에 닿음, 2 = 백에 닿음
        stack.push(p);
        visited[p] = 1;
        while (stack.length) {
          const q = stack.pop()!;
          region.push(q);
          for (const r of neighbors[q]) {
            const c = b[r];
            if (c === EMPTY) {
              if (!visited[r]) {
                visited[r] = 1;
                stack.push(r);
              }
            } else touch |= c;
          }
        }
        const who = touch === BLACK ? BLACK : touch === WHITE ? WHITE : EMPTY;
        for (const q of region) owner[q] = who;
        if (who === BLACK) blackArea += region.length;
        else if (who === WHITE) whiteArea += region.length;
        else neutral += region.length;
      }
    }
    const komi = this.rules.komi;
    const blackTotal = blackStones + blackArea;
    const whiteTotal = whiteStones + whiteArea + komi;
    return {
      blackStones,
      whiteStones,
      blackArea,
      whiteArea,
      neutral,
      komi,
      blackTotal,
      whiteTotal,
      margin: blackTotal - whiteTotal,
      owner,
    };
  }

  // ───────── 내부 ─────────

  /** 착수를 시험해 보고, 합법이면 새 판·해시를 돌려준다(상태는 바꾸지 않음). */
  private attempt(point: number, color: Stone): Attempt | { reason: IllegalReason } {
    if (this._result) return { reason: 'game-over' };
    if (!Number.isInteger(point) || point < 0 || point >= this.geo.n) return { reason: 'off-board' };
    if (this._board[point] !== EMPTY) return { reason: 'occupied' };

    const g = this.geo;
    const board = this._board.slice();
    let hi = this._hi ^ g.zobristHi[point * 2 + color - 1];
    let lo = this._lo ^ g.zobristLo[point * 2 + color - 1];
    board[point] = color;

    // 1) 상대 그룹 따내기 먼저
    const opp = opponent(color);
    const captured: number[] = [];
    for (const nb of g.neighbors[point]) {
      if (board[nb] !== opp) continue;
      if (this.libertyCount(board, nb) > 0) continue;
      const { stones } = this.collectGroup(board, nb);
      for (const s of stones) {
        board[s] = EMPTY;
        hi ^= g.zobristHi[s * 2 + opp - 1];
        lo ^= g.zobristLo[s * 2 + opp - 1];
        captured.push(s);
      }
    }

    // 2) 그다음 자기 그룹 활로 검사 → 0이면 자살수
    if (captured.length === 0 && this.libertyCount(board, point) === 0) return { reason: 'suicide' };

    // 3) 동형반복 금지 (판 모양 기준)
    const key = hashKey(hi, lo);
    if (this._seen.has(key)) return { reason: 'superko' };

    return { board, captured, hi, lo, key };
  }

  private libertyCount(board: Uint8Array, start: number): number {
    return this.collectGroup(board, start).liberties.length;
  }

  private collectGroup(board: Uint8Array, start: number): { stones: number[]; liberties: number[] } {
    const g = this.geo;
    const color = board[start];
    const stamp = ++this._stamp;
    if (stamp === 0xffffffff) {
      this._mark.fill(0);
      this._stamp = 1;
    }
    const s = this._stamp;
    const stones: number[] = [];
    const liberties: number[] = [];
    const stack = [start];
    this._mark[start] = s;
    while (stack.length) {
      const p = stack.pop()!;
      stones.push(p);
      for (const q of g.neighbors[p]) {
        if (this._mark[q] === s) continue;
        const c = board[q];
        if (c === color) {
          this._mark[q] = s;
          stack.push(q);
        } else if (c === EMPTY) {
          this._mark[q] = s;
          liberties.push(q);
        }
      }
    }
    return { stones, liberties };
  }

  private xorStone(p: number, c: Stone): void {
    this._hi ^= this.geo.zobristHi[p * 2 + c - 1];
    this._lo ^= this.geo.zobristLo[p * 2 + c - 1];
  }

  private pushUndo(addedKey: string | null): void {
    this._undo.push({
      board: this._board,
      toMove: this._toMove,
      captures: [this._captures[0], this._captures[1]],
      passes: this._passes,
      hi: this._hi,
      lo: this._lo,
      result: this._result,
      addedKey,
    });
  }
}
