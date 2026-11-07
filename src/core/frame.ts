// Was die Oberfläche an die Ausgänge schickt: Show-Zustand plus Takt-Ursprung.
import type { ShowState } from "./show";
import type { MediaPayload } from "./media";

export interface Frame {
  show: ShowState;
  bpm: number;
  originMs: number;
  beatAtOrigin: number;
  testPattern: boolean;
}

export const frameBeat = (f: Frame, nowMs: number): number =>
  f.beatAtOrigin + ((nowMs - f.originMs) / 60000) * f.bpm;

// Nachrichten Main → Oberfläche
export type ControlEvent =
  | { type: "dmx"; source: "artnet" | "sacn"; universe: number; data: Uint8Array }
  | { type: "osc"; address: string; args: (number | string | boolean | null)[] }
  | { type: "lj"; raw: string }
  | { type: "lj-connection"; clients: number }
  | { type: "status"; status: NetStatus };

export interface NetStatus {
  artnet: { listening: boolean; packets: number; lastFrom?: string; error?: string };
  sacn: { listening: boolean; packets: number; error?: string };
  osc: { listening: boolean; port: number; packets: number; error?: string };
  lj: { listening: boolean; port: number; clients: number; error?: string };
}

export interface DisplayInfo {
  id: number;
  label: string;
  width: number;
  height: number;
  scaleFactor: number;
  primary: boolean;
  open: boolean;
}

export interface NetConfig { sacnUniverse: number }

export type MediaEvent = { type: "add"; item: MediaPayload } | { type: "remove"; id: string };

export interface ProjectLoad { project: string | null; media: MediaPayload[] }

/** Brücke, die das Preload-Skript im Fenster bereitstellt. */
export interface VjBridge {
  onControl(cb: (e: ControlEvent) => void): void;
  publishFrame(f: Frame): void;
  onFrame(cb: (f: Frame) => void): void;
  listDisplays(): Promise<DisplayInfo[]>;
  toggleOutput(displayId: number): Promise<DisplayInfo[]>;
  configure(c: NetConfig): void;
  /** Grafik in der Bibliothek ablegen (wird gespeichert und an alle Ausgänge verteilt). */
  addMedia(p: MediaPayload): void;
  removeMedia(id: string): void;
  /** Für Ausgangsfenster: Grafiken kommen dazu oder fallen weg. */
  onMedia(cb: (e: MediaEvent) => void): void;
  saveProject(json: string): void;
  loadProject(): Promise<ProjectLoad>;
  platform: string;
}
