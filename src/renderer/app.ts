// Hauptfenster: Show-Zustand, Eingänge und Oberfläche.
import { Engine } from "../engine/engine";
import { GEN_IDS } from "../engine/shaders";
import { TempoClock } from "../core/tempo";
import { DmxDecoder, DMX_MODE_STANDARD_CHANNELS, CH, channelListCsv } from "../core/dmx";
import { handleLj, handleOsc, recallScene, tickAuto, tickTransition, type ControlContext } from "../core/control";
import { CLUB_STANDARD_RULES, newLjState, parseLjMessage } from "../core/ljlink";
import { EFFECTS, EFFECT_BY_ID, READY_GENERATORS, type EffectCategory } from "../core/effects";
import { BLEND_MODES, COLOR_SOURCES, defaultScenes, LAYER_COUNT, SLOT_NAMES, defaultShow, type BlendMode, type ColorSource } from "../core/show";
import { frameBeat, type ControlEvent, type DisplayInfo, type Frame, type NetStatus } from "../core/frame";
import { bridge } from "./bridge";
import { setControl } from "../core/controls";
import { buildDeck } from "./deck";
import { ThumbView } from "./thumbs";
import { MediaLibrary } from "./medialib";
import { MediaPanel } from "./mediapanel";
import { ScenePanel } from "./scenepanel";
import { mediaClip } from "../core/media";
import { applyProject, parseProject, serializeProject } from "../core/project";
import { stepScene } from "../core/control";
import { FxPanel } from "./fxpanel";
import { transitionProgress } from "../core/show";

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e;
};

// ---- Einstellungen (nur Komfort, Oberfläche funktioniert auch ohne) -------------------
interface Settings { universe: number; sacn: number; address: number; uiScale: "auto" | number }
function loadSettings(): Settings {
  const d: Settings = { universe: 0, sacn: 1, address: 1, uiScale: "auto" };
  try { return { ...d, ...JSON.parse(localStorage.getItem("vjlink.settings") ?? "{}") }; } catch { return d; }
}
const settings = loadSettings();
function saveSettings(): void { try { localStorage.setItem("vjlink.settings", JSON.stringify(settings)); } catch { /* ohne Speicher weiter */ } }

// ---- Zustand --------------------------------------------------------------------------
const ctx: ControlContext = {
  show: defaultShow(), tempo: new TempoClock(), scenes: defaultScenes(), lj: newLjState(),
  rules: CLUB_STANDARD_RULES.map(r => ({ ...r })), bank: 1,
};
ctx.tempo.update("manual", 120, Date.now(), 0);
const decoder = new DmxDecoder(settings.address, ctx.scenes);
let testPattern = false;
let netStatus: NetStatus | null = null;
let lastDmx: Uint8Array | null = null;
let lastDmxAt = 0;
let displays: DisplayInfo[] = [];

// ---- Eingänge -------------------------------------------------------------------------
function onControl(e: ControlEvent): void {
  const now = Date.now();
  switch (e.type) {
    case "dmx": {
      const wanted = e.source === "artnet" ? settings.universe : settings.sacn;
      if (e.universe !== wanted) return;
      lastDmx = e.data; lastDmxAt = now;
      const fx = decoder.decode(e.data, ctx.show);
      if (fx.tempoFactor !== undefined) ctx.tempo.factor = fx.tempoFactor;
      if (fx.scene !== undefined) recallScene(ctx, fx.scene - 1, now);
      break;
    }
    case "osc": handleOsc(ctx, { address: e.address, args: e.args }, now); break;
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
  if (b.dataset.tab === "output") refreshDisplays();
}));

// ---- Show: Clip-Raster ----------------------------------------------------------------
const library = new MediaLibrary();
let clipCells: HTMLButtonElement[][] = [];
let clipIds: string[] = [];
const opSliders: HTMLInputElement[] = [];
let importTarget = 0;

/** Spalten: alle Generatoren, dann alle Grafiken der Bibliothek, dann „+ Grafik“. */
function clipList(): { id: string; name: string }[] {
  return [
    ...READY_GENERATORS.map(g => ({ id: g.id, name: g.name })),
    ...library.items.map(m => ({ id: mediaClip(m.id), name: m.name })),
  ];
}

