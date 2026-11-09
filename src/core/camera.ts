import { t } from "./i18n";
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

/** Darstellungen eines Kamerabilds. Reihenfolge = Nummer im Shader (uLook). */
export const CAM_LOOKS = ["normal", "silhouette", "outline", "dots", "ascii", "halftone", "thermal", "duotone", "mask-in", "mask-out"] as const;
export type CamLook = typeof CAM_LOOKS[number];

export const CAM_LOOK_LABEL: Record<CamLook, string> = {
  normal: t("Normal"), silhouette: t("Silhouette"), outline: t("Umriss"), dots: t("Dot-Matrix"), ascii: "ASCII",
  halftone: t("Raster"), thermal: t("Wärmebild"), duotone: t("Duoton"), "mask-in": t("Maske positiv"), "mask-out": t("Maske negativ"),
};
export const CAM_LOOK_INFO: Record<CamLook, string> = {
  normal: t("Das Kamerabild, wie es ist."),
  silhouette: t("Personen als Umriss vor den Visuals, schwarz oder in der Farbe der Ebene."),
  outline: t("Leuchtende Konturen der Person bzw. der Kanten im Bild."),
  dots: t("Punkte nach Helligkeit, in den Farben des Bildes."),
  ascii: t("Zeichen . : + # @ nach Helligkeit."),
  halftone: t("Zeitungsraster: Punkte in der Farbe der Ebene."),
  thermal: t("Falschfarben wie eine Wärmebildkamera."),
  duotone: t("Zwei Farben (Slot A dunkel, Slot B hell) nach Helligkeit."),
  "mask-in": t("Ganz oben: Die Visuals darunter sind nur in der Person sichtbar."),
  "mask-out": t("Ganz oben: Die Person wird aus den Visuals darunter ausgeschnitten."),
};
/** Looks, die die Person vom Hintergrund trennen (brauchen Schwelle bzw. gemerkten Hintergrund). */
export const usesFigure = (l: CamLook, onlyFig: boolean): boolean =>
  l === "silhouette" || l === "outline" || l === "mask-in" || l === "mask-out" || (onlyFig && l !== "normal");
/** Looks mit Raster (Zellgröße einstellbar). */
export const usesCells = (l: CamLook): boolean => l === "dots" || l === "ascii" || l === "halftone";
export const isMaskLook = (l: CamLook): boolean => l === "mask-in" || l === "mask-out";

/** Einstellungen einer Kamera als Clip in einer Ebene. */
export interface CamSettings {
  mirror: boolean;
  /** Silhouette: Personen als Umriss (schwarz bzw. in der Farbe der Ebene), Hintergrund durchsichtig. */
  look: CamLook;
  /** Schwelle 0–1: ohne gemerkten Hintergrund trennt die Helligkeit (Gegenlicht), mit Hintergrund der Unterschied. */
  tol: number;
  /** Zeitpunkt „Hintergrund merken“ (Epoch-ms); 0 = kein Hintergrund gemerkt. */
  bgStamp: number;
  /** Zellen über die Bildhöhe (Dot-Matrix, ASCII, Raster). */
  cells: number;
  /** Stilisierte Looks nur auf der Person, Hintergrund durchsichtig. */
  onlyFig: boolean;
}

export const defaultCam = (): CamSettings => ({ mirror: false, look: "normal", tol: 0.35, bgStamp: 0, cells: 48, onlyFig: false });

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
