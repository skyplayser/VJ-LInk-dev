// Hauptfenster: Show-Zustand, Eingänge und Oberfläche.
import { Engine } from "../engine/engine";
import { GEN_IDS } from "../engine/shaders";
import { TempoClock } from "../core/tempo";
import { DmxDecoder, DMX_MODE_STANDARD_CHANNELS, CH, channelListCsv } from "../core/dmx";
import { handleLj, handleOsc, recallScene, tickAuto, tickTransition, tickVideoStarts, type ControlContext } from "../core/control";
import { CLUB_STANDARD_RULES, newLjState, parseLjMessage } from "../core/ljlink";
import { EFFECTS, EFFECT_BY_ID, READY_GENERATORS, type EffectCategory } from "../core/effects";
import { BLEND_MODES, COLOR_SOURCES_ALL, DRIVES, type Drive, MAX_LAYERS, addClip, addLayer, defaultScenes, removeClip, removeLayer, SLOT_NAMES, defaultShow, type BlendMode, type ColorSource } from "../core/show";
import { LedFeedback, MappingTable, MidiClock, defaultKeyMappings, oscValue, parseMidi, type MapProtocol } from "../core/mapping";
import { MapMode } from "./mapmode";
import { LibraryPanel } from "./librarypanel";
import { AudioIn } from "./audioin";
import { OutputTab } from "./outputtab";
import { canvasBounds, defaultLayout, type OutputLayout } from "../core/layout";
import { TimecodeClock, MtcDecoder, formatFrames, parseTc, tcToFrames } from "../core/timecode";
import { TcPanel, defaultTcSettings, type TcSettings } from "./tcpanel";
import { cueRenders, cueTick, isVideoClip, newCueState, videoClip, videoIdOf, type CueEnv } from "../core/video";
import { VideoLibrary, isVideoFile } from "./videolib";
import { VideoPool } from "./videopool";
import { VideoPanel } from "./videopanel";
import { ShowTab } from "./showtab";
import { AUDIO_CLIPS, micDrives } from "../core/audio";
import { MidiIn } from "./midi";
import type { TempoSource } from "../core/tempo";
import { WINDOW_SIZES, frameBeat, type ControlEvent, type DisplayInfo, type Frame, type NetStatus } from "../core/frame";
import { bridge } from "./bridge";
import { resolveControl, setControl } from "../core/controls";
import { buildDeck } from "./deck";
import { ThumbView } from "./thumbs";
import { MediaLibrary } from "./medialib";
import { MediaPanel } from "./mediapanel";
import { ScenePanel } from "./scenepanel";
import { mediaClip } from "../core/media";
import { applyProject, parseProject, serializeProject } from "../core/project";
import { hashText } from "../core/projectfile";
import type { ProjectFileCmd } from "../core/frame";
import { stepScene } from "../core/control";
import { FxPanel } from "./fxpanel";
import { LayerPanel } from "./layerpanel";
import { MAIN_STACK, MAX_IMAGES, addImage, addLayer as addShowLayer, dropCanvas, imageList, layerName, removeImage, selectCanvas, syncStacks, type ShowState } from "../core/show";
import { ShowLock } from "./lock";
import vjlinkLogo from "../../assets/logo-for-dark.png";
import { drawText } from "./texteditor";
import { defaultText } from "../core/text";
import { TextEditor } from "./texteditor";
import { textName } from "../core/text";
import { DRIVE_LABEL } from "../core/controls";
const DRIVE_ICON: Record<Drive, string> = { auto: "◎", bpm: "♩", audio: "∿", static: "—" };
import { ModMode } from "./modmode";
import { modulatedShow } from "../core/modulation";
import { timelineOverride } from "../core/video";
import { KickDetector, liveBands } from "../core/audio";
const kickDet = new KickDetector();
import { LayerClock, TEST_IDS, TEST_PATTERNS, stepTestPattern, transitionProgress } from "../core/show";

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e;
};

// ---- Einstellungen (nur Komfort, Oberfläche funktioniert auch ohne) -------------------
interface Settings {
  universe: number; sacn: number; address: number; uiScale: "auto" | number;
  audioDevice: string; audioGain: number; audioScope: "audio" | "all"; audioOut: string;
  tc: TcSettings;
  /** Rechner mit LJ-Link PRO; leer = dieser Rechner. */
  ljHost: string;
}
function loadSettings(): Settings {
  const d: Settings = { universe: 0, sacn: 1, address: 1, uiScale: "auto", audioDevice: "", audioGain: 1, audioScope: "audio", audioOut: "", tc: defaultTcSettings(), ljHost: "" };
  try {
    const raw = JSON.parse(localStorage.getItem("vjlink.settings") ?? "{}") as Partial<Settings>;
    return { ...d, ...raw, tc: { ...d.tc, ...(raw.tc ?? {}) } };
  } catch { return d; }
}
const settings = loadSettings();
function saveSettings(): void { try { localStorage.setItem("vjlink.settings", JSON.stringify(settings)); } catch { /* ohne Speicher weiter */ } }

// ---- Timecode -------------------------------------------------------------------------
const tcClock = new TimecodeClock();

// ---- Zustand --------------------------------------------------------------------------
const ctx: ControlContext = {
  show: defaultShow(), tempo: new TempoClock(), scenes: defaultScenes(), lj: newLjState(),
  cues: newCueState(), rules: CLUB_STANDARD_RULES.map(r => ({ ...r })), bank: 1, mods: [],
};
ctx.tempo.update("manual", 120, Date.now(), 0);
const decoder = new DmxDecoder(settings.address, ctx.scenes);
let netStatus: NetStatus | null = null;
let lastDmx: Uint8Array | null = null;
let lastDmxAt = 0;
let displays: DisplayInfo[] = [];
/** Bild, dessen Ebenen die Oberfläche gerade zeigt. */
let uiCanvas = "main";

// ---- Zuweisungen (Mapping) -------------------------------------------------------------
const mappings = new MappingTable(defaultKeyMappings());
let linkState = { connected: false, peers: 0 };
const dmxPrev = new Map<number, Uint8Array>();
const leds = new LedFeedback();
const clock = new MidiClock();
let clockTicks = 0;
const mtc = new MtcDecoder();
const midi = new MidiIn((data, device, tMs) => {
  if (data[0] === 0xf1 && data.length >= 2) {
    const r = mtc.feed(data[1]!);
    if (r) tcClock.receive(r.tc, r.fps, "mtc", tMs, device);
    return;
  }
  if (data[0]! >= 0xf8) {
    // MIDI-Clock: alle 6 Takte (Sechzehntel) das Tempo nachführen
    const r = clock.feed(data[0]!, tMs);
    if (r && ++clockTicks % 6 === 0) ctx.tempo.update("midi", r.bpm, tMs, r.beat);
    return;
  }
  const m = parseMidi(data);
  if (!m) return;
  if (mapMode.input(m.input, { device, value: m.value })) return;
  mappings.dispatch(ctx, m.input, m.value);
}, () => { leds.reset(); mapMode.render(); });
const mapMode = new MapMode(ctx, mappings, {
  midiDevices: () => midi.devices,
  midiError: () => midi.error,
  dmx: () => `Art-Net Universe ${settings.universe} · sACN Universe ${settings.sacn}. Kanal am Pult deutlich bewegen. Zusätzlich zum festen Pult-Profil (Adresse ${settings.address}–${settings.address + DMX_MODE_STANDARD_CHANNELS - 1}).`,
  osc: () => "Port 8000. Werte 0–1, 0–127 oder 0–255. Für BPM die Zahl direkt senden (z. B. 128). Adressen /vjlink/… sind fest belegt.",
  toast: msg => toast(msg),
}, () => { leds.reset(); });
void midi.start();

/** DMX-Zuweisungen: nur geänderte Kanäle wirken (wie beim Pult-Profil). */
function dispatchDmx(universe: number, data: Uint8Array): void {
  const prev = dmxPrev.get(universe);
  for (const m of mappings.ofProtocol("dmx")) {
    if (m.input.p !== "dmx" || m.input.universe !== universe) continue;
    const i = m.input.channel - 1;
    if (i >= data.length || (prev && prev[i] === data[i])) continue;
    mappings.dispatch(ctx, m.input, data[i]! / 255);
  }
  dmxPrev.set(universe, data.slice());
}

// ---- Eingänge -------------------------------------------------------------------------
function onControl(e: ControlEvent): void {
  const now = Date.now();
  switch (e.type) {
    case "dmx": {
      if (mapMode.active) { mapMode.input({ p: "dmx-frame", universe: e.universe, data: e.data }); if (mapMode.protocol === "dmx") return; }
      dispatchDmx(e.universe, e.data);
      const wanted = e.source === "artnet" ? settings.universe : settings.sacn;
      if (e.universe !== wanted) return;
      lastDmx = e.data; lastDmxAt = now;
      const fx = decoder.decode(e.data, ctx.show);
      if (fx.tempoFactor !== undefined) ctx.tempo.factor = fx.tempoFactor;
      if (fx.scene !== undefined) recallScene(ctx, fx.scene - 1, now);
      break;
    }
    case "osc": {
      if (e.address.startsWith("/vjlink/")) { handleOsc(ctx, { address: e.address, args: e.args }, now); break; }
      const input = { p: "osc" as const, address: e.address.slice(0, 120) };
      if (mapMode.input(input)) break;
      const a = e.args[0];
      mappings.dispatch(ctx, input, oscValue(a), typeof a === "number" ? a : undefined);
      break;
    }
    case "timecode": tcClock.receive(e.tc, e.fps, "artnet", now, e.from); break;
    case "link":
      linkState = { connected: e.connected, peers: e.peers };
      if (e.connected && e.bpm > 0) ctx.tempo.update("link", e.bpm, now, e.beat);
      break;
    case "lj": { const m = parseLjMessage(e.raw); if (m) handleLj(ctx, m, now); break; }
    case "lj-connection": if (e.clients === 0) ctx.lj.connected = false; break;
    case "status": netStatus = e.status; break;
  }
}
bridge?.onControl(onControl);

// ---- Tabs -----------------------------------------------------------------------------
document.querySelectorAll<HTMLButtonElement>(".tabs button").forEach(b => b.addEventListener("click", () => {
  document.querySelectorAll(".tabs button").forEach(x => x.classList.toggle("on", x === b));
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("on", t.id === `tab-${b.dataset.tab}`));
  if (b.dataset.tab === "output") void refreshDisplays().then(() => outputTab.render());
  // Die Ausgangs-Vorschau wandert mit: in SHOW sitzt sie neben dem Ablauf
  const box = $("mon-box");
  if (b.dataset.tab === "show") $("sh-mon-slot").append(box);
  else if (b.dataset.tab === "visuals") monHome.append(box);
  fitPreview();
}));

// ---- Show: Clip-Raster ----------------------------------------------------------------
const library = new MediaLibrary();
let clipCells: HTMLButtonElement[][] = [];
/** Clip-IDs je Zeile (Index = Ebene). */
let rowClips: string[][] = [];
const opSliders: HTMLInputElement[] = [];
let importTarget = 0;

