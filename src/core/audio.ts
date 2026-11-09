// Audio-Bänder und Strobe-Takt. Reine Funktionen, damit jeder Ausgang dasselbe Bild rechnet.
import type { AudioState, Drive, StrobeState } from "./show";
import { EFFECTS } from "./effects";

/** Visuals, die ein Audio-Eingang antreibt, wenn er auf „Audio-Visuals“ steht: die Kategorie Audio (EQ, Oszilloskop …). */
export const AUDIO_CLIPS: ReadonlySet<string> = new Set(EFFECTS.filter(e => e.category === "audio").map(e => e.id));

/** Wirkt der Audio-Eingang auf diesen Clip? */
export const micDrives = (audio: AudioState, clip: string | null): boolean =>
  !!audio.mic && !!clip && (audio.mic.scope === "all" || AUDIO_CLIPS.has(clip));

/** Bänder für einen Clip: Live-Audio, wenn der Eingang auf ihn wirkt, sonst LJ-Link oder Demo im Takt. */
export function bandsFor(audio: AudioState, clip: string | null, beat: number, tSec: number): number[] {
  return micDrives(audio, clip) ? audio.mic!.bands : bandsFrom(audio, beat, tSec);
}

export const BAND_COUNT = 8;

/**
 * Acht Bänder aus Bass/Mitten/Höhen. Ohne Audio-Daten (alle null) entsteht eine Demo-Bewegung
 * aus dem Takt, damit die Visuals auch ohne Eingang lebendig wirken.
 */
