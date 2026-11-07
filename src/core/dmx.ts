// DMX-Belegung „Standard“ (68 Kanäle) laut Konzept. Das Pult sendet, VJ-Link liest.
import { READY_GENERATORS } from "./effects";
import {
  BLEND_MODES, COLOR_SOURCES, LAYER_COUNT, clamp01, type Scene, type ShowState,
} from "./show";

export const DMX_MODE_STANDARD_CHANNELS = 70;
export const CH = {
  master: 1, strobe: 2, scene: 3, transition: 4, tempoFactor: 5, fxMaster: 6, autoVj: 7, blackout: 8,
  slotBase: 9, layerBase: 29, layerSize: 10,
  /** Nach den vier Ebenen (29–68). */
  strobeIntensity: 69, strobeSync: 70,
} as const;
/** Offsets innerhalb einer Ebene. */
export const LAYER_CH = { opacity: 0, bank: 1, clip: 2, color: 3, speed: 4, fx1: 5, fx2: 6, fx3: 7, strobe: 8, blend: 9 } as const;

export const TRANSITION_BEATS = [0, 0.25, 0.5, 1, 2, 4, 8] as const;
export const TEMPO_FACTORS = [0.25, 0.5, 1, 2, 4] as const;

/** Wert 0–255 gleichmäßig auf `n` Stufen verteilen. */
export const stepOf = (v: number, n: number): number => Math.min(n - 1, Math.floor((v / 256) * n));

/** Clip-Nummer 1–64 in Bank 1 → Generator. Weitere Bänke folgen mit den Bibliotheken. */
export function resolveClip(bank: number, clip: number): string | null {
  if (clip === 0) return null;
  if (bank !== 1) return null;
  return READY_GENERATORS[clip - 1]?.id ?? null;
}

export interface DmxEffects {
  /** Szene 1–255 soll abgerufen werden (Aufrufer nutzt recallScene). */
  scene?: number;
  tempoFactor?: number;
}

/**
 * Liest DMX-Frames und wendet nur die Kanäle an, die sich geändert haben.
 * So gewinnt immer die zuletzt bediente Stelle (Pult oder Oberfläche).
 */
export class DmxDecoder {
  private prev = new Uint8Array(512);
  private first = true;
  private bank = new Map<number, number>();
  /** Rohwerte je Slot: [Dimmer, R, G, B], jeweils 0–1. Dimmer startet auf 1. */
  private slotRaw: number[][] = Array.from({ length: 5 }, () => [1, 1, 1, 1]);
  constructor(public startAddress = 1, public scenes: readonly Scene[] = []) {}

  decode(frame: Uint8Array, state: ShowState): DmxEffects {
    const out: DmxEffects = {};
    const base = this.startAddress - 1;
    for (let rel = 1; rel <= DMX_MODE_STANDARD_CHANNELS; rel++) {
      const idx = base + rel - 1;
      if (idx >= frame.length) break;
      const v = frame[idx]!;
      if (rel === CH.scene) continue; // Szene zuletzt, damit sie nicht von Ebenenkanälen überschrieben wird
      const isSlot = rel >= CH.slotBase && rel < CH.layerBase; // 0 ist bei Farben eine echte Aussage
      if (this.first ? v === 0 && !isSlot : this.prev[idx] === v) continue; // erstes Bild: nur gesetzte Kanäle
      this.apply(rel, v, state, out);
    }
    const sceneIdx = base + CH.scene - 1;
    const sceneV = frame[sceneIdx] ?? 0;
    if (sceneV > 0 && (this.first || this.prev[sceneIdx] !== sceneV)) this.apply(CH.scene, sceneV, state, out);
    this.prev.set(frame.subarray(0, Math.min(512, frame.length)));
    this.first = false;
    return out;
  }

