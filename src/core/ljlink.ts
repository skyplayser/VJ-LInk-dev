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
  /** Feste Kennung des Tracks (z. B. rekordbox-ID). */
  trackId?: string;
  /** Cover: Pfad bei LJ-Link (z. B. "/api/deck/1/art?v=3"); fehlt im Privatsphäre-Modus. */
  art?: string;
  /** Wellenform: Pfad bei LJ-Link, 4 Byte je Frame bei 150 Frames/s. */
  detail?: string;
  /** „color“: Höhe, R, G, B · „threeband“: tief, mittel, hoch. */
  detailStyle?: "color" | "threeband";
  durationMs?: number;
}

/** Wellenform-Auflösung von rekordbox (Frames je Sekunde). */
export const WAVE_FPS = 150;

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
  | { t: "gone"; deck: number }
  /** Abspielposition (ms) und Geschwindigkeit (1 = normal). */
  | { t: "pos"; deck: number; ms: number; v: number };

export interface LjState {
  connected: boolean;
  privacy: boolean;
  decks: Map<number, LjDeck>;
  masterDeck: number | null;
  loopActive: boolean;
  /** Letzte Position je Deck (Zeitpunkt der Meldung in ms). */
  pos: Map<number, { ms: number; v: number; at: number }>;
}

export const newLjState = (): LjState =>
  ({ connected: false, privacy: false, decks: new Map(), masterDeck: null, loopActive: false, pos: new Map() });

/** Gültige Deck-Nummer (1–16); begrenzt auch den Speicher für Decks, falls jemand Unsinn sendet. */
export const MAX_DECKS = 16;
export const isDeckNo = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= MAX_DECKS;

const PHRASES: readonly string[] = ["intro", "up", "chorus", "down", "outro"];
const fin = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const txt = (v: unknown, max = 200): string | undefined => typeof v === "string" && v ? v.slice(0, max) : undefined;
/** Pfade bei LJ-Link (Cover, Wellenform) – nur relative API-Pfade. */
const apiPath = (v: unknown): string | undefined => typeof v === "string" && /^\/api\/[\w\-./?=&%]{1,200}$/.test(v) ? v : undefined;

/** Deck-Daten streng prüfen: Typen, Längen, Wertebereiche. Unbekannte Felder fallen weg. */
function cleanDeck(v: unknown): LjDeck | null {
  if (typeof v !== "object" || v === null) return null;
  const d = v as Record<string, unknown>;
  if (!isDeckNo(d.deck)) return null;
  const out: LjDeck = { deck: d.deck, playing: d.playing === true, onAir: d.onAir === true, master: d.master === true,
    bpm: fin(d.bpm) ? Math.max(0, Math.min(999, d.bpm)) : 0 };
  const opt = { model: txt(d.model, 60), key: txt(d.key, 8), title: txt(d.title), artist: txt(d.artist), trackId: txt(d.trackId, 80),
    art: apiPath(d.art), detail: apiPath(d.detail) };
  for (const [k, val] of Object.entries(opt)) if (val !== undefined) (out as unknown as Record<string, unknown>)[k] = val;
  if (typeof d.phrase === "string" && PHRASES.includes(d.phrase)) out.phrase = d.phrase as Phrase;
  if (fin(d.position)) out.position = Math.max(0, Math.min(1, d.position));
  if (d.detailStyle === "color" || d.detailStyle === "threeband") out.detailStyle = d.detailStyle;
  if (fin(d.durationMs) && d.durationMs >= 0) out.durationMs = d.durationMs;
  return out;
}

/** Nachricht von LJ-Link prüfen. Kommt aus dem Netz, also alles misstrauisch behandeln. */
export function parseLjMessage(raw: string): LjMessage | null {
  if (raw.length > 64 * 1024) return null;
  let m: unknown;
  try { m = JSON.parse(raw); } catch { return null; }
  if (typeof m !== "object" || m === null) return null;
  const o = m as Record<string, unknown>;
  switch (o.t) {
    case "hello": return fin(o.version) ? { t: "hello", version: o.version, privacy: o.privacy === true, ...(txt(o.app, 60) ? { app: txt(o.app, 60) } : {}) } : null;
    case "tempo":
      if (!fin(o.bpm) || !fin(o.beat)) return null;
      return { t: "tempo", bpm: o.bpm, beat: o.beat, ...(isDeckNo(o.masterDeck) ? { masterDeck: o.masterDeck } : {}) };
    case "deck": { const deck = cleanDeck(o.deck); return deck ? { t: "deck", deck } : null; }
    case "event": {
      if (!isDeckNo(o.deck)) return null;
      const deck = o.deck;
      switch (o.kind) {
        case "track": return { t: "event", kind: "track", deck };
        case "phrase": return typeof o.phrase === "string" && PHRASES.includes(o.phrase) ? { t: "event", kind: "phrase", deck, phrase: o.phrase as Phrase } : null;
        case "cue": { const cue = txt(o.cue, 8); return cue ? { t: "event", kind: "cue", deck, cue } : null; }
        case "loop": return { t: "event", kind: "loop", deck, active: o.active === true, ...(fin(o.beats) ? { beats: o.beats } : {}) };
      }
      return null;
    }
    case "wave":
      return isDeckNo(o.deck) && fin(o.bass) ? { t: "wave", deck: o.deck, bass: o.bass, mid: fin(o.mid) ? o.mid : 0, high: fin(o.high) ? o.high : 0 } : null;
    case "gone": return isDeckNo(o.deck) ? { t: "gone", deck: o.deck } : null;
    case "pos": return isDeckNo(o.deck) && fin(o.ms) && fin(o.v) ? { t: "pos", deck: o.deck, ms: o.ms, v: o.v } : null;
  }
  return null;
}

/** Zustand fortschreiben. Im Privatsphäre-Modus werden Titel und Artist verworfen. */
export function reduceLj(s: LjState, m: LjMessage, nowMs = Date.now()): LjState {
  switch (m.t) {
    case "hello": s.connected = true; s.privacy = m.privacy; break;
    case "tempo": if (m.masterDeck !== undefined) s.masterDeck = m.masterDeck; break;
    case "deck": {
      const d = { ...m.deck };
      if (s.privacy) { delete d.title; delete d.artist; delete d.art; }
      s.decks.set(d.deck, d);
      if (d.master) s.masterDeck = d.deck;
      break;
    }
    case "pos": s.pos.set(m.deck, { ms: m.ms, v: m.v, at: nowMs }); break;
    case "gone":
      s.decks.delete(m.deck); s.pos.delete(m.deck);
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
