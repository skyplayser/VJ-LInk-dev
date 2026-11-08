// Abspieler für Videos in einem Fenster. Jedes Fenster spielt selbst ab und hält sich an die
// Soll-Stelle aus dem Show-Zustand. Loops laufen nahtlos: Ein zweiter Abspieler wartet schon am
// Loop-Anfang und übernimmt im selben Bild, statt dass der erste zurückspringen (und nachladen) muss.
import { planLoop } from "../core/video";

export interface VideoSource { el: TexImageSource; w: number; h: number }
export interface PlayOpts { sound: boolean; volume: number; loop?: [number, number] }

interface Entry { els: HTMLVideoElement[]; cur: number; id: string; lastUse: number }

export class VideoPool {
  private entries = new Map<string, Entry>();
  /** Zähler für Tests: Wechsel am Loop-Ende und harte Sprünge. */
  stats = { swaps: 0, seeks: 0 };

  /** `audio`: Darf dieses Fenster Ton ausgeben (nur das Hauptfenster)? */
  constructor(private urlFor: (id: string) => string | null, private audio: boolean) {}

  private make(url: string): HTMLVideoElement {
    const el = document.createElement("video");
    el.crossOrigin = "anonymous";
    el.preload = "auto";
    el.muted = true;
    el.playsInline = true;
    el.src = url;
    return el;
  }

  get(key: string, id: string, t: number, rate: number, opts: PlayOpts = { sound: false, volume: 1 }): VideoSource | null {
    let e = this.entries.get(key);
    if (e && e.id !== id) { this.drop(key); e = undefined; }
    const url = this.urlFor(id);
    if (!url) return null;
    if (!e) { e = { els: [this.make(url)], cur: 0, id, lastUse: 0 }; this.entries.set(key, e); }
    if (opts.loop && e.els.length < 2) e.els.push(this.make(url));
    e.lastUse = performance.now();

    let act = e.els[e.cur]!;
    const sb = e.els.length > 1 ? e.els[1 - e.cur]! : null;
    const r = Math.max(0.0625, Math.min(16, rate));
    const dur = act.duration || 0;
    const target = dur > 0 ? Math.min(t, Math.max(0, dur - 0.04)) : t;

    // Zweiten Abspieler am Loop-Anfang bereithalten (angehalten, Bild schon dekodiert)
    if (sb && opts.loop && sb.readyState >= 1 && !sb.seeking) {
      if (!sb.paused) sb.pause();
      if (Math.abs(sb.currentTime - opts.loop[0]) > 0.03) sb.currentTime = opts.loop[0];
    }
    const sbReady = !!sb && !!opts.loop && sb.readyState >= 2 && !sb.seeking && Math.abs(sb.currentTime - opts.loop[0]) <= 0.03;

    if (act.readyState >= 1) {
      if (rate <= 0) {
        if (!act.paused) act.pause();
        if (Math.abs(act.currentTime - target) > 0.04 && !act.seeking) { act.currentTime = target; this.stats.seeks++; }
      } else {
        const plan = planLoop({ active: act.currentTime, target, rate: r, loop: opts.loop, standbyReady: sbReady });
        if (plan === "swap" && sb) {
          // Umschalten: der bereite Abspieler läuft los, der alte geht zurück an den Loop-Anfang
          sb.playbackRate = r;
          void sb.play().catch(() => { /* nächster Versuch im nächsten Bild */ });
          act.pause();
          e.cur = 1 - e.cur;
          act = sb;
          this.stats.swaps++;
        } else if (plan === "seek" && !act.seeking) {
          act.currentTime = target; this.stats.seeks++;
        }
        if (Math.abs(act.playbackRate - r) > 0.001) act.playbackRate = r;
        if (act.paused) void act.play().catch(() => { /* nächster Versuch im nächsten Bild */ });
      }
    }
    // Ton nur vom gerade laufenden Abspieler
    for (const el of e.els) {
      el.muted = !(el === act && this.audio && opts.sound && opts.volume > 0);
      el.volume = Math.max(0, Math.min(1, opts.volume));
    }
    return act.readyState >= 2 && act.videoWidth > 0 ? { el: act, w: act.videoWidth, h: act.videoHeight } : null;
  }

  /** Abspieler, die eine Weile nicht gebraucht wurden, anhalten und freigeben. */
  sweep(): void {
    const now = performance.now();
    for (const [k, e] of this.entries) if (now - e.lastUse > 1500) this.drop(k);
  }

  private drop(key: string): void {
    const e = this.entries.get(key);
    if (!e) return;
    for (const el of e.els) { el.pause(); el.removeAttribute("src"); el.load(); }
    this.entries.delete(key);
  }
}
