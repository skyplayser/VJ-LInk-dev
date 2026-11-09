// Ausgangsfenster: bekommt Bilder vom Hauptfenster und rechnet sie in der eigenen Auflösung.
import { Engine } from "../engine/engine";
import { frameBeat, type Frame } from "../core/frame";
import { bridge } from "./bridge";
import { decodeImage } from "./medialib";
import { VideoPool } from "./videopool";
import { CameraPool } from "./campool";
import { masksFor, viewFor, warpFor } from "../core/layout";
import { layerTimesAt } from "../core/show";

/** Welcher Bildschirm bin ich? (für den Ausschnitt auf der Leinwand) */
const displayId = Number(new URLSearchParams(location.search).get("display") ?? "NaN");

const canvas = document.getElementById("out") as HTMLCanvasElement;
const engine = new Engine(canvas);
let frame: Frame | null = null;
// Videos kommen direkt aus der Bibliothek (vjmedia://), Ton gibt nur das Hauptfenster aus
const videos = new VideoPool(id => `vjmedia://video/${id}`, false);
const durations = new Map<string, number>();
engine.videoSource = (key, id, t, rate, o) => videos.get(key, id, t, rate, o);
const cams = new CameraPool();
engine.camSource = id => cams.get(id);
setInterval(() => cams.sweep(), 1000);
engine.videoDuration = id => durations.get(id) ?? 0;
setInterval(() => videos.sweep(), 1000);
bridge?.onFrame(f => { frame = f; cams.sources = f.show.cameras ?? []; for (const [id, d] of Object.entries(f.videoDurations ?? {})) durations.set(id, d); });
bridge?.onMedia(async e => {
  if (e.type === "remove") { engine.removeMedia(e.id); return; }
  if (e.type === "raw") { engine.setRaw(e.id, e.w, e.h, e.data); return; }
  try { const d = await decodeImage(e.item.dataUrl); engine.setMedia(e.item.id, d.src, d.w, d.h); } catch { /* Bild unlesbar */ }
});

function fit(): void {
  const dpr = window.devicePixelRatio || 1;
  engine.resize(Math.round(window.innerWidth * dpr), Math.round(window.innerHeight * dpr));
}
window.addEventListener("resize", fit);
fit();

// Testbild: eigener 2D-Canvas darüber (Beschriftung), damit die WebGL-Fläche unberührt bleibt.
const overlay = document.createElement("canvas");
overlay.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;display:none;pointer-events:none";
document.body.appendChild(overlay);
const IDENT_COLORS = ["#e8364f", "#2f9bff", "#2fd07a", "#ffb020", "#b05cff", "#18d3d3", "#ff6ad5", "#9aa4b8"];

/** Wer bin ich: Nummer (wie im AUSGABE-Tab), Name und Lage auf der Leinwand. */
function whoAmI(f: Frame): { n: number; label: string; at: string } {
  const open = f.openOutputs ?? [];
  const screens = (f.layout?.screens ?? []).filter(s => open.includes(s.id));
  const i = screens.findIndex(s => s.id === displayId);
  const me = screens[i];
  const n = i >= 0 ? i + 1 : Math.max(1, open.indexOf(displayId) + 1);
  const at = f.layout?.mode === "canvas" && me ? `Leinwand bei ${me.x}, ${me.y}${me.w !== canvas.width || me.h !== canvas.height ? ` · als ${me.w} × ${me.h}` : ""}` : "Gleiches Bild auf allen";
  return { n, label: me?.label ?? `Ausgang ${n}`, at };
}

/** Schriftgröße so, dass der Text in maxW passt (höchstens fs). */
function fitFont(c: CanvasRenderingContext2D, text: string, fs: number, maxW: number, weight = 700): number {
  c.font = `${weight} ${fs}px system-ui, sans-serif`;
  const tw = c.measureText(text).width;
  const f = tw > maxW ? Math.max(10, Math.floor(fs * maxW / tw)) : fs;
  c.font = `${weight} ${f}px system-ui, sans-serif`;
  return f;
}

