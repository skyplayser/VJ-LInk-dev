// „Neues Projekt“: minimalistischer Start für Pop-House- und Techno-Partys. Schwarz, Weiß und wenige kräftige
// Akzente, klare 3D-Räume, Linien im Takt, Laser. Sechs Ebenen mit festen Rollen und acht Szenen, die man
// sofort abrufen kann (Pult, MIDI, Tastatur). Text und Logo legt die Oberfläche an und übergibt die Clip-IDs.
import type { ControlContext } from "./control";
import { EFFECTS } from "./effects";
import { addLayer, applyScene, defaultLayer, type EffectSlot, type LayerState, type Rgb, type Scene } from "./show";
import { t } from "./i18n";

export interface StarterMedia {
  /** Text-Clip „VJ-Link“ (liegt bereit, läuft nicht). */
  text: string | null;
  /** VJ-Link-Logo klein unten rechts (läuft). */
  logo: string | null;
}

export const STARTER_LAYERS = 6;

const fx = (id: string, amount = 0): EffectSlot => ({ id, on: true, amount });
const lasers = (): string[] => EFFECTS.filter(e => e.category === "laser" && e.kind === "generator" && e.status === "ready").map(e => e.id);

/** Effekt-Stapel je Rolle. Die ersten drei liegen auf Pult/MIDI „Effekt 1–3“; Stärke 0 = bereit, aber aus. */
const RAUM_FX = (rgb = 0, blur = 0, bloom = 0.3): EffectSlot[] => [fx("rgb-shift", rgb), fx("zoom-blur", blur), fx("bloom", bloom)];
const LINIEN_FX = (): EffectSlot[] => [fx("glow", 0.35), fx("mirror"), fx("echo")];
const BEAT_FX = (): EffectSlot[] => [fx("rgb-shift"), fx("slices"), fx("beat-invert")];
const LASER_FX = (): EffectSlot[] => [fx("glow", 0.45), fx("kaleidoscope"), fx("strobe-zoom")];

function starterLayers(m: StarterMedia): Partial<LayerState>[] {
  const own = (...ids: (string | null)[]) => ids.filter((x): x is string => !!x);
  return [
    { name: t("Raum"), blend: "normal", drive: "auto", colorSource: "A",
      clips: ["ring-tunnel", "infinite-squares", "neon-corridor", "cube-tunnel", "box-field", "point-sphere", "gyroid", "sphere-field"],
      effects: RAUM_FX() },
    { name: t("Linien"), blend: "add", drive: "auto", colorSource: "B", opacity: 0.8,
      clips: ["pulse-square", "frame-zoom", "line-scan", "rotor", "single-line", "crosshair", "concentric-shift", "circle-grid"],
      effects: LINIEN_FX() },
    { name: "Beat", blend: "add", drive: "bpm", colorSource: "A", opacity: 0.7,
      clips: ["strobe-grid", "mono-bars", "split-flash", "bars-3", "dot-pulse", "frame-zoom"],
      effects: BEAT_FX() },
    { name: "Laser", blend: "add", drive: "bpm", colorSource: "B", clips: lasers(), effects: LASER_FX() },
    { name: t("Text"), blend: "normal", drive: "static", colorSource: "original", clips: [...own(m.text), "now-playing"], effects: [],
      media: { scale: 1, x: 0, y: 0, rotation: 0, anim: "none", animAmount: 0, animBeats: 1, keyMode: "none", keyTol: 0.25 } },
    { name: "Logo", blend: "normal", drive: "static", colorSource: "original", clips: own(m.logo), effects: [],
      media: { scale: 0.08, x: 0.77, y: -0.84, rotation: 0, anim: "none", animAmount: 0, animBeats: 1, keyMode: "none", keyTol: 0.25 } },
  ];
}

