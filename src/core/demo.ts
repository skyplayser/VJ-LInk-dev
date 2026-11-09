// Demo-Projekt: zeigt auf einen Blick, was VJ-Link kann. Acht Ebenen mit kuratierten Clips, Effekt-Stapeln und
// Modulationen, zehn Szenen mit eigenen Übergängen, die mit „Auto“ von selbst durchlaufen, und ein SHOW-Ablauf
// mit Timeline (Szenen-Blöcke, Strobe, Blinder, Blackout). Grafiken (Titel, Logo) legt die Oberfläche an und
// übergibt hier nur deren Clip-IDs.
import type { ControlContext } from "./control";
import { EFFECTS } from "./effects";
import { newModulation, type Modulation } from "./modulation";
import { addLayer, applyScene, defaultLayer, MAX_LAYERS, type EffectSlot, type LayerState, type Rgb, type Scene } from "./show";
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

/** Die acht Ebenen: Name, Clip-Zeile, Mischmodus, Antrieb, Farbe, Effekt-Stapel. */
function demoLayers(m: DemoMedia): Partial<LayerState>[] {
  const own = (...ids: (string | null)[]) => ids.filter((x): x is string => !!x);
  return [
    { name: t("Basis"), blend: "normal", drive: "auto", colorSource: "original",
      clips: ["tunnel", "mandel-zoom", "domain-warp", "sphere-field", "wormhole", "outrun-sun", "gyroid", "aurora", "nebula", "caustics", "hyperspace", "cube-tunnel"],
      effects: [fx("kaleidoscope"), fx("rgb-shift"), fx("feedback"), fx("bloom", 0.35)] },
    { name: t("Geometrie"), blend: "add", drive: "auto", colorSource: "B", opacity: 0.8,
      clips: ["flower-of-life", "metatron", "kifs", "neon-triangles", "ring-stack", "hex-pulse", "particle-ring", "kaleido-burst", "spirograph", "star-polygons"],
      effects: [fx("glow", 0.4), fx("rgb-shift"), fx("zoom-feedback")] },
    { name: "Audio", blend: "screen", drive: "auto", colorSource: "gradient", opacity: 0.85,
      clips: ["spectrum-circle", "bar-spectrum", "eq-tower", "wave-ribbon", "bass-ring", "oscilloscope", "radial-eq", "audio-mesh"],
      effects: [fx("glow", 0.3), fx("mirror"), fx("echo")] },
    { name: "Laser", blend: "add", drive: "bpm", colorSource: "C",
      clips: laserClips(), effects: [fx("glow", 0.5), fx("kaleidoscope"), fx("strobe-zoom")] },
    { name: "Beat", blend: "add", drive: "bpm", colorSource: "original", opacity: 0.7,
      clips: ["strobe-grid", "mono-bars", "split-flash", "dot-pulse", "frame-zoom", "line-scan", "bars-3", "pulse-square"],
      effects: [fx("rgb-shift", 0.3), fx("slices"), fx("beat-invert")] },
    { name: t("Partikel"), blend: "add", drive: "auto", colorSource: "original", opacity: 0.9,
      clips: ["fireflies", "confetti", "galaxy", "vortex", "fireworks", "bokeh", "starfield", "dust-storm"],
      effects: [fx("bloom", 0.3), fx("twirl"), fx("color-strobe")] },
    { name: t("Text"), blend: "normal", drive: "static", colorSource: "original",
      clips: [...own(m.title), "now-playing", "dj-waveform"], effects: [fx("glow", 0.3), fx("rgb-shift"), fx("glitch")],
      media: { scale: 1, x: 0, y: 0, rotation: 0, anim: "none", animAmount: 0, animBeats: 1, keyMode: "none", keyTol: 0.25 } },
    { name: "Logo", blend: "normal", drive: "static", colorSource: "original",
      clips: own(m.logo), effects: [],
      media: { scale: 0.08, x: 0.77, y: -0.84, rotation: 0, anim: "none", animAmount: 0, animBeats: 1, keyMode: "none", keyTol: 0.25 } },
  ];
}

