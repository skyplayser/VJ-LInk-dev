// Ausgangsfenster: bekommt Bilder vom Hauptfenster und rechnet sie in der eigenen Auflösung.
import { Engine } from "../engine/engine";
import { frameBeat, type Frame } from "../core/frame";
import { bridge } from "./bridge";

const canvas = document.getElementById("out") as HTMLCanvasElement;
const engine = new Engine(canvas);
let frame: Frame | null = null;
bridge?.onFrame(f => { frame = f; });

function fit(): void {
  const dpr = window.devicePixelRatio || 1;
  engine.resize(Math.round(window.innerWidth * dpr), Math.round(window.innerHeight * dpr));
}
window.addEventListener("resize", fit);
fit();

const test = document.createElement("canvas");
const tctx = test.getContext("2d")!;
function drawTestPattern(): void {
  const w = canvas.width, h = canvas.height;
  test.width = w; test.height = h;
  tctx.fillStyle = "#101010"; tctx.fillRect(0, 0, w, h);
  tctx.strokeStyle = "#555"; tctx.lineWidth = 1;
  const step = Math.max(32, Math.round(h / 12));
  for (let x = 0; x <= w; x += step) { tctx.beginPath(); tctx.moveTo(x + .5, 0); tctx.lineTo(x + .5, h); tctx.stroke(); }
  for (let y = 0; y <= h; y += step) { tctx.beginPath(); tctx.moveTo(0, y + .5); tctx.lineTo(w, y + .5); tctx.stroke(); }
  tctx.strokeStyle = "#fff"; tctx.lineWidth = 4; tctx.strokeRect(2, 2, w - 4, h - 4);
  tctx.fillStyle = "#fff"; tctx.textAlign = "center"; tctx.textBaseline = "middle";
  tctx.font = `700 ${Math.round(h / 8)}px system-ui, sans-serif`;
  tctx.fillText(`${w} × ${h}`, w / 2, h / 2);
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
    if (!wasTest) engine.render(frame.show, frameBeat(frame, now), now);
  } else {
    engine.gl.clearColor(0, 0, 0, 1); engine.gl.clear(engine.gl.COLOR_BUFFER_BIT);
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
