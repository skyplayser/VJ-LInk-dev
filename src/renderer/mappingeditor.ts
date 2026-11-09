// AUSGABE → Projektionsmapping: auf das Bild eines Beamers Leinwände legen (Vierecke mit vier Ecken).
// Ecke ziehen = verzerren (Trapez, Objekt), Mitte ziehen = verschieben, Pfeiltasten = pixelgenau.
// Jede Leinwand zeigt das ganze Bild oder einen Ausschnitt; außerhalb bleibt der Beamer schwarz.
import { applyH, newSurface, snapCorner, squareToQuad, type OutputLayout, type Surface } from "../core/layout";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e;
}
const SVG = "http://www.w3.org/2000/svg";
function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

export interface OpenScreen { id: number; label: string; w: number; h: number }

export class MappingEditor {
  private screen: number | null = null;
  private sel: string | null = null;
  private selCorner: number | null = null;
  private stage: HTMLElement | null = null;
  private open: OpenScreen[] = [];

  constructor(private get: () => OutputLayout, private set: (l: OutputLayout) => void, private onChange: () => void,
    private testGrid: { on: () => boolean; toggle: () => void }) {}

  private surfaces(): Surface[] { const l = this.get(); return (l.surfaces ??= []); }
  private mine(): Surface[] { return this.surfaces().filter(s => s.screen === this.screen); }
  private cur(): Surface | undefined { return this.mine().find(s => s.id === this.sel); }
  private changed(): void { this.set({ ...this.get(), surfaces: [...this.surfaces()] }); this.onChange(); }

  render(stage: HTMLElement, tools: HTMLElement, hint: HTMLElement, open: OpenScreen[]): void {
    this.stage = stage; this.open = open;
    stage.classList.remove("off");
    stage.replaceChildren(); tools.replaceChildren();
    if (!open.length) { hint.textContent = "Öffne links einen Bildschirm (Beamer) als Ausgang, dann legst du hier Leinwände auf sein Bild."; return; }
    if (this.screen === null || !open.some(o => o.id === this.screen)) this.screen = open[0]!.id;
    // Erster Besuch: eine Leinwand über das ganze Bild, damit sofort etwas zu sehen ist
    if (!this.mine().length) { const s = newSurface(this.screen, 1, 0); this.surfaces().push(s); this.sel = s.id; this.changed(); }
    if (!this.cur()) this.sel = this.mine()[0]?.id ?? null;
    hint.textContent = "Leinwände auf das Bild des Beamers legen: Ecke ziehen passt die Leinwand an Wand, Kiste oder Trapez an, Mitte ziehen verschiebt. Pfeiltasten: 1 px (mit ⇧ 10 px). Ecken rasten am Rand und an anderen Leinwänden ein. Außerhalb bleibt der Beamer schwarz.";
    this.drawStage();
    this.drawTools(tools);
  }

  /** Lage des Beamer-Bilds in der Fläche (Pixel). */
  private frame(): { x: number; y: number; w: number; h: number; scr: OpenScreen } {
    const st = this.stage!, scr = this.open.find(o => o.id === this.screen)!;
    const pad = 28, sw = st.clientWidth - 2 * pad, sh = st.clientHeight - 2 * pad;
    const k = Math.min(sw / scr.w, sh / scr.h);
    const w = scr.w * k, h = scr.h * k;
    return { x: (st.clientWidth - w) / 2, y: (st.clientHeight - h) / 2, w, h, scr };
  }

