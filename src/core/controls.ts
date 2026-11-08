// Register aller Bedienelemente. Oberfläche, MIDI, OSC und Pult greifen alle darauf zu.
// Jedes Element hat eine feste ID; Werte laufen immer von 0 bis 1.
import { TEMPO_FACTORS, TRANSITION_BEATS } from "./dmx";
import { STROBE_DIVISIONS, strobeHz } from "./audio";
import { recallScene, showBack, showGo, showStop, stepScene, type ControlContext } from "./control";
import { BLEND_MODES, COLOR_SOURCES, MAX_LAYERS, SLOT_NAMES, clamp01, type Rgb } from "./show";
import { EFFECT_BY_ID } from "./effects";

/** So viele Szenen sind per MIDI, OSC und Registry direkt abrufbar. */
export const SCENE_SLOTS = 32;

/**
 * fader:   stufenlos 0–1
 * toggle:  an/aus, wechselt bei „Taste“ (Wert ≥ 0,5 = an, darunter aus)
 * hold:    aktiv, solange gedrückt (Wert ≥ 0,5)
 * trigger: löst einmal aus, sobald der Wert über 0,5 steigt
 */
export type ControlKind = "fader" | "toggle" | "hold" | "trigger";

export interface ControlDef {
  id: string;
  label: string;
  group: "Master" | "Strobe" | "Ebenen" | "Effekt" | "Tempo" | "Szenen" | "Clips" | "Farben" | "Show";
  kind: ControlKind;
  /** Erscheint in der Leiste unten. Alles andere ist über MIDI und OSC erreichbar. */
  quick: boolean;
  get(c: ControlContext): number;
  set(c: ControlContext, v: number): void;
  /** Anzeige des Werts, wenn Prozent nicht passt (z. B. „2 Beats“). */
  format?(c: ControlContext): string;
}

/** Stufen-Fader: Wert 0–1 auf eine Liste verteilen. */
const stepIndex = (v: number, n: number): number => Math.min(n - 1, Math.floor(clamp01(v) * n));
const beatsLabel = (b: number): string => b === 0 ? "Schnitt" : b < 1 ? `${b === 0.25 ? "¼" : "½"} Beat` : `${b} ${b === 1 ? "Beat" : "Beats"}`;

const on = (v: number): boolean => v >= 0.5;

