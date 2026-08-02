// 절차 생성 칩튠 BGM — 룩어헤드 스케줄러 + 패턴 시퀀서 (외부 에셋 없음).
// 테마별 곡 8종. 마음에 안 차면 M5에서 커미션/교체 (PLAN 2장).
import { getAudioContext, isMuted } from './Sfx';

interface Song {
  tempo: number;
  /** 루트 미디 노트 */
  root: number;
  /** 마디(16스텝)별 코드 루트 오프셋 */
  prog: number[];
  /** 16스텝 베이스 패턴 (스케일 오프셋, null=쉼) */
  bass: (number | null)[];
  /** 16스텝 리드 패턴 ×2마디 교대 */
  leadA: (number | null)[];
  leadB: (number | null)[];
  /** 드럼: k=킥 s=스네어 h=햇 .=쉼 (16스텝) */
  drums: string;
  leadVol: number;
  swing?: number;
}

const R = null;
const SONGS: Record<string, Song> = {
  title: {
    tempo: 84,
    root: 45,
    prog: [0, -4, -7, -2],
    bass: [0, R, R, R, 0, R, R, R, 7, R, R, R, 5, R, R, R],
    leadA: [12, R, 15, R, 19, R, 15, R, 12, R, R, R, 10, R, 12, R],
    leadB: [7, R, 10, R, 12, R, 15, R, 19, R, 15, R, 12, R, 10, R],
    drums: '................',
    leadVol: 0.05,
  },
  nebula: {
    tempo: 104,
    root: 45,
    prog: [0, 3, -2, -4],
    bass: [0, R, 0, R, 7, R, 0, R, 0, R, 0, R, 10, R, 7, R],
    leadA: [12, R, 15, 17, R, 19, R, 17, 15, R, 12, R, 15, R, R, R],
    leadB: [19, R, 17, 15, R, 12, R, 15, 17, R, 19, R, 22, R, 19, R],
    drums: 'k.h.s.h.k.h.s.hh',
    leadVol: 0.045,
  },
  protostar: {
    tempo: 116,
    root: 43,
    prog: [0, 0, -4, -2],
    bass: [0, 0, R, 0, R, 0, 7, R, 0, 0, R, 0, R, 10, 7, R],
    leadA: [12, R, 12, 15, R, 17, R, 12, 19, R, 17, R, 15, 12, R, R],
    leadB: [15, R, 15, 17, R, 19, R, 22, 19, R, 17, 15, R, 12, R, R],
    drums: 'k.hhs.h.k.hhs.hh',
    leadVol: 0.05,
  },
  mainseq: {
    tempo: 122,
    root: 48,
    prog: [0, 5, -3, -1],
    bass: [0, R, 7, R, 0, R, 7, R, 0, R, 7, R, 12, R, 7, R],
    leadA: [12, 16, 19, R, 16, R, 12, R, 14, 17, 21, R, 17, R, 14, R],
    leadB: [19, R, 16, 12, R, 16, 19, 24, 21, R, 17, 14, R, 17, 21, R],
    drums: 'k.h.s.hhk.h.s.h.',
    leadVol: 0.05,
  },
  redgiant: {
    tempo: 96,
    root: 41,
    prog: [0, 0, -2, -4],
    bass: [0, R, 0, 3, R, 0, R, 0, 0, R, 0, 3, R, 5, 3, R],
    leadA: [12, R, R, 10, R, 8, R, R, 12, R, 15, R, 12, R, 10, R],
    leadB: [8, R, R, 10, R, 12, R, R, 15, R, 12, R, 10, R, 8, R],
    drums: 'k..hs..hk.k.s..h',
    leadVol: 0.045,
  },
  supernova: {
    tempo: 144,
    root: 45,
    prog: [0, -1, -4, -5],
    bass: [0, 0, 0, R, 0, 0, 7, R, 0, 0, 0, R, 10, 10, 7, R],
    leadA: [12, 15, R, 12, 17, R, 15, 12, 19, R, 17, 15, R, 12, 15, R],
    leadB: [24, R, 22, 19, R, 17, 19, 22, 19, 17, R, 15, 17, R, 12, R],
    drums: 'k.hhsh.hkkhhs.hh',
    leadVol: 0.055,
  },
  blackhole: {
    tempo: 88,
    root: 40,
    prog: [0, 0, 1, -1],
    bass: [0, R, R, R, 6, R, R, R, 0, R, R, R, 1, R, R, R],
    leadA: [12, R, R, R, R, 13, R, R, 18, R, R, R, R, R, 12, R],
    leadB: [R, R, 13, R, R, R, 12, R, R, 6, R, R, 13, R, R, R],
    drums: 'k.......k..k....',
    leadVol: 0.04,
  },
  boss: {
    tempo: 134,
    root: 43,
    prog: [0, 0, -1, -1],
    bass: [0, 0, R, 0, 0, R, 6, R, 0, 0, R, 0, 0, R, 8, 6],
    leadA: [12, R, 11, 12, R, 15, R, 12, 18, R, 17, 18, R, 15, R, 12],
    leadB: [15, R, 14, 15, R, 18, R, 15, 20, R, 18, 17, R, 15, 14, R],
    drums: 'kkh.s.hhkkh.s.hh',
    leadVol: 0.055,
  },
};

