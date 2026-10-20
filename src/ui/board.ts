// 바둑판 SVG 그리기 — 결이 있는 비자나무 판, 무광 흑돌, 조개 느낌 백돌
import { BLACK, EMPTY, WHITE, type Game, toXY } from '../engine/rules';

export interface BoardView {
  preview?: number | null;
  previewColor?: number;
  lastMove?: number | null;
  hint?: number | null;
  /** 교차점별 소유 표시(계가) */
  owner?: Uint8Array | null;
  /** 반짝이는 점선 동그라미(강의 안내) */
  rings?: number[];
  /** 찾은 점(초록 동그라미) */
  goods?: number[];
  /** '아니에요' 표시(엑스) */
  crosses?: number[];
  /** 방금 틀리게 누른 점 */
  miss?: number | null;
  /** 죽은 돌(계가에서 들어낼 돌): 흐리게 + 엑스 표시 */
  dead?: number[];
}

const VB = 400;
const M = 28;

export function step(size: number): number {
  return (VB - 2 * M) / (size - 1);
}

export function coord(size: number, i: number): number {
  return M + step(size) * i;
}

function starPoints(size: number): [number, number][] {
  if (size === 5) return [[2, 2]];
  if (size === 7) return [[2, 2], [4, 2], [3, 3], [2, 4], [4, 4]];
  if (size === 9) return [[2, 2], [6, 2], [4, 4], [2, 6], [6, 6]];
  if (size === 13) return [[3, 3], [9, 3], [6, 6], [3, 9], [9, 9]];
  if (size === 19) {
    const s = [3, 9, 15];
    return s.flatMap((x) => s.map((y) => [x, y] as [number, number]));
  }
  return [];
}

