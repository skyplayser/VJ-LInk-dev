// Projekt speichern, laden, neu: Dateien auf dem Rechner (.vjlink plus Medienordner).
// Der Arbeitsstand liegt weiter im App-Ordner (wird laufend gesichert); die Datei ist das, was man weitergibt.
import { app } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import { mediaFolderName, projectHash, packProject, projectRefs, unpackProject, PROJECT_EXT } from "../core/projectfile";
import type { Storage } from "./storage";
import { t } from "../core/i18n";

const FILE_MAX_BYTES = 512 * 1024 * 1024;
const RECENT_MAX = 8;

interface State {
  /** Geöffnete Projektdatei oder null (unbenannt). */
  current: string | null;
  /** Fingerabdruck des zuletzt gespeicherten bzw. geladenen Stands. */
  savedHash: string | null;
  /** Gerade geladen oder neu: die Oberfläche legt den Vergleichsstand nach dem Laden fest. */
  fresh: boolean;
  recent: string[];
}

export interface FileResult { ok: boolean; name?: string; path?: string; message?: string; missing?: string[] }

export class ProjectFiles {
  private state: State = { current: null, savedHash: null, fresh: false, recent: [] };
  dirty = false;

  constructor(private storage: Storage, private stateFile: string) {}

  async init(): Promise<void> {
    try {
      const s = JSON.parse(await fs.readFile(this.stateFile, "utf8")) as Partial<State>;
      this.state = {
        current: typeof s.current === "string" ? s.current : null,
        savedHash: typeof s.savedHash === "string" ? s.savedHash : null,
        fresh: s.fresh === true,
        recent: Array.isArray(s.recent) ? s.recent.filter((x): x is string => typeof x === "string").slice(0, RECENT_MAX) : [],
      };
    } catch { /* erster Start */ }
  }

  private async persist(): Promise<void> {
    const tmp = `${this.stateFile}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(this.state));
    await fs.rename(tmp, this.stateFile);
  }

  get current(): string | null { return this.state.current; }
  get name(): string { return this.state.current ? path.basename(this.state.current, `.${PROJECT_EXT}`) : "Unbenannt"; }
  get recent(): readonly string[] { return this.state.recent; }

  /** Für die Oberfläche beim Start. */
  info(): { file: { path: string; name: string } | null; savedHash: string | null; fresh: boolean; recent: string[] } {
    return {
      file: this.state.current ? { path: this.state.current, name: this.name } : null,
      savedHash: this.state.savedHash, fresh: this.state.fresh, recent: [...this.state.recent],
    };
  }

  /** Die Oberfläche hat nach dem Laden ihren Vergleichsstand bestimmt. */
  async setBaseline(hash: string): Promise<void> {
    this.state.savedHash = hash; this.state.fresh = false;
    await this.persist();
  }

  private remember(file: string): void {
    this.state.recent = [file, ...this.state.recent.filter(f => f !== file)].slice(0, RECENT_MAX);
    if (process.platform !== "linux") app.addRecentDocument(file);
  }

  async clearRecent(): Promise<void> { this.state.recent = []; app.clearRecentDocuments(); await this.persist(); }

  /** Speichern nach `file`. Videos kommen in den Medienordner daneben (nur neue oder geänderte werden kopiert). */
  async save(projectJson: string, file: string): Promise<FileResult> {
    if (!file.toLowerCase().endsWith(`.${PROJECT_EXT}`)) file += `.${PROJECT_EXT}`;
    const refs = projectRefs(projectJson);
    const images = await this.storage.mediaPayloads(refs.mediaIds);
    const base = path.basename(file, `.${PROJECT_EXT}`);
    const folderName = mediaFolderName(base);
    const missing: string[] = [];
    if (refs.videos.length) {
      const folder = path.join(path.dirname(file), folderName);
      await fs.mkdir(folder, { recursive: true });
      for (const v of refs.videos) {
        const src = this.storage.videoFile(v.id);
        if (!src) { missing.push(v.name); continue; }
        const dest = path.join(folder, src.file);
        const [a, b] = await Promise.all([fs.stat(src.path).catch(() => null), fs.stat(dest).catch(() => null)]);
        if (!a) { missing.push(v.name); continue; }
        if (!b || b.size !== a.size) await fs.copyFile(src.path, dest);
      }
    }
    const text = packProject(projectJson, images, refs.videos.length ? folderName : null, new Date().toISOString());
    const tmp = `${file}.tmp`;
    await fs.writeFile(tmp, text);
    await fs.rename(tmp, file);
    this.state.current = file; this.state.savedHash = projectHash(projectJson); this.state.fresh = false;
    this.remember(file);
    await this.persist();
    this.dirty = false;
    return { ok: true, name: this.name, path: file, missing };
  }

  /** Projektdatei öffnen: Grafiken und Videos in die Bibliothek, Projekt als Arbeitsstand. Danach Oberfläche neu laden. */
  async open(file: string): Promise<FileResult> {
    let text: string;
    try {
      const st = await fs.stat(file);
      if (!st.isFile()) return { ok: false, message: t("Datei nicht gefunden.") };
      if (st.size > FILE_MAX_BYTES) return { ok: false, message: t("Die Datei ist zu groß.") };
      text = await fs.readFile(file, "utf8");
    } catch { return { ok: false, message: t("Datei nicht gefunden.") }; }
    const p = unpackProject(text);
    if (typeof p === "string") return { ok: false, message: p };
    for (const img of p.images) await this.storage.addMedia(img);
    const missing: string[] = [];
    for (const v of p.videos) {
      if (this.storage.hasVideo(v.id)) continue;
      const src = p.mediaFolder ? path.join(path.dirname(file), p.mediaFolder, `${v.id}.${v.ext}`) : null;
      if (!src || !(await this.storage.importVideo(src, v.id, v.name))) missing.push(v.name);
    }
    await this.storage.saveProject(p.projectJson);
    this.state.current = file; this.state.savedHash = null; this.state.fresh = true;
    this.remember(file);
    await this.persist();
    this.dirty = false;
    return { ok: true, name: this.name, path: file, missing };
  }

  /** Neues, leeres Projekt (die Bibliothek im App-Ordner bleibt erhalten, das Projekt zeigt nur, was es nutzt). */
  async newProject(): Promise<FileResult> {
    await this.storage.clearProject();
    this.state.current = null; this.state.savedHash = null; this.state.fresh = true;
    await this.persist();
    this.dirty = false;
    return { ok: true, name: this.name };
  }
}
