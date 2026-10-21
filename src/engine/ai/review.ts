// 복습용 '놓친 장면' 찾기 — 규칙 엔진으로 확실히 판단할 수 있는 실수만 짚는다('가장 좋은 수'는 말하지 않음).
//  missed-capture: 하양이 돌을 잡을 수 있었는데 다른 곳에 둠(5강)
//  missed-escape : 내 돌이 단수였는데 도망가지 않음(6강)
//  self-atari    : 둔 돌이 스스로 단수가 되어 바로 잡힐 수 있음(4강)
//  own-eye       : 내 돌로만 둘러싸인 한 점(눈)을 스스로 메움(9강)
// 잡기·도망은 '방금 생긴 기회'만 본다(하양이의 바로 전 수로 단수가 된 무리). 오래 남아 있던 죽은 돌을
// 안 잡았다고 혼내지 않기 위해서다(진짜 바둑은 죽은 돌을 계가 때 들어낸다).
import { BLACK, EMPTY, Game, opponent, type GameMode, type Stone } from '../rules';

export type MistakeKind = 'missed-capture' | 'missed-escape' | 'self-atari' | 'own-eye';

export interface Mistake {
  /** 몇 번째 수(0부터) — 이 수를 두기 전 판이 장면 */
  index: number;
  kind: MistakeKind;
  /** 실제로 둔 점(넘기기면 null) */
  played: number | null;
  /** 이렇게 둘 수 있었던 점(잡기·도망). 스스로 단수·눈 메우기는 빈 배열 */
  better: number[];
  /** 다시 볼 강 번호 */
  lesson: number;
}

export const MISTAKE_LESSON: Record<MistakeKind, number> = {
  'missed-capture': 5,
  'missed-escape': 6,
  'self-atari': 4,
  'own-eye': 9,
};

export interface ReplaySpec {
  mode: GameMode;
  size: number;
  captureTarget: number;
  /** 착수 좌표, 넘기기는 -1 */
  moves: number[];
}

/** 기록을 처음부터 k수까지 다시 둔 판 */
export function replay(spec: ReplaySpec, k = spec.moves.length): Game {
  const g = new Game({ size: spec.size, mode: spec.mode, captureTarget: spec.captureTarget });
  for (let i = 0; i < k && i < spec.moves.length; i++) {
    const m = spec.moves[i];
    const r = m < 0 ? g.pass() : g.play(m);
    if (!r.ok) break;
  }
  return g;
}

/** color의 숨구멍 하나 남은 무리들(돌 목록) */
function ataris(g: Game, color: Stone): number[][] {
  const seen = new Set<number>();
  const out: number[][] = [];
  for (let p = 0; p < g.geo.n; p++) {
    if (seen.has(p) || g.at(p) !== color) continue;
    const grp = g.group(p);
    grp.stones.forEach((s) => seen.add(s));
    if (grp.liberties.length === 1) out.push(grp.stones);
  }
  return out;
}

/** 이전 판에서는 단수가 아니었던(방금 생긴) 무리만 */
function fresh(now: number[][], before: Set<number>): number[][] {
  return now.filter((grp) => grp.some((s) => !before.has(s)));
}

export function findMistakes(spec: ReplaySpec, human: Stone = BLACK): Mistake[] {
  const g = new Game({ size: spec.size, mode: spec.mode, captureTarget: spec.captureTarget });
  const opp = opponent(human);
  const out: Mistake[] = [];
  // 상대가 두기 직전의 단수 돌들(방금 생긴 기회인지 가리려고)
  let oppAtariBefore = new Set<number>();
  let myAtariBefore = new Set<number>();
  for (let i = 0; i < spec.moves.length; i++) {
    const m = spec.moves[i];
    if (g.isOver) break;
    if (g.toMove !== human) {
      oppAtariBefore = new Set(ataris(g, opp).flat());
      myAtariBefore = new Set(ataris(g, human).flat());
      const r = m < 0 ? g.pass() : g.play(m);
      if (!r.ok) break;
      continue;
    }
    const mistake = judge(g, i, m, human, fresh(ataris(g, opp), oppAtariBefore), fresh(ataris(g, human), myAtariBefore));
    if (mistake) out.push(mistake);
    const r = m < 0 ? g.pass() : g.play(m);
    if (!r.ok) break;
  }
  return out;
}

function judge(g: Game, index: number, m: number, me: Stone, oppAtari: number[][], myAtari: number[][]): Mistake | null {
  // 넘기기는 정규 대국에서 끝내기 신호이므로 따지지 않는다(따내기 바둑의 넘기기는 잡기·도망 놓침만 본다)
  const pass = m < 0;
  if (pass && g.rules.mode === 'normal') return null;

  // 잡을 수 있었던 자리: 방금 단수가 된 상대 무리를 잡고, 둔 뒤 내 돌이 바로 잡히지 않는 수
  const oppStones = new Set(oppAtari.flat());
  const caps: number[] = [];
  if (oppStones.size) {
    for (const grp of oppAtari) {
      const lib = g.group(grp[0]).liberties[0];
      if (caps.includes(lib)) continue;
      const r = g.play(lib);
      if (!r.ok) continue;
      const safe = g.isOver || g.group(lib).liberties.length >= 2 || r.captured.length >= 2;
      g.undo();
      if (safe && r.captured.some((s) => oppStones.has(s))) caps.push(lib);
    }
  }
  // 도망갈 수 있었던 자리: 방금 단수가 된 내 무리의 숨구멍이 2개 이상이 되는 수(잡아서 살리기 포함)
  const saves: number[] = [];
  for (const grp of myAtari) {
    for (let p = 0; p < g.geo.n; p++) {
      if (g.at(p) !== EMPTY || saves.includes(p)) continue;
      const r = g.play(p);
      if (!r.ok) continue;
      const ok = g.at(grp[0]) === me && g.group(grp[0]).liberties.length >= 2;
      g.undo();
      if (ok) saves.push(p);
    }
  }

  let didCapture = false;
  let selfAtari = false;
  let ownEye = false;
  if (!pass) {
    ownEye = g.rules.mode === 'normal' && g.geo.neighbors[m].every((q) => g.at(q) === me);
    const r = g.play(m);
    if (!r.ok) return null;
    didCapture = r.captured.length > 0;
    if (!g.isOver && !didCapture) {
      const grp = g.group(m);
      if (grp.liberties.length === 1 && g.isLegal(grp.liberties[0])) selfAtari = true;
    }
    g.undo();
  }
  const didSave = !pass && saves.includes(m);
  const played = pass ? null : m;
  const make = (kind: MistakeKind, better: number[]): Mistake => ({ index, kind, played, better, lesson: MISTAKE_LESSON[kind] });

  if (!didCapture && !didSave) {
    if (caps.length) return make('missed-capture', caps);
    if (saves.length) return make('missed-escape', saves);
  }
  if (selfAtari && !didSave) return make('self-atari', []);
  if (ownEye && !didCapture && !didSave) return make('own-eye', []);
  return null;
}
