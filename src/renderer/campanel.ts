// Kamera-Clip in einer Ebene: Größe, Spiegeln, Silhouette, Hintergrund merken.
import type { ControlContext } from "../core/control";
import { camIdOf, isCamClip, type CamSettings } from "../core/camera";
import { FITS, type Fit } from "../core/video";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e;
}
const FIT_LABEL: Record<Fit, string> = { fill: "füllen", fit: "einpassen", original: "original" };

export class CamPanel {
  private name = el("div", "media-name");
  private fitSeg = el("div", "seg2");
  private lookSeg = el("div", "seg2");
  private mirror = el("button", "btn small-btn");
  private tol = el("input");
  private tolV = el("span", "mval");
  private tolRow = el("label", "mrow");
  private bg = el("button", "btn small-btn");
  private bgClear = el("button", "btn small-btn");
  private bgRow = el("div", "inline wrap");
  private hint = el("p", "muted small");

  constructor(private ctx: ControlContext, private root: HTMLElement, private layerOf: () => number) {
    root.replaceChildren();
    for (const f of FITS) {
      const b = el("button", "", FIT_LABEL[f]); b.dataset.v = f;
      b.addEventListener("click", () => { const l = this.layer(); if (l) l.video.fit = f; });
      this.fitSeg.append(b);
    }
    for (const [v, t] of [["normal", "Bild"], ["silhouette", "Silhouette"]] as const) {
      const b = el("button", "", t); b.dataset.v = v;
      b.addEventListener("click", () => { const c = this.cam(); if (c) c.look = v; });
      this.lookSeg.append(b);
    }
    this.mirror.addEventListener("click", () => { const c = this.cam(); if (c) c.mirror = !c.mirror; });
    this.tol.type = "range"; this.tol.min = "5"; this.tol.max = "90"; this.tol.setAttribute("aria-label", "Schwelle");
    this.tol.addEventListener("input", () => { const c = this.cam(); if (c) c.tol = Number(this.tol.value) / 100; });
    this.tolRow.append(el("span", "", "Schwelle"), this.tol, this.tolV);
    this.bg.textContent = "Hintergrund merken";
    this.bg.title = "Bühne ohne Personen merken: danach wird alles, was neu im Bild ist, zur Silhouette";
    this.bg.addEventListener("click", () => { const c = this.cam(); if (c) c.bgStamp = Date.now(); });
    this.bgClear.textContent = "vergessen";
    this.bgClear.addEventListener("click", () => { const c = this.cam(); if (c) c.bgStamp = 0; });
    this.bgRow.append(this.bg, this.bgClear);
    const rF = el("div", "mrow3"); rF.append(el("span", "", "Größe"), this.fitSeg);
    const rL = el("div", "mrow3"); rL.append(el("span", "", "Darstellung"), this.lookSeg);
    const rM = el("div", "mrow3"); rM.append(el("span", "", "Spiegeln"), this.mirror);
    root.append(el("h2", "", "Kamera"), this.name, rF, rM, rL, this.tolRow, this.bgRow, this.hint);
  }

  private layer() { const l = this.ctx.show.layers[this.layerOf()]; return l && isCamClip(l.clip) ? l : null; }
  private cam(): CamSettings | null { return this.layer()?.cam ?? null; }

  update(): void {
    const l = this.layer();
    this.root.hidden = !l;
    if (!l) return;
    const src = this.ctx.show.cameras.find(c => c.id === camIdOf(l.clip!));
    this.name.textContent = `${src?.label || "Kamera"} · Ebene ${this.layerOf() + 1}`;
    const c = l.cam;
    this.fitSeg.querySelectorAll<HTMLElement>("button").forEach(b => b.classList.toggle("on", b.dataset.v === l.video.fit));
    this.lookSeg.querySelectorAll<HTMLElement>("button").forEach(b => b.classList.toggle("on", b.dataset.v === c.look));
    this.mirror.textContent = c.mirror ? "an" : "aus";
    this.mirror.classList.toggle("on", c.mirror);
    const sil = c.look === "silhouette";
    this.tolRow.hidden = !sil; this.bgRow.hidden = !sil;
    if (document.activeElement !== this.tol) this.tol.value = String(Math.round(c.tol * 100));
    this.tolV.textContent = `${Math.round(c.tol * 100)} %`;
    this.bg.textContent = c.bgStamp > 0 ? "Hintergrund neu merken" : "Hintergrund merken";
    this.bgClear.hidden = c.bgStamp === 0;
    this.hint.textContent = !sil
      ? "Webcam, Capture-Karte oder OBS Virtual Camera. Effekte und Farbe wie bei jeder Ebene."
      : c.bgStamp > 0
        ? "Alles, was sich vom gemerkten Hintergrund unterscheidet, wird zur Silhouette. Schwelle höher = weniger Rauschen."
        : "Gegenlicht: dunkle Personen vor hellem Hintergrund werden zur Silhouette. Besser: leere Bühne → „Hintergrund merken“. Farbe der Ebene „Original“ = schwarz, sonst Slot-Farbe.";
  }
}
