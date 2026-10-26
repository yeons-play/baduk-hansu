// 보호자용 기록 요약 시트 — 숫자는 records.ts의 summarize가 세고, 여기서는 보여 주기만 한다.
// 보호자가 읽는 화면이라 아이 말투 대신 짧고 쉬운 어른 말로 쓴다. '승률' 같은 분석 말은 쓰지 않는다.
import { levelLabel } from './levels';
import { PRACTICE } from './lessons/practice';
import type { GroupStat, Summary } from './records';

/** 기간 고르기(0 = 전체) */
export const SUMMARY_RANGES: { days: number; label: string }[] = [
  { days: 7, label: '최근 7일' },
  { days: 30, label: '최근 30일' },
  { days: 0, label: '전체' },
];

const MISSED: [string, string][] = [
  ['missed-capture', '놓친 잡기'],
  ['missed-escape', '놓친 도망'],
  ['self-atari', '스스로 단수'],
  ['own-eye', '내 집 메우기'],
];

/** 문제 놀이 줄 순서와 이름(섞어서 풀기는 문제마다 기술별로 나눠 센다) */
const SKILLS: [string, string][] = [
  ...PRACTICE.filter((p) => p.skill !== 'mix').map((p) => [p.skill, p.title] as [string, string]),
  ['scene', '내가 놓친 장면'],
];

const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : '-');
/** 판마다 평균(소수 한 자리, .0은 뺌) */
const per = (a: number, n: number) => (n ? (a / n).toFixed(1).replace(/\.0$/, '') : '-');

/** 표 첫 칸: 놀이·판 크기, 아래 작은 줄에 (먼저 잡을 돌 수·)하양이 단계 */
function gameName(g: GroupStat): string {
  const name = g.mode === 'normal' ? `진짜 바둑 ${g.size}줄` : `따내기 바둑 ${g.size}줄`;
  const sub = `${g.mode === 'capture' ? `${g.captureTarget}개 먼저 잡기 · ` : ''}하양이 ${levelLabel(g.level)}`;
  return `${name}<small>${sub}</small>`;
}

export function summaryHTML(s: Summary, days: number, lessonsDone: number, lessonsTotal: number): string {
  const chips = SUMMARY_RANGES.map(
    (r) =>
      `<button role="radio" aria-checked="${days === r.days}" class="chip ${days === r.days ? 'on' : ''}" data-action="summary-days" data-days="${r.days}">${r.label}</button>`,
  ).join('');

  const draws = s.groups.some((g) => g.draws > 0);
  const games = s.groups.length
    ? `<table class="score-table sum-table">
      <thead><tr><th></th><th>판</th><th>이김</th><th>짐</th>${draws ? '<th>비김</th>' : ''}<th>이긴 비율</th></tr></thead>
      <tbody>${s.groups
        .map(
          (g) =>
            `<tr><th>${gameName(g)}</th><td>${g.games}</td><td>${g.wins}</td><td>${g.losses}</td>${
              draws ? `<td>${g.draws}</td>` : ''
            }<td><b>${pct(g.wins, g.games)}</b></td></tr>`,
        )
        .join('')}</tbody>
    </table>
    ${
      s.aiResigned || s.quit
        ? `<p class="sheet-p small">${[s.aiResigned ? `이긴 판 가운데 하양이 기권 ${s.aiResigned}판` : '', s.quit ? `진 판 가운데 그만하기 ${s.quit}판` : '']
            .filter(Boolean)
            .join(' · ')}</p>`
        : ''
    }`
    : '<p class="sheet-p small">이 기간에 끝난 판이 없어요.</p>';

  const help = s.help.games
    ? `<p class="sheet-p">판마다 도와줘 <b>${per(s.help.hints, s.help.games)}번</b>, 되돌리기 <b>${per(s.help.undos, s.help.games)}번</b> <span class="sum-note">(센 판 ${s.help.games}판)</span></p>`
    : '<p class="sheet-p small">이번 업데이트부터 세요. 아직 센 판이 없어요.</p>';

  const cell = (label: string, n: number, ok = false) =>
    `<div class="sum-cell ${ok ? 'ok' : ''}"><span>${label}</span><b>${per(n, s.play.games)}</b></div>`;
  const play = s.play.games
    ? `<div class="sum-grid">${cell('잡기', s.play.capture, true)}${cell('도망가기', s.play.escape, true)}${MISSED.map(([k, label]) =>
        cell(label, s.play.missed[k] ?? 0),
      ).join('')}</div>
      <p class="sheet-p small">판마다 평균이에요(센 판 ${s.play.games}판). 놓친 장면은 규칙으로 확실한 것만 세요.</p>`
    : '<p class="sheet-p small">이 기간에 끝난 판이 없어요.</p>';

  const rows = SKILLS.filter(([k]) => s.practice[k]?.[0]);
  const practice = rows.length
    ? `<table class="score-table sum-table">
      <thead><tr><th></th><th>푼 문제</th><th>한 번에 맞힘</th></tr></thead>
      <tbody>${rows
        .map(([k, label]) => {
          const [n, ok] = s.practice[k];
          return `<tr><th>${label}</th><td>${n}</td><td><b>${pct(ok, n)}</b></td></tr>`;
        })
        .join('')}</tbody>
    </table>`
    : '<p class="sheet-p small">이 기간에 푼 문제가 없어요. 문제 기록은 이번 업데이트부터 세요.</p>';

  const lessons = `<p class="sheet-p">지금까지 <b>${lessonsDone} / ${lessonsTotal}강</b>${
    s.lessons.length ? ` · 이 기간에 끝낸 강: ${s.lessons.map((id) => `${id}강`).join(', ')}` : ''
  }</p>`;

  return `<h2>기록 요약</h2>
    <p class="sheet-p small center">보호자용 · 이 기기에 남은 기록으로 세요</p>
    <div class="chips sum-chips" role="radiogroup" aria-label="기간">${chips}</div>
    <p class="sheet-label">대국 (하양이 단계별)</p>
    ${games}
    <p class="sheet-label">도와줘·되돌리기</p>
    ${help}
    <p class="sheet-label">잘한 수와 놓친 장면 (판마다)</p>
    ${play}
    <p class="sheet-label">문제 놀이 (한 번에 맞힌 비율)</p>
    ${practice}
    <p class="sheet-label">강의</p>
    ${lessons}
    <p class="sheet-p small">기록은 이 기기에만 있어요. 기기를 바꿀 때는 ‘기록 백업하기’로 옮겨요.</p>
    <button class="btn primary full big" data-action="close-sheet">닫기</button>`;
}
