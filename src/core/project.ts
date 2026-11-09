// Projektdatei: Szenen, Ebenen, Farben, Grafik-Liste. Wird automatisch gespeichert und beim Start geladen.
import type { ControlContext } from "./control";
import { POST_BY_ID } from "./effects";
import { isValidMediaId, type MediaItem } from "./media";
import { parseMappings, type Mapping } from "./mapping";
import { FITS, newCue, type Cue, type VideoItem, type VideoSettings } from "./video";
import { defaultLayout, type OutputLayout } from "./layout";
import { parseMods, type Modulation } from "./modulation";
import { parseTextSpec } from "./text";
import {
  BLEND_MODES, COLOR_SOURCES_ALL, DRIVES, KEY_MODES, LASER_LIMITS, LAYER_COUNT, MAX_LAYERS, MAX_EFFECTS, MEDIA_ANIMS, clamp01, defaultLayer, defaultMedia,
  type EffectSlot, type LayerState, type MediaSettings, type Rgb, type Scene, type SceneNext, type SceneTransition,
} from "./show";

export const PROJECT_VERSION = 1;

export interface ProjectFile {
  version: number;
  layers: LayerState[];
  scenes: Scene[];
  slots: Rgb[];
  transitionBeats: number;
  fxMaster: number;
  strobe: { speed: number; intensity: number; sync: boolean };
  media: MediaItem[];
  videos: VideoItem[];
  /** SHOW-Ablauf */
  cues: Cue[];
  /** Anordnung der Ausgänge */
  outputs: OutputLayout;
  /** Fehlt in alten Dateien: dann gilt die Standard-Tastenbelegung. */
  mappings?: Mapping[];
  /** Modulationen (LFO, Audio) an Reglern. */
  mods?: Modulation[];
}

export function serializeProject(c: ControlContext, media: readonly MediaItem[], mappings: readonly Mapping[] = [], videos: readonly VideoItem[] = [], outputs: OutputLayout = defaultLayout()): string {
  const s = c.show;
  const p: ProjectFile = {
    version: PROJECT_VERSION,
    layers: s.layers, scenes: c.scenes, slots: s.slots, transitionBeats: s.transitionBeats, fxMaster: s.fxMaster,
    strobe: { speed: s.strobe.speed, intensity: s.strobe.intensity, sync: s.strobe.sync },
    media: [...media],
    videos: [...videos],
    cues: c.cues.list,
    outputs,
    mappings: [...mappings],
    mods: [...(c.mods ?? [])],
  };
  return JSON.stringify(p);
}

// ---- Prüfen: alles, was aus einer Datei kommt, wird auf bekannte Felder und Wertebereiche gebracht ----
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown, d: number, lo = -Infinity, hi = Infinity): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
const oneOf = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);
const str = (v: unknown, d: string, max = 80): string => (typeof v === "string" ? v.slice(0, max) : d);

function clip(v: unknown): string | null {
  if (typeof v !== "string") return null;
  if (v.startsWith("img:") || v.startsWith("vid:")) return isValidMediaId(v.slice(4)) ? v : null;
  return /^[a-z0-9-]{1,40}$/.test(v) ? v : null;
}

function effects(v: unknown): EffectSlot[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v.filter(isObj).filter(e => POST_BY_ID.has(e.id as string)).slice(0, MAX_EFFECTS)
    .map(e => ({ id: e.id as string, on: e.on !== false, amount: clamp01(num(e.amount, 0)) }));
}

function media(v: unknown): MediaSettings | undefined {
  if (!isObj(v)) return undefined;
  const d = defaultMedia();
  return {
    scale: num(v.scale, d.scale, 0.02, 4), x: num(v.x, d.x, -2, 2), y: num(v.y, d.y, -2, 2),
    rotation: num(v.rotation, d.rotation, -360, 360), anim: oneOf(v.anim, MEDIA_ANIMS, d.anim),
    animAmount: clamp01(num(v.animAmount, d.animAmount)), animBeats: num(v.animBeats, d.animBeats, 0.25, 16),
    keyMode: oneOf(v.keyMode, KEY_MODES, d.keyMode), keyTol: clamp01(num(v.keyTol, d.keyTol)),
  };
}

function video(v: unknown): VideoSettings | undefined {
  if (!isObj(v)) return undefined;
  return {
    loopIn: num(v.loopIn, 0, 0, 86400), loopOut: num(v.loopOut, 0, 0, 86400),
    beats: oneOf(String(num(v.beats, 0)), ["0", "4", "8", "16", "32"] as const, "0") === "0" ? 0 : num(v.beats, 0),
    fit: oneOf(v.fit, FITS, "fill"), sound: v.sound === true,
  };
}