/** Zeile einer Ebene: ihre ausgewählten Clips, soweit es sie gibt (Generator fertig bzw. Grafik vorhanden). */
function layerClips(l: number): { id: string; name: string }[] {
  const out: { id: string; name: string }[] = [];
  for (const id of ctx.show.layers[l]?.clips ?? []) {
    if (id.startsWith("img:")) { const m = library.items.find(i => mediaClip(i.id) === id); if (m) out.push({ id, name: m.name }); }
    else if (isVideoClip(id)) { const v = videoLib.find(videoIdOf(id)); if (v) out.push({ id, name: v.name }); }
    else { const g = READY_GENERATORS.find(x => x.id === id); if (g) out.push({ id, name: g.name }); }
  }
  return out;
}
// ---- Videos --------------------------------------------------------------------------
const videoLib = new VideoLibrary();
/** Abspieler für die Vorschau im Hauptfenster (darf Ton ausgeben). */
const previewPool = new VideoPool(id => videoLib.url(id), true);
previewPool.setSink(settings.audioOut);
let lastSweep = 0;
const cueEnv: CueEnv = {
  duration: m => (m && isVideoClip(m) ? videoLib.duration(videoIdOf(m)) : 0),
  // Szenen-Marker der Timeline: „nur andere Bilder“ lässt das Bild des SHOW-Ablaufs unberührt
  // „nur andere Bilder“ gibt es nur, wenn es mehrere Bilder gibt (Projektionsmapping); sonst wirkt die Szene immer
  recallScene: (i, othersOnly) => { recallScene(ctx, i, Date.now(), othersOnly && multiImage() ? [showImage()] : [], true); },
  timecode: () => tcClock.now(Date.now()),
  currentScene: () => ctx.show.scene,
  tcCommand: (action, target) => {
    const now = Date.now(), t = parseTc(target, tcClock.sendFps);
    if (!tcClock.sendOn) toast("Timecode-Cue: Senden ist aus (Einstellungen → Timecode).");
    if (action === "stop") tcClock.stop(now);
    else { if (t) tcClock.locate(tcToFrames(t, tcClock.sendFps), now); if (action === "start") tcClock.start(now); }
  },
  get chase() { return tcClock.chase; },
};
ctx.cueEnv = cueEnv;

const libraryPanel = new LibraryPanel(ctx, library, videoLib, () => rebuildGrid(), l => { importTarget = l; $<HTMLInputElement>("file-input").click(); }, l => { libraryPanel.close(); addText(l); });

// ---- Text-Clips: gestalten, als Grafik ablegen, später bearbeiten ---------------------
const textEditor = new TextEditor();
function newMediaId(): string { const b = new Uint8Array(8); crypto.getRandomValues(b); return Array.from(b, x => x.toString(16).padStart(2, "0")).join(""); }
/** Neuen Text gestalten und auf die Ebene legen. */
function addText(layer: number): void {
  textEditor.show(null, "Text hinzufügen", async (spec, dataUrl) => {
    const p = { id: newMediaId(), name: textName(spec), dataUrl };
    const item = await library.load(p);
    if (!item) { toast("Text ließ sich nicht anlegen."); return; }
    item.text = spec; item.name = p.name;
    bridge?.addMedia(p);
    const l = ctx.show.layers[layer]!;
    const id = mediaClip(p.id);
    addClip(l, id);
    l.clip = id;
    // Text-Rahmen ist bildschirmfüllend: ganze Höhe, ohne Animation
    Object.assign(l.media, { scale: 1, x: 0, y: 0, rotation: 0, anim: "none", keyMode: "none" });
    if (layer > 0 && l.opacity < 0.05) l.opacity = 1;
    rebuildGrid(); libraryPanel.render(); fxPanel.select(layer);
    toast(`Text „${p.name}“ liegt auf Ebene ${layer + 1}. Bearbeiten: Bleistift am Clip.`);
  });
}
/** Vorhandenen Text-Clip bearbeiten (gleiche ID: alle Ebenen, Szenen und Cues zeigen die neue Fassung). */
function editText(mediaId: string): void {
  const item = library.items.find(i => i.id === mediaId);
  if (!item?.text) return;
  textEditor.show(item.text, "Text bearbeiten", async (spec, dataUrl) => {
    const p = { id: mediaId, name: textName(spec), dataUrl };
    await library.load(p);
    item.text = spec; item.name = p.name;
    bridge?.addMedia(p);
    rebuildGrid(); libraryPanel.render();
    toast("Text aktualisiert.");
  });
}
$("text-add").addEventListener("click", () => addText(fxPanel.layer));

function rebuildGrid(): void {
  const grid = $("grid");
  grid.querySelectorAll(".lrow").forEach(r => r.remove());
  clipCells = [];
  rowClips = [];
  const n = ctx.show.layers.length;
  let maxCols = 1;
  for (let l = 0; l < n; l++) maxCols = Math.max(maxCols, layerClips(l).length + 1);
  grid.style.setProperty("--cols", String(maxCols));
  for (let l = n - 1; l >= 0; l--) {
    const row = el("div", "lrow");
    const name = el("div", "lname");
    name.title = "Anklicken: Effekte und Grafik dieser Ebene bearbeiten";
    name.addEventListener("click", e => {
      if ((e.target as HTMLElement).closest("input,select")) return;
      fxPanel.select(l);
    });
    const title = el("b", "", `E${l + 1} · ${layerName(ctx.show.layers[l], l)}`);
    if (n > 1) {
      const del = el("button", "layer-del", "×");
      del.title = "Ebene entfernen"; del.setAttribute("aria-label", `Ebene ${l + 1} entfernen`);
      del.addEventListener("click", ev => {
        ev.stopPropagation();
        if (del.dataset.armed !== "1") { del.dataset.armed = "1"; del.textContent = "entfernen?"; setTimeout(() => { del.dataset.armed = ""; del.textContent = "×"; }, 2500); return; }
        removeLayer(ctx.show, l);
        if (fxPanel.layer >= ctx.show.layers.length) fxPanel.select(ctx.show.layers.length - 1);
        rebuildGrid(); rebuildDeck();
      });
      title.append(del);
    }
    name.append(title);
    const op = el("input"); op.type = "range"; op.min = "0"; op.max = "100"; op.ariaLabel = `Deckkraft Ebene ${l + 1}`;
    op.dataset.ctl = `layer.${l + 1}.opacity`;
    op.addEventListener("input", () => { ctx.show.layers[l]!.opacity = Number(op.value) / 100; });
    opSliders[l] = op;
    const color = el("select"); color.ariaLabel = `Farbe Ebene ${l + 1}`;
    for (const c of COLOR_SOURCES_ALL) color.append(new Option(c === "original" ? "Original" : c === "gradient" ? "Verlauf" : c === "rainbow" ? "Regenbogen" : c === "multi" ? "Mehrere Slots" : `Slot ${c}`, c));
    color.addEventListener("change", () => {
      const layer = ctx.show.layers[l]!;
      layer.colorSource = color.value as ColorSource;
      if (layer.colorSource === "multi" && (layer.colorSlots?.length ?? 0) < 2) layer.colorSlots = [0, 1, 2];
      fxPanel.select(l);
    });
    color.dataset.ctl = `layer.${l + 1}.color`;
    const blend = el("select"); blend.ariaLabel = `Mischmodus Ebene ${l + 1}`;
    for (const b of BLEND_MODES) blend.append(new Option(({ normal: "Normal", add: "Addieren", screen: "Bildschirm", multiply: "Multiplizieren" } as Record<BlendMode, string>)[b], b));
    blend.addEventListener("change", () => { ctx.show.layers[l]!.blend = blend.value as BlendMode; });
    blend.dataset.ctl = `layer.${l + 1}.blend`;
    // Antrieb: woher Pulsieren und Reaktion kommen
    const drive = el("select", "drive-sel"); drive.ariaLabel = `Antrieb Ebene ${l + 1}`;
    for (const d of DRIVES) drive.append(new Option(`${DRIVE_ICON[d]} ${DRIVE_LABEL[d]}`, d));
    drive.title = "Antrieb: Auto (Audio wenn vorhanden, sonst Takt), Takt (BPM), Audio, Statisch (kein Pulsieren)";
    drive.addEventListener("change", () => { ctx.show.layers[l]!.drive = drive.value as Drive; });
    drive.dataset.ctl = `layer.${l + 1}.drive`;
    name.append(op, color, blend, drive);
    row.append(name);
    clipCells[l] = [];
    const clips = layerClips(l);
    rowClips[l] = clips.map(c => c.id);
    clips.forEach((clip, c) => {
      const b = el("button", clip.id.startsWith("img:") || isVideoClip(clip.id) ? "cell media" : "cell");
      b.append(el("span", "cell-name", clip.name));
      if (isVideoClip(clip.id)) b.append(el("span", "vbadge", "VIDEO"));
      b.dataset.ctl = `clip.${l + 1}.${clip.id}`;
      b.title = `${clip.name} · Klick startet/stoppt`;
      b.addEventListener("click", ev => {
        if ((ev.target as HTMLElement).closest(".cell-x, .cell-edit")) return;
        const layer = ctx.show.layers[l]!;
        layer.clip = layer.clip === clip.id ? null : clip.id;
        if (clip.id.startsWith("img:") && layer.clip) fxPanel.select(l);
      });
      // Text-Clips: Bleistift zum Bearbeiten (erscheint beim Darüberfahren neben dem ×)
      const textItem = clip.id.startsWith("img:") ? library.items.find(i => i.id === clip.id.slice(4) && i.text) : undefined;
      if (textItem) {
        b.classList.add("text-cell");
        const pen = el("span", "cell-edit", "✎");
        pen.setAttribute("role", "button"); pen.title = "Text bearbeiten";
        pen.addEventListener("click", ev => { ev.stopPropagation(); editText(textItem.id); });
        b.append(pen);
      }
      // × entfernt den Clip nur aus dieser Zeile (die Grafik bleibt in der Bibliothek)
      const x = el("span", "cell-x", "×");
      x.setAttribute("role", "button"); x.title = "Aus dieser Ebene entfernen";
      x.addEventListener("click", ev => { ev.stopPropagation(); removeClip(ctx.show.layers[l]!, clip.id); rebuildGrid(); });
      b.append(x);
      row.append(b); clipCells[l]![c] = b;
    });
    const add = el("button", "cell add", "+ Clips");
    add.title = "Bibliothek: Visuals und Grafiken für diese Ebene auswählen";
    add.addEventListener("click", () => {
      if (libraryPanel.open && libraryPanel.layer === l) { libraryPanel.close(); return; }
      libraryPanel.show(l, add);
    });
    row.append(add);
    for (let k = clips.length + 1; k < maxCols; k++) row.append(el("div", "cell-gap"));
    grid.append(row);
  }
}

