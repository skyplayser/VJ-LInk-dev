// Zustand der Show: wird vom Pult, von OSC, von LJ-Link und von der Oberfläche verändert.
import { STARTER_CLIP_IDS } from "./effects";
import { defaultVideo, type CueRender, type PlayStart, type VideoSettings } from "./video";
export type BlendMode = "normal" | "add" | "screen" | "multiply";
export const BLEND_MODES: readonly BlendMode[] = ["normal", "add", "screen", "multiply"];
export type ColorSource = "original" | "A" | "B" | "C" | "D" | "E" | "gradient" | "rainbow" | "multi";
/** Farbquellen in fester Reihenfolge für Pult-Kanal, MIDI und OSC (ohne „mehrere Slots“, damit die Stufen gleich bleiben). */
export const COLOR_SOURCES: readonly ColorSource[] = ["original", "A", "B", "C", "D", "E", "gradient", "rainbow"];
/** Alle Farbquellen, auch „mehrere Slots“ (Auswahl in layer.colorSlots). */
export const COLOR_SOURCES_ALL: readonly ColorSource[] = [...COLOR_SOURCES, "multi"];

/**
 * Antrieb einer Ebene: woher Pulsieren und Reaktion kommen.
 * auto = Audio-Eingang, wenn er auf diese Ebene wirkt, sonst Takt · bpm = nur Takt · audio = nur Audio · static = ruhig.
 */
export type Drive = "auto" | "bpm" | "audio" | "static";
export const DRIVES: readonly Drive[] = ["auto", "bpm", "audio", "static"];

/** Lage, Größe und Drehung eines Visuals (alle Generatoren); Stärke und XY-Override nur bei Lasern. */
export interface LaserSettings {
  /** Verschiebung -1 bis 1 (Bildrand); positiv = rechts bzw. oben. */
  x: number; y: number;
  /** Größe bzw. Breite, 1 = normal. */
  size: number;
  /** Drehung in Grad (-180 … 180). */
  rot?: number;
  /** Linien- und Punktstärke, 1 = normal (ca. 4 px Linie, 10 px Punkt bei 1080 Zeilen). */
  thick: number;
  /** XY-Override: Eigenbewegung aus, nur X/Y bestimmen die Lage (z. B. von der MA). Aus = wie gewohnt. */
  override?: boolean;
}
// Y = 0 ist die Bildmitte. Laser liegen ohne XY-Override von sich aus im oberen Drittel (über dem Publikum).
export const defaultLaser = (): LaserSettings => ({ x: 0, y: 0, size: 1, thick: 1, rot: 0, override: false });
export const LASER_LIMITS = { x: [-1, 1], y: [-1, 1], size: [0.2, 2.5], thick: [0.5, 4], rot: [-180, 180] } as const;
export type Rgb = readonly [number, number, number]; // 0–1

/** Ebenen beim Start. Weitere lassen sich bis MAX_LAYERS hinzufügen. */
export const LAYER_COUNT = 4;
export const MAX_LAYERS = 8;
/** Das Pult-Profil „Standard“ hat Kanäle für so viele Ebenen. */
export const DMX_LAYERS = 4;
export const SLOT_NAMES = ["A", "B", "C", "D", "E"] as const;

export interface LayerState {
  /** Eigener Name (z. B. „LOGO“); leer = „Basis“ bzw. „Overlay“. */
  name?: string;
  clip: string | null;
  /** Clips in der Zeile dieser Ebene (aus der Bibliothek zusammengestellt). */
  clips: string[];
  opacity: number;
  blend: BlendMode;
  colorSource: ColorSource;
  /** Bei Farbquelle „multi“: die gewählten Slots (0 = A … 4 = E) in dieser Reihenfolge. */
  colorSlots: number[];
  /** Woher Pulsieren und Reaktion kommen (Takt, Audio, ruhig). */
  drive: Drive;
  /** Laser-Visuals: Lage, Größe, Stärke. */
  laser: LaserSettings;
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
  /** Ausgangsstand der Leinwand-Stapel (Projektionsmapping), damit auch sie überblenden. */
  fromStacks?: Record<string, LayerState[]>;
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
  /** Zeitpunkte (Epoch-ms) der letzten Bass-Schläge, neuester zuerst (aus Live-Audio erkannt). */
  kicks?: number[];
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
  /** Ebenen, die gerade bearbeitet und gesteuert werden (Hauptbild oder eine Leinwand, siehe `canvas`). */
  layers: LayerState[];
  /**
   * Alle Ebenen-Stapel: „main“ = Hauptbild, sonst Leinwand-ID (Projektionsmapping, eigene Ebenen je Leinwand).
   * `layers` ist immer derselbe Stapel wie `stacks[canvas]`.
   */
  stacks?: Record<string, LayerState[]>;
  /** Welcher Stapel gerade bearbeitet wird („main“ oder Bild-ID). */
  canvas?: string;
  /** Blinder: ganzes Bild statisch weiß (0–1), z. B. Taste oder Timeline. */
  blinder?: number;
  /** Now-Playing-Bauchbinde: an (Daten da), seit wann (ms), wie lange sichtbar (s, 0 = immer). */
  nowPlaying?: { on: boolean; since: number; hold: number };
  /** DJ-Wellenform des Master-Decks: Position (ms) zum Zeitpunkt `at`, Geschwindigkeit, Stil, Frames, Version der Daten. */
  djWave?: { ms: number; at: number; v: number; style: 0 | 1; n: number; ver: number; bpm: number };
  /** Helligkeit je Bild (0–1), z. B. aus der Timeline; fehlt = 1. */
  stackGain?: Record<string, number>;
  /** SHOW-Ablauf läuft auf diesem Bild (Projektionsmapping), sonst auf Bild 1. */
  cueImage?: string;
  /** Projektionsmapping: Bilder (bis 5), jedes mit eigenem Ebenen-Stapel; „main“ ist Bild 1. Leinwände wählen ein Bild. */
  images?: { id: string; name: string }[];
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
  clip: null, clips: defaultClips(), opacity: 1, blend: "normal", colorSource: "original", colorSlots: [0, 1], drive: "auto", laser: defaultLaser(),
  speed: 1, effects: defaultEffects(), strobe: 0,
  media: defaultMedia(),
  video: defaultVideo(),
  videoStart: { clip: null, ms: 0, beat: 0 },
});

