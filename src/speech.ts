// 읽어 주기 — 기기에 들어 있는 한국어 음성(아이패드: 유나 등) 사용, 인터넷·비용 없음
import { loadSettings } from './storage';

let koVoice: SpeechSynthesisVoice | null | undefined;

function pickVoice(): SpeechSynthesisVoice | null {
  if (koVoice !== undefined && koVoice !== null) return koVoice;
  try {
    const voices = window.speechSynthesis.getVoices();
    koVoice = voices.find((v) => v.lang === 'ko-KR' && /yuna|유나/i.test(v.name)) ?? voices.find((v) => v.lang.startsWith('ko')) ?? null;
  } catch {
    koVoice = null;
  }
  return koVoice;
}

/** 화면 문구에서 읽기용 문장 만들기: 굵게 표시 제거, 괄호 속 바둑 용어는 문장 끝에 "바둑 말로는 ~라고 해요"로 */
export function toSpeech(text: string): string {
  const plain = text.replace(/\*\*/g, '').replace(/<[^>]+>/g, '');
  const terms = [...plain.matchAll(/\(([^)]+)\)/g)].map((m) => m[1]);
  let out = plain.replace(/\(([^)]+)\)/g, '');
  if (terms.length) {
    const last = terms[terms.length - 1];
    out += ` 바둑 말로는 ${terms.join(', ')}${hasFinal(last) ? '이라고' : '라고'} 해요.`;
  }
  return out.replace(/[→↗·…]/g, ' ').replace(/\s+/g, ' ').trim();
}

function hasFinal(word: string): boolean {
  const c = word.charCodeAt(word.length - 1);
  return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0;
}

/** 읽어 주기 빠르기: 느리게는 처음 배우는 아이용 */
const RATE = { slow: 0.75, normal: 0.92 } as const;

export function speak(text: string, force = false): void {
  const st = loadSettings();
  if (!force && !st.voice) return;
  try {
    const s = window.speechSynthesis;
    if (!s) return;
    s.cancel();
    const u = new SpeechSynthesisUtterance(toSpeech(text));
    u.lang = 'ko-KR';
    u.rate = RATE[st.rate] ?? RATE.normal;
    u.pitch = 1.1;
    const v = pickVoice();
    if (v) u.voice = v;
    s.speak(u);
  } catch {
    /* 음성 기능이 없는 기기 */
  }
}

export function stopSpeaking(): void {
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* 무시 */
  }
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  window.speechSynthesis.addEventListener?.('voiceschanged', () => {
    koVoice = undefined;
  });
}