let toastTimer = 0;
function toast(msg: string): void {
  const t = $("toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = window.setTimeout(() => { t.hidden = true; }, 4000);
}
/** Sperrmodus: während der Show nur bedienen. */
const showLock = new ShowLock($<HTMLButtonElement>("lock-btn"), toast);
/** Modulation: Regler an LFO oder Audio hängen (⇧⌘L oder MAPPING → Modulation). */
const modMode = new ModMode(ctx, () => ctx.tempo.beatAt(Date.now()), () => liveBands(ctx.show.audio, ctx.tempo.beatAt(Date.now()), Date.now() / 1000), toast);

/** Dateien laden; die erste Grafik kommt auf die Ziel-Ebene. */
/** Dateien in die Bibliotheken übernehmen (Videos und Bilder). Gibt Clip-IDs und Namen zurück. */
async function importToLibrary(files: FileList | File[]): Promise<{ id: string; name: string }[]> {
  const out: { id: string; name: string }[] = [];
  for (const f of Array.from(files)) {
    if (isVideoFile(f)) {
      toast(`„${f.name}“ wird übernommen …`);
      const r = await videoLib.importFile(f);
      if (typeof r === "string") { toast(r); continue; }
      out.push({ id: videoClip(r.id), name: r.name });
    } else {
      const r = await library.importFile(f);
      if (typeof r === "string") { toast(r); continue; }
      out.push({ id: mediaClip(r.id), name: r.name });
    }
  }
  return out;
}

async function importFiles(files: FileList | File[], layer: number): Promise<void> {
  const added = await importToLibrary(files);
  const imported = added.map(a => a.id);
  const first: string | null = imported[0] ?? null;
  if (first) {
    const l = ctx.show.layers[layer]!;
    for (const id of imported) addClip(l, id);
    rebuildGrid();
    libraryPanel.render();
    l.clip = first;
    const bg = first.startsWith("img:") ? library.background.get(first.slice(4)) : undefined;
    if (bg) { l.media.keyMode = bg; toast(`Logo auf ${bg === "white" ? "weißem" : "schwarzem"} Grund erkannt: Hintergrund wird ausgeblendet (Grafik → Freistellen).`); }
    if (layer > 0 && l.opacity < 0.05) l.opacity = 1;
    fxPanel.select(layer);
    toast(isVideoClip(first) ? "Video geladen. Loop und Takt rechts unter „Video“." : "Grafik geladen. Lage und Animation rechts unter „Grafik“.");
  }
}
$<HTMLInputElement>("file-input").addEventListener("change", e => {
  const inp = e.target as HTMLInputElement;
  if (inp.files?.length) void importFiles(inp.files, importTarget);
  inp.value = "";
});
window.addEventListener("dragover", e => { if (e.dataTransfer?.types.includes("Files")) e.preventDefault(); });
window.addEventListener("drop", e => {
  if (!e.dataTransfer?.files.length) return;
  e.preventDefault();
  void importFiles(e.dataTransfer.files, fxPanel.layer);
});

// Tastatur: Belegung kommt aus den Zuweisungen (Standard: 1–9, Pfeile, B, F, S, T)
const typing = (t: EventTarget | null) => t instanceof HTMLElement && !!t.closest("input,select,textarea");
const MAP_KEYS: Record<string, MapProtocol> = { KeyK: "key", KeyM: "midi", KeyD: "dmx", KeyO: "osc" };
window.addEventListener("keydown", e => {
  // ⇧⌘K/M/D/O (Windows: ⇧Strg) öffnet den Mapping-Modus
  if (e.shiftKey && (e.metaKey || e.ctrlKey) && e.code === "KeyL") { e.preventDefault(); if (showLock.locked) showLock.hint(); else { mapMode.close(); modMode.open(); } return; }
  if (e.shiftKey && (e.metaKey || e.ctrlKey) && MAP_KEYS[e.code]) { e.preventDefault(); if (showLock.locked) showLock.hint(); else mapMode.open(MAP_KEYS[e.code]!); return; }
  if (e.key === "Escape" && mapMode.active) { mapMode.close(); return; }
  if (typing(e.target) || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
  const input = { p: "key" as const, code: e.code, label: e.key.length === 1 ? e.key.toUpperCase() : e.key.replace("Arrow", "Pfeil ") };
  if (mapMode.active) { if (mapMode.protocol === "key") { mapMode.input(input); e.preventDefault(); } return; }
  if (mappings.dispatch(ctx, input, 1)) e.preventDefault();
});
window.addEventListener("keyup", e => {
  if (mapMode.active || typing(e.target)) return;
  mappings.dispatch(ctx, { p: "key", code: e.code, label: "" }, 0);
});

// Mapping-Menü oben
const mapBtn = $<HTMLButtonElement>("map-btn"), mapMenu = $("map-menu");
mapBtn.addEventListener("click", () => {
  if (mapMode.active) { mapMode.close(); return; }
  mapMenu.hidden = !mapMenu.hidden; mapBtn.setAttribute("aria-expanded", String(!mapMenu.hidden));
});
mapMenu.querySelectorAll<HTMLButtonElement>("[data-map]").forEach(b => b.addEventListener("click", () => {
  mapMenu.hidden = true; mapBtn.setAttribute("aria-expanded", "false");
  modMode.close();
  mapMode.open(b.dataset.map as MapProtocol);
}));
mapMenu.querySelector<HTMLButtonElement>("[data-mod]")!.addEventListener("click", () => {
  mapMenu.hidden = true; mapBtn.setAttribute("aria-expanded", "false");
  mapMode.close(); modMode.open();
});
document.addEventListener("pointerdown", e => {
  if (!mapMenu.hidden && !(e.target as HTMLElement).closest(".map-wrap")) { mapMenu.hidden = true; mapBtn.setAttribute("aria-expanded", "false"); }
});

// BPM anklicken, Zahl eingeben, Enter
const bpmBtn = $<HTMLButtonElement>("bpm"), bpmIn = $<HTMLInputElement>("bpm-input");
bpmBtn.addEventListener("click", () => {
  if (mapMode.active) return;
  bpmIn.value = ctx.tempo.bpm.toFixed(2); bpmBtn.hidden = true; bpmIn.hidden = false; bpmIn.focus(); bpmIn.select();
});
const closeBpm = () => { bpmIn.hidden = true; bpmBtn.hidden = false; };
bpmIn.addEventListener("keydown", e => {
  if (e.key === "Escape") { closeBpm(); return; }
  if (e.key !== "Enter") return;
  const v = Number(bpmIn.value.replace(",", "."));
  if (Number.isFinite(v) && v >= 20 && v <= 300) {
    const src = ctx.tempo.source;
    // Eine Quelle mit höherem Rang würde die Eingabe sofort überschreiben: dann auf Manuell festlegen.
    if (src !== "manual" && src !== "tap") { ctx.tempo.lock = "manual"; toast(`Tempo-Quelle auf Manuell gestellt (vorher ${SOURCE_LABEL[src] ?? src}).`); }
    ctx.tempo.setManual(v / ctx.tempo.factor, Date.now());
    closeBpm();
  } else toast("BPM zwischen 20 und 300 eingeben.");
});
bpmIn.addEventListener("blur", closeBpm);
// Tempo-Quelle: eigenes Menü statt nativem Auswahlfeld (das native Menü hing, weil die Anzeige ständig aktualisiert wird)
const lockBtn = $<HTMLButtonElement>("tempo-lock"), tempoMenu = $("tempo-menu");
const closeTempoMenu = () => { tempoMenu.hidden = true; lockBtn.setAttribute("aria-expanded", "false"); };
lockBtn.addEventListener("click", () => {
  if (mapMode.active) return;
  tempoMenu.hidden = !tempoMenu.hidden; lockBtn.setAttribute("aria-expanded", String(!tempoMenu.hidden));
  tempoMenu.querySelectorAll<HTMLElement>("[data-lock]").forEach(b => b.setAttribute("aria-checked", String((ctx.tempo.lock ?? "auto") === b.dataset.lock)));
});
tempoMenu.querySelectorAll<HTMLButtonElement>("[data-lock]").forEach(b => b.addEventListener("click", () => {
  ctx.tempo.lock = b.dataset.lock === "auto" ? null : b.dataset.lock as TempoSource;
  closeTempoMenu();
}));
document.addEventListener("pointerdown", e => { if (!tempoMenu.hidden && !(e.target as HTMLElement).closest(".map-wrap")) closeTempoMenu(); });
window.addEventListener("keydown", e => { if (e.key === "Escape") closeTempoMenu(); });

// ---- Audio-Eingang ---------------------------------------------------------------------
const audioIn = new AudioIn();
audioIn.gain = settings.audioGain; audioIn.scope = settings.audioScope;
const audioBtn = $<HTMLButtonElement>("audio-btn"), audioMenu = $("settings");
const audioMeter = Array.from($("audio-meter").children) as HTMLElement[];

async function fillAudioDevices(): Promise<void> {
  const box = $("audio-devices");
  const list = await audioIn.devices();
  box.replaceChildren();
  const item = (id: string, label: string) => {
    const b = el("button", "am-item", label); b.setAttribute("role", "radio");
    const on = id === "" ? !audioIn.active : audioIn.active && audioIn.deviceId === id;
    b.setAttribute("aria-checked", String(on));
    b.addEventListener("click", () => { void chooseAudio(id); });
    box.append(b);
  };
  item("", "Aus (EQ im Takt)");
  for (const d of list) item(d.id, d.label);
  if (!list.length) box.append(el("p", "am-hint", "Kein Eingang gefunden."));
}

async function chooseAudio(id: string): Promise<void> {
  if (!id) { audioIn.stop(); settings.audioDevice = ""; saveSettings(); void fillAudioDevices(); return; }
  if (bridge && !(await bridge.askMicrophone())) { toast("Kein Zugriff auf das Mikrofon. macOS: Systemeinstellungen → Datenschutz → Mikrofon."); return; }
  const ok = await audioIn.start(id);
  if (!ok) { toast(audioIn.error); }
  else { settings.audioDevice = id; saveSettings(); }
  void fillAudioDevices(); // nach der Freigabe stehen die echten Gerätenamen zur Verfügung
}

audioBtn.addEventListener("click", () => { if (!mapMode.active) openSettings("audio"); });
navigator.mediaDevices?.addEventListener("devicechange", () => { if (!audioMenu.hidden) { void fillAudioDevices(); void fillAudioOuts(); } });

/** Audio-Ausgang für den Ton von Videos (Hauptfenster). */
async function fillAudioOuts(): Promise<void> {
  const box = $("audio-outs");
  let outs: MediaDeviceInfo[] = [];
  try { outs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === "audiooutput"); } catch { /* keine Liste */ }
  box.replaceChildren();
  const item = (id: string, label: string) => {
    const b = el("button", "am-item", label); b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", String((settings.audioOut || "") === id));
    b.addEventListener("click", () => { settings.audioOut = id; saveSettings(); previewPool.setSink(id); void fillAudioOuts(); });
    box.append(b);
  };
  item("", "Standard des Systems");
  for (const d of outs) if (d.deviceId && d.deviceId !== "default") item(d.deviceId, d.label || "Ausgang");
}
const gainIn = $<HTMLInputElement>("audio-gain");
gainIn.value = String(Math.round(audioIn.gain * 100));
gainIn.addEventListener("input", () => { audioIn.gain = Number(gainIn.value) / 100; settings.audioGain = audioIn.gain; saveSettings(); });
audioMenu.querySelectorAll<HTMLButtonElement>("[data-scope]").forEach(b => b.addEventListener("click", () => {
  audioIn.scope = b.dataset.scope as "audio" | "all"; settings.audioScope = audioIn.scope; saveSettings();
}));
const AUDIO_NAMES = READY_GENERATORS.filter(g => AUDIO_CLIPS.has(g.id)).map(g => g.name).join(", ");

function updateAudioUi(): void {
  const mic = ctx.show.audio.mic;
  audioBtn.classList.toggle("ok", !!mic);
  const label = mic ? (audioIn.label.replace(/\s*\(.*\)\s*$/, "").slice(0, 14) || "LIVE") : "AUDIO";
  if ($("audio-label").textContent !== label) $("audio-label").textContent = label;
  audioMeter.forEach((m, i) => { m.style.height = `${Math.round((mic?.bands[i] ?? 0) * 100)}%`; });
  $("audio-gain-val").textContent = `${Math.round(audioIn.gain * 100)} %`;
  const lvl = mic ? Math.max(...mic.bands) : 0;
  $("audio-level").style.width = `${Math.round(lvl * 100)}%`;
  $("audio-level").classList.toggle("hot", lvl > 0.97);
  audioMenu.querySelectorAll<HTMLButtonElement>("[data-scope]").forEach(b => {
    const on = b.dataset.scope === audioIn.scope; b.classList.toggle("on", on); b.setAttribute("aria-checked", String(on));
  });
  $("audio-hint").textContent = audioIn.scope === "audio"
    ? `Nur ${AUDIO_NAMES}. Alle anderen Visuals laufen weiter im Takt.`
    : "Alle Visuals reagieren auf den Eingang (Bass, Mitten, Höhen).";
  // Zellen im Clip-Raster markieren, die gerade vom Eingang gesteuert werden
  clipCells.forEach(row => row.forEach((cell, c) => {
    const on = !!mic && micDrives(ctx.show.audio, rowClips[clipCells.indexOf(row)]?.[c] ?? null);
    if ((cell.dataset.audio === "1") !== on) cell.dataset.audio = on ? "1" : "";
  }));
}
if (settings.audioDevice) void chooseAudio(settings.audioDevice);

// ---- Einstellungen ---------------------------------------------------------------------
function updateTcUi(): void {
  const t = Date.now();
  const i = tcClock.incoming(t), o = tcClock.outgoing(t);
  const b = $("tc-btn");
  b.hidden = !tcClock.receiveOn && !tcClock.sendOn;
  const f = (x: typeof i) => (x ? formatFrames(Math.floor(x.frames), x.fps) : "--:--:--:--");
  $("tc-val").textContent = tcClock.receiveOn && tcClock.sendOn ? `▼ ${f(i)}  ▲ ${f(o)}` : tcClock.receiveOn ? f(i) : f(o);
  b.classList.toggle("ok", !!o?.running && !tcClock.receiveOn);
  b.classList.toggle("warn", !!i?.running);
  b.title = [tcClock.receiveOn ? `Empfang (${tcClock.source === "artnet" ? "Art-Net" : "MIDI"})` : "", tcClock.sendOn ? "Senden" : ""].filter(Boolean).join(" · ");
  if (!setBox.hidden) tcPanel.update();
}
const tcPanel = new TcPanel(tcClock, settings.tc, saveSettings, {
  midiOutputs: () => midi.outputs,
  sendMidi: (dev, b) => midi.send(dev, b),
  sendArt: (b, host) => bridge?.sendArtTimecode(b, host),
  toast,
});
ctx.tc = tcClock;
const setBox = $("settings");
const SEC_TITLE: Record<string, string> = { audio: "Audio", timecode: "Timecode", midi: "MIDI", dmx: "DMX und Netzwerk", ui: "Oberfläche" };
function openSettings(sec = "audio"): void {
  setBox.hidden = false;
  setBox.querySelectorAll<HTMLButtonElement>(".set-nav [data-sec]").forEach(b => b.classList.toggle("on", b.dataset.sec === sec));
  setBox.querySelectorAll<HTMLElement>(".set-sec").forEach(x => { x.hidden = x.dataset.sec !== sec; });
  $("set-title").textContent = SEC_TITLE[sec] ?? "Einstellungen";
  if (sec === "audio") { void fillAudioDevices(); void fillAudioOuts(); }
  if (sec === "timecode") tcPanel.build($("set-tc"));
  if (sec === "midi") buildMidiSection();
}
const closeSettings = () => { setBox.hidden = true; };
setBox.querySelectorAll<HTMLButtonElement>(".set-nav [data-sec]").forEach(b => b.addEventListener("click", () => openSettings(b.dataset.sec)));
$("set-close").addEventListener("click", closeSettings);
setBox.addEventListener("pointerdown", e => { if (e.target === setBox) closeSettings(); });
window.addEventListener("keydown", e => { if (e.key === "Escape" && !setBox.hidden) { closeSettings(); e.stopPropagation(); } }, true);
$("settings-btn").addEventListener("click", () => openSettings());
$("tc-btn").addEventListener("click", () => openSettings("timecode"));

function buildMidiSection(): void {
  const box = $("set-midi"); box.replaceChildren();
  const list = (title: string, items: string[]) => {
    box.append(el("h3", "", title));
    const l = el("div", "am-list");
    if (!items.length) l.append(el("p", "am-hint", "Keines gefunden. Gerät anstecken, es erscheint sofort."));
    for (const i of items) l.append(el("div", "am-item static", i));
    box.append(l);
  };
  list("Eingänge", midi.devices);
  list("Ausgänge (LEDs, MIDI-Timecode)", midi.outputs);
  const p = el("p", "am-hint", "Tasten, Regler und Pads zuweisen: oben MAPPING → MIDI. Dort gibt es auch fertige Vorlagen für Controller.");
  box.append(p);
  if (midi.error) box.append(el("p", "am-hint", midi.error));
}

// DMX-Felder und Oberflächen-Größe wohnen jetzt in den Einstellungen
$("set-dmx").append(...Array.from(document.querySelectorAll("#tab-connect .form")));
$("set-dmx").append(el("p", "am-hint", "Live-Werte und Status der Eingänge: Tab VERBINDEN."));
document.querySelectorAll("#tab-connect h2").forEach(h => { if (h.textContent === "DMX-Einstellungen") h.remove(); });
// Ebenen hinzufügen
$("layer-add").addEventListener("click", () => {
  const i = addLayer(ctx.show);
  if (i < 0) { toast(`Höchstens ${MAX_LAYERS} Ebenen.`); return; }
  rebuildGrid(); rebuildDeck(); fxPanel.select(i);
});

function buildSidebar(): void {
  const slots = $("slots");
  const hex = (v: number) => Math.round(v * 255).toString(16).padStart(2, "0");
  const slotInputs: HTMLInputElement[] = [];
  const slotRanges: { r: HTMLInputElement; id: string }[] = [];
  SLOT_NAMES.forEach((n, i) => {
    const row = el("div", "slot");
    const sw = el("div", "sw");
    const inp = el("input"); inp.type = "color"; inp.ariaLabel = `Farbe Slot ${n}`;
    inp.addEventListener("input", () => {
      const v = inp.value; ctx.show.slots[i] = [parseInt(v.slice(1, 3), 16) / 255, parseInt(v.slice(3, 5), 16) / 255, parseInt(v.slice(5, 7), 16) / 255];
    });
    slotInputs[i] = inp;
    inp.dataset.ctl = `slot.${n}.hue`;
    inp.title = "Farbe wählen (im Mapping: Farbton)";
    // Kleine Regler für Rot, Grün und Blau: bedienbar und im Mapping zuweisbar
    const mini = el("div", "slot-mini");
    for (const [key, lbl] of [["r", "R"], ["g", "G"], ["b", "B"]] as const) {
      const id = `slot.${n}.${key}`;
      const wrap = el("label", `sm sm-${key}`); wrap.dataset.ctl = id; wrap.title = `Slot ${n} ${lbl}`;
      const r = el("input"); r.type = "range"; r.min = "0"; r.max = "255"; r.setAttribute("aria-label", `Slot ${n} ${lbl}`);
      r.addEventListener("input", () => setControl(ctx, id, Number(r.value) / 255));
      wrap.append(el("span", "", lbl), r);
      slotRanges.push({ r, id });
      mini.append(wrap);
    }
    row.append(sw, el("b", "", n), mini, inp); slots.append(row);
  });
  (window as unknown as { refreshSlots: () => void }).refreshSlots = () => {
    const sw = slots.querySelectorAll<HTMLElement>(".sw");
    ctx.show.slots.forEach((c, i) => {
      const h = `#${hex(c[0])}${hex(c[1])}${hex(c[2])}`;
      sw[i]!.style.background = h;
      if (document.activeElement !== slotInputs[i]) slotInputs[i]!.value = h;
    });
    for (const { r, id } of slotRanges) if (document.activeElement !== r) r.value = String(Math.round((resolveControl(id)?.get(ctx) ?? 0) * 255));
  };
  $("tap").addEventListener("click", () => { setControl(ctx, "tempo.tap", 1); });
  $("blackout").addEventListener("click", () => { setControl(ctx, "blackout", ctx.show.blackout ? 0 : 1); });
}

// ---- Bauen: Katalog -------------------------------------------------------------------
const CAT_LABEL: Record<EffectCategory, string> = { audio: "Audio und Equalizer", geometry: "Geometrie", particles: "Partikel und Natur", retro: "Retro und Analog", optical: "Optische Raumeffekte", laser: "Laser-Effekte", tools: "Werkzeuge" };
const KIND_LABEL = { generator: "Generator", post: "Effekt", master: "Master" } as const;
const REACT_LABEL = { beat: "Beat", bass: "Bass", mid: "Mitten", high: "Höhen", wave: "Wellenform" } as const;
function buildCatalog(): void {
  const tbody = document.querySelector<HTMLTableSectionElement>("#catalog tbody")!;
  const filters = $("cat-filters");
  let active: EffectCategory | "all" = "all";
  const draw = () => {
    tbody.replaceChildren();
    for (const e of EFFECTS) {
      if (active !== "all" && e.category !== active) continue;
      const tr = el("tr");
      const status = el("span", `tag ${e.status}`, e.status === "ready" ? "BEREIT" : "GEPLANT");
      const tdS = el("td"); tdS.append(status);
      tr.append(el("td", "n", String(e.no)), el("td", "", e.name), el("td", "", CAT_LABEL[e.category]), el("td", "", KIND_LABEL[e.kind]),
        el("td", "", e.reactsTo.map(r => REACT_LABEL[r]).join(", ") || "–"), tdS);
      tr.title = e.info;
      tbody.append(tr);
    }
    filters.querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.cat === active));
  };
  const mk = (cat: EffectCategory | "all", label: string) => {
    const b = el("button", "", label); b.dataset.cat = cat; b.addEventListener("click", () => { active = cat; draw(); }); filters.append(b);
  };
  mk("all", "Alle");
  (Object.keys(CAT_LABEL) as EffectCategory[]).forEach(c => mk(c, CAT_LABEL[c]));
  draw();
}

