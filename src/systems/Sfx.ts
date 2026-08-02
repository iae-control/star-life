// 절차 생성 SFX — 데모의 WebAudio 코드를 그대로 이식 (M5에서 ZzFX/오디오버스로 대체 검토).
let actx: AudioContext | null = null;
let muted = false;

export function audioInit(): void {
  if (actx) return;
  try {
    actx = new AudioContext();
  } catch {
    actx = null;
  }
}

export function audioResume(): void {
  audioInit();
  if (actx && actx.state === 'suspended') void actx.resume();
}

export function toggleMute(): boolean {
  muted = !muted;
  return muted;
}
export function isMuted(): boolean {
  return muted;
}

function env(g: GainNode, t0: number, a: number, d: number, peak: number): void {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
}

function tone(
  type: OscillatorType,
  f0: number,
  f1: number,
  dur: number,
  peak: number,
  delay = 0,
): void {
  if (!actx || muted) return;
  const t0 = actx.currentTime + delay;
  const o = actx.createOscillator();
  const g = actx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t0);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  env(g, t0, 0.005, dur, peak);
  o.connect(g).connect(actx.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

function noiseBurst(dur: number, peak: number, fc0: number, fc1: number, delay = 0): void {
  if (!actx || muted) return;
  const t0 = actx.currentTime + delay;
  const n = Math.floor(actx.sampleRate * dur);
  const buf = actx.createBuffer(1, n, actx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const src = actx.createBufferSource();
  src.buffer = buf;
  const f = actx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(fc0, t0);
  f.frequency.exponentialRampToValueAtTime(fc1, t0 + dur);
  const g = actx.createGain();
  env(g, t0, 0.005, dur, peak);
  src.connect(f).connect(g).connect(actx.destination);
  src.start(t0);
}

export const SFX = {
  shoot: {
    pulse: () => tone('square', 860, 320, 0.07, 0.05),
    vulcan: () => tone('square', 520, 240, 0.045, 0.035),
    proton: () => tone('sine', 340, 140, 0.12, 0.07),
    light: () => {
      noiseBurst(0.06, 0.05, 5000, 1500);
      tone('square', 1400, 700, 0.05, 0.03);
    },
    laser: () => tone('sawtooth', 1500, 500, 0.08, 0.045),
  },
  eshoot: () => tone('square', 300, 180, 0.09, 0.04),
  boom: () => {
    noiseBurst(0.3, 0.2, 1800, 120);
    tone('sine', 120, 38, 0.3, 0.18);
  },
  bigboom: () => {
    noiseBurst(0.6, 0.28, 2200, 80);
    tone('sine', 90, 30, 0.6, 0.22);
  },
  hit: () => {
    tone('square', 190, 90, 0.08, 0.12);
    noiseBurst(0.08, 0.08, 900, 300);
  },
  deny: () => tone('square', 140, 90, 0.12, 0.08),
  pow: () => {
    tone('sine', 520, 1040, 0.1, 0.1);
    tone('sine', 660, 1320, 0.1, 0.1, 0.07);
    tone('sine', 780, 1560, 0.14, 0.1, 0.14);
  },
  buy: () => {
    tone('sine', 700, 1400, 0.08, 0.1);
    tone('sine', 1050, 2100, 0.1, 0.08, 0.06);
  },
  warn: () => tone('sawtooth', 160, 620, 0.5, 0.07),
  superOn: () => {
    tone('sawtooth', 60, 240, 0.8, 0.12);
    noiseBurst(0.8, 0.1, 400, 3200);
  },
  spid: () => {
    noiseBurst(0.5, 0.22, 3600, 500);
    tone('square', 1200, 300, 0.4, 0.08);
  },
};
