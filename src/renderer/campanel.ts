// Kamera-Clip in einer Ebene: Darstellung (Normal, Silhouette, Dot-Matrix, ASCII, Masken …), Größe, Spiegeln.
import type { ControlContext } from "../core/control";
import {
  CAM_LOOKS, CAM_LOOK_INFO, CAM_LOOK_LABEL, camIdOf, isCamClip, isMaskLook, usesCells, usesFigure, type CamSettings,
} from "../core/camera";
import { FITS, type Fit } from "../core/video";
import { t } from "../core/i18n";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e;
}
const FIT_LABEL: Record<Fit, string> = { fill: t("füllen"), fit: t("einpassen"), original: t("original") };

export class CamPanel {
  private name = el("div", "media-name");
  private looks = el("div", "look-grid");
  private info = el("p", "muted small");
  private fitSeg = el("div", "seg2");
  private mirror = el("button", "btn small-btn");
  private only = el("button", "btn small-btn");
  private onlyRow = el("div", "mrow3");
  private tol = el("input"); private tolV = el("span", "mval"); private tolRow = el("label", "mrow"); private tolLabel = el("span", "", t("Schwelle"));
  private cells = el("input"); private cellsV = el("span", "mval"); private cellsRow = el("label", "mrow");
  private bg = el("button", "btn small-btn");
  private bgClear = el("button", "btn small-btn");
  private bgRow = el("div", "inline wrap");
  private hint = el("p", "muted small");

  constructor(private ctx: ControlContext, private root: HTMLElement, private layerOf: () => number,
    /** Zustand der Personen-Erkennung in diesem Fenster. */ private person: () => string = () => "idle") {
    root.replaceChildren();
    for (const lk of CAM_LOOKS) {
      const b = el("button", `look-btn${isMaskLook(lk) ? " mask" : ""}`, CAM_LOOK_LABEL[lk]); b.dataset.v = lk;
      b.title = CAM_LOOK_INFO[lk];
      b.addEventListener("click", () => { const c = this.cam(); if (c) c.look = lk; });
      this.looks.append(b);
    }
    for (const f of FITS) {
      const b = el("button", "", FIT_LABEL[f]); b.dataset.v = f;
      b.addEventListener("click", () => { const l = this.layer(); if (l) l.video.fit = f; });
      this.fitSeg.append(b);
    }
    this.mirror.addEventListener("click", () => { const c = this.cam(); if (c) c.mirror = !c.mirror; });
    this.only.addEventListener("click", () => { const c = this.cam(); if (c) c.onlyFig = !c.onlyFig; });
    this.tol.type = "range"; this.tol.min = "5"; this.tol.max = "90"; this.tol.setAttribute("aria-label", t("Schwelle"));
    this.tol.addEventListener("input", () => { const c = this.cam(); if (c) c.tol = Number(this.tol.value) / 100; });
    this.tolRow.append(this.tolLabel, this.tol, this.tolV);
    this.cells.type = "range"; this.cells.min = "12"; this.cells.max = "140"; this.cells.setAttribute("aria-label", t("Rastergröße"));
    this.cells.addEventListener("input", () => { const c = this.cam(); if (c) c.cells = Number(this.cells.value); });
    this.cellsRow.append(el("span", "", t("Raster")), this.cells, this.cellsV);
    this.bg.title = t("Leere Bühne merken: Danach gilt alles, was neu ins Bild kommt, als Person");
    this.bg.addEventListener("click", () => { const c = this.cam(); if (c) c.bgStamp = Date.now(); });
    this.bgClear.textContent = t("vergessen");
    this.bgClear.addEventListener("click", () => { const c = this.cam(); if (c) c.bgStamp = 0; });
    this.bgRow.append(this.bg, this.bgClear);
    const rF = el("div", "mrow3"); rF.append(el("span", "", t("Größe")), this.fitSeg);
    const rM = el("div", "mrow3"); rM.append(el("span", "", t("Spiegeln")), this.mirror);
    this.onlyRow.append(el("span", "", t("Nur Person")), this.only);
    root.append(el("h2", "", t("Kamera")), this.name, el("span", "am-cap", t("Darstellung")), this.looks, this.info,
      this.cellsRow, this.onlyRow, this.tolRow, this.bgRow, rF, rM, this.hint);
  }

