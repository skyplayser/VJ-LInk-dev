// Grafiken (Logos, Bilder): Bibliothek und Animation. Die Bilddaten selbst liegen im Main-Prozess
// (Ordner „media“ im Benutzerverzeichnis) und in den Texturen der Fenster.
import type { MediaSettings } from "./show";

export interface MediaItem {
  id: string;
  name: string;
  width: number;
  height: number;
}

/** Bilddaten zum Übertragen zwischen Fenstern und zum Speichern. */
export interface MediaPayload { id: string; name: string; dataUrl: string }

export const MEDIA_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"] as const;
export const MEDIA_MAX_BYTES = 25 * 1024 * 1024;

export const mediaClip = (id: string): string => `img:${id}`;

/** Sichere ID aus Buchstaben und Ziffern (wird auch als Dateiname benutzt). */
export function isValidMediaId(id: unknown): id is string {
  return typeof id === "string" && /^[a-z0-9]{6,40}$/.test(id);
}

export interface MediaTransform { x: number; y: number; scale: number; rotation: number }

/**
 * Lage der Grafik zum Beat `beat` (Sekunden `tSec` nur für „Schweben“).
 * Rotation im Bogenmaß, x/y in Bildhöhen (0 = Mitte).
 */
export function mediaTransform(m: MediaSettings, beat: number, tSec: number): MediaTransform {
  const a = m.animAmount;
  const ph = beat / (m.animBeats > 0 ? m.animBeats : 1);
  const frac = ph - Math.floor(ph);
  let x = m.x * 0.5, y = m.y * 0.5, scale = m.scale, rot = (m.rotation * Math.PI) / 180;
  switch (m.anim) {
    case "pulse": scale *= 1 + a * 0.35 * Math.pow(1 - frac, 3); break;
    case "spin": rot += ph * Math.PI * 2 * (0.25 + a * 0.75); break;
    case "bounce": y += a * 0.25 * Math.abs(Math.sin(Math.PI * ph)); break;
    case "float": x += a * 0.15 * Math.sin(tSec * 0.5); y += a * 0.1 * Math.sin(tSec * 0.73); break;
    case "wobble": rot += a * 0.35 * Math.sin(Math.PI * 2 * ph); break;
    case "zoom": scale *= 1 + a * frac; break;
  }
  return { x, y, scale, rotation: rot };
}
