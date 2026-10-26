// 하양이 실력 단계 이름 — 시작 시트·대국 화면·기록 목록·보호자 요약에서 같이 쓴다
import type { Level } from './engine/ai/beginner';

export const LEVELS: Record<Level, { name: string; stars: string }> = {
  1: { name: '쉬워요', stars: '★' },
  2: { name: '보통', stars: '★★' },
  3: { name: '어려워요', stars: '★★★' },
};

/** '★ 쉬워요'처럼 별과 이름. 모르는 단계면 'n단계' */
export function levelLabel(level: number): string {
  const l = LEVELS[level as Level];
  return l ? `${l.stars} ${l.name}` : `${level}단계`;
}
