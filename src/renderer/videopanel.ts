// Video-Clip in einer Ebene: Loop-Bereich, Takt-Loop, Größe, Ton.
import type { ControlContext } from "../core/control";
import { forgetClip } from "../core/show";
import { FITS, TAKT_BEATS, isVideoClip, loopRange, videoIdOf, type Fit, type VideoSettings } from "../core/video";
import type { VideoLibrary } from "./videolib";
import { t } from "../core/i18n";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e;
}
const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
const FIT_LABEL: Record<Fit, string> = { fill: t("füllen"), fit: t("einpassen"), original: t("original") };

export class VideoPanel {
  private name = el("div", "media-name");
  private inR = el("input"); private outR = el("input");
  private inV = el("span", "mval"); private outV = el("span", "mval");
  private beatSeg = el("div", "seg2"); private fitSeg = el("div", "seg2"); private sound = el("button", "btn small-btn");
  private info = el("p", "muted small");
  private del = el("button", "btn small-btn");
  private armed = false;

  constructor(private ctx: ControlContext, private lib: VideoLibrary, private root: HTMLElement,
    private layerOf: () => number, private onDeleted: () => void) {
    root.replaceChildren();
    const h = el("h2", "", "Video");
    for (const r of [this.inR, this.outR]) { r.type = "range"; r.min = "0"; r.max = "1000"; }
    this.inR.setAttribute("aria-label", t("Loop von")); this.outR.setAttribute("aria-label", t("Loop bis"));
    this.inR.addEventListener("input", () => this.setRange("in"));
    this.outR.addEventListener("input", () => this.setRange("out"));
    const rIn = el("label", "mrow"); rIn.append(el("span", "", t("Loop von")), this.inR, this.inV);
    const rOut = el("label", "mrow"); rOut.append(el("span", "", t("Loop bis")), this.outR, this.outV);
    for (const b of TAKT_BEATS) {
      const bt = el("button", "", b === 0 ? t("aus") : String(b)); bt.dataset.v = String(b);
      bt.addEventListener("click", () => { const v = this.video(); if (v) v.beats = b; });
      this.beatSeg.append(bt);
    }
    for (const f of FITS) {
      const bt = el("button", "", FIT_LABEL[f]); bt.dataset.v = f;
      bt.addEventListener("click", () => { const v = this.video(); if (v) v.fit = f; });
      this.fitSeg.append(bt);
    }
    this.sound.addEventListener("click", () => { const v = this.video(); if (v) v.sound = !v.sound; });
    const rowB = el("div", "mrow3"); rowB.append(el("span", "", t("Im Takt")), this.beatSeg);
    const rowF = el("div", "mrow3"); rowF.append(el("span", "", t("Größe")), this.fitSeg);
    const rowS = el("div", "mrow3"); rowS.append(el("span", "", t("Ton")), this.sound);
    this.del.addEventListener("click", () => {
      const l = this.ctx.show.layers[this.layerOf()];
      if (!l || !isVideoClip(l.clip)) return;
      if (!this.armed) { this.armed = true; this.del.textContent = t("Wirklich aus der Bibliothek löschen?"); return; }
      const clip = l.clip;
      forgetClip(this.ctx.show, this.ctx.scenes, clip);
      for (const c of this.ctx.cues.list) if (c.media === clip) c.media = null;
      this.lib.remove(videoIdOf(clip));
      this.armed = false;
      this.onDeleted();
    });
    root.append(h, this.name, rIn, rOut, rowB, this.info, rowF, rowS, this.del);
  }

  private video(): VideoSettings | null {
    const l = this.ctx.show.layers[this.layerOf()];
    return l && isVideoClip(l.clip) ? l.video : null;
  }
  private dur(): number {
    const l = this.ctx.show.layers[this.layerOf()];
    return l && isVideoClip(l.clip) ? this.lib.duration(videoIdOf(l.clip)) : 0;
  }
  private setRange(which: "in" | "out"): void {
    const v = this.video(), d = this.dur();
    if (!v || d <= 0) return;
    const a = (Number(this.inR.value) / 1000) * d, b = (Number(this.outR.value) / 1000) * d;
    if (which === "in") v.loopIn = Math.min(a, b - 0.1);
    else v.loopOut = b >= d - 0.05 ? 0 : Math.max(b, a + 0.1);
  }

  update(bpm: number): void {
    const l = this.ctx.show.layers[this.layerOf()];
    const v = this.video();
    this.root.hidden = !v;
    if (!v || !l) { this.armed = false; return; }
    const item = this.lib.find(videoIdOf(l.clip!));
    const d = item?.duration ?? 0;
    this.name.textContent = `${item?.name ?? "Video"} · ${t("Ebene {n}", { n: this.layerOf() + 1 })}${d ? ` · ${fmt(d)}` : ""}`;
    const [a, b] = loopRange(v, d);
    if (d > 0) {
      if (document.activeElement !== this.inR) this.inR.value = String(Math.round((a / d) * 1000));
      if (document.activeElement !== this.outR) this.outR.value = String(Math.round((Math.min(b, d) / d) * 1000));
    }
    this.inV.textContent = fmt(a); this.outV.textContent = fmt(Math.min(b, d || b));
    this.beatSeg.querySelectorAll<HTMLButtonElement>("button").forEach(x => x.classList.toggle("on", Number(x.dataset.v) === v.beats));
    this.fitSeg.querySelectorAll<HTMLButtonElement>("button").forEach(x => x.classList.toggle("on", x.dataset.v === v.fit));
    this.sound.textContent = v.sound ? t("an") : t("stumm");
    this.sound.classList.toggle("on", v.sound);
    const len = Math.min(b, d || b) - a;
    this.info.textContent = v.beats > 0 && bpm > 0
      ? t("Loop von {len} s auf {beats} Beats gestreckt ({s} s, also {x}-fache Geschwindigkeit). Startet auf dem Beat.", { len: len.toFixed(1), beats: v.beats, s: ((v.beats * 60) / bpm).toFixed(2), x: (len / ((v.beats * 60) / bpm)).toFixed(2) })
      : t("Läuft in normaler Geschwindigkeit als Loop.");
    if (!this.armed) this.del.textContent = t("Video aus der Bibliothek löschen");
  }
}