export function renderBoard(game: Game, view: BoardView = {}): string {
  const size = game.size;
  const st = step(size);
  const r = st * 0.477;
  const c = (i: number) => coord(size, i).toFixed(1);
  let lines = '';
  for (let i = 0; i < size; i++) {
    lines += `M${M} ${c(i)}H${VB - M} M${c(i)} ${M}V${VB - M} `;
  }
  const stars = starPoints(size)
    .map(([x, y]) => `<circle cx="${c(x)}" cy="${c(y)}" r="3.6" fill="#3B2A12"/>`)
    .join('');

  let terr = '';
  if (view.owner) {
    for (let p = 0; p < game.geo.n; p++) {
      if ((game.at(p) !== EMPTY && !(view.dead ?? []).includes(p)) || !view.owner[p]) continue;
      const [x, y] = toXY(size, p);
      const fill = view.owner[p] === BLACK ? '#1b1916' : '#f7f3ea';
      const stroke = view.owner[p] === BLACK ? 'none' : '#8a7a5c';
      const h = Math.max(6, st * 0.14); // 판이 작을수록 네모도 크게
      terr += `<rect x="${(coord(size, x) - h).toFixed(1)}" y="${(coord(size, y) - h).toFixed(1)}" width="${(2 * h).toFixed(1)}" height="${(2 * h).toFixed(1)}" rx="2" fill="${fill}" stroke="${stroke}" opacity="0.85"/>`;
    }
  }

  let stones = '';
  const dead = new Set(view.dead ?? []);
  for (let p = 0; p < game.geo.n; p++) {
    const v = game.at(p);
    if (v === EMPTY) continue;
    const [x, y] = toXY(size, p);
    const cx = coord(size, x);
    const cy = coord(size, y);
    if (dead.has(p)) {
      // 죽은 돌: 그림자 없이 흐리게, 위에 엑스
      const d = r * 0.45;
      stones += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="url(#${v === BLACK ? 'gb' : 'gw'})" opacity="0.38"/>`;
      stones += `<path d="M${(cx - d).toFixed(1)} ${(cy - d).toFixed(1)}l${(2 * d).toFixed(1)} ${(2 * d).toFixed(1)}M${(cx + d).toFixed(1)} ${(cy - d).toFixed(1)}l${(-2 * d).toFixed(1)} ${(2 * d).toFixed(1)}" stroke="#B83E57" stroke-width="3" stroke-linecap="round"/>`;
      continue;
    }
    stones += `<circle cx="${(cx + 1.6).toFixed(1)}" cy="${(cy + 2.4).toFixed(1)}" r="${(r - 0.5).toFixed(1)}" fill="#000" opacity="0.28" filter="url(#soft)"/>`;
    stones += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="url(#${v === BLACK ? 'gb' : 'gw'})"/>`;
  }

  let marks = '';
  if (view.lastMove != null && game.at(view.lastMove) !== EMPTY) {
    const [x, y] = toXY(size, view.lastMove);
    const col = game.at(view.lastMove) === WHITE ? 'var(--accent)' : '#F7E3DE';
    marks += `<circle cx="${c(x)}" cy="${c(y)}" r="${(r * 0.34).toFixed(1)}" fill="none" stroke="${col}" stroke-width="3"/>`;
  }
  if (view.hint != null) {
    const [x, y] = toXY(size, view.hint);
    marks += `<circle class="hint-ring" cx="${c(x)}" cy="${c(y)}" r="${(r * 0.8).toFixed(1)}" fill="none" stroke="var(--accent)" stroke-width="3" stroke-dasharray="6 5"/>`;
  }
  for (const p of view.rings ?? []) {
    const [x, y] = toXY(size, p);
    marks += `<circle class="hint-ring" cx="${c(x)}" cy="${c(y)}" r="${(r * 0.72).toFixed(1)}" fill="var(--accent)" fill-opacity="0.12" stroke="var(--accent)" stroke-width="3" stroke-dasharray="6 5"/>`;
  }
  for (const p of view.goods ?? []) {
    const [x, y] = toXY(size, p);
    marks += `<circle cx="${c(x)}" cy="${c(y)}" r="${(r * 0.55).toFixed(1)}" fill="#3FAE7E" stroke="#fff" stroke-width="3"/>`;
    marks += `<path d="M${(+c(x) - 6).toFixed(1)} ${c(y)}l4 5 8-9" stroke="#fff" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  for (const p of view.crosses ?? []) {
    const [x, y] = toXY(size, p);
    const d = r * 0.42;
    marks += `<path d="M${(+c(x) - d).toFixed(1)} ${(+c(y) - d).toFixed(1)}l${(2 * d).toFixed(1)} ${(2 * d).toFixed(1)}M${(+c(x) + d).toFixed(1)} ${(+c(y) - d).toFixed(1)}l${(-2 * d).toFixed(1)} ${(2 * d).toFixed(1)}" stroke="#B83E57" stroke-width="4" stroke-linecap="round"/>`;
  }
  if (view.miss != null) {
    const [x, y] = toXY(size, view.miss);
    marks += `<circle class="miss" cx="${c(x)}" cy="${c(y)}" r="${(r * 0.6).toFixed(1)}" fill="none" stroke="#B83E57" stroke-width="3"/>`;
  }
  if (view.preview != null) {
    const [x, y] = toXY(size, view.preview);
    marks += `<path d="M${c(x)} ${M}V${VB - M} M${M} ${c(y)}H${VB - M}" stroke="var(--accent)" stroke-width="2" opacity="0.45"/>`;
    marks += `<circle cx="${c(x)}" cy="${c(y)}" r="${r.toFixed(1)}" fill="url(#${view.previewColor === WHITE ? 'gw' : 'gb'})" opacity="0.55"/>`;
    marks += `<circle cx="${c(x)}" cy="${c(y)}" r="${(r + 2).toFixed(1)}" fill="none" stroke="var(--accent)" stroke-width="2.5"/>`;
  }

  return `<svg class="board-svg" viewBox="0 0 ${VB} ${VB}" role="img" aria-label="${size}줄 바둑판">
<defs>
<linearGradient id="wood" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E9C27E"/><stop offset="0.5" stop-color="#DCA960"/><stop offset="1" stop-color="#E4B66F"/></linearGradient>
<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.01 0.28" numOctaves="3" seed="7"/><feColorMatrix type="matrix" values="0 0 0 0 0.42  0 0 0 0 0.25  0 0 0 0 0.09  1.1 0 0 0 -0.35"/></filter>
<radialGradient id="gb" cx="36%" cy="30%" r="72%"><stop offset="0" stop-color="#6E6E6E"/><stop offset="0.28" stop-color="#2A2A2A"/><stop offset="1" stop-color="#060606"/></radialGradient>
<radialGradient id="gw" cx="36%" cy="30%" r="74%"><stop offset="0" stop-color="#FFFFFF"/><stop offset="0.6" stop-color="#EEEAE1"/><stop offset="1" stop-color="#BDB4A4"/></radialGradient>
<filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2"/></filter>
</defs>
<rect width="${VB}" height="${VB}" fill="url(#wood)"/>
<rect width="${VB}" height="${VB}" filter="url(#grain)" opacity="0.6"/>
<path d="${lines}" stroke="#3B2A12" stroke-width="1.2" opacity="0.85" fill="none"/>
<rect x="${M}" y="${M}" width="${VB - 2 * M}" height="${VB - 2 * M}" fill="none" stroke="#3B2A12" stroke-width="2.2" opacity="0.9"/>
${stars}${terr}${stones}${marks}
</svg>`;
}

/** 화면 터치 위치 → 가장 가까운 교차점 (너무 멀면 null) */
export function pointFromEvent(svg: SVGSVGElement, size: number, clientX: number, clientY: number): number | null {
  const rect = svg.getBoundingClientRect();
  const scale = VB / rect.width;
  const vx = (clientX - rect.left) * scale;
  const vy = (clientY - rect.top) * scale;
  const st = step(size);
  const x = Math.round((vx - M) / st);
  const y = Math.round((vy - M) / st);
  if (x < 0 || y < 0 || x >= size || y >= size) return null;
  const dx = vx - coord(size, x);
  const dy = vy - coord(size, y);
  if (Math.hypot(dx, dy) > st * 0.62) return null;
  return y * size + x;
}
