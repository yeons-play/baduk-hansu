import { describe, expect, it } from 'vitest';
import { applyNames, cleanName, keepName, suggestCall } from '../src/names';
import { rich } from '../src/lessons/player';
import { toSpeech } from '../src/speech';

const 민준이 = { black: '민준이', white: '아빠' };
const 민준 = { black: '민준', white: '할머니' };

describe('이름 바꾸기', () => {
  it('기본 이름이면 글을 그대로 둔다', () => {
    const t = '까망이가 하양이를 잡았어요';
    expect(applyNames(t, { black: '까망이', white: '하양이' })).toBe(t);
  });

  it('받침 없는 이름은 조사를 그대로', () => {
    expect(applyNames('까망이가 하양이를 잡았어요. 하양이와 까망이는 친구', 민준이)).toBe(
      '민준이가 아빠를 잡았어요. 아빠와 민준이는 친구',
    );
  });

  it('받침 있는 이름은 조사를 받침에 맞춘다', () => {
    expect(applyNames('까망이가 하양이를 잡았어요', 민준)).toBe('민준이 할머니를 잡았어요');
    expect(applyNames('까망이는 까망이를 까망이와 까망이랑 까망이의 까망이도', 민준)).toBe(
      '민준은 민준을 민준과 민준이랑 민준의 민준도',
    );
    expect(applyNames('하얀 돌은 하양이(백)예요', { black: '까망이', white: '서준' })).toBe('하얀 돌은 서준(백)이에요');
  });

  it('괄호·굵게·바둑 말 꼬리표가 끼어 있어도 조사를 맞춘다', () => {
    expect(applyNames('**까망이(나)**와 **하양이**가', 민준)).toBe('**민준(나)**과 **할머니**가');
    const html = rich('까만 돌은 **까망이(흑)**, 하얀 돌은 **하양이(백)**예요.');
    expect(applyNames(html, { black: '민준', white: '서준' })).toBe(
      '까만 돌은 <b>민준<span class="term">흑</span></b>, 하얀 돌은 <b>서준<span class="term">백</span></b>이에요.',
    );
    expect(applyNames('<b>까망이(나)</b>와 <b>하양이</b>가', 민준)).toBe('<b>민준(나)</b>과 <b>할머니</b>가');
  });

  it('두 이름을 맞바꿔도 한 번만 바꾼다', () => {
    expect(applyNames('까망이가 하양이를', { black: '하양이', white: '까망이' })).toBe('하양이가 까망이를');
  });

  it('조사가 아닌 글자는 건드리지 않는다', () => {
    expect(applyNames('하양이보다 먼저 까망이 차례', 민준)).toBe('할머니보다 먼저 민준 차례');
  });

  it('읽어 주기 문장에도 이름이 들어간다', () => {
    expect(toSpeech(applyNames('까만 돌은 **까망이(흑)**예요', 민준))).toBe('까만 돌은 민준이에요 바둑 말로는 흑이라고 해요.');
  });

  it('이름 다듬기·부르는 이름 추천', () => {
    expect(cleanName('  민준<b>  ')).toBe('민준b');
    expect(cleanName('가나다라마바사')).toBe('가나다라마바');
    expect(cleanName('까⁠망이')).toBe('까망이');
    expect(cleanName('(흑)')).toBe('흑');
    expect(suggestCall('민준')).toBe('민준이');
    expect(suggestCall('지아')).toBeNull();
    expect(suggestCall('')).toBeNull();
  });

  it('keepName으로 감싼 이름은 바뀌지 않는다', () => {
    expect(applyNames(keepName('까망이가'), 민준)).toBe('까⁠망이가');
  });
});
