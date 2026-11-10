// Register aller Bedienelemente. Oberfläche, MIDI, OSC und Pult greifen alle darauf zu.
// Jedes Element hat eine feste ID; Werte laufen immer von 0 bis 1.
import { TEMPO_FACTORS, TRANSITION_BEATS } from "./dmx";
import { STROBE_DIVISIONS, strobeHz } from "./audio";
import { recallScene, showBack, showGo, showStop, stepScene, type ControlContext } from "./control";
import { BLEND_MODES, COLOR_SOURCES, DRIVES, LASER_LIMITS, MAIN_STACK, MAX_IMAGES, MAX_LAYERS, SLOT_NAMES, allStacks, clamp01, imageList, selectCanvas, defaultLaser, stepTestPattern, type LaserSettings, type Rgb } from "./show";
import { EFFECT_BY_ID } from "./effects";
import { t } from "./i18n";

export const DRIVE_LABEL: Record<"auto" | "bpm" | "audio" | "static", string> = { auto: "Auto", bpm: t("Takt"), audio: "Audio", static: t("Statisch") };
const LASER_LABEL: Record<"y" | "x" | "size" | "thick" | "rot", string> = { y: t("Y (Höhe)"), x: t("X (Seite)"), size: t("Größe"), thick: t("Stärke"), rot: t("Drehung") };

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
  group: "Master" | "Strobe" | "Ebenen" | "Effekt" | "Tempo" | "Szenen" | "Clips" | "Farben" | "Show" | "Bilder";
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
const beatsLabel = (b: number): string => b === 0 ? t("Schnitt") : b < 1 ? `${b === 0.25 ? "¼" : "½"} Beat` : `${b} ${b === 1 ? "Beat" : "Beats"}`;

const on = (v: number): boolean => v >= 0.5;

