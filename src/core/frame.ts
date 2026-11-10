// Was die Oberfläche an die Ausgänge schickt: Show-Zustand plus Takt-Ursprung.
import type { LayerClockSnap, ShowState } from "./show";
import type { MediaPayload } from "./media";
import type { Tc, TcFps } from "./timecode";
import type { OutputLayout } from "./layout";

export interface Frame {
  show: ShowState;
  bpm: number;
  originMs: number;
  beatAtOrigin: number;
  testPattern: boolean;
  /** Länge der Videos (Sekunden), damit Ausgänge Loops gleich rechnen. */
  videoDurations?: Record<string, number>;
  /** Anordnung der Ausgänge (Gleiches Bild oder Leinwand) und welche Bildschirme offen sind. */
  layout?: OutputLayout;
  openOutputs?: number[];
  /** Gemeinsame Animationszeit der Ebenen (vom Hauptfenster). */
  layerClock?: LayerClockSnap;
}

export const frameBeat = (f: Frame, nowMs: number): number =>
  f.beatAtOrigin + ((nowMs - f.originMs) / 60000) * f.bpm;

// Nachrichten Main → Oberfläche
export type ControlEvent =
  | { type: "dmx"; source: "artnet" | "sacn"; universe: number; data: Uint8Array }
  | { type: "osc"; address: string; args: (number | string | boolean | null)[]; tags?: string }
  | { type: "lj"; raw: string }
  | { type: "lj-connection"; clients: number }
  | { type: "status"; status: NetStatus }
  | { type: "link"; connected: boolean; peers: number; bpm: number; beat: number }
  | { type: "timecode"; source: "artnet"; tc: Tc; fps: TcFps; from: string };

export interface NetStatus {
  artnet: { listening: boolean; packets: number; lastFrom?: string; error?: string };
  sacn: { listening: boolean; packets: number; error?: string };
  osc: { listening: boolean; port: number; packets: number; error?: string };
  lj: { listening: boolean; port: number; clients: number; error?: string;
    /** LJ-Link PRO: VJ-Link verbindet sich selbst (Rechner, verbunden). */
    pro?: { host: string; connected: boolean; native?: boolean;
      /** Automatisch gesucht (keine feste Adresse) und per Bonjour gefundene LJ-Links. */
      auto?: boolean; found?: string[] } };
}

export interface DisplayInfo {
  id: number;
  label: string;
  width: number;
  height: number;
  scaleFactor: number;
  primary: boolean;
  open: boolean;
  /** Fenster-Ausgang: normales Fenster statt Vollbild, zum Abgreifen mit OBS, Resolume, NDI-/Syphon-Werkzeugen usw. */
  window?: boolean;
}

/** Kennung des Fenster-Ausgangs (kein echter Bildschirm). */
export const WINDOW_OUTPUT = -1;
/** Wählbare Größen des Fenster-Ausgangs (Pixel). */
export const WINDOW_SIZES: [number, number][] = [[1280, 720], [1920, 1080], [2560, 1440], [3840, 2160], [1080, 1920], [1024, 768], [1920, 1200]];

export interface NetConfig {
  sacnUniverse: number;
  /** Rechner mit LJ-Link PRO (IP oder Name); leer = dieser Rechner. */
  ljHost?: string;
}

export type MediaEvent = { type: "add"; item: MediaPayload } | { type: "remove"; id: string }
  /** Rohdaten als Textur (RGBA8, w×h), z. B. die DJ-Wellenform. */
  | { type: "raw"; id: string; w: number; h: number; data: Uint8Array };

/** Status von VJ-Link für LJ-Link (gemeinsamer Status). */
export interface VjStatus {
  t: "vj"; app: "VJ-Link"; version: string; scene: string; sceneIndex: number; blackout: boolean;
  master: number; bpm: number; bpmSource: string; outputs: number; nowPlaying: boolean;
}

export interface ProjectLoad {
  project: string | null; media: MediaPayload[];
  /** Geöffnete Projektdatei (null = unbenannt), Vergleichsstand, gerade geladen, zuletzt geöffnet. */
  file?: { path: string; name: string } | null; savedHash?: string | null; fresh?: boolean; recent?: string[];
}
export type ProjectFileCmd = "new" | "open" | "save" | "saveAs" | "openPath";

