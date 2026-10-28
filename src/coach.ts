// 도와줘 3단계 — 아이가 '도와줘'를 누를 때만 돕는다: 무엇을 찾을지(말) → 어느 돌·어디쯤(동그라미·네모) → 정확한 자리.
// (2026-10-28) 두는 중에 먼저 끼어드는 알림·스스로 단수 확인은 아이가 싫어해서 지웠다. 놓친 장면은 끝난 뒤 복습에서 짚는다.
// 판단은 모두 규칙 엔진(play·undo·check·group)으로 한다. 시험해 본 수는 바로 되돌린다.
import { chooseMove, type MoveReason } from './engine/ai/beginner';
import { opponent, toXY, type Game, type Stone } from './engine/rules';

/** color의 숨구멍 하나 남은 무리들(돌 목록) */
function ataris(g: Game, color: Stone): number[][] {
  const seen = new Uint8Array(g.geo.n);
  const out: number[][] = [];
  for (let p = 0; p < g.geo.n; p++) {
    if (seen[p] || g.at(p) !== color) continue;
    const grp = g.group(p);
    for (const s of grp.stones) seen[s] = 1;
    if (grp.liberties.length === 1) out.push(grp.stones);
  }
  return out;
}

// ───────── 도와줘 3단계 ─────────

export type HintStep = 0 | 1 | 2 | 3;
/** 반짝일 네모 구역 [x0, y0, x1, y1](양 끝 포함) */
export type Zone = [number, number, number, number];

export interface HintPlan {
  /** 3단계에서 보여 줄 자리 */
  point: number;
  reason: MoveReason;
  /** 2단계에서 동그라미 칠 돌: 잡을 하양이 돌, 살릴 까망이 돌, 단수로 몰 하양이 돌 */
  stones: number[];
  /** 2단계에서 반짝일 구역(돌로 짚을 수 없는 집 짓기 수) */
  zone: Zone | null;
}

/** p를 가운데 두고 판 안에 들어가는 (2r+1)칸 네모 */
export function zoneAround(size: number, p: number, r = 2): Zone {
  const [x, y] = toXY(size, p);
  const w = Math.min(2 * r + 1, size);
  const x0 = Math.max(0, Math.min(x - r, size - w));
  const y0 = Math.max(0, Math.min(y - r, size - w));
  return [x0, y0, x0 + w - 1, y0 + w - 1];
}

/** 이번 차례의 도와줘 계획(한 차례에 한 번 만들어 1~3단계가 같은 수를 가리키게). 놓을 곳이 없으면 null */
export function planHint(g: Game, rand?: () => number): HintPlan | null {
  const c = chooseMove(g, rand ? { level: 3, rand } : { level: 3 });
  if (c.point == null) return null;
  const p = c.point;
  const me = g.toMove;
  const opp = opponent(me);
  const stones: number[] = [];
  if (c.reason === 'capture' || c.reason === 'win') {
    const r = g.check(p);
    if (r.ok) stones.push(...r.captured);
  } else if (c.reason === 'escape' || c.reason === 'atari') {
    const mine = c.reason === 'escape' ? ataris(g, me) : [];
    const r = g.play(p);
    if (r.ok) {
      if (c.reason === 'escape') {
        // 이 수로 숨구멍이 둘 이상이 되는 내 단수 무리(두기 전의 돌만 — 답이 될 돌은 동그라미 치지 않음)
        for (const grp of mine) if (g.at(grp[0]) === me && g.group(grp[0]).liberties.length >= 2) stones.push(...grp);
      } else {
        const seen = new Set<number>();
        for (const q of g.geo.neighbors[p]) {
          if (g.at(q) !== opp || seen.has(q)) continue;
          const grp = g.group(q);
          grp.stones.forEach((s) => seen.add(s));
          if (grp.liberties.length === 1) stones.push(...grp.stones);
        }
      }
      g.undo();
    }
  }
  return { point: p, reason: c.reason, stones, zone: stones.length ? null : zoneAround(g.size, p) };
}