  private apply(rel: number, v: number, s: ShowState, out: DmxEffects): void {
    const f = v / 255;
    switch (rel) {
      case CH.master: s.master = f; return;
      case CH.strobe: // 0–7 aus, 8–255 Geschwindigkeit langsam bis schnell
        s.strobe.on = v >= 8; if (v >= 8) s.strobe.speed = (v - 8) / 247; return;
      case CH.strobeIntensity: s.strobe.intensity = f; return;
      case CH.strobeSync: s.strobe.sync = v < 128; return; // 0–127 im Takt, 128–255 freie Hz
      case CH.scene: // Abruf übernimmt recallScene() (mit Überblendung)
        if (v > 0 && this.scenes[v - 1]) out.scene = v;
        return;
      case CH.transition: s.transitionBeats = TRANSITION_BEATS[stepOf(v, TRANSITION_BEATS.length)]!; return;
      case CH.tempoFactor: out.tempoFactor = TEMPO_FACTORS[stepOf(v, TEMPO_FACTORS.length)]!; return;
      case CH.fxMaster: s.fxMaster = f; return;
      case CH.autoVj: s.autoVj = v >= 128; return;
      case CH.blackout: s.blackout = v >= 250; return;
    }
    if (rel >= CH.slotBase && rel < CH.layerBase) {
      const slot = Math.floor((rel - CH.slotBase) / 4), c = (rel - CH.slotBase) % 4;
      const raw = this.slotRaw[slot]; if (!raw) return;
      raw[c] = f;
      // Kanal 0 ist der Dimmer; das Ergebnis ist die tatsächlich sichtbare Farbe.
      s.slots[slot] = [raw[1]! * raw[0]!, raw[2]! * raw[0]!, raw[3]! * raw[0]!];
      return;
    }
    if (rel >= CH.layerBase) {
      const li = Math.floor((rel - CH.layerBase) / CH.layerSize);
      const off = (rel - CH.layerBase) % CH.layerSize;
      const l = s.layers[li]; if (!l || li >= LAYER_COUNT) return;
      switch (off) {
        case LAYER_CH.opacity: l.opacity = f; break;
        case LAYER_CH.bank: this.bank.set(li, Math.max(1, v)); break;
        case LAYER_CH.clip: l.clip = resolveClip(this.bank.get(li) ?? 1, v); break;
        case LAYER_CH.color: l.colorSource = COLOR_SOURCES[stepOf(v, COLOR_SOURCES.length)]!; break;
        case LAYER_CH.speed: l.speed = v === 0 ? -1 : v < 64 ? 0 : v < 96 ? 0.5 : v < 160 ? 1 : 2; break;
        case LAYER_CH.fx1: case LAYER_CH.fx2: case LAYER_CH.fx3: {
          const slot = l.effects[off - LAYER_CH.fx1]; if (slot) slot.amount = clamp01(f); break;
        }
        case LAYER_CH.strobe: l.strobe = v < 8 ? 0 : 1 + Math.round((1 - f) * 7); break;
        case LAYER_CH.blend: l.blend = BLEND_MODES[stepOf(v, BLEND_MODES.length)]!; break;
      }
    }
  }
}

/** Kanalliste für Pult-Bediener (CSV). */
export function channelListCsv(startAddress = 1): string {
  const rows: [number, string][] = [
    [CH.master, "Master-Dimmer"], [CH.strobe, "Strobe Geschwindigkeit (0-7 aus)"], [CH.scene, "Szene"], [CH.transition, "Übergang"],
    [CH.tempoFactor, "Tempo-Faktor"], [CH.fxMaster, "Effekt-Intensität gesamt"], [CH.autoVj, "Auto-VJ"], [CH.blackout, "Blackout (250-255)"],
  ];
  ["A", "B", "C", "D", "E"].forEach((n, i) => {
    ["Dimmer", "Rot", "Grün", "Blau"].forEach((c, j) => rows.push([CH.slotBase + i * 4 + j, `Slot ${n} ${c}`]));
  });
  const names = ["Deckkraft", "Clip-Bank", "Clip", "Farbquelle", "Geschwindigkeit", "Effekt 1", "Effekt 2", "Effekt 3", "Strobe", "Mischmodus"];
  rows.push([CH.strobeIntensity, "Strobe Intensität"], [CH.strobeSync, "Strobe Modus (0-127 Takt, 128-255 Hz)"]);
  for (let l = 0; l < LAYER_COUNT; l++) names.forEach((n, j) => rows.push([CH.layerBase + l * CH.layerSize + j, `Ebene ${l + 1} ${n}`]));
  return "Kanal;Funktion\n" + rows.map(([ch, n]) => `${startAddress + ch - 1};${n}`).join("\n") + "\n";
}
