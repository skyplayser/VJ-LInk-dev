// Projektdatei: Szenen, Ebenen, Farben, Grafik-Liste. Wird automatisch gespeichert und beim Start geladen.
import { CAM_LOOKS, defaultCam, isValidCamId, type CamSettings, type CameraSource } from "./camera";
import type { ControlContext } from "./control";
import { POST_BY_ID } from "./effects";
import { isValidMediaId, type MediaItem } from "./media";
import { parseMappings, type Mapping } from "./mapping";
import { FITS, newCue, type Cue, type VideoItem, type VideoSettings } from "./video";
import { defaultLayout, type OutputLayout } from "./layout";
import { parseMods, type Modulation } from "./modulation";
import { parseTextSpec } from "./text";
import {
  BLEND_MODES, COLOR_SOURCES_ALL, mainLayers, DRIVES, KEY_MODES, LASER_LIMITS, LAYER_COUNT, MAX_LAYERS, MAX_EFFECTS, MEDIA_ANIMS, clamp01, defaultLayer, defaultMedia,
  type EffectSlot, type LayerState, type MediaSettings, type Rgb, type Scene, type SceneNext, type SceneTransition,
} from "./show";

export const PROJECT_VERSION = 1;

export interface ProjectFile {
  version: number;
  layers: LayerState[];
  /** Eigene Ebenen der Bilder (Projektionsmapping), je Bild-ID. */
  stacks?: Record<string, LayerState[]>;
  /** Bilder (Projektionsmapping): Reihenfolge und Namen. */
  images?: { id: string; name: string }[];
  scenes: Scene[];
  slots: Rgb[];
  transitionBeats: number;
  fxMaster: number;
  strobe: { speed: number; intensity: number; sync: boolean };
  media: MediaItem[];
  videos: VideoItem[];
  /** SHOW-Ablauf */
  cues: Cue[];
  /** Kameras und Video-Eingänge */
  cameras?: CameraSource[];
  /** Anordnung der Ausgänge */
  outputs: OutputLayout;
  /** Fehlt in alten Dateien: dann gilt die Standard-Tastenbelegung. */
  mappings?: Mapping[];
  /** Modulationen (LFO, Audio) an Reglern. */
  mods?: Modulation[];
  /** Bühnenfotos je Beamer (Hilfe im Mapping-Editor). */
  photos?: Record<string, { url: string; opacity: number }>;
}