/** Deckendes Schild mit einer oder mehreren Zeilen (erste groß), mittig bei (x, y). */
function plate(c: CanvasRenderingContext2D, lines: string[], x: number, y: number, fs: number, maxW: number): void {
  const sizes = lines.map((t, i) => fitFont(c, t, i === 0 ? fs : Math.round(fs * 0.42), maxW - fs, i === 0 ? 800 : 600));
  const widths = lines.map((t, i) => { c.font = `${i === 0 ? 800 : 600} ${sizes[i]}px system-ui, sans-serif`; return c.measureText(t).width; });
  const pad = Math.round(fs * 0.45), gap = Math.round(fs * 0.2);
  const bw = Math.max(...widths) + pad * 2, bh = sizes.reduce((a, b) => a + b * 1.15, 0) + gap * (lines.length - 1) + pad * 2;
  const bx = Math.round(x - bw / 2), by = Math.round(y - bh / 2);
  c.fillStyle = "#000"; c.fillRect(bx, by, bw, bh);
  c.strokeStyle = "#fff"; c.lineWidth = Math.max(2, Math.round(fs / 24)); c.strokeRect(bx, by, bw, bh);
  c.fillStyle = "#fff"; c.textAlign = "center"; c.textBaseline = "middle";
  let cy = by + pad;
  lines.forEach((t, i) => {
    c.font = `${i === 0 ? 800 : 600} ${sizes[i]}px system-ui, sans-serif`;
    c.globalAlpha = i === 0 ? 1 : 0.8;
    c.fillText(t, x, cy + sizes[i]! * 0.575);
    cy += sizes[i]! * 1.15 + gap;
  });
  c.globalAlpha = 1;
}

/** Beschriftung je nach Testbild; Vollflächen (Weiß, Farben, Graustufen) bleiben ohne. */
function drawOverlay(f: Frame): void {
  const w = canvas.width, h = canvas.height, p = f.show.testPattern ?? "bars";
  overlay.width = w; overlay.height = h;
  const c = overlay.getContext("2d")!;
  c.clearRect(0, 0, w, h);
  const me = whoAmI(f);
  const m = Math.min(w, h), fs = Math.max(16, Math.round(m / 11)), maxW = w * 0.86;
  const res = `${w} × ${h}`;
  if (p === "bars") plate(c, [res, `${me.n} · ${me.label}`], w / 2, h * 0.27, fs, maxW);
  // Raster: Schild zwischen Mitte und oberem Rand, dort liegen keine Hilfslinien der Mitte
  else if (p === "grid") plate(c, [res, `${me.n} · ${me.label}`], w / 2, h / 2 - m * 0.225, fs, maxW);
  else if (p === "span") {
    // Rand dieses Ausgangs in Gelb: zeigt, wo die Übergänge liegen
    c.strokeStyle = "#ffcc00"; c.lineWidth = 4; c.strokeRect(2, 2, w - 4, h - 4);
    const t = `${me.n} · ${me.label} · ${me.at}`;
    const f2 = fitFont(c, t, Math.round(fs * 0.45), w - fs * 1.6, 700);
    const tw = c.measureText(t).width, pad = Math.round(f2 * 0.5);
    c.fillStyle = "#000"; c.fillRect(fs * 0.5, fs * 0.5, tw + pad * 2, f2 + pad * 2);
    c.fillStyle = "#fff"; c.textAlign = "left"; c.textBaseline = "middle";
    c.fillText(t, fs * 0.5 + pad, fs * 0.5 + pad + f2 / 2);
  } else if (p === "ident") {
    c.fillStyle = IDENT_COLORS[(me.n - 1) % IDENT_COLORS.length]!;
    c.globalAlpha = 0.35; c.fillRect(0, 0, w, h); c.globalAlpha = 1;
    c.fillStyle = "#fff"; c.textAlign = "center"; c.textBaseline = "middle";
    c.font = `800 ${Math.round(m * 0.5)}px system-ui, sans-serif`;
    c.fillText(String(me.n), w / 2, h * 0.42);
    fitFont(c, me.label, fs, maxW, 700);
    c.fillText(me.label, w / 2, h * 0.42 + m * 0.36);
    for (const [i, t] of [`${w} × ${h} Pixel`, me.at].entries()) {
      fitFont(c, t, Math.round(fs * 0.5), maxW, 500);
      c.fillText(t, w / 2, h * 0.42 + m * 0.36 + fs * (1.1 + i * 0.7));
    }
  }
}

let testKey = "";
function loop(): void {
  const now = Date.now();
  if (frame) {
    // Beschriftung nur neu zeichnen, wenn sich Testbild, Größe oder Anordnung ändern
    const mappingMode = frame.layout?.mode === "mapping" && frame.show.testPattern !== "ident";
    const key = frame.show.testCard && !mappingMode ? `${frame.show.testPattern}|${canvas.width}x${canvas.height}|${JSON.stringify(frame.layout ?? null)}|${frame.openOutputs?.join(",")}` : "";
    if (key !== testKey) { testKey = key; overlay.style.display = key ? "block" : "none"; if (key) drawOverlay(frame); }
    const lt = frame.layerClock ? layerTimesAt(frame.layerClock, now, frame.show.layers) : null;
    engine.render(frame.show, frameBeat(frame, now), now, frame.bpm, viewFor(frame.layout, frame.openOutputs ?? [], displayId), lt,
      warpFor(frame.layout, displayId), "", masksFor(frame.layout, displayId));
  } else {
    engine.gl.clearColor(0, 0, 0, 1); engine.gl.clear(engine.gl.COLOR_BUFFER_BIT);
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