/** Zehn Szenen: eine kleine Show mit Aufbau, Drop, Trip, Laser, Retro, Ruhe. Ebene 8 (Logo) bleibt immer stehen. */
function demoScenes(m: DemoMedia): Scene[] {
  const bars = (n: number) => ({ after: "bars" as const, value: n });
  const beats = (n: number, style: "fade" | "black" = "fade") => ({ unit: "beats" as const, value: n, style });
  const off = { clip: null };
  return [
    { name: "Intro", transition: beats(4), next: bars(8), layers: [
      { clip: "nebula", colorSource: "D", opacity: 1, effects: [fx("kaleidoscope"), fx("rgb-shift"), fx("feedback"), fx("bloom", 0.4)] },
      off, off, off, off,
      { clip: "starfield", opacity: 0.8 },
      { clip: m.title, opacity: 1 }, null] },
    { name: "Build", transition: beats(4), next: bars(8), layers: [
      { clip: "tunnel", colorSource: "A", effects: [fx("kaleidoscope"), fx("rgb-shift", 0.2), fx("feedback", 0.3), fx("bloom", 0.35)] },
      { clip: "flower-of-life", colorSource: "B", opacity: 0.7 },
      { clip: "spectrum-circle", opacity: 0.8 },
      off, off, off, { clip: null }, null] },
    { name: "Drop", transition: beats(0), next: bars(8), layers: [
      { clip: "cube-tunnel", colorSource: "E", effects: [fx("kaleidoscope"), fx("rgb-shift", 0.5), fx("feedback"), fx("bloom", 0.5)] },
      { clip: "neon-triangles", colorSource: "A", opacity: 0.9 },
      off,
      { clip: "laser-fans", colorSource: "C", opacity: 1 },
      { clip: "strobe-grid", opacity: 0.6 },
      off, off, null] },
    { name: t("Fraktal-Trip"), transition: beats(8), next: bars(8), layers: [
      { clip: "mandel-zoom", colorSource: "original", effects: [fx("kaleidoscope", 0.55), fx("rgb-shift"), fx("feedback"), fx("bloom", 0.3)] },
      { clip: "kifs", colorSource: "D", opacity: 0.6 },
      off, off, off, off, off, null] },
    { name: t("Laser-Show"), transition: beats(2, "black"), next: bars(8), layers: [
      { clip: "sphere-field", colorSource: "D", opacity: 0.35, effects: [fx("kaleidoscope"), fx("rgb-shift"), fx("feedback"), fx("vignette", 0.6)] },
      off, off,
      { clip: "laser-sky", colorSource: "C", opacity: 1 },
      off,
      { clip: "dust-storm", opacity: 0.5 },
      off, null] },
    { name: "Retro", transition: beats(2, "black"), next: bars(8), layers: [
      { clip: "outrun-sun", colorSource: "original", effects: [fx("crt", 0.6), fx("rgb-shift", 0.2), fx("vhs", 0.5), fx("bloom", 0.3)] },
      off,
      { clip: "eq-tower", opacity: 0.6 },
      off, off, off, off, null] },
    { name: t("Organisch"), transition: beats(8), next: bars(8), layers: [
      { clip: "domain-warp", colorSource: "original", effects: [fx("kaleidoscope"), fx("liquid", 0.4), fx("feedback"), fx("bloom", 0.3)] },
      { clip: "seed-of-life", colorSource: "B", opacity: 0.6 },
      off, off, off,
      { clip: "fireflies", opacity: 1 },
      off, null] },
    { name: "Finale", transition: beats(1), next: bars(8), layers: [
      { clip: "hyperspace", colorSource: "original", effects: [fx("kaleidoscope"), fx("rgb-shift", 0.4), fx("zoom-blur", 0.4), fx("bloom", 0.5)] },
      { clip: "kaleido-burst", colorSource: "A", opacity: 0.8 },
      { clip: "bass-ring", opacity: 0.8 },
      { clip: "laser-propeller", colorSource: "C", opacity: 0.8 },
      { clip: "dot-pulse", opacity: 0.5 },
      { clip: "fireworks", opacity: 1 },
      off, null] },
    { name: "Ambient", transition: { unit: "seconds", value: 6, style: "fade" }, next: bars(8), layers: [
      { clip: "aurora", colorSource: "gradient", effects: [fx("kaleidoscope"), fx("rgb-shift"), fx("feedback"), fx("bloom", 0.25)] },
      off, off, off, off,
      { clip: "galaxy", opacity: 0.5 },
      off, null] },
    { name: "Pause", transition: beats(4, "black"), next: bars(2), layers: [off, off, off, off, off, off, off, null] },
  ];
}