export function buildControls(): ControlDef[] {
  const list: ControlDef[] = [
    { id: "master", label: "Master", group: "Master", kind: "fader", quick: true,
      get: c => c.show.master, set: (c, v) => { c.show.master = clamp01(v); } },
    { id: "blackout", label: "Blackout", group: "Master", kind: "toggle", quick: true,
      get: c => (c.show.blackout ? 1 : 0), set: (c, v) => { c.show.blackout = on(v); } },
    { id: "strobe.speed", label: "Speed", group: "Strobe", kind: "fader", quick: true,
      get: c => c.show.strobe.speed, set: (c, v) => { c.show.strobe.speed = clamp01(v); },
      format: c => c.show.strobe.sync
        ? `${STROBE_DIVISIONS[stepIndex(c.show.strobe.speed, STROBE_DIVISIONS.length)]}×`
        : `${strobeHz(c.show.strobe, 120).toFixed(0)}Hz` },
    { id: "strobe.intensity", label: "Intens.", group: "Strobe", kind: "fader", quick: true,
      get: c => c.show.strobe.intensity, set: (c, v) => { c.show.strobe.intensity = clamp01(v); } },
    { id: "strobe.on", label: "Strobe", group: "Strobe", kind: "toggle", quick: true,
      get: c => (c.show.strobe.on ? 1 : 0), set: (c, v) => { c.show.strobe.on = on(v); } },
    { id: "strobe.flash", label: "Flash", group: "Strobe", kind: "hold", quick: true,
      get: c => (c.show.strobe.flash ? 1 : 0), set: (c, v) => { c.show.strobe.flash = on(v); } },
    { id: "strobe.white", label: "White", group: "Strobe", kind: "toggle", quick: true,
      get: c => (c.show.strobe.white ? 1 : 0), set: (c, v) => { c.show.strobe.white = on(v); } },
    { id: "strobe.whiteFlash", label: "W-Flash", group: "Strobe", kind: "hold", quick: true,
      get: c => (c.show.strobe.whiteFlash ? 1 : 0), set: (c, v) => { c.show.strobe.whiteFlash = on(v); } },
    { id: "strobe.sync", label: "Takt", group: "Strobe", kind: "toggle", quick: true,
      get: c => (c.show.strobe.sync ? 1 : 0), set: (c, v) => { c.show.strobe.sync = on(v); } },
    { id: "fx.master", label: "Effekte", group: "Effekt", kind: "fader", quick: true,
      get: c => c.show.fxMaster, set: (c, v) => { c.show.fxMaster = clamp01(v); } },
    { id: "tempo.tap", label: "Tap", group: "Tempo", kind: "trigger", quick: true,
      get: () => 0, set: (c, v) => { if (on(v)) c.tempo.tap(Date.now()); } },
    { id: "tempo.factor", label: "Tempo ×", group: "Tempo", kind: "fader", quick: false,
      get: c => Math.max(0, TEMPO_FACTORS.indexOf(c.tempo.factor as typeof TEMPO_FACTORS[number])) / (TEMPO_FACTORS.length - 1),
      set: (c, v) => { c.tempo.factor = TEMPO_FACTORS[stepIndex(v, TEMPO_FACTORS.length)]!; },
      format: c => `${c.tempo.factor}×` },
    { id: "transition.beats", label: "Blende", group: "Szenen", kind: "fader", quick: true,
      get: c => Math.max(0, TRANSITION_BEATS.indexOf(c.show.transitionBeats as typeof TRANSITION_BEATS[number])) / (TRANSITION_BEATS.length - 1),
      set: (c, v) => { c.show.transitionBeats = TRANSITION_BEATS[stepIndex(v, TRANSITION_BEATS.length)]!; },
      format: c => beatsLabel(c.show.transitionBeats) },
  ];

  list.push({ id: "tempo.bpm", label: "BPM", group: "Tempo", kind: "fader", quick: false,
    get: c => clamp01((c.tempo.bpm - BPM_MIN) / (BPM_MAX - BPM_MIN)),
    set: (c, v) => { c.tempo.update("osc", BPM_MIN + clamp01(v) * (BPM_MAX - BPM_MIN), Date.now()); },
    format: c => c.tempo.bpm.toFixed(1) });
  // Ebenen bis MAX_LAYERS: fehlt eine Ebene, passiert nichts (Zuordnungen bleiben trotzdem gültig).
  for (let i = 0; i < MAX_LAYERS; i++) {
    list.push({ id: `layer.${i + 1}.opacity`, label: `E${i + 1}`, group: "Ebenen", kind: "fader", quick: true,
      get: c => c.show.layers[i]?.opacity ?? 0, set: (c, v) => { const l = c.show.layers[i]; if (l) l.opacity = clamp01(v); } });
    list.push(
      { id: `layer.${i + 1}.color`, label: `E${i + 1} Farbe`, group: "Ebenen", kind: "fader", quick: false,
        get: c => Math.max(0, COLOR_SOURCES.indexOf(c.show.layers[i]?.colorSource ?? "original")) / (COLOR_SOURCES.length - 1),
        set: (c, v) => { const l = c.show.layers[i]; if (l) l.colorSource = COLOR_SOURCES[stepIndex(v, COLOR_SOURCES.length)]!; },
        format: c => c.show.layers[i]?.colorSource ?? "–" },
      { id: `layer.${i + 1}.blend`, label: `E${i + 1} Mischmodus`, group: "Ebenen", kind: "fader", quick: false,
        get: c => Math.max(0, BLEND_MODES.indexOf(c.show.layers[i]?.blend ?? "normal")) / (BLEND_MODES.length - 1),
        set: (c, v) => { const l = c.show.layers[i]; if (l) l.blend = BLEND_MODES[stepIndex(v, BLEND_MODES.length)]!; },
        format: c => c.show.layers[i]?.blend ?? "–" },
      { id: `layer.${i + 1}.clear`, label: `E${i + 1} Clip aus`, group: "Ebenen", kind: "trigger", quick: false,
        get: c => (c.show.layers[i]?.clip ? 0 : 1), set: (c, v) => { const l = c.show.layers[i]; if (l && on(v)) l.clip = null; } },
    );
    for (let k = 0; k < 3; k++) {
      list.push({ id: `layer.${i + 1}.fx.${k + 1}`, label: `E${i + 1} Fx${k + 1}`, group: "Ebenen", kind: "fader", quick: false,
        get: c => c.show.layers[i]?.effects[k]?.amount ?? 0,
        set: (c, v) => { const slot = c.show.layers[i]?.effects[k]; if (slot) slot.amount = clamp01(v); } });
    }
  }
  // Farbslots per Drehregler: Farbton bei voller Sättigung
  SLOT_NAMES.forEach((n, i) => {
    list.push({ id: `slot.${n}.hue`, label: `Slot ${n} Farbton`, group: "Farben", kind: "fader", quick: false,
      get: c => hueOf(c.show.slots[i] ?? [1, 1, 1]), set: (c, v) => { c.show.slots[i] = hueRgb(v); } });
    (["Rot", "Grün", "Blau"] as const).forEach((name, k) => {
      list.push({ id: `slot.${n}.${"rgb"[k]}`, label: `Slot ${n} ${name}`, group: "Farben", kind: "fader", quick: false,
        get: c => c.show.slots[i]?.[k] ?? 0,
        set: (c, v) => { const o = c.show.slots[i] ?? [0, 0, 0]; const nx: [number, number, number] = [o[0], o[1], o[2]]; nx[k] = clamp01(v); c.show.slots[i] = nx; } });
    });
  });
  list.push(
    { id: "show.go", label: "WEITER", group: "Show", kind: "trigger", quick: false,
      get: () => 0, set: (c, v) => { if (on(v)) showGo(c); } },
    { id: "show.back", label: "Zurück", group: "Show", kind: "trigger", quick: false,
      get: () => 0, set: (c, v) => { if (on(v)) showBack(c); } },
    { id: "show.stop", label: "Alles stoppen", group: "Show", kind: "trigger", quick: false,
      get: () => 0, set: (c, v) => { if (on(v)) showStop(c); } },
  );
  list.push(
    { id: "scene.next", label: "Weiter", group: "Szenen", kind: "trigger", quick: false,
      get: () => 0, set: (c, v) => { if (on(v)) stepScene(c, 1); } },
    { id: "scene.prev", label: "Zurück", group: "Szenen", kind: "trigger", quick: false,
      get: () => 0, set: (c, v) => { if (on(v)) stepScene(c, -1); } },
    { id: "scene.auto", label: "Auto", group: "Szenen", kind: "toggle", quick: false,
      get: c => (c.show.autoVj ? 1 : 0), set: (c, v) => { c.show.autoVj = on(v); } },
  );
  // Die Leiste baut ihre Szenen-Tasten selbst aus der aktuellen Szenenliste.
  for (let i = 0; i < SCENE_SLOTS; i++) {
    list.push({ id: `scene.${i + 1}`, label: `Szene ${i + 1}`, group: "Szenen", kind: "trigger", quick: false,
      get: c => (c.show.scene === i + 1 ? 1 : 0), set: (c, v) => { if (on(v)) recallScene(c, i); },
      format: c => c.scenes[i]?.name ?? "–" });
  }
  return list;
}

