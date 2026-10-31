// 까망이(흑)·하양이(백) 캐릭터 — 바둑판 위 돌은 깔끔하게 두고, 이름표·결과 화면에만 얼굴을 그린다.
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

/** 보석 한 알(홈·결과 화면). 색은 몇 가지 중 하나 */
export function gemIcon(size: number, hue = 0): string {
  const c = [
    ['#7FD3FF', '#2E8BD8', '#1B5FA8'],
    ['#FF9FB8', '#E8476E', '#A82648'],
    ['#9BF0C8', '#2FB97E', '#1C7A52'],
    ['#E3B8FF', '#9B5BE0', '#6331A3'],
  ][((hue % 4) + 4) % 4];
  return `<svg class="gem" width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true">
<path d="M28 18h44l18 22-40 46-40-46z" fill="${c[1]}"/>
<path d="M28 18l-18 22h80L72 18z" fill="${c[0]}"/>
<path d="M10 40h80L50 86z" fill="${c[2]}" opacity="0.55"/>
<path d="M36 40L50 18l14 22-14 46z" fill="#FFFFFF" opacity="0.28"/>
<path d="M28 18h44l18 22-40 46-40-46z" fill="none" stroke="${c[2]}" stroke-width="3" stroke-linejoin="round"/>
<circle cx="34" cy="28" r="4" fill="#FFFFFF" opacity="0.9"/>
</svg>`;
}

/** 보석이 위에서 떨어지며 쌓이는 움직임(결과 화면) */
export function gemRain(n: number): string {
  const k = Math.min(12, Math.max(3, n));
  return `<div class="gem-rain" aria-hidden="true">${Array.from(
    { length: k },
    (_, i) => `<span style="--x:${((i * 37) % 100) - 50}px;--d:${i * 70}ms">${gemIcon(26, i)}</span>`,
  ).join('')}</div>`;
}