/** Brücke, die das Preload-Skript im Fenster bereitstellt. */
export interface VjBridge {
  onControl(cb: (e: ControlEvent) => void): void;
  publishFrame(f: Frame): void;
  /** Grafikkarte hat den WebGL-Kontext verloren: Hauptprozess öffnet das Fenster neu. */
  gpuLost?(): void;
  onFrame(cb: (f: Frame) => void): void;
  listDisplays(): Promise<DisplayInfo[]>;
  toggleOutput(displayId: number): Promise<DisplayInfo[]>;
  /** Größe des Fenster-Ausgangs in Pixeln festlegen (öffnet ihn nicht). */
  windowOutputSize(w: number, h: number): Promise<DisplayInfo[]>;
  configure(c: NetConfig): void;
  /** Grafik in der Bibliothek ablegen (wird gespeichert und an alle Ausgänge verteilt). */
  addMedia(p: MediaPayload): void;
  removeMedia(id: string): void;
  /** Für Ausgangsfenster: Grafiken kommen dazu oder fallen weg. */
  onMedia(cb: (e: MediaEvent) => void): void;
  saveProject(json: string): void;
  /** Bildschirme oder Ausgänge haben sich geändert. */
  onDisplays(cb: (d: DisplayInfo[]) => void): void;
  /** Größe der Oberfläche: „auto“ passt sie dem Fenster an, sonst fester Faktor (1 = 100 %). */
  setUiScale(v: "auto" | number): void;
  /** Pfad einer gezogenen bzw. gewählten Datei (nur in der App). */
  pathForFile(f: File): string;
  /** Video in die Bibliothek kopieren. Gibt ID und Endung oder eine Fehlermeldung zurück. */
  addVideo(path: string, name: string): Promise<{ id: string; ext: string; name: string } | string>;
  removeVideo(id: string): void;
  /** Art-Net-Timecode senden (19-Byte-Paket an IP oder Broadcast). */
  sendArtTimecode(bytes: Uint8Array, host: string): void;
  /** Mikrofon-Zugriff beim System anfragen (macOS). */
  askMicrophone(): Promise<boolean>;
  /** Kamera-Zugriff beim System anfragen (macOS). */
  askCamera(): Promise<boolean>;
  /** macOS: Systemeinstellungen → Datenschutz → Kamera bzw. Mikrofon öffnen. */
  openPrivacy(kind: "camera" | "microphone"): void;
  loadProject(): Promise<ProjectLoad>;
  /** Projektdatei: neu, öffnen, speichern, speichern unter (fragt bei ungespeicherten Änderungen nach). */
  projectFile(cmd: ProjectFileCmd, json: string, filePath?: string): Promise<{ ok: boolean; name?: string; message?: string }>;
  projectDirty(dirty: boolean): void;
  projectBaseline(hash: string): void;
  /** Zuletzt geöffnete Projekte mit Datum; fehlende Dateien sind markiert. */
  projectRecent(): Promise<RecentProject[]>;
  /** Liste „Zuletzt geöffnet“ leeren. */
  clearRecent(): Promise<void>;
  /** Befehle aus dem App-Menü (Ablage, Einstellungen). */
  onMenu(cb: (cmd: string, arg?: string) => void): void;
  platform: string;
  /** Live-Grafik an alle Ausgänge (wird nicht gespeichert), z. B. die Now-Playing-Bauchbinde. */
  liveMedia(e: MediaEvent): void;
  /** Datei von LJ-Link holen (Cover, Wellenform); null, wenn nicht verbunden oder nicht vorhanden. */
  ljFetch(path: string): Promise<{ type: string; data: Uint8Array } | null>;
  /** Status an LJ-Link melden (nur über den eigenen Endpunkt /vjlink). */
  ljStatus(s: VjStatus): void;
  /** Weboberfläche von LJ-Link im Browser öffnen. */
  /** Updates: prüfen (force = Stunden-Puffer übergehen), laden und installieren, Zustand mitlesen. */
  updateCheck(force?: boolean): Promise<import("./update").UpdateState | null>;
  updateInstall(): Promise<import("./update").UpdateState | null>;
  onUpdate(cb: (s: import("./update").UpdateState) => void): void;
  /** Bekannte Seite im Browser öffnen (Instagram, GitHub). */
  openWeb(url: string): void;
  /** Lizenzen und Hinweise (THIRD_PARTY_LICENSES.txt) öffnen. */
  openLicenses(): void;
  openLj(): void;
  /** Sprache der Oberfläche an den Hauptprozess (Menü, Dialoge); reload = Oberfläche danach neu laden (Sprachwechsel). */
  setLang(lang: string, reload?: boolean): void;
}

export interface RecentProject { path: string; name: string; folder: string; exists: boolean; modified: number }
