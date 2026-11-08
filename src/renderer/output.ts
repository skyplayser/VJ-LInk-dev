// Ausgangsfenster: bekommt Bilder vom Hauptfenster und rechnet sie in der eigenen Auflösung.
import { Engine } from "../engine/engine";
import { frameBeat, type Frame } from "../core/frame";
import { bridge } from "./bridge";
import { decodeImage } from "./medialib";
import { VideoPool } from "./videopool";
import { viewFor } from "../core/layout";

/** Welcher Bildschirm bin ich? (für den Ausschnitt auf der Leinwand) */
const displayId = Number(new URLSearchParams(location.search).get("display") ?? "NaN");

const canvas = document.getElementById("out") as HTMLCanvasElement;
const engine = new Engine(canvas);
let frame: Frame | null = null;
// Videos kommen direkt aus der Bibliothek (vjmedia://), Ton gibt nur das Hauptfenster aus
const videos = new VideoPool(id => `vjmedia://video/${id}`, false);
const durations = new Map<string, number>();
engine.videoSource = (key, id, t, rate, o) => videos.get(key, id, t, rate, o);
engine.videoDuration = id => durations.get(id) ?? 0;
setInterval(() => videos.sweep(), 1000);
bridge?.onFrame(f => { frame = f; for (const [id, d] of Object.entries(f.videoDurations ?? {})) durations.set(id, d); });
bridge?.onMedia(async e => {
  if (e.type === "remove") { engine.removeMedia(e.id); return; }
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
  const at = f.layout?.mode === "canvas" && me ? `Leinwand: bei ${me.x}, ${me.y} · ${me.w} × ${me.h}` : "Gleiches Bild auf allen";
  return { n, label: me?.label ?? `Ausgang ${n}`, at };
}

function box(c: CanvasRenderingContext2D, text: string, x: number, y: number, fs: number, align: CanvasTextAlign = "center"): void {
  c.font = `700 ${fs}px system-ui, sans-serif`;
  const tw = c.measureText(text).width;
  const bx = align === "center" ? x - tw / 2 - fs * 0.5 : x - fs * 0.5;
  c.fillStyle = "rgba(0,0,0,.8)"; c.fillRect(bx, y - fs * 0.8, tw + fs, fs * 1.6);
  c.fillStyle = "#fff"; c.textAlign = align; c.textBaseline = "middle";
  c.fillText(text, x, y);
}

/** Beschriftung je nach Testbild; Vollflächen (Weiß, Farben, Graustufen) bleiben ohne. */
function drawOverlay(f: Frame): void {
  const w = canvas.width, h = canvas.height, p = f.show.testPattern ?? "bars";
  overlay.width = w; overlay.height = h;
  const c = overlay.getContext("2d")!;
  c.clearRect(0, 0, w, h);
  const me = whoAmI(f);
  const fs = Math.max(14, Math.round(Math.min(w, h) / 14));
  if (p === "bars" || p === "grid") box(c, `${w} × ${h}`, w / 2, p === "bars" ? h * 0.27 : h / 2 - fs * 2.2, fs);
  else if (p === "span") {
    // Rand dieses Ausgangs in Gelb: zeigt, wo die Übergänge liegen
    c.strokeStyle = "#ffcc00"; c.lineWidth = 4; c.strokeRect(2, 2, w - 4, h - 4);
    box(c, `${me.n} · ${me.label} · ${me.at}`, fs * 0.6, fs * 1.2, Math.round(fs * 0.45), "left");
  }
  else if (p === "ident") {
    c.fillStyle = IDENT_COLORS[(me.n - 1) % IDENT_COLORS.length]!;
    c.globalAlpha = 0.35; c.fillRect(0, 0, w, h); c.globalAlpha = 1;
    c.fillStyle = "#fff"; c.textAlign = "center"; c.textBaseline = "middle";
    c.font = `800 ${Math.round(Math.min(w, h) * 0.5)}px system-ui, sans-serif`;
    c.fillText(String(me.n), w / 2, h * 0.44);
    c.font = `700 ${fs}px system-ui, sans-serif`;
    c.fillText(me.label, w / 2, h * 0.76);
    c.font = `500 ${Math.round(fs * 0.55)}px system-ui, sans-serif`;
    c.fillText(`${w} × ${h} Pixel · ${me.at}`, w / 2, h * 0.76 + fs * 1.1);
  }
}

let testKey = "";
function loop(): void {
  const now = Date.now();
  if (frame) {
    // Beschriftung nur neu zeichnen, wenn sich Testbild, Größe oder Anordnung ändern
    const key = frame.show.testCard ? `${frame.show.testPattern}|${canvas.width}x${canvas.height}|${JSON.stringify(frame.layout ?? null)}|${frame.openOutputs?.join(",")}` : "";
    if (key !== testKey) { testKey = key; overlay.style.display = key ? "block" : "none"; if (key) drawOverlay(frame); }
    engine.render(frame.show, frameBeat(frame, now), now, frame.bpm, viewFor(frame.layout, frame.openOutputs ?? [], displayId));
  } else {
    engine.gl.clearColor(0, 0, 0, 1); engine.gl.clear(engine.gl.COLOR_BUFFER_BIT);
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
