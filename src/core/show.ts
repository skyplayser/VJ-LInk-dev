// Zustand der Show: wird vom Pult, von OSC, von LJ-Link und von der Oberfläche verändert.
export type BlendMode = "normal" | "add" | "screen" | "multiply";
export const BLEND_MODES: readonly BlendMode[] = ["normal", "add", "screen", "multiply"];
export type ColorSource = "original" | "A" | "B" | "C" | "D" | "E" | "gradient" | "rainbow";
export const COLOR_SOURCES: readonly ColorSource[] = ["original", "A", "B", "C", "D", "E", "gradient", "rainbow"];
export type Rgb = readonly [number, number, number]; // 0–1

/** Ebenen beim Start. Weitere lassen sich bis MAX_LAYERS hinzufügen. */
export const LAYER_COUNT = 4;
export const MAX_LAYERS = 8;
/** Das Pult-Profil „Standard“ hat Kanäle für so viele Ebenen. */
export const DMX_LAYERS = 4;
export const SLOT_NAMES = ["A", "B", "C", "D", "E"] as const;

export interface LayerState {
  clip: string | null;
  opacity: number;
  blend: BlendMode;
  colorSource: ColorSource;
  /** Faktor, 0 = Stopp, negativ = rückwärts. */
  speed: number;
  /** Effekt-Stapel, wirkt von oben nach unten. Die ersten drei liegen auf Pult/MIDI „Effekt 1–3“. */
  effects: EffectSlot[];
  strobe: number;
  /** Lage und Animation, wenn der Clip eine Grafik ist („img:…“). */
  media: MediaSettings;
}

export type MediaAnim = "none" | "pulse" | "spin" | "bounce" | "float" | "wobble" | "zoom";
export const MEDIA_ANIMS: readonly MediaAnim[] = ["none", "pulse", "spin", "bounce", "float", "wobble", "zoom"];

export interface MediaSettings {
  /** Höhe der Grafik im Verhältnis zur Bildhöhe (1 = volle Höhe). */
  scale: number;
  /** Verschiebung, -1 bis 1 (Bildrand). */
  x: number;
  y: number;
  /** Grad. */
  rotation: number;
  anim: MediaAnim;
  /** Stärke der Animation 0–1. */
  animAmount: number;
  /** Beats pro Durchlauf (½, 1, 2, 4, 8). */
  animBeats: number;
}

export const defaultMedia = (): MediaSettings =>
  ({ scale: 0.6, x: 0, y: 0, rotation: 0, anim: "pulse", animAmount: 0.4, animBeats: 1 });

export const isMediaClip = (clip: string | null): clip is string => !!clip && clip.startsWith("img:");
export const mediaIdOf = (clip: string): string => clip.slice(4);

export interface EffectSlot {
  /** ID aus POST_EFFECTS (src/core/effects.ts). */
  id: string;
  on: boolean;
  /** Stärke 0–1. 0 = wirkungslos. */
  amount: number;
}

export const MAX_EFFECTS = 6;

/** Läuft gerade eine Überblendung: von `from` zum aktuellen Zustand. */
export interface Transition {
  from: LayerState[];
  /** Beat, an dem die Blende beginnt (auf den nächsten Schlag gerundet). */
  startBeat: number;
  beats: number;
  /** Alternativ in Sekunden: Start (Epoch-ms) und Dauer (ms). Hat Vorrang vor Beats. */
  startMs?: number;
  ms?: number;
  /** „fade“ überblendet, „black“ geht über Schwarz. */
  style: TransitionStyle;
}

export type TransitionStyle = "fade" | "black";

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
  transition: Transition | null;
  /** Wann die aktuelle Szene begann (für „weiter nach …“). */
  sceneStart: { beat: number; ms: number };
  fxMaster: number;
  autoVj: boolean;
  layers: LayerState[];
  slots: Rgb[];
  /** Audio-Analyse 0–1, vom Audio-Eingang oder aus LJ-Link-Wellenform. */
  audio: { bass: number; mid: number; high: number };
}

/** Standard-Stapel: drei Effekte mit Stärke 0, damit „Effekt 1–3“ am Pult sofort etwas bewirken. */
export const defaultEffects = (): EffectSlot[] => [
  { id: "kaleidoscope", on: true, amount: 0 },
  { id: "rgb-shift", on: true, amount: 0 },
  { id: "feedback", on: true, amount: 0 },
];

export const defaultLayer = (): LayerState => ({
  clip: null, opacity: 1, blend: "normal", colorSource: "original", speed: 1, effects: defaultEffects(), strobe: 0,
  media: defaultMedia(),
});

/** Tiefe Kopie der Ebenen (Szenen und Überblendungen dürfen nichts teilen). */
export const cloneLayer = (l: LayerState): LayerState =>
  ({ ...l, effects: l.effects.map(e => ({ ...e })), media: { ...l.media } });
