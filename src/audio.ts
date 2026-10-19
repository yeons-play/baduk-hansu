// 효과음 — 파일 없이 Web Audio로 직접 합성 (저작권·용량 걱정 없음, 오프라인 동작)
// 아이패드·아이폰은 첫 터치 이후에만 소리가 나므로 unlockAudio()를 첫 터치 때 부른다.
import { loadSettings } from './storage';

export type Sfx = 'stone' | 'capture' | 'correct' | 'wrong' | 'win';

let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;

function ac(): AudioContext | null {
  try {
    if (!ctx) {
      const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!C) return null;
      ctx = new C();
      noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.12), ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

export function unlockAudio(): void {
  const c = ac();
  if (!c) return;
  // 무음 한 번 재생으로 iOS 오디오 잠금 해제
  const g = c.createGain();
  g.gain.value = 0;
  const o = c.createOscillator();
  o.connect(g).connect(c.destination);
  o.start();
  o.stop(c.currentTime + 0.01);
}

export function sfx(name: Sfx): void {
  if (!loadSettings().sound) return;
  const c = ac();
  if (!c) return;
  const t = c.currentTime + 0.005;
  if (name === 'stone') clack(c, t, 1);
  else if (name === 'capture') {
    clack(c, t, 1);
    [0.12, 0.2, 0.28].forEach((dt, i) => tone(c, t + dt, 900 + i * 260, 0.09, 0.12, 'triangle'));
  } else if (name === 'correct') {
    tone(c, t, 880, 0.12, 0.16, 'triangle');
    tone(c, t + 0.11, 1320, 0.2, 0.16, 'triangle');
  } else if (name === 'wrong') {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(330, t);
    o.frequency.exponentialRampToValueAtTime(200, t + 0.18);
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + 0.22);
  } else if (name === 'win') {
    [523, 659, 784, 1047].forEach((f, i) => tone(c, t + i * 0.11, f, 0.25, 0.14, 'triangle'));
  }
}

/** 나무판에 돌이 '딱' 닿는 소리: 짧은 잡음(딱) + 낮은 울림(통) */
function clack(c: AudioContext, t: number, vol: number) {
  if (noise) {
    const src = c.createBufferSource();
    src.buffer = noise;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2400;
    bp.Q.value = 1.4;
    const g = c.createGain();
    g.gain.setValueAtTime(0.9 * vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
    src.connect(bp).connect(g).connect(c.destination);
    src.start(t);
    src.stop(t + 0.06);
  }
  const o = c.createOscillator();
  const g2 = c.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(260, t);
  o.frequency.exponentialRampToValueAtTime(110, t + 0.08);
  g2.gain.setValueAtTime(0.45 * vol, t);
  g2.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
  o.connect(g2).connect(c.destination);
  o.start(t);
  o.stop(t + 0.12);
}

function tone(c: AudioContext, t: number, f: number, dur: number, vol: number, type: OscillatorType) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = f;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}