function cue(v: unknown): Cue | null {
  if (!isObj(v) || typeof v.id !== "string" || !/^[a-z0-9]{3,24}$/.test(v.id)) return null;
  const kind = oneOf(v.kind, ["video", "image", "black", "scene", "tcsignal"] as const, "black");
  const c = newCue(kind, str(v.name, "Cue", 60) || "Cue", clip(v.media), v.id);
  c.scene = num(v.scene, 1, 1, 999);
  c.start = oneOf(v.start, ["manual", "after", "with", "timecode"] as const, "manual");
  c.wait = num(v.wait, 0, 0, 3600);
  c.trimIn = num(v.trimIn, 0, 0, 86400); c.trimOut = num(v.trimOut, 0, 0, 86400);
  c.loop = oneOf(v.loop, ["off", "count", "untilGo", "forever"] as const, "off");
  c.loopCount = num(v.loopCount, 2, 1, 999);
  c.loopRange = v.loopRange === true;
  c.loopIn = num(v.loopIn, 0, 0, 86400); c.loopOut = num(v.loopOut, 0, 0, 86400);
  c.end = oneOf(v.end, ["hold", "fade", "next"] as const, "hold");
  c.fadeIn = num(v.fadeIn, 0.5, 0, 60); c.fadeOut = num(v.fadeOut, 1, 0, 60);
  c.hold = num(v.hold, 0, 0, 86400);
  c.volume = clamp01(num(v.volume, 1));
  c.fit = oneOf(v.fit, FITS, "fill");
  c.over = oneOf(v.over, ["replace", "over"] as const, "replace");
  c.tcAction = oneOf(v.tcAction, ["start", "stop", "locate"] as const, "start");
  c.tcTarget = typeof v.tcTarget === "string" && /^\d{2}:\d{2}:\d{2}[:;]\d{2}$/.test(v.tcTarget) ? v.tcTarget : "00:00:00:00";
  c.tc = typeof v.tc === "string" && /^\d{2}:\d{2}:\d{2}[:;]\d{2}$/.test(v.tc) ? v.tc : "00:00:00:00";
  return c;
}

function layout(v: unknown): OutputLayout {
  if (!isObj(v)) return defaultLayout();
  const screens = (Array.isArray(v.screens) ? v.screens : []).filter(isObj).slice(0, 16).map(s => ({
    id: num(s.id, 0, -1e12, 1e12), label: str(s.label, "Bildschirm", 60),
    x: num(s.x, 0, -32768, 32768), y: num(s.y, 0, -32768, 32768), w: num(s.w, 1920, 16, 16384), h: num(s.h, 1080, 16, 16384),
  }));
  return { mode: oneOf(v.mode, ["mirror", "canvas"] as const, "mirror"), screens };
}

/** Teil-Ebene (für Szenen): nur Felder übernehmen, die gültig vorhanden sind. */
function partialLayer(v: unknown): Partial<LayerState> | null {
  if (!isObj(v)) return null;
  const out: Partial<LayerState> = {};
  if ("clip" in v) out.clip = clip(v.clip);
  if (Array.isArray(v.clips)) out.clips = [...new Set(v.clips.map(clip).filter((c): c is string => !!c))].slice(0, 128);
  if ("opacity" in v) out.opacity = clamp01(num(v.opacity, 1));
  if ("blend" in v) out.blend = oneOf(v.blend, BLEND_MODES, "normal");
  if ("colorSource" in v) out.colorSource = oneOf(v.colorSource, COLOR_SOURCES_ALL, "original");
  if (Array.isArray(v.colorSlots)) {
    const ids = [...new Set(v.colorSlots.filter((x): x is number => Number.isInteger(x) && (x as number) >= 0 && (x as number) <= 4))].slice(0, 5);
    if (ids.length) out.colorSlots = ids;
  }
  if ("drive" in v) out.drive = oneOf(v.drive, DRIVES, "auto");
  if (isObj(v.laser)) {
    const L = LASER_LIMITS, z = v.laser;
    // Ältere Projekte: Y 0,3 war die Vorgabe für „oberes Drittel“; das ist jetzt eingebaut, also 0
    const oldDefault = !("rot" in z) && z.y === 0.3;
    out.laser = {
      x: num(z.x, 0, L.x[0], L.x[1]), y: oldDefault ? 0 : num(z.y, 0, L.y[0], L.y[1]), size: num(z.size, 1, L.size[0], L.size[1]),
      thick: num(z.thick, 1, L.thick[0], L.thick[1]), rot: num(z.rot, 0, L.rot[0], L.rot[1]), override: z.override === true,
    };
  }
  if ("speed" in v) out.speed = num(v.speed, 1, -4, 4);
  if ("strobe" in v) out.strobe = num(v.strobe, 0, 0, 8);
  const fx = effects(v.effects); if (fx) out.effects = fx;
  const md = media(v.media); if (md) out.media = md;
  const vd = video(v.video); if (vd) out.video = vd;
  return out;
}

function fullLayer(v: unknown): LayerState {
  return { ...defaultLayer(), ...(partialLayer(v) ?? {}) };
}