export function buildControls(): ControlDef[] {
  const list: ControlDef[] = [
    { id: "master", label: "Master", group: "Master", kind: "fader", quick: true,
      get: c => c.show.master, set: (c, v) => { c.show.master = clamp01(v); } },
    { id: "blackout", label: "Blackout", group: "Master", kind: "toggle", quick: true,
      get: c => (c.show.blackout ? 1 : 0), set: (c, v) => { c.show.blackout = on(v); } },
    { id: "strobe.speed", label: t("Geschw."), group: "Strobe", kind: "fader", quick: true,
      get: c => c.show.strobe.speed, set: (c, v) => { c.show.strobe.speed = clamp01(v); },
      format: c => c.show.strobe.sync
        ? `${STROBE_DIVISIONS[stepIndex(c.show.strobe.speed, STROBE_DIVISIONS.length)]}×`
        : `${strobeHz(c.show.strobe, 120).toFixed(0)}Hz` },
    { id: "strobe.intensity", label: t("Intens."), group: "Strobe", kind: "fader", quick: true,
      get: c => c.show.strobe.intensity, set: (c, v) => { c.show.strobe.intensity = clamp01(v); } },
    { id: "strobe.on", label: "Strobe", group: "Strobe", kind: "toggle", quick: true,
      get: c => (c.show.strobe.on ? 1 : 0), set: (c, v) => { c.show.strobe.on = on(v); } },
    { id: "strobe.flash", label: "Flash", group: "Strobe", kind: "hold", quick: true,
      get: c => (c.show.strobe.flash ? 1 : 0), set: (c, v) => { c.show.strobe.flash = on(v); } },
    { id: "strobe.white", label: t("Weiß"), group: "Strobe", kind: "toggle", quick: true,
      get: c => (c.show.strobe.white ? 1 : 0), set: (c, v) => { c.show.strobe.white = on(v); } },
    { id: "strobe.whiteFlash", label: t("Weiß-Blitz"), group: "Strobe", kind: "hold", quick: true,
      get: c => (c.show.strobe.whiteFlash ? 1 : 0), set: (c, v) => { c.show.strobe.whiteFlash = on(v); } },
    { id: "blinder", label: "Blinder", group: "Strobe", kind: "hold", quick: true,
      get: c => (c.show.blinder ?? 0) >= 0.5 ? 1 : 0, set: (c, v) => { c.show.blinder = on(v) ? 1 : 0; } },
    { id: "strobe.sync", label: t("Takt"), group: "Strobe", kind: "toggle", quick: true,
      get: c => (c.show.strobe.sync ? 1 : 0), set: (c, v) => { c.show.strobe.sync = on(v); } },
    { id: "fx.master", label: t("Effekte"), group: "Effekt", kind: "fader", quick: true,
      get: c => c.show.fxMaster, set: (c, v) => { c.show.fxMaster = clamp01(v); } },
    { id: "tempo.tap", label: "Tap", group: "Tempo", kind: "trigger", quick: true,
      get: () => 0, set: (c, v) => { if (on(v)) c.tempo.tap(Date.now()); } },
    { id: "tempo.factor", label: "Tempo ×", group: "Tempo", kind: "fader", quick: false,
      get: c => Math.max(0, TEMPO_FACTORS.indexOf(c.tempo.factor as typeof TEMPO_FACTORS[number])) / (TEMPO_FACTORS.length - 1),
      set: (c, v) => { c.tempo.factor = TEMPO_FACTORS[stepIndex(v, TEMPO_FACTORS.length)]!; },
      format: c => `${c.tempo.factor}×` },
    { id: "transition.beats", label: t("Blende"), group: "Szenen", kind: "fader", quick: true,
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
    list.push({ id: `layer.${i + 1}.opacity`, label: t("E{n}", { n: i + 1 }), group: "Ebenen", kind: "fader", quick: true,
      get: c => c.show.layers[i]?.opacity ?? 0, set: (c, v) => { const l = c.show.layers[i]; if (l) l.opacity = clamp01(v); } });
    list.push(
      { id: `layer.${i + 1}.color`, label: t("E{n} Farbe", { n: i + 1 }), group: "Ebenen", kind: "fader", quick: false,
        get: c => Math.max(0, COLOR_SOURCES.indexOf(c.show.layers[i]?.colorSource ?? "original")) / (COLOR_SOURCES.length - 1),
        set: (c, v) => { const l = c.show.layers[i]; if (l) l.colorSource = COLOR_SOURCES[stepIndex(v, COLOR_SOURCES.length)]!; },
        format: c => c.show.layers[i]?.colorSource ?? "–" },
      { id: `layer.${i + 1}.blend`, label: t("E{n} Mischmodus", { n: i + 1 }), group: "Ebenen", kind: "fader", quick: false,
        get: c => Math.max(0, BLEND_MODES.indexOf(c.show.layers[i]?.blend ?? "normal")) / (BLEND_MODES.length - 1),
        set: (c, v) => { const l = c.show.layers[i]; if (l) l.blend = BLEND_MODES[stepIndex(v, BLEND_MODES.length)]!; },
        format: c => c.show.layers[i]?.blend ?? "–" },
      { id: `layer.${i + 1}.drive`, label: t("E{n} Antrieb", { n: i + 1 }), group: "Ebenen", kind: "fader", quick: false,
        get: c => Math.max(0, DRIVES.indexOf(c.show.layers[i]?.drive ?? "auto")) / (DRIVES.length - 1),
        set: (c, v) => { const l = c.show.layers[i]; if (l) l.drive = DRIVES[stepIndex(v, DRIVES.length)]!; },
        format: c => DRIVE_LABEL[c.show.layers[i]?.drive ?? "auto"] },
      ...(["y", "x", "size", "thick", "rot"] as const).map(k => ({
        id: `layer.${i + 1}.laser.${k}`, label: `${t("E{n}", { n: i + 1 })} ${k === "thick" ? "Laser " : ""}${LASER_LABEL[k]}`, group: "Ebenen" as const, kind: "fader" as const, quick: false,
        get: (c: ControlContext) => { const z = c.show.layers[i]?.laser ?? defaultLaser(); const [lo, hi] = LASER_LIMITS[k]; return clamp01(((z[k] ?? 0) - lo) / (hi - lo)); },
        set: (c: ControlContext, v: number) => {
          const l = c.show.layers[i]; if (!l) return;
          const [lo, hi] = LASER_LIMITS[k]; l.laser = { ...(l.laser ?? defaultLaser()), [k]: lo + clamp01(v) * (hi - lo) } as LaserSettings;
        },
      })),
      { id: `layer.${i + 1}.laser.xy`, label: `${t("E{n}", { n: i + 1 })} XY-Override`, group: "Ebenen", kind: "toggle", quick: false,
        get: c => (c.show.layers[i]?.laser?.override ? 1 : 0),
        set: (c, v) => { const l = c.show.layers[i]; if (l) l.laser = { ...(l.laser ?? defaultLaser()), override: on(v) }; } },
      { id: `layer.${i + 1}.clear`, label: t("E{n} Clip aus", { n: i + 1 }), group: "Ebenen", kind: "trigger", quick: false,
        get: c => (c.show.layers[i]?.clip ? 0 : 1), set: (c, v) => { const l = c.show.layers[i]; if (l && on(v)) l.clip = null; } },
    );
    for (let k = 0; k < 3; k++) {
      list.push({ id: `layer.${i + 1}.fx.${k + 1}`, label: `${t("E{n}", { n: i + 1 })} Fx${k + 1}`, group: "Ebenen", kind: "fader", quick: false,
        get: c => c.show.layers[i]?.effects[k]?.amount ?? 0,
        set: (c, v) => { const slot = c.show.layers[i]?.effects[k]; if (slot) slot.amount = clamp01(v); } });
    }
  }
  // Farbslots per Drehregler: Farbton bei voller Sättigung
  SLOT_NAMES.forEach((n, i) => {
    list.push({ id: `slot.${n}.hue`, label: t("Slot {n} Farbton", { n }), group: "Farben", kind: "fader", quick: false,
      get: c => hueOf(c.show.slots[i] ?? [1, 1, 1]), set: (c, v) => { c.show.slots[i] = hueRgb(v); } });
    (["Rot", "Grün", "Blau"] as const).forEach((name, k) => {
      list.push({ id: `slot.${n}.${"rgb"[k]}`, label: `Slot ${n} ${t(name)}`, group: "Farben", kind: "fader", quick: false,
        get: c => c.show.slots[i]?.[k] ?? 0,
        set: (c, v) => { const o = c.show.slots[i] ?? [0, 0, 0]; const nx: [number, number, number] = [o[0], o[1], o[2]]; nx[k] = clamp01(v); c.show.slots[i] = nx; } });
    });
  });
  list.push(
    { id: "show.go", label: t("WEITER"), group: "Show", kind: "trigger", quick: false,
      get: () => 0, set: (c, v) => { if (on(v)) showGo(c); } },
    { id: "show.back", label: t("Zurück"), group: "Show", kind: "trigger", quick: false,
      get: () => 0, set: (c, v) => { if (on(v)) showBack(c); } },
    { id: "show.stop", label: t("Alles stoppen"), group: "Show", kind: "trigger", quick: false,
      get: () => 0, set: (c, v) => { if (on(v)) showStop(c); } },
    { id: "tc.start", label: t("Timecode Start"), group: "Show", kind: "trigger", quick: false,
      get: c => (c.tc?.sending ? 1 : 0), set: (c, v) => { if (on(v)) c.tc?.start(Date.now()); } },
    { id: "tc.stop", label: t("Timecode Stopp"), group: "Show", kind: "trigger", quick: false,
      get: () => 0, set: (c, v) => { if (on(v)) c.tc?.stop(Date.now()); } },
    { id: "tc.zero", label: t("Timecode auf Start"), group: "Show", kind: "trigger", quick: false,
      get: () => 0, set: (c, v) => { if (on(v)) c.tc?.locate(0, Date.now()); } },
    { id: "test.toggle", label: t("Testbild"), group: "Master", kind: "toggle", quick: false,
      get: c => (c.show.testCard ? 1 : 0), set: (c, v) => { c.show.testCard = on(v); } },
    { id: "test.next", label: t("Nächstes Testbild"), group: "Master", kind: "trigger", quick: false,
      get: () => 0, set: (c, v) => { if (!on(v)) return; if (c.show.testCard) c.show.testPattern = stepTestPattern(c.show.testPattern, 1); else c.show.testCard = true; } },
    { id: "test.prev", label: t("Voriges Testbild"), group: "Master", kind: "trigger", quick: false,
      get: () => 0, set: (c, v) => { if (!on(v)) return; if (c.show.testCard) c.show.testPattern = stepTestPattern(c.show.testPattern, -1); else c.show.testCard = true; } },
  );
  list.push(
    { id: "scene.next", label: t("Weiter"), group: "Szenen", kind: "trigger", quick: false,
      get: () => 0, set: (c, v) => { if (on(v)) stepScene(c, 1); } },
    { id: "scene.prev", label: t("Zurück"), group: "Szenen", kind: "trigger", quick: false,
      get: () => 0, set: (c, v) => { if (on(v)) stepScene(c, -1); } },
    { id: "scene.auto", label: "Auto", group: "Szenen", kind: "toggle", quick: false,
      get: c => (c.show.autoVj ? 1 : 0), set: (c, v) => { c.show.autoVj = on(v); } },
  );
  // Die Leiste baut ihre Szenen-Tasten selbst aus der aktuellen Szenenliste.
  for (let i = 0; i < SCENE_SLOTS; i++) {
    list.push({ id: `scene.${i + 1}`, label: t("Szene {n}", { n: i + 1 }), group: "Szenen", kind: "trigger", quick: false,
      get: c => (c.show.scene === i + 1 ? 1 : 0), set: (c, v) => { if (on(v)) recallScene(c, i); },
      format: c => c.scenes[i]?.name ?? "–" });
  }
  return list;
}

/**
 * Feste Regler je Bild (Projektionsmapping): wirken immer auf dasselbe Bild, egal welches gerade bearbeitet wird.
 * „bild.N.hell“ Helligkeit, „bild.N.eK“ Deckkraft Ebene K, „bild.N.bearbeiten“ Bild zum Bearbeiten wählen.
 */
function imageControls(): ControlDef[] {
  const list: ControlDef[] = [];
  const imgId = (c: ControlContext, n: number): string | undefined => imageList(c.show)[n]?.id;
  for (let n = 0; n < MAX_IMAGES; n++) {
    list.push({ id: `bild.${n + 1}.hell`, label: t("Bild {n} Helligkeit", { n: n + 1 }), group: "Bilder", kind: "fader", quick: false,
      get: c => { const id = imgId(c, n); return id ? c.show.stackGain?.[id] ?? 1 : 0; },
      set: (c, v) => { const id = imgId(c, n); if (id) (c.show.stackGain ??= {})[id] = clamp01(v); } });
    list.push({ id: `bild.${n + 1}.bearbeiten`, label: t("Bild {n} bearbeiten", { n: n + 1 }), group: "Bilder", kind: "trigger", quick: false,
      get: c => (c.show.canvas ?? MAIN_STACK) === imgId(c, n) ? 1 : 0,
      set: (c, v) => { const id = imgId(c, n); if (id && on(v)) selectCanvas(c.show, id); } });
    for (let k = 0; k < MAX_LAYERS; k++) {
      list.push({ id: `bild.${n + 1}.e${k + 1}`, label: `${t("Bild {n}", { n: n + 1 })} ${t("E{n}", { n: k + 1 })}`, group: "Bilder", kind: "fader", quick: false,
        get: c => { const id = imgId(c, n); return (id ? allStacks(c.show)[id]?.[k]?.opacity : 0) ?? 0; },
        set: (c, v) => { const id = imgId(c, n); const l = id ? allStacks(c.show)[id]?.[k] : undefined; if (l) l.opacity = clamp01(v); } });
    }
  }
  return list;
}

export const CONTROLS: readonly ControlDef[] = [...buildControls(), ...imageControls()];
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
      id, label: `${t("E{n}", { n: li + 1 })} ${EFFECT_BY_ID.get(clip)?.name ?? (clip.startsWith("img:") ? t("Grafik") : clip)}`, group: "Clips",
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
