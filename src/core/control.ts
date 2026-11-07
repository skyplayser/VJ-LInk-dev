// Verbindet alle Eingänge (OSC, LJ-Link, Oberfläche) mit dem Show-Zustand.
import { TempoClock } from "./tempo";
import { matchRules, reduceLj, type LjMessage, type LjState, type Rule, type RuleAction } from "./ljlink";
import type { OscMessage } from "./osc";
import { SLOT_NAMES, applyScene, clamp01, type Scene, type ShowState } from "./show";
import { READY_GENERATORS } from "./effects";
import { setControl } from "./controls";

export interface ControlContext {
  show: ShowState;
  tempo: TempoClock;
  scenes: readonly Scene[];
  lj: LjState;
  rules: Rule[];
  bank: number;
}

export function recallScene(c: ControlContext, indexOrName: number | string): boolean {
  const i = typeof indexOrName === "number" ? indexOrName : c.scenes.findIndex(s => s.name === indexOrName);
  const sc = c.scenes[i];
  if (!sc) return false;
  applyScene(c.show, sc);
  c.show.scene = i + 1;
  return true;
}

const num = (v: unknown, d = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : d);

/** OSC-Adressen laut Konzept. Gibt true zurück, wenn die Nachricht verstanden wurde. */
export function handleOsc(c: ControlContext, m: OscMessage, nowMs: number): boolean {
  const p = m.address.split("/").filter(Boolean);
  if (p[0] !== "vjlink") return false;
  const a = m.args[0];
  const s = c.show;
  if (p[1] === "scene" && p[2] === "go") return recallScene(c, num(a) - 1);
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
    c.show.audio = { bass: clamp01(m.bass), mid: clamp01(m.mid), high: clamp01(m.high) };
  }
  // Hält die Verbindung am Leben, auch wenn nur Deck-Daten kommen.
  if (m.t === "deck" && m.deck.master) c.tempo.update("ljlink", m.deck.bpm, nowMs);
  const actions = matchRules(c.rules, m);
  for (const act of actions) runAction(c, act);
  return actions;
}

export function runAction(c: ControlContext, a: RuleAction): void {
  switch (a.do) {
    case "scene": recallScene(c, a.name); break;
    case "strobe": c.show.strobe.untilBeat = c.tempo.beatAt(Date.now()) + a.beats; break;
    case "fx": { const l = c.show.layers[a.layer]; if (l) l.fx[a.index] = a.value; break; }
    case "nextBank": c.bank += 1; break;
  }
}
