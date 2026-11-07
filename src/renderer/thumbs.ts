// Live-Vorschau im Clip-Raster: ein WebGL-Canvas hinter den Zellen, jede Zelle ein eigener Ausschnitt.
import { Engine, type ThumbCell } from "../engine/engine";
import type { ControlContext } from "../core/control";

export class ThumbView {
  private canvas = document.createElement("canvas");
  private engine: Engine | null = null;
  private frame = 0;

  constructor(private grid: HTMLElement, private layout: () => { cells: HTMLButtonElement[][]; clips: string[] }, private ctx: ControlContext) {
    this.canvas.className = "thumbs";
    this.canvas.setAttribute("aria-hidden", "true");
    grid.prepend(this.canvas);
    try { this.engine = new Engine(this.canvas, { transparent: true }); }
    catch { this.canvas.remove(); } // ohne WebGL bleiben die Zellen einfach ohne Bild
  }

  get gl(): Engine | null { return this.engine; }

  /** Jedes zweite Bild neu zeichnen (30 fps reichen für die Vorschau). */
  draw(nowMs: number): void {
    if (!this.engine || ++this.frame % 2) return;
    if (!this.grid.offsetParent) return; // Tab nicht sichtbar
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    // Größe aus den Zeilen, nicht aus scrollHeight: sonst vergrößert sich die Fläche bei krummem Zoom selbst
    let cssW = 0, cssH = 0;
    this.grid.querySelectorAll<HTMLElement>(".lrow").forEach(r => {
      cssW = Math.max(cssW, r.offsetLeft + r.offsetWidth); cssH = Math.max(cssH, r.offsetTop + r.offsetHeight);
    });
    this.canvas.style.width = `${cssW}px`; this.canvas.style.height = `${cssH}px`;
    this.engine.resize(Math.round(cssW * dpr), Math.round(cssH * dpr));
    const g = this.grid.getBoundingClientRect();
    const out: ThumbCell[] = [];
    const { cells, clips } = this.layout();
    cells.forEach((row, layer) => row.forEach((cell, col) => {
      const clip = clips[col];
      if (!clip) return;
      const r = cell.getBoundingClientRect();
      out.push({
        layer, col, clip,
        x: Math.round((r.left - g.left + this.grid.scrollLeft) * dpr), y: Math.round((r.top - g.top + this.grid.scrollTop) * dpr),
        w: Math.round(r.width * dpr), h: Math.round(r.height * dpr),
      });
    }));
    this.engine.renderThumbs(this.ctx.show, this.ctx.tempo.beatAt(nowMs), nowMs, out);
  }
}
