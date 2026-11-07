import { describe, expect, it } from "vitest";
import { TempoClock } from "../src/core/tempo";
import { parseArtDmx } from "../src/core/artnet";
import { parseSacn } from "../src/core/sacn";
import { buildOsc, parseOsc } from "../src/core/osc";
import { CH, DmxDecoder, channelListCsv } from "../src/core/dmx";
import { DEFAULT_SCENES, defaultShow } from "../src/core/show";
import { EFFECTS, READY_GENERATORS } from "../src/core/effects";
import { CLUB_STANDARD_RULES, newLjState, parseLjMessage, type LjMessage } from "../src/core/ljlink";
import { handleLj, handleOsc, type ControlContext } from "../src/core/control";

function ctx(): ControlContext {
  return { show: defaultShow(), tempo: new TempoClock(), scenes: DEFAULT_SCENES, lj: newLjState(),
    rules: CLUB_STANDARD_RULES.map(r => ({ ...r })), strobeUntilBeat: 0, bank: 1 };
}

describe("Takt", () => {
  it("rechnet Beats aus BPM", () => {
    const t = new TempoClock();
    t.update("manual", 120, 0, 0);
    expect(t.beatAt(1000)).toBeCloseTo(2);
    expect(t.barPhase(2000)).toBeCloseTo(0);
  });
  it("LJ-Link schlägt Tap, Tap schlägt LJ-Link nicht", () => {
    const t = new TempoClock();
    t.update("ljlink", 128, 0, 0);
    expect(t.update("tap", 100, 100)).toBe(false);
    expect(t.bpm).toBe(128);
  });
  it("fällt nach Ausfall auf manual zurück und behält die Phase", () => {
    const t = new TempoClock();
    t.update("ljlink", 120, 0, 0);
    const before = t.beatAt(5000);
    t.tick(5000);
    expect(t.source).toBe("manual");
    expect(t.beatAt(5000)).toBeCloseTo(before);
    expect(t.beatAt(6000)).toBeCloseTo(before + 2);
  });
  it("Tap-Tempo", () => {
    const t = new TempoClock();
    t.tap(0); t.tap(500); const bpm = t.tap(1000);
    expect(bpm).toBeCloseTo(120);
  });
  it("verwirft unsinnige BPM", () => {
    expect(new TempoClock().update("osc", 5, 0)).toBe(false);
  });
});

describe("Protokolle", () => {
  it("liest ArtDMX", () => {
    const b = new Uint8Array(18 + 4);
    b.set([0x41, 0x72, 0x74, 0x2d, 0x4e, 0x65, 0x74, 0x00, 0x00, 0x50, 0, 14, 7, 0, 1, 0, 0, 4, 10, 20, 30, 40]);
    const p = parseArtDmx(b)!;
    expect(p.universe).toBe(1);
    expect(Array.from(p.data)).toEqual([10, 20, 30, 40]);
    expect(parseArtDmx(new Uint8Array(30))).toBeNull();
  });
  it("liest sACN", () => {
    const b = new Uint8Array(126 + 3);
    b.set([0x41, 0x53, 0x43, 0x2d, 0x45, 0x31, 0x2e, 0x31, 0x37], 4);
    b[108] = 100; b[113] = 0; b[114] = 5; b[123] = 0; b[124] = 4; b[125] = 0; b.set([9, 8, 7], 126);
    const p = parseSacn(b)!;
    expect(p.universe).toBe(5);
    expect(Array.from(p.data)).toEqual([9, 8, 7]);
  });
  it("OSC Roundtrip und Fehlerfälle", () => {
    const msg = parseOsc(buildOsc("/vjlink/master/dimmer", 0.5));
    expect(msg[0]!.address).toBe("/vjlink/master/dimmer");
    expect(msg[0]!.args[0]).toBeCloseTo(0.5);
    expect(parseOsc(new Uint8Array([1, 2, 3]))).toEqual([]);
    expect(parseOsc(new TextEncoder().encode("/x\0\0,i\0\0"))).toEqual([]); // fehlende Daten
  });
  it("LJ-Link-Nachrichten prüfen", () => {
    expect(parseLjMessage("kaputt")).toBeNull();
    expect(parseLjMessage('{"t":"tempo","bpm":128,"beat":4}')).not.toBeNull();
    expect(parseLjMessage('{"t":"unbekannt"}')).toBeNull();
  });
});

