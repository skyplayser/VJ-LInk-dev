// Projekt und Grafiken im Benutzerverzeichnis der App (z. B. ~/Library/Application Support/VJ-Link).
import { promises as fs } from "node:fs";
import path from "node:path";
import { MEDIA_MAX_BYTES, isValidMediaId, type MediaPayload } from "../core/media";

const MIME_EXT: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "image/svg+xml": "svg",
};
const EXT_MIME = Object.fromEntries(Object.entries(MIME_EXT).map(([m, e]) => [e, m]));
const PROJECT_MAX_BYTES = 8 * 1024 * 1024;

interface IndexEntry { id: string; name: string; file: string }

export class Storage {
  private mediaDir: string;
  private projectFile: string;
  private index = new Map<string, IndexEntry>();

  constructor(root: string) {
    this.mediaDir = path.join(root, "media");
    this.projectFile = path.join(root, "project.json");
  }

  async init(): Promise<void> {
    await fs.mkdir(this.mediaDir, { recursive: true });
    try {
      const list = JSON.parse(await fs.readFile(path.join(this.mediaDir, "index.json"), "utf8")) as IndexEntry[];
      for (const e of list) if (isValidMediaId(e.id) && /^[a-z0-9]+\.[a-z]+$/.test(e.file)) this.index.set(e.id, e);
    } catch { /* noch keine Grafiken */ }
  }

  private async writeAtomic(file: string, data: string | Buffer): Promise<void> {
    const tmp = `${file}.tmp`;
    await fs.writeFile(tmp, data);
    await fs.rename(tmp, file);
  }
  private saveIndex(): Promise<void> {
    return this.writeAtomic(path.join(this.mediaDir, "index.json"), JSON.stringify([...this.index.values()]));
  }

  /** Prüft Kennung, Typ und Größe. Gibt die gespeicherte Grafik zurück oder null. */
  async addMedia(p: unknown): Promise<MediaPayload | null> {
    if (typeof p !== "object" || p === null) return null;
    const { id, name, dataUrl } = p as Partial<MediaPayload>;
    if (!isValidMediaId(id) || typeof name !== "string" || typeof dataUrl !== "string") return null;
    const m = /^data:(image\/(?:png|jpeg|webp|gif|svg\+xml));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (!m) return null;
    const buf = Buffer.from(m[2]!, "base64");
    if (buf.length === 0 || buf.length > MEDIA_MAX_BYTES) return null;
    const file = `${id}.${MIME_EXT[m[1]!]}`;
    await fs.writeFile(path.join(this.mediaDir, file), buf);
    this.index.set(id, { id, name: name.slice(0, 80), file });
    await this.saveIndex();
    return { id, name: name.slice(0, 80), dataUrl };
  }

  async removeMedia(id: unknown): Promise<boolean> {
    if (!isValidMediaId(id)) return false;
    const e = this.index.get(id);
    if (!e) return false;
    this.index.delete(id);
    await fs.rm(path.join(this.mediaDir, e.file), { force: true });
    await this.saveIndex();
    return true;
  }

  async allMedia(): Promise<MediaPayload[]> {
    const out: MediaPayload[] = [];
    for (const e of this.index.values()) {
      try {
        const buf = await fs.readFile(path.join(this.mediaDir, e.file));
        const mime = EXT_MIME[e.file.split(".").pop()!] ?? "image/png";
        out.push({ id: e.id, name: e.name, dataUrl: `data:${mime};base64,${buf.toString("base64")}` });
      } catch { /* Datei fehlt: überspringen */ }
    }
    return out;
  }

  async saveProject(json: unknown): Promise<void> {
    if (typeof json !== "string" || json.length > PROJECT_MAX_BYTES) return;
    await this.writeAtomic(this.projectFile, json);
  }

  async loadProject(): Promise<string | null> {
    try { return await fs.readFile(this.projectFile, "utf8"); } catch { return null; }
  }
}
