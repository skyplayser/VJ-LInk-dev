// Zuweisungen (Mapping): Tastatur, MIDI, DMX/Art-Net und OSC auf Bedienelemente.
// Ablauf wie bei Daslight: Mapping-Art wählen, Element anklicken, Taste/Regler/Kanal bewegen.
import type { ControlContext } from "./control";
import { resolveControl } from "./controls";

export type MapProtocol = "key" | "midi" | "dmx" | "osc";

export type MapInput =
  | { p: "key"; code: string; label: string }
  | { p: "midi"; type: "cc" | "note"; ch: number; num: number }
  | { p: "dmx"; universe: number; channel: number }
  | { p: "osc"; address: string };

export interface Mapping { id: string; target: string; input: MapInput }

export const PROTOCOL_LABEL: Record<MapProtocol, string> = {
  key: "Tastatur", midi: "MIDI", dmx: "DMX / Art-Net", osc: "OSC",
};

/** Eindeutiger Schlüssel eines Eingangs (zum Nachschlagen). */
export function inputKey(i: MapInput): string {
  switch (i.p) {
    case "key": return `key:${i.code}`;
    case "midi": return `midi:${i.type}:${i.ch}:${i.num}`;
    case "dmx": return `dmx:${i.universe}:${i.channel}`;
    case "osc": return `osc:${i.address}`;
  }
}

const NOTE = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "H"];
export function describeInput(i: MapInput): string {
  switch (i.p) {
    case "key": return `Taste ${i.label}`;
    case "midi": return i.type === "cc"
      ? `Kanal ${i.ch} · CC ${i.num}`
      : `Kanal ${i.ch} · Note ${NOTE[i.num % 12]}${Math.floor(i.num / 12) - 1} (${i.num})`;
    case "dmx": return `Universe ${i.universe} · Kanal ${i.channel}`;
    case "osc": return i.address;
  }
}

/** Tasten, MIDI-Noten und OSC-Taster wechseln Schalter bei jedem Druck; Regler setzen ihn direkt. */
const isButtonLike = (i: MapInput): boolean => i.p === "key" || (i.p === "midi" && i.type === "note");

export class MappingTable {
  list: Mapping[] = [];
  private byInput = new Map<string, Mapping>();
  private last = new Map<string, number>();

  constructor(list: Mapping[] = []) { this.replace(list); }

  replace(list: Mapping[]): void {
    this.list = [];
    this.byInput.clear();
    for (const m of list) this.add(m.target, m.input, m.id);
  }

  /** Neue Zuweisung. Ein Eingang hat genau ein Ziel: eine alte Zuweisung desselben Eingangs fällt weg. */
  add(target: string, input: MapInput, id = newId()): Mapping {
    const key = inputKey(input);
    const old = this.byInput.get(key);
    if (old) this.list = this.list.filter(m => m !== old);
    const m: Mapping = { id, target, input };
    this.list.push(m);
    this.byInput.set(key, m);
    return m;
  }

  remove(id: string): void {
    const m = this.list.find(x => x.id === id);
    if (!m) return;
    this.list = this.list.filter(x => x !== m);
    this.byInput.delete(inputKey(m.input));
  }

  clear(protocol: MapProtocol): void { this.replace(this.list.filter(m => m.input.p !== protocol)); }

  find(input: MapInput): Mapping | undefined { return this.byInput.get(inputKey(input)); }
  forTarget(target: string): Mapping[] { return this.list.filter(m => m.target === target); }
  ofProtocol(p: MapProtocol): Mapping[] { return this.list.filter(m => m.input.p === p); }

  /**
   * Eingangswert (0–1) weitergeben. Gibt true zurück, wenn eine Zuweisung existiert.
   * `raw` ist der unveränderte Wert (für BPM per OSC, z. B. 128).
   */
  dispatch(c: ControlContext, input: MapInput, value: number, raw?: number): boolean {
    const m = this.find(input);
    if (!m) return false;
    const def = resolveControl(m.target);
    if (!def) return true;
    if (m.target === "tempo.bpm" && raw !== undefined && raw >= 20) {
      c.tempo.update("osc", raw, Date.now());
      return true;
    }
    const v = Math.max(0, Math.min(1, value));
    const prev = this.last.get(m.id) ?? 0;
    this.last.set(m.id, v);
    const rising = v >= 0.5 && prev < 0.5, falling = v < 0.5 && prev >= 0.5;
    switch (def.kind) {
      case "fader": def.set(c, v); break;
      case "trigger": if (rising) def.set(c, 1); break;
      case "hold": if (rising) def.set(c, 1); else if (falling) def.set(c, 0); break;
      case "toggle":
        if (isButtonLike(m.input)) { if (rising) def.set(c, def.get(c) >= 0.5 ? 0 : 1); }
        else if (rising) def.set(c, 1); else if (falling) def.set(c, 0);
        break;
    }
    return true;
  }
}

