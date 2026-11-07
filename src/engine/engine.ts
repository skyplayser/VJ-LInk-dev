// WebGL2-Compositor: rendert die Ebenen einer Show in beliebig große Ausgänge.
import { bandsFrom, beatPulse, strobeGain, strobeGate } from "../core/audio";
import { LAYER_COUNT, type BlendMode, type ColorSource, type Rgb, type ShowState } from "../core/show";
import { FRAG, GEN_IDS, VERT } from "./shaders";

const COLOR_MODE: Record<ColorSource, number> = {
  original: 0, A: 1, B: 1, C: 1, D: 1, E: 1, gradient: 2, rainbow: 3,
};
const SLOT_INDEX: Record<string, number> = { A: 0, B: 1, C: 2, D: 3, E: 4 };

export interface FrameInfo { fps: number; frameMs: number }

export class Engine {
  readonly gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private layerTime = new Array<number>(LAYER_COUNT).fill(0);
  private lastSec = 0;
  info: FrameInfo = { fps: 0, frameMs: 0 };
  private fpsAcc = 0; private fpsFrames = 0;

  constructor(readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, powerPreference: "high-performance" });
    if (!gl) throw new Error("WebGL2 wird von dieser Grafikkarte nicht unterstützt.");
    this.gl = gl;
    this.prog = this.link(VERT, FRAG);
    for (const n of ["uRes", "uTime", "uBeat", "uPulse", "uOpacity", "uKey", "uGen", "uColorMode", "uColA", "uColB", "uBands", "uFx"])
      this.u[n] = gl.getUniformLocation(this.prog, n);
    this.vao = gl.createVertexArray()!;
  }

  private compile(type: number, src: string): WebGLShader {
    const gl = this.gl, sh = gl.createShader(type)!;
    gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error("Shader-Fehler: " + gl.getShaderInfoLog(sh));
    return sh;
  }
  private link(v: string, f: string): WebGLProgram {
    const gl = this.gl, p = gl.createProgram()!;
    gl.attachShader(p, this.compile(gl.VERTEX_SHADER, v));
    gl.attachShader(p, this.compile(gl.FRAGMENT_SHADER, f));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error("Link-Fehler: " + gl.getProgramInfoLog(p));
    return p;
  }

  /** Zeichenfläche auf Pixelgröße des Ausgangs setzen (z. B. 1152×192). */
  resize(width: number, height: number): void {
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
  }

  /**
   * Ein Bild rechnen. `nowMs` ist Epoch-Zeit, `beat` die Beat-Position der gemeinsamen Takt-Uhr:
   * alle Ausgänge bekommen dieselben Werte und zeigen deshalb dasselbe Bild.
   */
  render(show: ShowState, beat: number, nowMs: number, bpm = 120, layerOverride?: number): void {
    const t0 = performance.now();
    const gl = this.gl;
    const sec = nowMs / 1000;
    const dt = this.lastSec ? Math.min(0.1, sec - this.lastSec) : 0;
    this.lastSec = sec;

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    if (!show.blackout) {
      const masterGate = strobeGain(show.strobe, beat, sec, bpm);
      const master = show.master * masterGate;
      const bands = bandsFrom(show.audio, beat, sec);
      gl.useProgram(this.prog);
      gl.bindVertexArray(this.vao);
      gl.enable(gl.BLEND);
      gl.uniform2f(this.u.uRes!, this.canvas.width, this.canvas.height);
      gl.uniform1f(this.u.uBeat!, beat);
      gl.uniform1f(this.u.uPulse!, beatPulse(beat));
      gl.uniform1fv(this.u.uBands!, new Float32Array(bands));

      for (let i = 0; i < LAYER_COUNT; i++) {
        const l = show.layers[i]!;
        this.layerTime[i]! += dt * l.speed;
        if (layerOverride !== undefined && layerOverride !== i) continue;
        const gen = l.clip ? GEN_IDS.indexOf(l.clip as typeof GEN_IDS[number]) : -1;
        if (gen < 0) continue;
        const op = l.opacity * master * strobeGate(beat, l.strobe);
        if (op <= 0.001) continue;
        const [a, b] = this.colors(l.colorSource, show.slots);
        this.setBlend(l.blend);
        gl.uniform1f(this.u.uTime!, this.layerTime[i]!);
        gl.uniform1f(this.u.uOpacity!, op);
        gl.uniform1f(this.u.uKey!, i === 0 ? 0 : 1);
        gl.uniform1i(this.u.uGen!, gen);
        gl.uniform1i(this.u.uColorMode!, COLOR_MODE[l.colorSource]);
        gl.uniform3f(this.u.uColA!, a[0], a[1], a[2]);
        gl.uniform3f(this.u.uColB!, b[0], b[1], b[2]);
        gl.uniform3f(this.u.uFx!, l.fx[0] * show.fxMaster, l.fx[1] * show.fxMaster, l.fx[2] * show.fxMaster);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      gl.disable(gl.BLEND);
    }

    const ms = performance.now() - t0;
    this.fpsAcc += dt; this.fpsFrames++;
    if (this.fpsAcc >= 0.5) { this.info = { fps: this.fpsFrames / this.fpsAcc, frameMs: ms }; this.fpsAcc = 0; this.fpsFrames = 0; }
  }

  private colors(src: ColorSource, slots: Rgb[]): [Rgb, Rgb] {
    const idx = SLOT_INDEX[src];
    if (idx !== undefined) return [slots[idx]!, slots[idx]!];
    return [slots[0]!, slots[1]!];
  }

  /** Mischmodi mit vormultipliziertem Alpha. */
  private setBlend(m: BlendMode): void {
    const gl = this.gl;
    switch (m) {
      case "add": gl.blendFunc(gl.ONE, gl.ONE); break;
      case "screen": gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR); break;
      case "multiply": gl.blendFunc(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA); break;
      default: gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    }
  }
}