export const CONTROLS: readonly ControlDef[] = buildControls();
export const CONTROL_BY_ID: ReadonlyMap<string, ControlDef> = new Map(CONTROLS.map(c => [c.id, c]));

/** BPM-Bereich für den Regler „tempo.bpm“ (MIDI/DMX 0–1). OSC kann auch die BPM-Zahl direkt senden. */
export const BPM_MIN = 60, BPM_MAX = 200;

/**
 * Bedienelement zu einer ID. Neben den festen Elementen gibt es Clip-Tasten
 * „clip.<Ebene>.<Clip>“ (z. B. clip.2.tunnel oder clip.1.img:ab12…): startet bzw. stoppt den Clip.
 */
export function resolveControl(id: string): ControlDef | undefined {
  const fixed = CONTROL_BY_ID.get(id);
  if (fixed) return fixed;
  const m = /^clip\.(\d+)\.(.+)$/.exec(id);
  if (m) {
    const li = Number(m[1]) - 1, clip = m[2]!;
    if (li < 0 || li >= MAX_LAYERS) return undefined;
    return {
      id, label: `E${li + 1} ${EFFECT_BY_ID.get(clip)?.name ?? (clip.startsWith("img:") ? "Grafik" : clip)}`, group: "Clips",
      kind: "trigger", quick: false,
      get: c => (c.show.layers[li]?.clip === clip ? 1 : 0),
      set: (c, v) => { const l = c.show.layers[li]; if (l && on(v)) l.clip = l.clip === clip ? null : clip; },
    };
  }
  return undefined;
}

/** Wert setzen. Gibt false zurück, wenn die ID unbekannt ist. */
export function setControl(c: ControlContext, id: string, value: number): boolean {
  const def = resolveControl(id);
  if (!def || !Number.isFinite(value)) return false;
  def.set(c, value);
  return true;
}

/** MIDI-Wert 0–127 in 0–1 umrechnen. */
export const fromMidi = (v: number): number => clamp01(v / 127);

/** Farbton 0–1 → kräftige RGB-Farbe. */
export function hueRgb(h: number): Rgb {
  const f = (n: number) => { const k = (n + clamp01(h) * 6) % 6; return 1 - Math.max(0, Math.min(k, 4 - k, 1)); };
  return [f(5), f(3), f(1)];
}
/** RGB → Farbton 0–1. */
export function hueOf([r, g, b]: Rgb): number {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d < 1e-6) return 0;
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h /= 6;
  return h < 0 ? h + 1 : h;
}
