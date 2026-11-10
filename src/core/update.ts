// Updates: Wie bei LJ-Link fragt der Hauptprozess GitHub nach der neuesten Veröffentlichung, lädt das passende
// Installationspaket und ersetzt die App. Hier liegt nur, was sich ohne Netz und Dateisystem prüfen lässt.

/** Öffentliches Repo mit den Veröffentlichungen und Installern (der Quellcode liegt in skyplayser/VJ-LInk-dev). */
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
  /** SHA-256 des Pakets laut GitHub (Feld „digest“ des Assets), klein geschrieben; null = unbekannt. */
  sha256: string | null;
  /** Signierte Prüfsummenliste (SHA256SUMS und SHA256SUMS.sig), falls in der Veröffentlichung vorhanden. */
  sumsUrl: string | null;
  sigUrl: string | null;
}

/**
 * Öffentlicher Ed25519-Schlüssel (PEM, SPKI) für SHA256SUMS.sig. Leer = noch kein Schlüssel: Dann prüft der Updater nur
 * die SHA-256 von GitHub. Ist er gesetzt, installiert der Updater nur mit gültiger Signatur, sonst öffnet er die Seite.
 * Schlüssel erzeugen und Veröffentlichungen signieren: scripts/sign-release.sh.
 */
export const UPDATE_PUBLIC_KEY = "";

/** „sha256:<64 Hex>“ → Hex klein; alles andere → null. */
export function parseDigest(d: unknown): string | null {
  if (typeof d !== "string") return null;
  const m = /^sha256:([0-9a-f]{64})$/i.exec(d.trim());
  return m ? m[1]!.toLowerCase() : null;
}

/** SHA256SUMS (Zeilen „<hex>  <datei>“, wie sha256sum/shasum) → Datei → Hex. */
export function parseSums(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const m = /^([0-9a-f]{64}) [ *]?(.+)$/i.exec(line.trim());
    if (m) out.set(m[2]!.trim(), m[1]!.toLowerCase());
  }
  return out;
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
  const assets = Array.isArray(r.assets) ? r.assets as { name?: unknown; browser_download_url?: unknown; size?: unknown; digest?: unknown }[] : [];
  const link = (x: { browser_download_url?: unknown } | undefined) => (x && typeof x.browser_download_url === "string" && x.browser_download_url.startsWith("https://") ? x.browser_download_url : null);
  const a = assets.find(x => x.name === want);
  const url = link(a);
  const notes = typeof r.body === "string" ? r.body.split(/\r?\n/).map(l => l.trim()).filter(Boolean).slice(0, 6).join("\n").slice(0, 600) : "";
  return {
    version, url, asset: want, size: a && typeof a.size === "number" ? a.size : 0,
    page: typeof r.html_url === "string" && r.html_url.startsWith("https://github.com/") ? r.html_url : RELEASES_PAGE, notes,
    sha256: parseDigest(a?.digest),
    sumsUrl: link(assets.find(x => x.name === "SHA256SUMS")), sigUrl: link(assets.find(x => x.name === "SHA256SUMS.sig")),
  };
}
