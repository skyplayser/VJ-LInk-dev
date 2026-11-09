// Schnittstelle zu LJ-Link (WebSocket, JSON). LJ-Link sendet, VJ-Link empfängt nur.
// Diese Typen sind der Entwurf für das Protokoll; LJ-Link bekommt dafür einen Ausgang „VJ-Link“.
export const LJ_PROTOCOL_VERSION = 1;
export const LJ_DEFAULT_PORT = 9099;

export type Phrase = "intro" | "up" | "chorus" | "down" | "outro";

export interface LjDeck {
  deck: number;
  model?: string;
  playing: boolean;
  onAir: boolean;
  master: boolean;
  bpm: number;
  /** Tonart (z. B. "8A"). */
  key?: string;
  phrase?: Phrase;
  /** 0–1 Position im Track. */
  position?: number;
  /** Nur gesetzt, wenn LJ-Link nicht im Privatsphäre-Modus ist. */
  title?: string;
  artist?: string;
}

export type LjMessage =
  | { t: "hello"; version: number; privacy: boolean; app?: string }
  | { t: "tempo"; bpm: number; beat: number; masterDeck?: number }
  | { t: "deck"; deck: LjDeck }
  | { t: "event"; kind: "track"; deck: number }
  | { t: "event"; kind: "phrase"; deck: number; phrase: Phrase }
  | { t: "event"; kind: "cue"; deck: number; cue: string }
  | { t: "event"; kind: "loop"; deck: number; active: boolean; beats?: number }
  | { t: "wave"; deck: number; bass: number; mid: number; high: number }
  /** Deck ist weg (Player aus dem Netz). */
  | { t: "gone"; deck: number };

export interface LjState {
  connected: boolean;
  privacy: boolean;
  decks: Map<number, LjDeck>;
  masterDeck: number | null;
  loopActive: boolean;
}

export const newLjState = (): LjState =>
  ({ connected: false, privacy: false, decks: new Map(), masterDeck: null, loopActive: false });

export function parseLjMessage(raw: string): LjMessage | null {
  let m: unknown;
  try { m = JSON.parse(raw); } catch { return null; }
  if (typeof m !== "object" || m === null || typeof (m as { t?: unknown }).t !== "string") return null;
  const msg = m as LjMessage;
  switch (msg.t) {
    case "hello": return typeof msg.version === "number" ? msg : null;
    case "tempo": return Number.isFinite(msg.bpm) && Number.isFinite(msg.beat) ? msg : null;
    case "deck": return msg.deck && typeof msg.deck.deck === "number" ? msg : null;
    case "event": return typeof msg.kind === "string" ? msg : null;
    case "wave": return Number.isFinite(msg.bass) ? msg : null;
    case "gone": return typeof msg.deck === "number" ? msg : null;
  }
  return null;
}

/** Zustand fortschreiben. Im Privatsphäre-Modus werden Titel und Artist verworfen. */
export function reduceLj(s: LjState, m: LjMessage): LjState {
  switch (m.t) {
    case "hello": s.connected = true; s.privacy = m.privacy; break;
    case "tempo": if (m.masterDeck !== undefined) s.masterDeck = m.masterDeck; break;
    case "deck": {
      const d = { ...m.deck };
      if (s.privacy) { delete d.title; delete d.artist; }
      s.decks.set(d.deck, d);
      if (d.master) s.masterDeck = d.deck;
      break;
    }
    case "gone":
      s.decks.delete(m.deck);
      if (s.masterDeck === m.deck) s.masterDeck = null;
      break;
    case "event":
      if (m.kind === "phrase") { const d = s.decks.get(m.deck); if (d) d.phrase = m.phrase; }
      if (m.kind === "loop") s.loopActive = m.active;
      break;
  }
  return s;
}

// ---- Regeln: Wenn (LJ-Link-Ereignis) dann (Aktion) ----------------------------------

export type RuleTrigger =
  | { kind: "phrase"; phrase: Phrase }
  | { kind: "track" }
  | { kind: "cue"; cue: string }
  | { kind: "loop"; active: boolean };

export type RuleAction =
  | { do: "scene"; name: string }
  | { do: "strobe"; beats: number }
  | { do: "fx"; layer: number; index: 0 | 1 | 2; value: number }
  | { do: "nextBank" };

export interface Rule { enabled: boolean; when: RuleTrigger; then: RuleAction }

export const CLUB_STANDARD_RULES: readonly Rule[] = [
  { enabled: true, when: { kind: "phrase", phrase: "chorus" }, then: { do: "scene", name: "Drop" } },
  { enabled: true, when: { kind: "phrase", phrase: "outro" }, then: { do: "scene", name: "Ambient" } },
  { enabled: true, when: { kind: "phrase", phrase: "down" }, then: { do: "scene", name: "Ambient" } },
  { enabled: true, when: { kind: "phrase", phrase: "up" }, then: { do: "scene", name: "Build" } },
  { enabled: true, when: { kind: "track" }, then: { do: "nextBank" } },
  { enabled: true, when: { kind: "cue", cue: "C" }, then: { do: "strobe", beats: 4 } },
  { enabled: true, when: { kind: "loop", active: true }, then: { do: "fx", layer: 1, index: 0, value: 0.8 } },
];

export function matchRules(rules: readonly Rule[], m: LjMessage): RuleAction[] {
  if (m.t !== "event") return [];
  return rules.filter(r => r.enabled && matches(r.when, m)).map(r => r.then);
}

function matches(w: RuleTrigger, m: Extract<LjMessage, { t: "event" }>): boolean {
  if (w.kind !== m.kind) return false;
  switch (m.kind) {
    case "phrase": return w.kind === "phrase" && w.phrase === m.phrase;
    case "cue": return w.kind === "cue" && w.cue === m.cue;
    case "loop": return w.kind === "loop" && w.active === m.active;
    case "track": return true;
  }
}
