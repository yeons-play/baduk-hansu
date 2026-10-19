// 흑돌이(흑)·백돌이(백) 캐릭터 — 바둑판 위 돌은 깔끔하게 두고, 이름표·결과 화면에만 얼굴을 그린다.
export type Mood = 'happy' | 'think' | 'wow' | 'oops';

let uid = 0;

export function stoneFace(color: 'black' | 'white', size: number, mood: Mood = 'happy'): string {
  const id = `sf${++uid}`;
  const black = color === 'black';
  const eye = black ? '#FFFFFF' : '#3A2E26';
  const cheek = black ? '#FF8FA3' : '#FFB3B3';
  const grad = black
    ? '<stop offset="0" stop-color="#6E6E6E"/><stop offset="0.35" stop-color="#2A2A2A"/><stop offset="1" stop-color="#0A0A0A"/>'
    : '<stop offset="0" stop-color="#FFFFFF"/><stop offset="0.65" stop-color="#F1EDE4"/><stop offset="1" stop-color="#CFC6B6"/>';
  let eyes = '';
  let mouth = '';
  if (mood === 'think') {
    eyes = `<path d="M36 47q5-4 10 0M54 47q5-4 10 0" stroke="${eye}" stroke-width="3.5" fill="none" stroke-linecap="round"/>`;
    mouth = `<path d="M45 64h10" stroke="${eye}" stroke-width="3.5" stroke-linecap="round"/>`;
  } else if (mood === 'wow') {
    eyes = `<circle cx="41" cy="46" r="5" fill="${eye}"/><circle cx="59" cy="46" r="5" fill="${eye}"/>`;
    mouth = `<ellipse cx="50" cy="64" rx="6" ry="7" fill="${eye}"/>`;
  } else if (mood === 'oops') {
    eyes = `<circle cx="41" cy="47" r="4" fill="${eye}"/><circle cx="59" cy="47" r="4" fill="${eye}"/>`;
    mouth = `<path d="M42 66q8-6 16 0" stroke="${eye}" stroke-width="3.5" fill="none" stroke-linecap="round"/>`;
  } else {
    eyes = `<circle cx="41" cy="46" r="4.5" fill="${eye}"/><circle cx="59" cy="46" r="4.5" fill="${eye}"/><circle cx="42.5" cy="44.5" r="1.4" fill="${black ? '#2A2A2A' : '#FFFFFF'}"/><circle cx="60.5" cy="44.5" r="1.4" fill="${black ? '#2A2A2A' : '#FFFFFF'}"/>`;
    mouth = `<path d="M41 60q9 9 18 0" stroke="${eye}" stroke-width="3.5" fill="none" stroke-linecap="round"/>`;
  }
  return `<svg class="face" width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true">
<defs><radialGradient id="${id}" cx="36%" cy="30%" r="75%">${grad}</radialGradient></defs>
<ellipse cx="52" cy="92" rx="30" ry="5" fill="#000" opacity="0.12"/>
<circle cx="50" cy="50" r="40" fill="url(#${id})" ${black ? '' : 'stroke="#CFC6B6" stroke-width="1.5"'}/>
<ellipse cx="32" cy="58" rx="6" ry="4" fill="${cheek}" opacity="0.8"/><ellipse cx="68" cy="58" rx="6" ry="4" fill="${cheek}" opacity="0.8"/>
${eyes}${mouth}
</svg>`;
}

/** 이겼을 때 터지는 별 */
export function starBurst(): string {
  const stars = Array.from({ length: 14 }, (_, i) => {
    const a = (i / 14) * Math.PI * 2;
    const d = 90 + (i % 3) * 30;
    const colors = ['#FFC93C', '#FF8FA3', '#6CC5B0', '#7FB2F0'];
    return `<span class="star" style="--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d}px;--c:${colors[i % 4]};--d:${(i % 5) * 60}ms"></span>`;
  }).join('');
  return `<div class="burst" aria-hidden="true">${stars}</div>`;
}