export const cloneLayers = (layers: readonly LayerState[]): LayerState[] => layers.map(cloneLayer);

/** Fortschritt der Überblendung 0–1 beim Beat `beat`; 1 = keine Blende aktiv. */
export function transitionProgress(t: Transition | null, beat: number, nowMs = Date.now()): number {
  if (!t) return 1;
  let p: number;
  if (t.ms !== undefined && t.startMs !== undefined) p = t.ms <= 0 ? 1 : (nowMs - t.startMs) / t.ms;
  else p = t.beats <= 0 ? 1 : (beat - t.startBeat) / t.beats;
  return p < 0 ? 0 : p > 1 ? 1 : p;
}

export function defaultShow(): ShowState {
  const layers = Array.from({ length: LAYER_COUNT }, defaultLayer);
  layers[0] = { ...layers[0]!, clip: "tunnel", colorSource: "A" };
  return {
    master: 1, strobe: defaultStrobe(), blackout: false, scene: 0, transitionBeats: 1, transition: null, sceneStart: { beat: 0, ms: 0 }, fxMaster: 1, autoVj: false,
    layers,
    slots: [[1, 0.1, 0.35], [1, 0.7, 0.1], [0.2, 0.9, 0.5], [0.1, 0.8, 1], [0.7, 0.35, 1]],
    audio: { bass: 0, mid: 0, high: 0 },
  };
}

export interface SceneTransition {
  /** Schnitt = Wert 0. */
  unit: "beats" | "seconds";
  value: number;
  style: TransitionStyle;
}

export interface SceneNext {
  /** Wann es automatisch zur nächsten Szene geht (nur bei eingeschalteter Automatik). */
  after: "off" | "bars" | "seconds" | "phrase";
  value: number;
}

export interface Scene {
  name: string;
  /** Nur die genannten Ebenen/Felder werden gesetzt. Selbst angelegte Szenen speichern alle Ebenen. */
  layers: (Partial<LayerState> | null)[];
  /** Fehlt sie, gilt der Regler „Blende“ (Beats, Überblenden). */
  transition?: SceneTransition;
  next?: SceneNext;
}

export const DEFAULT_SCENES: readonly Scene[] = [
  { name: "Intro", layers: [{ clip: "starfield", opacity: 1, colorSource: "D" }, { clip: null }, null, null] },
  { name: "Build", layers: [{ clip: "tunnel", colorSource: "A" }, { clip: "pulse-rings", opacity: 0.6, blend: "add", colorSource: "B" }, null, null] },
  { name: "Chorus", layers: [{ clip: "plasma", colorSource: "A" }, { clip: "radial-eq", opacity: 0.8, blend: "add", colorSource: "B" }, null, null] },
  { name: "Drop", layers: [{ clip: "synth-grid", colorSource: "E" }, { clip: "bar-spectrum", opacity: 0.9, blend: "screen", colorSource: "original" }, { clip: "pulse-rings", blend: "add", colorSource: "A", opacity: 0.7 }, null] },
  { name: "Ambient", layers: [{ clip: "plasma", colorSource: "D", opacity: 0.8 }, { clip: null }, { clip: null }, { clip: null }] },
  { name: "Pause", layers: [{ clip: null }, { clip: null }, { clip: null }, { clip: null }] },
];

/** Eigene, veränderbare Kopie der mitgelieferten Szenen. */
export const defaultScenes = (): Scene[] => DEFAULT_SCENES.map(sc => ({
  ...sc,
  layers: sc.layers.map(l => (l ? { ...l, ...(l.effects ? { effects: l.effects.map(e => ({ ...e })) } : {}) } : null)),
}));

export function applyScene(state: ShowState, scene: Scene): void {
  scene.layers.forEach((patch, i) => {
    const layer = state.layers[i];
    if (!patch || !layer) return;
    Object.assign(layer, patch);
    if (patch.effects) layer.effects = patch.effects.map(e => ({ ...e }));
    if (patch.media) layer.media = { ...patch.media };
  });
}

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Ebene oben anfügen. Gibt den neuen Index zurück oder -1, wenn schon MAX_LAYERS da sind. */
export function addLayer(state: ShowState): number {
  if (state.layers.length >= MAX_LAYERS) return -1;
  const l = defaultLayer();
  l.blend = "add";
  state.layers.push(l);
  return state.layers.length - 1;
}

/** Ebene entfernen (mindestens eine bleibt). */
export function removeLayer(state: ShowState, i: number): boolean {
  if (state.layers.length <= 1 || !state.layers[i]) return false;
  state.layers.splice(i, 1);
  state.transition = null;
  return true;
}
