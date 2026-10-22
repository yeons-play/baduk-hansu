// 캐릭터 이름 바꾸기 — 글은 '까망이·하양이'로 그대로 쓰고, 화면에 그리기 직전·읽어 주기 직전에
// 보호자가 정한 이름으로 바꿔 끼운다. 원래 이름은 받침이 없으므로 뒤의 조사도 받침에 맞춰 바꾼다.
import { loadSettings } from './storage';

export const DEFAULT_NAMES = { black: '까망이', white: '하양이' } as const;
export type Names = { black: string; white: string };

/** 이름 최대 글자 수(아이폰 이름표·제목에 들어가도록) */
export const NAME_MAX = 6;

export function hasFinal(word: string): boolean {
  const c = word.charCodeAt(word.length - 1);
  return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0;
}

/** 입력한 이름 다듬기: 앞뒤 빈칸·특수 기호 빼고 최대 글자 수까지. 비면 '' */
export function cleanName(s: string): string {
  return [...s.replace(/[\u200b-\u200d\u2060\ufeff]/g, '').replace(/[<>&"'`\\/(){}[\]*#]/g, '').replace(/\s+/g, ' ').trim()].slice(0, NAME_MAX).join('').trim();
}

/** '민준'처럼 받침으로 끝나는 이름은 '민준이'로 부르면 문장이 자연스럽다. 붙일 필요 없으면 null */
export function suggestCall(name: string): string | null {
  return name && hasFinal(name) ? `${name}이` : null;
}

export function loadNames(): Names {
  const n = loadSettings().names;
  return {
    black: cleanName(n?.black ?? '') || DEFAULT_NAMES.black,
    white: cleanName(n?.white ?? '') || DEFAULT_NAMES.white,
  };
}

/** 받침 없는 이름 뒤에 쓴 조사 → 이 이름에 맞는 조사 */
function josa(name: string, p: string): string {
  if (!p || !hasFinal(name)) return p;
  return ({ 가: '이', 는: '은', 를: '을', 와: '과', 랑: '이랑', 예요: '이에요' } as Record<string, string>)[p] ?? p;
}

// 이름 + (괄호 속 바둑 말·굵게 표시·바둑 말 꼬리표가 끼어 있어도) + 조사
const NAME_RE =
  /(까망이|하양이)((?:<span class="term">[^<]*<\/span>|<\/?b>|\*\*|\([^()<]{1,12}\))*)(가|는|를|와|랑|예요)?/g;

/** 글 속 '까망이·하양이'를 정한 이름으로 바꾸고 조사를 맞춘다. 기본 이름이면 그대로 */
export function applyNames(text: string, names: Names = loadNames()): string {
  if (names.black === DEFAULT_NAMES.black && names.white === DEFAULT_NAMES.white) return text;
  return text.replace(NAME_RE, (_m, who: string, gap: string, p: string | undefined) => {
    const name = who === DEFAULT_NAMES.black ? names.black : names.white;
    return name + gap + josa(name, p ?? '');
  });
}

/** 이름 바꾸기 화면처럼 이름을 '있는 그대로' 보여 줘야 하는 곳: 눈에 안 보이는 글자를 끼워 바꿔 끼우기를 피한다 */
export function keepName(text: string): string {
  return text.replace(/(까|하)(망이|양이)/g, '$1\u2060$2');
}
