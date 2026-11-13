// Modulation: ein Regler schwingt automatisch um seine eingestellte Position, angetrieben von einem LFO im Takt
// oder von einem Audio-Band. Der eingestellte Wert (Grundwert) bleibt unverändert; nur das Bild, das an Vorschau und
// Ausgänge geht, bekommt den modulierten Wert (die Regler zeigen ihn als Markierung). MIDI, DMX und OSC hängen über
// das Mapping an Reglern.
import { CONTROL_BY_ID } from "./controls";
import type { ControlContext } from "./control";
import { clamp01, type ShowState } from "./show";
import { t } from "./i18n";

export type ModSource = "sine" | "triangle" | "saw" | "square" | "random" | "bass" | "mid" | "high";
export const MOD_SOURCES: readonly ModSource[] = ["sine", "triangle", "saw", "square", "random", "bass", "mid", "high"];
export const MOD_LFO: ReadonlySet<ModSource> = new Set(["sine", "triangle", "saw", "square", "random"]);
export const MOD_SOURCE_LABEL: Record<ModSource, string> = {
  sine: t("Sinus"), triangle: t("Dreieck"), saw: t("Sägezahn"), square: t("Rechteck"), random: t("Zufall"), bass: t("Bass"), mid: t("Mitten"), high: t("Höhen"),
};
/** Beats pro Durchlauf. */
export const MOD_BEATS = [0.25, 0.5, 1, 2, 4, 8, 16, 32] as const;
export const MAX_MODS = 32;

export interface Modulation {
  /** Regler-ID aus der Control-Registry (z. B. layer.2.opacity). */
  target: string;
  source: ModSource;
  /** Beats pro Durchlauf (nur LFO). */
  beats: number;
  /** Stärke 0–1: bei 1 schwingt der Wert ±0,5 um den Grundwert. */
  depth: number;
  on: boolean;
}

export const newModulation = (target: string): Modulation => ({ target, source: "sine", beats: 4, depth: 0.5, on: true });

/** Welche Regler sich modulieren lassen: Fader, die nur das Bild betreffen (kein Tempo, keine Stufen-Auswahl). */
export function modulatable(id: string): boolean {
  const d = CONTROL_BY_ID.get(id);
  if (!d || d.kind !== "fader") return false;
  if (id.startsWith("tempo.") || id.startsWith("transition.")) return false;
  return !/^layer\.\d+\.(color|blend|drive|chase\.step|chase\.order)$/.test(id);
}

const fract = (x: number) => x - Math.floor(x);
/** Kleiner, fester Zufall aus einer Zahl (für „Zufall“: ein neuer Wert pro Durchlauf). */
const hash01 = (n: number) => fract(Math.sin(n * 127.1 + 311.7) * 43758.5453);
const seedOf = (s: string) => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 100003; return h; };

/** LFO-Wert 0–1 an einer Beat-Position. */
export function lfo(shape: ModSource, beat: number, beats: number, seed = 0): number {
  const ph = fract(beat / Math.max(0.0625, beats));
  switch (shape) {
    case "triangle": return 1 - Math.abs(ph * 2 - 1);
    case "saw": return ph;
    case "square": return ph < 0.5 ? 1 : 0;
    case "random": return hash01(Math.floor(beat / Math.max(0.0625, beats)) + seed);
    default: return 0.5 - 0.5 * Math.cos(ph * Math.PI * 2);
  }
}

/** Pegel 0–1 für Bass, Mitten, Höhen aus den 8 Bändern. */
export function bandLevel(source: ModSource, bands: readonly number[]): number {
  const b = (i: number) => bands[i] ?? 0;
  if (source === "bass") return Math.max(b(0), b(1));
  if (source === "mid") return (b(3) + b(4)) / 2;
  return (b(6) + b(7)) / 2;
}

/** Signal 0–1 einer Modulation. */
export function modSignal(m: Modulation, beat: number, bands: readonly number[]): number {
  return MOD_LFO.has(m.source) ? lfo(m.source, beat, m.beats, seedOf(m.target)) : clamp01(bandLevel(m.source, bands));
}

/** Modulierter Wert eines LFO: schwingt um den Grundwert, ±depth/2. */
export const modValue = (base: number, depth: number, signal: number): number => clamp01(base + clamp01(depth) * (signal - 0.5));

/**
 * Modulierter Wert bei Audio (Bass, Mitten, Höhen): pumpt vom Grundwert aus nach oben, Stille = Grundwert.
 * Ist oben kein Platz (z. B. Deckkraft 100 %), pumpt er von unten bis zum Grundwert: Stille = dunkler, Schlag = voll.
 */
export const audioModValue = (base: number, depth: number, signal: number): number => {
  const d = clamp01(depth);
  return clamp01(Math.min(clamp01(base), 1 - d) + d * clamp01(signal));
};

/** Wert einer Modulation für einen Grundwert. */
export const modulate = (m: Modulation, base: number, beat: number, bands: readonly number[]): number =>
  MOD_LFO.has(m.source) ? modValue(base, m.depth, modSignal(m, beat, bands)) : audioModValue(base, m.depth, modSignal(m, beat, bands));

/**
 * Bild-Zustand mit allen Modulationen. Ohne aktive Modulation kommt der Original-Zustand zurück (keine Kopie).
 * Der Grundwert jedes Reglers bleibt in c.show unverändert.
 */
export function modulatedShow(c: ControlContext, mods: readonly Modulation[], beat: number, bands: readonly number[]): ShowState {
  const active = mods.filter(m => m.on && m.depth > 0.001 && modulatable(m.target));
  if (!active.length) return c.show;
  const show = structuredClone(c.show);
  const view: ControlContext = { ...c, show };
  for (const m of active) {
    const d = CONTROL_BY_ID.get(m.target)!;
    d.set(view, modulate(m, d.get(c), beat, bands));
  }
  return show;
}

/** Modulationen aus einer Datei prüfen. */
export function parseMods(v: unknown): Modulation[] {
  if (!Array.isArray(v)) return [];
  const out: Modulation[] = [];
  for (const x of v) {
    if (typeof x !== "object" || x === null) continue;
    const m = x as Record<string, unknown>;
    if (typeof m.target !== "string" || !modulatable(m.target) || out.some(o => o.target === m.target)) continue;
    out.push({
      target: m.target,
      source: MOD_SOURCES.includes(m.source as ModSource) ? m.source as ModSource : "sine",
      beats: MOD_BEATS.includes(m.beats as typeof MOD_BEATS[number]) ? m.beats as number : 4,
      depth: typeof m.depth === "number" && Number.isFinite(m.depth) ? clamp01(m.depth) : 0.5,
      on: m.on !== false,
    });
    if (out.length >= MAX_MODS) break;
  }
  return out;
}
