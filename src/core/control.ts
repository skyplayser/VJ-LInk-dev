// Verbindet alle Eingänge (OSC, LJ-Link, Oberfläche) mit dem Show-Zustand.
import { TempoClock } from "./tempo";
import { matchRules, reduceLj, type LjMessage, type LjState, type Rule, type RuleAction } from "./ljlink";
import type { OscMessage } from "./osc";
import { SLOT_NAMES, applyScene, clamp01, cloneLayers, transitionProgress, type Scene, type SceneTransition, type ShowState } from "./show";
import { READY_GENERATORS } from "./effects";
import { cueBack, cueGo, cueStopAll, type CueEnv, type CueState } from "./video";
import { setControl } from "./controls";

export interface ControlContext {
  /** SHOW-Ablauf (Cues und laufender Zustand). */
  cues: CueState;
  /** Timecode-Uhr (setzt die Oberfläche). */
  tc?: import("./timecode").TimecodeClock;
  /** Längen der Videos und Szenenabruf für den Ablauf (setzt die Oberfläche). */
  cueEnv?: CueEnv;
  show: ShowState;
  tempo: TempoClock;
  scenes: Scene[];
  lj: LjState;
  rules: Rule[];
  bank: number;
  /** Modulationen (LFO, Audio) an Reglern; gehören zum Projekt. */
  mods?: import("./modulation").Modulation[];
}

/** Übergang, der für diese Szene gilt: eigener Wert der Szene, sonst der Regler „Blende“. */
export function sceneTransition(c: ControlContext, sc: Scene): SceneTransition {
  return sc.transition ?? { unit: "beats", value: c.show.transitionBeats, style: "fade" };
}

/**
 * Szene abrufen. Übergang in Beats beginnt auf dem nächsten Schlag, in Sekunden sofort.
 * Wert 0 = harter Schnitt.
 */
export function recallScene(c: ControlContext, indexOrName: number | string, nowMs = Date.now()): boolean {
  const i = typeof indexOrName === "number" ? indexOrName : c.scenes.findIndex(s => s.name === indexOrName);
  const sc = c.scenes[i];
  if (!sc) return false;
  const tr = sceneTransition(c, sc);
  const beat = c.tempo.beatAt(nowMs);
  if (tr.value > 0) {
    // Läuft schon eine Blende, startet die neue vom aktuellen Ziel aus (kein Rücksprung auf den alten Stand).
    const from = cloneLayers(c.show.layers);
    c.show.transition = tr.unit === "seconds"
      ? { from, startBeat: beat, beats: 0, startMs: nowMs, ms: tr.value * 1000, style: tr.style }
      : { from, startBeat: Math.ceil(beat - 1e-6), beats: tr.value, style: tr.style };
  } else {
    c.show.transition = null;
  }
  applyScene(c.show, sc);
  c.show.scene = i + 1;
  c.show.sceneStart = { beat, ms: nowMs };
  return true;
}

/** Nächste bzw. vorige Szene (ringförmig). */
export function stepScene(c: ControlContext, dir: 1 | -1, nowMs = Date.now()): boolean {
  const n = c.scenes.length;
  if (!n) return false;
  const cur = c.show.scene > 0 ? c.show.scene - 1 : (dir > 0 ? -1 : 0);
  return recallScene(c, (cur + dir + n) % n, nowMs);
}

/** Automatik: Wechsel nach Takten oder Sekunden. Einmal pro Bild aufrufen. */
export function tickAuto(c: ControlContext, nowMs: number): boolean {
  if (!c.show.autoVj) return false;
  const sc = c.scenes[c.show.scene - 1];
  const next = sc?.next;
  if (!next || next.after === "off" || next.after === "phrase" || next.value <= 0) return false;
  const st = c.show.sceneStart;
  const due = next.after === "bars"
    ? c.tempo.beatAt(nowMs) - st.beat >= next.value * 4
    : nowMs - st.ms >= next.value * 1000;
  return due ? stepScene(c, 1, nowMs) : false;
}

/** Aktuelles Bild als neue Szene ablegen. Gibt den Index zurück. */
export function addSceneFromCurrent(c: ControlContext, name?: string): number {
  c.scenes.push({
    name: name ?? `Szene ${c.scenes.length + 1}`,
    layers: cloneLayers(c.show.layers),
    transition: { unit: "beats", value: c.show.transitionBeats || 1, style: "fade" },
    next: { after: "off", value: 16 },
  });
  c.show.scene = c.scenes.length;
  return c.scenes.length - 1;
}

/** Szene mit dem aktuellen Bild überschreiben (Name, Übergang und Abfolge bleiben). */
export function overwriteScene(c: ControlContext, i: number): boolean {
  const sc = c.scenes[i];
  if (!sc) return false;
  sc.layers = cloneLayers(c.show.layers);
  return true;
}

export function deleteScene(c: ControlContext, i: number): boolean {
  if (!c.scenes[i]) return false;
  c.scenes.splice(i, 1);
  if (c.show.scene === i + 1) c.show.scene = 0;
  else if (c.show.scene > i + 1) c.show.scene -= 1;
  return true;
}

