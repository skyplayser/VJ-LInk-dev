// Live-Vorschau im Clip-Raster: ein WebGL-Canvas hinter den Zellen, jede Zelle ein eigener Ausschnitt.
import { Engine, type ThumbCell } from "../engine/engine";
import { READY_GENERATORS } from "../core/effects";
import type { ControlContext } from "../core/control";

export class ThumbView {
  private canvas = document.createElement("canvas");
  private engine: Engine | null = null;
  private frame = 0;

  constructor(private grid: HTMLElement, private cells: HTMLButtonElement[][], private ctx: ControlContext) {
    this.canvas.className = "thumbs";
    this.canvas.setAttribute("aria-hidden", "true");
    grid.prepend(this.canvas);
    try { this.engine = new Engine(this.canvas, { transparent: true }); }
    catch { this.canvas.remove(); } // ohne WebGL bleiben die Zellen einfach ohne Bild
  }

  /** Jedes zweite Bild neu zeichnen (30 fps reichen für die Vorschau). */
  draw(nowMs: number): void {
    if (!this.engine || ++this.frame % 2) return;
    if (!this.grid.offsetParent) return; // Tab nicht sichtbar
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const cssW = this.grid.scrollWidth, cssH = this.grid.scrollHeight;
    this.canvas.style.width = `${cssW}px`; this.canvas.style.height = `${cssH}px`;
    this.engine.resize(Math.round(cssW * dpr), Math.round(cssH * dpr));
    const g = this.grid.getBoundingClientRect();
    const out: ThumbCell[] = [];
    this.cells.forEach((row, layer) => row.forEach((cell, col) => {
      const def = READY_GENERATORS[col];
      if (!def) return;
      const r = cell.getBoundingClientRect();
      out.push({
        layer, col, clip: def.id,
        x: Math.round((r.left - g.left + this.grid.scrollLeft) * dpr), y: Math.round((r.top - g.top + this.grid.scrollTop) * dpr),
        w: Math.round(r.width * dpr), h: Math.round(r.height * dpr),
      });
    }));
    this.engine.renderThumbs(this.ctx.show, this.ctx.tempo.beatAt(nowMs), nowMs, out);
  }
}