/** Acht Szenen von ruhig bis Drop. Ebene 6 (Logo) bleibt stehen, Ebene 5 (Text) geht aus. */
export function starterScenes(): Scene[] {
  const bars = (n: number) => ({ after: "bars" as const, value: n });
  const beats = (n: number, style: "fade" | "black" = "fade") => ({ unit: "beats" as const, value: n, style });
  const off = { clip: null };
  return [
    { name: "Start", transition: beats(4), next: bars(8), layers: [
      { clip: "ring-tunnel", colorSource: "A", opacity: 1, speed: 0.7, effects: RAUM_FX(0, 0, 0.35) },
      off, off, off, off, null] },
    { name: "Groove", transition: beats(4), next: bars(8), layers: [
      { clip: "infinite-squares", colorSource: "A", opacity: 1, speed: 1, effects: RAUM_FX(0.1, 0, 0.3) },
      { clip: "frame-zoom", colorSource: "B", opacity: 0.7 },
      off, off, off, null] },
    { name: "Neon", transition: beats(4), next: bars(8), layers: [
      { clip: "neon-corridor", colorSource: "E", opacity: 1, speed: 1.2, effects: RAUM_FX(0.15, 0, 0.75) },
      { clip: "line-scan", colorSource: "C", opacity: 0.6 },
      off, off, off, null] },
    { name: "Scan", transition: beats(2, "black"), next: bars(8), layers: [
      { clip: "gyroid", colorSource: "D", opacity: 0.45, speed: 0.6, effects: RAUM_FX(0, 0, 0.3) },
      off, off,
      { clip: "beam-scanner", colorSource: "A", opacity: 1 },
      off, null] },
    { name: "Drop", transition: beats(0), next: bars(8), layers: [
      { clip: "cube-tunnel", colorSource: "A", opacity: 1, speed: 1.5, effects: RAUM_FX(0.35, 0.3, 0.4) },
      off,
      { clip: "strobe-grid", colorSource: "B", opacity: 0.6 },
      off, off, null] },
    { name: "Laser", transition: beats(2, "black"), next: bars(8), layers: [
      { clip: "point-sphere", colorSource: "A", opacity: 0.5, speed: 0.8, effects: RAUM_FX(0, 0, 0.3) },
      off, off,
      { clip: "laser-propeller", colorSource: "B", opacity: 1 },
      off, null] },
    { name: "Raster", transition: beats(4), next: bars(8), layers: [
      { clip: "box-field", colorSource: "C", opacity: 1, speed: 1, effects: RAUM_FX(0.2, 0.15, 0.35) },
      { clip: "line-scan", colorSource: "A", opacity: 0.5 },
      off, off, off, null] },
    { name: t("Schwarz"), transition: beats(4, "black"), next: bars(2), layers: [off, off, off, off, off, null] },
  ];
}

/** Weiß, Signalrot, Eisblau, UV-Violett, Pink: wenig Farbe, viel Kontrast. */
export const STARTER_SLOTS: Rgb[] = [[1, 1, 1], [1, 0.07, 0.2], [0.15, 0.8, 1], [0.55, 0.2, 1], [1, 0.15, 0.55]];

/** „Neues Projekt“ in den Zustand schreiben: sechs Ebenen, Farben, acht Szenen, Szene 1 aktiv (Automatik aus). */
export function applyStarter(c: ControlContext, m: StarterMedia): void {
  const s = c.show;
  while (s.layers.length < STARTER_LAYERS && addLayer(s) >= 0) { /* auffüllen */ }
  starterLayers(m).forEach((patch, i) => {
    const l = s.layers[i];
    if (!l) return;
    Object.assign(l, defaultLayer(), patch, { clip: null, opacity: patch.opacity ?? 1 });
    if (patch.media) l.media = { ...patch.media };
  });
  if (m.logo && s.layers[5]) s.layers[5].clip = m.logo;
  s.slots = STARTER_SLOTS.map(x => [...x] as unknown as Rgb);
  s.transitionBeats = 4;
  s.fxMaster = 1;
  c.scenes.splice(0, c.scenes.length, ...starterScenes());
  applyScene(s, c.scenes[0]!);
  s.scene = 1;
  s.autoVj = false;
}
