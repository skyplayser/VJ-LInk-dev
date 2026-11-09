// LJ-Link im Hauptfenster: Now-Playing-Bauchbinde zeichnen, DJ-Wellenform laden, Status an LJ-Link melden.
// Daten kommen über den Hauptprozess (Cover, Wellenform), Bilder gehen als Live-Grafik an alle Ausgänge.
import type { ControlContext } from "../core/control";
import type { VjBridge, VjStatus } from "../core/frame";
import { WAVE_FPS, type LjDeck } from "../core/ljlink";
import type { Engine } from "../engine/engine";

const W = 1920, H = 1080;
/** Breite der Wellenform-Textur (Frames je Zeile). */
const WAVE_ROW = 4096;

/** Bauchbinde auf eine Leinwand 1920 × 1080 (durchsichtig) zeichnen: Cover, „NOW PLAYING“, Titel, Artist. */
export function drawNowPlaying(c: HTMLCanvasElement, d: { title: string; artist?: string }, cover: CanvasImageSource | null): void {
  c.width = W; c.height = H;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, W, H);
  const pad = 80, box = 200, y = H - pad - box;
  const textX = pad + (cover ? box + 36 : 36), maxW = W - textX - pad - 40;
  const fit = (text: string, font: string) => {
    g.font = font;
    if (g.measureText(text).width <= maxW) return text;
    let t = text;
    while (t.length > 1 && g.measureText(t + "…").width > maxW) t = t.slice(0, -1);
    return t + "…";
  };
  const title = fit(d.title, "800 64px system-ui, sans-serif");
  const tW = g.measureText(title).width;
  const artist = d.artist ? fit(d.artist, "500 44px system-ui, sans-serif") : "";
  const aW = artist ? g.measureText(artist).width : 0;
  // Hintergrund: dunkler Streifen mit weichem Ende
  const right = Math.min(W - pad, textX + Math.max(tW, aW, 260) + 48);
  g.save();
  const grad = g.createLinearGradient(pad, 0, right, 0);
  grad.addColorStop(0, "rgba(0,0,0,0.72)"); grad.addColorStop(0.85, "rgba(0,0,0,0.6)"); grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.beginPath(); g.roundRect(pad, y, right - pad, box, 14); g.fill();
  g.restore();
  // Cover
  if (cover) {
    g.save();
    g.beginPath(); g.roundRect(pad, y, box, box, 14); g.clip();
    g.drawImage(cover, pad, y, box, box);
    g.restore();
  }
  // Akzent-Linie und Text
  g.fillStyle = "#ffffff";
  g.fillRect(textX - 18, y + 28, 4, box - 56);
  g.textBaseline = "alphabetic";
  g.font = "700 22px system-ui, sans-serif";
  (g as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "6px";
  g.fillStyle = "rgba(255,255,255,0.7)";
  g.fillText("NOW PLAYING", textX, y + 56);
  (g as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "0px";
  g.fillStyle = "#ffffff";
  g.font = "800 64px system-ui, sans-serif";
  g.fillText(title, textX, y + 126);
  if (artist) { g.fillStyle = "rgba(255,255,255,0.78)"; g.font = "500 44px system-ui, sans-serif"; g.fillText(artist, textX, y + 178); }
}

export class DjLink {
  private npKey = "";
  private npSeq = 0;
  private waveKey = "";
  private waveSeq = 0;
  private waveVer = 0;
  private waveMeta: { n: number; style: 0 | 1 } | null = null;
  private lastStatus = "";
  private lastStatusAt = 0;
  /** Bauchbinde: Sekunden sichtbar nach Trackwechsel (0 = immer). */
  hold = 15;

  constructor(private ctx: ControlContext, private bridge: VjBridge | null, private engine: () => Engine | null) {}

  /** Master-Deck (oder der einzige spielende Deck). */
  private master(): LjDeck | undefined {
    const lj = this.ctx.lj;
    if (!lj.connected) return undefined;
    if (lj.masterDeck !== null) return lj.decks.get(lj.masterDeck);
    return [...lj.decks.values()].find(d => d.playing && d.onAir);
  }

  /** Regelmäßig aufrufen (z. B. 10× pro Sekunde). */
  tick(nowMs: number, status: () => VjStatus): void {
    const md = this.master();
    this.nowPlaying(md, nowMs);
    this.wave(md);
    // Position für die Wellenform laufend mitgeben
    const dw = this.ctx.show.djWave;
    if (dw && md) {
      const p = this.ctx.lj.pos.get(md.deck);
      if (p) { dw.ms = p.ms; dw.at = p.at; dw.v = p.v; }
      else if (md.position !== undefined && md.durationMs) { dw.ms = md.position * md.durationMs; dw.at = nowMs; dw.v = md.playing ? 1 : 0; }
      dw.bpm = md.bpm;
    }
    // Gemeinsamer Status: bei Änderung sofort, sonst alle 2 s
    const s = status(), key = JSON.stringify({ ...s, bpm: Math.round(s.bpm * 10), master: Math.round(s.master * 100) });
    if (this.bridge && (key !== this.lastStatus || nowMs - this.lastStatusAt > 2000)) {
      this.lastStatus = key; this.lastStatusAt = nowMs;
      this.bridge.ljStatus(s);
    }
  }

  /** Läuft gerade eine Bauchbinde mit Daten? */
  get showing(): boolean { return !!this.ctx.show.nowPlaying?.on; }

  private nowPlaying(md: LjDeck | undefined, nowMs: number): void {
    const lj = this.ctx.lj;
    const info = md && !lj.privacy && md.title ? { title: md.title, ...(md.artist ? { artist: md.artist } : {}), art: md.art ?? "" } : null;
    const key = info ? `${info.title}|${info.artist ?? ""}|${info.art}` : "";
    const np = (this.ctx.show.nowPlaying ??= { on: false, since: 0, hold: this.hold });
    np.hold = this.hold;
    if (key === this.npKey) return;
    const sameTrack = info && this.npKey.split("|").slice(0, 2).join("|") === key.split("|").slice(0, 2).join("|");
    this.npKey = key;
    const seq = ++this.npSeq;
    if (!info) { np.on = false; this.bridge?.liveMedia({ type: "remove", id: "nowplaying" }); this.engine()?.removeMedia("nowplaying"); return; }
    void (async () => {
      let cover: HTMLImageElement | null = null;
      if (info.art && this.bridge) {
        const r = await this.bridge.ljFetch(info.art);
        if (r && /^image\//.test(r.type || "image/")) {
          const img = new Image();
          img.src = `data:${r.type || "image/jpeg"};base64,${b64(r.data)}`;
          try { await img.decode(); cover = img; } catch { cover = null; }
        }
      }
      if (seq !== this.npSeq) return;
      const c = document.createElement("canvas");
      drawNowPlaying(c, info, cover);
      this.engine()?.setMedia("nowplaying", c, W, H);
      this.bridge?.liveMedia({ type: "add", item: { id: "nowplaying", name: "Now Playing", dataUrl: c.toDataURL("image/png") } });
      // Neuer Track: Bauchbinde neu einblenden (nur Cover nachgeladen: weiterlaufen lassen)
      if (!sameTrack || !np.on) np.since = nowMs;
      np.on = true;
    })();
  }

  private wave(md: LjDeck | undefined): void {
    const path = md?.detail ?? "";
    if (path === this.waveKey) return;
    this.waveKey = path;
    const seq = ++this.waveSeq;
    if (!path || !this.bridge) { delete this.ctx.show.djWave; return; }
    void (async () => {
      const r = await this.bridge!.ljFetch(path);
      if (seq !== this.waveSeq) return;
      if (!r || r.data.length < 4) { delete this.ctx.show.djWave; this.waveKey = ""; return; }
      const n = Math.floor(r.data.length / 4);
      const rows = Math.min(4096, Math.ceil(n / WAVE_ROW));
      const data = new Uint8Array(WAVE_ROW * rows * 4);
      data.set(r.data.subarray(0, Math.min(r.data.length, data.length)));
      this.engine()?.setRaw("djwave", WAVE_ROW, rows, data);
      this.bridge!.liveMedia({ type: "raw", id: "djwave", w: WAVE_ROW, h: rows, data });
      this.waveMeta = { n: Math.min(n, WAVE_ROW * rows), style: md?.detailStyle === "threeband" ? 1 : 0 };
      this.ctx.show.djWave = { ms: 0, at: Date.now(), v: 0, style: this.waveMeta.style, n: this.waveMeta.n, ver: ++this.waveVer, bpm: md?.bpm ?? 0 };
    })();
  }
}

function b64(u: Uint8Array): string {
  let s = "";
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}

export { WAVE_FPS };
