// Audio-Bänder und Strobe-Takt. Reine Funktionen, damit jeder Ausgang dasselbe Bild rechnet.
import type { ShowState, StrobeState } from "./show";

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

/** Strobe-Teiler im Takt: Blitze pro Beat. */
export const STROBE_DIVISIONS = [0.5, 1, 2, 4, 8, 16] as const;
export const STROBE_MIN_HZ = 1, STROBE_MAX_HZ = 20;
/** Anteil jeder Periode, in dem das Licht an ist. */
const STROBE_DUTY = 0.3;

export function strobeActive(s: StrobeState, beat: number): boolean {
  return s.on || s.flash || beat < s.untilBeat;
}

/** Blitze pro Sekunde bei 'bpm' (nur zur Anzeige). */
export function strobeHz(s: StrobeState, bpm: number): number {
  if (!s.sync) return STROBE_MIN_HZ + s.speed * (STROBE_MAX_HZ - STROBE_MIN_HZ);
  return STROBE_DIVISIONS[Math.min(STROBE_DIVISIONS.length - 1, Math.floor(s.speed * STROBE_DIVISIONS.length))]! * bpm / 60;
}

/** Helligkeitsfaktor 0–1 für das Master-Strobe. `tSec` nur für die freie Frequenz. */
export function strobeGain(s: StrobeState, beat: number, tSec: number, bpm = 120): number {
  if (!strobeActive(s, beat)) return 1;
  const phase = s.sync
    ? beat * STROBE_DIVISIONS[Math.min(STROBE_DIVISIONS.length - 1, Math.floor(s.speed * STROBE_DIVISIONS.length))]!
    : tSec * strobeHz(s, bpm);
  const on = phase - Math.floor(phase) < STROBE_DUTY;
  return on ? 1 : 1 - s.intensity;
}
