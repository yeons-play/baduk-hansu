// 기초 강의 데이터 — 7살 기준. 쉬운 말 먼저, 바둑 용어는 괄호로.
// 정답(숨구멍 위치·개수, 다음 차례)은 직접 적지 않고 규칙 엔진에서 계산한다 → 데이터와 규칙이 어긋날 수 없음.
// **굵게** 표시는 화면에서 강조, 읽어 주기에서는 그냥 읽는다. {libs}는 엔진이 센 숨구멍 수로 바뀐다.

export type XY = [number, number];

export interface Setup {
  b?: XY[];
  w?: XY[];
}

interface Base {
  text: string;
  setup?: Setup;
  /** 점선 동그라미로 강조할 점 */
  rings?: XY[];
  /** '숨구멍 아님' 표시 */
  crosses?: XY[];
  /** {libs} 계산 대상 돌, 그리고 '숨구멍 보여주기'를 켜면 그 숨구멍에 동그라미 */
  libsOf?: XY;
  showLibs?: boolean;
  /** choice의 answer: 'legal'에서 '흑돌이 여기에 놓을 수 있나'를 엔진으로 물어볼 점(동그라미로도 표시) */
  probe?: XY;
}

/**
 * move 단계에서 맞는 수의 조건 — 정답 점은 엔진이 판 전체를 시험해 찾는다.
 *  capture: 백돌이 돌을 잡는 수
 *  atari: 둔 뒤 옆의 백돌이 돌이 숨구멍 하나(단수)가 되는 수
 *  escape: 둔 뒤 libsOf 흑돌 무리의 숨구멍이 2개 이상이 되는 수(늘기·잡기 모두)
 */
export type MoveGoal = 'capture' | 'atari' | 'escape';

export type Step =
  | (Base & { kind: 'explain' })
  | (Base & {
      kind: 'tap';
      /** 눌러야 하는 점 */
      targets: XY[];
      need: 'one' | 'all';
      /** 누르면 흑돌을 놓아 보여줌 */
      place: boolean;
      done: string;
      wrong: string;
    })
  | (Base & { kind: 'liberties'; libsOf: XY; done: string; wrong: string })
  | (Base & {
      kind: 'choice';
      options: string[];
      /**
       * 정답 번호, 또는 엔진으로 계산:
       * 'libs' = 숨구멍 수 옵션, 'turn' = 다음 차례(0 흑돌이, 1 백돌이),
       * 'legal' = probe 점에 흑돌을 놓을 수 있나(0 놓을 수 있어요, 1 놓을 수 없어요)
       */
      answer: number | 'libs' | 'turn' | 'legal';
      done: string;
      wrong: string;
    })
  /** 흑돌을 직접 놓아 보기 — 놓으면 엔진이 둔 결과(잡힌 돌 들어내기)를 그대로 보여줌 */
  | (Base & { kind: 'move'; goal: MoveGoal; done: string; wrong: string })
  /** 숨구멍이 하나 남은(단수) 백돌이 돌 무리를 모두 찾아 누르기 */
  | (Base & { kind: 'find'; done: string; wrong: string })
  | (Base & { kind: 'free'; rounds: number; done: string });

export interface Lesson {
  id: number;
  title: string;
  /** 쉬운 제목 뒤 괄호 속 바둑 용어 */
  term: string;
  goal: string;
  steps: Step[];
}

export const STARS: XY[] = [
  [2, 2],
  [6, 2],
  [4, 4],
  [2, 6],
  [6, 6],
];

