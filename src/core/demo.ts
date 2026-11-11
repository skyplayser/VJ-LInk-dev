// Demo-Projekt: zeigt auf einen Blick, was VJ-Link kann, für Pop-House- und Techno-Partys und bewusst übertrieben.
// Acht Ebenen mit kuratierten Clips, vollen Effekt-Stapeln und Modulationen, 14 Szenen mit eigenen Übergängen, die mit
// „Auto“ von selbst durchlaufen, und ein SHOW-Ablauf mit Timeline (Szenen-Blöcke, Strobe, Blinder, Blackout). Grafiken (Titel, Logo) legt die Oberfläche an und
// übergibt hier nur deren Clip-IDs.
import type { ControlContext } from "./control";
import { EFFECTS } from "./effects";
import { newModulation, type Modulation } from "./modulation";
import { addLayer, applyScene, defaultLayer, MAX_LAYERS, type EffectSlot, type LayerState, type Rgb, type Scene, type TransitionStyle } from "./show";
import { newCue, type Cue } from "./video";
import { t } from "./i18n";

export interface DemoMedia {
  /** Großer Titel „VJ-LINK“ (Text-Clip). */
  title: string | null;
  /** Kleine Einblendung für die Timeline-Show (Text-Clip). */
  label: string | null;
  /** VJ-Link-Logo (Grafik). */
  logo: string | null;
}

export const DEMO_NAME = "VJ-Link Demo";

const fx = (id: string, amount = 0): EffectSlot => ({ id, on: true, amount });

/** Laser-Visuals aus dem Katalog (alle fertigen). */
const laserClips = (): string[] => EFFECTS.filter(e => e.category === "laser" && e.kind === "generator" && e.status === "ready").map(e => e.id);

/** Effekt-Stapel mit Stärke; die ersten drei liegen auf Pult/MIDI „Effekt 1–3“. */
const stack = (...pairs: [string, number][]): EffectSlot[] => pairs.map(([id, a]) => fx(id, a));

/** Die acht Ebenen: Name, Clip-Zeile, Mischmodus, Antrieb, Farbe, Effekt-Stapel. */
function demoLayers(m: DemoMedia): Partial<LayerState>[] {
  const own = (...ids: (string | null)[]) => ids.filter((x): x is string => !!x);
  return [
    { name: t("Welten"), blend: "normal", drive: "auto", colorSource: "original",
      clips: ["wormhole", "mirror-ball", "outrun-sun", "kaleido-burst", "iridescent", "hex-tunnel", "julia", "cube-tunnel", "sphere-field", "glitch-wall", "xor-tunnel", "aurora", "hyperspace", "mandel-zoom"],
      effects: stack(["kaleidoscope", 0.3], ["rgb-shift", 0.2], ["zoom-blur", 0.2], ["bloom", 0.45]) },
    { name: t("Formen"), blend: "add", drive: "auto", colorSource: "A", opacity: 0.8,
      clips: ["kaleido-burst", "flower-of-life", "neon-triangles", "laser-fans", "electric", "code-rain", "seed-of-life", "star-polygons", "metatron", "spirograph"],
      effects: stack(["glow", 0.4], ["rgb-shift", 0.2], ["zoom-feedback", 0.25]) },
    { name: "Audio", blend: "screen", drive: "auto", colorSource: "gradient", opacity: 0.85,
      clips: ["spectrum-circle", "radial-eq", "wave-ribbon", "bass-ring", "audio-mesh", "eq-tower", "oscilloscope", "bar-spectrum"],
      effects: stack(["glow", 0.35], ["mirror", 0.5], ["echo", 0.3]) },
    { name: "Laser", blend: "add", drive: "bpm", colorSource: "multi", colorSlots: [0, 2, 3],
      clips: laserClips(), effects: stack(["glow", 0.5], ["kaleidoscope", 0], ["strobe-zoom", 0.25]) },
    { name: "Beat", blend: "add", drive: "bpm", colorSource: "A", opacity: 0.65,
      clips: ["strobe-grid", "mono-bars", "split-flash", "dot-pulse", "frame-zoom", "pulse-square", "bars-3", "line-scan"],
      effects: stack(["rgb-shift", 0.3], ["slices", 0.3], ["beat-invert", 0]) },
    { name: t("Partikel"), blend: "add", drive: "auto", colorSource: "original", opacity: 0.9,
      clips: ["confetti", "fireworks", "hyperspace", "particle-ring", "bokeh", "fireflies", "dust-storm", "galaxy", "starfield", "vortex"],
      effects: stack(["bloom", 0.35], ["twirl", 0], ["color-strobe", 0]) },
    { name: t("Text"), blend: "normal", drive: "static", colorSource: "original",
      clips: [...own(m.title), "now-playing", "dj-waveform"], effects: stack(["glow", 0.35], ["rgb-shift", 0.3], ["glitch", 0]),
      media: { scale: 1, x: 0, y: 0, rotation: 0, anim: "none", animAmount: 0, animBeats: 1, keyMode: "none", keyTol: 0.25 } },
    { name: "Logo", blend: "normal", drive: "static", colorSource: "original",
      clips: own(m.logo), effects: [],
      media: { scale: 0.08, x: 0.77, y: -0.84, rotation: 0, anim: "none", animAmount: 0, animBeats: 1, keyMode: "none", keyTol: 0.25 } },
  ];
}

