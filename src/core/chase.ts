// Chase: Eine Ebene schaltet im Takt von selbst durch die Clips ihrer Zeile (vorwärts, hin und her oder zufällig),
// auf Wunsch nur kurz aufblitzend. Community-Funktion, Wunsch von Harald.
// Alles wird aus der gemeinsamen Beat-Position berechnet: Vorschau, Clip-Raster und jeder Ausgang zeigen denselben Clip.
import { SAFE_FLASH_HZ } from "./audio";

export type ChaseOrder = "forward" | "pingpong" | "random";
export const CHASE_ORDERS: readonly ChaseOrder[] = ["forward", "pingpong", "random"];
/** Schrittlängen in Beats. */
export const CHASE_STEPS = [0.25, 0.5, 1, 2, 4, 8] as const;

export interface ChaseSettings {
  on: boolean;
  /** Beats pro Schritt. */
  beats: number;
  order: ChaseOrder;
  /** Nur diese Clips der Zeile (Reihenfolge wie in der Zeile); leer = alle Clips der Zeile. */
  clips: string[];
  /** Anteil des Schritts, in dem der Clip zu sehen ist (1 = immer, 0,25 = kurz aufblitzen). */
  gate: number;
}

export const defaultChase = (): ChaseSettings => ({ on: false, beats: 1, order: "forward", clips: [], gate: 1 });

/** Clips, durch die der Chase läuft: die gewählten (sofern noch in der Zeile), sonst die ganze Zeile. */
export function chaseList(l: { clips: readonly string[]; chase?: ChaseSettings }): string[] {
  const pick = (l.chase?.clips ?? []).filter(c => l.clips.includes(c));
  return pick.length ? l.clips.filter(c => pick.includes(c)) : [...l.clips];
}

/**
 * Schrittlänge, die wirklich gilt. Mit „Sichere Blitze“ höchstens 3 Wechsel pro Sekunde: ist der Schritt bei
 * diesem Tempo kürzer, wird die nächstlängere Stufe genommen.
 */
export function chaseStep(beats: number, bpm: number, safe: boolean): number {
  const b = beats > 0 ? beats : 1;
  if (!safe || bpm <= 0) return b;
  const min = bpm / 60 / SAFE_FLASH_HZ; // Beats, die mindestens zwischen zwei Wechseln liegen müssen
  if (b >= min) return b;
  return CHASE_STEPS.find(s => s >= min) ?? Math.ceil(min);
}

const hash = (n: number): number => { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };

/** Reihenfolge der Runde `k` (ohne Korrektur). */
function rawShuffle(k: number, len: number, seed: number): number[] {
  return Array.from({ length: len }, (_, i) => i).sort((a, b) => hash(k * 997 + a + seed * 31) - hash(k * 997 + b + seed * 31));
}
/** Reihenfolge der Runde `k`: beginnt sie mit dem letzten Clip der vorigen Runde, werden die ersten zwei getauscht. */
function shuffled(k: number, len: number, seed: number): number[] {
  const p = rawShuffle(k, len, seed);
  if (p[0] === rawShuffle(k - 1, len, seed)[len - 1]) [p[0], p[1]] = [p[1]!, p[0]!];
  return p;
}

/** Index in einer Liste der Länge `len` für Schritt `n`. */
export function chaseIndex(order: ChaseOrder, n: number, len: number, seed = 0): number {
  if (len <= 1) return 0;
  if (order === "pingpong") {
    const p = ((n % (2 * len - 2)) + (2 * len - 2)) % (2 * len - 2);
    return p < len ? p : 2 * len - 2 - p;
  }
  if (order === "random") {
    // Gemischte Runden: jede Runde zeigt jeden Clip genau einmal, in neuer Reihenfolge; an der Grenze zweier
    // Runden nie derselbe Clip zweimal hintereinander. Bei zwei Clips einfach abwechselnd.
    if (len === 2) return ((n % 2) + 2) % 2;
    const k = Math.floor(n / len), pos = n - k * len;
    return shuffled(k, len, seed)[pos]!;
  }
  return ((n % len) + len) % len;
}

export interface ChaseNow { clip: string; visible: boolean; step: number; index: number }

/** Was der Chase einer Ebene bei Beat `beat` zeigt; null = Chase aus oder keine Clips. */
export function chaseAt(l: { clips: readonly string[]; chase?: ChaseSettings }, beat: number, bpm: number, safe: boolean, seed = 0): ChaseNow | null {
  const c = l.chase;
  if (!c?.on) return null;
  const list = chaseList(l);
  if (!list.length) return null;
  const step = chaseStep(c.beats, bpm, safe);
  const pos = beat / step;
  const n = Math.floor(pos);
  const index = chaseIndex(c.order, n, list.length, seed);
  const gate = Math.max(0.05, Math.min(1, c.gate ?? 1));
  return { clip: list[index]!, visible: gate >= 0.999 || pos - n < gate, step, index };
}
