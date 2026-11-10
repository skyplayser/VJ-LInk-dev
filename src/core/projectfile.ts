// Projektdatei (.vjlink): das ganze Projekt plus Grafiken in einer Datei. Videos liegen daneben im Ordner
// „<Name> Medien“, damit die Datei klein bleibt und das Projekt mit dem Ordner auf einen anderen Rechner umziehen kann.
import { isValidMediaId, type MediaPayload } from "./media";
import { parseProject } from "./project";
import { t } from "./i18n";

export const PROJECT_EXT = "vjlink";
export const PROJECT_FORMAT = "vjlink-project";
export const PROJECT_FORMAT_VERSION = 1;

export interface VideoRef { id: string; name: string; ext: string }

/** Kurzer Fingerabdruck eines Projekts (FNV-1a, 2 × 32 Bit): erkennt ungespeicherte Änderungen. */
/**
 * Kennung eines Projektstands für „ungespeicherte Änderungen“. Laufzeitwerte (Startzeit laufender Videos)
 * zählen nicht, sonst wäre ein gerade geöffnetes Projekt sofort „geändert“.
 */
export function projectHash(json: string): string {
  try { return hashText(JSON.stringify(JSON.parse(json), (k, v) => (k === "videoStart" ? undefined : v))); }
  catch { return hashText(json); }
}

export function hashText(s: string): string {
  let a = 0x811c9dc5, b = 0x01000193 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x5bd1e995) >>> 0;
  }
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}

/** Name des Medienordners neben der Projektdatei. */
export const mediaFolderName = (fileBase: string): string => `${fileBase} Medien`;

/** Welche Grafiken und Videos das Projekt braucht. */
export function projectRefs(projectJson: string): { mediaIds: string[]; videos: VideoRef[] } {
  const p = parseProject(projectJson);
  if (!p) return { mediaIds: [], videos: [] };
  return { mediaIds: p.media.map(m => m.id), videos: p.videos.map(v => ({ id: v.id, name: v.name, ext: v.ext })) };
}

/** Projektdatei zusammenstellen. */
export function packProject(projectJson: string, images: readonly MediaPayload[], mediaFolder: string | null, savedAt: string): string {
  return JSON.stringify({
    format: PROJECT_FORMAT, formatVersion: PROJECT_FORMAT_VERSION, savedAt,
    project: JSON.parse(projectJson) as unknown,
    images: images.map(m => ({ id: m.id, name: m.name, dataUrl: m.dataUrl })),
    mediaFolder,
  });
}

export interface UnpackedProject { projectJson: string; images: MediaPayload[]; mediaFolder: string | null; videos: VideoRef[] }

/** Projektdatei lesen. Gibt eine Fehlermeldung zurück, wenn es keine (lesbare) VJ-Link-Datei ist. */
export function unpackProject(text: string): UnpackedProject | string {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return t("Die Datei ist keine VJ-Link-Projektdatei."); }
  if (typeof raw !== "object" || raw === null) return t("Die Datei ist keine VJ-Link-Projektdatei.");
  const r = raw as Record<string, unknown>;
  if (r.format !== PROJECT_FORMAT) return t("Die Datei ist keine VJ-Link-Projektdatei.");
  if (typeof r.formatVersion !== "number" || r.formatVersion > PROJECT_FORMAT_VERSION) return t("Die Datei stammt aus einer neueren VJ-Link-Version.");
  const projectJson = JSON.stringify(r.project ?? null);
  if (!parseProject(projectJson)) return t("Das Projekt in der Datei ist beschädigt.");
  const images = (Array.isArray(r.images) ? r.images : [])
    .filter((m): m is MediaPayload => typeof m === "object" && m !== null && isValidMediaId((m as MediaPayload).id)
      && typeof (m as MediaPayload).name === "string" && typeof (m as MediaPayload).dataUrl === "string")
    .map(m => ({ id: m.id, name: m.name.slice(0, 80), dataUrl: m.dataUrl }));
  // Nur ein schlichter Ordnername neben der Datei (kein Pfad, kein „..“)
  const mf = typeof r.mediaFolder === "string" && /^[^/\\:]{1,200}$/.test(r.mediaFolder) && r.mediaFolder !== ".." && r.mediaFolder !== "." ? r.mediaFolder : null;
  return { projectJson, images, mediaFolder: mf, videos: projectRefs(projectJson).videos };
}
