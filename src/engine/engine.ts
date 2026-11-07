// WebGL2-Renderer.
// Ablauf pro Bild: jede Ebene → Generator in eine Textur → Effekt-Stapel (Ping-Pong)
// → mit Deckkraft und Mischmodus in die Komposition. Während einer Überblendung gibt es zwei
// Kompositionen (alt und neu), die der letzte Schritt mischt und mit Master und Strobe versieht.
import { bandsFrom, beatPulse, strobeGain, strobeGate } from "../core/audio";
import {
  MAX_LAYERS, isMediaClip, mediaIdOf, transitionProgress, type BlendMode, type ColorSource, type LayerState, type Rgb, type ShowState,
} from "../core/show";
import { mediaTransform } from "../core/media";
import { COMPOSITE_FRAG, FINAL_FRAG, FRAG, GEN_IDS, IMAGE_FRAG, POST_FRAG, POST_IDS, VERT } from "./shaders";

const COLOR_MODE: Record<ColorSource, number> = {
  original: 0, A: 1, B: 1, C: 1, D: 1, E: 1, gradient: 2, rainbow: 3,
};
const SLOT_INDEX: Record<string, number> = { A: 0, B: 1, C: 2, D: 3, E: 4 };

interface Target { tex: WebGLTexture; fb: WebGLFramebuffer; w: number; h: number }
interface Program { p: WebGLProgram; u: Map<string, WebGLUniformLocation | null> }

export interface FrameInfo { fps: number; frameMs: number }

/** Eine Zelle im Clip-Raster: Ebene `layer` mit Clip `clip`, in Pixeln mit Ursprung oben links. */
export interface ThumbCell { layer: number; col: number; clip: string; x: number; y: number; w: number; h: number }

export interface EngineOptions { transparent?: boolean }

export class Engine {
  readonly gl: WebGL2RenderingContext;
  private gen: Program;
  private post: Program;
  private comp: Program;
  private fin: Program;
  private img: Program;
  private media = new Map<string, { tex: WebGLTexture; w: number; h: number }>();
  private vao: WebGLVertexArrayObject;
  private work: [Target | null, Target | null] = [null, null];
  private compTo: Target | null = null;
  private compFrom: Target | null = null;
  /** Feedback braucht das letzte Bild: pro Ebene (bzw. Vorschauzelle) zwei Texturen im Wechsel. */
  private feedback = new Map<string, { t: [Target, Target]; cur: 0 | 1; used: number }>();
  private layerTime = new Array<number>(MAX_LAYERS).fill(0);
  private thumbTime = new Array<number>(MAX_LAYERS).fill(0);
  private lastSec = 0;
  private lastThumbSec = 0;
  private frameNo = 0;
  info: FrameInfo = { fps: 0, frameMs: 0 };
  private fpsAcc = 0; private fpsFrames = 0;

  constructor(readonly canvas: HTMLCanvasElement, opts: EngineOptions = {}) {
    const gl = canvas.getContext("webgl2", {
      antialias: false, alpha: !!opts.transparent, premultipliedAlpha: true, powerPreference: "high-performance",
    });
    if (!gl) throw new Error("WebGL2 wird von dieser Grafikkarte nicht unterstützt.");
    this.gl = gl;
    this.gen = this.program(FRAG);
    this.post = this.program(POST_FRAG);
    this.comp = this.program(COMPOSITE_FRAG);
    this.fin = this.program(FINAL_FRAG);
    this.img = this.program(IMAGE_FRAG);
    this.vao = gl.createVertexArray()!;
  }