/**
 * Eine Partynacht in 14 Szenen, von Disco-House über Pop-Drop bis Peak-Time-Techno: jede Szene mit eigenen
 * Clips, Farben und vollen Effekt-Stapeln. Ohne eigenen Übergang gilt der Regler „Blende“ (4 Beats); besondere
 * Momente haben eigene Übergänge (Blitz, Kreis, Glitch, Schnitt …). Ebene 8 (Logo) bleibt immer stehen.
 */
function demoScenes(m: DemoMedia): Scene[] {
  const bars = (n: number) => ({ after: "bars" as const, value: n });
  const beats = (n: number, style: TransitionStyle = "fade") => ({ unit: "beats" as const, value: n, style });
  const off = { clip: null };
  const L = (clip: string | null, colorSource: LayerState["colorSource"], opacity = 1, more: Partial<LayerState> = {}): Partial<LayerState> =>
    ({ clip, colorSource, opacity, ...more });
  return [
    { name: "Opening", next: bars(8), layers: [
      L("wormhole", "D", 1, { speed: 0.8, effects: stack(["kaleidoscope", 0], ["rgb-shift", 0.15], ["zoom-blur", 0.3], ["bloom", 0.55]) }),
      off, off, off, off,
      L("hyperspace", "original", 0.6),
      L(m.title, "original", 1), null] },
    { name: "Disco House", next: bars(8), layers: [
      L("mirror-ball", "original", 1, { speed: 1, effects: stack(["kaleidoscope", 0.25], ["hue-cycle", 0.3], ["zoom-blur", 0], ["bloom", 0.75]) }),
      off,
      L("spectrum-circle", "gradient", 0.7),
      L("beam-moonflower", "multi", 1, { colorSlots: [0, 1, 2] }),
      off,
      L("confetti", "original", 0.45),
      off, null] },
    { name: "Sunset Groove", transition: beats(8), next: bars(8), layers: [
      L("outrun-sun", "original", 1, { speed: 1, effects: stack(["vhs", 0.3], ["rgb-shift", 0.2], ["lens", 0.3], ["bloom", 0.5]) }),
      off,
      L("wave-ribbon", "gradient", 0.8),
      off, off,
      L("bokeh", "original", 0.6),
      off, null] },
    { name: "Pop Drop", transition: beats(1, "flash"), next: bars(8), layers: [
      L("kaleido-burst", "A", 1, { speed: 1.2, effects: stack(["kaleidoscope", 0.5], ["color-strobe", 0.5], ["zoom-blur", 0.35], ["bloom", 0.6]) }),
      L("star-polygons", "B", 0.8),
      L("radial-eq", "rainbow", 0.9),
      off,
      L("dot-pulse", "A", 0.5),
      L("fireworks", "original", 1),
      off, null] },
    { name: "Euphoria", transition: beats(8), next: bars(8), layers: [
      L("iridescent", "original", 1, { speed: 1, effects: stack(["kaleidoscope", 0.6], ["liquid", 0.3], ["hue-cycle", 0.2], ["bloom", 0.45]) }),
      L("flower-of-life", "A", 0.7),
      off, off, off,
      L("particle-ring", "original", 0.9),
      off, null] },
    { name: "Tunnel Vision", transition: beats(2, "iris"), next: bars(8), layers: [
      L("ring-tunnel", "C", 1, { speed: 1.4, effects: stack(["kaleidoscope", 0], ["rgb-shift", 0.45], ["zoom-blur", 0.45], ["bloom", 0.5]) }),
      L("neon-triangles", "A", 0.8),
      off,
      L("laser-propeller", "multi", 0.9, { colorSlots: [0, 3] }),
      L("strobe-grid", "A", 0.55),
      off, off, null] },
    { name: "Acid", transition: beats(4, "luma"), next: bars(8), layers: [
      L("julia", "original", 1, { speed: 1.2, effects: stack(["kaleidoscope", 0.45], ["liquid", 0.4], ["hue-cycle", 0.5], ["bloom", 0.35]) }),
      L("electric", "E", 0.8),
      L("oscilloscope", "E", 0.8),
      off, off, off, off, null] },
    { name: "Warehouse", transition: beats(2, "push-up"), next: bars(8), layers: [
      L("cube-tunnel", "original", 1, { speed: 1.4, effects: stack(["edges", 0.5], ["rgb-shift", 0.35], ["feedback", 0.4], ["vignette", 0.5]) }),
      off, off,
      L("beam-scanner", "B", 1),
      L("mono-bars", "original", 0.35),
      off, off, null] },
    { name: "Laser Storm", transition: beats(2, "wipe-right"), next: bars(8), layers: [
      L("sphere-field", "D", 0.35, { speed: 0.8, effects: stack(["kaleidoscope", 0], ["rgb-shift", 0.2], ["vignette", 0.6], ["bloom", 0.5]) }),
      L("laser-fans", "C", 0.9),
      off,
      L("beam-derby", "multi", 1, { colorSlots: [0, 1, 2, 4] }),
      off,
      L("dust-storm", "original", 0.6),
      off, null] },
    { name: "Glitch", transition: beats(1, "glitch"), next: bars(4), layers: [
      L("glitch-wall", "original", 1, { speed: 1.2, effects: stack(["datamosh", 0.5], ["slices", 0.5], ["rgb-shift", 0.55], ["pixel-sort", 0.3]) }),
      L("code-rain", "E", 0.6),
      off, off,
      L("split-flash", "A", 0.5),
      off,
      L(m.title, "original", 0.9), null] },
    { name: "Peak Time", transition: beats(0), next: bars(8), layers: [
      L("xor-tunnel", "original", 1, { speed: 1.4, effects: stack(["kaleidoscope", 0.5], ["rgb-shift", 0.5], ["zoom-blur", 0.45], ["bloom", 0.65]) }),
      L("kaleido-burst", "B", 0.8),
      L("bass-ring", "A", 0.9),
      L("laser-propeller", "multi", 1, { colorSlots: [2, 3, 4] }),
      L("strobe-grid", "A", 0.6),
      L("fireworks", "original", 1),
      off, null] },
    { name: "Breakdown", transition: { unit: "seconds", value: 6, style: "fade" }, next: bars(8), layers: [
      L("aurora", "original", 1, { speed: 0.7, effects: stack(["kaleidoscope", 0], ["liquid", 0.15], ["zoom-blur", 0], ["bloom", 0.45]) }),
      L("seed-of-life", "D", 0.4),
      off, off, off,
      L("fireflies", "original", 0.55),
      off, null] },
    { name: "Hands Up", transition: beats(2, "white"), next: bars(8), layers: [
      L("hyperspace", "original", 1, { speed: 1.3, effects: stack(["kaleidoscope", 0.4], ["rgb-shift", 0.4], ["zoom-blur", 0.5], ["bloom", 0.65]) }),
      off,
      L("spectrum-circle", "rainbow", 0.8),
      L("beam-moonflower", "multi", 1, { colorSlots: [0, 1, 2, 3, 4] }),
      off,
      L("confetti", "original", 1),
      L(m.title, "original", 1), null] },
    { name: "Pause", transition: beats(4, "black"), next: bars(2), layers: [off, off, off, off, off, off, off, null] },
  ];
}