function transition(v: unknown): SceneTransition | undefined {
  if (!isObj(v)) return undefined;
  return { unit: oneOf(v.unit, ["beats", "seconds"] as const, "beats"), value: num(v.value, 1, 0, 600), style: oneOf(v.style, ["fade", "black"] as const, "fade") };
}
function next(v: unknown): SceneNext | undefined {
  if (!isObj(v)) return undefined;
  return { after: oneOf(v.after, ["off", "bars", "seconds", "phrase"] as const, "off"), value: num(v.value, 16, 0, 3600) };
}

function rgb(v: unknown): Rgb | null {
  return Array.isArray(v) && v.length === 3 && v.every(x => typeof x === "number")
    ? [clamp01(v[0] as number), clamp01(v[1] as number), clamp01(v[2] as number)] : null;
}

/** Projekt lesen. Unbrauchbare Dateien ergeben null, einzelne kaputte Felder werden ersetzt. */
export function parseProject(json: string): ProjectFile | null {
  let raw: unknown;
  try { raw = JSON.parse(json); } catch { return null; }
  if (!isObj(raw) || raw.version !== PROJECT_VERSION) return null;
  const nLayers = Array.isArray(raw.layers) ? Math.min(MAX_LAYERS, Math.max(1, raw.layers.length)) : LAYER_COUNT;
  const layers = Array.from({ length: nLayers }, (_, i) => fullLayer(Array.isArray(raw.layers) ? raw.layers[i] : null));
  // Ältere Projekte ohne eigene Zeilen: alle Generatoren und alle Grafiken in jeder Ebene (wie vorher)
  const oldMedia = (Array.isArray(raw.media) ? raw.media : []).filter(isObj).map(m => m.id).filter(isValidMediaId).map(id => `img:${id}`);
  layers.forEach((l, i) => {
    const r = Array.isArray(raw.layers) ? raw.layers[i] : null;
    if (!isObj(r) || !Array.isArray(r.clips)) l.clips = [...l.clips, ...oldMedia];
  });
  const scenes: Scene[] = (Array.isArray(raw.scenes) ? raw.scenes : []).filter(isObj).slice(0, 128).map((sc, i) => ({
    name: str(sc.name, `Szene ${i + 1}`, 40) || `Szene ${i + 1}`,
    layers: Array.from({ length: Math.min(MAX_LAYERS, Array.isArray(sc.layers) ? sc.layers.length : 0) }, (_, k) => partialLayer((sc.layers as unknown[])[k])),
    transition: transition(sc.transition),
    next: next(sc.next),
  }));
  const slots = Array.from({ length: 5 }, (_, i) => rgb(Array.isArray(raw.slots) ? raw.slots[i] : null) ?? [1, 1, 1] as Rgb);
  const st = isObj(raw.strobe) ? raw.strobe : {};
  const mediaList: MediaItem[] = (Array.isArray(raw.media) ? raw.media : []).filter(isObj)
    .filter(m => isValidMediaId(m.id)).map(m => ({
      id: m.id as string, name: str(m.name, "Grafik", 80), width: num(m.width, 512, 1, 16384), height: num(m.height, 512, 1, 16384),
      ...(parseTextSpec(m.text) ? { text: parseTextSpec(m.text)! } : {}),
    }));
  return {
    version: PROJECT_VERSION, layers, scenes, slots,
    transitionBeats: num(raw.transitionBeats, 1, 0, 8), fxMaster: clamp01(num(raw.fxMaster, 1)),
    strobe: { speed: clamp01(num(st.speed, 0.5)), intensity: clamp01(num(st.intensity, 1)), sync: st.sync !== false },
    media: mediaList,
    mappings: parseMappings(raw.mappings) ?? undefined,
    videos: (Array.isArray(raw.videos) ? raw.videos : []).filter(isObj).filter(m => isValidMediaId(m.id)).map(m => ({
      id: m.id as string, name: str(m.name, "Video", 80), ext: oneOf(m.ext, ["mp4", "m4v", "mov", "webm"] as const, "mp4"),
      duration: num(m.duration, 0, 0, 86400), width: num(m.width, 0, 0, 16384), height: num(m.height, 0, 0, 16384),
    })),
    cues: (Array.isArray(raw.cues) ? raw.cues : []).map(cue).filter((x): x is Cue => !!x).slice(0, 500),
    outputs: layout(raw.outputs),
    mods: parseMods(raw.mods),
  };
}

/** Geladenes Projekt übernehmen. Die Szenenliste wird an Ort und Stelle ersetzt (DMX-Decoder hält sie). */
export function applyProject(c: ControlContext, p: ProjectFile): void {
  const s = c.show;
  s.layers = p.layers;
  c.scenes.splice(0, c.scenes.length, ...p.scenes);
  s.slots = p.slots;
  s.transitionBeats = p.transitionBeats;
  s.fxMaster = p.fxMaster;
  Object.assign(s.strobe, p.strobe);
  s.scene = 0;
  s.transition = null;
  c.cues.list = p.cues;
  c.cues.run = { active: [], next: 0, current: -1 };
  // An Ort und Stelle ersetzen (die Oberfläche hält die Liste)
  if (c.mods) c.mods.splice(0, c.mods.length, ...(p.mods ?? [])); else c.mods = [...(p.mods ?? [])];
}
