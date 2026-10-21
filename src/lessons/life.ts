// 작은 사활 풀이 — 둘러싸인 빈 곳(region) 안에서만 서로 두어 보고, 지키는 쪽 무리가 살 수 있는지 끝까지 따진다.
// 바깥 벽은 잡히지 않는다고 본다(문제를 그렇게 만든다). 합법 판단은 규칙 엔진(play/undo)에만 맡긴다.
// 빈 곳이 5칸 안팎이라 경우의 수가 아주 적어서, 기억해 두며(memo) 모두 따져 볼 수 있다.
import { EMPTY, Game, type Stone } from '../engine/rules';

/**
 * 지금 차례부터 서로 region 안에서만(또는 넘기기) 둘 때, target 무리가 끝까지 살아남는가.
 * 지키는 쪽 = target 돌의 색. 공격하는 쪽이 잡을 수 있으면 false.
 * 둘 다 연달아 넘기면 '못 잡았다' = 산 것. 수가 maxDepth를 넘으면 산 것으로 본다(패처럼 끝없는 모양 대비).
 */
export function lives(game: Game, target: number, region: number[], maxDepth = 30): boolean {
  const color = game.at(target);
  if (color === EMPTY) return false;
  const defender = color as Stone;
  const memo = new Map<string, boolean>();
  const key = (passes: number, depth: number) =>
    region.map((p) => game.at(p)).join('') + game.toMove + passes + ':' + depth;

  const search = (passes: number, depth: number): boolean => {
    if (game.at(target) !== defender) return false; // 잡혔다
    if (passes >= 2 || depth >= maxDepth) return true;
    const k = key(passes, depth);
    const hit = memo.get(k);
    if (hit !== undefined) return hit;
    const mine = game.toMove === defender;
    let result = !mine; // 지키는 쪽: 하나라도 살면 true / 공격하는 쪽: 모두 살아야 true
    // 넘기기
    game.pass();
    const viaPass = search(passes + 1, depth + 1);
    game.undo();
    if (mine ? viaPass : !viaPass) result = mine;
    else {
      for (const p of region) {
        if (game.at(p) !== EMPTY) continue;
        const r = game.play(p);
        if (!r.ok) continue;
        const v = search(0, depth + 1);
        game.undo();
        if (mine && v) {
          result = true;
          break;
        }
        if (!mine && !v) {
          result = false;
          break;
        }
      }
    }
    memo.set(k, result);
    return result;
  };
  return search(0, 0);
}

/** 지금 차례가 region 안에 두어 '목표'를 이루는 첫 수들. goal 'live' = 내 무리가 살게, 'kill' = 상대 무리가 죽게 */
export function vitalPoints(game: Game, target: number, region: number[], goal: 'live' | 'kill'): number[] {
  const out: number[] = [];
  for (const p of region) {
    if (game.at(p) !== EMPTY) continue;
    const r = game.play(p);
    if (!r.ok) continue;
    const alive = lives(game, target, region);
    game.undo();
    if (goal === 'live' ? alive : !alive) out.push(p);
  }
  return out;
}
