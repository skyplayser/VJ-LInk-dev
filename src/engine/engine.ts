// WebGL2-Renderer.
// Ablauf pro Bild: jede Ebene → Generator in eine Textur → Effekt-Stapel (Ping-Pong)
// → mit Deckkraft und Mischmodus in die Komposition. Während einer Überblendung gibt es zwei
// Kompositionen (alt und neu), die der letzte Schritt mischt und mit Master und Strobe versieht.
import { WAVE_POINTS, bandsFrom, beatPulse, layerDrive, strobeGain, strobeGate, strobeWhite } from "../core/audio";
import { TEST_IDS, defaultLaser, layerPalette, mainLayers,
  MAX_LAYERS, isMediaClip, mediaIdOf, transitionProgress, type BlendMode, type ColorSource, type LayerState, type Rgb, type ShowState,
} from "../core/show";
import { mediaTransform } from "../core/media";
import type { View, Warp } from "../core/layout";
import { clipVideoTime, isVideoClip, loopRange, videoIdOf, type CueRender, type Fit } from "../core/video";
import { COMPOSITE_FRAG, FINAL_FRAG, FRAG, GEN_IDS, IMAGE_FRAG, POST_FRAG, POST_IDS, VERT, WARP_FRAG } from "./shaders";

const COLOR_MODE: Record<ColorSource, number> = {
  original: 0, A: 1, B: 1, C: 1, D: 1, E: 1, gradient: 2, rainbow: 3, multi: 4,
};
const SLOT_INDEX: Record<string, number> = { A: 0, B: 1, C: 2, D: 3, E: 4 };

interface Target { tex: WebGLTexture; fb: WebGLFramebuffer; w: number; h: number }
interface Program { p: WebGLProgram; u: Map<string, WebGLUniformLocation | null> }

export interface FrameInfo { fps: number; frameMs: number }

/** Eine Zelle im Clip-Raster: Ebene `layer` mit Clip `clip`, in Pixeln mit Ursprung oben links. */
export interface ThumbCell { layer: number; col: number; clip: string; x: number; y: number; w: number; h: number }

export interface EngineOptions { transparent?: boolean }

/** Liefert das aktuelle Videobild für einen Abspieler (Schlüssel) an Stelle t mit Geschwindigkeit rate. */
export type VideoProvider = (key: string, id: string, t: number, rate: number, opts: { sound: boolean; volume: number; loop?: [number, number] }) => { el: TexImageSource; w: number; h: number } | null;

/** Größe der Bildfläche (in Bildhöhen) für füllen, einpassen oder Originalgröße. */
export function fitScale(fit: Fit, canvasAspect: number, mediaAspect: number, mediaH: number, canvasH: number): number {
  if (fit === "original") return canvasH > 0 ? mediaH / canvasH : 1;
  const r = canvasAspect / Math.max(1e-3, mediaAspect);
  return fit === "fill" ? Math.max(1, r) : Math.min(1, r);
}

export class Engine {
  readonly gl: WebGL2RenderingContext;
  private gen: Program;
  private post: Program;
  private comp: Program;
  private fin: Program;
  private img: Program;
  private warp: Program;
  private media = new Map<string, { tex: WebGLTexture; w: number; h: number }>();
  private videoTex = new Map<string, WebGLTexture>();
  private black: WebGLTexture | null = null;
  private nowMs = 0;
  private bpm = 120;
  /** Videobilder kommen aus dem Fenster (siehe VideoPool). */
  videoSource: VideoProvider | null = null;
  /** Länge eines Videos in Sekunden (aus der Bibliothek). */
  videoDuration: (id: string) => number = () => 0;
  private vao: WebGLVertexArrayObject;
  private work: [Target | null, Target | null] = [null, null];
  private canvasT: Target | null = null;
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
    this.warp = this.program(WARP_FRAG);
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
    // Video-Clip: aktuelles Bild des Abspielers als Textur
    let media = isMediaClip(l.clip) ? this.media.get(mediaIdOf(l.clip)) : undefined;
    let isVideo = false;
    if (isVideoClip(l.clip)) {
      const id = videoIdOf(l.clip);
      const dur = this.videoDuration(id);
      const vt = clipVideoTime(l.video, l.videoStart, dur, beat, this.nowMs, this.bpm);
      const src = this.videoSource?.(fbKey, id, vt.t, vt.rate, { sound: l.video.sound, volume: 1, ...(dur > 0 ? { loop: loopRange(l.video, dur) } : {}) }) ?? null;
      if (!src) return null;
      media = this.uploadVideo(fbKey, src);
      isVideo = true;
    }
    const gen = l.clip && !media ? GEN_IDS.indexOf(l.clip as typeof GEN_IDS[number]) : -1;
    if (gen < 0 && !media) return null;
    const gl = this.gl;
    // Antrieb der Ebene: Takt, Audio oder ruhig (ersetzt Beat, Puls und Bänder für diese Ebene)
    const drv = layerDrive(l.drive, show.audio, l.clip, beat, this.nowMs / 1000, time);
    void pulse; void bands;
    const pal = layerPalette(l, show.slots);
    this.work[0] = this.target(this.work[0], w, h);
    this.work[1] = this.target(this.work[1], w, h);
    gl.disable(gl.BLEND);
    const [ca, cb] = colors(l.colorSource, show.slots, l);