/** 1단계: 무엇을 찾을지(강의 말 그대로: 구석(귀)·끝줄(변)) */
const LOOK: Record<MoveReason, string> = {
  win: '잡을 수 있는 하양이 돌이 있어요! 숨구멍이 하나 남은 하양이 돌을 찾아봐요',
  capture: '잡을 수 있는 하양이 돌이 있어요! 숨구멍이 하나 남은 하양이 돌을 찾아봐요',
  escape: '까망이 돌이 위험해요! 숨구멍이 하나 남은 까망이 돌을 찾아봐요',
  atari: '하양이 돌을 숨구멍 하나(단수)로 몰 수 있어요. 숨구멍이 두 개인 하양이 돌을 찾아봐요',
  joseki: '구석에서 많이 두는 좋은 순서(정석)가 있어요. 구석을 잘 봐요',
  corner: '아직 아무도 없는 빈 구석(귀)이 있어요. 구석부터 차지해요',
  approach: '하양이 혼자 구석을 다 갖지 못하게 다가가 봐요(걸침)',
  enclose: '내 구석을 한 번 더 지켜 볼까요(굳힘)?',
  answer: '하양이가 내 구석에 다가왔어요. 구석을 지켜요',
  side: '구석을 다 차지했으면 이제 끝줄(변) 쪽으로 넓혀요',
  territory: '아직 누구 집도 아닌 넓은 곳을 찾아봐요',
  connect: '떨어진 까망이 돌을 이어 주면 튼튼해져요',
  shape: '다른 돌 가까이에 놓아 볼까요?',
  pass: '놓을 곳이 없어요',
};

/** 3단계: 정확한 자리(점선 동그라미 = '여기')와 까닭 */
const SPOT: Record<MoveReason, string> = {
  win: '여기에 놓으면 하양이를 잡아서 이겨요!',
  capture: '여기에 놓으면 하양이를 잡을 수 있어요!',
  escape: '까망이가 위험해요! 여기로 도망가요',
  atari: '여기에 놓으면 하양이의 숨구멍(활로)이 하나만 남아요',
  joseki: '여기가 바둑에서 많이 두는 좋은 순서(정석)예요. 이렇게 두면 서로 튼튼해요',
  corner: '구석(귀)은 집 짓기가 가장 쉬워요. 여기 빈 구석부터 차지해요',
  approach: '여기로 하양이 구석에 다가가요(걸침). 하양이 혼자 구석을 다 갖지 못하게요',
  enclose: '여기에 두어 내 구석을 한 번 더 지켜요(굳힘). 그러면 구석이 튼튼한 내 집이 돼요',
  answer: '하양이가 내 구석에 다가왔어요. 여기에 두어 구석을 지키면서 받아요',
  side: '구석을 다 차지했으면 여기처럼 끝줄(변) 쪽으로 넓혀요',
  territory: '아직 누구 집도 아닌 넓은 곳이에요. 여기에 놓아 내 집을 넓혀요',
  connect: '여기에 놓아 친구 돌 옆에 붙이면 튼튼해져요',
  shape: '여기, 다른 돌 가까이에 놓아 볼까요?',
  pass: '놓을 곳이 없어요',
};

export function hintText(plan: HintPlan, step: HintStep): string {
  if (step <= 1) {
    // 하양이 AI는 내 울타리 안 침입자를 쫓는 수도 'atari'로 부른다(단수가 안 될 수도 있음)
    if (plan.reason === 'atari' && !plan.stones.length) return '내 울타리 안에 들어온 하양이 돌을 쫓아 봐요';
    return LOOK[plan.reason];
  }
  if (step === 2) {
    if (!plan.stones.length) return '반짝이는 네모 안 어딘가에 두면 좋아요';
    if (plan.reason === 'escape') return '동그라미 친 까망이 돌이 위험해요. 어느 쪽으로 도망갈까요?';
    if (plan.reason === 'atari') return '동그라미 친 하양이 돌의 숨구멍을 세어 봐요. 하나만 남게 하려면 어디에 둘까요?';
    return '동그라미 친 하양이 돌을 봐요. 마지막 숨구멍이 어디일까요?';
  }
  return SPOT[plan.reason];
}
