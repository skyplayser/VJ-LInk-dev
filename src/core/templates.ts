// Fertige Belegungen für gängige MIDI-Controller. Laden ersetzt die MIDI-Zuweisungen.
// Hinweis: Die Notennummern stammen aus den Herstellerangaben; an echten Geräten noch nicht getestet.
import type { LedSpec, MapInput, Mapping } from "./mapping";
import { READY_GENERATORS } from "./effects";

export interface TemplateEntry { target: string; input: MapInput; led?: LedSpec; button?: boolean }

export interface ControllerTemplate {
  id: string;
  name: string;
  /** Erkennt das Gerät am Namen. */
  match: RegExp;
  info: string;
  entries(): TemplateEntry[];
}

const note = (num: number, ch = 1): MapInput => ({ p: "midi", type: "note", ch, num });
const cc = (num: number, ch = 1): MapInput => ({ p: "midi", type: "cc", ch, num });
const clipId = (col: number): string | undefined => READY_GENERATORS[col]?.id;

/** Gemeinsames Grundmuster für 8 × 8 Raster: Zeile = Ebene, Spalte = Clip. */
function gridClips(noteOf: (row: number, col: number) => number, led: LedSpec): TemplateEntry[] {
  const out: TemplateEntry[] = [];
  for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
    const clip = clipId(col);
    if (clip) out.push({ target: `clip.${row + 1}.${clip}`, input: note(noteOf(row, col)), led });
  }
  return out;
}

const BOTTOM_ROW = ["blackout", "strobe.on", "strobe.flash", "strobe.sync", "tempo.tap", "scene.prev", "scene.next", "scene.auto"];
const FADERS = ["layer.1.opacity", "layer.2.opacity", "layer.3.opacity", "layer.4.opacity", "strobe.speed", "strobe.intensity", "fx.master", "transition.beats"];

export const TEMPLATES: readonly ControllerTemplate[] = [
  {
    id: "apc-mini-mk2", name: "Akai APC mini mk2", match: /apc\s*mini\s*mk\s*2/i,
    info: "Raster: Zeile 1 (unten) bis 8 = Ebene 1–8, Spalten = die 8 Generatoren (grün = läuft). Rechte Tasten = Szene 1–8. Untere Tasten: Blackout, Strobe, Flash, Takt, Tap, Zurück, Weiter, Auto. Fader 1–8: Ebene 1–4, Strobe-Speed, -Intensität, Effekte, Blende. Fader 9 = Master.",
    entries: () => [
      // Pads: Farbe über Velocity, Kanal 7 = volle Helligkeit; 21 grün, 1 dunkelgrau
      ...gridClips((r, c) => r * 8 + c, { on: 21, off: 1, ch: 7 }),
      ...Array.from({ length: 8 }, (_, i) => ({ target: `scene.${i + 1}`, input: note(112 + i), led: { on: 1, off: 0 } })),
      ...BOTTOM_ROW.map((t, i) => ({ target: t, input: note(100 + i), led: { on: 1, off: 0 } })),
      ...FADERS.map((t, i) => ({ target: t, input: cc(48 + i) })),
      { target: "master", input: cc(56) },
    ],
  },
  {
    id: "apc-mini", name: "Akai APC mini (mk1)", match: /apc\s*mini(?!\s*mk\s*2)/i,
    info: "Wie APC mini mk2: Raster = Ebene × Clip (grün = läuft), rechte Tasten = Szene 1–8, untere Tasten = Blackout, Strobe, Flash, Takt, Tap, Zurück, Weiter, Auto, Fader 1–8 + Master.",
    entries: () => [
      ...gridClips((r, c) => r * 8 + c, { on: 1, off: 0 }),
      ...Array.from({ length: 8 }, (_, i) => ({ target: `scene.${i + 1}`, input: note(82 + i), led: { on: 1, off: 0 } })),
      ...BOTTOM_ROW.map((t, i) => ({ target: t, input: note(64 + i), led: { on: 1, off: 0 } })),
      ...FADERS.map((t, i) => ({ target: t, input: cc(48 + i) })),
      { target: "master", input: cc(56) },
    ],
  },
  {
    id: "nanokontrol2", name: "Korg nanoKONTROL2", match: /nanokontrol\s*2/i,
    info: "Fader 1–4 = Ebene 1–4, 5 Strobe-Speed, 6 Intensität, 7 Effekte, 8 Master. Drehregler 1–4 = Effekt 1 der Ebene, 5–8 = Farbton Slot A–D. S = Szene 1–8, M1–4 = Clip aus, M5–8 = Strobe, Flash, Takt, Blackout, R = Clips von Ebene 2. Track ‹ › = Szene zurück/weiter, Cycle = Tap, Play = Auto. LEDs nur mit „LED Mode: External“ im Korg Kontrol Editor.",
    entries: () => {
      const led = { on: 127, off: 0 };
      const out: TemplateEntry[] = [
        ...["layer.1.opacity", "layer.2.opacity", "layer.3.opacity", "layer.4.opacity", "strobe.speed", "strobe.intensity", "fx.master", "master"]
          .map((t, i) => ({ target: t, input: cc(i) })),
        ...["layer.1.fx.1", "layer.2.fx.1", "layer.3.fx.1", "layer.4.fx.1", "slot.A.hue", "slot.B.hue", "slot.C.hue", "slot.D.hue"]
          .map((t, i) => ({ target: t, input: cc(16 + i) })),
        ...Array.from({ length: 8 }, (_, i) => ({ target: `scene.${i + 1}`, input: cc(32 + i), led, button: true })),
        ...["layer.1.clear", "layer.2.clear", "layer.3.clear", "layer.4.clear", "strobe.on", "strobe.flash", "strobe.sync", "blackout"]
          .map((t, i) => ({ target: t, input: cc(48 + i), led, button: true })),
        { target: "scene.prev", input: cc(58), button: true },
        { target: "scene.next", input: cc(59), button: true },
        { target: "tempo.tap", input: cc(46), led, button: true },
        { target: "scene.auto", input: cc(41), led, button: true },
      ];
      for (let col = 0; col < 8; col++) {
        const clip = clipId(col);
        if (clip) out.push({ target: `clip.2.${clip}`, input: cc(64 + col), led, button: true });
      }
      return out;
    },
  },
];

/** Passende Vorlage zu einem Gerätenamen. */
export const templateFor = (device: string): ControllerTemplate | undefined => TEMPLATES.find(t => t.match.test(device));

/** Vorlage für ein Gerät in Zuweisungen umwandeln. */
export function buildTemplate(t: ControllerTemplate, device: string): Omit<Mapping, "id">[] {
  return t.entries().map(e => ({ ...e, device }));
}

// ---- Export / Import -----------------------------------------------------------------

export interface MappingFile { app: "VJ-Link"; kind: "mappings"; version: 1; mappings: Mapping[] }

export const exportMappings = (list: readonly Mapping[]): string =>
  JSON.stringify({ app: "VJ-Link", kind: "mappings", version: 1, mappings: [...list] } satisfies MappingFile, null, 2);
