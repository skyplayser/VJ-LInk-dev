import { scrubPaths } from "../src/core/report";
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { TempoClock } from "../src/core/tempo";
import { newCueState } from "../src/core/video";
import { parseArtDmx } from "../src/core/artnet";
import { parseSacn } from "../src/core/sacn";
import { buildOsc, parseOsc } from "../src/core/osc";
import { CH, DmxDecoder, channelListCsv } from "../src/core/dmx";
import { DEFAULT_SCENES, defaultScenes, defaultShow } from "../src/core/show";
import { CATEGORY_LABEL, EFFECTS, READY_GENERATORS } from "../src/core/effects";
import { CATEGORY_EN, EFFECT_EN, POST_EN } from "../src/core/i18n-catalog";
import { CLUB_STANDARD_RULES, newLjState, parseLjMessage, type LjMessage } from "../src/core/ljlink";
import { handleLj, handleOsc, showGo, type ControlContext } from "../src/core/control";

function ctx(): ControlContext {
  return { show: defaultShow(), tempo: new TempoClock(), scenes: defaultScenes(), lj: newLjState(),
    cues: newCueState(), rules: CLUB_STANDARD_RULES.map(r => ({ ...r })), bank: 1 };
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
    // Negative Blob-Länge darf den Parser nicht rückwärts laufen lassen (hing vorher Sekunden bis Stunden)
    const evil = Uint8Array.from(Buffer.from("2f6100002c6273008000000041414141", "hex"));
    const t0 = performance.now();
    expect(parseOsc(evil)).toEqual([]);
    const bundle = new Uint8Array(16 + 3 * 20); bundle.set(new TextEncoder().encode("#bundle\0"));
    for (let i = 0; i < 3; i++) { new DataView(bundle.buffer).setInt32(16 + i * 20, 16); bundle.set(evil, 20 + i * 20); }
    expect(parseOsc(bundle)).toEqual([]);
    expect(performance.now() - t0).toBeLessThan(50);
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
    expect(fx.scene).toBe(4); // Abruf selbst macht recallScene (mit Überblendung)
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
  it("Kanalliste hat 91 Zeilen", () => {
    expect(channelListCsv().trim().split("\n").length).toBe(92);
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
    const before = c.show.scene;
    handleLj(c, { t: "event", kind: "phrase", deck: 2, phrase: "chorus" } as LjMessage, 10);
    expect(c.show.scene).toBe(before); // ohne Auto entscheidet das Pult
    c.show.autoVj = true;
    handleLj(c, { t: "event", kind: "phrase", deck: 1, phrase: "chorus" } as LjMessage, 10);
    expect(c.show.scene).toBe(before); // nicht vom Master-Deck
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
  it("enthält Wunschliste, Laser, LJ-Link, moderne Visuals und die großen Pakete mit eindeutigen IDs", () => {
    expect(EFFECTS.length).toBe(158);
    expect(new Set(EFFECTS.map(e => e.id)).size).toBe(158);
    expect(EFFECTS.map(e => e.no)).toEqual(Array.from({ length: 158 }, (_, i) => i + 1));
    for (const c of ["minimal", "space3d", "data", "opart", "organic", "fractal", "demo", "sacred", "retro", "particles"]) expect(EFFECTS.filter(e => e.category === c).length).toBeGreaterThanOrEqual(5);
    expect(EFFECTS.filter(e => e.category === "lj").map(e => e.id)).toEqual(["now-playing", "dj-waveform"]);
    expect(EFFECTS.filter(e => e.category === "laser").length).toBe(16);
  });
});

import { CONTROLS, CONTROL_BY_ID, setControl } from "../src/core/controls";
import { STROBE_DIVISIONS, strobeGain, strobeHz } from "../src/core/audio";

describe("Strobe", () => {
  it("ohne Aktivierung bleibt das Licht an", () => {
    const s = defaultShow();
    expect(strobeGain(s.strobe, 0.7, 0)).toBe(1);
  });
  it("im Takt: Pausen sind so dunkel wie die Intensität sagt", () => {
    const s = defaultShow(); s.strobe.on = true; s.strobe.sync = true; s.strobe.speed = 0.2; // 1× pro Beat
    expect(s.strobe.speed * STROBE_DIVISIONS.length).toBeLessThan(2);
    s.strobe.intensity = 1;  expect(strobeGain(s.strobe, 0.1, 0)).toBe(1);
    expect(strobeGain(s.strobe, 0.6, 0)).toBe(0);
    s.strobe.intensity = 0.5; expect(strobeGain(s.strobe, 0.6, 0)).toBe(0.5);
    s.strobe.intensity = 0;  expect(strobeGain(s.strobe, 0.6, 0)).toBe(1);
  });
  it("frei in Hz, unabhängig vom Takt", () => {
    const s = defaultShow(); s.strobe.on = true; s.strobe.sync = false; s.strobe.speed = 0; // 1 Hz
    expect(strobeHz(s.strobe, 128)).toBeCloseTo(1);
    expect(strobeGain(s.strobe, 99, 0.1)).toBe(1);
    expect(strobeGain(s.strobe, 99, 0.6)).toBe(0);
  });
  it("Flash wirkt nur beim Halten, untilBeat läuft ab", () => {
    const s = defaultShow(); s.strobe.intensity = 1;
    s.strobe.flash = true; expect(strobeGain(s.strobe, 0.6, 0)).toBe(0);
    s.strobe.flash = false; expect(strobeGain(s.strobe, 0.6, 0)).toBe(1);
    s.strobe.untilBeat = 4; expect(strobeGain(s.strobe, 0.6, 0)).toBe(0);
    expect(strobeGain(s.strobe, 4.6, 0)).toBe(1);
  });
  it("DMX: Geschwindigkeit, Intensität und Modus", () => {
    const s = defaultShow(); const d = new DmxDecoder();
    const f = new Uint8Array(512); f[CH.strobe - 1] = 255; f[CH.strobeIntensity - 1] = 128; f[CH.strobeSync - 1] = 200;
    d.decode(f, s);
    expect(s.strobe.on).toBe(true); expect(s.strobe.speed).toBeCloseTo(1);
    expect(s.strobe.intensity).toBeCloseTo(0.5, 1); expect(s.strobe.sync).toBe(false);
    f[CH.strobe - 1] = 3; d.decode(f, s);
    expect(s.strobe.on).toBe(false);
  });
  it("Regel „Hot Cue C“ lässt den Strobe laufen", () => {
    const c = ctx();
    c.tempo.update("manual", 120, Date.now(), 0);
    handleLj(c, { t: "hello", version: 1, privacy: false }, Date.now());
    c.show.autoVj = true;
    handleLj(c, { t: "event", kind: "cue", deck: 1, cue: "C" }, Date.now());
    expect(c.show.strobe.untilBeat).toBeGreaterThan(3);
  });
});

describe("Control-Registry", () => {
  it("IDs sind eindeutig und Werte bleiben in 0–1", () => {
    expect(new Set(CONTROLS.map(x => x.id)).size).toBe(CONTROLS.length);
    const c = ctx();
    for (const def of CONTROLS) {
      if (def.kind === "trigger") continue;
      def.set(c, 7); expect(def.get(c)).toBeLessThanOrEqual(1);
      def.set(c, -3); expect(def.get(c)).toBeGreaterThanOrEqual(0);
    }
  });
  it("Fader, Schalter, Halten und Tasten", () => {
    const c = ctx();
    setControl(c, "master", 0.25); expect(c.show.master).toBe(0.25);
    setControl(c, "strobe.on", 1); expect(c.show.strobe.on).toBe(true);
    setControl(c, "strobe.on", 0); expect(c.show.strobe.on).toBe(false);
    setControl(c, "strobe.flash", 1); expect(c.show.strobe.flash).toBe(true);
    setControl(c, "strobe.flash", 0); expect(c.show.strobe.flash).toBe(false);
    setControl(c, "scene.4", 1); expect(c.show.scene).toBe(4);
    setControl(c, "scene.2", 0); expect(c.show.scene).toBe(4); // Loslassen löst nichts aus
    setControl(c, "layer.2.opacity", 0.4); expect(c.show.layers[1]!.opacity).toBe(0.4);
    setControl(c, "tempo.factor", 1); expect(c.tempo.factor).toBe(4);
    expect(setControl(c, "gibt.es.nicht", 1)).toBe(false);
    expect(CONTROL_BY_ID.get("tempo.factor")!.get(c)).toBe(1);
  });
  it("per OSC erreichbar", () => {
    const c = ctx();
    expect(handleOsc(c, { address: "/vjlink/ctl/strobe.speed", args: [0.8] }, 0)).toBe(true);
    expect(c.show.strobe.speed).toBeCloseTo(0.8);
    expect(handleOsc(c, { address: "/vjlink/ctl/unbekannt", args: [1] }, 0)).toBe(false);
  });
});

import { recallScene, tickTransition } from "../src/core/control";
import { cloneLayers, transitionProgress } from "../src/core/show";
import { POST_EFFECTS } from "../src/core/effects";
import { POST_IDS } from "../src/engine/shaders";

describe("Überblendung", () => {
  it("startet auf dem nächsten Beat und endet nach der eingestellten Dauer", () => {
    const c = ctx();
    c.tempo.update("manual", 120, 0, 0); // 2 Beats pro Sekunde
    c.show.transitionBeats = 2;
    const before = c.show.layers[0]!.clip;
    recallScene(c, 3, 250); // Beat 0,5
    const t = c.show.transition!;
    expect(t.startBeat).toBe(1);
    expect(t.from[0]!.clip).toBe(before);
    expect(c.show.layers[0]!.clip).toBe("synth-grid");
    expect(transitionProgress(t, 0.9)).toBe(0);
    expect(transitionProgress(t, 2)).toBeCloseTo(0.5);
    tickTransition(c, 1000); expect(c.show.transition).not.toBeNull(); // Beat 2
    tickTransition(c, 1600); expect(c.show.transition).toBeNull();     // Beat 3,2
  });
  it("Übergang 0 ist ein harter Schnitt", () => {
    const c = ctx(); c.show.transitionBeats = 0;
    recallScene(c, 1, 0);
    expect(c.show.transition).toBeNull();
  });
  it("Szenen und Überblendung teilen keine Effekt-Objekte", () => {
    const c = ctx();
    recallScene(c, 0, 0);
    const from = c.show.transition!.from;
    c.show.layers[0]!.effects[0]!.amount = 0.9;
    expect(from[0]!.effects[0]!.amount).toBe(0);
    const copy = cloneLayers(c.show.layers);
    copy[0]!.effects[0]!.amount = 0.1;
    expect(c.show.layers[0]!.effects[0]!.amount).toBe(0.9);
  });
});

describe("Effekt-Stapel", () => {
  it("jeder Effekt der Liste existiert im Shader und umgekehrt", () => {
    expect(POST_EFFECTS.map(e => e.id)).toEqual([...POST_IDS]);
  });
  it("Pult-Kanäle Effekt 1–3 steuern die ersten drei Effekte", () => {
    const s = defaultShow(); const d = new DmxDecoder();
    const f = new Uint8Array(512); const base = 29 - 1; // Ebene 1
    f[base + 5] = 255; f[base + 7] = 51;
    d.decode(f, s);
    expect(s.layers[0]!.effects[0]!.amount).toBe(1);
    expect(s.layers[0]!.effects[2]!.amount).toBeCloseTo(0.2);
  });
  it("MIDI/OSC-Regler und LJ-Link-Regel treffen den Stapel", () => {
    const c = ctx();
    setControl(c, "layer.2.fx.2", 0.6);
    expect(c.show.layers[1]!.effects[1]!.amount).toBe(0.6);
    c.show.autoVj = true;
    handleLj(c, { t: "event", kind: "loop", deck: 1, active: true }, 0);
    expect(c.show.layers[1]!.effects[0]!.amount).toBe(0.8);
    c.show.layers[3]!.effects = [];
    expect(setControl(c, "layer.4.fx.1", 1)).toBe(true); // kein Absturz bei leerem Stapel
    expect(CONTROL_BY_ID.get("layer.4.fx.1")!.get(c)).toBe(0);
  });
  it("Blende-Regler zeigt die Dauer an", () => {
    const c = ctx();
    setControl(c, "transition.beats", 1);
    expect(c.show.transitionBeats).toBe(8);
    expect(CONTROL_BY_ID.get("transition.beats")!.format!(c)).toBe("8 Beats");
    setControl(c, "transition.beats", 0);
    expect(CONTROL_BY_ID.get("transition.beats")!.format!(c)).toBe("Schnitt");
  });
});

import { addSceneFromCurrent, deleteScene, moveScene, overwriteScene, stepScene, tickAuto } from "../src/core/control";
import { applyProject, parseProject, serializeProject } from "../src/core/project";
import { isValidMediaId, mediaTransform } from "../src/core/media";
import { defaultMedia } from "../src/core/show";

describe("Szenen anlegen und Abfolge", () => {
  it("anlegen, überschreiben, verschieben, löschen", () => {
    const c = ctx();
    const n = c.scenes.length;
    c.show.layers[0]!.clip = "plasma";
    const i = addSceneFromCurrent(c, "Meine");
    expect(c.scenes.length).toBe(n + 1);
    expect(c.scenes[i]!.layers[0]!.clip).toBe("plasma");
    c.show.layers[0]!.clip = "tunnel";
    expect(c.scenes[i]!.layers[0]!.clip).toBe("plasma"); // Kopie, kein Verweis
    overwriteScene(c, i);
    expect(c.scenes[i]!.layers[0]!.clip).toBe("tunnel");
    c.show.scene = i + 1;
    moveScene(c, i, -1);
    expect(c.scenes[i - 1]!.name).toBe("Meine");
    expect(c.show.scene).toBe(i);
    deleteScene(c, i - 1);
    expect(c.scenes.length).toBe(n);
    expect(c.show.scene).toBe(0);
  });
  it("Übergang in Sekunden und über Schwarz", () => {
    const c = ctx();
    c.scenes[1]!.transition = { unit: "seconds", value: 2, style: "black" };
    recallScene(c, 1, 10_000);
    const t = c.show.transition!;
    expect(t.style).toBe("black");
    expect(transitionProgress(t, 999, 11_000)).toBeCloseTo(0.5);
    tickTransition(c, 12_100);
    expect(c.show.transition).toBeNull();
  });
  it("Schnitt pro Szene", () => {
    const c = ctx();
    c.scenes[2]!.transition = { unit: "beats", value: 0, style: "fade" };
    recallScene(c, 2, 0);
    expect(c.show.transition).toBeNull();
  });
  it("Automatik: nach Takten und Sekunden, nur wenn Auto an ist", () => {
    const c = ctx();
    c.tempo.update("manual", 120, 0, 0);
    c.scenes[0]!.next = { after: "bars", value: 2 }; // 8 Beats = 4 s
    recallScene(c, 0, 0);
    expect(tickAuto(c, 5000)).toBe(false); // Auto aus
    c.show.autoVj = true;
    expect(tickAuto(c, 3000)).toBe(false);
    expect(tickAuto(c, 4100)).toBe(true);
    expect(c.show.scene).toBe(2);
    c.scenes[1]!.next = { after: "seconds", value: 3 };
    expect(tickAuto(c, 6000)).toBe(false);
    expect(tickAuto(c, 7200)).toBe(true);
    expect(c.show.scene).toBe(3);
  });
  it("Automatik bei Phrasenwechsel, ringförmig weiter", () => {
    const c = ctx();
    c.rules = []; c.show.autoVj = true;
    c.scenes.forEach(s => { s.next = { after: "phrase", value: 1 }; });
    recallScene(c, c.scenes.length - 1, 0);
    handleLj(c, { t: "event", kind: "phrase", deck: 1, phrase: "up" }, 10);
    expect(c.show.scene).toBe(1);
    stepScene(c, -1, 20);
    expect(c.show.scene).toBe(c.scenes.length);
  });
});

describe("Grafiken", () => {
  it("IDs werden geprüft (auch als Dateiname)", () => {
    expect(isValidMediaId("a1b2c3d4e5f60708")).toBe(true);
    expect(isValidMediaId("../etc/passwd")).toBe(false);
    expect(isValidMediaId("ABC")).toBe(false);
  });
  it("Animationen bewegen sich im Takt", () => {
    const m = { ...defaultMedia(), anim: "pulse" as const, animAmount: 1, animBeats: 1 };
    expect(mediaTransform(m, 0, 0).scale).toBeGreaterThan(mediaTransform(m, 0.5, 0).scale);
    const spin = { ...m, anim: "spin" as const };
    expect(mediaTransform(spin, 1, 0).rotation).toBeCloseTo(Math.PI * 2);
    const none = { ...m, anim: "none" as const, x: 1, rotation: 90 };
    expect(mediaTransform(none, 3, 9)).toEqual({ x: 0.5, y: 0, scale: m.scale, rotation: Math.PI / 2 });
  });
});

describe("Projektdatei", () => {
  it("speichern und laden ergibt denselben Stand", () => {
    const c = ctx();
    c.show.layers[1]!.clip = "img:a1b2c3d4e5f60708";
    c.show.layers[1]!.media.anim = "spin";
    c.show.layers[1]!.effects.push({ id: "tint", on: true, amount: 0.7 });
    addSceneFromCurrent(c, "Logo");
    const json = serializeProject(c, [{ id: "a1b2c3d4e5f60708", name: "Logo", width: 800, height: 400 }]);
    const p = parseProject(json)!;
    const c2 = ctx();
    const scenesRef = c2.scenes;
    applyProject(c2, p);
    expect(c2.scenes).toBe(scenesRef); // gleiche Liste (DMX-Decoder hält sie)
    expect(c2.scenes.at(-1)!.name).toBe("Logo");
    expect(c2.show.layers[1]!.clip).toBe("img:a1b2c3d4e5f60708");
    expect(c2.show.layers[1]!.media.anim).toBe("spin");
    expect(c2.show.layers[1]!.effects.at(-1)).toEqual({ id: "tint", on: true, amount: 0.7 });
    expect(p.media[0]!.name).toBe("Logo");
  });
  it("kaputte oder fremde Daten werden verworfen bzw. ersetzt", () => {
    expect(parseProject("kein json")).toBeNull();
    expect(parseProject('{"version":99}')).toBeNull();
    const p = parseProject(JSON.stringify({
      version: 1,
      layers: [{ clip: "img:../../x", opacity: 7, effects: [{ id: "gibts-nicht" }, { id: "glow", amount: 3 }], media: { scale: 1e9, anim: "boom" } }],
      scenes: [{ name: 42, layers: "x", transition: { unit: "tage", value: -5 } }],
      media: [{ id: "../x" }],
    }))!;
    expect(p.layers[0]!.clip).toBeNull();
    expect(p.layers[0]!.opacity).toBe(1);
    expect(p.layers[0]!.effects).toEqual([{ id: "glow", on: true, amount: 1 }]);
    expect(p.layers[0]!.media.scale).toBe(4);
    expect(p.layers[0]!.media.anim).toBe("pulse");
    expect(p.scenes[0]!.name).toBe("Szene 1");
    expect(p.scenes[0]!.transition).toEqual({ unit: "beats", value: 0, style: "fade" });
    expect(p.media).toEqual([]);
    expect(p.layers.length).toBe(1); // Anzahl kommt aus der Datei
  });
});

import { MappingTable, defaultKeyMappings, describeInput, oscValue, parseMappings, parseMidi, DmxLearner } from "../src/core/mapping";
import { resolveControl } from "../src/core/controls";
import { addLayer, removeLayer, MAX_LAYERS } from "../src/core/show";

describe("Ebenen hinzufügen und entfernen", () => {
  it("bis MAX_LAYERS, mindestens eine bleibt", () => {
    const s = defaultShow();
    while (addLayer(s) >= 0) { /* auffüllen */ }
    expect(s.layers.length).toBe(MAX_LAYERS);
    for (let i = 0; i < MAX_LAYERS; i++) removeLayer(s, 0);
    expect(s.layers.length).toBe(1);
  });
  it("Regler für Ebene 6 wirken, sobald es sie gibt", () => {
    const c = ctx();
    expect(setControl(c, "layer.6.opacity", 0.3)).toBe(true); // nichts passiert, kein Fehler
    addLayer(c.show); addLayer(c.show);
    setControl(c, "layer.6.opacity", 0.3);
    expect(c.show.layers[5]!.opacity).toBe(0.3);
  });
  it("Projekt mit 6 Ebenen bleibt bei 6", () => {
    const c = ctx(); addLayer(c.show); addLayer(c.show);
    const p = parseProject(serializeProject(c, []))!;
    expect(p.layers.length).toBe(6);
  });
});

describe("Zuweisungen", () => {
  it("MIDI lesen: CC, Note an/aus", () => {
    expect(parseMidi([0xb0, 21, 127])).toEqual({ input: { p: "midi", type: "cc", ch: 1, num: 21 }, value: 1 });
    expect(parseMidi([0x93, 60, 100])!.input).toEqual({ p: "midi", type: "note", ch: 4, num: 60 });
    expect(parseMidi([0x93, 60, 0])!.value).toBe(0);
    expect(parseMidi([0x83, 60, 64])!.value).toBe(0);
    expect(parseMidi([0xf8])).toBeNull();
  });
  it("Fader per CC, Szene per Note nur einmal pro Druck", () => {
    const c = ctx(); const t = new MappingTable();
    t.add("strobe.speed", { p: "midi", type: "cc", ch: 1, num: 1 });
    t.add("scene.3", { p: "midi", type: "note", ch: 1, num: 36 });
    t.dispatch(c, { p: "midi", type: "cc", ch: 1, num: 1 }, 0.25);
    expect(c.show.strobe.speed).toBe(0.25);
    t.dispatch(c, { p: "midi", type: "note", ch: 1, num: 36 }, 1);
    expect(c.show.scene).toBe(3);
    c.show.scene = 0;
    t.dispatch(c, { p: "midi", type: "note", ch: 1, num: 36 }, 1); // ohne Loslassen kein zweiter Auslöser
    expect(c.show.scene).toBe(0);
  });
  it("Schalter: Taste wechselt, Regler setzt", () => {
    const c = ctx(); const t = new MappingTable(defaultKeyMappings());
    const s = { p: "key" as const, code: "KeyS", label: "S" };
    t.dispatch(c, s, 1); t.dispatch(c, s, 0); expect(c.show.strobe.on).toBe(true);
    t.dispatch(c, s, 1); t.dispatch(c, s, 0); expect(c.show.strobe.on).toBe(false);
    t.add("blackout", { p: "midi", type: "cc", ch: 1, num: 9 });
    t.dispatch(c, { p: "midi", type: "cc", ch: 1, num: 9 }, 0.9); expect(c.show.blackout).toBe(true);
    t.dispatch(c, { p: "midi", type: "cc", ch: 1, num: 9 }, 0.1); expect(c.show.blackout).toBe(false);
  });
  it("Halten: Flash solange gedrückt", () => {
    const c = ctx(); const t = new MappingTable(defaultKeyMappings());
    t.dispatch(c, { p: "key", code: "KeyF", label: "F" }, 1); expect(c.show.strobe.flash).toBe(true);
    t.dispatch(c, { p: "key", code: "KeyF", label: "F" }, 0); expect(c.show.strobe.flash).toBe(false);
  });
  it("ein Eingang darf mehrere Ziele steuern (doppelt belegen), dieselbe Zuweisung nur einmal", () => {
    const c = ctx();
    const t = new MappingTable();
    t.add("master", { p: "osc", address: "/fader1" });
    t.add("fx.master", { p: "osc", address: "/fader1" });
    t.add("master", { p: "osc", address: "/fader1" });
    expect(t.list.map(m => m.target)).toEqual(["master", "fx.master"]);
    t.dispatch(c, { p: "osc", address: "/fader1" }, 0.3);
    expect(c.show.master).toBeCloseTo(0.3, 6);
    expect(c.show.fxMaster).toBeCloseTo(0.3, 6);
    t.remove(t.list[0]!.id);
    expect(t.findAll({ p: "osc", address: "/fader1" }).map(m => m.target)).toEqual(["fx.master"]);
  });
  it("OSC: Werte normalisieren, BPM direkt als Zahl", () => {
    expect(oscValue(0.5)).toBe(0.5); expect(oscValue(127)).toBe(1); expect(oscValue(255)).toBe(1); expect(oscValue(true)).toBe(1);
    const c = ctx(); const t = new MappingTable();
    t.add("tempo.bpm", { p: "osc", address: "/bpm" });
    t.dispatch(c, { p: "osc", address: "/bpm" }, oscValue(128), 128);
    expect(c.tempo.bpm).toBeCloseTo(128);
  });
  it("Clip-Tasten und Beschreibung", () => {
    const c = ctx();
    expect(resolveControl("clip.2.plasma")!.kind).toBe("trigger");
    setControl(c, "clip.2.plasma", 1);
    expect(c.show.layers[1]!.clip).toBe("plasma");
    setControl(c, "clip.2.plasma", 1);
    expect(c.show.layers[1]!.clip).toBeNull();
    expect(resolveControl("clip.99.plasma")).toBeUndefined();
    expect(describeInput({ p: "midi", type: "note", ch: 1, num: 60 })).toBe("Kanal 1 · Note C4 (60)");
  });
  it("DMX lernen: der bewegte Kanal gewinnt", () => {
    const l = new DmxLearner(); const f = new Uint8Array(512);
    expect(l.feed(0, f)).toBeNull();
    const g = f.slice(); g[100] = 10; g[200] = 180;
    expect(l.feed(0, g)).toEqual({ universe: 0, channel: 201 });
  });
  it("gespeicherte Zuweisungen werden geprüft", () => {
    const ok = parseMappings([
      { id: "a", target: "master", input: { p: "midi", type: "cc", ch: 1, num: 7 } },
      { id: "b", target: "gibts.nicht", input: { p: "key", code: "KeyQ" } },
      { id: "c", target: "master", input: { p: "midi", type: "cc", ch: 17, num: 7 } },
      { id: "d", target: "scene.2", input: { p: "osc", address: "keine/adresse" } },
      { id: "e", target: "clip.1.tunnel", input: { p: "dmx", universe: 0, channel: 600 } },
    ])!;
    expect(ok.map(m => m.id)).toEqual(["a"]);
  });
});

describe("Tempo-Quelle festlegen und von Hand setzen", () => {
  it("Sperre auf Manuell: LJ-Link wird ignoriert, Tap geht", () => {
    const t = new TempoClock();
    t.lock = "manual";
    expect(t.update("ljlink", 128, 0, 0)).toBe(false);
    t.tap(0); t.tap(500);
    expect(t.bpm).toBeCloseTo(120);
  });
  it("Eingabe setzt BPM ohne Phasensprung", () => {
    const t = new TempoClock();
    t.update("manual", 120, 0, 0);
    const b = t.beatAt(1000);
    t.setManual(140, 1000);
    expect(t.bpm).toBe(140);
    expect(t.beatAt(1000)).toBeCloseTo(b);
  });
  it("Sperre auf Link: fällt Link aus, bleibt das Tempo stehen", () => {
    const t = new TempoClock(); t.lock = "link";
    t.update("link", 125, 0, 0);
    t.tick(10_000);
    expect(t.source).toBe("link");
  });
});

import { LedFeedback, MidiClock } from "../src/core/mapping";
import { TEMPLATES, buildTemplate, templateFor, exportMappings } from "../src/core/templates";
import { hueOf, hueRgb } from "../src/core/controls";

describe("Phase 1: LEDs, Vorlagen, MIDI-Clock", () => {
  it("LED-Rückmeldung: nur Änderungen, nur mit Gerät, Tap blinkt", () => {
    const c = ctx(); const t = new MappingTable(); const leds = new LedFeedback();
    t.add("strobe.on", { p: "midi", type: "note", ch: 1, num: 10 }, undefined, { device: "APC" });
    t.add("scene.2", { p: "midi", type: "note", ch: 1, num: 11 }); // ohne Gerät: keine LED
    t.add("master", { p: "midi", type: "cc", ch: 1, num: 7 }, undefined, { device: "APC" }); // Regler: keine LED
    t.add("tempo.tap", { p: "midi", type: "note", ch: 2, num: 12 }, undefined, { device: "APC", led: { on: 5, off: 0 } });
    let out = leds.compute(t, c, 0.1);
    expect(out).toEqual([
      { device: "APC", bytes: [0x90, 10, 0] },
      { device: "APC", bytes: [0x91, 12, 5] },
    ]);
    expect(leds.compute(t, c, 0.15)).toEqual([]);
    c.show.strobe.on = true;
    out = leds.compute(t, c, 0.6);
    expect(out).toContainEqual({ device: "APC", bytes: [0x90, 10, 127] });
    expect(out).toContainEqual({ device: "APC", bytes: [0x91, 12, 0] });
  });
  it("CC-Taste wechselt Schalter bei jedem Druck", () => {
    const c = ctx(); const t = new MappingTable();
    const i = { p: "midi" as const, type: "cc" as const, ch: 1, num: 46 };
    t.add("strobe.on", i, undefined, { button: true });
    t.dispatch(c, i, 1); t.dispatch(c, i, 0);
    expect(c.show.strobe.on).toBe(true);
    t.dispatch(c, i, 1); t.dispatch(c, i, 0);
    expect(c.show.strobe.on).toBe(false);
  });
  it("MIDI-Clock misst das Tempo und zählt Beats ab Start", () => {
    const k = new MidiClock();
    k.feed(0xfa, 0);
    const tick = 60000 / 128 / 24;
    let r = null;
    for (let i = 1; i <= 48; i++) r = k.feed(0xf8, i * tick) ?? r;
    expect(r!.bpm).toBeCloseTo(128, 1);
    expect(r!.beat).toBeCloseTo(2);
    expect(k.feed(0xfc, 9999)).toBeNull();
    expect(k.running).toBe(false);
  });
  it("Vorlagen: alle Ziele existieren, Eingänge eindeutig, Geräte erkannt", () => {
    for (const tp of TEMPLATES) {
      const list = buildTemplate(tp, "Gerät");
      expect(list.length).toBeGreaterThan(20);
      for (const m of list) expect(resolveControl(m.target), `${tp.id}: ${m.target}`).toBeDefined();
      const t = new MappingTable();
      for (const m of list) t.add(m.target, m.input, undefined, m);
      expect(t.list.length).toBe(list.length); // keine doppelten Eingänge
    }
    expect(templateFor("APC mini mk2 Control")!.id).toBe("apc-mini-mk2");
    expect(templateFor("APC MINI")!.id).toBe("apc-mini");
    expect(templateFor("nanoKONTROL2 SLIDER/KNOB")!.id).toBe("nanokontrol2");
    expect(templateFor("Launchpad X")).toBeUndefined();
  });
  it("Export und Import behalten Gerät, LED und Taste", () => {
    const t = new MappingTable();
    t.add("scene.1", { p: "midi", type: "cc", ch: 1, num: 32 }, "x1", { device: "nano", led: { on: 127, off: 0 }, button: true });
    const back = parseMappings((JSON.parse(exportMappings(t.list)) as { mappings: unknown }).mappings)!;
    expect(back[0]).toEqual({ id: "x1", target: "scene.1", input: { p: "midi", type: "cc", ch: 1, num: 32 }, device: "nano", led: { on: 127, off: 0 }, button: true });
  });
  it("neue Ziele: Farbe, Mischmodus, Clip aus, Farbton", () => {
    const c = ctx();
    setControl(c, "layer.1.color", 1); expect(c.show.layers[0]!.colorSource).toBe("rainbow");
    setControl(c, "layer.2.blend", 0.3); expect(c.show.layers[1]!.blend).toBe("add");
    c.show.layers[0]!.clip = "tunnel"; setControl(c, "layer.1.clear", 1); expect(c.show.layers[0]!.clip).toBeNull();
    setControl(c, "slot.A.hue", 1 / 3); expect(c.show.slots[0]![1]).toBeCloseTo(1); expect(c.show.slots[0]![0]).toBeCloseTo(0);
    for (const h of [0, 0.1, 0.5, 0.8]) expect(hueOf(hueRgb(h))).toBeCloseTo(h);
  });
});

describe("Farbslots per Mapping", () => {
  it("Rot, Grün, Blau einzeln", () => {
    const c = ctx();
    setControl(c, "slot.B.r", 0.2); setControl(c, "slot.B.g", 0.4); setControl(c, "slot.B.b", 1);
    expect(c.show.slots[1]).toEqual([0.2, 0.4, 1]);
    expect(resolveControl("slot.B.level")).toBeUndefined();
  });
});

import { strobeWhite } from "../src/core/audio";
describe("Strobe White", () => {
  it("blitzt weiß im Strobe-Takt, Intensität = Helligkeit, sonst Bild", () => {
    const c = ctx(); const s = c.show.strobe;
    s.speed = 0.2; s.sync = true; s.intensity = 0.8; // 1× pro Beat
    expect(strobeWhite(s, 0.1, 0)).toBe(0);
    s.white = true;
    expect(strobeWhite(s, 0.1, 0)).toBe(0.8);
    expect(strobeWhite(s, 0.6, 0)).toBe(0);
    s.white = false;
    setControl(c, "strobe.whiteFlash", 1); expect(strobeWhite(s, 0.1, 0)).toBe(0.8);
    setControl(c, "strobe.whiteFlash", 0); expect(strobeWhite(s, 0.1, 0)).toBe(0);
    expect(strobeGain(s, 0.6, 0)).toBe(1); // normales Strobe bleibt aus
  });
});

import { analyzeSpectrum, bandsFor, micDrives, sampleWave, AUDIO_CLIPS } from "../src/core/audio";
describe("Audio-Eingang", () => {
  it("wirkt im Modus Audio-Visuals nur auf EQ, Oszilloskop & Co.", () => {
    const a = { bass: 0, mid: 0, high: 0, mic: { bands: [1, 1, 1, 1, 1, 1, 1, 1], wave: new Array(64).fill(0), scope: "audio" as const } };
    expect(AUDIO_CLIPS.has("oscilloscope") && AUDIO_CLIPS.has("bar-spectrum")).toBe(true);
    expect(micDrives(a, "oscilloscope")).toBe(true);
    expect(micDrives(a, "tunnel")).toBe(false);
    expect(bandsFor(a, "tunnel", 0.5, 0)).not.toEqual(a.mic.bands);
    a.mic.scope = "all" as never;
    expect(micDrives(a, "tunnel")).toBe(true);
    expect(micDrives({ bass: 0, mid: 0, high: 0 }, "oscilloscope")).toBe(false);
  });
  it("Spektrum: lauter Bass ergibt hohes erstes Band, Pegel wirkt", () => {
    const db = new Float32Array(1024).fill(-100);
    for (let i = 1; i < 4; i++) db[i] = -25; // ~ 20–90 Hz bei 48 kHz
    const b = analyzeSpectrum(db, 48000, 1);
    expect(b.length).toBe(8);
    expect(b[0]).toBeGreaterThan(0.5);
    expect(b[7]).toBe(0);
    expect(analyzeSpectrum(db, 48000, 0.3)[0]).toBeLessThan(b[0]!);
  });
  it("Wellenform: 64 Punkte ab Nulldurchgang, begrenzt", () => {
    const t = Float32Array.from({ length: 2048 }, (_, i) => Math.sin(i / 20 + 1));
    const w = sampleWave(t, 3);
    expect(w.length).toBe(64);
    expect(Math.max(...w)).toBeLessThanOrEqual(1);
    expect(w[0]!).toBeGreaterThanOrEqual(0);
    expect(w[0]!).toBeLessThan(0.2);
  });
});

import { addClip, removeClip, forgetClip, defaultClips } from "../src/core/show";
describe("Clips pro Ebene", () => {
  it("aufnehmen, entfernen (stoppt laufenden Clip), Grafik überall vergessen", () => {
    const c = ctx(); const l = c.show.layers[1]!;
    expect(l.clips).toEqual(defaultClips());
    addClip(l, "img:a1b2c3d4e5f60708"); addClip(l, "img:a1b2c3d4e5f60708");
    expect(l.clips.filter(x => x.startsWith("img:")).length).toBe(1);
    l.clip = "tunnel"; removeClip(l, "tunnel");
    expect(l.clip).toBeNull(); expect(l.clips).not.toContain("tunnel");
    l.clip = "img:a1b2c3d4e5f60708";
    addSceneFromCurrent(c, "Mit Logo");
    forgetClip(c.show, c.scenes, "img:a1b2c3d4e5f60708");
    expect(l.clips).not.toContain("img:a1b2c3d4e5f60708");
    expect(l.clip).toBeNull();
    expect(c.scenes.at(-1)!.layers[1]!.clip).toBeNull();
    expect(c.scenes.at(-1)!.layers[1]!.clips).not.toContain("img:a1b2c3d4e5f60708");
  });
  it("Projekt: eigene Zeilen bleiben, alte Projekte bekommen alle Grafiken", () => {
    const c = ctx();
    removeClip(c.show.layers[0]!, "plasma");
    addClip(c.show.layers[0]!, "img:a1b2c3d4e5f60708");
    const p = parseProject(serializeProject(c, [{ id: "a1b2c3d4e5f60708", name: "L", width: 1, height: 1 }]))!;
    expect(p.layers[0]!.clips).not.toContain("plasma");
    expect(p.layers[0]!.clips).toContain("img:a1b2c3d4e5f60708");
    expect(p.layers[1]!.clips).not.toContain("img:a1b2c3d4e5f60708");
    const old = parseProject(JSON.stringify({ version: 1, layers: [{ clip: "tunnel" }], media: [{ id: "a1b2c3d4e5f60708", name: "L" }] }))!;
    expect(old.layers[0]!.clips).toContain("img:a1b2c3d4e5f60708");
    expect(old.layers[0]!.clips).toContain("tunnel");
  });
});

import { STARTER_CLIP_IDS } from "../src/core/effects";
import { GEN_IDS } from "../src/engine/shaders";
describe("Bibliothek der Visuals", () => {
  it("jeder fertige Generator existiert im Shader, Start-Clips stehen vorn", () => {
    for (const g of READY_GENERATORS) expect(GEN_IDS as readonly string[]).toContain(g.id);
    expect(READY_GENERATORS.slice(0, 8).map(g => g.id)).toEqual([...STARTER_CLIP_IDS]);
    expect(READY_GENERATORS.length).toBe(150);
    expect(EFFECTS.filter(e => e.status === "planned").map(e => e.id)).toEqual([]);
  });
});

import { clipVideoTime, cueGo, cueRenders, cueTick, cueTime, newCue, newCueState as ncs, type CueEnv } from "../src/core/video";
describe("Video als Clip", () => {
  it("Loop in normaler Geschwindigkeit und im Takt", () => {
    const v = { loopIn: 2, loopOut: 6, beats: 0, fit: "fill" as const, sound: false };
    const st = { clip: "vid:x", ms: 1000, beat: 8 };
    expect(clipVideoTime(v, st, 10, 0, 1000 + 1500, 120).t).toBeCloseTo(3.5);
    expect(clipVideoTime(v, st, 10, 0, 1000 + 5000, 120).t).toBeCloseTo(3); // 5 s im 4-s-Loop
    v.beats = 8; // 8 Beats bei 120 BPM = 4 s, Loop 4 s → Tempo 1
    const r = clipVideoTime(v, st, 10, 12, 0, 120);
    expect(r.rate).toBeCloseTo(1);
    expect(r.t).toBeCloseTo(4); // halber Loop
    expect(clipVideoTime(v, st, 10, 16, 0, 120).t).toBeCloseTo(2); // neuer Durchlauf auf dem Beat
    expect(clipVideoTime(v, st, 10, 12, 0, 240).rate).toBeCloseTo(2);
  });
});

describe("SHOW-Ablauf", () => {
  const env = (rec: number[] = []): CueEnv => ({ duration: m => (m === "vid:aaaaaa" ? 10 : 0), recallScene: i => rec.push(i) });
  it("WEITER startet der Reihe nach, „mit vorigem“ zusammen, Szene wird abgerufen", () => {
    const s = ncs(); const rec: number[] = [];
    const a = newCue("video", "Intro", "vid:aaaaaa");
    const b = newCue("scene", "Licht"); b.start = "with"; b.wait = 1; b.scene = 3;
    const c = newCue("image", "Logo", "img:bbbbbb");
    s.list.push(a, b, c);
    expect(cueGo(s, 0, env(rec))).toBe("started");
    expect(s.run.active.length).toBe(2);
    expect(s.run.next).toBe(2);
    cueTick(s, 500, env(rec)); expect(rec).toEqual([]);
    cueTick(s, 1100, env(rec)); expect(rec).toEqual([2]);
    expect(cueRenders(s, 2000, env(rec))[0]!.t).toBeCloseTo(2);
    cueGo(s, 3000, env(rec));
    const r = cueRenders(s, 3200, env(rec));
    expect(r.map(x => x.kind)).toEqual(["video", "image"]); // Intro blendet über 0,5 s aus
    expect(r[0]!.opacity).toBeLessThan(1);
    cueTick(s, 4000, env(rec));
    expect(cueRenders(s, 4000, env(rec)).map(x => x.kind)).toEqual(["image"]);
  });
  it("„nach vorigem“ startet am Ende, „bis WEITER“ beendet erst den Loop", () => {
    const s = ncs(); const e = env();
    const a = newCue("video", "Opener", "vid:aaaaaa"); a.loop = "untilGo"; a.loopRange = true; a.loopIn = 4; a.loopOut = 6;
    const b = newCue("black", "Schwarz"); b.start = "after";
    s.list.push(a, b);
    cueGo(s, 0, e);
    expect(cueTime(a, s.run.active[0]!, 9000, 10).t).toBeCloseTo(5); // 4 + (9-6) mod 2 = 5
    expect(cueGo(s, 9000, e)).toBe("released");
    cueTick(s, 12000, e); expect(s.run.current).toBe(0); // 5 s + 3 s → bei 14 s zu Ende
    cueTick(s, 14100, e);
    expect(s.run.current).toBe(1);
    expect(cueRenders(s, 14600, e).some(r => r.kind === "black")).toBe(true);
  });
  it("x-mal wiederholen und Ende „weiter“", () => {
    const s = ncs(); const e = env();
    const a = newCue("video", "Loop", "vid:aaaaaa"); a.trimOut = 4; a.loop = "count"; a.loopCount = 3; a.end = "next";
    const b = newCue("image", "Bild", "img:bbbbbb");
    s.list.push(a, b);
    cueGo(s, 0, e);
    expect(cueTime(a, s.run.active[0]!, 9000, 10).t).toBeCloseTo(1);
    cueTick(s, 11000, e); expect(s.run.current).toBe(0);
    cueTick(s, 12100, e); expect(s.run.current).toBe(1);
  });
  it("Projekt speichert den Ablauf", () => {
    const c = ctx();
    const q = newCue("video", "Intro", "vid:aaaaaa"); q.loop = "forever"; q.over = "over";
    c.cues.list.push(q);
    const p = parseProject(serializeProject(c, [], [], [{ id: "aaaaaa", name: "Intro", ext: "mp4", duration: 10, width: 1920, height: 1080 }]))!;
    expect(p.cues[0]).toEqual(q);
    expect(p.videos[0]!.duration).toBe(10);
  });
});

import { planLoop } from "../src/core/video";
describe("Nahtloser Loop", () => {
  it("schaltet kurz vor dem Loop-Ende auf den bereiten zweiten Abspieler um", () => {
    expect(planLoop({ active: 3.0, target: 3.0, rate: 1, loop: [1, 5], standbyReady: true })).toBe("ok");
    expect(planLoop({ active: 4.96, target: 4.97, rate: 1, loop: [1, 5], standbyReady: true })).toBe("swap");
    expect(planLoop({ active: 4.9, target: 1.05, rate: 1, loop: [1, 5], standbyReady: true })).toBe("ok"); // im Kreis nur 0,15 s Abstand
    expect(planLoop({ active: 1.02, target: 4.98, rate: 1, loop: [1, 5], standbyReady: false })).toBe("ok"); // gerade umgeschaltet
    expect(planLoop({ active: 4.96, target: 4.97, rate: 1, loop: [1, 5], standbyReady: false })).toBe("ok");
    expect(planLoop({ active: 5.0, target: 1.0, rate: 1, loop: [1, 5], standbyReady: false })).toBe("seek");
    expect(planLoop({ active: 2.0, target: 3.0, rate: 1, standbyReady: false })).toBe("seek");
    expect(planLoop({ active: 2.0, target: 2.1, rate: 1, standbyReady: false })).toBe("ok");
  });
});

import { MtcDecoder, TimecodeClock, buildArtTimecode, formatTc, framesToTc, mtcQuarterFrames, parseArtTimecode, parseTc, tcToFrames } from "../src/core/timecode";
describe("Timecode", () => {
  it("rechnet Bilder und Zeit hin und her, auch 29,97 Drop-Frame", () => {
    expect(tcToFrames({ h: 0, m: 1, s: 0, f: 0 }, 25)).toBe(1500);
    expect(framesToTc(1500, 25)).toEqual({ h: 0, m: 1, s: 0, f: 0 });
    // Drop-Frame: nach 00:00:59;29 kommt 00:01:00;02
    const a = tcToFrames({ h: 0, m: 0, s: 59, f: 29 }, 29.97);
    expect(framesToTc(a + 1, 29.97)).toEqual({ h: 0, m: 1, s: 0, f: 2 });
    expect(framesToTc(tcToFrames({ h: 0, m: 10, s: 0, f: 0 }, 29.97), 29.97)).toEqual({ h: 0, m: 10, s: 0, f: 0 });
    for (const n of [0, 1799, 1800, 17981, 17982, 107892, 2589407]) expect(tcToFrames(framesToTc(n, 29.97), 29.97)).toBe(n);
    expect(formatTc({ h: 1, m: 2, s: 3, f: 4 }, 29.97)).toBe("01:02:03;04");
    expect(parseTc("00:20:00:00")).toEqual({ h: 0, m: 20, s: 0, f: 0 });
    expect(parseTc("00:20:00:25", 25)).toBeNull();
  });
  it("Art-Net-Timecode: bauen und lesen", () => {
    const b = buildArtTimecode({ h: 1, m: 2, s: 3, f: 4 }, 25);
    expect(b.length).toBe(19);
    expect(parseArtTimecode(b)).toEqual({ tc: { h: 1, m: 2, s: 3, f: 4 }, fps: 25 });
    expect(parseArtTimecode(new Uint8Array(19))).toBeNull();
  });
  it("MIDI-Timecode: 8 Viertelbilder ergeben die Zeit (+2 Bilder)", () => {
    const d = new MtcDecoder();
    let r = null;
    for (const x of mtcQuarterFrames({ h: 10, m: 20, s: 30, f: 12 }, 30)) r = d.feed(x) ?? r;
    expect(r).toEqual({ tc: { h: 10, m: 20, s: 30, f: 14 }, fps: 30 });
  });
  it("Uhr: empfangen, weiterzählen, Aussetzer, Senden", () => {
    const c = new TimecodeClock();
    expect(c.receive({ h: 0, m: 0, s: 1, f: 0 }, 25, "artnet", 0)).toBe(false); // aus
    c.receiveOn = true;
    expect(c.receive({ h: 0, m: 0, s: 1, f: 0 }, 25, "mtc", 0)).toBe(false); // andere Quelle
    c.receive({ h: 0, m: 0, s: 1, f: 0 }, 25, "artnet", 0);
    c.receive({ h: 0, m: 0, s: 1, f: 1 }, 25, "artnet", 40);
    expect(c.now(240)!.frames).toBeCloseTo(26 + 5);
    expect(c.now(240)!.running).toBe(true);
    expect(c.now(3000)!.stale).toBe(true);
    expect(c.now(3000)!.running).toBe(false);
    c.offsetTc = { h: 0, m: 0, s: 1, f: 0 }; c.receive({ h: 0, m: 0, s: 2, f: 0 }, 25, "artnet", 4000);
    expect(c.now(4000)!.frames).toBe(75);
    // Versatz 1 h bei 30 fps: ergibt 1 h, nicht 50 min (vorher mit 25 fps umgerechnet)
    c.offsetTc = { h: 1, m: 0, s: 0, f: 0 }; c.receive({ h: 0, m: 0, s: 0, f: 0 }, 30, "artnet", 5000);
    expect(c.now(5000)!.frames).toBe(30 * 3600);
    const s = new TimecodeClock(); s.sendOn = true; s.sendFps = 25;
    s.locate(100, 0); s.start(0);
    expect(s.now(1000)!.frames).toBeCloseTo(125);
    s.stop(1000);
    expect(s.now(5000)!.frames).toBeCloseTo(125);
  });
  it("Cues starten per Timecode und folgen ihm", () => {
    const st = ncs();
    let tcNow = { frames: 0, fps: 25 as const, running: true, stale: false };
    const env: CueEnv = { duration: () => 10, recallScene: () => {}, timecode: () => tcNow, chase: true };
    const q = newCue("video", "Award", "vid:aaaaaa"); q.start = "timecode"; q.tc = "00:00:02:00";
    st.list.push(q);
    tcNow = { ...tcNow, frames: 40 }; cueTick(st, 1000, env);
    expect(st.run.active.length).toBe(0);
    tcNow = { ...tcNow, frames: 100 }; cueTick(st, 2000, env); // 2 s nach Start
    expect(cueRenders(st, 2000, env)[0]!.t).toBeCloseTo(2);
    tcNow = { ...tcNow, frames: 200 }; cueTick(st, 2100, env); // vorgespult: Video springt mit
    expect(cueRenders(st, 2100, env)[0]!.t).toBeCloseTo(6);
    tcNow = { ...tcNow, frames: 200, running: false }; cueTick(st, 2200, env);
    expect(cueRenders(st, 2200, env)[0]!.rate).toBe(0); // Timecode steht → Bild steht
    tcNow = { ...tcNow, frames: 10, running: true }; cueTick(st, 2300, env); // zurückgespult
    expect(st.run.active.length).toBe(0);
  });
  it("Nur starten (ohne Folgen): Start beim Überschreiten der Zeit", () => {
    const st = ncs();
    let f = 40;
    const env: CueEnv = { duration: () => 10, recallScene: () => {}, timecode: () => ({ frames: f, fps: 25, running: true, stale: false }), chase: false };
    const q = newCue("image", "Logo", "img:bbbbbb"); q.start = "timecode"; q.tc = "00:00:02:00";
    st.list.push(q);
    cueTick(st, 0, env); expect(st.run.active.length).toBe(0);
    f = 52; cueTick(st, 500, env); expect(st.run.active.length).toBe(1);
  });
});

describe("Timecode ein und aus gleichzeitig", () => {
  it("empfängt vom Pult und gibt die eigene Uhr oder den Eingang weiter", () => {
    const c = new TimecodeClock();
    c.receiveOn = true; c.sendOn = true; c.sendFps = 25;
    c.receive({ h: 0, m: 0, s: 10, f: 0 }, 25, "artnet", 0);
    c.locate(500, 0); c.start(0);
    expect(c.now(0)!.frames).toBe(250);         // Cues folgen dem Eingang
    expect(c.outgoing(1000)!.frames).toBeCloseTo(525); // gesendet wird die eigene Uhr
    c.sendFrom = "thru";
    expect(c.outgoing(0)!.frames).toBe(250);    // oder der Eingang wird weitergereicht
  });
  it("Timecode-Cue startet die eigene Uhr ab einer Zeit", () => {
    const st = ncs(); const calls: string[] = [];
    const env: CueEnv = { duration: () => 0, recallScene: () => {}, tcCommand: (a, t) => calls.push(`${a} ${t}`) };
    const v = newCue("video", "Intro", "vid:aaaaaa");
    const q = newCue("tcsignal", "MA-Show starten"); q.start = "with"; q.tcAction = "start"; q.tcTarget = "01:00:00:00";
    st.list.push(v, q);
    cueGo(st, 0, env); cueTick(st, 10, env); cueTick(st, 20, env);
    expect(calls).toEqual(["start 01:00:00:00"]);
    expect(cueRenders(st, 30, env).map(r => r.kind)).toEqual(["video"]); // Signal blendet nichts aus
  });
});

describe("Testbilder", () => {
  it("schaltet rundum durch", async () => {
    const { stepTestPattern, TEST_IDS } = await import("../src/core/show");
    expect(stepTestPattern("bars", 1)).toBe("grid");
    expect(stepTestPattern("bars", -1)).toBe(TEST_IDS[TEST_IDS.length - 1]);
    expect(stepTestPattern(TEST_IDS[TEST_IDS.length - 1]!, 1)).toBe("bars");
  });
});

describe("Gemeinsame Ebenen-Uhr", () => {
  it("Ausgänge rechnen dieselbe Animationszeit wie das Hauptfenster", async () => {
    const { LayerClock, layerTimesAt } = await import("../src/core/show");
    const layers = [{ speed: 1 }, { speed: 2 }];
    const c = new LayerClock();
    c.tick(1000, layers); c.tick(1500, layers);
    const snap = c.snap(1500);
    // Ausgang, der später geöffnet wurde, bekommt trotzdem dieselbe Zeit
    c.tick(1750, layers);
    const out = layerTimesAt(snap, 1750, layers);
    expect(out[0]).toBeCloseTo(c.t[0]!, 6);
    expect(out[1]).toBeCloseTo(c.t[1]!, 6);
    expect(out[1]).toBeCloseTo(1.5, 6);
  });
});

describe("Antrieb je Ebene", () => {
  it("Takt pulsiert im Takt, Statisch nie, Audio nur mit Audio", async () => {
    const { layerDrive } = await import("../src/core/audio");
    const quiet = { bass: 0, mid: 0, high: 0 };
    expect(layerDrive("bpm", quiet, "tunnel", 4.0, 1, 1).pulse).toBeCloseTo(1, 5);
    expect(layerDrive("static", quiet, "tunnel", 4.0, 1, 1).pulse).toBe(0);
    expect(layerDrive("audio", quiet, "tunnel", 4.0, 1, 1).pulse).toBe(0);
    const loud = { bass: 0.9, mid: 0.2, high: 0.1 };
    expect(layerDrive("audio", loud, "tunnel", 4.5, 1, 1).pulse).toBeGreaterThan(0.5);
    // Takt ignoriert Audio: gleiche Bänder mit und ohne Audio
    expect(layerDrive("bpm", loud, "tunnel", 4.5, 1, 1).bands).toEqual(layerDrive("bpm", quiet, "tunnel", 4.5, 1, 1).bands);
  });
});

describe("Mehrere Farb-Slots", () => {
  it("Slots antippen: einer = Slot, mehrere = Palette in Reihenfolge, keiner = Original", async () => {
    const { toggleColorSlot, layerPalette, defaultShow } = await import("../src/core/show");
    const l = { colorSource: "original" as import("../src/core/show").ColorSource, colorSlots: [] as number[] };
    toggleColorSlot(l, 2); expect(l.colorSource).toBe("C");
    toggleColorSlot(l, 0); expect(l.colorSource).toBe("multi"); expect(l.colorSlots).toEqual([2, 0]);
    const slots = defaultShow().slots;
    expect(layerPalette(l, slots)).toEqual([slots[2], slots[0]]);
    toggleColorSlot(l, 2); expect(l.colorSource).toBe("A");
    toggleColorSlot(l, 0); expect(l.colorSource).toBe("original");
  });
  it("Antrieb, Slots und Laser werden gespeichert", async () => {
    const c = ctx();
    const l = c.show.layers[0]!;
    l.drive = "static"; l.colorSource = "multi"; l.colorSlots = [3, 1, 4]; l.laser = { x: -0.2, y: 0.5, size: 1.5, thick: 2.5 };
    const back = parseProject(JSON.parse(JSON.stringify(serializeProject(c, []))));
    const b = back!.layers[0]!;
    expect(b.drive).toBe("static"); expect(b.colorSource).toBe("multi"); expect(b.colorSlots).toEqual([3, 1, 4]);
    expect(b.laser).toEqual({ x: -0.2, y: 0.5, size: 1.5, thick: 2.5, rot: 0, override: false });
  });
});

describe("Projektdatei", () => {
  it("packen und entpacken ergibt dasselbe Projekt, Grafiken und Videos", async () => {
    const { packProject, unpackProject, hashText, projectRefs } = await import("../src/core/projectfile");
    const c = ctx();
    c.show.layers[0]!.drive = "audio";
    const json = serializeProject(c, [{ id: "a1b2c3d4e5f60708", name: "Logo", width: 10, height: 10 }], [],
      [{ id: "0011223344556677", name: "Intro", ext: "mp4", duration: 3, width: 1920, height: 1080 }]);
    const img = { id: "a1b2c3d4e5f60708", name: "Logo", dataUrl: "data:image/png;base64,AAAA" };
    const text = packProject(json, [img], "Show Medien", "2026-11-08T00:00:00.000Z");
    const u = unpackProject(text);
    if (typeof u === "string") throw new Error(u);
    expect(u.projectJson).toBe(json);
    expect(hashText(u.projectJson)).toBe(hashText(json));
    expect(u.images).toEqual([img]);
    expect(u.mediaFolder).toBe("Show Medien");
    expect(u.videos).toEqual([{ id: "0011223344556677", name: "Intro", ext: "mp4" }]);
    expect(projectRefs(json).mediaIds).toEqual(["a1b2c3d4e5f60708"]);
  });
  it("fremde oder manipulierte Dateien werden abgelehnt", async () => {
    const { unpackProject } = await import("../src/core/projectfile");
    expect(typeof unpackProject("kein json")).toBe("string");
    expect(typeof unpackProject(JSON.stringify({ format: "andere" }))).toBe("string");
    const json = serializeProject(ctx(), []);
    const evil = JSON.stringify({ format: "vjlink-project", formatVersion: 1, project: JSON.parse(json), images: [], mediaFolder: "../../etc" });
    const u = unpackProject(evil);
    if (typeof u === "string") throw new Error(u);
    expect(u.mediaFolder).toBeNull();
  });
  it("Fingerabdruck unterscheidet Änderungen", async () => {
    const { hashText } = await import("../src/core/projectfile");
    expect(hashText("a")).not.toBe(hashText("b"));
    expect(hashText("abc")).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("Modulation", () => {
  it("LFO-Formen und Wertebereich", async () => {
    const { lfo } = await import("../src/core/modulation");
    expect(lfo("sine", 0, 4)).toBeCloseTo(0, 6);
    expect(lfo("sine", 2, 4)).toBeCloseTo(1, 6);
    expect(lfo("square", 1, 4)).toBe(1);
    expect(lfo("square", 3, 4)).toBe(0);
    expect(lfo("saw", 1, 4)).toBeCloseTo(0.25, 6);
    expect(lfo("triangle", 2, 4)).toBeCloseTo(1, 6);
    // Zufall: gleicher Durchlauf = gleicher Wert
    expect(lfo("random", 0.1, 1, 5)).toBe(lfo("random", 0.9, 1, 5));
  });
  it("schwingt um den Grundwert, ohne ihn zu verändern", async () => {
    const { modulatedShow } = await import("../src/core/modulation");
    const c = ctx();
    c.show.layers[0]!.opacity = 0.5;
    const mods = [{ target: "layer.1.opacity", source: "square" as const, beats: 4, depth: 0.6, on: true }];
    const hi = modulatedShow(c, mods, 1, []);
    const lo = modulatedShow(c, mods, 3, []);
    expect(hi.layers[0]!.opacity).toBeCloseTo(0.8, 6);
    expect(lo.layers[0]!.opacity).toBeCloseTo(0.2, 6);
    expect(c.show.layers[0]!.opacity).toBe(0.5);
    // ohne aktive Modulation: derselbe Zustand, keine Kopie
    expect(modulatedShow(c, [{ ...mods[0]!, on: false }], 1, [])).toBe(c.show);
  });
  it("nur Bild-Regler, Tempo und Auswahl sind ausgeschlossen; wird gespeichert", async () => {
    const { modulatable } = await import("../src/core/modulation");
    expect(modulatable("layer.2.opacity")).toBe(true);
    expect(modulatable("layer.1.laser.y")).toBe(true);
    expect(modulatable("tempo.bpm")).toBe(false);
    expect(modulatable("layer.1.color")).toBe(false);
    expect(modulatable("blackout")).toBe(false);
    const c = ctx();
    c.mods = [{ target: "master", source: "bass", beats: 4, depth: 0.3, on: true }, { target: "tempo.bpm", source: "sine", beats: 4, depth: 1, on: true }];
    const p = parseProject(serializeProject(c, []))!;
    expect(p.mods).toEqual([{ target: "master", source: "bass", beats: 4, depth: 0.3, on: true }]);
  });
});

describe("XY-Override", () => {
  it("Schalter und Lage per Mapping, wird gespeichert", () => {
    const c = ctx();
    setControl(c, "layer.1.laser.xy", 1);
    setControl(c, "layer.1.laser.x", 0.75);
    setControl(c, "layer.1.laser.size", 1);
    const z = c.show.layers[0]!.laser;
    expect(z.override).toBe(true);
    expect(z.x).toBeCloseTo(0.5, 6);
    expect(z.size).toBeCloseTo(2.5, 6);
    const p = parseProject(serializeProject(c, []))!;
    expect(p.layers[0]!.laser.override).toBe(true);
  });
});

describe("Bass-Schläge", () => {
  it("erkennt Schläge, Ringe folgen ihnen; ohne Audio keine Ringe im Audio-Antrieb", async () => {
    const { KickDetector, kickRings, layerDrive } = await import("../src/core/audio");
    const k = new KickDetector();
    for (let t = 0; t < 1000; t += 16) k.feed(0.05, t);
    expect(k.feed(0.9, 1000)).toBe(true);
    expect(k.feed(0.9, 1050)).toBe(false); // zu kurz danach
    expect(kickRings(k.kicks, 1600)[0]).toBeCloseTo(0.5, 5);
    expect(layerDrive("audio", { bass: 0, mid: 0, high: 0 }, "pulse-rings", 1, 1, 1).rings.every(r => r < 0)).toBe(true);
    expect(layerDrive("bpm", { bass: 0, mid: 0, high: 0 }, "pulse-rings", 1, 1, 1).rings.every(r => r >= 0)).toBe(true);
  });
});

describe("Lage für alle Visuals", () => {
  it("Drehung per Mapping, alte Laser-Vorgabe Y 0,3 wird 0", () => {
    const c = ctx();
    setControl(c, "layer.2.laser.rot", 0.75);
    expect(c.show.layers[1]!.laser.rot).toBeCloseTo(90, 6);
    const json = JSON.parse(serializeProject(c, []));
    json.layers[0].laser = { x: 0, y: 0.3, size: 1, thick: 1 };
    const p = parseProject(JSON.stringify(json))!;
    expect(p.layers[0]!.laser.y).toBe(0);
    expect(p.layers[1]!.laser.rot).toBeCloseTo(90, 6);
  });
});

describe("Text-Clips", () => {
  it("Angaben werden geprüft und mit dem Projekt gespeichert", async () => {
    const { defaultText, parseTextSpec, textName } = await import("../src/core/text");
    const t = { ...defaultText(), text: "Hallo\nWelt", size: 99999, color: "rot" };
    const parsed = parseTextSpec(t)!;
    expect(parsed.size).toBe(900);
    expect(parsed.color).toBe("#ffffff");
    expect(parseTextSpec({ size: 3 })).toBeNull();
    expect(textName(parsed)).toBe("Hallo");
    const c = ctx();
    const json = serializeProject(c, [{ id: "a1b2c3d4e5f60708", name: "Hallo", width: 1920, height: 1080, text: defaultText() }]);
    expect(parseProject(json)!.media[0]!.text).toEqual(defaultText());
  });
});

describe("Projektionsmapping", () => {
  it("Einheitsquadrat landet genau auf den vier Ecken, Inverse führt zurück", async () => {
    const { squareToQuad, invert3, applyH } = await import("../src/core/layout");
    const q: [number, number][] = [[0.1, 0.2], [0.8, 0.05], [0.95, 0.9], [0.05, 0.7]];
    const H = squareToQuad(q);
    const unit: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];
    unit.forEach(([u, v], i) => { const [x, y] = applyH(H, u, v); expect(x).toBeCloseTo(q[i]![0], 9); expect(y).toBeCloseTo(q[i]![1], 9); });
    const inv = invert3(H)!;
    const [u, v] = applyH(inv, ...applyH(H, 0.3, 0.6));
    expect(u).toBeCloseTo(0.3, 9); expect(v).toBeCloseTo(0.6, 9);
    expect(invert3([0, 0, 0, 0, 0, 0, 0, 0, 0])).toBeNull();
  });
  it("Leinwände nur im Mapping-Modus und nur für ihren Ausgang; Ecken rasten ein; wird gespeichert", async () => {
    const { warpFor, newSurface, snapCorner } = await import("../src/core/layout");
    const s = newSurface(5, 1);
    const off = { ...newSurface(5, 2), on: false };
    expect(warpFor({ mode: "canvas", screens: [], surfaces: [s] }, 5)).toBeNull();
    expect(warpFor({ mode: "mapping", screens: [], surfaces: [s, off] }, 5)!.length).toBe(1);
    expect(warpFor({ mode: "mapping", screens: [], surfaces: [s] }, 7)!.length).toBe(0);
    expect(snapCorner([0.995, 0.5], [], 0.01)).toEqual([1, 0.5]);
    const c = ctx();
    const json = serializeProject(c, [], [], [], { mode: "mapping", screens: [], surfaces: [{ ...s, corners: [[0.1, 0.1], [0.9, 0.2], [0.8, 0.8], [0.2, 0.9]], src: { x: 0.5, y: 0, w: 0.5, h: 1 } }] });
    const p = parseProject(json)!;
    expect(p.outputs.mode).toBe("mapping");
    expect(p.outputs.surfaces![0]!.corners[1]).toEqual([0.9, 0.2]);
    expect(p.outputs.surfaces![0]!.src.x).toBe(0.5);
  });
});

describe("Leinwände mit eigenen Ebenen", () => {
  it("Bearbeiten wechselt den Stapel, Hauptbild bleibt unberührt", async () => {
    const { selectCanvas, mainLayers, MAIN_STACK } = await import("../src/core/show");
    const c = ctx();
    c.show.layers[0]!.clip = "tunnel";
    selectCanvas(c.show, "sA");
    expect(c.show.canvas).toBe("sA");
    c.show.layers[0]!.clip = "plasma";            // bearbeitet die Leinwand
    expect(mainLayers(c.show)[0]!.clip).toBe("tunnel");
    selectCanvas(c.show, MAIN_STACK);
    expect(c.show.layers[0]!.clip).toBe("tunnel");
    expect(c.show.stacks!.sA![0]!.clip).toBe("plasma");
  });
  it("Szenen speichern und rufen alle Leinwände ab, auch während eine Leinwand bearbeitet wird", async () => {
    const { selectCanvas, mainLayers } = await import("../src/core/show");
    const { addSceneFromCurrent, recallScene } = await import("../src/core/control");
    const c = ctx();
    c.show.layers[0]!.clip = "tunnel";
    selectCanvas(c.show, "sA"); c.show.layers[0]!.clip = "plasma";
    const i = addSceneFromCurrent(c, "Alles");
    c.show.layers[0]!.clip = "fire";
    mainLayers(c.show)[0]!.clip = "starfield";
    recallScene(c, i);
    expect(mainLayers(c.show)[0]!.clip).toBe("tunnel");
    expect(c.show.stacks!.sA![0]!.clip).toBe("plasma");
    expect(c.show.layers[0]!.clip).toBe("plasma");   // bearbeiteter Stapel ist dieselbe Leinwand
  });
  it("Leinwand-Ebenen werden gespeichert und geladen", async () => {
    const { selectCanvas } = await import("../src/core/show");
    const c = ctx();
    selectCanvas(c.show, "sB"); c.show.layers[1]!.clip = "laser-beams";
    const p = parseProject(serializeProject(c, []))!;
    expect(p.stacks!.sB![1]!.clip).toBe("laser-beams");
    const c2 = ctx(); applyProject(c2, p);
    expect(c2.show.canvas).toBe("main");
    expect(c2.show.stacks!.sB![1]!.clip).toBe("laser-beams");
  });
});

describe("Bilder im Projektionsmapping", () => {
  it("bis zu 5 Bilder, Bild 1 bleibt, Löschen räumt den Stapel auf", async () => {
    const { addImage, removeImage, imageList } = await import("../src/core/show");
    const c = ctx();
    const ids = [addImage(c.show), addImage(c.show), addImage(c.show), addImage(c.show)];
    expect(ids.every(Boolean)).toBe(true);
    expect(addImage(c.show)).toBeNull();
    expect(imageList(c.show).map(i => i.name)).toEqual(["Bild 1", "Bild 2", "Bild 3", "Bild 4", "Bild 5"]);
    removeImage(c.show, ids[1]!);
    expect(imageList(c.show).length).toBe(4);
    expect(c.show.stacks![ids[1]!]).toBeUndefined();
    removeImage(c.show, "main");
    expect(imageList(c.show)[0]!.id).toBe("main");
  });
  it("Leinwand zeigt ihr Bild; alte „eigene Ebenen“ werden ein Bild", async () => {
    const { warpFor, newSurface } = await import("../src/core/layout");
    const s = { ...newSurface(5, 1), image: "b2" };
    expect(warpFor({ mode: "mapping", screens: [], surfaces: [s] }, 5)![0]!.stack).toBe("b2");
    expect(warpFor({ mode: "mapping", screens: [], surfaces: [{ ...s, image: "main" }] }, 5)![0]!.stack).toBeUndefined();
    // altes Projekt: Leinwand mit content „own“ und Stapel unter ihrer ID
    const c = ctx();
    const raw = JSON.parse(serializeProject(c, [], [], [], { mode: "mapping", screens: [], surfaces: [{ ...newSurface(5, 1), id: "sOld", content: "own" } as never] }));
    raw.stacks = { sOld: raw.layers };
    delete raw.images;
    const p = parseProject(JSON.stringify(raw))!;
    expect(p.outputs.surfaces![0]!.image).toBe("sOld");
    const c2 = ctx(); applyProject(c2, p);
    const { imageList } = await import("../src/core/show");
    expect(imageList(c2.show).map(i => i.id)).toEqual(["main", "sOld"]);
  });
});

describe("Timeline: Szenen-Marker im Video", () => {
  it("löst Marker beim Überqueren aus, im Loop auch nach dem Sprung, bei Rücksprung nur den letzten Stand", async () => {
    const { fireMarks, newCue } = await import("../src/core/video");
    const c = newCue("video", "Film", "vid:0011223344556677");
    c.marks = [{ t: 5, scene: 2, others: true }, { t: 10, scene: 3, others: false }];
    const calls: [number, boolean | undefined][] = [];
    const env = { duration: () => 20, recallScene: (i: number, o?: boolean) => { calls.push([i, o]); } };
    const ac = { uid: "x", cueId: c.id, startMs: 0, releasedMs: null, fadeOutMs: null, fadeOutDur: 0, endHandled: false, fired: false } as import("../src/core/video").ActiveCue;
    fireMarks(c, ac, 1, false, env); expect(calls).toEqual([]);
    fireMarks(c, ac, 6, false, env); expect(calls).toEqual([[1, true]]);
    fireMarks(c, ac, 12, false, env); expect(calls.at(-1)).toEqual([2, false]);
    // Loop: von 18 zurück auf 6 → Marker 5 kommt wieder
    fireMarks(c, ac, 18, true, env); calls.length = 0;
    fireMarks(c, ac, 6, true, env); expect(calls).toEqual([[1, true]]);
    // Rücksprung ohne Loop (Timecode): nur der Stand des letzten Markers davor
    fireMarks(c, ac, 15, false, env); calls.length = 0;
    fireMarks(c, ac, 7, false, env); expect(calls).toEqual([[1, true]]);
  });
  it("Szene ohne das SHOW-Bild abrufen; Marker werden gespeichert", async () => {
    const { selectCanvas, mainLayers, addImage } = await import("../src/core/show");
    const { addSceneFromCurrent, recallScene } = await import("../src/core/control");
    const c = ctx();
    const b2 = addImage(c.show)!;
    mainLayers(c.show)[0]!.clip = "tunnel"; c.show.stacks![b2]![0]!.clip = "plasma";
    const i = addSceneFromCurrent(c, "S");
    mainLayers(c.show)[0]!.clip = "fire"; c.show.stacks![b2]![0]!.clip = "fire";
    recallScene(c, i, 0, ["main"]);
    expect(mainLayers(c.show)[0]!.clip).toBe("fire");       // SHOW-Bild bleibt
    expect(c.show.stacks![b2]![0]!.clip).toBe("plasma");     // andere Bilder wechseln
    selectCanvas(c.show, "main");
    const { newCue } = await import("../src/core/video");
    const cue = newCue("video", "Film", "vid:0011223344556677"); cue.marks = [{ t: 3.5, scene: 1, others: true }];
    c.cues.list = [cue];
    const p = parseProject(serializeProject(c, []))!;
    expect(p.cues[0]!.marks).toEqual([{ t: 3.5, scene: 1, others: true }]);
  });
});

describe("Timeline-Cue", () => {
  it("Spulen setzt die Stelle, Bild-Cues haben Sekunden als Zeit, Aufnahme meldet nur Abrufe von Hand", async () => {
    const { newCue, cueSeek, cueTime, timelineSpan } = await import("../src/core/video");
    const { recallScene } = await import("../src/core/control");
    const c = ctx();
    const img = newCue("image", "Standbild", "img:a1b2c3d4e5f60708"); img.hold = 30; img.timeline = true;
    c.cues.list = [img];
    const ac = { uid: "u", cueId: img.id, startMs: 1000, releasedMs: null, fadeOutMs: null, fadeOutDur: 0, endHandled: false, fired: false } as import("../src/core/video").ActiveCue;
    c.cues.run.active = [ac];
    expect(timelineSpan(img, 0)).toEqual([0, 30]);
    expect(cueTime(img, ac, 6000, 0).t).toBeCloseTo(5, 6);
    expect(cueSeek(c.cues, img.id, 12, 6000, 0)).toBe(true);
    expect(cueTime(img, ac, 6000, 0).t).toBeCloseTo(12, 6);
    const seen: number[] = [];
    c.onSceneRecall = i => seen.push(i);
    recallScene(c, 1, 0);                 // von Hand
    recallScene(c, 2, 0, [], true);       // aus dem Ablauf (Marker)
    expect(seen).toEqual([1]);
    const p = parseProject(serializeProject(c, []))!;
    expect(p.cues[0]!.timeline).toBe(true);
  });
});

describe("Timeline-Blöcke mit Länge", () => {
  it("Blockende ruft die Ausgangsszene ab, angrenzende Blöcke lassen keine Lücke", async () => {
    const { fireMarks, newCue, timelineEvents } = await import("../src/core/video");
    const c = newCue("video", "Film", "vid:0011223344556677");
    c.marks = [{ t: 2, scene: 3, others: true, len: 2 }, { t: 6, scene: 4, others: true, len: 1 }, { t: 7, scene: 5, others: false }];
    expect(timelineEvents(c.marks).map(e => [e.t, e.scene])).toEqual([[2, 3], [4, 0], [6, 4], [7, 5]]);
    const calls: number[] = [];
    const env = { duration: () => 20, recallScene: (i: number) => { calls.push(i + 1); }, currentScene: () => 1 };
    const ac = { uid: "x", cueId: c.id, startMs: 0, releasedMs: null, fadeOutMs: null, fadeOutDur: 0, endHandled: false, fired: false } as import("../src/core/video").ActiveCue;
    fireMarks(c, ac, 0.5, false, env);   // Start: Ausgangsszene 1 gemerkt
    fireMarks(c, ac, 3, false, env);
    fireMarks(c, ac, 5, false, env);     // Blockende bei 4 → Szene 1
    expect(calls).toEqual([3, 1]);
  });
});

describe("Timeline-Blöcke überlappend", () => {
  it("Ende eines Blocks führt nicht zur Ausgangsszene, wenn ein anderer Block noch läuft", async () => {
    const { timelineEvents } = await import("../src/core/video");
    const ev = timelineEvents([{ t: 1, scene: 2, others: true, len: 5 }, { t: 5.2, scene: 3, others: true, len: 1.6 }]);
    expect(ev.map(e => [Math.round(e.t * 100) / 100, e.scene])).toEqual([[1, 2], [5.2, 3], [6.8, 0]]);
  });
});

describe("Timeline: Effekte und Helligkeit", () => {
  it("Effekt-Blöcke wirken nur während ihrer Dauer, Helligkeit nur auf die betroffenen Bilder", async () => {
    const { newCue, timelineOverride } = await import("../src/core/video");
    const c = ctx();
    const cue = newCue("image", "Stand", "img:a1b2c3d4e5f60708"); cue.hold = 30;
    cue.fx = [{ t: 2, len: 1, kind: "blinder" }, { t: 5, len: 2, kind: "strobe" }];
    cue.marks = [{ t: 0, scene: 1, others: true, len: 10, level: 0.4 }];
    c.cues.list = [cue];
    c.cues.run.active = [{ uid: "u", cueId: cue.id, startMs: 0, releasedMs: null, fadeOutMs: null, fadeOutDur: 0, endHandled: false, fired: false }];
    const env = { duration: () => 0, recallScene: () => {} };
    const at = (s: number) => timelineOverride(c.cues, s * 1000, env, ["main", "b2"], "main")!;
    expect([...at(2.5).fx]).toEqual(["blinder"]);
    expect([...at(6).fx]).toEqual(["strobe"]);
    expect(at(4).fx.size).toBe(0);
    expect(at(4).gains).toEqual({ b2: 0.4 });           // SHOW-Bild (main) bleibt hell
    expect(at(12).gains).toEqual({});
    const p = parseProject(serializeProject(c, []))!;
    expect(p.cues[0]!.fx).toEqual(cue.fx);
    expect(p.cues[0]!.marks![0]!.level).toBe(0.4);
  });
  it("Blinder ist ein Bedienelement", () => {
    const c = ctx();
    setControl(c, "blinder", 1);
    expect(c.show.blinder).toBe(1);
  });
});

describe("Raster-Verzerrung", () => {
  it("Raster aus den Ecken, Fläche läuft durch alle Stützpunkte, Netz und Speichern", async () => {
    const { gridFromCorners, gridCorners, gridPoint, meshTriangles, warpFor, newSurface } = await import("../src/core/layout");
    const corners: [number, number][] = [[0.1, 0.1], [0.9, 0.2], [0.8, 0.9], [0.2, 0.8]];
    const g = gridFromCorners(corners, 3);
    expect(gridCorners(g)).toEqual(corners.map(c => [expect.closeTo(c[0], 9), expect.closeTo(c[1], 9)]));
    g.pts[4] = [0.6, 0.4];                       // Mitte verschieben
    const mid = gridPoint(g, 0.5, 0.5);
    expect(mid[0]).toBeCloseTo(0.6, 9); expect(mid[1]).toBeCloseTo(0.4, 9);
    const c0 = gridPoint(g, 0, 0); expect(c0[0]).toBeCloseTo(0.1, 9);
    expect(meshTriangles(g, 8).length).toBe(8 * 8 * 6 * 4);
    const s = { ...newSurface(5, 1), grid: g };
    expect(warpFor({ mode: "mapping", screens: [], surfaces: [s] }, 5)![0]!.mesh).toBeInstanceOf(Float32Array);
    const c = ctx();
    const p = parseProject(serializeProject(c, [], [], [], { mode: "mapping", screens: [], surfaces: [s] }))!;
    expect(p.outputs.surfaces![0]!.grid!.n).toBe(3);
    expect(p.outputs.surfaces![0]!.grid!.pts[4]).toEqual([0.6, 0.4]);
  });
});

describe("Ausgabe und Mapping: Masken, Bühnenfoto, feste Bild-Kanäle", () => {
  it("Maske: Punkt innen/außen, nur im Mapping-Modus und nur für den eigenen Beamer", async () => {
    const { inMask, masksFor, newMask } = await import("../src/core/layout");
    const m = newMask(7, 1);
    expect(inMask(m.pts, 0.5, 0.5)).toBe(true);
    expect(inMask(m.pts, 0.1, 0.5)).toBe(false);
    expect(masksFor({ mode: "canvas", screens: [], masks: [m] }, 7)).toEqual([]);
    expect(masksFor({ mode: "mapping", screens: [], masks: [m] }, 7)).toHaveLength(1);
    expect(masksFor({ mode: "mapping", screens: [], masks: [m] }, 8)).toHaveLength(0);
    expect(masksFor({ mode: "mapping", screens: [], masks: [{ ...m, on: false }] }, 7)).toHaveLength(0);
  });
  it("Masken und Bühnenfotos überstehen Speichern und Laden; Unfug fällt weg", () => {
    const c = ctx();
    const photo = "data:image/jpeg;base64,AAAA";
    c.photos = { "7": { url: photo, opacity: 0.4 } };
    const layout = { mode: "mapping" as const, screens: [], masks: [{ id: "m1", screen: 7, name: "Tür", pts: [[0, 0], [1, 0], [1, 1]] as [number, number][], invert: true, feather: 30, on: true }] };
    const json = serializeProject(c, [], [], [], layout);
    const p = parseProject(json)!;
    expect(p.photos?.["7"]).toEqual({ url: photo, opacity: 0.4 });
    expect(p.outputs?.masks?.[0]).toMatchObject({ name: "Tür", invert: true, feather: 30 });
    const bad = parseProject(JSON.stringify({ ...JSON.parse(json), photos: { "7": { url: "javascript:alert(1)", opacity: 1 }, x: { url: photo } } }))!;
    expect(bad.photos).toEqual({});
  });
  it("Feste Regler je Bild wirken unabhängig vom bearbeiteten Bild", async () => {
    const { addImage, selectCanvas, mainLayers, MAIN_STACK } = await import("../src/core/show");
    const c = ctx();
    const b = addImage(c.show)!;
    selectCanvas(c.show, b);
    setControl(c, "bild.1.e1", 0.25);
    expect(mainLayers(c.show)[0]!.opacity).toBe(0.25);
    expect(c.show.stacks![b]![0]!.opacity).not.toBe(0.25);
    setControl(c, "bild.2.hell", 0.5);
    expect(c.show.stackGain?.[b]).toBe(0.5);
    selectCanvas(c.show, MAIN_STACK);
    setControl(c, "bild.2.bearbeiten", 1);
    expect(c.show.canvas).toBe(b);
    expect(resolveControl("bild.3.hell")!.get(c)).toBe(0); // Bild 3 gibt es nicht
  });
  it("DMX: Ebenen-Kanäle bleiben bei Bild 1, Bild-Kanäle steuern Helligkeit und Ebenen der anderen Bilder", async () => {
    const { addImage, selectCanvas, mainLayers } = await import("../src/core/show");
    const c = ctx();
    const b = addImage(c.show)!;
    selectCanvas(c.show, b);
    const d = new DmxDecoder(1);
    const f = new Uint8Array(512);
    f[CH.layerBase - 1] = 51; f[CH.imageGainBase] = 128; f[CH.imageLayerBase - 1] = 255;
    d.decode(f, c.show);
    expect(mainLayers(c.show)[0]!.opacity).toBeCloseTo(0.2);
    expect(c.show.stackGain?.[b]).toBeCloseTo(128 / 255);
    expect(c.show.stacks![b]![0]!.opacity).toBe(1);
  });
});

describe("LJ-Link PRO", () => {
  const deck = (o: Record<string, unknown>) => JSON.stringify({ type: "deck", deck: 1, name: "CDJ-3000", playing: true, onAir: true, master: true,
    effectiveBpm: 126, key: "8A", title: "Eins", artist: "A", trackNumber: 1, durationMs: 240000, hasTrack: true, loop: null, loopBeats: 0, ...o });
  it("erst nach dem LJ-Link-Zustand wird übersetzt; Decks, Tempo, Privatsphäre", async () => {
    const { LjProAdapter } = await import("../src/core/ljpro");
    const a = new LjProAdapter();
    expect(a.feed(deck({}))).toEqual([]); // fremder Dienst auf Port 8080: nichts
    const hello = a.feed(JSON.stringify({ type: "state", phase: "monitoring", privacy: true }));
    expect(hello[0]).toMatchObject({ t: "hello", privacy: true });
    const d = a.feed(deck({}));
    expect(d[0]).toMatchObject({ t: "deck", deck: { deck: 1, bpm: 126, master: true, key: "8A", title: "Eins" } });
    const c = ctx();
    for (const m of [...hello, ...d]) handleLj(c, m, 1000);
    expect(c.lj.connected).toBe(true);
    expect(c.lj.decks.get(1)?.title).toBeUndefined(); // Privatsphäre-Modus
    expect(c.lj.masterDeck).toBe(1);
  });
  it("erkennt Trackwechsel, Master-Wechsel, Loop und verschwundene Decks", async () => {
    const { LjProAdapter } = await import("../src/core/ljpro");
    const a = new LjProAdapter();
    a.feed(JSON.stringify({ type: "state", phase: "monitoring" }));
    a.feed(deck({}));
    expect(a.feed(deck({})).filter(m => m.t === "event")).toEqual([]);
    expect(a.feed(deck({ title: "Zwei", trackNumber: 2 })).find(m => m.t === "event")).toMatchObject({ kind: "track", deck: 1 });
    expect(a.feed(deck({ title: "Zwei", trackNumber: 2, loop: { start: 1 }, loopBeats: 4 })).find(m => m.t === "event")).toMatchObject({ kind: "loop", active: true, beats: 4 });
    a.feed(deck({ master: false }));
    expect(a.feed(deck({ deck: 2, master: true, title: "Drei" })).find(m => m.t === "event")).toMatchObject({ kind: "track", deck: 2 });
    expect(a.feed(JSON.stringify({ type: "deckGone", deck: 2 }))).toEqual([{ t: "gone", deck: 2 }]);
    const c = ctx();
    handleLj(c, { t: "deck", deck: { deck: 2, playing: true, onAir: true, master: true, bpm: 120 } }, 0);
    handleLj(c, { t: "gone", deck: 2 }, 0);
    expect(c.lj.decks.size).toBe(0);
    expect(a.clear().map(m => m.t)).toEqual(["gone"]);
  });
});

describe("LJ-Link PRO: Stand und Positionen", () => {
  it("Positionen halten den Master-Deck lebendig (höchstens 4× pro Sekunde), Stand lässt sich nachreichen", async () => {
    const { LjProAdapter } = await import("../src/core/ljpro");
    const a = new LjProAdapter();
    a.feed(JSON.stringify({ type: "state", phase: "monitoring" }), 0);
    a.feed(JSON.stringify({ type: "deck", deck: 1, master: true, playing: true, effectiveBpm: 128, durationMs: 200000, title: "X" }), 0);
    expect(a.feed(JSON.stringify({ type: "pos", deck: 1, p: 100000, v: 1 }), 100)).toEqual([{ t: "pos", deck: 1, ms: 100000, v: 1 }]);
    const out = a.feed(JSON.stringify({ type: "pos", deck: 1, p: 100000, v: 1 }), 300);
    expect(out.find(m => m.t === "deck")).toMatchObject({ t: "deck", deck: { bpm: 128, position: 0.5, durationMs: 200000 } });
    const snap = a.snapshot();
    expect(snap.map(m => m.t)).toEqual(["hello", "deck"]);
  });
});

describe("LJ-Link PRO: eigener Endpunkt /vjlink", () => {
  it("nimmt VJ-Link-Protokoll direkt, erst nach hello; merkt den Stand", async () => {
    const { LjNativeTracker } = await import("../src/core/ljpro");
    const t = new LjNativeTracker();
    const deck = JSON.stringify({ t: "deck", deck: { deck: 1, playing: true, onAir: true, master: true, bpm: 126 } });
    expect(t.feed(deck)).toEqual([]);
    expect(t.feed(JSON.stringify({ t: "hello", version: 1, privacy: false }))).toHaveLength(1);
    expect(t.feed(deck)).toHaveLength(1);
    expect(t.feed(JSON.stringify({ t: "tempo", bpm: 126, beat: 12.5 }))[0]).toMatchObject({ t: "tempo", beat: 12.5 });
    expect(t.snapshot().map(m => m.t)).toEqual(["hello", "deck"]);
    expect(t.clear()).toEqual([{ t: "gone", deck: 1 }]);
    expect(t.feed("{kaputt")).toEqual([]);
  });
});

describe("LJ-Link PRO: Cover, Wellenform, Position", () => {
  it("Pfade für Cover und Wellenform, Privatsphäre entfernt das Cover, Position wird gemerkt", async () => {
    const { LjProAdapter } = await import("../src/core/ljpro");
    const a = new LjProAdapter();
    a.feed(JSON.stringify({ type: "state", phase: "monitoring" }));
    const [m] = a.feed(JSON.stringify({ type: "deck", deck: 2, master: true, playing: true, effectiveBpm: 124, title: "T", artist: "A",
      hasArt: true, artVersion: 3, hasDetail: true, detailVersion: 5, detailStyle: "threeband", durationMs: 1000 }));
    expect(m).toMatchObject({ t: "deck", deck: { art: "/api/deck/2/art?v=3", detail: "/api/deck/2/detail?v=5", detailStyle: "threeband" } });
    const c = ctx();
    handleLj(c, { t: "hello", version: 1, privacy: true }, 0);
    handleLj(c, m!, 0);
    expect(c.lj.decks.get(2)?.art).toBeUndefined();
    expect(c.lj.decks.get(2)?.detail).toBe("/api/deck/2/detail?v=5");
    handleLj(c, { t: "pos", deck: 2, ms: 500, v: 1 }, 42);
    expect(c.lj.pos.get(2)).toEqual({ ms: 500, v: 1, at: 42 });
  });
});

import { camClip, ensureCamera, isCamClip } from "../src/core/camera";
describe("Kameras", () => {
  it("anlegen, wiederfinden über Gerät oder Namen", () => {
    const list: { id: string; deviceId: string; label: string }[] = [];
    const a = ensureCamera(list, "dev1", "FaceTime HD");
    expect(ensureCamera(list, "dev1", "FaceTime HD").id).toBe(a.id);
    const b = ensureCamera(list, "dev2-neu", "FaceTime HD"); // neue Geräte-ID, gleicher Name
    expect(b.id).toBe(a.id); expect(b.deviceId).toBe("dev2-neu");
    expect(ensureCamera(list, "obs", "OBS Virtual Camera").id).not.toBe(a.id);
    expect(isCamClip(camClip(a.id))).toBe(true);
  });
  it("Projekt speichert Kameras, Kamera-Clips und Silhouette", () => {
    const c = ctx();
    const cam = ensureCamera(c.show.cameras, "dev1", "OBS Virtual Camera");
    const l = c.show.layers[1]!;
    addClip(l, camClip(cam.id)); l.clip = camClip(cam.id);
    l.cam = { mirror: true, look: "silhouette", tol: 0.4, bgStamp: 123, cells: 48, onlyFig: false };
    c.cues.list.push(newCue("camera", "Kamera", camClip(cam.id)));
    const p = parseProject(serializeProject(c, []))!;
    expect(p.cameras).toEqual([{ id: cam.id, deviceId: "dev1", label: "OBS Virtual Camera" }]);
    expect(p.layers[1]!.clip).toBe(camClip(cam.id));
    expect(p.layers[1]!.cam).toEqual({ mirror: true, look: "silhouette", tol: 0.4, bgStamp: 123, cells: 48, onlyFig: false });
    expect(p.cues.at(-1)!.kind).toBe("camera");
    expect(p.cues.at(-1)!.media).toBe(camClip(cam.id));
    expect(parseProject(JSON.stringify({ version: 1, layers: [{ clip: "cam:../x" }] }))!.layers[0]!.clip).toBeNull();
  });
  it("Kamera-Cue wird gezeichnet wie ein Bild (steht, bis WEITER)", () => {
    const s = { list: [newCue("camera", "Kamera", "cam:abcd1234")], run: { active: [{ uid: "u1", cueId: "", startMs: 0, fadeOutMs: null, releasedMs: null }], next: 1, current: 0 } } as never as Parameters<typeof cueRenders>[0];
    (s.run.active[0] as { cueId: string }).cueId = s.list[0]!.id;
    const r = cueRenders(s, 5000, { duration: () => 0 } as never);
    expect(r.length).toBe(1);
    expect(r[0]!.kind).toBe("camera");
    expect(r[0]!.rate).toBe(0);
  });
});

describe("LJ-Link im Netz finden (Bonjour)", () => {
  const own = [{ addr: "10.69.10.103", prefix: 24 }, { addr: "192.168.1.20", prefix: 24 }];
  it("fasst WLAN und Kabel zusammen und nimmt für diesen Rechner 127.0.0.1", async () => {
    const { foundFromService, planAttempts } = await import("../src/core/ljdiscover");
    const a = foundFromService({ name: "LJ Link (MBP) :8097", port: 8097, addresses: ["10.69.10.103"], txt: { vjlink: "1", path: "/vjlink", app: "1.7.6" } })!;
    const b = foundFromService({ name: "LJ Link (MBP) :8097 (2)", port: 8097, addresses: ["10.69.10.146"], txt: { vjlink: "1", path: "/vjlink" } })!;
    const plan = planAttempts("", [a, b], own);
    expect(plan[0]).toEqual({ auth: "127.0.0.1:8097", path: "/vjlink", native: true, label: "LJ Link (MBP) :8097" });
    expect(plan.filter(p => p.auth.endsWith(":8097") && p.native)).toHaveLength(1);
    // Zum Schluss immer dieser Rechner auf 8080 (ältere LJ-Link-Versionen ohne Bonjour)
    expect(plan.slice(-2).map(p => `${p.auth}${p.path}`)).toEqual(["127.0.0.1:8080/vjlink", "127.0.0.1:8080/ws"]);
  });
  it("bevorzugt die Adresse im eigenen Subnetz, ignoriert IPv6 und Unfug", async () => {
    const { foundFromService, pickAddress, planAttempts } = await import("../src/core/ljdiscover");
    expect(pickAddress(["172.16.0.9", "192.168.1.77", "fe80::1"], own)).toEqual({ addr: "192.168.1.77", rank: 1 });
    expect(pickAddress(["172.16.0.9"], own)).toEqual({ addr: "172.16.0.9", rank: 2 });
    expect(pickAddress(["fe80::1"], own)).toBeNull();
    expect(foundFromService({ name: "x", port: 99999, addresses: ["1.2.3.4"] })).toBeNull();
    const f = foundFromService({ name: "LJ Link (Pult)", port: 8080, addresses: ["192.168.1.50"], txt: { path: "/../evil" } })!;
    expect(f.path).toBeNull(); // ohne vjlink=1: nur Weboberfläche
    expect(planAttempts("", [f], own)[0]).toMatchObject({ auth: "192.168.1.50:8080", path: "/ws", native: false });
  });
  it("feste Adresse hat Vorrang (mit und ohne Port)", async () => {
    const { planAttempts, ljAuthority } = await import("../src/core/ljdiscover");
    expect(planAttempts("10.0.0.5", [], own).map(p => `${p.auth}${p.path}`)).toEqual(["10.0.0.5:8080/vjlink", "10.0.0.5:8080/ws"]);
    expect(ljAuthority("10.0.0.5:8097")).toBe("10.0.0.5:8097");
    expect(ljAuthority("fe80::2")).toBe("[fe80::2]:8080");
  });
});

import { CAM_LOOKS, isMaskLook, usesCells, usesFigure } from "../src/core/camera";
describe("Kamera-Darstellungen", () => {
  it("alle Looks werden gespeichert, unbekannte fallen auf Normal", () => {
    expect(CAM_LOOKS.length).toBe(10);
    for (const lk of CAM_LOOKS) {
      const p = parseProject(JSON.stringify({ version: 1, layers: [{ clip: "cam:abcd1234", cam: { look: lk, cells: 70, onlyFig: true } }] }))!;
      expect(p.layers[0]!.cam.look).toBe(lk);
      expect(p.layers[0]!.cam.cells).toBe(70);
      expect(p.layers[0]!.cam.onlyFig).toBe(true);
    }
    expect(parseProject(JSON.stringify({ version: 1, layers: [{ cam: { look: "laser", cells: 9999 } }] }))!.layers[0]!.cam).toMatchObject({ look: "normal", cells: 160 });
  });
  it("welche Looks die Person brauchen bzw. ein Raster haben", () => {
    expect(isMaskLook("mask-in") && isMaskLook("mask-out")).toBe(true);
    expect(usesFigure("silhouette", false)).toBe(true);
    expect(usesFigure("dots", false)).toBe(false);
    expect(usesFigure("dots", true)).toBe(true);
    expect(usesCells("ascii") && usesCells("halftone") && !usesCells("thermal")).toBe(true);
  });
});

import { HISTORY_FX } from "../src/engine/shaders";
describe("Techno-Effekte", () => {
  it("Effekte mit Gedächtnis gibt es im Stapel, alle neuen sind wählbar", () => {
    for (const id of HISTORY_FX) expect(POST_IDS as readonly string[]).toContain(id);
    for (const id of ["datamosh", "echo", "stutter", "zoom-blur", "tiles", "edges", "one-bit", "shake", "polar", "liquid", "slices", "hue-cycle", "posterize", "beat-invert"])
      expect(POST_EFFECTS.map(e => e.id)).toContain(id);
    expect(POST_EFFECTS.length).toBe(50);
  });
});

import { FRAG, POST_FRAG } from "../src/engine/shaders";
describe("Shader-Zweige", () => {
  it("jedes Visual hat einen eigenen Fall im Generator-Shader (außer den Overlays Now Playing und DJ-Wellenform)", () => {
    GEN_IDS.forEach((id, i) => {
      if (id === "now-playing" || id === "dj-waveform") return;
      expect(FRAG, id).toContain(`case ${i}: c = `);
    });
  });
  it("jeder Effekt hat einen eigenen Zweig im Effekt-Shader (Farbüberlagerung ist der Rest-Zweig)", () => {
    POST_IDS.forEach((id, i) => { if (id !== "tint") expect(POST_FRAG, id).toContain(`uEffect == ${i})`); });
  });
});

import { applyDemo } from "../src/core/demo";
describe("Demo-Projekt", () => {
  const media = { title: "img:aaaaaa11", label: "img:bbbbbb22", logo: "img:cccccc33" };
  it("baut acht Ebenen, zehn Szenen, Modulationen und einen SHOW-Ablauf mit Timeline", () => {
    const c = ctx();
    applyDemo(c, media);
    expect(c.show.layers.length).toBe(8);
    expect(c.scenes.length).toBe(10);
    expect(c.mods!.length).toBeGreaterThanOrEqual(5);
    expect(c.cues.list.some(q => q.timeline && (q.marks?.length ?? 0) > 3 && (q.fx?.length ?? 0) > 3)).toBe(true);
    expect(c.show.autoVj).toBe(true);
    expect(c.show.scene).toBe(1);
    expect(c.show.layers[7]!.clip).toBe(media.logo);
    // Jeder Clip ist ein bekanntes Visual oder eine der Grafiken, jeder Effekt existiert
    const known = new Set<string>([...GEN_IDS, ...Object.values(media)]);
    for (const l of c.show.layers) {
      for (const id of l.clips) expect(known.has(id), id).toBe(true);
      for (const e of l.effects) expect(POST_IDS as readonly string[]).toContain(e.id);
      expect(l.effects.length).toBeLessThanOrEqual(6);
    }
    for (const sc of c.scenes) for (const l of sc.layers) {
      if (l?.clip) expect(known.has(l.clip), `${sc.name}: ${l.clip}`).toBe(true);
      for (const e of l?.effects ?? []) expect(POST_IDS as readonly string[], sc.name).toContain(e.id);
    }
  });
  it("übersteht Speichern und Laden unverändert", () => {
    const c = ctx();
    applyDemo(c, media);
    const json = serializeProject(c, []);
    const p = parseProject(json)!;
    expect(p).not.toBeNull();
    expect(p.layers.length).toBe(8);
    expect(p.layers.map(l => l.clips.length)).toEqual(c.show.layers.map(l => l.clips.length));
    expect(p.layers.map(l => l.effects.map(e => e.id))).toEqual(c.show.layers.map(l => l.effects.map(e => e.id)));
    expect(p.scenes.map(s => s.name)).toEqual(c.scenes.map(s => s.name));
    expect(p.mods?.length).toBe(c.mods!.length);
    expect(p.cues.length).toBe(4);
    expect(p.cues[1]!.marks?.length).toBe(6);
  });
});

import { assetName, isNewer, pickRelease } from "../src/core/update";
import { detectLang, entry, I18N_KEYS, setLang, t } from "../src/core/i18n";
describe("Updates", () => {
  it("vergleicht Versionen wie LJ-Link", () => {
    expect(isNewer("0.2.0", "0.1.0")).toBe(true);
    expect(isNewer("v1.10.0", "1.9.9")).toBe(true);
    expect(isNewer("1.0.0", "1.0.0")).toBe(false);
    expect(isNewer("0.9.9", "1.0.0")).toBe(false);
    expect(isNewer("", "1.0.0")).toBe(false);
  });
  it("wählt das passende Paket je Rechner", () => {
    expect(assetName("darwin", "arm64")).toBe("VJ-Link-macos-arm64.dmg");
    expect(assetName("darwin", "x64")).toBe("VJ-Link-macos-intel.dmg");
    expect(assetName("win32", "x64")).toBe("VJ-Link-windows.exe");
    const rel = pickRelease({ tag_name: "v0.2.0", html_url: "https://github.com/skyplayser/VJ-LINK/releases/tag/v0.2.0", body: "Neu:\n- Demo\n",
      assets: [{ name: "VJ-Link-macos-arm64.dmg", browser_download_url: "https://github.com/x/y.dmg", size: 1234 }] }, "darwin", "arm64")!;
    expect(rel.version).toBe("0.2.0");
    expect(rel.url).toBe("https://github.com/x/y.dmg");
    expect(rel.size).toBe(1234);
    expect(pickRelease({ tag_name: "v0.2.0", assets: [] }, "win32", "x64")!.url).toBeNull();
    expect(pickRelease("Quatsch", "darwin", "arm64")).toBeNull();
  });
});
describe("Sprache", () => {
  it("erkennt die Systemsprache und übersetzt", () => {
    expect(detectLang(["de-DE", "en-US"])).toBe("de");
    expect(detectLang(["fr-FR", "en-GB"])).toBe("en");
    expect(detectLang(["ja-JP"])).toBe("en");
    setLang("en"); expect(t("start.demo")).toBe("Open demo");
    expect(t("upd.available", { v: "1.2" })).toBe("Version 1.2 is available.");
    setLang("de"); expect(t("start.demo")).toBe("Demo öffnen");
  });
  it("hat für jeden Text Deutsch und Englisch", () => {
    for (const k of I18N_KEYS()) { const e = entry(k)!; expect(e.de, k).toBeTruthy(); expect(e.en, k).toBeTruthy(); }
  });
  it("hat für jedes Visual und jeden Effekt einen englischen Namen", () => {
    for (const e of EFFECTS) { const en = EFFECT_EN[e.id]; expect(en?.[0], e.id).toBeTruthy(); expect(en?.[1], e.id).toBeTruthy(); }
    for (const p of POST_EFFECTS) { const en = POST_EN[p.id]; expect(en?.[0], p.id).toBeTruthy(); expect(en?.[1], p.id).toBeTruthy(); }
    for (const c of Object.keys(CATEGORY_LABEL)) expect(CATEGORY_EN[c as keyof typeof CATEGORY_EN], c).toBeTruthy();
  });
  it("übersetzt jeden Text im Code und in index.html", () => {
    const missing: string[] = [];
    const need = (k: string, where: string) => { if (!entry(k)?.en) missing.push(`${where}: ${k}`); };
    const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true })
      .flatMap(x => x.isDirectory() ? walk(join(d, x.name)) : x.name.endsWith(".ts") ? [join(d, x.name)] : []);
    for (const f of walk("src")) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/(?<![\w.$])t\(\s*("(?:[^"\\\n]|\\.)*")/g)) need(JSON.parse(m[1]!) as string, f);
    }
    const html = readFileSync("src/renderer/index.html", "utf8").replace(/&amp;/g, "&");
    for (const m of html.matchAll(/<[a-z0-9]+([^>]*)>([^<]*)/g)) {
      const attrs = m[1]!, at = (n: string) => new RegExp(`\\s${n}="([^"]*)"`).exec(attrs)?.[1];
      if (/\sdata-i18n(?=[\s=>]|$)/.test(attrs)) need(at("data-i18n") || m[2]!.trim(), "index.html");
      if (/\sdata-i18n-title/.test(attrs)) need(at("title")!, "index.html title");
      if (/\sdata-i18n-aria/.test(attrs)) need(at("aria-label")!, "index.html aria-label");
      if (/\sdata-i18n-ph/.test(attrs)) need(at("placeholder")!, "index.html placeholder");
    }
    expect(missing).toEqual([]);
  });
});

import { firstLine, formatDiagnostics, issueLink, mailLink, MAIL_LIMIT, REPORT_MAIL } from "../src/core/report";
describe("Fehler melden", () => {
  const diag = formatDiagnostics([{ title: "VJ-Link", lines: ["Version 0.0.1"] }]);
  it("baut Diagnose-Abschnitte wie LJ-Link", () => {
    expect(diag).toBe("== VJ-Link ==\nVersion 0.0.1\n");
    expect(firstLine("Absturz beim Start\nDetails", 80)).toBe("Absturz beim Start");
  });
  it("E-Mail mit Diagnose, zu lang → Datei anhängen", () => {
    const short = mailLink("Kamera schwarz", diag, "ANHANG");
    expect(short.url.startsWith(`mailto:${REPORT_MAIL}?subject=VJ-Link%3A%20Kamera%20schwarz`)).toBe(true);
    expect(short.attach).toBe(false);
    expect(decodeURIComponent(short.url)).toContain("== VJ-Link ==");
    const long = mailLink("Kamera schwarz", "x".repeat(MAIL_LIMIT * 2), "ANHANG");
    expect(long.attach).toBe(true);
    expect(decodeURIComponent(long.url)).toContain("ANHANG");
  });
  it("GitHub-Issue im öffentlichen Repo, lange Diagnose über die Zwischenablage", () => {
    const r = issueLink("Ausgang flackert", diag, "0.0.1", "hier einfügen");
    expect(r.url).toContain("github.com/skyplayser/VJ-LINK/issues/new?labels=bug&title=Ausgang%20flackert");
    expect(r.clipboard).toBe(false);
    expect(issueLink("x", "y".repeat(9000), "0.0.1", "hier").clipboard).toBe(true);
  });
});

describe("Fehlerbericht", () => {
  it("entfernt Benutzernamen aus Pfaden", () => {
    expect(scrubPaths("at file:///Users/philipp/VJ-Link/app.js:3")).toBe("at file:///Users/…/VJ-Link/app.js:3");
    expect(scrubPaths("C:\\Users\\Max Muster\\Desktop")).toBe("C:\\Users\\…\\Desktop");
    expect(scrubPaths("/home/anna/x")).toBe("/home/…/x");
  });
});

describe("Testtag: Live-Sicherheit", () => {
  it("frisch gepatchtes Pult (alles 0) lässt die Farbslots stehen", () => {
    const s = defaultShow();
    const before = s.slots.map(x => [...x]);
    const dec = new DmxDecoder(1);
    dec.decode(new Uint8Array(512), s);
    expect(s.slots).toEqual(before);
    // Bewegt das Pult einen Slot-Kanal, gehören alle 4 Kanäle dieses Slots dem Pult
    const f = new Uint8Array(512); f[CH.slotBase - 1] = 255; f[CH.slotBase] = 255; // Slot A: Dimmer, Rot
    dec.decode(f, s);
    expect(s.slots[0]).toEqual([1, 0, 0]);
    expect(s.slots[1]).toEqual(before[1]);
  });
  it("doppeltes WEITER innerhalb 400 ms überspringt keinen Cue", () => {
    const c = ctx();
    c.cueEnv = { duration: () => 10, startTc: () => null } as unknown as ControlContext["cueEnv"];
    c.cues.list = [newCue("black", "A"), newCue("black", "B"), newCue("black", "C")];
    expect(showGo(c, 1000)).toBe("started");
    expect(showGo(c, 1150)).toBe("blocked");
    expect(c.cues.run.current).toBe(0);
    expect(showGo(c, 1500)).toBe("started");
    expect(c.cues.run.current).toBe(1);
  });
});

describe("Testtag: Tempo-Faktor", () => {
  it("Faktor wirkt auch bei LJ-Link und lässt die Beat-Position nicht springen", () => {
    const c = new TempoClock();
    c.update("ljlink", 128, 0, 0);
    c.update("ljlink", 128, 600_000, 1280);
    expect(c.bpm).toBe(128);
    const before = c.beatAt(600_000);
    c.setFactor(2, 600_000);
    expect(c.beatAt(600_000)).toBeCloseTo(before);
    expect(c.bpm).toBe(256);
    c.update("ljlink", 128, 601_000);
    expect(c.bpm).toBe(256);
    c.setManual(64, 602_000); // Eingabe 128 bei Faktor 2 → Musik 64
    expect(c.bpm).toBe(128);
  });
});

describe("Testtag: OSC", () => {
  it("Ebene per OSC, Ganzzahl-Regler 0–127 springt bei 1 nicht auf voll, Blackout mit F", () => {
    const c = ctx();
    expect(handleOsc(c, { address: "/vjlink/layer/1/opacity", args: [0.25], tags: "f" }, 0)).toBe(true);
    expect(c.show.layers[0]!.opacity).toBeCloseTo(0.25);
    handleOsc(c, { address: "/vjlink/master/dimmer", args: [1], tags: "i" }, 0);
    expect(c.show.master).toBeCloseTo(1 / 127);
    handleOsc(c, { address: "/vjlink/master/dimmer", args: [127], tags: "i" }, 0);
    expect(c.show.master).toBeCloseTo(1);
    handleOsc(c, { address: "/vjlink/blackout", args: [true] }, 0);
    expect(c.show.blackout).toBe(true);
    handleOsc(c, { address: "/vjlink/blackout", args: [false] }, 0);
    expect(c.show.blackout).toBe(false);
  });
});

describe("Testtag: Szenen und SHOW", () => {
  it("Löschen und Verschieben von Szenen führt Cues und Timeline-Marken nach", async () => {
    const { deleteScene, moveScene } = await import("../src/core/control");
    const { newCue } = await import("../src/core/video");
    const c = ctx();
    const a = newCue("scene", "A"); a.scene = 6;
    const b = newCue("scene", "B"); b.scene = 2;
    const v = newCue("video", "V", "vid:aaaaaa"); v.marks = [{ t: 0, scene: 2, others: false }, { t: 5, scene: 4, others: false }];
    c.cues.list = [a, b, v];
    deleteScene(c, 1); // Szene 2 weg
    expect(a.scene).toBe(5);
    expect(b.scene).toBe(0);
    expect(v.marks!.map(m => m.scene)).toEqual([3]);
    moveScene(c, 2, 1); // 3 ↔ 4
    expect(v.marks![0]!.scene).toBe(4);
  });
});

describe("Rechts-Check 0.1.3", () => {
  it("Sichere Blitze: Strobe höchstens 3 Hz, im Takt und frei", async () => {
    const { limitRate, strobeHz, strobeGate, SAFE_FLASH_HZ } = await import("../src/core/audio");
    const { defaultStrobe } = await import("../src/core/show");
    expect(limitRate(16, 128, SAFE_FLASH_HZ) * 128 / 60).toBeLessThanOrEqual(3);
    expect(limitRate(1, 120, SAFE_FLASH_HZ)).toBe(1);            // 2 Hz bleibt
    const s = { ...defaultStrobe(), sync: false, speed: 1 };       // 20 Hz frei
    expect(strobeHz(s, 120)).toBe(20);
    expect(strobeHz(s, 120, SAFE_FLASH_HZ)).toBe(3);
    const sy = { ...defaultStrobe(), sync: true, speed: 0.99 };    // 16 × pro Beat
    expect(strobeHz(sy, 128, SAFE_FLASH_HZ)).toBeLessThanOrEqual(3);
    // Ebenen-Strobe (Teiler 5 = 16 pro Beat): höchstens 3 Wechsel pro Sekunde
    let flashes = 0, last = 0;
    for (let i = 0; i <= 6000; i++) { const beat = (i / 1000) * 2; const g = strobeGate(beat, 5, 120, SAFE_FLASH_HZ); if (g && !last) flashes++; last = g; }
    expect(flashes / 6).toBeLessThanOrEqual(3);   // 6 s
  });
  it("Update: Prüfsumme aus GitHub und SHA256SUMS lesen", async () => {
    const { parseDigest, parseSums, pickRelease } = await import("../src/core/update");
    const h = "a".repeat(64);
    expect(parseDigest(`sha256:${h.toUpperCase()}`)).toBe(h);
    expect(parseDigest("md5:abc")).toBeNull();
    expect(parseSums(`${h}  VJ-Link-windows.exe\n${"b".repeat(64)} *VJ-Link-macos-arm64.dmg\n`).get("VJ-Link-macos-arm64.dmg")).toBe("b".repeat(64));
    const rel = pickRelease({ tag_name: "v0.1.3", html_url: "https://github.com/skyplayser/VJ-LINK/releases/tag/v0.1.3", assets: [
      { name: "VJ-Link-windows.exe", browser_download_url: "https://example.org/w.exe", size: 5, digest: `sha256:${h}` },
      { name: "SHA256SUMS", browser_download_url: "https://example.org/s" }] }, "win32", "x64");
    expect(rel?.sha256).toBe(h);
    expect(rel?.sumsUrl).toBe("https://example.org/s");
    expect(rel?.sigUrl).toBeNull();
  });
});

describe("Ein Shader je Visual (Windows-Start)", async () => {
  const { FRAG, GEN_IDS, POST_IDS, genFrag, postFrag } = await import("../src/engine/shaders");
  it("jedes Visual hat genau einen Fall, der switch ist weg", () => {
    // „now-playing“ und „dj-waveform“ zeichnet die Engine selbst, ohne Fall im Shader
    const own = new Set(["now-playing", "dj-waveform"]);
    expect(FRAG.match(/case \d+:/g)?.length).toBe(GEN_IDS.length - own.size);
    GEN_IDS.forEach((id, n) => {
      if (own.has(id)) return;
      const src = genFrag(n);
      expect(src).not.toMatch(/switch \(uGen\)/);
      expect(src).not.toMatch(/uniform int\s+uGen/);
      expect(src).toContain(`const int uGen = ${n};`);
      const call = FRAG.match(new RegExp(`case ${n}: c = ([a-zA-Z0-9]+)\\(`))![1]!;
      expect(src).toContain(`c = ${call}(`);
      expect(src).toMatch(new RegExp(`^vec3 ${call}\\(`, "m"));
      expect(src.length).toBeLessThan(20000);
    });
  });
  it("jeder Effekt bekommt seine Nummer als Konstante", () => {
    POST_IDS.forEach((_id, n) => {
      const src = postFrag(n);
      expect(src).toContain(`const int uEffect = ${n};`);
      expect(src).not.toMatch(/uniform int\s+uEffect/);
      expect(src).not.toMatch(/uEffect ==/);
      expect(src).toContain("outColor = c;");
    });
  });
});

import { feedbackText, starString } from "../src/core/report";
import { siteUrl } from "../src/renderer/farewell";
describe("Feedback mit Sternen (Hinweis beim Beenden)", () => {
  it("schreibt die Bewertung in die erste Zeile", () => {
    expect(starString(4)).toBe("★★★★☆");
    expect(starString(0)).toBe("☆☆☆☆☆");
    expect(feedbackText(5, " Super! ")).toBe("Feedback ★★★★★ (5/5)\n\nSuper!");
    expect(feedbackText(2, "")).toBe("Feedback ★★☆☆☆ (2/5)");
    expect(feedbackText(0, "Nur Worte")).toBe("Nur Worte");
    expect(feedbackText(9, "x")).toBe("x");
  });
  it("Betreff und Issue-Titel tragen die Sterne, Feedback bekommt das Label feedback", () => {
    const m = mailLink(feedbackText(3, "Mehr Laser"), null, "");
    expect(decodeURIComponent(m.url)).toContain("subject=VJ-Link: Feedback ★★★☆☆ (3/5)");
    const i = issueLink(feedbackText(3, "Mehr Laser"), null, "0.1.5", "", "feedback");
    expect(i.url).toContain("labels=feedback&");
    expect(decodeURIComponent(i.url)).toContain("title=Feedback ★★★☆☆ (3/5)");
    expect(issueLink("Absturz", null, "0.1.5", "").url).toContain("labels=bug&");
  });
  it("teilt die Website in der passenden Sprache", () => {
    expect(siteUrl("de")).toBe("https://skyplayser.github.io/VJ-LINK/de/");
    expect(siteUrl("en")).toBe("https://skyplayser.github.io/VJ-LINK/");
  });
});