/** Tiefe Kopie der Ebenen (Szenen und Überblendungen dürfen nichts teilen). */
export const cloneLayer = (l: LayerState): LayerState =>
  ({ ...l, clips: [...l.clips], effects: l.effects.map(e => ({ ...e })), media: { ...l.media }, video: { ...l.video }, videoStart: { ...l.videoStart },
    colorSlots: [...(l.colorSlots ?? [0, 1])], laser: { ...(l.laser ?? defaultLaser()) } });

/** Palette einer Ebene: die gewählten Slots (bei „multi“), sonst leer. */
export function layerPalette(l: Pick<LayerState, "colorSource" | "colorSlots">, slots: readonly Rgb[]): Rgb[] {
  if (l.colorSource !== "multi") return [];
  const ids = [...new Set((l.colorSlots ?? []).filter(i => Number.isInteger(i) && i >= 0 && i < slots.length))];
  return (ids.length ? ids : [0, 1]).map(i => slots[i]!);
}

/** Slot in der Farbauswahl antippen: Original/Verlauf/Regenbogen → nur dieser Slot; sonst Slot hinzu oder weg. */
export function toggleColorSlot(l: Pick<LayerState, "colorSource" | "colorSlots">, slot: number): void {
  const single = SLOT_NAMES.indexOf(l.colorSource as typeof SLOT_NAMES[number]);
  let set = l.colorSource === "multi" ? [...l.colorSlots] : single >= 0 ? [single] : [];
  set = set.includes(slot) ? set.filter(s => s !== slot) : [...set, slot];
  if (set.length === 0) { l.colorSource = "original"; return; }
  if (set.length === 1) { l.colorSource = SLOT_NAMES[set[0]!]!; l.colorSlots = set; return; }
  l.colorSource = "multi"; l.colorSlots = set;
}

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
  for (const st of Object.values(allStacks(state))) for (const l of st) removeClip(l, id);
  for (const sc of scenes) for (const l of [...sc.layers, ...Object.values(sc.stacks ?? {}).flat()]) {
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
  /** Ebenen der Leinwände (Projektionsmapping), je Leinwand-ID. Szenen gelten für alle Leinwände. */
  stacks?: Record<string, (Partial<LayerState> | null)[]>;
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

export function applyScene(state: ShowState, scene: Scene, skip: readonly string[] = []): void {
  syncStacks(state);
  if (!skip.includes(MAIN_STACK)) applyStack(mainLayers(state), scene.layers);
  for (const [id, patches] of Object.entries(scene.stacks ?? {})) {
    if (skip.includes(id)) continue;
    // Leinwand ohne eigene Ebenen: aus dem Hauptbild anlegen, dann die Szene darauf
    const st = (state.stacks![id] ??= cloneLayers(mainLayers(state)));
    applyStack(st, patches);
  }
}

function applyStack(layers: LayerState[], patches: readonly (Partial<LayerState> | null)[]): void {
  patches.forEach((patch, i) => {
    const layer = layers[i];
    if (!patch || !layer) return;
    // Der Name gehört zur Ebene, nicht zur Szene
    const name = layer.name;
    Object.assign(layer, patch);
    layer.name = name;
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

// ---- Gemeinsame Ebenen-Uhr ---------------------------------------------------------------

/** Ebenen-Zeiten (Sekunden, mit Geschwindigkeit) zu einem Zeitpunkt; geht mit jedem Bild an die Ausgänge. */
export interface LayerClockSnap { at: number; t: number[] }

/**
 * Die Animationszeit jeder Ebene. Läuft nur im Hauptfenster; die Ausgänge rechnen mit derselben Zeit weiter,
 * damit alle Bildschirme dieselbe Stelle der Animation zeigen (sonst zählt jedes Fenster ab seinem Öffnen).
 */
export class LayerClock {
  readonly t = new Array<number>(MAX_LAYERS).fill(0);
  private last = 0;
  tick(nowMs: number, layers: readonly { speed: number }[]): readonly number[] {
    // Nach einer Pause (Fenster im Hintergrund, Ruhezustand) höchstens 1 s weiter
    const dt = this.last ? Math.min(1, Math.max(0, (nowMs - this.last) / 1000)) : 0;
    this.last = nowMs;
    for (let i = 0; i < MAX_LAYERS; i++) this.t[i]! += dt * (layers[i]?.speed ?? 1);
    return this.t;
  }
  snap(nowMs: number): LayerClockSnap { return { at: nowMs, t: [...this.t] }; }
}

/** Ebenen-Zeiten jetzt, aus dem letzten Stand des Hauptfensters weitergerechnet. */
export function layerTimesAt(s: LayerClockSnap, nowMs: number, layers: readonly { speed: number }[]): number[] {
  const dt = Math.min(1, Math.max(0, (nowMs - s.at) / 1000));
  return s.t.map((t, i) => t + dt * (layers[i]?.speed ?? 1));
}

/** Anzeigename einer Ebene. */
export const layerName = (l: Pick<LayerState, "name"> | undefined, i: number): string =>
  (l?.name?.trim() || (i === 0 ? "Basis" : "Overlay"));

// ---- Ebenen je Leinwand (Projektionsmapping) ------------------------------------------------

export const MAIN_STACK = "main";

/** Stapel-Verzeichnis anlegen bzw. mit `layers` abgleichen (nach dem Laden oder Ersetzen von `layers`). */
export function syncStacks(s: ShowState): Record<string, LayerState[]> {
  s.stacks ??= {};
  s.canvas ??= MAIN_STACK;
  s.stacks[s.canvas] = s.layers;
  return s.stacks;
}

/** Ebenen des Hauptbilds (unabhängig davon, was gerade bearbeitet wird). */
export const mainLayers = (s: ShowState): LayerState[] => s.stacks?.[MAIN_STACK] ?? s.layers;

/** Alle Stapel inklusive Hauptbild. */
export function allStacks(s: ShowState): Record<string, LayerState[]> {
  return { ...(s.stacks ?? {}), [MAIN_STACK]: mainLayers(s) };
}

/** Stapel zum Bearbeiten wählen; eine Leinwand ohne eigene Ebenen bekommt eine Kopie des Hauptbilds. */
export function selectCanvas(s: ShowState, id: string): void {
  const st = syncStacks(s);
  st[id] ??= cloneLayers(mainLayers(s));
  s.canvas = id;
  s.layers = st[id]!;
}

/** Leinwand-Ebenen entfernen (Leinwand gelöscht); wird sie gerade bearbeitet, zurück zum Hauptbild. */
export function dropCanvas(s: ShowState, id: string): void {
  if (id === MAIN_STACK) return;
  syncStacks(s);
  if (s.canvas === id) selectCanvas(s, MAIN_STACK);
  delete s.stacks![id];
}

/** Stand aller Leinwand-Stapel (ohne Hauptbild) kopieren: für Szenen und Überblendungen. */
export function cloneSideStacks(s: ShowState): Record<string, LayerState[]> {
  const out: Record<string, LayerState[]> = {};
  for (const [id, st] of Object.entries(s.stacks ?? {})) if (id !== MAIN_STACK) out[id] = cloneLayers(st);
  return out;
}

// ---- Bilder (Projektionsmapping): bis zu 5 eigene Ebenen-Stapel ---------------------------

export const MAX_IMAGES = 5;

/** Liste der Bilder, Bild 1 (Hauptbild) immer vorn. */
export function imageList(s: ShowState): { id: string; name: string }[] {
  const list = (s.images ?? []).filter(i => i.id !== MAIN_STACK);
  const main = s.images?.find(i => i.id === MAIN_STACK) ?? { id: MAIN_STACK, name: "Bild 1" };
  return [main, ...list];
}

/** Neues Bild (Kopie des Hauptbilds); null, wenn schon 5 da sind. */
export function addImage(s: ShowState): string | null {
  const list = imageList(s);
  if (list.length >= MAX_IMAGES) return null;
  const st = syncStacks(s);
  let n = 2; while (list.some(i => i.id === `b${n}`)) n++;
  const id = `b${n}`;
  st[id] = cloneLayers(mainLayers(s));
  s.images = [...list, { id, name: `Bild ${list.length + 1}` }];
  return id;
}

/** Bild entfernen (Bild 1 bleibt immer). */
export function removeImage(s: ShowState, id: string): void {
  if (id === MAIN_STACK) return;
  dropCanvas(s, id);
  s.images = imageList(s).filter(i => i.id !== id);
}
