// 절차 생성 SFX — 데모의 WebAudio 코드를 그대로 이식 (M5에서 ZzFX/오디오버스로 대체 검토).
let actx: AudioContext | null = null;
let muted = false;
let sfxVol = 1;

export function setSfxVolume(v: number): void {
  sfxVol = v;
}

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
  // iOS는 전화/Siri/잠금 후 'interrupted' 같은 비표준 상태가 되므로 running이 아니면 항상 재개 시도
  if (actx && actx.state !== 'running') void actx.resume();
}

/** iOS WebAudio 잠금 해제 — 실제 제스처(touchend/click 등)에서 resume될 때까지 문서 레벨로 시도 */
export function installAudioUnlock(): void {
  const tryUnlock = (): void => {
    audioResume();
    if (actx && actx.state === 'running') {
      for (const evt of EVTS) document.removeEventListener(evt, tryUnlock);
    }
  };
  const EVTS = ['pointerup', 'touchend', 'click', 'keydown'] as const;
  for (const evt of EVTS) document.addEventListener(evt, tryUnlock);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) audioResume();
  });
}

export function toggleMute(): boolean {
  muted = !muted;
  return muted;
}
export function isMuted(): boolean {
  return muted;
}
export function setMuted(next: boolean): void {
  muted = next;
}
/** Music 엔진 등 다른 오디오 모듈이 같은 컨텍스트를 공유한다 */
export function getAudioContext(): AudioContext | null {
  audioInit();
  return actx;
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
  env(g, t0, 0.005, dur, peak * sfxVol);
  o.connect(g).connect(actx.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

let noiseBuf: AudioBuffer | null = null;

function noiseBurst(dur: number, peak: number, fc0: number, fc1: number, delay = 0): void {
  if (!actx || muted) return;
  const t0 = actx.currentTime + delay;
  // 노이즈 버퍼는 1초짜리 하나를 재사용 (호출마다 할당하면 모바일 GC 부담)
  if (!noiseBuf) {
    const n = actx.sampleRate;
    noiseBuf = actx.createBuffer(1, n, actx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = actx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = actx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(fc0, t0);
  f.frequency.exponentialRampToValueAtTime(fc1, t0 + dur);
  const g = actx.createGain();
  env(g, t0, 0.005, dur, peak * sfxVol);
  src.connect(f).connect(g).connect(actx.destination);
  src.start(t0);
  src.stop(t0 + dur + 0.05);
}

const shootTable: Record<string, () => void> = {
  pulse: () => tone('square', 860, 320, 0.07, 0.05),
  vulcan: () => tone('square', 520, 240, 0.045, 0.035),
  proton: () => tone('sine', 340, 140, 0.12, 0.07),
  light: () => {
    noiseBurst(0.06, 0.05, 5000, 1500);
    tone('square', 1400, 700, 0.05, 0.03);
  },
  laser: () => tone('sawtooth', 1500, 500, 0.08, 0.045),
};

export const SFX = {
  /** 무기 키로 발사음 조회 — 신규 데이터 무기는 pulse 음으로 폴백 */
  shoot(kind: string): void {
    (shootTable[kind] ?? shootTable.pulse)?.();
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
  chirp: () => {
    tone('square', 1500, 950, 0.06, 0.05);
    tone('square', 1900, 1200, 0.05, 0.04, 0.06);
  },
  swoosh: () => {
    noiseBurst(0.22, 0.16, 4200, 500);
  },
  spid: () => {
    noiseBurst(0.5, 0.22, 3600, 500);
    tone('square', 1200, 300, 0.4, 0.08);
  },
};