/** Modulationen: Regler schwingen von selbst (LFO im Takt) oder folgen dem Audio. */
function demoMods(): Modulation[] {
  return [
    { ...newModulation("layer.2.opacity"), source: "sine", beats: 8, depth: 0.4 },
    { ...newModulation("layer.1.fx.2"), source: "bass", depth: 0.5 },
    { ...newModulation("slot.E.hue"), source: "saw", beats: 32, depth: 1 },
    { ...newModulation("layer.6.opacity"), source: "mid", depth: 0.4 },
    { ...newModulation("layer.4.laser.size"), source: "triangle", beats: 8, depth: 0.3 },
  ];
}

/** SHOW-Ablauf: Szenen-Cue, Timeline-Show (48 s), Logo groß, Schwarz. */
function demoCues(m: DemoMedia): Cue[] {
  const intro = newCue("scene", t("Intro abrufen")); intro.scene = 1;
  const show = newCue("image", t("Demo-Show (Timeline)"), m.label);
  Object.assign(show, { hold: 48, over: "over", fit: "fill", fadeIn: 0.5, fadeOut: 1, timeline: true, end: "fade",
    marks: [
      { t: 0, scene: 2, others: false, len: 8 },
      { t: 8, scene: 3, others: false, len: 8 },
      { t: 16, scene: 4, others: false, len: 8 },
      { t: 24, scene: 5, others: false, len: 8 },
      { t: 32, scene: 8, others: false, len: 8 },
      { t: 40, scene: 3, others: false, len: 8 },
    ],
    fx: [
      { t: 7, len: 1, kind: "strobe" },
      { t: 15.5, len: 0.5, kind: "wflash" },
      { t: 23, len: 1, kind: "blinder" },
      { t: 39, len: 1, kind: "strobe" },
      { t: 47, len: 1, kind: "blackout" },
    ] } satisfies Partial<Cue>);
  const logo = newCue("image", t("Logo groß"), m.logo);
  Object.assign(logo, { hold: 6, over: "over", fit: "fit", fadeIn: 1, fadeOut: 1, end: "fade" } satisfies Partial<Cue>);
  const black = newCue("black", t("Schwarz"));
  Object.assign(black, { fadeIn: 2, hold: 0 } satisfies Partial<Cue>);
  return [intro, show, logo, black];
}

/** Farbslots: Pink, Bernstein, Grün, Cyan, Violett (kräftig, gut auf LED-Wänden). */
const DEMO_SLOTS: Rgb[] = [[1, 0.08, 0.45], [1, 0.62, 0.05], [0.15, 1, 0.45], [0.05, 0.75, 1], [0.6, 0.2, 1]];

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
  s.transitionBeats = 4;
  s.fxMaster = 1;
  c.scenes.splice(0, c.scenes.length, ...demoScenes(m));
  if (c.mods) c.mods.splice(0, c.mods.length, ...demoMods()); else c.mods = demoMods();
  c.cues.list = demoCues(m);
  c.cues.run = { active: [], next: 0, current: -1 };
  applyScene(s, c.scenes[0]!);
  s.scene = 1;
  s.autoVj = true;
}
