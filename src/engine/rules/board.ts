// 바둑판 기본 자료형 — 판 크기와 상관없이 쓰는 좌표·이웃·해시 도구
// 좌표(point)는 y * size + x 하나의 정수로 다룬다. (0,0)은 왼쪽 위.

export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = 2;

export type Stone = typeof BLACK | typeof WHITE;
export type Cell = typeof EMPTY | Stone;

export const opponent = (c: Stone): Stone => (c === BLACK ? WHITE : BLACK);

export interface Geometry {
  size: number;
  /** 교차점 수 (size * size) */
  n: number;
  /** 각 교차점의 상하좌우 이웃 목록 */
  neighbors: readonly Int16Array[];
  /** 조브리스트 해시 표: [point * 2 + (color - 1)] 위치에 두 개의 32비트 값 */
  zobristHi: Uint32Array;
  zobristLo: Uint32Array;
}

const geometryCache = new Map<number, Geometry>();

/** 판 크기별 이웃·해시 표를 한 번만 만든다. 해시 값은 항상 같은 씨앗으로 만들어 재현 가능. */
export function geometry(size: number): Geometry {
  const cached = geometryCache.get(size);
  if (cached) return cached;
  if (!Number.isInteger(size) || size < 2 || size > 25) {
    throw new Error(`지원하지 않는 판 크기: ${size}`);
  }
  const n = size * size;
  const neighbors: Int16Array[] = [];
  for (let p = 0; p < n; p++) {
    const x = p % size;
    const y = (p - x) / size;
    const list: number[] = [];
    if (y > 0) list.push(p - size);
    if (x > 0) list.push(p - 1);
    if (x < size - 1) list.push(p + 1);
    if (y < size - 1) list.push(p + size);
    neighbors.push(Int16Array.from(list));
  }
  const rand = mulberry32(0x5eed0000 + size);
  const zobristHi = new Uint32Array(n * 2);
  const zobristLo = new Uint32Array(n * 2);
  for (let i = 0; i < n * 2; i++) {
    zobristHi[i] = rand();
    zobristLo[i] = rand();
  }
  const g: Geometry = { size, n, neighbors, zobristHi, zobristLo };
  geometryCache.set(size, g);
  return g;
}

export const toPoint = (size: number, x: number, y: number): number => y * size + x;
export const toXY = (size: number, p: number): [number, number] => [p % size, Math.floor(p / size)];

/** 판 모양만으로 해시를 처음부터 계산 (검증용). 두는 차례는 포함하지 않는다(판 모양 기준 동형반복). */
export function hashBoard(g: Geometry, board: ArrayLike<number>): string {
  let hi = 0;
  let lo = 0;
  for (let p = 0; p < g.n; p++) {
    const c = board[p];
    if (c === BLACK || c === WHITE) {
      hi ^= g.zobristHi[p * 2 + c - 1];
      lo ^= g.zobristLo[p * 2 + c - 1];
    }
  }
  return hashKey(hi, lo);
}

export const hashKey = (hi: number, lo: number): string => `${hi >>> 0}:${lo >>> 0}`;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
}