describe("DMX", () => {
  it("Master, Szene und Slot-Farbe", () => {
    const s = defaultShow();
    const d = new DmxDecoder(1, DEFAULT_SCENES);
    const f = new Uint8Array(512);
    f[CH.master - 1] = 128; f[CH.scene - 1] = 4;
    f[CH.slotBase - 1] = 255; f[CH.slotBase] = 255; f[CH.slotBase + 1] = 0; f[CH.slotBase + 2] = 0;
    const fx = d.decode(f, s);
    expect(s.master).toBeCloseTo(0.5, 1);
    expect(fx.scene).toBe(4);
    expect(s.layers[0]!.clip).toBe("synth-grid");
    expect(s.slots[0]).toEqual([1, 0, 0]);
  });
  it("wendet nur Änderungen an: Oberfläche bleibt wirksam", () => {
    const s = defaultShow();
    const d = new DmxDecoder(1, DEFAULT_SCENES);
    const f = new Uint8Array(512); f[0] = 255;
    d.decode(f, s);
    s.master = 0.3; // Bediener zieht am Regler
    d.decode(f, s); // Pult sendet denselben Wert weiter
    expect(s.master).toBe(0.3);
    f[0] = 200; d.decode(f, s);
    expect(s.master).toBeCloseTo(200 / 255);
  });
  it("Startadresse verschiebt die Kanäle", () => {
    const s = defaultShow(); const d = new DmxDecoder(101);
    const f = new Uint8Array(512); f[100] = 51;
    d.decode(f, s);
    expect(s.master).toBeCloseTo(0.2);
  });
  it("Blackout ab 250", () => {
    const s = defaultShow(); const d = new DmxDecoder();
    const f = new Uint8Array(512); f[CH.blackout - 1] = 252;
    d.decode(f, s);
    expect(s.blackout).toBe(true);
  });
  it("Clip über Bank und Nummer", () => {
    const s = defaultShow(); const d = new DmxDecoder();
    const f = new Uint8Array(512); const base = 29 - 1 + 10; // Ebene 2
    f[base + 1] = 1; f[base + 2] = 3;
    d.decode(f, s);
    expect(s.layers[1]!.clip).toBe(READY_GENERATORS[2]!.id);
  });
  it("Kanalliste hat 68 Zeilen", () => {
    expect(channelListCsv().trim().split("\n").length).toBe(69);
  });
});

describe("Steuerung", () => {
  it("OSC: Szene, Slot, BPM", () => {
    const c = ctx();
    expect(handleOsc(c, { address: "/vjlink/scene/go", args: [2] }, 0)).toBe(true);
    expect(c.show.scene).toBe(2);
    handleOsc(c, { address: "/vjlink/slot/b/rgb", args: [1, 0, 0.5] }, 0);
    expect(c.show.slots[1]).toEqual([1, 0, 0.5]);
    handleOsc(c, { address: "/vjlink/bpm", args: [140] }, 0);
    expect(c.tempo.bpm).toBe(140);
    expect(handleOsc(c, { address: "/fremd/x", args: [] }, 0)).toBe(false);
  });
  it("LJ-Link: Chorus ruft Szene Drop, Wellenform füllt Audio", () => {
    const c = ctx();
    handleLj(c, { t: "hello", version: 1, privacy: false }, 0);
    handleLj(c, { t: "deck", deck: { deck: 2, playing: true, onAir: true, master: true, bpm: 128 } }, 0);
    handleLj(c, { t: "event", kind: "phrase", deck: 2, phrase: "chorus" } as LjMessage, 10);
    expect(c.show.scene).toBe(4);
    handleLj(c, { t: "wave", deck: 2, bass: 0.9, mid: 0.2, high: 0.1 }, 20);
    expect(c.show.audio.bass).toBeCloseTo(0.9);
    expect(c.tempo.source).toBe("ljlink");
  });
  it("Privatsphäre-Modus entfernt Titel", () => {
    const c = ctx();
    handleLj(c, { t: "hello", version: 1, privacy: true }, 0);
    handleLj(c, { t: "deck", deck: { deck: 1, playing: true, onAir: true, master: true, bpm: 120, title: "Geheim", artist: "X" } }, 0);
    expect(c.lj.decks.get(1)!.title).toBeUndefined();
  });
});

describe("Effekt-Katalog", () => {
  it("enthält die 35 Visuals mit eindeutigen IDs", () => {
    expect(EFFECTS.length).toBe(35);
    expect(new Set(EFFECTS.map(e => e.id)).size).toBe(35);
    expect(EFFECTS.map(e => e.no)).toEqual(Array.from({ length: 35 }, (_, i) => i + 1));
  });
});
