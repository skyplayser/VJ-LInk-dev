// Kameras in einem Fenster: Geräte öffnen, solange sie gebraucht werden, und wieder freigeben.
import type { CameraSource } from "../core/camera";

export interface CamDevice { deviceId: string; label: string }

interface Entry { el: HTMLVideoElement; stream: MediaStream | null; lastUse: number; failed: boolean; opening: boolean }

export class CameraPool {
  private entries = new Map<string, Entry>();
  /** Kameras laut Show-Zustand (ID → Gerät). */
  sources: CameraSource[] = [];
  error = "";

  /** Bild einer Kamera; öffnet das Gerät beim ersten Aufruf. */
  get(camId: string): { el: TexImageSource; w: number; h: number } | null {
    const src = this.sources.find(c => c.id === camId);
    if (!src) return null;
    let e = this.entries.get(camId);
    if (!e) {
      const el = document.createElement("video");
      el.muted = true; el.playsInline = true; el.autoplay = true;
      e = { el, stream: null, lastUse: 0, failed: false, opening: false };
      this.entries.set(camId, e);
      void this.open(e, src);
    }
    e.lastUse = performance.now();
    const v = e.el;
    return v.readyState >= 2 && v.videoWidth > 0 ? { el: v, w: v.videoWidth, h: v.videoHeight } : null;
  }

  private async open(e: Entry, src: CameraSource): Promise<void> {
    e.opening = true;
    const tryOpen = (id?: string) => navigator.mediaDevices.getUserMedia({
      video: { ...(id ? { deviceId: { exact: id } } : {}), width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 } },
      audio: false,
    });
    try {
      let stream: MediaStream;
      try { stream = await tryOpen(src.deviceId); }
      catch {
        // Geräte-ID hat sich geändert (z. B. neu angesteckt): über den Namen suchen
        const dev = (await navigator.mediaDevices.enumerateDevices()).find(d => d.kind === "videoinput" && d.label === src.label);
        if (!dev) throw new Error("nicht gefunden");
        stream = await tryOpen(dev.deviceId);
        src.deviceId = dev.deviceId;
      }
      e.stream = stream;
      e.el.srcObject = stream;
      void e.el.play().catch(() => { /* nächster Versuch beim nächsten Bild */ });
      this.error = "";
    } catch {
      e.failed = true;
      this.error = `Kamera „${src.label || "?"}“ lässt sich nicht öffnen.`;
      // nach einer Weile neu versuchen (Gerät wieder angesteckt, Freigabe erteilt)
      setTimeout(() => { for (const [k, x] of this.entries) if (x === e) this.drop(k); }, 4000);
    } finally { e.opening = false; }
  }

  /** Kameras, die ein paar Sekunden nicht gebraucht wurden, schließen (die Kamera-LED geht aus). */
  sweep(): void {
    const now = performance.now();
    for (const [k, e] of this.entries) if (now - e.lastUse > 4000 && !e.opening) this.drop(k);
  }

  private drop(key: string): void {
    const e = this.entries.get(key);
    if (!e) return;
    e.stream?.getTracks().forEach(t => t.stop());
    e.el.srcObject = null;
    this.entries.delete(key);
  }

  /** Video-Eingänge auflisten (Namen erst nach der Freigabe). */
  static async devices(): Promise<CamDevice[]> {
    try {
      return (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === "videoinput")
        .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Kamera ${i + 1}` }));
    } catch { return []; }
  }

  /** Einmal kurz öffnen, damit das System fragt und die Gerätenamen sichtbar werden. */
  static async unlock(): Promise<boolean> {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      s.getTracks().forEach(t => t.stop());
      return true;
    } catch { return false; }
  }
}