const midiHz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

let current: string | null = null;
let timer: number | null = null;
let step = 0;
let nextTime = 0;
let noiseBuf: AudioBuffer | null = null;
let musicVol = 1;

// 히든 탭에서는 타이머 스로틀로 음이 뚝뚝 끊기므로 스케줄을 멈춘다
let visInstalled = false;
function installVisibilityGuard(): void {
  if (visInstalled) return;
  visInstalled = true;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    } else if (current && timer === null && tickRef) {
      nextTime = 0;
      timer = window.setInterval(tickRef, 100);
    }
  });
}
let tickRef: (() => void) | null = null;

function noise(ctx: AudioContext): AudioBuffer {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate / 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

function tone(
  ctx: AudioContext,
  type: OscillatorType,
  freq: number,
  t: number,
  dur: number,
  vol: number,
): void {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol * musicVol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function drum(ctx: AudioContext, ch: string, t: number): void {
  if (ch === 'k') {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    g.gain.setValueAtTime(0.12 * musicVol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.16);
  } else {
    const src = ctx.createBufferSource();
    src.buffer = noise(ctx);
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = ch === 's' ? 1400 : 6000;
    const g = ctx.createGain();
    const vol = (ch === 's' ? 0.06 : 0.028) * musicVol;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (ch === 's' ? 0.12 : 0.04));
    src.connect(f).connect(g).connect(ctx.destination);
    src.start(t);
    src.stop(t + 0.15);
  }
}

function scheduleStep(ctx: AudioContext, song: Song, s: number, t: number, stepDur: number): void {
  const bar = Math.floor(s / 16) % song.prog.length;
  const chord = song.prog[bar] ?? 0;
  const i = s % 16;
  const b = song.bass[i];
  if (b !== null && b !== undefined)
    tone(ctx, 'triangle', midiHz(song.root + chord + b), t, stepDur * 0.9, 0.075);
  const lead = Math.floor(s / 16) % 2 === 0 ? song.leadA : song.leadB;
  const L = lead[i];
  if (L !== null && L !== undefined)
    tone(ctx, 'square', midiHz(song.root + chord + L + 12), t, stepDur * 0.85, song.leadVol);
  const d = song.drums[i] ?? '.';
  if (d !== '.') drum(ctx, d, t);
}

/** 현재 곡과 다를 때만 전환. audioResume 이후(제스처 뒤)에 실제 소리가 난다. */
export function playMusic(key: string): void {
  if (current === key) return;
  stopMusic();
  const song = SONGS[key];
  if (!song) return;
  current = key;
  step = 0;
  installVisibilityGuard();
  const tick = (): void => {
    const ctx = getAudioContext();
    if (!ctx || ctx.state !== 'running' || isMuted()) return;
    const stepDur = 60 / song.tempo / 4; // 16분음표
    if (nextTime < ctx.currentTime) nextTime = ctx.currentTime + 0.05;
    while (nextTime < ctx.currentTime + 0.3) {
      scheduleStep(ctx, song, step, nextTime, stepDur);
      step++;
      nextTime += stepDur;
    }
  };
  nextTime = 0;
  tickRef = tick;
  if (!document.hidden) {
    timer = window.setInterval(tick, 100);
    tick();
  }
}

export function stopMusic(): void {
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
  current = null;
  tickRef = null;
}

export function currentMusic(): string | null {
  return current;
}

export function setMusicVolume(v: number): void {
  musicVol = v;
}
