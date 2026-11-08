// AUSGABE → Anordnung: Gleiches Bild auf allen Bildschirmen oder eine Leinwand, auf der die Bildschirme
// liegen (ziehen, einrasten, Werte eintippen). Jeder Ausgang zeigt dann seinen Ausschnitt.
import { arrange, canvasBounds, snapRect, syncScreens, type OutputLayout, type ScreenRect } from "../core/layout";
import type { DisplayInfo } from "../core/frame";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e;
}

export class OutputTab {
  private sel: number | null = null;
  private dragging = false;

  constructor(private get: () => OutputLayout, private set: (l: OutputLayout) => void,
    private displays: () => DisplayInfo[], private onChange: () => void) {
    document.querySelectorAll<HTMLButtonElement>("#out-mode [data-mode]").forEach(b => b.addEventListener("click", () => {
      this.set({ ...this.get(), mode: b.dataset.mode as OutputLayout["mode"] });
      this.render(); this.onChange();
    }));
    new ResizeObserver(() => { if (!this.dragging) this.render(); }).observe(document.getElementById("cv-stage")!);
  }

  /** Offene Bildschirme in Pixeln (native Auflösung). */
  private open(): { id: number; label: string; w: number; h: number }[] {
    return this.displays().filter(d => d.open).map(d => ({ id: d.id, label: d.label, w: Math.round(d.width * d.scaleFactor), h: Math.round(d.height * d.scaleFactor) }));
  }

  /** Bildschirme auf der Leinwand mit den offenen abgleichen (neue kommen rechts dazu). */
  sync(): void { this.set(syncScreens(this.get(), this.open())); }

