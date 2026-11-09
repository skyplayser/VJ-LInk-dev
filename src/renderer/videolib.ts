// Video-Bibliothek im Fenster: Dateien übernehmen, Länge messen, Vorschaubild erzeugen.
import type { VideoItem } from "../core/video";
import { VIDEO_EXTENSIONS } from "../core/video";
import { bridge } from "./bridge";
import { t } from "../core/i18n";

export function isVideoFile(f: File): boolean {
  const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
  return f.type.startsWith("video/") || (VIDEO_EXTENSIONS as readonly string[]).includes(ext);
}

export class VideoLibrary {
  items: VideoItem[] = [];
  /** Vorschaubild je Video (für Clip-Raster, Bibliothek und Ablauf). */
  posters = new Map<string, HTMLCanvasElement>();
  private blobs = new Map<string, string>();

  /** Adresse zum Abspielen: in der App über vjmedia://, im Browser-Test über blob:. */
  url(id: string): string | null {
    return this.blobs.get(id) ?? (bridge ? `vjmedia://video/${id}` : null);
  }
  duration(id: string): number { return this.items.find(i => i.id === id)?.duration ?? 0; }
  find(id: string): VideoItem | undefined { return this.items.find(i => i.id === id); }

  /** Bekanntes Video übernehmen (z. B. beim Laden des Projekts) und vermessen. */
  async add(item: VideoItem): Promise<VideoItem> {
    if (!this.items.some(i => i.id === item.id)) this.items.push(item);
    await this.probe(item);
    return item;
  }

  /** Datei vom Rechner. Gibt das Video oder eine Fehlermeldung zurück. */
  async importFile(file: File): Promise<VideoItem | string> {
    const name = file.name.replace(/\.[^.]+$/, "").slice(0, 80);
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "mp4";
    let item: VideoItem;
    if (bridge) {
      const path = bridge.pathForFile(file);
      if (!path) return t("„{name}“ lässt sich nicht lesen.", { name: file.name });
      const r = await bridge.addVideo(path, name);
      if (typeof r === "string") return `„${file.name}“: ${t(r)}`;
      item = { id: r.id, name: r.name, ext: r.ext, duration: 0, width: 0, height: 0 };
    } else {
      const b = new Uint8Array(8); crypto.getRandomValues(b);
      const id = Array.from(b, x => x.toString(16).padStart(2, "0")).join("");
      this.blobs.set(id, URL.createObjectURL(file));
      item = { id, name, ext, duration: 0, width: 0, height: 0 };
    }
    this.items.push(item);
    const ok = await this.probe(item);
    if (!ok) return t("„{name}“ lässt sich nicht abspielen (Format?). Geht sicher: MP4 mit H.264, WebM.", { name: file.name });
    return item;
  }

  remove(id: string): void {
    this.items = this.items.filter(i => i.id !== id);
    this.posters.delete(id);
    const b = this.blobs.get(id); if (b) { URL.revokeObjectURL(b); this.blobs.delete(id); }
    bridge?.removeVideo(id);
  }

  /** Länge, Größe und ein Vorschaubild (bei 10 % der Länge) ermitteln. */
  private probe(item: VideoItem): Promise<boolean> {
    const url = this.url(item.id);
    if (!url) return Promise.resolve(false);
    return new Promise(resolve => {
      const v = document.createElement("video");
      v.crossOrigin = "anonymous"; v.muted = true; v.preload = "auto"; v.src = url;
      const done = (ok: boolean) => { clearTimeout(timer); v.removeAttribute("src"); v.load(); resolve(ok); };
      const timer = setTimeout(() => done(item.duration > 0), 10000);
      v.addEventListener("error", () => done(false), { once: true });
      v.addEventListener("loadedmetadata", () => {
        item.duration = Number.isFinite(v.duration) ? v.duration : 0;
        item.width = v.videoWidth; item.height = v.videoHeight;
        v.currentTime = Math.min(1.5, item.duration * 0.1);
      }, { once: true });
      v.addEventListener("seeked", () => {
        const c = document.createElement("canvas");
        const k = 320 / Math.max(1, v.videoWidth);
        c.width = 320; c.height = Math.max(1, Math.round(v.videoHeight * k));
        try { c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height); this.posters.set(item.id, c); } catch { /* ohne Vorschaubild */ }
        done(true);
      }, { once: true });
    });
  }
}
