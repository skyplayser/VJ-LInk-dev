// Zustand der Show: wird vom Pult, von OSC, von LJ-Link und von der Oberfläche verändert.
export type BlendMode = "normal" | "add" | "screen" | "multiply";
export const BLEND_MODES: readonly BlendMode[] = ["normal", "add", "screen", "multiply"];
export type ColorSource = "original" | "A" | "B" | "C" | "D" | "E" | "gradient" | "rainbow";
export const COLOR_SOURCES: readonly ColorSource[] = ["original", "A", "B", "C", "D", "E", "gradient", "rainbow"];
export type Rgb = readonly [number, number, number]; // 0–1

export const LAYER_COUNT = 4;
export const SLOT_NAMES = ["A", "B", "C", "D", "E"] as const;

export interface LayerState {
  clip: string | null;
  opacity: number;
  blend: BlendMode;
  colorSource: ColorSource;
  /** Faktor, 0 = Stopp, negativ = rückwärts. */
  speed: number;
  fx: [number, number, number];
  strobe: number;
}

export interface StrobeState {
  /** Dauerhaft an (Schalter). */
  on: boolean;
  /** Taste „Flash“ gedrückt gehalten. */
  flash: boolean;
  /** Läuft bis zu diesem Beat (z. B. aus einer LJ-Link-Regel), 0 = nicht aktiv. */
  untilBeat: number;
  /** 0–1: im Takt der Musik = 6 Stufen von ½× bis 16× pro Beat, frei = 1 bis 20 Hz. */
  speed: number;
  /** 0–1: wie dunkel die Pausen sind (1 = ganz schwarz). */
  intensity: number;
  /** true = im Takt, false = freie Frequenz in Hz. */
  sync: boolean;
}

export const defaultStrobe = (): StrobeState =>
  ({ on: false, flash: false, untilBeat: 0, speed: 0.5, intensity: 1, sync: true });

export interface ShowState {
  master: number;
  strobe: StrobeState;
  blackout: boolean;
  scene: number;
  /** Übergangsdauer in Beats (0 = Schnitt). */
  transitionBeats: number;
  fxMaster: number;
  autoVj: boolean;
  layers: LayerState[];
  slots: Rgb[];
  /** Audio-Analyse 0–1, vom Audio-Eingang oder aus LJ-Link-Wellenform. */
  audio: { bass: number; mid: number; high: number };
}

export const defaultLayer = (): LayerState => ({
  clip: null, opacity: 1, blend: "normal", colorSource: "original", speed: 1, fx: [0, 0, 0], strobe: 0,
});

export function defaultShow(): ShowState {
  const layers = Array.from({ length: LAYER_COUNT }, defaultLayer);
  layers[0] = { ...layers[0]!, clip: "tunnel", colorSource: "A" };
  return {
    master: 1, strobe: defaultStrobe(), blackout: false, scene: 0, transitionBeats: 1, fxMaster: 1, autoVj: false,
    layers,
    slots: [[1, 0.1, 0.35], [1, 0.7, 0.1], [0.2, 0.9, 0.5], [0.1, 0.8, 1], [0.7, 0.35, 1]],
    audio: { bass: 0, mid: 0, high: 0 },
  };
}

export interface Scene {
  name: string;
  /** Nur die genannten Ebenen/Felder werden gesetzt. */
  layers: (Partial<LayerState> | null)[];
}

export const DEFAULT_SCENES: readonly Scene[] = [
  { name: "Intro", layers: [{ clip: "starfield", opacity: 1, colorSource: "D" }, { clip: null }, null, null] },
  { name: "Build", layers: [{ clip: "tunnel", colorSource: "A" }, { clip: "pulse-rings", opacity: 0.6, blend: "add", colorSource: "B" }, null, null] },
  { name: "Chorus", layers: [{ clip: "plasma", colorSource: "A" }, { clip: "radial-eq", opacity: 0.8, blend: "add", colorSource: "B" }, null, null] },
  { name: "Drop", layers: [{ clip: "synth-grid", colorSource: "E" }, { clip: "bar-spectrum", opacity: 0.9, blend: "screen", colorSource: "original" }, { clip: "pulse-rings", blend: "add", colorSource: "A", opacity: 0.7 }, null] },
  { name: "Ambient", layers: [{ clip: "plasma", colorSource: "D", opacity: 0.8 }, { clip: null }, { clip: null }, { clip: null }] },
  { name: "Pause", layers: [{ clip: null }, { clip: null }, { clip: null }, { clip: null }] },
];

export function applyScene(state: ShowState, scene: Scene): void {
  scene.layers.forEach((patch, i) => {
    const layer = state.layers[i];
    if (patch && layer) Object.assign(layer, patch);
  });
}

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