/** Modulationen: Regler schwingen von selbst (LFO im Takt) oder folgen dem Audio. */
function demoMods(): Modulation[] {
  return [
    { ...newModulation("layer.1.fx.2"), source: "bass", depth: 0.5 },
    { ...newModulation("layer.1.fx.3"), source: "high", depth: 0.4 },
    { ...newModulation("layer.2.opacity"), source: "sine", beats: 8, depth: 0.4 },
    { ...newModulation("layer.3.opacity"), source: "bass", depth: 0.35 },
    { ...newModulation("layer.4.laser.size"), source: "triangle", beats: 8, depth: 0.35 },
    { ...newModulation("layer.4.laser.rot"), source: "sine", beats: 16, depth: 0.25 },
    { ...newModulation("layer.5.opacity"), source: "square", beats: 4, depth: 0.3 },
    { ...newModulation("layer.6.opacity"), source: "mid", depth: 0.4 },
    { ...newModulation("slot.E.hue"), source: "saw", beats: 64, depth: 1 },
  ];
}

/** SHOW-Ablauf: Szenen-Cue, Timeline-Show (64 s), Logo groß, Schwarz. */
function demoCues(m: DemoMedia): Cue[] {
  const intro = newCue("scene", t("Intro abrufen")); intro.scene = 1;
  const show = newCue("image", t("Demo-Show (Timeline)"), m.label);
  Object.assign(show, { hold: 64, over: "over", fit: "fill", fadeIn: 0.5, fadeOut: 1, timeline: true, end: "fade",
    marks: [
      { t: 0, scene: 2, others: false, len: 8 },
      { t: 8, scene: 4, others: false, len: 8 },
      { t: 16, scene: 6, others: false, len: 8 },
      { t: 24, scene: 7, others: false, len: 8 },
      { t: 32, scene: 9, others: false, len: 8 },
      { t: 40, scene: 10, others: false, len: 4 },
      { t: 44, scene: 11, others: false, len: 12 },
      { t: 56, scene: 13, others: false, len: 8 },
    ],
    fx: [
      { t: 7, len: 1, kind: "strobe" },
      { t: 15.5, len: 0.5, kind: "wflash" },
      { t: 23, len: 1, kind: "strobe" },
      { t: 31.5, len: 0.5, kind: "blinder" },
      { t: 43, len: 1, kind: "strobe" },
      { t: 51.5, len: 0.5, kind: "wflash" },
      { t: 55, len: 1, kind: "blinder" },
      { t: 63, len: 1, kind: "blackout" },
    ] } satisfies Partial<Cue>);
  const logo = newCue("image", t("Logo groß"), m.logo);
  Object.assign(logo, { hold: 6, over: "over", fit: "fit", fadeIn: 1, fadeOut: 1, end: "fade" } satisfies Partial<Cue>);
  const black = newCue("black", t("Schwarz"));
  Object.assign(black, { fadeIn: 2, hold: 0 } satisfies Partial<Cue>);
  return [intro, show, logo, black];
}