export function bandsFrom(audio: AudioState, beat: number, tSec: number): number[] {
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

/** Phase des Strobes (gleiche Geschwindigkeit für normales und weißes Strobe): true = Blitz. */
function strobePhaseOn(s: StrobeState, beat: number, tSec: number, bpm: number): boolean {
  const phase = s.sync
    ? beat * STROBE_DIVISIONS[Math.min(STROBE_DIVISIONS.length - 1, Math.floor(s.speed * STROBE_DIVISIONS.length))]!
    : tSec * strobeHz(s, bpm);
  return phase - Math.floor(phase) < STROBE_DUTY;
}

/** Strobe White: Anteil Weiß 0–1, der über das ganze Bild gelegt wird (Intensität = Helligkeit des Blitzes). */
export function strobeWhite(s: StrobeState, beat: number, tSec: number, bpm = 120): number {
  if (!s.white && !s.whiteFlash) return 0;
  return strobePhaseOn(s, beat, tSec, bpm) ? Math.max(0.05, s.intensity) : 0;
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

// ---- Analyse eines Audio-Eingangs ------------------------------------------------------

export const WAVE_POINTS = 64;
const BAND_EDGES = [30, 80, 160, 320, 640, 1300, 2600, 5200, 12000]; // Hz, 8 Bänder

/**
 * Spektrum (dB je FFT-Bin) in 8 Bänder 0–1 umrechnen. `gain` 1 = normal.
 * Schnelles Ansteigen, langsames Abfallen (wie ein Pegelmesser), damit nichts flackert.
 */
export function analyzeSpectrum(db: ArrayLike<number>, sampleRate: number, gain: number, prev: number[] = []): number[] {
  const binHz = sampleRate / 2 / db.length;
  const out: number[] = [];
  for (let b = 0; b < BAND_COUNT; b++) {
    const lo = Math.max(1, Math.floor(BAND_EDGES[b]! / binHz)), hi = Math.max(lo + 1, Math.ceil(BAND_EDGES[b + 1]! / binHz));
    let sum = 0, n = 0;
    for (let i = lo; i < hi && i < db.length; i++) { sum += Math.pow(10, (db[i] ?? -100) / 20); n++; }
    const amp = n ? sum / n : 0;
    const dbAvg = amp > 0 ? 20 * Math.log10(amp) : -100;
    // -80 dB … -20 dB auf 0 … 1, höhere Bänder leicht anheben (Musik hat dort weniger Energie)
    let v = ((dbAvg + 80) / 60) * gain * (1 + b * 0.06);
    v = v < 0 ? 0 : v > 1 ? 1 : v;
    const p = prev[b] ?? 0;
    out.push(v >= p ? v : p * 0.86 + v * 0.14);
  }
  return out;
}

/** 64 Punkte der Wellenform, ab einem Nulldurchgang (steht dann ruhig wie bei einem echten Oszilloskop). */
export function sampleWave(time: ArrayLike<number>, gain: number): number[] {
  const n = time.length;
  let start = 0;
  for (let i = 1; i < n / 2; i++) if ((time[i - 1] ?? 0) < 0 && (time[i] ?? 0) >= 0) { start = i; break; }
  const span = Math.floor(n / 2);
  const out: number[] = [];
  for (let k = 0; k < WAVE_POINTS; k++) {
    const v = (time[start + Math.floor((k / (WAVE_POINTS - 1)) * (span - 1))] ?? 0) * gain;
    out.push(v < -1 ? -1 : v > 1 ? 1 : Math.round(v * 1000) / 1000);
  }
  return out;
}

/** Was eine Ebene antreibt: Beat (für Muster), Puls (0–1), Bänder und Wellenform. */
export interface DriveOut { beat: number; pulse: number; bands: number[]; wave: number[] | null; rings: number[] }

/** Lebensdauer eines Rings aus einem Bass-Schlag (Sekunden). */
export const KICK_RING_SEC = 1.2;
/** Vier Ringe im Takt (wie bisher): alle halben Beats ein neuer, jeder lebt 2 Beats. Phase 0–1. */
export const beatRings = (beat: number): number[] => [0, 1, 2, 3].map(i => (beat * 0.5 + i * 0.25) % 1);
/** Ringe aus echten Bass-Schlägen: Phase 0–1, -1 = kein Ring. */
export function kickRings(kicks: readonly number[] | undefined, nowMs: number): number[] {
  return [0, 1, 2, 3].map(i => {
    const t = kicks?.[i];
    if (t === undefined) return -1;
    const ph = (nowMs - t) / 1000 / KICK_RING_SEC;
    return ph >= 0 && ph < 1 ? ph : -1;
  });
}

/** Erkennt Bass-Schläge im Pegel (gleitende Schwelle, höchstens alle 180 ms). */
export class KickDetector {
  private avg = 0;
  private last = 0;
  kicks: number[] = [];
  feed(bass: number, nowMs: number): boolean {
    const hit = bass > this.avg * 1.3 + 0.06 && nowMs - this.last > 180;
    if (hit) { this.last = nowMs; this.kicks = [nowMs, ...this.kicks].slice(0, 4); }
    this.avg = this.avg * 0.93 + bass * 0.07;
    return hit;
  }
}

const SILENT = { bass: 0, mid: 0, high: 0 };

/**
 * Antrieb einer Ebene auswerten.
 * - auto: wie bisher (Audio-Eingang, wenn er auf den Clip wirkt, sonst LJ-Link oder Takt)
 * - bpm: nur der Takt (Puls auf jedem Beat, Bänder im Takt), Audio wird ignoriert
 * - audio: nur Audio (Eingang oder LJ-Link); Puls folgt dem Bass. Ohne Audio bleibt es ruhig.
 * - static: kein Pulsieren, gleichmäßige Bewegung unabhängig von Takt und Audio
 */
export function layerDrive(drive: Drive | undefined, audio: AudioState, clip: string | null, beat: number, tSec: number, layerSec: number): DriveOut {
  switch (drive) {
    case "static":
      return { beat: layerSec * 0.5, pulse: 0, bands: new Array<number>(BAND_COUNT).fill(0.4), wave: null, rings: beatRings(layerSec * 0.5) };
    case "bpm":
      return { beat, pulse: beatPulse(beat), bands: bandsFrom(SILENT, beat, tSec), wave: null, rings: beatRings(beat) };
    case "audio": {
      const bands = liveBands(audio, beat, tSec);
      const bass = Math.max(bands[0] ?? 0, bands[1] ?? 0);
      return { beat, pulse: Math.min(1, Math.pow(bass, 1.5) * 1.3), bands, wave: audio.mic?.wave ?? null, rings: kickRings(audio.kicks, tSec * 1000) };
    }
    default: {
      const mic = micDrives(audio, clip);
      // Live-Audio wirkt: Ringe kommen aus echten Bass-Schlägen, sonst im Takt
      return { beat, pulse: beatPulse(beat), bands: mic ? audio.mic!.bands : bandsFrom(audio, beat, tSec), wave: mic ? audio.mic!.wave : null,
        rings: mic ? kickRings(audio.kicks, tSec * 1000) : beatRings(beat) };
    }
  }
}

/** Nur echtes Audio: Eingang, sonst LJ-Link; ohne Audio alles 0 (keine Demo-Bewegung). */
export function liveBands(audio: AudioState, beat: number, tSec: number): number[] {
  if (audio.mic) return audio.mic.bands;
  return audio.bass + audio.mid + audio.high > 0.001 ? bandsFrom(audio, beat, tSec) : new Array<number>(BAND_COUNT).fill(0);
}
