// Zustand der Show: wird vom Pult, von OSC, von LJ-Link und von der Oberfläche verändert.
import { STARTER_CLIP_IDS } from "./effects";
import { defaultVideo, type CueRender, type PlayStart, type VideoSettings } from "./video";
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
  /** Clips in der Zeile dieser Ebene (aus der Bibliothek zusammengestellt). */
  clips: string[];
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
  /** Loop-Bereich, Takt-Loop und Größe, wenn der Clip ein Video ist („vid:…“). */
  video: VideoSettings;
  /** Wann der aktuelle Clip startete (für Videos; setzt der Steuer-Kern). */
  videoStart: PlayStart;
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
  /** Freistellen: Hintergrundfarbe entfernen, wenn das Bild keine Transparenz hat. */
  keyMode: KeyMode;
  /** Toleranz 0–1 (wie stark auch fast-weiße bzw. fast-schwarze Pixel entfernt werden). */
  keyTol: number;
}

export type KeyMode = "none" | "white" | "black";
export const KEY_MODES: readonly KeyMode[] = ["none", "white", "black"];

export const defaultMedia = (): MediaSettings =>
  ({ scale: 0.6, x: 0, y: 0, rotation: 0, anim: "pulse", animAmount: 0.4, animBeats: 1, keyMode: "none", keyTol: 0.25 });

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
  /** Strobe White: ganzer Bildschirm blitzt weiß (Schalter). */
  white: boolean;
  /** Strobe White, solange gedrückt. */
  whiteFlash: boolean;
}

export const defaultStrobe = (): StrobeState =>
  ({ on: false, flash: false, untilBeat: 0, speed: 0.5, intensity: 1, sync: true, white: false, whiteFlash: false });

/** Live-Audio vom Mikrofon oder Line-In. */
export interface MicData {
  /** 8 Frequenzbänder 0–1, tief nach hoch. */
  bands: number[];
  /** 64 Abtastwerte der Wellenform, -1 bis 1 (für das Oszilloskop). */
  wave: number[];
  /** „audio“ = nur Audio-Visuals (Equalizer, Oszilloskop …), „all“ = alle Visuals reagieren. */
  scope: "audio" | "all";
}

export interface AudioState {
  /** Bass/Mitten/Höhen aus LJ-Link (Wellenform des Master-Decks). */
  bass: number; mid: number; high: number;
  /** Gesetzt, solange ein Audio-Eingang läuft. */
  mic?: MicData;
}

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
  /** SHOW-Ablauf: was gerade über bzw. statt den Visuals läuft. */
  cues: CueRender[];
  /** Testbild auf Vorschau und allen Ausgängen. */
  testCard: boolean;
  /** Welches Testbild (zum Ausrichten durchschaltbar). */
  testPattern: TestPattern;
  slots: Rgb[];
  /** Audio-Analyse 0–1, vom Audio-Eingang oder aus LJ-Link-Wellenform. */
  audio: AudioState;
}

/** Standard-Stapel: drei Effekte mit Stärke 0, damit „Effekt 1–3“ am Pult sofort etwas bewirken. */
export const defaultEffects = (): EffectSlot[] => [
  { id: "kaleidoscope", on: true, amount: 0 },
  { id: "rgb-shift", on: true, amount: 0 },
  { id: "feedback", on: true, amount: 0 },
];

export const defaultLayer = (): LayerState => ({
  clip: null, clips: defaultClips(), opacity: 1, blend: "normal", colorSource: "original", speed: 1, effects: defaultEffects(), strobe: 0,
  media: defaultMedia(),
  video: defaultVideo(),
  videoStart: { clip: null, ms: 0, beat: 0 },
});

/** Tiefe Kopie der Ebenen (Szenen und Überblendungen dürfen nichts teilen). */
export const cloneLayer = (l: LayerState): LayerState =>
  ({ ...l, clips: [...l.clips], effects: l.effects.map(e => ({ ...e })), media: { ...l.media }, video: { ...l.video }, videoStart: { ...l.videoStart } });

/** Standard-Zeile: alle fertigen Generatoren. */
export const defaultClips = (): string[] => [...STARTER_CLIP_IDS];

/** Clip in die Zeile einer Ebene aufnehmen (am Ende, ohne Doppelte). */
export function addClip(l: LayerState, id: string): void { if (!l.clips.includes(id)) l.clips.push(id); }

/** Clip aus der Zeile nehmen; läuft er gerade, wird er gestoppt. */
export function removeClip(l: LayerState, id: string): void {
  l.clips = l.clips.filter(c => c !== id);
  if (l.clip === id) l.clip = null;
}

/** Grafik aus allen Ebenen und Szenen entfernen (wenn sie aus der Bibliothek gelöscht wird). */
export function forgetClip(state: ShowState, scenes: Scene[], id: string): void {
  for (const l of state.layers) removeClip(l, id);
  for (const sc of scenes) for (const l of sc.layers) {
    if (!l) continue;
    if (l.clips) l.clips = l.clips.filter(c => c !== id);
    if (l.clip === id) l.clip = null;
  }
}
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
    cues: [],
    testCard: false,
    testPattern: "bars",
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
    if (patch.clips) layer.clips = [...patch.clips];
    if (patch.video) layer.video = { ...patch.video };
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

// ---- Testbilder ----------------------------------------------------------------------------

/** Testbilder zum Ausrichten von Beamern, LED-Wänden und mehreren Bildschirmen. */
export const TEST_PATTERNS = [
  { id: "bars", label: "Farbbalken", hint: "Farben, Graustufen, Kreis und die Auflösung jedes Ausgangs." },
  { id: "grid", label: "Raster", hint: "Linien, Kreise und Diagonalen auf jedem Ausgang: Schärfe, Trapez und Ränder einstellen." },
  { id: "span", label: "Raster über alle", hint: "Ein Raster über die ganze Leinwand. An den Übergängen müssen Linien und Kreis nahtlos weiterlaufen." },
  { id: "ident", label: "Nummern", hint: "Jeder Ausgang zeigt groß seine Nummer, seinen Namen und seine Lage auf der Leinwand." },
  { id: "ramp", label: "Graustufen", hint: "Verlauf und Stufen von Schwarz bis Weiß: Helligkeit, Kontrast und Gamma angleichen." },
  { id: "white", label: "Weiß", hint: "Volle Fläche Weiß: Helligkeit und Farbtemperatur mehrerer Beamer angleichen." },
  { id: "red", label: "Rot", hint: "Volle Fläche Rot: tote Pixel und LED-Module prüfen." },
  { id: "green", label: "Grün", hint: "Volle Fläche Grün: tote Pixel und LED-Module prüfen." },
  { id: "blue", label: "Blau", hint: "Volle Fläche Blau: tote Pixel und LED-Module prüfen." },
] as const;
export type TestPattern = typeof TEST_PATTERNS[number]["id"];
export const TEST_IDS: readonly TestPattern[] = TEST_PATTERNS.map(p => p.id);

/** Nächstes bzw. vorheriges Testbild (rundum). */
export function stepTestPattern(p: TestPattern, dir: 1 | -1 = 1): TestPattern {
  const i = Math.max(0, TEST_IDS.indexOf(p));
  return TEST_IDS[(i + dir + TEST_IDS.length) % TEST_IDS.length]!;
}