  private drawStage(): void {
    const st = this.stage!;
    st.replaceChildren();
    const f = this.frame();
    const root = svg("svg", { class: "mp-svg", width: st.clientWidth, height: st.clientHeight });
    root.append(svg("rect", { x: f.x, y: f.y, width: f.w, height: f.h, class: "mp-frame" }));
    const lab = svg("text", { x: f.x + 6, y: f.y - 8, class: "mp-label" }); lab.textContent = `${f.scr.label} · ${f.scr.w} × ${f.scr.h}`;
    root.append(lab);
    const P = (p: [number, number]) => [f.x + p[0] * f.w, f.y + p[1] * f.h] as const;
    for (const s of this.mine()) {
      const sel = s.id === this.sel;
      const g = svg("g", { class: `mp-surf${sel ? " sel" : ""}${s.on ? "" : " off"}` });
      const pts = s.corners.map(c => P(c).join(",")).join(" ");
      const poly = svg("polygon", { points: pts, class: "mp-poly" });
      g.append(poly);
      // Hilfsraster in der Perspektive der Leinwand
      const H = squareToQuad(s.corners);
      for (let i = 1; i < 4; i++) {
        const t = i / 4;
        for (const [a, b] of [[[t, 0], [t, 1]], [[0, t], [1, t]]] as [[number, number], [number, number]][]) {
          const A = P(applyH(H, a[0], a[1])), B = P(applyH(H, b[0], b[1]));
          g.append(svg("line", { x1: A[0], y1: A[1], x2: B[0], y2: B[1], class: "mp-grid" }));
        }
      }
      const cx = s.corners.reduce((a, c) => a + c[0], 0) / 4, cy = s.corners.reduce((a, c) => a + c[1], 0) / 4;
      const name = svg("text", { x: P([cx, cy])[0], y: P([cx, cy])[1], class: "mp-name", "text-anchor": "middle" }); name.textContent = s.name;
      g.append(name);
      poly.addEventListener("pointerdown", e => this.drag(e, s, null));
      s.corners.forEach((c, i) => {
        const h = svg("circle", { cx: P(c)[0], cy: P(c)[1], r: sel ? 8 : 6, class: `mp-corner${sel && this.selCorner === i ? " sel" : ""}` });
        h.addEventListener("pointerdown", e => this.drag(e, s, i));
        g.append(h);
      });
      root.append(g);
    }
    st.append(root);
    st.tabIndex = 0;
    st.onkeydown = e => this.key(e);
  }

