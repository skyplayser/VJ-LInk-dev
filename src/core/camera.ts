// Kameras und Video-Eingänge (Webcam, Capture-Karte, OBS Virtual Camera) als Clip und als Cue.
// Jedes Fenster öffnet die Kamera selbst; der Show-Zustand nennt nur, welche Geräte gemeint sind.

export interface CameraSource {
  /** Kurze ID für den Clip „cam:<id>“. */
  id: string;
  /** Geräte-ID des Browsers (bleibt für dieselbe App gleich). */
  deviceId: string;
  /** Name des Geräts, z. B. „OBS Virtual Camera“ (Ersatz, falls sich die Geräte-ID ändert). */
  label: string;
}

export type CamLook = "normal" | "silhouette";

/** Einstellungen einer Kamera als Clip in einer Ebene. */
export interface CamSettings {
  mirror: boolean;
  /** Silhouette: Personen als Umriss (schwarz bzw. in der Farbe der Ebene), Hintergrund durchsichtig. */
  look: CamLook;
  /** Schwelle 0–1: ohne gemerkten Hintergrund trennt die Helligkeit (Gegenlicht), mit Hintergrund der Unterschied. */
  tol: number;
  /** Zeitpunkt „Hintergrund merken“ (Epoch-ms); 0 = kein Hintergrund gemerkt. */
  bgStamp: number;
}

export const defaultCam = (): CamSettings => ({ mirror: false, look: "normal", tol: 0.35, bgStamp: 0 });

export const camClip = (id: string): string => `cam:${id}`;
export const isCamClip = (clip: string | null | undefined): clip is string => !!clip && clip.startsWith("cam:");
export const camIdOf = (clip: string): string => clip.slice(4);
export const isValidCamId = (id: unknown): id is string => typeof id === "string" && /^[a-z0-9]{4,24}$/.test(id);

/** Kamera zu einem Gerät suchen oder anlegen. */
export function ensureCamera(list: CameraSource[], deviceId: string, label: string): CameraSource {
  const found = list.find(c => c.deviceId === deviceId) ?? list.find(c => c.label === label && label !== "");
  if (found) { found.deviceId = deviceId; if (label) found.label = label; return found; }
  let id = "";
  do id = Math.random().toString(36).slice(2, 10); while (!isValidCamId(id) || list.some(c => c.id === id));
  const cam = { id, deviceId, label };
  list.push(cam);
  return cam;
}
