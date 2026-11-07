// Register aller Bedienelemente. Oberfläche, MIDI, OSC und Pult greifen alle darauf zu.
// Jedes Element hat eine feste ID; Werte laufen immer von 0 bis 1.
import { TEMPO_FACTORS, TRANSITION_BEATS } from "./dmx";
import { STROBE_DIVISIONS, strobeHz } from "./audio";
import { recallScene, type ControlContext } from "./control";
import { DEFAULT_SCENES, LAYER_COUNT, clamp01 } from "./show";

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
  group: "Master" | "Strobe" | "Ebenen" | "Effekt" | "Tempo" | "Szenen";
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

  for (let i = 0; i < LAYER_COUNT; i++) {
    list.push({ id: `layer.${i + 1}.opacity`, label: `E${i + 1}`, group: "Ebenen", kind: "fader", quick: true,
      get: c => c.show.layers[i]!.opacity, set: (c, v) => { c.show.layers[i]!.opacity = clamp01(v); } });
    for (let k = 0; k < 3; k++) {
      list.push({ id: `layer.${i + 1}.fx.${k + 1}`, label: `E${i + 1} Fx${k + 1}`, group: "Ebenen", kind: "fader", quick: false,
        get: c => c.show.layers[i]!.effects[k]?.amount ?? 0,
        set: (c, v) => { const slot = c.show.layers[i]!.effects[k]; if (slot) slot.amount = clamp01(v); } });
    }
  }
  DEFAULT_SCENES.forEach((s, i) => {
    list.push({ id: `scene.${i + 1}`, label: s.name, group: "Szenen", kind: "trigger", quick: true,
      get: c => (c.show.scene === i + 1 ? 1 : 0), set: (c, v) => { if (on(v)) recallScene(c, i); } });
  });
  return list;
}

export const CONTROLS: readonly ControlDef[] = buildControls();
export const CONTROL_BY_ID: ReadonlyMap<string, ControlDef> = new Map(CONTROLS.map(c => [c.id, c]));

/** Wert setzen. Gibt false zurück, wenn die ID unbekannt ist. */
export function setControl(c: ControlContext, id: string, value: number): boolean {
  const def = CONTROL_BY_ID.get(id);
  if (!def || !Number.isFinite(value)) return false;
  def.set(c, value);
  return true;
}

/** MIDI-Wert 0–127 in 0–1 umrechnen. */
export const fromMidi = (v: number): number => clamp01(v / 127);
