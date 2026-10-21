// 연습에서 같은 문제를 두 번 틀리면 보여 줄 '핵심 그림' — 강 전체를 다시 하지 않고 그 강의 요점 한 장만.
// 그림은 엔진으로 검증한다(tests/keys.test.ts): 동그라미 자리가 정말 그 기술의 정답 자리인지.
// 글에서 괄호는 바둑 용어에만 쓴다(화면에서 파란 꼬리표, 읽어 주기에서 '바둑 말로는'이 되므로).
import type { Step } from './data';

export type KeySkill = 'find' | 'capture' | 'escape' | 'live' | 'kill';

export interface KeyCard {
  skill: KeySkill;
  /** 다시 볼 강 */
  lesson: number;
  /** 그림: 'X' 까망이, 'O' 하양이, '.' 빈 곳. 첫 줄이 맨 위 */
  rows: string[];
  /** 동그라미 자리 [가로, 세로] */
  ring: [number, number];
  text: string;
}

const ATARI_W = ['. . . . .', '. . X . .', '. X O X .', '. . . . .', '. . . . .'];

export const KEY_CARDS: Record<KeySkill, KeyCard> = {
  find: {
    skill: 'find',
    lesson: 4,
    rows: ATARI_W,
    ring: [2, 3],
    text: '돌 옆 위·아래·왼쪽·오른쪽 빈 점을 하나씩 세어 봐요. 하나만 남았으면 **숨구멍 하나(단수)**예요. 동그라미 친 곳이 하양이의 마지막 숨구멍이에요.',
  },
  capture: {
    skill: 'capture',
    lesson: 5,
    rows: ATARI_W,
    ring: [2, 3],
    text: '먼저 숨구멍이 하나 남은 하양이 돌을 찾아요. 동그라미 친 마지막 숨구멍을 막으면 하양이 돌을 **잡아요(따내기)**!',
  },
  escape: {
    skill: 'escape',
    lesson: 6,
    rows: ['. . . . .', '. . O . .', '. O X O .', '. . . . .', '. . . . .'],
    ring: [2, 3],
    text: '까망이 숨구멍이 하나 남으면 빈 쪽으로 이어 놓아요. 동그라미 친 곳에 놓으면 숨구멍이 셋으로 늘어나요. 이게 **도망가기(달아나기)**예요.',
  },
  live: {
    skill: 'live',
    lesson: 9,
    rows: ['. . . . .', '. . . . .', 'O O O O O', 'X X X X X', 'X . . . X'],
    ring: [2, 4],
    text: '빈 곳 한가운데, 동그라미 친 곳이 **가장 중요한 자리(급소)**예요. 여기에 두면 빈 곳이 둘로 나뉘어 **두 집(삶)**이 생겨요.',
  },
  kill: {
    skill: 'kill',
    lesson: 9,
    rows: ['. . . . .', '. . . . .', 'X X X X X', 'O O O O O', 'O . . . O'],
    ring: [2, 4],
    text: '하양이 빈 곳 한가운데, 동그라미 친 곳을 까망이가 먼저 차지해요. 그러면 하양이는 빈 곳을 둘로 나누지 못해서 **두 집(삶)**을 못 만들어요.',
  },
};

/** 이 문제에 맞는 핵심 그림(없으면 null) */
export function keyCardFor(step: Step): KeyCard | null {
  if (step.kind === 'find') return KEY_CARDS.find;
  if (step.kind !== 'move') return null;
  if (step.goal === 'capture') return KEY_CARDS.capture;
  if (step.goal === 'escape') return KEY_CARDS.escape;
  if (step.goal === 'live') return KEY_CARDS.live;
  if (step.goal === 'kill') return KEY_CARDS.kill;
  return null;
}