/** Farbslots: Pink, Gold, Cyan, Violett, Acid-Grün (Pop-House trifft Techno, kräftig auf LED-Wänden). */
const DEMO_SLOTS: Rgb[] = [[1, 0.08, 0.5], [1, 0.68, 0.08], [0.05, 0.8, 1], [0.55, 0.15, 1], [0.45, 1, 0.1]];

/** Demo in den laufenden Zustand schreiben. Danach Szene 1 aktiv und „Auto“ an. */
export function applyDemo(c: ControlContext, m: DemoMedia): void {
  const s = c.show;
  while (s.layers.length < MAX_LAYERS && addLayer(s) >= 0) { /* auffüllen */ }
  demoLayers(m).forEach((patch, i) => {
    const l = s.layers[i];
    if (!l) return;
    Object.assign(l, defaultLayer(), patch, { clip: null, opacity: patch.opacity ?? 1 });
    if (patch.media) l.media = { ...patch.media };
  });
  // Logo und Titel laufen sofort
  if (m.logo && s.layers[7]) s.layers[7].clip = m.logo;
  s.slots = DEMO_SLOTS.map(x => [...x] as unknown as Rgb);
  Object.assign(s.strobe, { speed: 0.6, intensity: 0.9, sync: true });
  // Party-Tempo, solange kein Pult, LJ-Link oder Tap das Tempo vorgibt
  if (c.tempo.source === "manual") c.tempo.setManual(126, Date.now());
  s.transitionBeats = 4;
  s.transitionUnit = "beats";
  s.transitionStyle = "fade";
  s.transitionAll = false;
  s.fxMaster = 1;
  c.scenes.splice(0, c.scenes.length, ...demoScenes(m));
  if (c.mods) c.mods.splice(0, c.mods.length, ...demoMods()); else c.mods = demoMods();
  c.cues.list = demoCues(m);
  c.cues.run = { active: [], next: 0, current: -1 };
  applyScene(s, c.scenes[0]!);
  s.scene = 1;
  s.autoVj = true;
}
