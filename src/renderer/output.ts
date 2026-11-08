// Ausgangsfenster: bekommt Bilder vom Hauptfenster und rechnet sie in der eigenen Auflösung.
import { Engine } from "../engine/engine";
import { frameBeat, type Frame } from "../core/frame";
import { bridge } from "./bridge";
import { decodeImage } from "./medialib";
import { VideoPool } from "./videopool";

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

const test = document.createElement("canvas");
const tctx = test.getContext("2d")!;
/** Über dem Testbild der Engine: die genaue Auflösung dieses Ausgangs. */
function drawTestPattern(): void {
  const w = canvas.width, h = canvas.height;
  test.width = w; test.height = h;
  tctx.clearRect(0, 0, w, h);
  const fs = Math.max(14, Math.round(h / 14));
  tctx.font = `700 ${fs}px system-ui, sans-serif`;
  const label = `${w} × ${h}`;
  const tw = tctx.measureText(label).width;
  const bx = w / 2 - tw / 2 - fs * 0.5, by = h * 0.27 - fs * 0.8;
  tctx.fillStyle = "rgba(0,0,0,.8)"; tctx.fillRect(bx, by, tw + fs, fs * 1.6);
  tctx.fillStyle = "#fff"; tctx.textAlign = "center"; tctx.textBaseline = "middle";
  tctx.fillText(label, w / 2, h * 0.27);
}

// Testbild: eigener 2D-Canvas darüber, damit die WebGL-Fläche unberührt bleibt.
const overlay = document.createElement("canvas");
overlay.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;display:none";
document.body.appendChild(overlay);
function showTest(on: boolean): void {
  overlay.style.display = on ? "block" : "none";
  if (!on) return;
  drawTestPattern();
  overlay.width = test.width; overlay.height = test.height;
  overlay.getContext("2d")!.drawImage(test, 0, 0);
}

let wasTest = false;
function loop(): void {
  const now = Date.now();
  if (frame) {
    if (frame.testPattern !== wasTest) { wasTest = frame.testPattern; showTest(wasTest); }
    engine.render(frame.show, frameBeat(frame, now), now, frame.bpm);
  } else {
    engine.gl.clearColor(0, 0, 0, 1); engine.gl.clear(engine.gl.COLOR_BUFFER_BIT);
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
