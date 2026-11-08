// Abspieler für Videos in einem Fenster. Jedes Fenster spielt selbst ab und hält sich an die
// Soll-Stelle aus dem Show-Zustand (springt nur bei größerer Abweichung, sonst läuft es weich).
export interface VideoSource { el: TexImageSource; w: number; h: number }

interface Entry { el: HTMLVideoElement; id: string; lastUse: number }

export class VideoPool {
  private els = new Map<string, Entry>();

  /** `audio`: Darf dieses Fenster Ton ausgeben (nur das Hauptfenster)? */
  constructor(private urlFor: (id: string) => string | null, private audio: boolean) {}

  get(key: string, id: string, t: number, rate: number, opts: { sound: boolean; volume: number } = { sound: false, volume: 1 }): VideoSource | null {
    let e = this.els.get(key);
    if (e && e.id !== id) { this.drop(key); e = undefined; }
    if (!e) {
      const url = this.urlFor(id);
      if (!url) return null;
      const el = document.createElement("video");
      el.crossOrigin = "anonymous";
      el.preload = "auto";
      el.muted = true;
      el.playsInline = true;
      el.src = url;
      e = { el, id, lastUse: 0 };
      this.els.set(key, e);
    }
    e.lastUse = performance.now();
    const el = e.el;
    el.muted = !(this.audio && opts.sound && opts.volume > 0);
    el.volume = Math.max(0, Math.min(1, opts.volume));
    if (el.readyState >= 1) {
      const dur = el.duration || 0;
      const target = dur > 0 ? Math.min(t, Math.max(0, dur - 0.04)) : t;
      if (rate <= 0) {
        if (!el.paused) el.pause();
        if (Math.abs(el.currentTime - target) > 0.04 && !el.seeking) el.currentTime = target;
      } else {
        const r = Math.max(0.0625, Math.min(16, rate));
        if (Math.abs(el.playbackRate - r) > 0.001) el.playbackRate = r;
        if (el.paused) void el.play().catch(() => { /* wird beim nächsten Bild erneut versucht */ });
        // Abweichung größer als ein paar Bilder (oder Loop-Sprung): neu positionieren
        if (Math.abs(el.currentTime - target) > 0.25 * Math.max(1, r) && !el.seeking) el.currentTime = target;
      }
    }
    return el.readyState >= 2 && el.videoWidth > 0 ? { el, w: el.videoWidth, h: el.videoHeight } : null;
  }

  /** Abspieler, die eine Weile nicht gebraucht wurden, anhalten und freigeben. */
  sweep(): void {
    const now = performance.now();
    for (const [k, e] of this.els) if (now - e.lastUse > 1500) this.drop(k);
  }

  private drop(key: string): void {
    const e = this.els.get(key);
    if (!e) return;
    e.el.pause(); e.el.removeAttribute("src"); e.el.load();
    this.els.delete(key);
  }
}