  render(): void {
    this.sync();
    const l = this.get();
    const open = this.open();
    const onCanvas = l.screens.filter(s => open.some(o => o.id === s.id));
    document.querySelectorAll<HTMLButtonElement>("#out-mode [data-mode]").forEach(b => {
      const on = b.dataset.mode === l.mode; b.classList.toggle("on", on); b.setAttribute("aria-checked", String(on));
    });
    const b = canvasBounds(onCanvas);
    document.getElementById("out-mode-hint")!.textContent = l.mode === "mirror"
      ? "Jeder Ausgang zeigt das ganze Bild in seiner eigenen Auflösung."
      : onCanvas.length
        ? `Leinwand ${b.w} × ${b.h} Pixel. Jeder Ausgang zeigt seinen Teil, Visuals und Videos laufen nahtlos über alle Bildschirme. Ziehen zum Anordnen, Kanten rasten ein.`
        : "Öffne links mindestens einen Bildschirm als Ausgang, dann erscheint er hier.";

    const stage = document.getElementById("cv-stage")!;
    stage.classList.toggle("off", l.mode !== "canvas");
    stage.replaceChildren();
    const tools = document.getElementById("cv-tools")!;
    tools.replaceChildren();
    if (!onCanvas.length) return;

    // Maßstab: ganze Leinwand mit etwas Rand in die Fläche einpassen
    const sw = stage.clientWidth, sh = stage.clientHeight;
    const pad = 0.12;
    const scale = Math.min(sw / (b.w * (1 + 2 * pad)), sh / (b.h * (1 + 2 * pad)));
    const ox = (sw - b.w * scale) / 2 - b.x * scale, oy = (sh - b.h * scale) / 2 - b.y * scale;
    const frame = el("div", "cv-canvas");
    Object.assign(frame.style, { left: `${ox + b.x * scale}px`, top: `${oy + b.y * scale}px`, width: `${b.w * scale}px`, height: `${b.h * scale}px` });
    frame.append(el("span", "", `Leinwand ${b.w} × ${b.h}`));
    stage.append(frame);

    onCanvas.forEach((s, i) => {
      const r = el("div", `cv-rect${this.sel === s.id ? " sel" : ""}`);
      Object.assign(r.style, { left: `${ox + s.x * scale}px`, top: `${oy + s.y * scale}px`, width: `${s.w * scale}px`, height: `${s.h * scale}px` });
      r.append(el("b", "", `${i + 1} · ${s.label}`), el("small", "", `${s.w} × ${s.h} · bei ${s.x}, ${s.y}`));
      r.setAttribute("role", "button"); r.tabIndex = 0;
      r.setAttribute("aria-label", `${s.label}, ${s.w} mal ${s.h}, Position ${s.x}, ${s.y}`);
      r.addEventListener("pointerdown", e => {
        if (l.mode !== "canvas") return;
        e.preventDefault();
        r.setPointerCapture(e.pointerId);
        this.sel = s.id; this.dragging = true;
        const sx = e.clientX, sy = e.clientY, x0 = s.x, y0 = s.y;
        const others = onCanvas.filter(o => o.id !== s.id);
        const move = (ev: PointerEvent) => {
          const moved = snapRect({ ...s, x: x0 + (ev.clientX - sx) / scale, y: y0 + (ev.clientY - sy) / scale }, others, 12 / scale);
          s.x = moved.x; s.y = moved.y;
          r.style.left = `${ox + s.x * scale}px`; r.style.top = `${oy + s.y * scale}px`;
          r.querySelector("small")!.textContent = `${s.w} × ${s.h} · bei ${s.x}, ${s.y}`;
        };
        const up = () => {
          r.removeEventListener("pointermove", move); r.removeEventListener("pointerup", up);
          this.dragging = false;
          this.set({ ...l, screens: [...l.screens] });
          this.render(); this.onChange();
        };
        r.addEventListener("pointermove", move); r.addEventListener("pointerup", up);
      });
      r.addEventListener("keydown", e => {
        const step = e.shiftKey ? 100 : 10;
        const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
        if (!d || l.mode !== "canvas") return;
        e.preventDefault(); s.x += d[0]!; s.y += d[1]!; this.sel = s.id; this.render(); this.onChange();
      });
      stage.append(r);
    });

    if (l.mode !== "canvas") return;
    const auto = (dir: "row" | "column", label: string) => {
      const btn = el("button", "btn small-btn", label);
      btn.addEventListener("click", () => {
        const placed = arrange(onCanvas, dir);
        this.set({ ...l, screens: l.screens.map(s => placed.find(p => p.id === s.id) ?? s) });
        this.render(); this.onChange();
      });
      tools.append(btn);
    };
    auto("row", "Nebeneinander"); auto("column", "Untereinander");
    const s = onCanvas.find(x => x.id === this.sel);
    if (!s) { tools.append(el("span", "muted small", "Bildschirm anklicken für genaue Werte (Pfeiltasten: 10 px, mit ⇧ 100 px).")); return; }
    const field = (label: string, key: keyof Pick<ScreenRect, "x" | "y" | "w" | "h">, min: number) => {
      const lab = el("label", "", label);
      const inp = el("input"); inp.type = "number"; inp.value = String(s[key]); inp.min = String(min);
      inp.addEventListener("change", () => {
        const v = Math.round(Number(inp.value));
        if (Number.isFinite(v) && v >= min) { s[key] = v; this.set({ ...l, screens: [...l.screens] }); this.render(); this.onChange(); }
      });
      lab.append(inp); tools.append(lab);
    };
    field("X", "x", -32768); field("Y", "y", -32768); field("Breite", "w", 16); field("Höhe", "h", 16);
    const nat = open.find(o => o.id === s.id);
    if (nat && (nat.w !== s.w || nat.h !== s.h)) {
      const btn = el("button", "btn small-btn", `Native Größe ${nat.w} × ${nat.h}`);
      btn.addEventListener("click", () => { s.w = nat.w; s.h = nat.h; this.set({ ...l, screens: [...l.screens] }); this.render(); this.onChange(); });
      tools.append(btn);
    }
  }
}
