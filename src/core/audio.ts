// Audio-Bänder und Strobe-Takt. Reine Funktionen, damit jeder Ausgang dasselbe Bild rechnet.
import type { ShowState } from "./show";

export const BAND_COUNT = 8;

/**
 * Acht Bänder aus Bass/Mitten/Höhen. Ohne Audio-Daten (alle null) entsteht eine Demo-Bewegung
 * aus dem Takt, damit die Visuals auch ohne Eingang lebendig wirken.
 */
export function bandsFrom(audio: ShowState["audio"], beat: number, tSec: number): number[] {
  const live = audio.bass + audio.mid + audio.high > 0.001;
  const pulse = Math.pow(1 - (beat - Math.floor(beat)), 3);
  const bass = live ? audio.bass : 0.25 + 0.75 * pulse;
  const mid = live ? audio.mid : 0.3 + 0.35 * Math.abs(Math.sin(tSec * 2.1)) * (0.5 + 0.5 * pulse);
  const high = live ? audio.high : 0.2 + 0.3 * Math.abs(Math.sin(tSec * 5.3 + 1));
  const out: number[] = [];
  for (let i = 0; i < BAND_COUNT; i++) {
    const x = i / (BAND_COUNT - 1);
    const base = x < 0.5 ? bass * (1 - x * 1.2) + mid * x * 1.2 : mid * (1 - (x - 0.5) * 2) + high * (x - 0.5) * 2;
    const wob = live ? 1 : 0.8 + 0.2 * Math.sin(tSec * (3 + i * 1.3) + i);
    out.push(Math.max(0, Math.min(1, base * wob)));
  }
  return out;
}

/** 1 = Licht an. `division` 1..8: 1 = ein Blitz pro Beat, danach doppelt so schnell. */
export function strobeGate(beat: number, division: number): number {
  if (division <= 0) return 1;
  const rate = Math.pow(2, division - 1);
  const ph = beat * rate;
  return ph - Math.floor(ph) < 0.3 ? 1 : 0;
}

/** Abklingender Puls: 1 genau auf dem Beat, fällt bis zum nächsten auf 0. */
export function beatPulse(beat: number): number {
  const f = beat - Math.floor(beat);
  return Math.pow(1 - f, 2.5);
}
