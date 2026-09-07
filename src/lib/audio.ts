let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC({ latencyHint: "interactive" });
    master = ctx.createGain();
    master.gain.value = 0.7;
    master.connect(ctx.destination);
  }
  return ctx;
}

export function setSoundEnabled(on: boolean): void {
  enabled = on;
}

export function unlockAudio(): void {
  const ac = getCtx();
  if (ac && ac.state === "suspended") void ac.resume();
}

function tone(
  freq: number,
  duration: number,
  type: OscillatorType,
  gain = 0.12,
  delay = 0,
  slide = 0,
): void {
  if (!enabled) return;
  const ac = getCtx();
  if (!ac || !master) return;
  if (ac.state === "suspended") void ac.resume();
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ac.currentTime + delay);
  if (slide) {
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(40, freq + slide),
      ac.currentTime + delay + duration,
    );
  }
  const t0 = ac.currentTime + delay;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(g);
  g.connect(master);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

export function playMove(): void {
  tone(220, 0.07, "sine", 0.1);
  tone(540, 0.04, "triangle", 0.04);
}

export function playCapture(): void {
  tone(140, 0.12, "sine", 0.16, 0, -40);
  tone(320, 0.06, "square", 0.03);
}

export function playCheck(): void {
  tone(520, 0.09, "triangle", 0.1);
  tone(780, 0.12, "sine", 0.08, 0.08);
}

export function playWin(): void {
  tone(392, 0.14, "sine", 0.1);
  tone(523, 0.14, "sine", 0.1, 0.12);
  tone(659, 0.22, "sine", 0.12, 0.24);
}

export function playLose(): void {
  tone(330, 0.16, "sine", 0.1, 0, -80);
  tone(220, 0.22, "sine", 0.1, 0.12, -60);
}

export function playDraw(): void {
  tone(360, 0.14, "sine", 0.08);
  tone(360, 0.14, "sine", 0.08, 0.16);
}

export function playSelect(): void {
  tone(680, 0.03, "sine", 0.04);
}