    if (media) {
      // 1a) Grafik mit Animation
      const im = this.img;
      const tf = isVideo
        ? { x: 0, y: 0, rotation: 0, scale: fitScale(l.video.fit, w / h, media.w / Math.max(1, media.h), media.h, h) }
        : mediaTransform(l.media, drv.beat, time);
      gl.useProgram(im.p);
      gl.uniform1f(this.loc(im, "uOpacity"), 1);
      gl.uniform1i(this.loc(im, "uImg"), 0);
      gl.uniform2f(this.loc(im, "uRes"), w, h);
      gl.uniform1f(this.loc(im, "uImgAspect"), media.w / Math.max(1, media.h));
      // x in Bildhöhen → auf die Breite beziehen: ±1 (Regler ±100) = Bildrand
      gl.uniform2f(this.loc(im, "uPos"), tf.x * (w / h), tf.y);
      gl.uniform1f(this.loc(im, "uScale"), tf.scale);
      gl.uniform1f(this.loc(im, "uRot"), tf.rotation);
      gl.uniform1i(this.loc(im, "uKeyMode"), isVideo ? 0 : l.media.keyMode === "white" ? 1 : l.media.keyMode === "black" ? 2 : 0);
      gl.uniform1f(this.loc(im, "uKeyTol"), l.media.keyTol ?? 0.25);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, media.tex);
      this.bindTarget(this.work[0]);
      this.draw();
      return this.applyEffects(l, fbKey, time, w, h, show, drv.pulse, ca, cb);
    }

    // 1) Generator
    const g = this.gen;
    gl.useProgram(g.p);
    gl.uniform2f(this.loc(g, "uRes"), w, h);
    gl.uniform1f(this.loc(g, "uTime"), time);
    gl.uniform1f(this.loc(g, "uBeat"), drv.beat);
    gl.uniform1f(this.loc(g, "uPulse"), drv.pulse);
    gl.uniform1f(this.loc(g, "uKey"), key ? 1 : 0);
    gl.uniform1i(this.loc(g, "uGen"), gen);
    gl.uniform1i(this.loc(g, "uColorMode"), COLOR_MODE[l.colorSource]);
    gl.uniform3f(this.loc(g, "uColA"), ca[0], ca[1], ca[2]);
    gl.uniform3f(this.loc(g, "uColB"), cb[0], cb[1], cb[2]);
    // Mehrere Slots: Palette (bis 5 Farben)
    const palData = new Float32Array(15);
    pal.slice(0, 5).forEach((c, i) => palData.set(c, i * 3));
    gl.uniform3fv(this.loc(g, "uPal"), palData);
    gl.uniform1i(this.loc(g, "uPalN"), Math.min(5, pal.length));
    const lz = l.laser ?? defaultLaser();
    gl.uniform4f(this.loc(g, "uLz"), lz.x, lz.y, lz.size, lz.thick);
    gl.uniform1f(this.loc(g, "uLzOv"), lz.override ? 1 : 0);
    gl.uniform1f(this.loc(g, "uLzRot"), ((lz.rot ?? 0) * Math.PI) / 180);
    // Bänder und Wellenform aus dem Antrieb der Ebene
    gl.uniform1fv(this.loc(g, "uBands"), new Float32Array(drv.bands));
    gl.uniform1fv(this.loc(g, "uRings"), new Float32Array(drv.rings));
    const wave = drv.wave && drv.wave.length === WAVE_POINTS ? drv.wave : null;
    gl.uniform1i(this.loc(g, "uHasWave"), wave ? 1 : 0);
    if (wave) gl.uniform1fv(this.loc(g, "uWave"), new Float32Array(wave));
    this.bindTarget(this.work[0]);
    this.draw();
    return this.applyEffects(l, fbKey, time, w, h, show, drv.pulse, ca, cb);
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
    // Farbüberlagerung kennt keine Palette: „mehrere Slots“ wirkt dort als Verlauf der ersten zwei
    gl.uniform1i(this.loc(p, "uColorMode"), l.colorSource === "multi" ? 2 : COLOR_MODE[l.colorSource]);
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
      gl.uniform4f(this.loc(this.comp, "uRegion"), 0, 0, 1, 1);
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
  /**
   * `view`: Dieses Fenster zeigt nur einen Ausschnitt einer größeren Leinwand (Bildschirme nebeneinander).
   * Dann wird die ganze Leinwand gerechnet und der eigene Teil ausgegeben, damit alles nahtlos passt.
   */
  render(show: ShowState, beat: number, nowMs: number, bpm = 120, view: View | null = null, layerTimes: readonly number[] | null = null, warps: readonly Warp[] | null = null): void {
    const t0 = performance.now();
    const gl = this.gl;
    const sec = nowMs / 1000;
    const dt = this.lastSec ? Math.min(0.1, Math.max(0, sec - this.lastSec)) : 0;
    this.lastSec = sec;
    this.frameNo++;
    // Gemeinsame Ebenen-Zeit (alle Fenster gleich), sonst selbst zählen
    for (let i = 0; i < MAX_LAYERS; i++) this.layerTime[i] = layerTimes ? (layerTimes[i] ?? 0) : this.layerTime[i]! + dt * (show.layers[i]?.speed ?? 1);
    gl.bindVertexArray(this.vao);

    this.nowMs = nowMs; this.bpm = bpm;
    const outW = this.canvas.width, outH = this.canvas.height;
    // Leinwand: in Leinwand-Pixeln rechnen (Obergrenze ca. 8K × 4K), sonst direkt in Fenstergröße
    const k = view ? Math.min(1, 8192 / Math.max(view.cw, view.ch), Math.sqrt(33e6 / (view.cw * view.ch))) : 1;
    const w = view ? Math.max(1, Math.round(view.cw * k)) : outW, h = view ? Math.max(1, Math.round(view.ch * k)) : outH;
    // Projektionsmapping: erst das ganze Bild in Ausgangsgröße, dann jede Leinwand verzerrt daraus zeichnen
    const mapping = !view && !!warps;
    const dest = view || mapping ? (this.canvasT = this.target(this.canvasT, w, h)) : null;
    // Hauptbild (bei Leinwänden mit eigenen Ebenen rechnet jede ihren Stapel unten selbst)
    this.composeStack(show, mainLayers(show), show.transition?.from ?? null, "", dest, w, h, beat, sec, bpm, nowMs);
    if (!show.blackout && show.cues.length) this.drawCues(show.cues, nowMs, w, h, dest);
    // „Raster über alle“: auf der ganzen Leinwand rechnen, jeder Ausgang zeigt seinen Teil wie bei den Visuals
    const spanTest = show.testCard && show.testPattern === "span" && !!dest;
    if (spanTest) this.drawTestCard(show, beat, nowMs, w, h, dest);
    if (dest && view) {
      // Eigenen Ausschnitt der Leinwand ausgeben (GL-Ursprung unten links)
      gl.useProgram(this.comp.p);
      gl.uniform1i(this.loc(this.comp, "uTex"), 0);
      gl.uniform1f(this.loc(this.comp, "uOpacity"), 1);
      gl.uniform4f(this.loc(this.comp, "uRegion"), view.x / view.cw, 1 - (view.y + view.h) / view.ch, view.w / view.cw, view.h / view.ch);
      this.bindTex(0, dest);
      this.bindTarget(null, 0, 0, outW, outH);
      gl.disable(gl.BLEND);
      this.draw();
    }
    if (dest && mapping) {
      // Testbild mit auf die Leinwände legen (zum Ausrichten an Objekten)
      if (show.testCard && !spanTest) this.drawTestCard(show, beat, nowMs, w, h, dest);
      // Leinwände mit eigenen Ebenen: jede rechnet ihren Stapel in ein eigenes Bild
      const srcOf = new Map<string, Target>();
      for (const wp of warps!) {
        const own = wp.stack ? show.stacks?.[wp.stack] : undefined;
        if (!wp.stack || !own) continue;
        const st = this.target(this.surfT.get(wp.stack) ?? null, w, h);
        this.surfT.set(wp.stack, st);
        this.composeStack(show, own, show.transition?.fromStacks?.[wp.stack] ?? null, `S${wp.stack}:`, st, w, h, beat, sec, bpm, nowMs);
        if (show.testCard && !spanTest) this.drawTestCard(show, beat, nowMs, w, h, st);
        srcOf.set(wp.stack, st);
      }
      this.bindTarget(null, 0, 0, outW, outH);
      gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(this.warp.p);
      gl.uniform1i(this.loc(this.warp, "uTex"), 0);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      for (const wp of warps!) {
        const own = wp.stack ? srcOf.get(wp.stack) : undefined;
        this.bindTex(0, own ?? dest);
        this.bindTarget(null, 0, 0, outW, outH);
        gl.uniformMatrix3fv(this.loc(this.warp, "uHinv"), false, wp.hinv);
        if (own) gl.uniform4f(this.loc(this.warp, "uSrc"), 0, 0, 1, 1);
        else gl.uniform4f(this.loc(this.warp, "uSrc"), wp.src[0], wp.src[1], wp.src[2], wp.src[3]);
        this.draw();
      }
      gl.disable(gl.BLEND);
    }
    if (show.testCard && !spanTest && !mapping) this.drawTestCard(show, beat, nowMs, outW, outH, null);
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
      gl.uniform4f(this.loc(this.comp, "uRegion"), 0, 0, 1, 1);
      this.bindTex(0, img);
      this.bindTarget(null, c.x, H - c.y - c.h, c.w, c.h);
      this.draw();
    }
    this.dropStaleFeedback();
  }

  // ---- Videos und SHOW-Ablauf ---------------------------------------------------------
  private uploadVideo(key: string, src: { el: TexImageSource; w: number; h: number }): { tex: WebGLTexture; w: number; h: number } {
    const gl = this.gl;
    let tex = this.videoTex.get(key);
    if (!tex) {
      tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.videoTex.set(key, tex);
    }
    gl.bindTexture(gl.TEXTURE_2D, tex);
    try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, src.el); } catch { /* Bild gerade nicht lesbar */ }
    return { tex, w: src.w, h: src.h };
  }

  private blackTex(): WebGLTexture {
    if (this.black) return this.black;
    const gl = this.gl, tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    this.black = tex;
    return tex;
  }

  /** Eine Fläche (Bild, Video, Schwarz) über das fertige Bild legen. */
  private drawFlat(tex: WebGLTexture, mw: number, mh: number, fit: Fit, opacity: number, w: number, h: number, dest: Target | null = null): void {
    const gl = this.gl, im = this.img;
    gl.useProgram(im.p);
    gl.uniform1i(this.loc(im, "uImg"), 0);
    gl.uniform2f(this.loc(im, "uRes"), w, h);
    gl.uniform1f(this.loc(im, "uImgAspect"), mw / Math.max(1, mh));
    gl.uniform2f(this.loc(im, "uPos"), 0, 0);
    gl.uniform1f(this.loc(im, "uScale"), fitScale(fit, w / h, mw / Math.max(1, mh), mh, h));
    gl.uniform1f(this.loc(im, "uRot"), 0);
    gl.uniform1i(this.loc(im, "uKeyMode"), 0);
    gl.uniform1f(this.loc(im, "uOpacity"), opacity);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
    this.bindTarget(dest, 0, 0, w, h);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    this.draw();
    gl.disable(gl.BLEND);
  }

  /** Testbild als oberste Fläche (in voller Auflösung des Fensters). */
  private stackT = new Map<string, { to: Target | null; from: Target | null }>();
  private surfT = new Map<string, Target>();

  /** Einen Ebenen-Stapel mischen (mit Überblendung, Master, Strobe) und nach `dest` (null = Bildschirm) zeichnen. */
  private composeStack(show: ShowState, layers: readonly LayerState[], fromLayers: readonly LayerState[] | null, key: string,
    dest: Target | null, w: number, h: number, beat: number, sec: number, bpm: number, nowMs: number): void {
    const gl = this.gl;
    if (show.blackout) { this.bindTarget(dest, 0, 0, w, h); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); return; }
    const pulse = beatPulse(beat);
    const bands = new Float32Array(bandsFrom(show.audio, beat, sec));
    const mix = transitionProgress(show.transition, beat, nowMs);
    let t = this.stackT.get(key);
    if (!t) { t = { to: null, from: null }; this.stackT.set(key, t); }
    t.to = this.target(t.to, w, h);
    this.composite(layers, t.to, `${key}to`, show, beat, pulse, bands);
    let from: Target = t.to;
    if (show.transition && mix < 1 && fromLayers) {
      t.from = this.target(t.from, w, h);
      this.composite(fromLayers, t.from, `${key}from`, show, beat, pulse, bands);
      from = t.from;
    }
    gl.useProgram(this.fin.p);
    gl.uniform1i(this.loc(this.fin, "uFrom"), 0);
    gl.uniform1i(this.loc(this.fin, "uTo"), 1);
    gl.uniform1f(this.loc(this.fin, "uMix"), mix);
    gl.uniform1i(this.loc(this.fin, "uDip"), show.transition?.style === "black" ? 1 : 0);
    gl.uniform1f(this.loc(this.fin, "uGain"), show.master * strobeGain(show.strobe, beat, sec, bpm));
    // Strobe White wirkt auch bei Master 0, aber nicht bei Blackout
    gl.uniform1f(this.loc(this.fin, "uWhite"), strobeWhite(show.strobe, beat, sec, bpm));
    this.bindTex(0, from); this.bindTex(1, t.to);
    this.bindTarget(dest, 0, 0, w, h);
    this.draw();
  }

  private drawTestCard(show: ShowState, beat: number, nowMs: number, w: number, h: number, dest: Target | null): void {
    const gl = this.gl, g = this.gen;
    gl.useProgram(g.p);
    gl.uniform1i(this.loc(g, "uTest"), Math.max(0, TEST_IDS.indexOf(show.testPattern ?? "bars")));
    const l: LayerState = { ...show.layers[0]!, clip: "testcard", effects: [], colorSource: "original", opacity: 1, strobe: 0 };
    const img = this.renderLayer(l, "testcard", nowMs / 1000, w, h, show, beat, 0, new Float32Array(8), false);
    if (img) this.drawFlat(img.tex, w, h, "fill", 1, w, h, dest);
  }

  /** SHOW-Ablauf: Cues über bzw. statt der Visuals. */
  private drawCues(cues: readonly CueRender[], nowMs: number, w: number, h: number, dest: Target | null = null): void {
    for (const c of cues) {
      // „statt Visuals“: erst die Visuals mit der Deckkraft des Cues abdunkeln
      if (c.over === "replace" || c.kind === "black") this.drawFlat(this.blackTex(), w, h, "fill", c.opacity, w, h, dest);
      if (c.kind === "black" || !c.media) continue;
      if (c.kind === "image" && isMediaClip(c.media)) {
        const m = this.media.get(mediaIdOf(c.media));
        if (m) this.drawFlat(m.tex, m.w, m.h, c.fit, c.opacity, w, h, dest);
      } else if (c.kind === "video" && isVideoClip(c.media)) {
        const t = c.t + (c.rate > 0 ? ((nowMs - c.atMs) / 1000) * c.rate : 0);
        const src = this.videoSource?.("cue:" + c.key, videoIdOf(c.media), t, c.rate, { sound: true, volume: c.volume, ...(c.loop ? { loop: c.loop } : {}) }) ?? null;
        if (!src) continue;
        const v = this.uploadVideo("cue:" + c.key, src);
        this.drawFlat(v.tex, v.w, v.h, c.fit, c.opacity, w, h, dest);
      }
    }
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

function colors(src: ColorSource, slots: Rgb[], l?: LayerState): [Rgb, Rgb] {
  if (src === "multi" && l) { const p = layerPalette(l, slots); return [p[0]!, p[1] ?? p[0]!]; }
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
