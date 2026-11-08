// Grafik-Bibliothek im Fenster: Dateien einlesen, prüfen, verkleinern und an alle Engines geben.
import type { Engine } from "../engine/engine";
import { MEDIA_MAX_BYTES, MEDIA_TYPES, type MediaItem, type MediaPayload } from "../core/media";
import { bridge } from "./bridge";

const MAX_SIDE = 2048;

export interface DecodedImage { src: TexImageSource; w: number; h: number; /** Hintergrund laut Ecken, wenn das Bild keine Transparenz hat. */ background?: "white" | "black" }

/** Ecken prüfen: ganz deckend und einheitlich hell bzw. dunkel → wahrscheinlich ein Logo auf weißem/schwarzem Grund. */
function detectBackground(img: CanvasImageSource, w: number, h: number): "white" | "black" | undefined {
  try {
    const c = document.createElement("canvas"); c.width = 32; c.height = 32;
    const g = c.getContext("2d", { willReadFrequently: true })!;
    g.drawImage(img, 0, 0, w, h, 0, 0, 32, 32);
    const d = g.getImageData(0, 0, 32, 32).data;
    const at = (x: number, y: number) => { const i = (y * 32 + x) * 4; return [d[i]!, d[i + 1]!, d[i + 2]!, d[i + 3]!] as const; };
    const corners = [at(0, 0), at(31, 0), at(0, 31), at(31, 31), at(16, 0), at(0, 16)];
    if (corners.some(p => p[3] < 250)) return undefined; // hat Transparenz
    if (corners.every(p => Math.min(p[0], p[1], p[2]) > 225)) return "white";
    if (corners.every(p => Math.max(p[0], p[1], p[2]) < 30)) return "black";
  } catch { /* nicht lesbar */ }
  return undefined;
}

/** Data-URL in ein Bild umwandeln; sehr große Bilder werden auf 2048 Pixel verkleinert. */
export async function decodeImage(dataUrl: string): Promise<DecodedImage> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  let w = img.naturalWidth || 1024, h = img.naturalHeight || 1024; // SVG ohne Größe
  const isSvg = dataUrl.startsWith("data:image/svg+xml");
  if (Math.max(w, h) <= MAX_SIDE && !isSvg) return { src: img, w, h, background: detectBackground(img, w, h) };
  const k = Math.min(1, MAX_SIDE / Math.max(w, h));
  if (isSvg && Math.max(w, h) < 1024) { const up = 1024 / Math.max(w, h); w *= up; h *= up; }
  const c = document.createElement("canvas");
  c.width = Math.round(w * k); c.height = Math.round(h * k);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return { src: c, w: c.width, h: c.height, background: detectBackground(c, c.width, c.height) };
}

function newId(): string {
  const b = new Uint8Array(8); crypto.getRandomValues(b);
  return Array.from(b, x => x.toString(16).padStart(2, "0")).join("");
}

function readDataUrl(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(file);
  });
}

export class MediaLibrary {
  items: MediaItem[] = [];
  /** Erkannter Hintergrund je Grafik (für automatisches Freistellen). */
  background = new Map<string, "white" | "black">();
  private engines: Engine[] = [];
  private images = new Map<string, DecodedImage>();

  attach(engine: Engine): void {
    this.engines.push(engine);
    for (const [id, d] of this.images) engine.setMedia(id, d.src, d.w, d.h);
  }

  /** Bereits gespeicherte oder neu importierte Grafik übernehmen. */
  async load(p: MediaPayload): Promise<MediaItem | null> {
    try {
      const d = await decodeImage(p.dataUrl);
      this.images.set(p.id, d);
      if (d.background) this.background.set(p.id, d.background);
      for (const e of this.engines) e.setMedia(p.id, d.src, d.w, d.h);
      let item = this.items.find(i => i.id === p.id);
      if (!item) { item = { id: p.id, name: p.name, width: d.w, height: d.h }; this.items.push(item); }
      return item;
    } catch { return null; }
  }

  /** Datei vom Rechner. Gibt eine Fehlermeldung (Text) oder die neue Grafik zurück. */
  async importFile(file: File): Promise<MediaItem | string> {
    if (!(MEDIA_TYPES as readonly string[]).includes(file.type)) return `„${file.name}“: nur PNG, JPG, WebP, GIF oder SVG.`;
    if (file.size > MEDIA_MAX_BYTES) return `„${file.name}“ ist größer als 25 MB.`;
    const p: MediaPayload = { id: newId(), name: file.name.replace(/\.[^.]+$/, "").slice(0, 80), dataUrl: await readDataUrl(file) };
    const item = await this.load(p);
    if (!item) return `„${file.name}“ lässt sich nicht als Bild lesen.`;
    bridge?.addMedia(p);
    return item;
  }

  remove(id: string): void {
    this.items = this.items.filter(i => i.id !== id);
    this.images.delete(id);
    for (const e of this.engines) e.removeMedia(id);
    bridge?.removeMedia(id);
  }
}