  private layer() { const l = this.ctx.show.layers[this.layerOf()]; return l && isCamClip(l.clip) ? l : null; }
  private cam(): CamSettings | null { return this.layer()?.cam ?? null; }

  update(): void {
    const l = this.layer();
    this.root.hidden = !l;
    if (!l) return;
    const src = this.ctx.show.cameras.find(c => c.id === camIdOf(l.clip!));
    this.name.textContent = `${src?.label || t("Kamera")} · ${t("Ebene {n}", { n: this.layerOf() + 1 })}`;
    const c = l.cam;
    this.looks.querySelectorAll<HTMLElement>("button").forEach(b => b.classList.toggle("on", b.dataset.v === c.look));
    this.info.textContent = CAM_LOOK_INFO[c.look];
    this.fitSeg.querySelectorAll<HTMLElement>("button").forEach(b => b.classList.toggle("on", b.dataset.v === l.video.fit));
    this.mirror.textContent = c.mirror ? t("an") : t("aus"); this.mirror.classList.toggle("on", c.mirror);
    const stylized = c.look !== "normal" && c.look !== "silhouette" && !isMaskLook(c.look) && c.look !== "outline";
    this.onlyRow.hidden = !stylized;
    this.only.textContent = c.onlyFig ? t("an") : t("aus"); this.only.classList.toggle("on", c.onlyFig);
    this.cellsRow.hidden = !usesCells(c.look);
    if (document.activeElement !== this.cells) this.cells.value = String(c.cells);
    this.cellsV.textContent = String(Math.round(c.cells));
    const fig = usesFigure(c.look, c.onlyFig);
    // Mit Personen-Erkennung braucht es keinen gemerkten Hintergrund; der Regler bestimmt dann, wie eng die Kontur ist
    const ai = this.person();
    this.tolRow.hidden = !fig; this.bgRow.hidden = !fig || ai === "ready" || ai === "loading";
    this.tolLabel.textContent = ai === "ready" || ai === "loading" ? t("cam.tight") : t("Schwelle");
    if (document.activeElement !== this.tol) this.tol.value = String(Math.round(c.tol * 100));
    this.tolV.textContent = `${Math.round(c.tol * 100)} %`;
    this.bg.textContent = c.bgStamp > 0 ? t("Hintergrund neu merken") : t("Hintergrund merken");
    this.bgClear.hidden = c.bgStamp === 0;
    const top = this.layerOf() === this.ctx.show.layers.length - 1;
    this.hint.textContent = isMaskLook(c.look)
      ? (top ? t("Maske wirkt auf alle Ebenen darunter.") : t("Tipp: Für die Maske diese Ebene ganz nach oben legen, sie wirkt auf alle Ebenen darunter."))
      : fig && ai === "ready"
        ? t("Die Person wird automatisch erkannt (lokal, ohne Internet). Höhere Kontur = enger an der Person, niedrigere = weicher und großzügiger.")
        : fig && ai === "loading"
        ? t("Personen-Erkennung startet …")
        : fig
        ? (c.bgStamp > 0 ? t("Als Person gilt, was sich vom gemerkten Hintergrund unterscheidet. Eine höhere Schwelle ergibt weniger Rauschen.")
          : t("Als Person gilt, was dunkel vor hellem Hintergrund steht (Gegenlicht). Besser: bei leerer Bühne „Hintergrund merken“."))
        : t("Webcam, Capture-Karte oder OBS Virtual Camera. Die Farbe der Ebene färbt Silhouette, Umriss, Raster und Duoton.");
  }
}