export function serializeProject(c: ControlContext, media: readonly MediaItem[], mappings: readonly Mapping[] = [], videos: readonly VideoItem[] = [], outputs: OutputLayout = defaultLayout()): string {
  const s = c.show;
  const p: ProjectFile = {
    version: PROJECT_VERSION,
    layers: mainLayers(s), stacks: sideStacks(s), images: s.images, scenes: c.scenes, slots: s.slots, transitionBeats: s.transitionBeats, fxMaster: s.fxMaster,
    strobe: { speed: s.strobe.speed, intensity: s.strobe.intensity, sync: s.strobe.sync },
    media: [...media],
    videos: [...videos],
    cues: c.cues.list,
    cameras: s.cameras,
    outputs,
    mappings: [...mappings],
    mods: [...(c.mods ?? [])],
    ...(c.photos && Object.keys(c.photos).length ? { photos: c.photos } : {}),
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
  if (v.startsWith("cam:")) return isValidCamId(v.slice(4)) ? v : null;
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

function cam(v: unknown): CamSettings | undefined {
  if (!isObj(v)) return undefined;
  const d = defaultCam();
  return { mirror: v.mirror === true, look: oneOf(v.look, CAM_LOOKS, d.look), tol: clamp01(num(v.tol, d.tol)), bgStamp: num(v.bgStamp, 0, 0, 1e15),
    cells: num(v.cells, d.cells, 12, 160), onlyFig: v.onlyFig === true };
}

function cue(v: unknown): Cue | null {
  if (!isObj(v) || typeof v.id !== "string" || !/^[a-z0-9]{3,24}$/.test(v.id)) return null;
  const kind = oneOf(v.kind, ["video", "image", "camera", "black", "scene", "tcsignal"] as const, "black");
  const c = newCue(kind, str(v.name, "Cue", 60) || "Cue", clip(v.media), v.id);
  c.scene = num(v.scene, 1, 1, 999);
  if (v.timeline === true) c.timeline = true;
  if (Array.isArray(v.marks)) c.marks = v.marks.filter(isObj).slice(0, 200)
    .map(m => ({ t: num(m.t, 0, 0, 86400), scene: Math.round(num(m.scene, 1, 1, 999)), others: m.others !== false,
      ...(typeof m.len === "number" && m.len > 0 ? { len: num(m.len, 1, 0.05, 86400) } : {}),
      ...(typeof m.level === "number" ? { level: num(m.level, 1, 0, 1) } : {}) }));
  if (Array.isArray(v.fx)) c.fx = v.fx.filter(isObj).slice(0, 400).map(b => ({
    t: num(b.t, 0, 0, 86400), len: num(b.len, 1, 0.05, 86400),
    kind: oneOf(b.kind, ["strobe", "flash", "white", "wflash", "blinder", "blackout"] as const, "strobe"),
  }));
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
  const cl = (x: unknown, d: number) => num(x, d, -0.5, 1.5);
  const surfaces = (Array.isArray(v.surfaces) ? v.surfaces : []).filter(isObj).slice(0, 64).map((s, i) => {
    const cs = Array.isArray(s.corners) && s.corners.length === 4 ? s.corners : [[0, 0], [1, 0], [1, 1], [0, 1]];
    const src = isObj(s.src) ? s.src : {};
    return {
      id: str(s.id, `s${i}`, 40) || `s${i}`, screen: num(s.screen, 0, -1e12, 1e12), name: str(s.name, `Leinwand ${i + 1}`, 40),
      corners: cs.map((c: unknown) => Array.isArray(c) ? [cl(c[0], 0), cl(c[1], 0)] as [number, number] : [0, 0] as [number, number]),
      src: { x: num(src.x, 0, 0, 1), y: num(src.y, 0, 0, 1), w: num(src.w, 1, 0.01, 1), h: num(src.h, 1, 0.01, 1) },
      on: s.on !== false,
      ...(isObj(s.grid) && (s.grid.n === 3 || s.grid.n === 5) && Array.isArray(s.grid.pts) && s.grid.pts.length === (s.grid.n as number) ** 2
        ? { grid: { n: s.grid.n as number, pts: (s.grid.pts as unknown[]).map(c => Array.isArray(c) ? [cl(c[0], 0), cl(c[1], 0)] as [number, number] : [0, 0] as [number, number]) } } : {}),
      // Ältere Projekte: „eigene Ebenen“ lagen unter der Leinwand-ID; die wird jetzt ein Bild
      image: s.content === "own" ? str(s.id, "main", 40) : typeof s.image === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(s.image) ? s.image : "main",
    };
  });
  const masks = (Array.isArray(v.masks) ? v.masks : []).filter(isObj).slice(0, 64).map((m, i) => ({
    id: str(m.id, `m${i}`, 40) || `m${i}`, screen: num(m.screen, 0, -1e12, 1e12), name: str(m.name, `Maske ${i + 1}`, 40),
    pts: (Array.isArray(m.pts) ? m.pts : []).slice(0, 32).map((c: unknown) => Array.isArray(c) ? [cl(c[0], 0.5), cl(c[1], 0.5)] as [number, number] : [0.5, 0.5] as [number, number]),
    invert: m.invert === true, feather: num(m.feather, 0, 0, 400), on: m.on !== false,
  })).filter(m => m.pts.length >= 3);
  return { mode: oneOf(v.mode, ["mirror", "canvas", "mapping"] as const, "mirror"), screens, surfaces, masks };
}

/** Leinwand-IDs: kurz und schlicht. */
const okStackId = (id: string): boolean => /^[A-Za-z0-9_-]{1,40}$/.test(id) && id !== "main";

/** Leinwand-Stapel ohne Hauptbild (zum Speichern). */
function sideStacks(s: import("./show").ShowState): Record<string, LayerState[]> | undefined {
  const out: Record<string, LayerState[]> = {};
  for (const [id, st] of Object.entries(s.stacks ?? {})) if (id !== "main" && st !== mainLayers(s)) out[id] = st;
  return Object.keys(out).length ? out : undefined;
}

/** Teil-Ebene (für Szenen): nur Felder übernehmen, die gültig vorhanden sind. */
function partialLayer(v: unknown): Partial<LayerState> | null {
  if (!isObj(v)) return null;
  const out: Partial<LayerState> = {};
  if ("clip" in v) out.clip = clip(v.clip);
  if (typeof v.name === "string") out.name = v.name.slice(0, 24);
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
  const cm = cam(v.cam); if (cm) out.cam = cm;
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
    ...(isObj(sc.stacks) ? { stacks: Object.fromEntries(Object.entries(sc.stacks).filter(([id, v]) => okStackId(id) && Array.isArray(v)).slice(0, 64)
      .map(([id, v]) => [id, (v as unknown[]).slice(0, MAX_LAYERS).map(partialLayer)])) } : {}),
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
    cameras: (Array.isArray(raw.cameras) ? raw.cameras : []).filter(isObj).filter(m => isValidCamId(m.id) && typeof m.deviceId === "string")
      .slice(0, 16).map(m => ({ id: m.id as string, deviceId: (m.deviceId as string).slice(0, 200), label: str(m.label, "", 120) })),
    outputs: layout(raw.outputs),
    ...(Array.isArray(raw.images) ? { images: raw.images.filter(isObj).filter(i => typeof i.id === "string" && (i.id === "main" || okStackId(i.id))).slice(0, 5)
      .map(i => ({ id: i.id as string, name: str(i.name, "Bild", 30) || "Bild" })) } : {}),
    ...(isObj(raw.stacks) ? { stacks: Object.fromEntries(Object.entries(raw.stacks).filter(([id, v]) => okStackId(id) && Array.isArray(v) && v.length).slice(0, 64)
      .map(([id, v]) => [id, (v as unknown[]).slice(0, MAX_LAYERS).map(fullLayer)])) } : {}),
    mods: parseMods(raw.mods),
    ...(isObj(raw.photos) ? { photos: Object.fromEntries(Object.entries(raw.photos).filter(([k, v]) => /^-?\d{1,14}$/.test(k) && isObj(v)
      && typeof v.url === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(v.url) && v.url.length < 4_000_000).slice(0, 16)
      .map(([k, v]) => [k, { url: (v as { url: string }).url, opacity: clamp01(num((v as { opacity?: unknown }).opacity, 0.6)) }])) } : {}),
  };
}

/** Geladenes Projekt übernehmen. Die Szenenliste wird an Ort und Stelle ersetzt (DMX-Decoder hält sie). */
export function applyProject(c: ControlContext, p: ProjectFile): void {
  const s = c.show;
  s.layers = p.layers;
  s.canvas = "main";
  s.stacks = { main: p.layers, ...(p.stacks ?? {}) };
  // Bilder: gespeicherte Liste; ältere Projekte: jeder Leinwand-Stapel wird ein Bild
  const names = new Map((p.images ?? []).map(i => [i.id, i.name]));
  s.images = [{ id: "main", name: names.get("main") ?? "Bild 1" },
    ...Object.keys(p.stacks ?? {}).slice(0, 4).map((id, k) => ({ id, name: names.get(id) ?? p.outputs.surfaces?.find(sf => sf.id === id)?.name ?? `Bild ${k + 2}` }))];
  c.scenes.splice(0, c.scenes.length, ...p.scenes);
  s.slots = p.slots;
  s.transitionBeats = p.transitionBeats;
  s.fxMaster = p.fxMaster;
  Object.assign(s.strobe, p.strobe);
  s.scene = 0;
  s.transition = null;
  c.cues.list = p.cues;
  s.cameras = p.cameras ?? [];
  c.cues.run = { active: [], next: 0, current: -1 };
  c.photos = p.photos ?? {};
  // An Ort und Stelle ersetzen (die Oberfläche hält die Liste)
  if (c.mods) c.mods.splice(0, c.mods.length, ...(p.mods ?? [])); else c.mods = [...(p.mods ?? [])];
}
