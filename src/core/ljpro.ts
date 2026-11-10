// LJ-Link PRO: VJ-Link meldet sich selbst an dessen Weboberfläche an (WebSocket „/ws“, Port 8080) und übersetzt
// die Nachrichten in das VJ-Link-Protokoll (siehe ljlink.ts). So reicht es, LJ-Link PRO zu starten – ohne Einstellung dort.
import { LJ_PROTOCOL_VERSION, isDeckNo, parseLjMessage, type LjDeck, type LjMessage } from "./ljlink";

export const LJ_PRO_PORT = 8080;
/** Weboberfläche von LJ-Link PRO (wird übersetzt). */
export const LJ_PRO_PATH = "/ws";
/** Eigener Endpunkt für VJ-Link (spricht direkt das VJ-Link-Protokoll); wird zuerst versucht. */
export const LJ_NATIVE_PATH = "/vjlink";

/** Quelle für LJ-Link-Nachrichten: erkennt die Gegenstelle, liefert Nachrichten und den Stand zum Nachreichen. */
export interface LjSource {
  recognized: boolean;
  feed(raw: string, nowMs?: number): LjMessage[];
  clear(): LjMessage[];
  snapshot(): LjMessage[];
}

/** Endpunkt „/vjlink“: Nachrichten sind schon im VJ-Link-Protokoll; nur prüfen und den Stand merken. */
export class LjNativeTracker implements LjSource {
  recognized = false;
  private hello: LjMessage | null = null;
  private decks = new Map<number, LjMessage>();
  feed(raw: string): LjMessage[] {
    const m = parseLjMessage(raw);
    if (!m) return [];
    if (m.t === "hello") { this.recognized = true; this.hello = m; }
    if (!this.recognized) return [];
    if (m.t === "deck") this.decks.set(m.deck.deck, m);
    if (m.t === "gone") this.decks.delete(m.deck);
    return [m];
  }
  clear(): LjMessage[] { const out = [...this.decks.keys()].map(deck => ({ t: "gone" as const, deck })); this.decks.clear(); return out; }
  snapshot(): LjMessage[] { return this.hello ? [this.hello, ...this.decks.values()] : []; }
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): number | undefined => typeof v === "number" && Number.isFinite(v) ? v : undefined;
const str = (v: unknown, max = 200): string | undefined => typeof v === "string" && v ? v.slice(0, max) : undefined;

/** Übersetzer mit Gedächtnis (Trackwechsel, Loop, Master-Wechsel erkennen). */
export class LjProAdapter implements LjSource {
  /** Erste Nachricht war ein LJ-Link-Zustand: die Gegenstelle ist wirklich LJ-Link PRO. */
  recognized = false;
  private tracks = new Map<number, string>();
  private loops = new Map<number, boolean>();
  private master: number | null = null;
  private hello: LjMessage | null = null;
  /** Letzter Stand je Deck (LJ-Link PRO schickt Decks nur bei Änderungen, dazwischen nur Positionen). */
  private decks = new Map<number, { d: LjDeck; dur?: number; sent: number }>();

  /** Aktueller Stand zum Nachreichen (z. B. wenn die Oberfläche neu lädt). */
  snapshot(): LjMessage[] {
    return this.hello ? [this.hello, ...[...this.decks.values()].map(x => ({ t: "deck" as const, deck: { ...x.d } }))] : [];
  }