export function moveScene(c: ControlContext, i: number, dir: 1 | -1): boolean {
  const j = i + dir;
  if (!c.scenes[i] || !c.scenes[j]) return false;
  [c.scenes[i], c.scenes[j]] = [c.scenes[j]!, c.scenes[i]!];
  if (c.show.scene === i + 1) c.show.scene = j + 1;
  else if (c.show.scene === j + 1) c.show.scene = i + 1;
  return true;
}

/** Beendete Überblendung aufräumen. Einmal pro Bild aufrufen. */
export function tickTransition(c: ControlContext, nowMs: number): void {
  const t = c.show.transition;
  if (t && transitionProgress(t, c.tempo.beatAt(nowMs), nowMs) >= 1) c.show.transition = null;
}

const num = (v: unknown, d = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : d);

/** OSC-Adressen laut Konzept. Gibt true zurück, wenn die Nachricht verstanden wurde. */
export function handleOsc(c: ControlContext, m: OscMessage, nowMs: number): boolean {
  const p = m.address.split("/").filter(Boolean);
  if (p[0] !== "vjlink") return false;
  const a = m.args[0];
  const s = c.show;
  if (p[1] === "scene" && p[2] === "go") return recallScene(c, num(a) - 1, nowMs);
  if (p[1] === "scene" && p[2] === "next") return stepScene(c, 1, nowMs);
  if (p[1] === "scene" && p[2] === "prev") return stepScene(c, -1, nowMs);
  // Jedes Bedienelement ist per OSC erreichbar: /vjlink/ctl/<id> <Wert 0–1>
  if (p[1] === "ctl" && p[2]) return setControl(c, p[2], num(a));
  if (p[1] === "master" && p[2] === "dimmer") { s.master = clamp01(num(a)); return true; }
  if (p[1] === "blackout") { s.blackout = num(a, 1) !== 0; return true; }
  if (p[1] === "tap") { c.tempo.tap(nowMs); return true; }
  if (p[1] === "bpm") { c.tempo.update("osc", num(a), nowMs); return true; }
  if (p[1] === "layer") {
    const l = s.layers[num(p[2]) - 1];
    if (!l) return false;
    if (p[3] === "opacity") { l.opacity = clamp01(num(a)); return true; }
    if (p[3] === "clip") { l.clip = READY_GENERATORS[num(a) - 1]?.id ?? null; return true; }
    return false;
  }
  if (p[1] === "slot") {
    const i = SLOT_NAMES.findIndex(n => n.toLowerCase() === p[2]);
    if (i < 0 || p[3] !== "rgb") return false;
    s.slots[i] = [clamp01(num(m.args[0])), clamp01(num(m.args[1])), clamp01(num(m.args[2]))];
    return true;
  }
  return false;
}

/** LJ-Link-Nachricht verarbeiten: Zustand, Takt, Audio-Werte und Regeln. */
export function handleLj(c: ControlContext, m: LjMessage, nowMs: number): RuleAction[] {
  reduceLj(c.lj, m);
  if (m.t === "tempo") c.tempo.update("ljlink", m.bpm, nowMs, m.beat);
  if (m.t === "wave" && (c.lj.masterDeck === null || m.deck === c.lj.masterDeck)) {
    Object.assign(c.show.audio, { bass: clamp01(m.bass), mid: clamp01(m.mid), high: clamp01(m.high) });
  }
  // Hält die Verbindung am Leben, auch wenn nur Deck-Daten kommen.
  if (m.t === "deck" && m.deck.master) c.tempo.update("ljlink", m.deck.bpm, nowMs);
  const actions = matchRules(c.rules, m);
  for (const act of actions) runAction(c, act);
  // Abfolge „bei Phrasenwechsel“, sofern keine Regel schon eine Szene gewählt hat.
  if (m.t === "event" && m.kind === "phrase" && c.show.autoVj && !actions.some(a => a.do === "scene")
    && (c.lj.masterDeck === null || m.deck === c.lj.masterDeck)
    && c.scenes[c.show.scene - 1]?.next?.after === "phrase") stepScene(c, 1, nowMs);
  return actions;
}

export function runAction(c: ControlContext, a: RuleAction): void {
  switch (a.do) {
    case "scene": recallScene(c, a.name); break;
    case "strobe": c.show.strobe.untilBeat = c.tempo.beatAt(Date.now()) + a.beats; break;
    case "fx": { const slot = c.show.layers[a.layer]?.effects[a.index]; if (slot) slot.amount = a.value; break; }
    case "nextBank": c.bank += 1; break;
  }
}

/** Startzeit merken, sobald eine Ebene einen anderen Clip bekommt (Videos laufen dann ab dort). */
export function tickVideoStarts(c: ControlContext, nowMs: number): void {
  for (const l of c.show.layers) {
    if (l.videoStart.clip !== l.clip) l.videoStart = { clip: l.clip, ms: nowMs, beat: Math.floor(c.tempo.beatAt(nowMs)) };
  }
}

/** SHOW-Ablauf bedienen (auch per Taste, MIDI, Pult, OSC). */
export function showGo(c: ControlContext, nowMs = Date.now()): string { return c.cueEnv ? cueGo(c.cues, nowMs, c.cueEnv) : "end"; }
export function showBack(c: ControlContext): void { cueBack(c.cues); }
export function showStop(c: ControlContext, nowMs = Date.now()): void { cueStopAll(c.cues, nowMs, 1); }
