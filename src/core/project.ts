// Projektdatei: Szenen, Ebenen, Farben, Grafik-Liste. Wird automatisch gespeichert und beim Start geladen.
import type { ControlContext } from "./control";
import { POST_BY_ID } from "./effects";
import { isValidMediaId, type MediaItem } from "./media";
import { parseMappings, type Mapping } from "./mapping";
import {
  BLEND_MODES, COLOR_SOURCES, KEY_MODES, LAYER_COUNT, MAX_LAYERS, MAX_EFFECTS, MEDIA_ANIMS, clamp01, defaultLayer, defaultMedia,
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
  /** Fehlt in alten Dateien: dann gilt die Standard-Tastenbelegung. */
  mappings?: Mapping[];
}

export function serializeProject(c: ControlContext, media: readonly MediaItem[], mappings: readonly Mapping[] = []): string {
  const s = c.show;
  const p: ProjectFile = {
    version: PROJECT_VERSION,
    layers: s.layers, scenes: c.scenes, slots: s.slots, transitionBeats: s.transitionBeats, fxMaster: s.fxMaster,
    strobe: { speed: s.strobe.speed, intensity: s.strobe.intensity, sync: s.strobe.sync },
    media: [...media],
    mappings: [...mappings],
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
  if (v.startsWith("img:")) return isValidMediaId(v.slice(4)) ? v : null;
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

/** Teil-Ebene (für Szenen): nur Felder übernehmen, die gültig vorhanden sind. */
function partialLayer(v: unknown): Partial<LayerState> | null {
  if (!isObj(v)) return null;
  const out: Partial<LayerState> = {};
  if ("clip" in v) out.clip = clip(v.clip);
  if (Array.isArray(v.clips)) out.clips = [...new Set(v.clips.map(clip).filter((c): c is string => !!c))].slice(0, 128);
  if ("opacity" in v) out.opacity = clamp01(num(v.opacity, 1));
  if ("blend" in v) out.blend = oneOf(v.blend, BLEND_MODES, "normal");
  if ("colorSource" in v) out.colorSource = oneOf(v.colorSource, COLOR_SOURCES, "original");
  if ("speed" in v) out.speed = num(v.speed, 1, -4, 4);
  if ("strobe" in v) out.strobe = num(v.strobe, 0, 0, 8);
  const fx = effects(v.effects); if (fx) out.effects = fx;
  const md = media(v.media); if (md) out.media = md;
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
    }));
  return {
    version: PROJECT_VERSION, layers, scenes, slots,
    transitionBeats: num(raw.transitionBeats, 1, 0, 8), fxMaster: clamp01(num(raw.fxMaster, 1)),
    strobe: { speed: clamp01(num(st.speed, 0.5)), intensity: clamp01(num(st.intensity, 1)), sync: st.sync !== false },
    media: mediaList,
    mappings: parseMappings(raw.mappings) ?? undefined,
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
}