  // ---- WebGL-Hilfen -------------------------------------------------------------------
  private compile(type: number, src: string): WebGLShader {
    const gl = this.gl, sh = gl.createShader(type)!;
    gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error("Shader-Fehler: " + gl.getShaderInfoLog(sh));
    return sh;
  }
  private program(frag: string): Program {
    const gl = this.gl, p = gl.createProgram()!;
    gl.attachShader(p, this.compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, this.compile(gl.FRAGMENT_SHADER, frag));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error("Link-Fehler: " + gl.getProgramInfoLog(p));
    return { p, u: new Map() };
  }
  private loc(pr: Program, name: string): WebGLUniformLocation | null {
    if (!pr.u.has(name)) pr.u.set(name, this.gl.getUniformLocation(pr.p, name));
    return pr.u.get(name)!;
  }
  private target(old: Target | null, w: number, h: number): Target {
    if (old && old.w === w && old.h === h) return old;
    const gl = this.gl;
    if (old) { gl.deleteTexture(old.tex); gl.deleteFramebuffer(old.fb); }
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    return { tex, fb, w, h };
  }
  private bindTarget(t: Target | null, x = 0, y = 0, w = t?.w ?? this.canvas.width, h = t?.h ?? this.canvas.height): void {
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, t ? t.fb : null);
    this.gl.viewport(x, y, w, h);
  }
  private draw(): void { this.gl.drawArrays(this.gl.TRIANGLES, 0, 3); }
  private bindTex(unit: number, t: Target): void {
    const gl = this.gl; gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t.tex);
  }

  /** Zeichenfläche auf Pixelgröße des Ausgangs setzen (z. B. 1152×192). */
  resize(width: number, height: number): void {
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
  }

  // ---- Grafiken ----------------------------------------------------------------------
  /** Bild als Textur hinterlegen (vormultipliziertes Alpha, damit transparente Logos sauber sind). */
  setMedia(id: string, source: TexImageSource, w: number, h: number): void {
    const gl = this.gl;
    const old = this.media.get(id);
    const tex = old?.tex ?? gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.media.set(id, { tex, w, h });
  }
  removeMedia(id: string): void {
    const m = this.media.get(id);
    if (m) { this.gl.deleteTexture(m.tex); this.media.delete(id); }
  }
  hasMedia(id: string): boolean { return this.media.has(id); }

  // ---- Eine Ebene rendern -------------------------------------------------------------
  /**
   * Generator plus Effekt-Stapel in einer Textur der Größe w×h. Gibt die Textur mit dem Ergebnis zurück
   * oder null, wenn die Ebene nichts zeigt.
   */
  private renderLayer(l: LayerState, fbKey: string, time: number, w: number, h: number,
    show: ShowState, beat: number, pulse: number, bands: Float32Array, key: boolean): Target | null {
    const media = isMediaClip(l.clip) ? this.media.get(mediaIdOf(l.clip)) : undefined;
    const gen = l.clip && !media ? GEN_IDS.indexOf(l.clip as typeof GEN_IDS[number]) : -1;
    if (gen < 0 && !media) return null;
    const gl = this.gl;
    this.work[0] = this.target(this.work[0], w, h);
    this.work[1] = this.target(this.work[1], w, h);
    gl.disable(gl.BLEND);
    const [ca, cb] = colors(l.colorSource, show.slots);

    if (media) {
      // 1a) Grafik mit Animation
      const im = this.img;
      const tf = mediaTransform(l.media, beat, time);
      gl.useProgram(im.p);
      gl.uniform1i(this.loc(im, "uImg"), 0);
      gl.uniform2f(this.loc(im, "uRes"), w, h);
      gl.uniform1f(this.loc(im, "uImgAspect"), media.w / Math.max(1, media.h));
      gl.uniform2f(this.loc(im, "uPos"), tf.x, tf.y);
      gl.uniform1f(this.loc(im, "uScale"), tf.scale);
      gl.uniform1f(this.loc(im, "uRot"), tf.rotation);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, media.tex);
      this.bindTarget(this.work[0]);
      this.draw();
      return this.applyEffects(l, fbKey, time, w, h, show, pulse, ca, cb);
    }

    // 1) Generator
    const g = this.gen;
    gl.useProgram(g.p);
    gl.uniform2f(this.loc(g, "uRes"), w, h);
    gl.uniform1f(this.loc(g, "uTime"), time);
    gl.uniform1f(this.loc(g, "uBeat"), beat);
    gl.uniform1f(this.loc(g, "uPulse"), pulse);
    gl.uniform1f(this.loc(g, "uKey"), key ? 1 : 0);
    gl.uniform1i(this.loc(g, "uGen"), gen);
    gl.uniform1i(this.loc(g, "uColorMode"), COLOR_MODE[l.colorSource]);
    gl.uniform3f(this.loc(g, "uColA"), ca[0], ca[1], ca[2]);
    gl.uniform3f(this.loc(g, "uColB"), cb[0], cb[1], cb[2]);
    gl.uniform1fv(this.loc(g, "uBands"), bands);
    this.bindTarget(this.work[0]);
    this.draw();
    return this.applyEffects(l, fbKey, time, w, h, show, pulse, ca, cb);
  }

  /** 2) Effekt-Stapel auf work[0] anwenden, Ergebnis zurückgeben. */
  private applyEffects(l: LayerState, fbKey: string, time: number, w: number, h: number,
    show: ShowState, pulse: number, ca: Rgb, cb: Rgb): Target {
    const gl = this.gl;
    let src: Target = this.work[0]!;
    const p = this.post;
    gl.useProgram(p.p);
    gl.uniform2f(this.loc(p, "uRes"), w, h);
    gl.uniform1f(this.loc(p, "uTime"), time);
    gl.uniform1f(this.loc(p, "uPulse"), pulse);
    gl.uniform1i(this.loc(p, "uTex"), 0);
    gl.uniform1i(this.loc(p, "uPrev"), 1);
    gl.uniform3f(this.loc(p, "uColA"), ca[0], ca[1], ca[2]);
    gl.uniform3f(this.loc(p, "uColB"), cb[0], cb[1], cb[2]);
    gl.uniform1i(this.loc(p, "uColorMode"), COLOR_MODE[l.colorSource]);
    for (const slot of l.effects) {
      const amount = slot.amount * show.fxMaster;
      const eff = POST_IDS.indexOf(slot.id as typeof POST_IDS[number]);
      if (!slot.on || amount < 0.005 || eff < 0) continue;
      let dst: Target;
      if (slot.id === "feedback") {
        const fb = this.feedbackPair(fbKey, w, h);
        this.bindTex(1, fb.t[fb.cur]);
        fb.cur = fb.cur === 0 ? 1 : 0;
        dst = fb.t[fb.cur];
      } else {
        dst = src === this.work[0] ? this.work[1]! : this.work[0]!;
      }
      this.bindTex(0, src);
      gl.uniform1f(this.loc(p, "uAmount"), amount);
      gl.uniform1i(this.loc(p, "uEffect"), eff);
      this.bindTarget(dst);
      this.draw();
      src = dst;
    }
    return src;
  }

  private feedbackPair(key: string, w: number, h: number): { t: [Target, Target]; cur: 0 | 1; used: number } {
    let fb = this.feedback.get(key);
    if (!fb || fb.t[0].w !== w || fb.t[0].h !== h) {
      fb = { t: [this.target(fb?.t[0] ?? null, w, h), this.target(fb?.t[1] ?? null, w, h)], cur: 0, used: 0 };
      this.feedback.set(key, fb);
    }
    fb.used = this.frameNo;
    return fb;
  }

  /** Alle Ebenen in `out` legen. */
  private composite(layers: readonly LayerState[], out: Target, prefix: string, show: ShowState,
    beat: number, pulse: number, bands: Float32Array): void {
    const gl = this.gl;
    this.bindTarget(out);
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    for (let i = 0; i < layers.length && i < MAX_LAYERS; i++) {
      const l = layers[i]!;
      const op = l.opacity * strobeGate(beat, l.strobe);
      if (op <= 0.001 || !l.clip) continue;
      const img = this.renderLayer(l, `${prefix}${i}`, this.layerTime[i]!, out.w, out.h, show, beat, pulse, bands, i > 0);
      if (!img) continue;
      gl.useProgram(this.comp.p);
      gl.uniform1i(this.loc(this.comp, "uTex"), 0);
      gl.uniform1f(this.loc(this.comp, "uOpacity"), op);
      this.bindTex(0, img);
      this.bindTarget(out);
      gl.enable(gl.BLEND);
      setBlend(gl, i === 0 ? "normal" : l.blend);
      this.draw();
      gl.disable(gl.BLEND);
    }
  }

  // ---- Hauptbild ----------------------------------------------------------------------
  /**
   * Ein Bild rechnen. `nowMs` ist Epoch-Zeit, `beat` die Beat-Position der gemeinsamen Takt-Uhr:
   * alle Ausgänge bekommen dieselben Werte und zeigen deshalb dasselbe Bild.
   */
  render(show: ShowState, beat: number, nowMs: number, bpm = 120): void {
    const t0 = performance.now();
    const gl = this.gl;
    const sec = nowMs / 1000;
    const dt = this.lastSec ? Math.min(0.1, Math.max(0, sec - this.lastSec)) : 0;
    this.lastSec = sec;
    this.frameNo++;
    for (let i = 0; i < MAX_LAYERS; i++) this.layerTime[i]! += dt * (show.layers[i]?.speed ?? 1);
    gl.bindVertexArray(this.vao);

    const w = this.canvas.width, h = this.canvas.height;
    if (show.blackout) {
      this.bindTarget(null); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    } else {
      const pulse = beatPulse(beat);
      const bands = new Float32Array(bandsFrom(show.audio, beat, sec));
      const mix = transitionProgress(show.transition, beat, nowMs);
      this.compTo = this.target(this.compTo, w, h);
      this.composite(show.layers, this.compTo, "to", show, beat, pulse, bands);
      let from = this.compTo;
      if (show.transition && mix < 1) {
        this.compFrom = this.target(this.compFrom, w, h);
        this.composite(show.transition.from, this.compFrom, "from", show, beat, pulse, bands);
        from = this.compFrom;
      }
      gl.useProgram(this.fin.p);
      gl.uniform1i(this.loc(this.fin, "uFrom"), 0);
      gl.uniform1i(this.loc(this.fin, "uTo"), 1);
      gl.uniform1f(this.loc(this.fin, "uMix"), mix);
      gl.uniform1i(this.loc(this.fin, "uDip"), show.transition?.style === "black" ? 1 : 0);
      gl.uniform1f(this.loc(this.fin, "uGain"), show.master * strobeGain(show.strobe, beat, sec, bpm));
      this.bindTex(0, from); this.bindTex(1, this.compTo);
      this.bindTarget(null, 0, 0, w, h);
      this.draw();
    }
    this.dropStaleFeedback();

    const ms = performance.now() - t0;
    this.fpsAcc += dt; this.fpsFrames++;
    if (this.fpsAcc >= 0.5) { this.info = { fps: this.fpsFrames / this.fpsAcc, frameMs: ms }; this.fpsAcc = 0; this.fpsFrames = 0; }
  }

  // ---- Live-Vorschau im Clip-Raster ---------------------------------------------------
  /** Jede Zelle zeigt ihren Clip mit Farbe und Effekt-Stapel ihrer Ebene, ohne Master und Strobe. */
  renderThumbs(show: ShowState, beat: number, nowMs: number, cells: readonly ThumbCell[]): void {
    const gl = this.gl;
    const sec = nowMs / 1000;
    const dt = this.lastThumbSec ? Math.min(0.1, Math.max(0, sec - this.lastThumbSec)) : 0;
    this.lastThumbSec = sec;
    this.frameNo++;
    for (let i = 0; i < MAX_LAYERS; i++) this.thumbTime[i]! += dt * (show.layers[i]?.speed ?? 1);
    gl.bindVertexArray(this.vao);
    this.bindTarget(null);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    const pulse = beatPulse(beat);
    const bands = new Float32Array(bandsFrom(show.audio, beat, sec));
    const H = this.canvas.height;
    for (const c of cells) {
      const base = show.layers[c.layer];
      if (!base || c.w < 4 || c.h < 4) continue;
      const l: LayerState = { ...base, clip: c.clip, opacity: 1 };
      const img = this.renderLayer(l, `t${c.layer}.${c.col}`, this.thumbTime[c.layer]!, c.w, c.h, show, beat, pulse, bands, false);
      if (!img) continue;
      gl.useProgram(this.comp.p);
      gl.uniform1i(this.loc(this.comp, "uTex"), 0);
      gl.uniform1f(this.loc(this.comp, "uOpacity"), 1);
      this.bindTex(0, img);
      this.bindTarget(null, c.x, H - c.y - c.h, c.w, c.h);
      this.draw();
    }
    this.dropStaleFeedback();
  }

  /** Feedback-Texturen löschen, die einige Bilder lang nicht gebraucht wurden. */
  private dropStaleFeedback(): void {
    if (this.frameNo % 120 !== 0) return;
    for (const [k, fb] of this.feedback) {
      if (this.frameNo - fb.used > 120) {
        for (const t of fb.t) { this.gl.deleteTexture(t.tex); this.gl.deleteFramebuffer(t.fb); }
        this.feedback.delete(k);
      }
    }
  }
}

function colors(src: ColorSource, slots: Rgb[]): [Rgb, Rgb] {
  const idx = SLOT_INDEX[src];
  if (idx !== undefined) return [slots[idx]!, slots[idx]!];
  return [slots[0]!, slots[1]!];
}

/** Mischmodi mit vormultipliziertem Alpha. */
function setBlend(gl: WebGL2RenderingContext, m: BlendMode): void {
  switch (m) {
    case "add": gl.blendFunc(gl.ONE, gl.ONE); break;
    case "screen": gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR); break;
    case "multiply": gl.blendFunc(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA); break;
    default: gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }
}