// ---- Ausgabe --------------------------------------------------------------------------
let outLayout: OutputLayout = defaultLayout();
const outputTab = new OutputTab(() => outLayout, l => { outLayout = l; }, () => displays, () => fitPreview(), {
  // Projektionsmapping: Raster-Testbild auf die Leinwände
  on: () => ctx.show.testCard && ctx.show.testPattern === "grid",
  toggle: () => { const on = !(ctx.show.testCard && ctx.show.testPattern === "grid"); ctx.show.testPattern = "grid"; ctx.show.testCard = on; syncTestUi(); },
}, () => imageList(ctx.show), () => (ctx.photos ??= {}));
async function refreshDisplays(): Promise<void> {
  const list = $("displays");
  if (!bridge) {
    $("output-note").textContent = "Mehrere Ausgänge gibt es nur in der Desktop-App. Im Browser läuft die Vorschau.";
    list.replaceChildren(); return;
  }
  displays = await bridge.listDisplays();
  renderDisplays();
}
bridge?.onDisplays(d => { displays = d; renderDisplays(); outputTab.render(); fitPreview(); });

function renderDisplays(): void {
  const list = $("displays");
  list.replaceChildren();
  for (const d of displays) {
    const row = el("div", d.open ? "display open" : "display");
    const info = el("div"); info.append(el("b", "", `${d.label}${d.primary ? " (Hauptbildschirm)" : ""}`));
    info.append(el("small", "", `${Math.round(d.width * d.scaleFactor)} × ${Math.round(d.height * d.scaleFactor)} Pixel`));
    const b = el("button", "btn", d.open ? "SCHLIESSEN" : d.window ? "FENSTER ÖFFNEN" : "ALS AUSGANG ÖFFNEN");
    b.addEventListener("click", async () => { displays = await bridge!.toggleOutput(d.id); renderDisplays(); outputTab.render(); fitPreview(); });
    if (d.window) {
      // Fenster-Ausgang: Größe wählen; zum Abgreifen mit OBS, Resolume, Syphon-/NDI-Werkzeugen (Fensteraufnahme)
      info.querySelector("b")!.title = "Normales Fenster statt Vollbild – zum Abgreifen per Fensteraufnahme (OBS, Syphon Recorder, NDI-Werkzeuge)";
      info.append(el("small", "muted", "für OBS, NDI, Syphon (Fensteraufnahme)"));
      const size = el("select"); size.title = "Bildgröße des Fensters";
      const cur = `${Math.round(d.width * d.scaleFactor)}x${Math.round(d.height * d.scaleFactor)}`;
      for (const [w, h] of WINDOW_SIZES) size.append(new Option(`${w} × ${h}${h > w ? " (hoch)" : ""}`, `${w}x${h}`));
      if (!Array.from(size.options).some(o => o.value === cur)) size.append(new Option(`${cur.replace("x", " × ")} (gezogen)`, cur));
      size.value = cur;
      size.addEventListener("change", async () => { const [w, h] = size.value.split("x").map(Number); displays = await bridge!.windowOutputSize(w!, h!); renderDisplays(); outputTab.render(); fitPreview(); });
      size.className = "win-size"; info.append(size);
      row.append(info, b);
    } else row.append(info, b);
    list.append(row);
  }
  $("output-note").textContent = displays.filter(d => !d.window).length > 1 ? "" : "Es ist nur ein Bildschirm angeschlossen. Ein Ausgang darüber verdeckt diese Oberfläche; Taste Esc oder Schließen im Hauptfenster beendet ihn.";
}
$<HTMLInputElement>("testpattern").addEventListener("change", e => { ctx.show.testCard = (e.target as HTMLInputElement).checked; syncTestUi(); });
/** Testbild-Knöpfe und Häkchen auf den aktuellen Stand bringen. */
function syncTestUi(): void {
  const on = ctx.show.testCard, cur = ctx.show.testPattern;
  const pats = $("test-pats");
  if (!pats.childElementCount) {
    for (const p of TEST_PATTERNS) {
      const b = el("button", "test-pat", p.label); b.dataset.pat = p.id; b.setAttribute("role", "radio"); b.title = p.hint;
      b.addEventListener("click", () => {
        // Gewähltes Muster nochmal anklicken schaltet das Testbild aus
        if (ctx.show.testCard && ctx.show.testPattern === p.id) ctx.show.testCard = false;
        else { ctx.show.testPattern = p.id; ctx.show.testCard = true; }
        syncTestUi();
      });
      pats.append(b);
    }
  }
  pats.querySelectorAll<HTMLButtonElement>("[data-pat]").forEach(b => {
    const sel = b.dataset.pat === cur; b.classList.toggle("sel", sel); b.classList.toggle("live", sel && on);
    b.setAttribute("aria-checked", String(sel));
  });
  const info = TEST_PATTERNS.find(p => p.id === cur)!;
  $("test-name").textContent = `${TEST_IDS.indexOf(cur) + 1} / ${TEST_IDS.length} · ${info.label}`;
  $("test-hint").textContent = info.hint;
  testUiKey = `${on}|${cur}`;
  $<HTMLInputElement>("testpattern").checked = on;
  $("test-quick").classList.toggle("on-test", on);
  $("test-quick").textContent = on ? "Testbild aus" : "Testbild auf allen Ausgängen";
  $("test-quick").setAttribute("aria-pressed", String(on));
}
$("test-quick").addEventListener("click", () => { ctx.show.testCard = !ctx.show.testCard; syncTestUi(); });
for (const [id, dir] of [["test-prev", -1], ["test-next", 1]] as const) $(id).addEventListener("click", () => {
  ctx.show.testPattern = stepTestPattern(ctx.show.testPattern, dir); ctx.show.testCard = true; syncTestUi();
});
let testUiKey = "";
syncTestUi();

