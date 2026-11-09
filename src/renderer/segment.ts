// Personen-Erkennung für Kamera-Looks (Silhouette, Umriss, Masken): MediaPipe Selfie-Segmentierung
// (Apache-2.0, läuft lokal, kein Internet). Liefert je Kamera eine weiche Maske (Person = hell) als Canvas,
// die die Engine wie ein Kamerabild hochlädt. Bis das Modell bereit ist (oder falls es fehlt), gilt der alte Weg
// über Helligkeit bzw. gemerkten Hintergrund.
import { FilesetResolver, ImageSegmenter } from "@mediapipe/tasks-vision";

/** Wo Laufzeit und Modell liegen: in der App über das Protokoll vjasset:, im Browser-Modus neben der Seite. */
const BASE = location.protocol === "file:" ? "vjasset://app/mediapipe" : new URL("vendor/mediapipe", location.href).toString().replace(/\/$/, "");

/** Kantenlänge der Maske (Breite); Höhe nach Seitenverhältnis. Klein genug für viele Bilder pro Sekunde. */
const MASK_W = 320;

let loading: Promise<ImageSegmenter | null> | null = null;
let failed = "";
let status: "idle" | "loading" | "ready" | "failed" = "idle";

async function load(): Promise<ImageSegmenter | null> {
  try {
    const files = await FilesetResolver.forVisionTasks(BASE);
    const opts = (delegate: "GPU" | "CPU") => ({
      baseOptions: { modelAssetPath: `${BASE}/selfie_segmenter.tflite`, delegate },
      runningMode: "VIDEO" as const, outputConfidenceMasks: true, outputCategoryMask: false,
    });
    try { return await ImageSegmenter.createFromOptions(files, opts("GPU")); }
    catch { return await ImageSegmenter.createFromOptions(files, opts("CPU")); }
  } catch (e) {
    failed = (e instanceof Error ? e.message : String(e)) || "Personen-Erkennung nicht verfügbar";
    console.warn("Personen-Erkennung Details:", e instanceof Event ? `${e.type} ${(e.target as HTMLScriptElement | null)?.src ?? ""}` : String(e));
    console.warn("Personen-Erkennung:", failed);
    return null;
  }
}

interface Track { small: HTMLCanvasElement; sg: CanvasRenderingContext2D; out: HTMLCanvasElement; og: CanvasRenderingContext2D;
  raw: HTMLCanvasElement; rg: CanvasRenderingContext2D;
  img: ImageData; acc: Float32Array | null; lastTime: number; lastRun: number; ready: boolean; lastAsk: number }

export class PersonMasks {
  private seg: ImageSegmenter | null = null;
  private tracks = new Map<string, Track>();
  private lastTs = 0;

  get error(): string { return failed; }
  /** Zustand für die Anzeige: lädt, bereit oder nicht verfügbar (dann gilt Helligkeit bzw. gemerkter Hintergrund). */
  get state(): "idle" | "loading" | "ready" | "failed" { return status; }

  /**
   * Maske zur Kamera `id` aus dem aktuellen Videobild. Startet beim ersten Aufruf das Modell (dauert einen Moment);
   * bis dahin null. Pro neuem Kamerabild höchstens eine Erkennung (≈ 30 je Sekunde).
   */
  mask(id: string, video: TexImageSource): { el: HTMLCanvasElement; w: number; h: number } | null {
    if (!(video instanceof HTMLVideoElement) || video.videoWidth === 0) return null;
    if (!this.seg) {
      if (!loading) { status = "loading"; loading = load().then(s => { this.seg = s; status = s ? "ready" : "failed"; return s; }); }
      return null;
    }
    const w = MASK_W, h = Math.max(2, Math.round(MASK_W * video.videoHeight / video.videoWidth));
    let t = this.tracks.get(id);
    if (!t || t.small.height !== h) {
      const small = document.createElement("canvas"); small.width = w; small.height = h;
      const out = document.createElement("canvas"); out.width = w; out.height = h;
      const raw = document.createElement("canvas"); raw.width = w; raw.height = h;
      t = { small, sg: small.getContext("2d", { willReadFrequently: true })!, out, og: out.getContext("2d")!, raw, rg: raw.getContext("2d")!,
        img: new ImageData(w, h), acc: null, lastTime: -1, lastRun: 0, ready: false, lastAsk: 0 };
      this.tracks.set(id, t);
    }
    const now = performance.now();
    t.lastAsk = now;
    if (video.currentTime !== t.lastTime && now - t.lastRun > 30) {
      t.lastTime = video.currentTime; t.lastRun = now;
      this.run(t, video, w, h);
    }
    return t.ready ? { el: t.out, w, h } : null;
  }

  private run(t: Track, video: HTMLVideoElement, w: number, h: number): void {
    t.sg.drawImage(video, 0, 0, w, h);
    // Zeitstempel müssen streng steigen (über alle Kameras, ein Modell)
    const ts = Math.max(this.lastTs + 1, Math.round(performance.now()));
    this.lastTs = ts;
    try {
      const res = this.seg!.segmentForVideo(t.small, ts);
      const m = res.confidenceMasks?.[0];
      if (!m) { res.close(); return; }
      const f = m.getAsFloat32Array();
      if (!t.acc || t.acc.length !== f.length) t.acc = new Float32Array(f);
      const acc = t.acc, px = t.img.data;
      // Zeitliche Glättung: Ränder flackern nicht, schnelle Bewegung kommt trotzdem mit (Anstieg schneller als Abfall)
      for (let i = 0; i < f.length; i++) {
        const v = f[i]!, a = acc[i]!;
        const n = a + (v - a) * (v > a ? 0.65 : 0.45);
        acc[i] = n;
        const b = n * 255;
        px[i * 4] = b; px[i * 4 + 1] = b; px[i * 4 + 2] = b; px[i * 4 + 3] = 255;
      }
      res.close();
      // Leicht weichzeichnen: glatte Ränder statt Treppen, kleine Fehl-Flecken verschwinden unter der Schwelle
      t.rg.putImageData(t.img, 0, 0);
      t.og.filter = "blur(2px)";
      t.og.clearRect(0, 0, w, h);
      t.og.drawImage(t.raw, 0, 0);
      t.ready = true;
    } catch (e) {
      failed = (e as Error).message;
    }
  }

  /** Kameras, deren Maske länger nicht gefragt war, vergessen. */
  sweep(): void {
    const now = performance.now();
    for (const [k, t] of this.tracks) if (now - t.lastAsk > 5000) this.tracks.delete(k);
  }
}