function newId(): string { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }

/** Tastenbelegung beim ersten Start. */
export function defaultKeyMappings(): Mapping[] {
  const t = new MappingTable();
  for (let i = 1; i <= 9; i++) t.add(`scene.${i}`, { p: "key", code: `Digit${i}`, label: String(i) });
  t.add("scene.next", { p: "key", code: "ArrowRight", label: "→" });
  t.add("scene.prev", { p: "key", code: "ArrowLeft", label: "←" });
  t.add("blackout", { p: "key", code: "KeyB", label: "B" });
  t.add("strobe.flash", { p: "key", code: "KeyF", label: "F" });
  t.add("strobe.on", { p: "key", code: "KeyS", label: "S" });
  t.add("tempo.tap", { p: "key", code: "KeyT", label: "T" });
  return t.list;
}

// ---- Eingänge lesen ------------------------------------------------------------------

/** MIDI-Nachricht in Eingang und Wert (0–1) zerlegen. Nur Noten und Controller. */
export function parseMidi(data: ArrayLike<number>): { input: MapInput; value: number } | null {
  if (data.length < 3) return null;
  const status = data[0]! & 0xf0, ch = (data[0]! & 0x0f) + 1, num = data[1]! & 0x7f, val = data[2]! & 0x7f;
  if (status === 0xb0) return { input: { p: "midi", type: "cc", ch, num }, value: val / 127 };
  if (status === 0x90) return { input: { p: "midi", type: "note", ch, num }, value: val > 0 ? 1 : 0 };
  if (status === 0x80) return { input: { p: "midi", type: "note", ch, num }, value: 0 };
  return null;
}

/** OSC-Wert normalisieren: 0–1 bleibt, 0–127 (MIDI-artig) und 0–255 (DMX-artig) werden umgerechnet. */
export function oscValue(arg: unknown): number {
  const v = typeof arg === "number" ? arg : typeof arg === "boolean" ? (arg ? 1 : 0) : 1;
  if (v <= 1) return Math.max(0, v);
  if (v <= 127) return v / 127;
  return Math.min(1, v / 255);
}

/** Lernen per DMX: der Kanal, der sich seit dem Start am stärksten bewegt hat (mind. 20 Stufen). */
export class DmxLearner {
  private base = new Map<number, Uint8Array>();
  feed(universe: number, data: Uint8Array): { universe: number; channel: number } | null {
    const b = this.base.get(universe);
    if (!b) { this.base.set(universe, data.slice()); return null; }
    let best = -1, bestDiff = 19;
    for (let i = 0; i < data.length && i < b.length; i++) {
      const d = Math.abs(data[i]! - b[i]!);
      if (d > bestDiff) { bestDiff = d; best = i; }
    }
    return best >= 0 ? { universe, channel: best + 1 } : null;
  }
  reset(): void { this.base.clear(); }
}

/** Gespeicherte Zuweisungen prüfen (aus der Projektdatei). */
export function parseMappings(v: unknown): Mapping[] | null {
  if (!Array.isArray(v)) return null;
  const out: Mapping[] = [];
  for (const m of v) {
    if (typeof m !== "object" || m === null) continue;
    const { id, target, input } = m as { id?: unknown; target?: unknown; input?: Record<string, unknown> };
    if (typeof id !== "string" || typeof target !== "string" || !input || target.length > 80 || !resolveControl(target)) continue;
    const n = (x: unknown, lo: number, hi: number) => typeof x === "number" && Number.isInteger(x) && x >= lo && x <= hi;
    let inp: MapInput | null = null;
    if (input.p === "key" && typeof input.code === "string" && input.code.length < 40) inp = { p: "key", code: input.code, label: String(input.label ?? input.code).slice(0, 12) };
    else if (input.p === "midi" && (input.type === "cc" || input.type === "note") && n(input.ch, 1, 16) && n(input.num, 0, 127)) inp = { p: "midi", type: input.type, ch: input.ch as number, num: input.num as number };
    else if (input.p === "dmx" && n(input.universe, 0, 63999) && n(input.channel, 1, 512)) inp = { p: "dmx", universe: input.universe as number, channel: input.channel as number };
    else if (input.p === "osc" && typeof input.address === "string" && /^\/[\x21-\x7e]{1,120}$/.test(input.address)) inp = { p: "osc", address: input.address };
    if (inp) out.push({ id: id.slice(0, 20), target, input: inp });
  }
  return out;
}