export const LESSONS: Lesson[] = [
  {
    id: 1,
    title: '바둑판과 점',
    term: '교차점',
    goal: '돌을 놓는 자리를 알아요',
    steps: [
      {
        kind: 'explain',
        text: '바둑판에는 **가로줄**과 **세로줄**이 9개씩 있어요.',
      },
      {
        kind: 'explain',
        text: '줄과 줄이 만나는 곳을 **점(교차점)**이라고 해요. 바둑돌은 칸 안이 아니라 **점 위에** 놓아요.',
        rings: [
          [1, 1],
          [3, 5],
          [7, 3],
        ],
      },
      {
        kind: 'tap',
        text: '반짝이는 **가운데 점(천원)**에 흑돌을 놓아 보세요!',
        rings: [[4, 4]],
        targets: [[4, 4]],
        need: 'one',
        place: true,
        done: '잘했어요! 바둑판 한가운데 점을 **천원**이라고 해요.',
        wrong: '반짝이는 점을 눌러요',
      },
      {
        kind: 'explain',
        text: '바둑판에 있는 까만 콩 같은 점 5개는 **별점(화점)**이에요.',
        rings: STARS,
      },
      {
        kind: 'tap',
        text: '남은 **별점(화점) 4곳**에 모두 흑돌을 놓아 보세요!',
        setup: { b: [[4, 4]] },
        targets: [
          [2, 2],
          [6, 2],
          [2, 6],
          [6, 6],
        ],
        need: 'all',
        place: true,
        done: '와, 별점을 다 찾았어요!',
        wrong: '까만 콩 같은 점을 찾아요',
      },
      {
        kind: 'choice',
        text: '바둑돌은 어디에 놓을까요?',
        options: ['칸 안에', '줄이 만나는 점 위에'],
        answer: 1,
        done: '맞아요! 돌은 언제나 **점(교차점) 위에** 놓아요.',
        wrong: '다시 생각해 봐요. 줄과 줄이 만나는 곳이었죠?',
      },
    ],
  },
  {
    id: 2,
    title: '번갈아 놓기',
    term: '착수',
    goal: '누가 먼저, 어떻게 놓는지 알아요',
    steps: [
      {
        kind: 'explain',
        text: '바둑은 **흑돌이(흑)**가 먼저 놓아요. 이걸 **흑 먼저(흑선)**라고 해요.',
      },
      {
        kind: 'explain',
        text: '한 번에 **돌 하나씩**, 흑돌이 → 백돌이 → 흑돌이… **번갈아** 놓아요. 돌을 놓는 걸 **돌 놓기(착수)**라고 해요.',
        setup: { b: [[2, 2]], w: [[6, 6]] },
      },
      {
        kind: 'free',
        text: '아무 점에나 흑돌을 놓아 보세요. 그다음엔 백돌이가 놓을 거예요. **세 번** 해 봐요!',
        rounds: 3,
        done: '잘했어요! 이렇게 한 번씩 번갈아 놓아요.',
      },
      {
        kind: 'choice',
        text: '흑돌이 **2개**, 백돌이 **1개**가 놓여 있어요. 다음은 누구 차례일까요?',
        setup: {
          b: [
            [2, 2],
            [6, 6],
          ],
          w: [[6, 2]],
        },
        options: ['흑돌이', '백돌이'],
        answer: 'turn',
        done: '맞아요! 흑돌이가 먼저 하나 더 놓았으니 이번엔 **백돌이 차례**예요.',
        wrong: '흑돌이 → 백돌이 → 흑돌이 순서였어요. 그다음은 누구일까요?',
      },
      {
        kind: 'choice',
        text: '한 번에 돌을 몇 개 놓을까요?',
        options: ['1개', '2개'],
        answer: 0,
        done: '맞아요! 한 번에 **딱 1개**만 놓아요.',
        wrong: '한 번에 하나씩이었어요. 다시 골라 봐요.',
      },
      {
        kind: 'explain',
        text: '놓은 돌은 **움직이지 않아요**. 잡히지 않으면 끝까지 그 자리에 있어요.',
        setup: {
          b: [
            [2, 2],
            [6, 6],
          ],
          w: [[6, 2]],
        },
      },
    ],
  },
  {
    id: 3,
    title: '숨구멍',
    term: '활로',
    goal: '돌이 숨 쉬는 곳을 찾아요',
    steps: [
      {
        kind: 'explain',
        text: '돌 바로 옆 **위·아래·왼쪽·오른쪽** 빈 점은 돌이 숨 쉬는 **숨구멍(활로)**이에요.',
        setup: { b: [[4, 4]] },
        libsOf: [4, 4],
        showLibs: true,
      },
      {
        kind: 'liberties',
        text: '흑돌이의 숨구멍을 **모두** 눌러 보세요!',
        setup: { b: [[4, 4]] },
        libsOf: [4, 4],
        done: '맞아요! 가운데 있는 돌은 숨구멍이 **{libs}개**예요.',
        wrong: '돌 바로 옆, 줄로 이어진 빈 점을 찾아요',
      },
      {
        kind: 'explain',
        text: '비스듬한 **대각선**은 숨구멍이 아니에요. **줄로 이어진 곳**만 숨구멍이에요.',
        setup: { b: [[4, 4]] },
        crosses: [
          [3, 3],
          [5, 3],
          [3, 5],
          [5, 5],
        ],
      },
      {
        kind: 'liberties',
        text: '바둑판 끝줄에 있는 돌이에요. 숨구멍을 모두 찾아요!',
        setup: { b: [[4, 0]] },
        libsOf: [4, 0],
        done: '잘했어요! 끝줄(변)에 있으면 숨구멍이 **{libs}개**예요.',
        wrong: '돌 바로 옆 빈 점을 찾아요. 바둑판 밖은 없어요!',
      },
      {
        kind: 'choice',
        text: '구석(귀)에 있는 돌은 숨구멍이 몇 개일까요?',
        setup: { b: [[0, 0]] },
        libsOf: [0, 0],
        options: ['2개', '3개', '4개'],
        answer: 'libs',
        done: '맞아요! 구석(귀)에 있으면 숨구멍이 **{libs}개**뿐이에요.',
        wrong: '돌 옆 빈 점을 하나씩 세어 봐요',
      },
      {
        kind: 'liberties',
        text: '백돌이가 옆에 붙었어요! 흑돌이의 숨구멍을 찾아요.',
        setup: { b: [[4, 4]], w: [[5, 4]] },
        libsOf: [4, 4],
        done: '맞아요! 백돌이가 붙은 곳은 숨구멍이 아니라서 이제 **{libs}개**예요.',
        wrong: '백돌이가 있는 곳은 숨구멍이 아니에요',
      },
      {
        kind: 'explain',
        text: '흑돌 두 개가 **이어져** 있으면 숨구멍을 **같이** 써요. 모두 **{libs}개**나 돼요!',
        setup: {
          b: [
            [4, 4],
            [5, 4],
          ],
        },
        libsOf: [4, 4],
        showLibs: true,
      },
    ],
  },
  {
    id: 4,
    title: '숨구멍 하나',
    term: '단수',
    goal: '숨구멍이 하나 남은 돌을 알아요',
    steps: [
      {
        kind: 'explain',
        text: '흑돌이가 백돌이 돌을 둘러쌌어요. 백돌이 돌의 숨구멍이 **{libs}개**만 남았어요.',
        setup: { b: [[3, 4], [5, 4], [4, 3]], w: [[4, 4]] },
        libsOf: [4, 4],
        showLibs: true,
      },
      {
        kind: 'explain',
        text: '숨구멍이 하나만 남은 걸 **숨구멍 하나(단수)**라고 해요. 이제 곧 잡힐 수 있어요!',
        setup: { b: [[3, 4], [5, 4], [4, 3]], w: [[4, 4]] },
        libsOf: [4, 4],
        showLibs: true,
      },
      {
        kind: 'choice',
        text: '끝줄에 있는 백돌이 돌이에요. 숨구멍이 몇 개 남았을까요?',
        setup: { b: [[3, 0], [5, 0]], w: [[4, 0]] },
        libsOf: [4, 0],
        options: ['1개', '2개', '3개'],
        answer: 'libs',
        done: '맞아요! 숨구멍이 **{libs}개**뿐이라서 **숨구멍 하나(단수)**예요.',
        wrong: '돌 바로 옆 빈 점을 하나씩 세어 봐요',
      },
      {
        kind: 'find',
        text: '숨구멍이 **하나만** 남은 백돌이 돌을 **모두** 찾아 눌러 보세요!',
        setup: {
          b: [[1, 2], [3, 2], [2, 1], [5, 2], [7, 2], [6, 1], [5, 6]],
          w: [[2, 2], [6, 2], [6, 6]],
        },
        done: '다 찾았어요! 숨구멍이 하나면 **숨구멍 하나(단수)**예요.',
        wrong: '그 돌은 숨구멍이 아직 여러 개예요. 다시 세어 봐요',
      },
      {
        kind: 'move',
        goal: 'atari',
        text: '이번엔 흑돌을 **하나** 놓아서 백돌이 돌을 **숨구멍 하나(단수)**로 만들어 보세요!',
        setup: { b: [[3, 4], [4, 3]], w: [[4, 4]] },
        libsOf: [4, 4],
        showLibs: true,
        done: '잘했어요! 이제 백돌이 돌은 숨구멍이 **하나**뿐이에요.',
        wrong: '백돌이 돌 바로 옆 빈 점에 놓아 봐요',
      },
      {
        kind: 'explain',
        text: '이어진 돌 **두 개**도 숨구멍이 **{libs}개**뿐이면 **숨구멍 하나(단수)**예요.',
        setup: { b: [[3, 4], [4, 3], [5, 3], [4, 5], [5, 5]], w: [[4, 4], [5, 4]] },
        libsOf: [4, 4],
        showLibs: true,
      },
      {
        kind: 'choice',
        text: '숨구멍이 하나만 남은 돌은 어떻게 될까요?',
        options: ['곧 잡힐 수 있어요', '아무 일도 없어요'],
        answer: 0,
        done: '맞아요! 다음 강에서 **돌 잡기(따내기)**를 배워요.',
        wrong: '숨구멍이 하나뿐이면 위험해요. 다시 골라 봐요',
      },
    ],
  },
  {
    id: 5,
    title: '돌 잡기',
    term: '따내기',
    goal: '마지막 숨구멍을 막아 돌을 잡아요',
    steps: [
      {
        kind: 'explain',
        text: '백돌이 돌의 숨구멍이 하나 남았어요. **마지막 숨구멍**을 흑돌로 막으면 그 돌을 **잡아요(따내기)**!',
        setup: { b: [[3, 4], [5, 4], [4, 3]], w: [[4, 4]] },
        libsOf: [4, 4],
        showLibs: true,
      },
      {
        kind: 'move',
        goal: 'capture',
        text: '마지막 숨구멍에 흑돌을 놓아 백돌이 돌을 **잡아** 보세요!',
        setup: { b: [[3, 4], [5, 4], [4, 3]], w: [[4, 4]] },
        done: '와, 잡았어요! 잡은 돌은 바둑판에서 **들어내요**.',
        wrong: '백돌이 돌 옆에 남은 빈 점을 찾아봐요',
      },
      {
        kind: 'move',
        goal: 'capture',
        text: '구석(귀)에 있는 백돌이 돌도 잡아 보세요!',
        setup: { b: [[1, 0]], w: [[0, 0]] },
        done: '잘했어요! 구석 돌은 숨구멍이 적어서 잡기 쉬워요.',
        wrong: '백돌이 돌 바로 옆 빈 점을 찾아봐요',
      },
      {
        kind: 'move',
        goal: 'capture',
        text: '이어진 돌 **두 개**도 숨구멍을 모두 막으면 **한꺼번에** 잡아요. 잡아 보세요!',
        setup: { b: [[3, 4], [4, 3], [5, 3], [4, 5], [5, 5]], w: [[4, 4], [5, 4]] },
        done: '두 개를 한꺼번에 잡았어요!',
        wrong: '두 돌의 숨구멍이 어디 남았는지 찾아봐요',
      },
      {
        kind: 'explain',
        text: '백돌이 돌에 꽉 둘러싸인 빈 점에는 흑돌을 **놓을 수 없어요**. 놓자마자 숨구멍이 없거든요. 이런 곳을 **놓을 수 없는 곳(자살수)**이라고 해요.',
        setup: { w: [[3, 4], [5, 4], [4, 3], [4, 5]] },
        crosses: [[4, 4]],
      },
      {
        kind: 'choice',
        text: '반짝이는 점에 흑돌을 놓을 수 있을까요?',
        setup: { w: [[3, 4], [5, 4], [4, 3], [4, 5]] },
        probe: [4, 4],
        options: ['놓을 수 있어요', '놓을 수 없어요'],
        answer: 'legal',
        done: '맞아요! 숨구멍이 하나도 없는 곳이라 **놓을 수 없어요(자살수)**.',
        wrong: '그 점에 놓으면 흑돌의 숨구멍이 몇 개일지 세어 봐요',
      },
      {
        kind: 'choice',
        text: '이번엔 어떨까요? 아래 백돌이 돌의 숨구멍도 세어 봐요. 반짝이는 점에 놓을 수 있을까요?',
        setup: { b: [[3, 5], [5, 5], [4, 6]], w: [[3, 4], [5, 4], [4, 3], [4, 5]] },
        probe: [4, 4],
        options: ['놓을 수 있어요', '놓을 수 없어요'],
        answer: 'legal',
        done: '맞아요! 놓으면서 아래 백돌이 돌을 **잡으니까** 놓을 수 있어요. 잡는 게 먼저예요!',
        wrong: '아래 백돌이 돌의 숨구멍이 몇 개 남았는지 세어 봐요',
      },
    ],
  },
  {
    id: 6,
    title: '도망가기',
    term: '달아나기',
    goal: '숨구멍 하나 남은 내 돌을 살려요',
    steps: [
      {
        kind: 'explain',
        text: '이번엔 흑돌이 돌이 위험해요! 숨구멍이 **{libs}개**만 남았어요.',
        setup: { b: [[4, 4]], w: [[3, 4], [5, 4], [4, 3]] },
        libsOf: [4, 4],
        showLibs: true,
      },
      {
        kind: 'move',
        goal: 'escape',
        text: '남은 숨구멍 쪽에 흑돌을 하나 더 놓아 **도망가요(달아나기)**!',
        setup: { b: [[4, 4]], w: [[3, 4], [5, 4], [4, 3]] },
        libsOf: [4, 4],
        done: '도망갔어요! 돌이 이어져서 숨구멍이 다시 늘었어요.',
        wrong: '흑돌이 돌 옆에 남은 빈 점으로 이어 놓아요',
      },
      {
        kind: 'liberties',
        text: '도망간 흑돌이 돌의 숨구멍을 **모두** 눌러 보세요!',
        setup: { b: [[4, 4], [4, 5]], w: [[3, 4], [5, 4], [4, 3]] },
        libsOf: [4, 4],
        done: '숨구멍이 **{libs}개**나 돼요. 이제 안전해요!',
        wrong: '이어진 흑돌 옆의 빈 점을 찾아요',
      },
      {
        kind: 'move',
        goal: 'escape',
        text: '살리는 방법은 두 가지예요. **도망가거나**, 막고 있는 **백돌이 돌을 잡거나**! 흑돌이 돌을 살려 보세요.',
        setup: { b: [[4, 4], [3, 3], [5, 3]], w: [[3, 4], [5, 4], [4, 3]] },
        libsOf: [4, 4],
        done: '살렸어요! 위쪽 백돌이 돌도 숨구멍이 하나라서 **잡아서 살리는** 방법도 있어요.',
        wrong: '흑돌이 돌의 숨구멍이 늘어나는 곳을 찾아봐요',
      },
      {
        kind: 'explain',
        text: '그런데 도망가도 백돌이가 계속 막으면, 숨구멍이 늘 **{libs}개**뿐이에요. 이렇게 계단처럼 쫓기다 결국 잡히는 모양을 **계단 쫓기(축)**라고 해요.',
        setup: {
          b: [[3, 3], [3, 4], [4, 4], [4, 5], [5, 5]],
          w: [[3, 2], [2, 3], [4, 3], [2, 4], [5, 4], [3, 5], [6, 5], [4, 6]],
        },
        libsOf: [3, 3],
        showLibs: true,
      },
      {
        kind: 'choice',
        text: '내 돌의 숨구멍이 하나만 남으면 어떻게 할까요?',
        options: ['얼른 도망가거나 잡아요', '그냥 둬요'],
        answer: 0,
        done: '맞아요! 이제 백돌이와 **따내기 바둑**을 할 준비가 됐어요!',
        wrong: '그냥 두면 잡혀요. 다시 골라 봐요',
      },
    ],
  },
];

export const ALL_TITLES: { title: string; term: string }[] = [
  ...LESSONS.map((l) => ({ title: l.title, term: l.term })),
  { title: '이어 주기와 끊기', term: '연결·끊음' },
  { title: '내 땅', term: '집' },
  { title: '두 개의 눈', term: '삶' },
  { title: '되따기 금지', term: '패' },
  { title: '끝내기와 세기', term: '계가' },
  { title: '첫 바둑 한 판', term: '대국' },
];