  /** Ecke (corner) oder ganze Leinwand (null) ziehen. */
  private drag(e: PointerEvent, s: Surface, corner: number | null): void {
    e.preventDefault(); e.stopPropagation();
    const first = this.sel !== s.id;
    this.sel = s.id; this.selCorner = corner;
    this.stage?.focus();
    const f = this.frame();
    const start = s.corners.map(c => [...c] as [number, number]);
    const sx = e.clientX, sy = e.clientY;
    const tol = 10 / Math.min(f.w, f.h);
    const others = this.mine().filter(o => o.id !== s.id).flatMap(o => o.corners);
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - sx) / f.w, dy = (ev.clientY - sy) / f.h;
      if (corner === null) s.corners = start.map(c => [c[0] + dx, c[1] + dy] as [number, number]);
      else s.corners[corner] = snapCorner([start[corner]![0] + dx, start[corner]![1] + dy], [...others, ...start.filter((_, i) => i !== corner)], tol);
      this.drawStage();
    };
    const up = () => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
      this.changed();
      if (first) this.drawTools(document.getElementById("cv-tools")!);
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    this.drawStage();
    if (first) this.drawTools(document.getElementById("cv-tools")!);
  }

  private key(e: KeyboardEvent): void {
    const s = this.cur(); if (!s) return;
    const d = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, [number, number]>)[e.key];
    if (e.key === "Tab" && !e.shiftKey && this.selCorner !== null) { e.preventDefault(); this.selCorner = (this.selCorner + 1) % 4; this.drawStage(); return; }
    if (!d) return;
    e.preventDefault();
    const scr = this.open.find(o => o.id === this.screen)!;
    const step = e.shiftKey ? 10 : 1;
    const dx = d[0] * step / scr.w, dy = d[1] * step / scr.h;
    if (this.selCorner === null) s.corners = s.corners.map(c => [c[0] + dx, c[1] + dy] as [number, number]);
    else s.corners[this.selCorner] = [s.corners[this.selCorner]![0] + dx, s.corners[this.selCorner]![1] + dy];
    this.drawStage(); this.changed();
  }

  private drawTools(tools: HTMLElement): void {
    tools.replaceChildren();
    // Ausgang wählen
    if (this.open.length > 1) {
      const w = el("span", "seg2 mp-screens");
      for (const o of this.open) {
        const b = el("button", o.id === this.screen ? "on" : "", o.label);
        b.addEventListener("click", () => { this.screen = o.id; this.sel = null; this.selCorner = null; this.render(this.stage!, tools, document.getElementById("out-mode-hint")!, this.open); });
        w.append(b);
      }
      tools.append(w);
    }
    const add = el("button", "btn small-btn", "+ Leinwand");
    add.addEventListener("click", () => {
      const s = newSurface(this.screen!, this.mine().length + 1, 0.25);
      this.surfaces().push(s); this.sel = s.id; this.selCorner = null;
      this.changed(); this.drawStage(); this.drawTools(tools);
    });
    const grid = el("button", `btn small-btn${this.testGrid.on() ? " on" : ""}`, "Raster zum Ausrichten");
    grid.title = "Raster-Testbild auf die Leinwände legen (verzerrt), um Ecken genau an Kanten auszurichten";
    grid.addEventListener("click", () => { this.testGrid.toggle(); grid.classList.toggle("on", this.testGrid.on()); });
    tools.append(add, grid);
    const s = this.cur();
    if (!s) return;
    const name = el("input", "mp-nm"); name.value = s.name; name.maxLength = 40; name.setAttribute("aria-label", "Name der Leinwand");
    name.addEventListener("change", () => { s.name = name.value.trim() || s.name; this.changed(); this.drawStage(); });
    const full = s.src.x === 0 && s.src.y === 0 && s.src.w === 1 && s.src.h === 1;
    const content = el("select"); content.setAttribute("aria-label", "Inhalt der Leinwand");
    content.append(new Option("Inhalt: ganzes Bild", "full"), new Option("Inhalt: Ausschnitt", "part"));
    content.value = full ? "full" : "part";
    content.addEventListener("change", () => {
      s.src = content.value === "full" ? { x: 0, y: 0, w: 1, h: 1 } : { x: 0, y: 0, w: 0.5, h: 0.5 };
      this.changed(); this.drawTools(tools);
    });
    tools.append(name, content);
    if (!full) {
      const num = (label: string, key: "x" | "y" | "w" | "h") => {
        const lab = el("label", "", label);
        const i = el("input"); i.type = "number"; i.min = key === "w" || key === "h" ? "1" : "0"; i.max = "100"; i.value = String(Math.round(s.src[key] * 100));
        i.addEventListener("change", () => {
          const v = Math.min(100, Math.max(key === "w" || key === "h" ? 1 : 0, Number(i.value) || 0)) / 100;
          s.src = { ...s.src, [key]: v };
          this.changed();
        });
        lab.append(i, el("small", "muted", "%")); tools.append(lab);
      };
      num("X", "x"); num("Y", "y"); num("Breite", "w"); num("Höhe", "h");
    }
    const rect = el("button", "btn small-btn", "Ecken zurücksetzen");
    rect.title = "Wieder ein gerades Rechteck";
    rect.addEventListener("click", () => {
      const xs = s.corners.map(c => c[0]), ys = s.corners.map(c => c[1]);
      const a = Math.min(...xs), b = Math.max(...xs), c = Math.min(...ys), d = Math.max(...ys);
      s.corners = [[a, c], [b, c], [b, d], [a, d]];
      this.changed(); this.drawStage();
    });
    const tog = el("button", `btn small-btn${s.on ? " on" : ""}`, s.on ? "An" : "Aus");
    tog.addEventListener("click", () => { s.on = !s.on; this.changed(); this.drawStage(); this.drawTools(tools); });
    const del = el("button", "btn small-btn", "Löschen");
    del.addEventListener("click", () => {
      const l = this.get(); l.surfaces = this.surfaces().filter(x => x.id !== s.id);
      this.sel = null; this.selCorner = null; this.changed(); this.drawStage(); this.drawTools(tools);
    });
    tools.append(rect, tog, del);
  }
}