function rebuildGrid(): void {
  const grid = $("grid");
  grid.querySelectorAll(".lrow").forEach(r => r.remove());
  const clips = clipList();
  clipIds = clips.map(c => c.id);
  clipCells = [];
  grid.style.setProperty("--cols", String(clips.length + 1));
  for (let l = LAYER_COUNT - 1; l >= 0; l--) {
    const row = el("div", "lrow");
    const name = el("div", "lname");
    name.title = "Anklicken: Effekte und Grafik dieser Ebene bearbeiten";
    name.addEventListener("click", e => {
      if ((e.target as HTMLElement).closest("input,select")) return;
      fxPanel.select(l);
    });
    name.append(el("b", "", `E${l + 1} · ${l === 0 ? "Basis" : "Overlay"}`));
    const op = el("input"); op.type = "range"; op.min = "0"; op.max = "100"; op.ariaLabel = `Deckkraft Ebene ${l + 1}`;
    op.addEventListener("input", () => { ctx.show.layers[l]!.opacity = Number(op.value) / 100; });
    opSliders[l] = op;
    const color = el("select"); color.ariaLabel = `Farbe Ebene ${l + 1}`;
    for (const c of COLOR_SOURCES) color.append(new Option(c === "original" ? "Original" : c === "gradient" ? "Verlauf" : c === "rainbow" ? "Regenbogen" : `Slot ${c}`, c));
    color.addEventListener("change", () => { ctx.show.layers[l]!.colorSource = color.value as ColorSource; });
    const blend = el("select"); blend.ariaLabel = `Mischmodus Ebene ${l + 1}`;
    for (const b of BLEND_MODES) blend.append(new Option(({ normal: "Normal", add: "Addieren", screen: "Bildschirm", multiply: "Multiplizieren" } as Record<BlendMode, string>)[b], b));
    blend.addEventListener("change", () => { ctx.show.layers[l]!.blend = blend.value as BlendMode; });
    name.append(op, color, blend);
    row.append(name);
    clipCells[l] = [];
    clips.forEach((clip, c) => {
      const b = el("button", clip.id.startsWith("img:") ? "cell media" : "cell", clip.name);
      b.title = clip.name;
      b.addEventListener("click", () => {
        const layer = ctx.show.layers[l]!;
        layer.clip = layer.clip === clip.id ? null : clip.id;
        if (clip.id.startsWith("img:") && layer.clip) fxPanel.select(l);
      });
      row.append(b); clipCells[l]![c] = b;
    });
    const add = el("button", "cell add", "+ Grafik");
    add.title = "Logo oder Bild laden (PNG, JPG, WebP, GIF, SVG)";
    add.addEventListener("click", () => { importTarget = l; $<HTMLInputElement>("file-input").click(); });
    row.append(add);
    grid.append(row);
  }
}

