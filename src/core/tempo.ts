// Takt-Uhr mit Quellen-Rangfolge. Rang 1 gewinnt, solange die Quelle frisch ist.
export type TempoSource = "ljlink" | "link" | "osc" | "midi" | "audio" | "tap" | "manual";

/** Kleinere Zahl = höhere Priorität (siehe Konzept, Abschnitt „Takt und Sync“). */
export const SOURCE_RANK: Record<TempoSource, number> = {
  ljlink: 1, link: 2, osc: 3, midi: 4, audio: 5, tap: 6, manual: 7,
};

/** Nach so vielen Millisekunden ohne Update gilt eine Quelle als weggefallen. */
export const SOURCE_TIMEOUT_MS = 2500;

export interface TempoState {
  bpm: number;
  /** Zeitpunkt (Epoch-ms), an dem `beatAtOrigin` galt. */
  originMs: number;
  beatAtOrigin: number;
  source: TempoSource;
}

export class TempoClock {
  private state: TempoState = { bpm: 120, originMs: 0, beatAtOrigin: 0, source: "manual" };
  private lastSeen = new Map<TempoSource, number>();
  private taps: number[] = [];

  private fac = 1;
  /** Faktor aus dem Pult (¼×, ½×, 1×, 2×, 4×): die Visuals laufen so viel schneller als die Musik. */
  get factor(): number { return this.fac; }
  set factor(f: number) { this.setFactor(f, Date.now()); }
  /** Faktor ändern, ohne dass die Beat-Position springt (sonst würden Auto-VJ und Übergänge sofort weiterschalten). */
  setFactor(f: number, nowMs: number): void {
    if (!Number.isFinite(f) || f <= 0 || f === this.fac) return;
    const beat = this.beatAt(nowMs);
    this.fac = f;
    this.state = { ...this.state, originMs: nowMs, beatAtOrigin: beat };
  }
  /**
   * Feste Tempo-Quelle (wie „SEND BPM“ in LJ-Link). null = automatisch nach Rangfolge.
   * Bei „manual“ bleiben Tap und Eingabe erlaubt.
   */
  lock: TempoSource | null = null;

  get snapshot(): TempoState { return { ...this.state }; }
  /** Wirksames Tempo der Visuals (Tempo der Quelle × Faktor). */
  get bpm(): number { return this.state.bpm * this.fac; }
  /** Tempo der Quelle (Musik), ohne Faktor. */
  get sourceBpm(): number { return this.state.bpm; }
  get source(): TempoSource { return this.state.source; }

  /** Beat-Position (fortlaufend, 0-basiert) zum Zeitpunkt `nowMs`. */
  beatAt(nowMs: number): number {
    return this.state.beatAtOrigin + ((nowMs - this.state.originMs) / 60000) * this.bpm;
  }
  /** Position im Takt (0–1), `beatsPerBar` Schläge pro Takt. */
  barPhase(nowMs: number, beatsPerBar = 4): number {
    const b = this.beatAt(nowMs) / beatsPerBar;
    return b - Math.floor(b);
  }

  /**
   * Meldung einer Quelle. Wird nur übernommen, wenn die Quelle mindestens so hohen
   * Rang hat wie die aktuelle oder die aktuelle verstummt ist.
   * `beat` ist optional: Quellen mit Beatgrid (LJ-Link, Link) geben die Phase mit.
   */
  update(source: TempoSource, bpm: number, nowMs: number, beat?: number): boolean {
    if (!Number.isFinite(bpm) || bpm < 20 || bpm > 300) return false;
    this.lastSeen.set(source, nowMs);
    if (this.lock && source !== this.lock && !(this.lock === "manual" && source === "tap")) return false;
    const cur = this.state.source;
    const curAlive = nowMs - (this.lastSeen.get(cur) ?? -Infinity) <= SOURCE_TIMEOUT_MS;
    if (source !== cur && curAlive && SOURCE_RANK[source] > SOURCE_RANK[cur]) return false;
    const keepPhase = beat === undefined;
    const beatNow = keepPhase ? this.beatAt(nowMs) : beat;
    this.state = { bpm, originMs: nowMs, beatAtOrigin: beatNow, source };
    return true;
  }

  /** Tap-Tempo: Mittel über die letzten Abstände, Pause über 2 s setzt zurück. */
  tap(nowMs: number): number | null {
    const last = this.taps[this.taps.length - 1];
    if (last !== undefined && nowMs - last > 2000) this.taps = [];
    this.taps.push(nowMs);
    if (this.taps.length > 8) this.taps.shift();
    if (this.taps.length < 2) return null;
    const gaps: number[] = [];
    for (let i = 1; i < this.taps.length; i++) gaps.push(this.taps[i]! - this.taps[i - 1]!);
    const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const bpm = 60000 / avg;
    this.update("tap", bpm, nowMs);
    return bpm;
  }

  /** BPM der Musik von Hand setzen (Eingabe, ohne Faktor). Gilt sofort, Phase läuft ohne Sprung weiter. */
  setManual(bpm: number, nowMs: number): boolean {
    if (!Number.isFinite(bpm) || bpm < 20 || bpm > 300) return false;
    this.state = { bpm, originMs: nowMs, beatAtOrigin: this.beatAt(nowMs), source: "manual" };
    this.lastSeen.set("manual", nowMs);
    return true;
  }

  /** Fällt die aktive Quelle weg, läuft die Uhr mit letztem Tempo weiter und meldet „manual“. */
  tick(nowMs: number): void {
    const cur = this.state.source;
    if (cur === "manual" || this.lock === cur) return;
    const seen = this.lastSeen.get(cur) ?? -Infinity;
    if (nowMs - seen > SOURCE_TIMEOUT_MS) {
      this.state = { ...this.state, bpm: this.state.bpm, originMs: nowMs, beatAtOrigin: this.beatAt(nowMs), source: "manual" };
    }
  }
}
