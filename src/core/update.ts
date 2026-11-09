// Updates: Wie bei LJ-Link fragt der Hauptprozess GitHub nach der neuesten Veröffentlichung, lädt das passende
// Installationspaket und ersetzt die App. Hier liegt nur, was sich ohne Netz und Dateisystem prüfen lässt.

/** Öffentliches Repo mit den Veröffentlichungen (das Entwicklungs-Repo ist privat). */
export const UPDATE_REPO = "skyplayser/VJ-LINK";
export const RELEASES_PAGE = `https://github.com/${UPDATE_REPO}/releases`;

export interface ReleaseInfo {
  version: string;
  /** Download des passenden Pakets; null, wenn es für diesen Rechner keins gibt. */
  url: string | null;
  asset: string;
  size: number;
  /** Seite der Veröffentlichung (Änderungen lesen, von Hand laden). */
  page: string;
  /** Kurzer Text aus der Veröffentlichung (erste Zeilen). */
  notes: string;
}

export type UpdateStatus = "idle" | "checking" | "latest" | "available" | "downloading" | "installing" | "error";

export interface UpdateState {
  status: UpdateStatus;
  current: string;
  /** Entwicklungsversion (nicht als App gebaut): prüfen ja, installieren nein. */
  dev: boolean;
  latest?: ReleaseInfo;
  /** Download-Fortschritt 0–1. */
  progress?: number;
  message?: string;
  /** Zeitpunkt der letzten Prüfung (ms). */
  checkedAt?: number;
}

/** Ist `candidate` neuer als `current`? (1.10.0 > 1.9.2, „v“ davor egal, Vorabversionen zählen nach Zahlen.) */
export function isNewer(candidate: string | null | undefined, current: string | null | undefined): boolean {
  if (!candidate || !current) return false;
  const parts = (v: string) => v.replace(/^v/i, "").split(/[.-]/).map(x => Number.parseInt(x.replace(/\D/g, ""), 10) || 0);
  const a = parts(candidate), b = parts(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0, y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

/** Name des Installationspakets für diesen Rechner (so heißen die Dateien in der Veröffentlichung). */
export function assetName(platform: string, arch: string): string {
  if (platform === "win32") return "VJ-Link-windows.exe";
  if (platform === "darwin") return arch === "arm64" ? "VJ-Link-macos-arm64.dmg" : "VJ-Link-macos-intel.dmg";
  return "VJ-Link-linux.AppImage";
}

/** Antwort von GitHub (releases/latest) auslesen. */
export function pickRelease(json: unknown, platform: string, arch: string): ReleaseInfo | null {
  if (typeof json !== "object" || json === null) return null;
  const r = json as { tag_name?: unknown; html_url?: unknown; body?: unknown; assets?: unknown };
  const version = typeof r.tag_name === "string" ? r.tag_name.replace(/^v/i, "") : "";
  if (!version) return null;
  const want = assetName(platform, arch);
  const assets = Array.isArray(r.assets) ? r.assets as { name?: unknown; browser_download_url?: unknown; size?: unknown }[] : [];
  const a = assets.find(x => x.name === want);
  const url = a && typeof a.browser_download_url === "string" && a.browser_download_url.startsWith("https://") ? a.browser_download_url : null;
  const notes = typeof r.body === "string" ? r.body.split(/\r?\n/).map(l => l.trim()).filter(Boolean).slice(0, 6).join("\n").slice(0, 600) : "";
  return {
    version, url, asset: want, size: a && typeof a.size === "number" ? a.size : 0,
    page: typeof r.html_url === "string" && r.html_url.startsWith("https://github.com/") ? r.html_url : RELEASES_PAGE, notes,
  };
}