let toastTimer = 0;
function toast(msg: string): void {
  const t = $("toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = window.setTimeout(() => { t.hidden = true; }, 4000);
}

/** Dateien laden; die erste Grafik kommt auf die Ziel-Ebene. */
async function importFiles(files: FileList | File[], layer: number): Promise<void> {
  let first: string | null = null;
  for (const f of Array.from(files)) {
    const r = await library.importFile(f);
    if (typeof r === "string") { toast(r); continue; }
    first ??= mediaClip(r.id);
  }
  rebuildGrid();
  if (first) {
    const l = ctx.show.layers[layer]!;
    l.clip = first;
    if (layer > 0 && l.opacity < 0.05) l.opacity = 1;
    fxPanel.select(layer);
    toast("Grafik geladen. Lage und Animation rechts unter „Grafik“.");
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

// Tastatur: 1–9 Szenen, Pfeile weiter/zurück, B Blackout, F Flash (halten), T Tap
const typing = (t: EventTarget | null) => t instanceof HTMLElement && !!t.closest("input,select,textarea");
window.addEventListener("keydown", e => {
  if (typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
  if (/^[1-9]$/.test(e.key)) { recallScene(ctx, Number(e.key) - 1); e.preventDefault(); }
  else if (e.key === "ArrowRight") { stepScene(ctx, 1); e.preventDefault(); }
  else if (e.key === "ArrowLeft") { stepScene(ctx, -1); e.preventDefault(); }
  else if (e.key === "b" || e.key === "B") setControl(ctx, "blackout", ctx.show.blackout ? 0 : 1);
  else if ((e.key === "f" || e.key === "F") && !e.repeat) setControl(ctx, "strobe.flash", 1);
  else if ((e.key === "t" || e.key === "T") && !e.repeat) setControl(ctx, "tempo.tap", 1);
});
window.addEventListener("keyup", e => { if (e.key === "f" || e.key === "F") setControl(ctx, "strobe.flash", 0); });

function buildSidebar(): void {
  const slots = $("slots");
  const hex = (v: number) => Math.round(v * 255).toString(16).padStart(2, "0");
  const slotInputs: HTMLInputElement[] = [];
  SLOT_NAMES.forEach((n, i) => {
    const row = el("div", "slot");
    const sw = el("div", "sw");
    const inp = el("input"); inp.type = "color"; inp.ariaLabel = `Farbe Slot ${n}`;
    inp.addEventListener("input", () => {
      const v = inp.value; ctx.show.slots[i] = [parseInt(v.slice(1, 3), 16) / 255, parseInt(v.slice(3, 5), 16) / 255, parseInt(v.slice(5, 7), 16) / 255];
    });
    slotInputs[i] = inp;
    row.append(sw, el("b", "", `Slot ${n}`), inp); slots.append(row);
  });
  (window as unknown as { refreshSlots: () => void }).refreshSlots = () => {
    const sw = slots.querySelectorAll<HTMLElement>(".sw");
    ctx.show.slots.forEach((c, i) => {
      const h = `#${hex(c[0])}${hex(c[1])}${hex(c[2])}`;
      sw[i]!.style.background = h;
      if (document.activeElement !== slotInputs[i]) slotInputs[i]!.value = h;
    });
  };
  $("tap").addEventListener("click", () => { setControl(ctx, "tempo.tap", 1); });
  $("blackout").addEventListener("click", () => { setControl(ctx, "blackout", ctx.show.blackout ? 0 : 1); });
}

// ---- Bauen: Katalog -------------------------------------------------------------------
const CAT_LABEL: Record<EffectCategory, string> = { audio: "Audio und Equalizer", geometry: "Geometrie", particles: "Partikel und Natur", retro: "Retro und Analog", optical: "Optische Raumeffekte" };
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
async function refreshDisplays(): Promise<void> {
  const list = $("displays");
  if (!bridge) {
    $("output-note").textContent = "Mehrere Ausgänge gibt es nur in der Desktop-App. Im Browser läuft die Vorschau.";
    list.replaceChildren(); return;
  }
  displays = await bridge.listDisplays();
  renderDisplays();
}
bridge?.onDisplays(d => { displays = d; renderDisplays(); renderOutputStrip(); fitPreview(); });

/** Neben der Vorschau: welche Ausgänge offen sind, mit Auflösung. */
function renderOutputStrip(): void {
  const box = $("outs-strip");
  box.replaceChildren();
  const open = displays.filter(d => d.open);
  if (!bridge) { const c = el("div", "ochip none"); c.append(el("b", "", "Browser-Vorschau"), el("em", "", "Ausgänge nur in der App")); box.append(c); return; }
  for (const d of open) {
    const c = el("div", "ochip");
    c.append(el("b", "", d.label), el("em", "", `${Math.round(d.width * d.scaleFactor)} × ${Math.round(d.height * d.scaleFactor)}`));
    box.append(c);
  }
  const free = displays.filter(d => !d.open && !d.primary);
  if (!open.length) {
    const c = el("div", "ochip none");
    c.append(el("b", "", "Kein Ausgang offen"), el("em", "", free.length ? `${free.length} weitere${free.length === 1 ? "r" : ""} Bildschirm${free.length === 1 ? "" : "e"} frei` : "Nur dieser Bildschirm"));
    box.append(c);
  }
  for (const d of free) {
    const c = el("div", "ochip none");
    const b = el("button", "btn small-btn", "Als Ausgang öffnen");
    b.addEventListener("click", async () => { displays = await bridge!.toggleOutput(d.id); renderDisplays(); renderOutputStrip(); fitPreview(); });
    c.append(el("b", "", d.label), el("em", "", `${Math.round(d.width * d.scaleFactor)} × ${Math.round(d.height * d.scaleFactor)}`), b);
    box.append(c);
  }
}

function renderDisplays(): void {
  const list = $("displays");
  list.replaceChildren();
  for (const d of displays) {
    const row = el("div", d.open ? "display open" : "display");
    const info = el("div"); info.append(el("b", "", `${d.label}${d.primary ? " (Hauptbildschirm)" : ""}`));
    info.append(el("small", "", `${Math.round(d.width * d.scaleFactor)} × ${Math.round(d.height * d.scaleFactor)} Pixel`));
    const b = el("button", "btn", d.open ? "SCHLIESSEN" : "ALS AUSGANG ÖFFNEN");
    b.addEventListener("click", async () => { displays = await bridge!.toggleOutput(d.id); renderDisplays(); renderOutputStrip(); fitPreview(); });
    row.append(info, b); list.append(row);
  }
  $("output-note").textContent = displays.length > 1 ? "" : "Es ist nur ein Bildschirm angeschlossen. Ein Ausgang darüber verdeckt diese Oberfläche; Taste Esc oder Schließen im Hauptfenster beendet ihn.";
}
$<HTMLInputElement>("testpattern").addEventListener("change", e => { testPattern = (e.target as HTMLInputElement).checked; });

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
      card("LJ-Link", s.lj.error ? "err" : s.lj.clients > 0 ? "ok" : "off", [`WebSocket ${s.lj.port}`, s.lj.clients > 0 ? `${s.lj.clients} verbunden` : "wartet auf LJ-Link", s.lj.error ?? ""].filter(Boolean)),
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
function bindSettings(): void {
  const u = $<HTMLInputElement>("cfg-universe"), s = $<HTMLInputElement>("cfg-sacn"), a = $<HTMLInputElement>("cfg-address");
  u.value = String(settings.universe); s.value = String(settings.sacn); a.value = String(settings.address);
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(Number.isFinite(v) ? v : lo)));
  u.addEventListener("change", () => { settings.universe = clamp(Number(u.value), 0, 32767); saveSettings(); });
  s.addEventListener("change", () => { settings.sacn = clamp(Number(s.value), 1, 63999); saveSettings(); bridge?.configure({ sacnUniverse: settings.sacn }); });
  a.addEventListener("change", () => { settings.address = clamp(Number(a.value), 1, 512 - DMX_MODE_STANDARD_CHANNELS + 1); decoder.startAddress = settings.address; saveSettings(); });
  $("dl-channels").addEventListener("click", () => {
    const url = URL.createObjectURL(new Blob([channelListCsv(settings.address)], { type: "text/csv" }));
    const link = el("a"); link.href = url; link.download = "vj-link-kanalliste.csv"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  bridge?.configure({ sacnUniverse: settings.sacn });
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
try { engine = new Engine(preview); } catch (e) {
  $("mon-info").textContent = (e as Error).message;
}
const SOURCE_LABEL: Record<string, string> = { ljlink: "LJ-LINK", link: "ABLETON LINK", osc: "OSC", midi: "MIDI", audio: "AUDIO", tap: "TAP", manual: "MANUELL" };
let lastUi = 0, lastPublish = 0;
function setPill(id: string, state: "ok" | "off" | "warn", text?: string): void {
  const p = $(id); p.classList.toggle("ok", state === "ok"); p.classList.toggle("warn", state === "warn");
  if (text !== undefined) { const d = p.querySelector(".dot"); p.replaceChildren(...(d ? [d] : []), document.createTextNode(text)); }
}

function frame(): void {
  const now = Date.now();
  ctx.tempo.tick(now);
  tickTransition(ctx, now);
  tickAuto(ctx, now);
  const beat = ctx.tempo.beatAt(now);
  engine?.render(ctx.show, beat, now, ctx.tempo.bpm);
  thumbs.draw(now);

  if (now - lastPublish > 33 && bridge) {
    lastPublish = now;
    const t = ctx.tempo.snapshot;
    const f: Frame = { show: ctx.show, bpm: ctx.tempo.bpm, originMs: t.originMs, beatAtOrigin: t.beatAtOrigin, testPattern };
    bridge.publishFrame(JSON.parse(JSON.stringify(f)) as Frame);
  }
  if (now - lastUi > 100) { lastUi = now; updateUi(now, beat); }
  requestAnimationFrame(frame);
}

function updateUi(now: number, beat: number): void {
  const s = ctx.show;
  $("bpm").textContent = ctx.tempo.bpm.toFixed(2);
  const bi = Math.floor(beat) % 4;
  $("beats").querySelectorAll("i").forEach((b, i) => b.classList.toggle("on", i === ((bi % 4) + 4) % 4));
  const src = ctx.tempo.source;
  setPill("tempo-source", src === "manual" ? "off" : "ok"); $("tempo-source").textContent = SOURCE_LABEL[src] ?? src;
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

  for (let l = 0; l < LAYER_COUNT; l++) {
    const layer = s.layers[l]!;
    clipCells[l]?.forEach((b, c) => b.classList.toggle("on", clipIds[c] === layer.clip));
    if (document.activeElement !== opSliders[l]) opSliders[l]!.value = String(Math.round(layer.opacity * 100));
  }
  const rows = document.querySelectorAll<HTMLElement>("#grid .lrow");
  rows.forEach((row, ri) => {
    const l = LAYER_COUNT - 1 - ri; const layer = s.layers[l]!;
    row.classList.toggle("sel", l === fxPanel.layer);
    const sels = row.querySelectorAll<HTMLSelectElement>("select");
    const color = sels[0]!, blend = sels[1]!;
    if (document.activeElement !== color) color.value = layer.colorSource;
    if (document.activeElement !== blend) blend.value = layer.blend;
  });
  (window as unknown as { refreshSlots: () => void }).refreshSlots();
  updateDeck();
  fxPanel.update();
  mediaPanel.update();
  scenePanel.update();
  autosave(now);
  if ($("tab-connect").classList.contains("on")) drawConnect(now);
}

const fxPanel = new FxPanel(ctx, $("fx-title"), $("fx-list"), $<HTMLSelectElement>("fx-add"));
const mediaPanel = new MediaPanel(ctx, library, $("media-panel"), () => fxPanel.layer, () => rebuildGrid());
const scenePanel = new ScenePanel(ctx, $("scenes"), $<HTMLButtonElement>("scene-auto"), $<HTMLButtonElement>("scene-add"));
rebuildGrid(); buildSidebar(); buildCatalog(); bindSettings();
fxPanel.select(0);
const thumbs = new ThumbView($("grid"), () => ({ cells: clipCells, clips: clipIds }), ctx);
if (engine) library.attach(engine);
if (thumbs.gl) library.attach(thumbs.gl);

// ---- Projekt laden und automatisch speichern -----------------------------------------
let lastSaved = "", lastSaveCheck = 0, loaded = false;
function autosave(now: number): void {
  if (!loaded || now - lastSaveCheck < 2000) return;
  lastSaveCheck = now;
  const json = serializeProject(ctx, library.items);
  if (json === lastSaved) return;
  lastSaved = json;
  if (bridge) bridge.saveProject(json);
  else try { localStorage.setItem("vjlink.project", json); } catch { /* Speicher voll oder gesperrt */ }
}
async function loadProject(): Promise<void> {
  try {
    let json: string | null = null;
    if (bridge) {
      const r = await bridge.loadProject();
      for (const m of r.media) await library.load(m);
      json = r.project;
    } else {
      try { json = localStorage.getItem("vjlink.project"); } catch { json = null; }
    }
    const p = json ? parseProject(json) : null;
    if (p) {
      applyProject(ctx, p);
      // Grafiken, deren Datei fehlt, nicht als Clip stehen lassen
      const known = new Set(library.items.map(i => mediaClip(i.id)));
      for (const l of ctx.show.layers) if (l.clip?.startsWith("img:") && !known.has(l.clip)) l.clip = null;
      lastSaved = json!;
    }
  } finally {
    loaded = true;
    rebuildGrid();
    fxPanel.select(fxPanel.layer);
    scenePanel.update(true);
  }
}
void loadProject();
void (async () => { if (bridge) displays = await bridge.listDisplays(); renderOutputStrip(); fitPreview(); })();
const updateDeck = buildDeck(ctx, $("deck"));
// Sicherstellen, dass jeder Generator im Katalog auch in der Engine existiert.
for (const g of READY_GENERATORS) if (!GEN_IDS.includes(g.id as typeof GEN_IDS[number]) || !EFFECT_BY_ID.has(g.id)) console.error("Generator fehlt in der Engine:", g.id);
requestAnimationFrame(frame);

// Entwicklungshilfe: im Browser-Modus Zustand von außen setzen.
if (!bridge) (window as unknown as { __vj: unknown }).__vj = {
  ctx, onControl, select: (l: number) => fxPanel.select(l),
  loadMedia: async (p: { id: string; name: string; dataUrl: string }) => { await library.load(p); rebuildGrid(); },
};