  feed(raw: string, nowMs = Date.now()): LjMessage[] {
    let m: unknown;
    try { m = JSON.parse(raw); } catch { return []; }
    if (!isObj(m) || typeof m.type !== "string") return [];
    if (m.type === "state") {
      this.recognized = true;
      this.hello = { t: "hello", version: LJ_PROTOCOL_VERSION, privacy: m.privacy === true, app: "LJ-Link" };
      const out: LjMessage[] = [this.hello];
      // Sucht LJ-Link noch Player, gibt es keine Decks
      if (m.phase !== "monitoring") out.push(...this.clear());
      return out;
    }
    if (!this.recognized) return [];
    if (m.type === "deck") return this.deck(m, nowMs);
    if (m.type === "pos") {
      // Position mitführen; den Master-Deck regelmäßig melden (hält das Tempo von LJ-Link am Leben)
      const n = num(m.deck), p = num(m.p); const x = n === undefined ? undefined : this.decks.get(n);
      if (!x || p === undefined) return [];
      if (x.dur) x.d.position = Math.min(1, Math.max(0, p / x.dur));
      if (!x.d.master) return [];
      const out: LjMessage[] = [{ t: "pos", deck: n!, ms: p, v: num(m.v) ?? 1 }];
      if (nowMs - x.sent >= 250) { x.sent = nowMs; out.push({ t: "deck", deck: { ...x.d } }); }
      return out;
    }
    if (m.type === "deckGone") {
      const n = num(m.deck); if (!isDeckNo(n)) return [];
      this.decks.delete(n);
      this.tracks.delete(n); this.loops.delete(n); if (this.master === n) this.master = null;
      return [{ t: "gone", deck: n }];
    }
    return [];
  }

  /** Verbindung weg: alle Decks entfernen. */
  clear(): LjMessage[] {
    const out: LjMessage[] = [...new Set([...this.tracks.keys(), ...this.decks.keys()])].map(deck => ({ t: "gone" as const, deck }));
    this.tracks.clear(); this.decks.clear(); this.loops.clear(); this.master = null;
    return out;
  }

  private deck(m: Obj, nowMs: number): LjMessage[] {
    const n = num(m.deck); if (!isDeckNo(n)) return [];
    const dur = num(m.durationMs);
    const d: LjDeck = {
      deck: n, model: str(m.name, 60), playing: m.playing === true, onAir: m.onAir === true, master: m.master === true,
      bpm: num(m.effectiveBpm) ?? num(m.stableBpm) ?? num(m.trackBpm) ?? 0,
      ...(str(m.key, 8) ? { key: str(m.key, 8) } : {}),
      ...(str(m.title) ? { title: str(m.title) } : {}),
      ...(str(m.artist) ? { artist: str(m.artist) } : {}),
      ...(dur && num(m.pos) !== undefined ? { position: Math.min(1, Math.max(0, num(m.pos)! / dur)) } : {}),
      ...(dur ? { durationMs: dur } : {}),
      // Cover und Wellenform liegen bei LJ-Link unter /api/deck/<n>/…
      ...(m.hasArt === true && num(m.artVersion) !== undefined ? { art: `/api/deck/${n}/art?v=${num(m.artVersion)}` } : {}),
      ...(m.hasDetail === true && num(m.detailVersion) !== undefined ? { detail: `/api/deck/${n}/detail?v=${num(m.detailVersion)}` } : {}),
      ...(m.detailStyle === "threeband" || m.detailStyle === "color" ? { detailStyle: m.detailStyle } : {}),
      ...(str(m.title) ? { trackId: `${str(m.address, 40) ?? ""}:${num(m.trackNumber) ?? ""}:${str(m.title)}:${dur ?? ""}` } : {}),
    };
    const old = this.decks.get(n);
    if (d.position === undefined && old?.d.position !== undefined && old.d.title === d.title) d.position = old.d.position;
    this.decks.set(n, { d: { ...d }, dur, sent: nowMs });
    const out: LjMessage[] = [{ t: "deck", deck: d }];
    // Neuer Track: der Master-Deck spielt etwas anderes oder ein anderer Deck wird Master
    const key = m.hasTrack === false ? "" : `${num(m.trackNumber) ?? ""}|${d.title ?? ""}|${dur ?? ""}`;
    const prev = this.tracks.get(n);
    this.tracks.set(n, key);
    if (d.master) {
      const changedMaster = this.master !== null && this.master !== n;
      this.master = n;
      if (key && (changedMaster || (prev !== undefined && prev !== key))) out.push({ t: "event", kind: "track", deck: n });
      const loop = isObj(m.loop);
      if ((this.loops.get(n) ?? false) !== loop) {
        const beats = num(m.loopBeats);
        out.push({ t: "event", kind: "loop", deck: n, active: loop, ...(loop && beats ? { beats } : {}) });
      }
    }
    this.loops.set(n, isObj(m.loop));
    return out;
  }
}