// ---- Verbinden ------------------------------------------------------------------------
function card(title: string, state: "ok" | "off" | "err", lines: string[], live = false): HTMLElement {
  const c = el("div", `card ${state}${live ? " live" : ""}`);
  const head = el("div", "head"); head.append(el("b", "", title)); head.append(el("span", "dot"));
  c.append(head); for (const l of lines) c.append(el("em", "", l)); return c;
}
function drawConnect(now: number): void {
  const s = netStatus; const cards = $("cards"); cards.replaceChildren();
  if (!bridge || !s) { cards.append(card("Netzwerk", "off", ["Nur in der Desktop-App verfügbar"])); }
  else {
    const dmxLive = now - lastDmxAt < 1500;
    cards.append(
      card("Art-Net", s.artnet.error ? "err" : s.artnet.listening ? "ok" : "off", [`UDP 6454 · Universe ${settings.universe}`, `${s.artnet.packets} Pakete`, s.artnet.lastFrom ? `von ${s.artnet.lastFrom}` : (s.artnet.error ?? "wartet")]),
      card("sACN", s.sacn.error ? "err" : s.sacn.listening ? "ok" : "off", [`UDP 5568 · Universe ${settings.sacn}`, `${s.sacn.packets} Pakete`, s.sacn.error ?? "wartet"]),
      card("OSC", s.osc.error ? "err" : s.osc.listening ? "ok" : "off", [`UDP ${s.osc.port}`, `${s.osc.packets} Pakete`, s.osc.error ?? "/vjlink/…"]),
      card("LJ-Link", s.lj.clients > 0 || s.lj.pro?.connected ? "ok" : s.lj.error ? "err" : "off", [
        s.lj.pro?.connected ? `LJ-Link PRO verbunden (${proWhere(s.lj.pro.host)})` : `sucht LJ-Link PRO (${proWhere(s.lj.pro?.host ?? "")})`,
        s.lj.clients > 0 ? `WebSocket ${s.lj.port}: ${s.lj.clients} verbunden` : `WebSocket ${s.lj.port} offen`, s.lj.error ?? ""].filter(Boolean)),
    );
    void dmxLive;
  }
  const live = $("dmx-live");
  if (live.childElementCount !== DMX_MODE_STANDARD_CHANNELS) { live.replaceChildren(); for (let i = 0; i < DMX_MODE_STANDARD_CHANNELS; i++) live.append(el("i")); }
  const base = settings.address - 1;
  for (let i = 0; i < DMX_MODE_STANDARD_CHANNELS; i++) {
    const bar = live.children[i] as HTMLElement; const v = lastDmx?.[base + i] ?? 0;
    bar.style.height = `${Math.max(1, (v / 255) * 100)}%`;
    bar.classList.toggle("slotc", i + 1 >= CH.slotBase && i + 1 < CH.layerBase);
  }
  const decks = $("lj-decks"); decks.replaceChildren();
  if (!ctx.lj.decks.size) decks.append(card("Keine Decks", "off", ["Sobald LJ-Link sendet, erscheinen die Decks hier."]));
  for (const d of ctx.lj.decks.values()) {
    decks.append(card(`Deck ${d.deck}${d.model ? ` · ${d.model}` : ""}`, d.playing ? "ok" : "off",
      [`${d.bpm.toFixed(2)} BPM${d.key ? ` · ${d.key}` : ""}`, d.title ? `${d.title}${d.artist ? ` – ${d.artist}` : ""}` : (ctx.lj.privacy ? "Privatsphäre-Modus" : "–"),
        `${d.onAir ? "ON AIR " : ""}${d.master ? "MASTER " : ""}${d.phrase ? d.phrase.toUpperCase() : ""}`.trim() || "–"], d.onAir));
  }
}
/** „dieser Mac“ statt 127.0.0.1. */
const proWhere = (h: string): string => !h || h === "127.0.0.1" || h === "localhost" ? (bridge?.platform === "darwin" ? "dieser Mac" : "dieser Rechner") : h;
function bindSettings(): void {
  const u = $<HTMLInputElement>("cfg-universe"), s = $<HTMLInputElement>("cfg-sacn"), a = $<HTMLInputElement>("cfg-address");
  u.value = String(settings.universe); s.value = String(settings.sacn); a.value = String(settings.address);
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(Number.isFinite(v) ? v : lo)));
  u.addEventListener("change", () => { settings.universe = clamp(Number(u.value), 0, 32767); saveSettings(); });
  s.addEventListener("change", () => { settings.sacn = clamp(Number(s.value), 1, 63999); saveSettings(); bridge?.configure({ sacnUniverse: settings.sacn, ljHost: settings.ljHost }); });
  const lh = $<HTMLInputElement>("cfg-ljhost");
  lh.value = settings.ljHost;
  lh.addEventListener("change", () => {
    const v = lh.value.trim();
    if (v && !/^[A-Za-z0-9.:\[\]-]{1,253}$/.test(v)) { lh.value = settings.ljHost; toast("Bitte nur IP-Adresse oder Rechnername eingeben."); return; }
    settings.ljHost = v; saveSettings(); bridge?.configure({ sacnUniverse: settings.sacn, ljHost: v });
  });
  a.addEventListener("change", () => { settings.address = clamp(Number(a.value), 1, 512 - DMX_MODE_STANDARD_CHANNELS + 1); decoder.startAddress = settings.address; saveSettings(); });
  $("dl-channels").addEventListener("click", () => {
    const url = URL.createObjectURL(new Blob([channelListCsv(settings.address)], { type: "text/csv" }));
    const link = el("a"); link.href = url; link.download = "vj-link-kanalliste.csv"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  bridge?.configure({ sacnUniverse: settings.sacn, ljHost: settings.ljHost });
  const sc = $<HTMLSelectElement>("ui-scale");
  sc.value = String(settings.uiScale);
  if (sc.value === "") sc.value = "auto";
  sc.addEventListener("change", () => {
    settings.uiScale = sc.value === "auto" ? "auto" : Number(sc.value);
    saveSettings(); bridge?.setUiScale(settings.uiScale);
  });
  bridge?.setUiScale(settings.uiScale);
}

// ---- Hauptschleife --------------------------------------------------------------------
const preview = $<HTMLCanvasElement>("preview");

/** Seitenverhältnis wie der erste offene Ausgang (z. B. LED-Wand 6:1), sonst 16:9. */
function previewAspect(): number {
  if (outLayout.mode === "canvas") {
    const open = outLayout.screens.filter(sc => displays.some(d => d.open && d.id === sc.id));
    if (open.length) { const b = canvasBounds(open); return b.w / b.h; }
  }
  const d = displays.find(x => x.open);
  return d && d.height > 0 ? d.width / d.height : 16 / 9;
}
/** Vorschau so groß wie möglich in ihren Bereich einpassen, ohne zu verzerren. */
function fitPreview(): void {
  const box = $("mon-box");
  const a = previewAspect();
  const bw = box.clientWidth, bh = box.clientHeight;
  if (bw < 10 || bh < 10) return;
  const w = Math.min(bw, bh * a), h = w / a;
  preview.style.width = `${Math.floor(w)}px`; preview.style.height = `${Math.floor(h)}px`;
  // Rechenauflösung: scharf genug, aber sparsam (max. 1280 Pixel breit)
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const iw = Math.min(1280, Math.round(w * dpr)), ih = Math.round(iw / a);
  engine?.resize(iw, ih);
}
new ResizeObserver(() => fitPreview()).observe($("mon-box"));
let engine: Engine | null = null;
const monHome = $("mon-box").parentElement!;
try {
  engine = new Engine(preview);
  engine.videoSource = (key, id, t, rate, o) => previewPool.get(key, id, t, rate, o);
  engine.videoDuration = id => videoLib.duration(id);
} catch (e) {
  $("mon-info").textContent = (e as Error).message;
}
const SOURCE_LABEL: Record<string, string> = { ljlink: "LJ-LINK", link: "ABLETON LINK", osc: "OSC", midi: "MIDI-CLOCK", audio: "AUDIO", tap: "TAP", manual: "MANUELL" };
let lastUi = 0, lastPublish = 0;
/** Animationszeit der Ebenen: hier gezählt, an alle Ausgänge geschickt. */
const layerClock = new LayerClock();
function setPill(id: string, state: "ok" | "off" | "warn", text?: string): void {
  const p = $(id); p.classList.toggle("ok", state === "ok"); p.classList.toggle("warn", state === "warn");
  if (text !== undefined) { const d = p.querySelector(".dot"); p.replaceChildren(...(d ? [d] : []), document.createTextNode(text)); }
}

function frame(): void {
  const now = Date.now();
  ctx.tempo.tick(now);
  tickTransition(ctx, now);
  tickAuto(ctx, now);
  tickVideoStarts(ctx, now);
  cueTick(ctx.cues, now, cueEnv);
  ctx.show.cues = cueRenders(ctx.cues, now, cueEnv);
  if (now - lastSweep > 1000) { lastSweep = now; previewPool.sweep(); }
  // Testbild per Mapping umgeschaltet: Knöpfe nachziehen
  if (`${ctx.show.testCard}|${ctx.show.testPattern}` !== testUiKey) syncTestUi();
  // Audio-Eingang: Spektrum und Wellenform in den Show-Zustand (gehen so auch an die Ausgänge)
  const mic = audioIn.sample();
  if (mic) ctx.show.audio.mic = mic; else delete ctx.show.audio.mic;
  // Bass-Schläge erkennen (Live-Audio oder LJ-Link): z. B. für die Pulsierenden Ringe
  { const lb = liveBands(ctx.show.audio, ctx.tempo.beatAt(now), now / 1000); kickDet.feed(Math.max(lb[0] ?? 0, lb[1] ?? 0), now); ctx.show.audio.kicks = kickDet.kicks; }
  const beat = ctx.tempo.beatAt(now);
  const lt = layerClock.tick(now, ctx.show.layers);
  // Modulationen (LFO, Audio) wirken auf das Bild, die Regler behalten ihren Grundwert
  let shown = modulatedShow(ctx, ctx.mods ?? [], beat, liveBands(ctx.show.audio, beat, now / 1000));
  // Timeline: Effekt-Blöcke (Strobe, Flash, White, W-Flash, Blinder, Blackout) und Helligkeit je Bild
  const tlo = timelineOverride(ctx.cues, now, cueEnv, imageList(ctx.show).map(im => im.id), multiImage() ? showImage() : "");
  if (tlo) {
    const f = tlo.fx;
    shown = { ...shown,
      strobe: { ...shown.strobe, on: shown.strobe.on || f.has("strobe"), flash: shown.strobe.flash || f.has("flash"),
        white: shown.strobe.white || f.has("white"), whiteFlash: shown.strobe.whiteFlash || f.has("wflash") },
      blackout: shown.blackout || f.has("blackout"),
      blinder: Math.max(shown.blinder ?? 0, f.has("blinder") ? 1 : 0),
      // Helligkeit je Bild: Regler/Pult × Timeline
      stackGain: Object.fromEntries([...new Set([...Object.keys(tlo.gains), ...Object.keys(shown.stackGain ?? {})])]
        .map(id => [id, (tlo.gains[id] ?? 1) * (shown.stackGain?.[id] ?? 1)])) };
  }
  // Projektionsmapping: Live-Vorschauen der Bilder (je Bild abwechselnd eins pro Durchlauf), dann das bearbeitete groß
  const cv = shown.canvas ?? MAIN_STACK;
  if (engine && mappingOn() && tileCanvases.size > 1) {
    const ids = [...tileCanvases.keys()].filter(id => id !== cv);
    const id = ids[tileTurn++ % Math.max(1, ids.length)];
    if (id) {
      engine.render(showForImage(shown, id), beat, now, ctx.tempo.bpm, null, lt, null, `I${id}:`);
      tileCanvases.get(id)?.getContext("2d")?.drawImage(preview, 0, 0, 384, 216);
    }
  }
  engine?.render(showForImage(shown, cv), beat, now, ctx.tempo.bpm, null, lt);
  if (mappingOn()) tileCanvases.get(cv)?.getContext("2d")?.drawImage(preview, 0, 0, 384, 216);
  thumbs.draw(now);

  if (now - lastPublish > 33 && bridge) {
    lastPublish = now;
    const t = ctx.tempo.snapshot;
    const f: Frame = {
      show: shown, bpm: ctx.tempo.bpm, originMs: t.originMs, beatAtOrigin: t.beatAtOrigin, testPattern: ctx.show.testCard,
      videoDurations: Object.fromEntries(videoLib.items.map(v => [v.id, v.duration])),
      layout: outLayout, openOutputs: displays.filter(d => d.open).map(d => d.id),
      layerClock: layerClock.snap(now),
    };
    bridge.publishFrame(JSON.parse(JSON.stringify(f)) as Frame);
  }
  if (now - lastUi > 100) { lastUi = now; updateUi(now, beat); syncCanvases(); }
  requestAnimationFrame(frame);
}

function updateUi(now: number, beat: number): void {
  const s = ctx.show;
  const bi = Math.floor(beat) % 4;
  $("beats").querySelectorAll("i").forEach((b, i) => b.classList.toggle("on", i === ((bi % 4) + 4) % 4));
  const src = ctx.tempo.source;
  lockBtn.classList.toggle("ok", src !== "manual");
  const lockText = ctx.tempo.lock ? `FEST · ${SOURCE_LABEL[ctx.tempo.lock] ?? ctx.tempo.lock}` : `AUTO · ${SOURCE_LABEL[src] ?? src}`;
  if (lockBtn.textContent !== lockText) lockBtn.textContent = lockText;
  setPill("st-link", linkState.connected ? "ok" : "off", linkState.connected ? `LINK · ${linkState.peers}` : "LINK");
  $("st-link").title = linkState.connected ? "Ableton Link über Carabiner verbunden" : "Ableton Link: Carabiner starten (Port 17000)";
  setPill("st-midi", midi.devices.length ? "ok" : "off", midi.devices.length ? `MIDI · ${midi.devices.length}` : "MIDI");
  $("st-midi").title = midi.devices.join(", ") || midi.error || "Kein MIDI-Gerät";
  const dmxLive = now - lastDmxAt < 1500;
  setPill("st-dmx", dmxLive ? "ok" : "off"); setPill("st-osc", (netStatus?.osc.packets ?? 0) > 0 ? "ok" : "off");
  setPill("st-lj", ctx.lj.connected ? "ok" : "off");
  $("st-fps").textContent = engine ? `${Math.round(engine.info.fps)} FPS · ${engine.info.frameMs.toFixed(1)} ms` : "– FPS";
  if (engine) {
    const t = s.transition;
    $("mon-info").textContent = t
      ? `Überblendung ${Math.round(transitionProgress(t, beat, now) * 100)} % · ${preview.width} × ${preview.height}`
      : `${preview.width} × ${preview.height}`;
  }
  $("blackout").classList.toggle("on", s.blackout);

  if (!document.activeElement || document.activeElement !== bpmIn) bpmBtn.textContent = ctx.tempo.bpm.toFixed(2);
  for (let l = 0; l < s.layers.length; l++) {
    const layer = s.layers[l]!;
    clipCells[l]?.forEach((b, c) => b.classList.toggle("on", rowClips[l]?.[c] === layer.clip));
    const op = opSliders[l]; if (op && document.activeElement !== op) op.value = String(Math.round(layer.opacity * 100));
  }
  const rows = document.querySelectorAll<HTMLElement>("#grid .lrow");
  rows.forEach((row, ri) => {
    const l = s.layers.length - 1 - ri; const layer = s.layers[l];
    if (!layer) return;
    row.classList.toggle("sel", l === fxPanel.layer);
    const sels = row.querySelectorAll<HTMLSelectElement>("select");
    const color = sels[0]!, blend = sels[1]!, drive = sels[2];
    if (document.activeElement !== color) color.value = layer.colorSource;
    if (document.activeElement !== blend) blend.value = layer.blend;
    if (drive && document.activeElement !== drive) drive.value = layer.drive ?? "auto";
  });
  (window as unknown as { refreshSlots: () => void }).refreshSlots();
  updateAudioUi();
  updateTcUi();
  updateDeck();
  for (const msg of leds.compute(mappings, ctx, beat)) midi.send(msg.device, msg.bytes);
  fxPanel.update();
  layerPanel.update();
  mediaPanel.update();
  videoPanel.update(ctx.tempo.bpm);
  scenePanel.update();
  if ($("tab-show").classList.contains("on")) showTab.update();
  autosave(now);
  if ($("tab-connect").classList.contains("on")) drawConnect(now);
}

const fxPanel = new FxPanel(ctx, $("fx-title"), $("fx-list"), $<HTMLSelectElement>("fx-add"));
const layerPanel = new LayerPanel(ctx, $("layer-panel"), () => fxPanel.layer, () => { rebuildGrid(); rebuildDeck(); });
const mediaPanel = new MediaPanel(ctx, library, $("media-panel"), () => fxPanel.layer, () => rebuildGrid());
const videoPanel = new VideoPanel(ctx, videoLib, $("video-panel"), () => fxPanel.layer, () => rebuildGrid());
const showTab = new ShowTab({
  ctx, env: cueEnv, videos: videoLib, images: library, importFiles: f => importToLibrary(f), toast,
  tcNow: () => tcClock.now(Date.now()), tcFps: () => tcClock.fps,
  multiImage: () => multiImage(),
});
const scenePanel = new ScenePanel(ctx, $("scenes"), $<HTMLButtonElement>("scene-auto"), $<HTMLButtonElement>("scene-add"));
rebuildGrid(); buildSidebar(); buildCatalog(); bindSettings();
fxPanel.select(0);
const thumbs = new ThumbView($("grid"), () => ({ cells: clipCells, clips: rowClips }), ctx);
if (engine) library.attach(engine);
if (thumbs.gl) {
  library.attach(thumbs.gl);
  // Im Clip-Raster zeigen Videos ihr Vorschaubild (spart Dekodieren)
  thumbs.gl.videoSource = (_key, id) => { const p = videoLib.posters.get(id); return p ? { el: p, w: p.width, h: p.height } : null; };
  thumbs.gl.videoDuration = id => videoLib.duration(id);
}

// ---- Projekt laden und automatisch speichern -----------------------------------------
let lastSaved = "", lastSaveCheck = 0, loaded = false;
/** Projektdatei: Name, Fingerabdruck des gespeicherten Stands, ungespeicherte Änderungen. */
let projName = "Unbenannt", baseline = "", projDirty = false, projRecent: string[] = [];
const currentJson = () => serializeProject(ctx, library.items, mappings.list, videoLib.items, outLayout);
function setDirty(d: boolean): void {
  if (d === projDirty) return;
  projDirty = d; $("proj-dirty").hidden = !d;
  bridge?.projectDirty(d);
}
function showProjName(): void {
  $("proj-name").textContent = projName;
  const list = $("proj-recent"); list.replaceChildren();
  if (!projRecent.length) return;
  list.append(el("div", "proj-sep", "Zuletzt geöffnet"));
  for (const f of projRecent.slice(0, 6)) {
    const b = el("button", "", f.split(/[\\/]/).pop()!.replace(/\.vjlink$/i, "")); b.title = f; b.setAttribute("role", "menuitem");
    b.addEventListener("click", () => { closeProjMenu(); void runFileCmd("openPath", f); });
    list.append(b);
  }
}
async function runFileCmd(cmd: ProjectFileCmd, filePath?: string): Promise<void> {
  if (!bridge) { toast("Projektdateien gibt es nur in der App."); return; }
  // Gesperrt: speichern ja, aber kein anderes Projekt laden
  if (showLock.locked && cmd !== "save" && cmd !== "saveAs") { showLock.hint(); return; }
  const json = currentJson();
  const r = await bridge.projectFile(cmd, json, filePath);
  if (r.ok && (cmd === "save" || cmd === "saveAs")) {
    baseline = hashText(json); projName = r.name ?? projName;
    setDirty(false); showProjName(); toast(`Gespeichert: ${projName}`);
  }
  // Öffnen und Neu: der Hauptprozess lädt die Oberfläche neu
}
const projBtn = $<HTMLButtonElement>("proj-btn"), projMenu = $("proj-menu");
function closeProjMenu(): void { projMenu.hidden = true; projBtn.setAttribute("aria-expanded", "false"); }
projBtn.addEventListener("click", () => { projMenu.hidden = !projMenu.hidden; projBtn.setAttribute("aria-expanded", String(!projMenu.hidden)); });
projMenu.querySelectorAll<HTMLButtonElement>("[data-proj]").forEach(b => b.addEventListener("click", () => { closeProjMenu(); void runFileCmd(b.dataset.proj as ProjectFileCmd); }));
document.addEventListener("pointerdown", e => { if (!projMenu.hidden && !(e.target as HTMLElement).closest(".proj-wrap")) closeProjMenu(); });
bridge?.onMenu((cmd, arg) => {
  if (cmd === "settings") { if (showLock.locked) showLock.hint(); else openSettings(); return; }
  if (["new", "open", "save", "saveAs", "openPath"].includes(cmd)) void runFileCmd(cmd as ProjectFileCmd, arg);
});
if (!bridge) projBtn.hidden = true;

function autosave(now: number): void {
  if (!loaded || now - lastSaveCheck < 2000) return;
  lastSaveCheck = now;
  const json = currentJson();
  if (baseline) setDirty(hashText(json) !== baseline);
  if (json === lastSaved) return;
  lastSaved = json;
  if (bridge) bridge.saveProject(json);
  else try { localStorage.setItem("vjlink.project", json); } catch { /* Speicher voll oder gesperrt */ }
}
function json0(raw: string | null): ReturnType<typeof parseProject> {
  return raw ? parseProject(raw) : null;
}
/**
 * Start-Aufbau für ein leeres oder neues Projekt:
 * E6 Logo (VJ-Link-Logo klein unten rechts), E5 Text („VJ-Link“), E4 Laser (alle Laser-Visuals),
 * E3 und E2 Overlay (Licht, Partikel, Geometrie), E1 Basis (Start-Clips).
 */
async function setupStarterProject(): Promise<void> {
  // Wie vorgegeben: E1 Tunnel (Slot A), E2 Sternenfeld, E5 Text „VJ-Link“ und E6 Logo laufen; E3/E4 bereit

  const s = ctx.show;
  while (s.layers.length < 6 && addShowLayer(s) >= 0) { /* auffüllen */ }
  const L = s.layers;
  const gens = (ids: string[]) => ids.filter(id => EFFECT_BY_ID.get(id)?.status === "ready");
  L[0]!.name = "Basis"; L[0]!.clip = "tunnel"; L[0]!.colorSource = "A"; L[0]!.blend = "normal";
  for (const l of L) { l.opacity = 1; l.drive = "auto"; }
  L[1]!.name = "Overlay"; L[1]!.clips = gens(["starfield", "bokeh", "burst", "lightning", "vector-gobos", "flower", "moire", "co2-jet"]); L[1]!.clip = "starfield"; L[1]!.blend = "normal";
  L[2]!.name = "Overlay"; L[2]!.clips = gens(["plexus", "hypercube", "ripples", "liquid-light", "uv-glow", "fire", "mirror-ball", "dot-matrix"]); L[2]!.clip = null; L[2]!.blend = "normal";
  L[3]!.name = "Laser"; L[3]!.clips = EFFECTS.filter(e => e.category === "laser" && e.kind === "generator" && e.status === "ready").map(e => e.id); L[3]!.clip = null; L[3]!.blend = "add";
  // Text-Ebene: „VJ-Link“
  const spec = { ...defaultText(), text: "VJ-Link", upper: false };
  const cv = document.createElement("canvas"); drawText(cv, spec);
  const tp = { id: newMediaId(), name: "VJ-Link", dataUrl: cv.toDataURL("image/png") };
  const titem = await library.load(tp);
  L[4]!.name = "Text"; L[4]!.clip = null; L[4]!.blend = "normal";
  if (titem) { titem.text = spec; bridge?.addMedia(tp); L[4]!.clips = [mediaClip(tp.id)]; L[4]!.clip = mediaClip(tp.id); }
  Object.assign(L[4]!.media, { scale: 1, x: 0, y: 0, rotation: 0, anim: "none", keyMode: "none" });
  // Logo-Ebene: VJ-Link-Schriftzug klein unten rechts
  const lp = { id: newMediaId(), name: "VJ-Link-Logo", dataUrl: vjlinkLogo };
  const litem = await library.load(lp);
  L[5]!.name = "Logo"; L[5]!.blend = "normal";
  if (litem) { bridge?.addMedia(lp); L[5]!.clips = [mediaClip(lp.id)]; L[5]!.clip = mediaClip(lp.id); }
  Object.assign(L[5]!.media, { scale: 0.08, x: 0.77, y: -0.84, rotation: 0, anim: "none", keyMode: "none" });
  L[5]!.opacity = 1;
}
// ---- Projektionsmapping: Bilder (bis 5) und welche Leinwand welches Bild zeigt -----------
let canvasSig = "", tilesSig = "", tileTurn = 0, cueImgSig = "";
const tileCanvases = new Map<string, HTMLCanvasElement>();
let armedImageDelete = "";
const mappingOn = () => outLayout.mode === "mapping";

/** Live-Vorschauen der Bilder unter „Ausgang“ (Klick = bearbeiten) und rechts die Leinwände mit Bild-Auswahl. */
function syncCanvases(): void {
  const s = ctx.show, st = syncStacks(s);
  const images = imageList(s);
  // Stapel ohne Bild aufräumen (z. B. nach dem Laden alter Projekte)
  for (const id of Object.keys(st)) if (id !== MAIN_STACK && !images.some(im => im.id === id)) { dropCanvas(s, id); rebuildGrid(); rebuildDeck(); }
  if (!mappingOn() && s.canvas !== MAIN_STACK) { selectCanvas(s, MAIN_STACK); rebuildGrid(); rebuildDeck(); fxPanel.select(0); }
  // Bearbeitetes Bild von außen gewechselt (MIDI/OSC „bild.N.bearbeiten“): Oberfläche nachziehen
  if ((s.canvas ?? MAIN_STACK) !== uiCanvas) { uiCanvas = s.canvas ?? MAIN_STACK; editImage(uiCanvas); return; }
  const surfaces = outLayout.surfaces ?? [];
  // Bild-Vorschauen
  const tsig = `${mappingOn()}|${s.canvas}|${images.map(im => `${im.id}:${im.name}`).join(",")}|${armedImageDelete}`;
  if (tsig !== tilesSig) {
    tilesSig = tsig;
    const box = $("img-tiles");
    box.hidden = !mappingOn();
    // Im Mapping-Modus sind die Bilder die Ausgangs-Anzeige; die Einzelvorschau rechnet unsichtbar für die Kacheln
    monHome.classList.toggle("mapping", mappingOn());
    box.replaceChildren(); tileCanvases.clear();
    if (mappingOn()) {
      for (const im of images) {
        const t = el("div", `img-tile${s.canvas === im.id ? " on" : ""}`);
        t.dataset.img = im.id;
        const c = el("canvas"); c.width = 384; c.height = 216; tileCanvases.set(im.id, c);
        const nm = el("span", "img-name", im.name);
        nm.title = "Doppelklick oder ✎: umbenennen";
        const pen = el("button", "img-pen", "✎"); pen.title = "Umbenennen";
        pen.addEventListener("click", ev => { ev.stopPropagation(); renameImage(im.id); });
        // Helligkeit des Bilds (fester Regler „bild.N.hell“, per MIDI/OSC/Pult belegbar)
        const n = images.indexOf(im) + 1;
        const gain = el("input", "img-gain"); gain.type = "range"; gain.min = "0"; gain.max = "1"; gain.step = "0.01";
        gain.value = String(s.stackGain?.[im.id] ?? 1); gain.dataset.ctl = `bild.${n}.hell`; gain.dataset.img = im.id;
        gain.title = `Helligkeit ${im.name}`; gain.setAttribute("aria-label", `Helligkeit ${im.name}`);
        gain.addEventListener("click", ev => ev.stopPropagation());
        gain.addEventListener("input", () => { (s.stackGain ??= {})[im.id] = Number(gain.value); });
        t.dataset.ctl = `bild.${n}.bearbeiten`;
        t.append(c, nm, pen, gain);
        t.title = `${im.name} bearbeiten (Clips, Ebenen, Effekte)`;
        t.addEventListener("click", ev => {
          if ((ev.target as HTMLElement).closest(".img-x, .img-pen, .img-rename")) return;
          // Doppelklick selbst erkennen (der erste Klick baut die Kacheln neu auf)
          const now = performance.now();
          if (lastTileClick.id === im.id && now - lastTileClick.at < 400) { lastTileClick = { id: "", at: 0 }; renameImage(im.id); return; }
          lastTileClick = { id: im.id, at: now };
          if (ctx.show.canvas !== im.id) editImage(im.id);
        });
        if (im.id !== MAIN_STACK) {
          const x = el("button", `img-x${armedImageDelete === im.id ? " armed" : ""}`, armedImageDelete === im.id ? "löschen?" : "×");
          x.title = "Bild löschen";
          x.addEventListener("click", ev => {
            ev.stopPropagation();
            if (armedImageDelete !== im.id) { armedImageDelete = im.id; syncCanvases(); setTimeout(() => { if (armedImageDelete === im.id) { armedImageDelete = ""; syncCanvases(); } }, 2500); return; }
            armedImageDelete = "";
            for (const sf of surfaces) if (sf.image === im.id) sf.image = MAIN_STACK;
            removeImage(s, im.id); rebuildGrid(); rebuildDeck(); fxPanel.select(0); syncCanvases();
          });
          t.append(x);
        }
        box.append(t);
      }
      if (images.length < MAX_IMAGES) {
        const add = el("button", "img-add", "+ Bild");
        add.title = `Weiteres Bild mit eigenen Ebenen (bis ${MAX_IMAGES})`;
        add.addEventListener("click", () => { const id = addImage(s); if (id) { editImage(id); toast("Neues Bild (Kopie von Bild 1). Rechts einer Leinwand zuweisen."); } });
        box.append(add);
      }
    }
    fitPreview();
  }
  // Helligkeits-Regler der Bilder nachziehen (MIDI, OSC, Pult)
  document.querySelectorAll<HTMLInputElement>("#img-tiles .img-gain").forEach(g => {
    const v = String(s.stackGain?.[g.dataset.img!] ?? 1);
    if (g.value !== v && document.activeElement !== g) g.value = v;
  });
  // SHOW: auf welchem Bild der Ablauf läuft (nur im Mapping-Modus mit mehreren Bildern)
  const cueSig = `${mappingOn()}|${ctx.show.cueImage}|${images.map(im => `${im.id}:${im.name}`).join(",")}|${surfaces.map(sf => `${sf.name}:${sf.image}`).join(",")}`;
  if (cueSig !== cueImgSig) {
    cueImgSig = cueSig;
    const wrap = $("cue-img-wrap"), sel = $<HTMLSelectElement>("cue-image");
    wrap.hidden = !mappingOn() || images.length < 2;
    sel.replaceChildren();
    for (const im of images) {
      const on = surfaces.filter(sf => (sf.image ?? MAIN_STACK) === im.id).map(sf => sf.name);
      sel.append(new Option(`${im.name}${on.length ? ` (${on.join(", ")})` : " (auf keiner Leinwand)"}`, im.id));
    }
    sel.value = showImage();
  }
  // Rechts: Leinwände → Bild
  const sig = `${mappingOn()}|${images.map(im => `${im.id}:${im.name}`).join(",")}|${surfaces.map(sf => `${sf.id}:${sf.name}:${sf.image}:${sf.screen}`).join(",")}|${displays.map(d => d.label).join(",")}`;
  const gc = $("grid-canvas");
  const curName = s.canvas === MAIN_STACK && !mappingOn() ? "" : images.find(im => im.id === s.canvas)?.name ?? "";
  gc.hidden = !curName; gc.textContent = curName ? `· ${curName}` : "";
  if (sig === canvasSig) return;
  canvasSig = sig;
  const box = $("canvas-pick");
  box.hidden = !mappingOn();
  box.replaceChildren();
  if (!mappingOn()) return;
  box.append(el("div", "cp-head", "Leinwände"));
  if (!surfaces.length) box.append(el("p", "muted small", "Noch keine Leinwand. Im Tab AUSGABE → Projektionsmapping anlegen."));
  for (const sf of surfaces) {
    const row = el("div", "cp-row");
    const scr = displays.find(d => d.id === sf.screen)?.label ?? "Ausgang";
    const t = el("div", "cp-name");
    // Name direkt hier ändern (Enter oder Klick daneben übernimmt)
    const nm = el("input", "cp-nm"); nm.value = sf.name; nm.maxLength = 40; nm.setAttribute("aria-label", "Name der Leinwand");
    nm.addEventListener("keydown", e => { if (e.key === "Enter") nm.blur(); if (e.key === "Escape") { nm.value = sf.name; nm.blur(); } });
    nm.addEventListener("change", () => { const v = nm.value.trim(); if (v) sf.name = v; canvasSig = ""; cueImgSig = ""; if ($("tab-output").classList.contains("on")) outputTab.render(); });
    const pen = el("button", "cp-pen", "✎"); pen.title = "Leinwand umbenennen";
    pen.addEventListener("click", () => { nm.focus(); nm.select(); });
    const top = el("span", "cp-top"); top.append(nm, pen);
    t.append(top, el("small", "", scr));
    const sel = el("select"); sel.setAttribute("aria-label", `Bild für ${sf.name}`);
    for (const im of images) sel.append(new Option(im.name, im.id));
    sel.value = images.some(im => im.id === sf.image) ? sf.image! : MAIN_STACK;
    sel.addEventListener("change", () => { sf.image = sel.value; canvasSig = ""; syncCanvases(); if ($("tab-output").classList.contains("on")) outputTab.render(); });
    row.append(t, sel);
    box.append(row);
  }
  box.append(el("p", "muted small", "Welches Bild auf welche Leinwand kommt. Ein Bild bearbeiten: links seine Vorschau anklicken. Szenen speichern alle Bilder."));
}

$<HTMLSelectElement>("cue-image").addEventListener("change", e => { ctx.show.cueImage = (e.target as HTMLSelectElement).value; cueImgSig = ""; });

let lastTileClick = { id: "", at: 0 };
/** Bild umbenennen: Eingabefeld direkt in der Kachel. */
function renameImage(id: string): void {
  const nm = document.querySelector<HTMLElement>(`#img-tiles .img-tile[data-img="${id}"] .img-name`);
  const im = imageList(ctx.show).find(x => x.id === id);
  if (!nm || !im) return;
  const inp = el("input", "img-rename"); inp.value = im.name; inp.maxLength = 30; inp.setAttribute("aria-label", "Name des Bildes");
  let doneOnce = false;
  const done = () => {
    if (doneOnce) return; doneOnce = true;
    const v = inp.value.trim();
    if (v) ctx.show.images = imageList(ctx.show).map(x => x.id === id ? { ...x, name: v } : x);
    tilesSig = ""; canvasSig = ""; cueImgSig = ""; syncCanvases();
  };
  inp.addEventListener("keydown", e => { if (e.key === "Enter") done(); if (e.key === "Escape") { inp.value = im.name; done(); } });
  inp.addEventListener("change", done);
  inp.addEventListener("blur", done);
  inp.addEventListener("click", e => e.stopPropagation());
  nm.replaceWith(inp); inp.focus(); inp.select();
}

/** Bild zum Bearbeiten wählen (Clip-Raster, Ebenen, Effekte, Fader zeigen dann seine Ebenen). */
function editImage(id: string): void {
  selectCanvas(ctx.show, id); uiCanvas = id;
  canvasSig = ""; tilesSig = "";
  rebuildGrid(); rebuildDeck(); fxPanel.select(0); libraryPanel.close();
  syncCanvases();
}

/** Gibt es mehrere Bilder (Projektionsmapping)? Nur dann bedeutet „nur andere Bilder“ etwas. */
function multiImage(): boolean { return mappingOn() && imageList(ctx.show).length > 1; }

/** Bild, auf dem der SHOW-Ablauf läuft (nur im Mapping-Modus wählbar). */
function showImage(): string {
  const id = ctx.show.cueImage ?? MAIN_STACK;
  return mappingOn() && imageList(ctx.show).some(im => im.id === id) ? id : MAIN_STACK;
}

/** Bild-Zustand für eine Vorschau: dessen Ebenen als Hauptbild; Cues nur auf dem Bild des SHOW-Ablaufs. */
function showForImage(sh: ShowState, id: string): ShowState {
  const cues = showImage() === id ? sh.cues : [];
  const stackGain = { [MAIN_STACK]: sh.stackGain?.[id] ?? 1 };
  if (id === MAIN_STACK) return { ...sh, cues, stackGain, layers: sh.stacks?.[MAIN_STACK] ?? sh.layers };
  const layers = sh.stacks?.[id];
  if (!layers) return sh;
  return { ...sh, cues, stackGain, layers, stacks: { ...sh.stacks, [MAIN_STACK]: layers },
    transition: sh.transition ? { ...sh.transition, from: sh.transition.fromStacks?.[id] ?? sh.transition.from } : null };
}

let fresh = false;
async function loadProject(): Promise<void> {
  try {
    let json: string | null = null;
    if (bridge) {
      const r = await bridge.loadProject();
      const pv = json0(r.project);
      // Nur die Grafiken dieses Projekts (die Bibliothek im App-Ordner kann mehr enthalten)
      const want = new Set((pv?.media ?? []).map(m => m.id));
      for (const m of r.media) if (want.has(m.id)) await library.load(m);
      // Text-Clips: Angaben zum Bearbeiten aus dem Projekt
      for (const pm of pv?.media ?? []) if (pm.text) { const it = library.items.find(i => i.id === pm.id); if (it) it.text = pm.text; }
      projName = r.file?.name ?? "Unbenannt"; projRecent = r.recent ?? [];
      baseline = r.fresh ? "" : r.savedHash ?? "";
      fresh = !!r.fresh;
      // Videos: Angaben stehen im Projekt, die Dateien im Bibliotheksordner
      for (const v of pv?.videos ?? []) await videoLib.add(v);
      json = r.project;
    } else {
      try { json = localStorage.getItem("vjlink.project"); } catch { json = null; }
    }
    const p = json ? parseProject(json) : null;
    // Leeres bzw. neues Projekt: Start-Aufbau mit sechs Ebenen, Text und Logo
    if (!p) await setupStarterProject();
    if (p) {
      applyProject(ctx, p);
      outLayout = p.outputs;
      if (p.mappings) mappings.replace(p.mappings);
      // Grafiken, deren Datei fehlt, nicht als Clip stehen lassen
      const known = new Set([...library.items.map(i => mediaClip(i.id)), ...videoLib.items.map(v => videoClip(v.id))]);
      for (const l of ctx.show.layers) if ((l.clip?.startsWith("img:") || isVideoClip(l.clip)) && !known.has(l.clip!)) l.clip = null;
      lastSaved = json!;
    }
  } finally {
    loaded = true;
    // Gerade geöffnet oder neu: dieser Stand gilt als gespeichert
    if (bridge && (fresh || !baseline)) { baseline = hashText(currentJson()); bridge.projectBaseline(baseline); }
    showProjName();
    rebuildGrid();
    fxPanel.select(Math.min(fxPanel.layer, ctx.show.layers.length - 1));
    rebuildDeck();
    scenePanel.update(true);
  }
}
void (async () => { if (bridge) displays = await bridge.listDisplays(); renderDisplays(); outputTab.render(); fitPreview(); })();
let updateDeck = buildDeck(ctx, $("deck"));
function rebuildDeck(): void { $("deck").replaceChildren(); updateDeck = buildDeck(ctx, $("deck")); }
// Erst laden, wenn alle Teile der Oberfläche stehen (im Browser läuft das Laden ohne Wartezeit durch).
void loadProject();
// Sicherstellen, dass jeder Generator im Katalog auch in der Engine existiert.
for (const g of READY_GENERATORS) if (!GEN_IDS.includes(g.id as typeof GEN_IDS[number]) || !EFFECT_BY_ID.has(g.id)) console.error("Generator fehlt in der Engine:", g.id);
requestAnimationFrame(frame);

// Entwicklungshilfe: im Browser-Modus Zustand von außen setzen.
(window as unknown as { __vj: unknown }).__vj = {
  ctx, onControl, select: (l: number) => fxPanel.select(l), videoStats: () => previewPool.stats,
  loadMedia: async (p: { id: string; name: string; dataUrl: string }) => { await library.load(p); rebuildGrid(); },
  addVideo: async (v: { id: string; name: string; ext: string }) => { await videoLib.add({ ...v, duration: 0, width: 0, height: 0 }); rebuildGrid(); },
  importFiles: (f: File[]) => importToLibrary(f),
  rebuild: () => { rebuildGrid(); rebuildDeck(); },
};
