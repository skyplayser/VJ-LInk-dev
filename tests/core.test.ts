import { describe, expect, it } from "vitest";
import { TempoClock } from "../src/core/tempo";
import { newCueState } from "../src/core/video";
import { parseArtDmx } from "../src/core/artnet";
import { parseSacn } from "../src/core/sacn";
import { buildOsc, parseOsc } from "../src/core/osc";
import { CH, DmxDecoder, channelListCsv } from "../src/core/dmx";
import { DEFAULT_SCENES, defaultScenes, defaultShow } from "../src/core/show";
import { EFFECTS, READY_GENERATORS } from "../src/core/effects";
import { CLUB_STANDARD_RULES, newLjState, parseLjMessage, type LjMessage } from "../src/core/ljlink";
import { handleLj, handleOsc, type ControlContext } from "../src/core/control";

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
  it("Kanalliste hat 70 Zeilen", () => {
    expect(channelListCsv().trim().split("\n").length).toBe(71);
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
  it("enthält die 35 Visuals der Wunschliste und 7 Laser mit eindeutigen IDs", () => {
    expect(EFFECTS.length).toBe(50);
    expect(new Set(EFFECTS.map(e => e.id)).size).toBe(50);
    expect(EFFECTS.map(e => e.no)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
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
  it("ein Eingang hat genau ein Ziel", () => {
    const t = new MappingTable();
    t.add("master", { p: "osc", address: "/fader1" });
    t.add("fx.master", { p: "osc", address: "/fader1" });
    expect(t.list.length).toBe(1);
    expect(t.list[0]!.target).toBe("fx.master");
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
    expect(READY_GENERATORS.length).toBe(42);
    expect(EFFECTS.filter(e => e.status === "planned").map(e => e.id)).toEqual(["silhouette"]);
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
    c.offset = 25; c.receive({ h: 0, m: 0, s: 2, f: 0 }, 25, "artnet", 4000);
    expect(c.now(4000)!.frames).toBe(75);
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
