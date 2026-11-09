// AUSGABE → Projektionsmapping: auf das Bild eines Beamers Leinwände legen (Vierecke mit vier Ecken).
// Ecke ziehen = verzerren (Trapez, Objekt), Mitte ziehen = verschieben, Pfeiltasten = pixelgenau.
// Jede Leinwand zeigt das ganze Bild oder einen Ausschnitt; außerhalb bleibt der Beamer schwarz.
import { MAX_MASK_POINTS, applyH, gridCorners, gridFromCorners, gridPoint, newMask, newSurface, snapCorner, squareToQuad, type Mask, type OutputLayout, type Surface } from "../core/layout";
import { t } from "../core/i18n";

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

/** Ziehbare Punkte einer Leinwand: die 4 Ecken oder alle Rasterpunkte. */
const handles = (s: Surface): [number, number][] => (s.grid ? s.grid.pts : s.corners);
/** Nach dem Ändern von Rasterpunkten die Ecken nachführen (für Umriss und Perspektive). */
const syncCorners = (s: Surface) => { if (s.grid) s.corners = gridCorners(s.grid); };
/** Punkt an (u, v) der Leinwand: weich durchs Raster bzw. perspektivisch durch die Ecken. */
const surfPoint = (s: Surface, u: number, v: number): [number, number] => (s.grid ? gridPoint(s.grid, u, v) : applyH(squareToQuad(s.corners), u, v));

export class MappingEditor {
  private screen: number | null = null;
  private sel: string | null = null;
  private selCorner: number | null = null;
  private stage: HTMLElement | null = null;
  private open: OpenScreen[] = [];
  /** Einrasten an Rand und anderen Ecken (abschaltbar für volle Präzision; ⌥ beim Ziehen schaltet kurz ab). */
  private snap = (() => { try { return localStorage.getItem("vjlink.mapSnap") !== "0"; } catch { return true; } })();

  constructor(private get: () => OutputLayout, private set: (l: OutputLayout) => void, private onChange: () => void,
    private testGrid: { on: () => boolean; toggle: () => void },
    private images: () => { id: string; name: string }[] = () => [{ id: "main", name: t("Bild 1") }],
    /** Bühnenfotos je Beamer (Hilfe im Editor, nicht auf dem Beamer). */
    private photos: () => Record<string, { url: string; opacity: number }> = () => ({})) {}

  private surfaces(): Surface[] { const l = this.get(); return (l.surfaces ??= []); }
  private mine(): Surface[] { return this.surfaces().filter(s => s.screen === this.screen); }
  private cur(): Surface | undefined { return this.mine().find(s => s.id === this.sel); }
  private masks(): Mask[] { const l = this.get(); return (l.masks ??= []); }
  private myMasks(): Mask[] { return this.masks().filter(m => m.screen === this.screen); }
  private curMask(): Mask | undefined { return this.myMasks().find(m => m.id === this.sel); }
  private changed(): void { this.set({ ...this.get(), surfaces: [...this.surfaces()] }); this.onChange(); }

  render(stage: HTMLElement, tools: HTMLElement, hint: HTMLElement, open: OpenScreen[]): void {
    this.stage = stage; this.open = open;
    stage.classList.remove("off");
    stage.replaceChildren(); tools.replaceChildren();
    if (!open.length) { hint.textContent = t("Öffne links einen Bildschirm (Beamer) als Ausgang, dann legst du hier Leinwände auf sein Bild."); return; }
    if (this.screen === null || !open.some(o => o.id === this.screen)) this.screen = open[0]!.id;
    // Erster Besuch: eine Leinwand über das ganze Bild, damit sofort etwas zu sehen ist
    if (!this.mine().length) { const s = newSurface(this.screen, 1, 0); this.surfaces().push(s); this.sel = s.id; this.changed(); }
    if (!this.cur()) this.sel = this.mine()[0]?.id ?? null;
    hint.textContent = t("Leinwände auf das Bild des Beamers legen: Ecke ziehen passt die Leinwand an Wand, Kiste oder Trapez an, Mitte ziehen verschiebt. Pfeiltasten: 1 px (mit ⇧ 10 px). Ecken rasten am Rand und an anderen Leinwänden ein („Einrasten aus“ oder ⌥ beim Ziehen für volle Präzision). Außerhalb bleibt der Beamer schwarz.");
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
    const st = this.stage;
    // Ausgang inzwischen geschlossen (z. B. während des Ziehens): nichts zeichnen, die Ansicht baut sich neu auf
    if (!st || !this.open.some(o => o.id === this.screen)) return;
    st.replaceChildren();
    const f = this.frame();
    const root = svg("svg", { class: "mp-svg", width: st.clientWidth, height: st.clientHeight });
    root.append(svg("rect", { x: f.x, y: f.y, width: f.w, height: f.h, class: "mp-frame" }));
    // Bühnenfoto als Hilfe im Hintergrund
    const photo = this.photos()[String(this.screen)];
    if (photo) root.append(svg("image", { href: photo.url, x: f.x, y: f.y, width: f.w, height: f.h, preserveAspectRatio: "none", opacity: photo.opacity, class: "mp-photo" }));
    const lab = svg("text", { x: f.x + 6, y: f.y - 8, class: "mp-label" }); lab.textContent = `${f.scr.label} · ${f.scr.w} × ${f.scr.h}`;
    root.append(lab);
    const P = (p: [number, number]) => [f.x + p[0] * f.w, f.y + p[1] * f.h] as const;
    for (const s of this.mine()) {
      const sel = s.id === this.sel;
      const g = svg("g", { class: `mp-surf${sel ? " sel" : ""}${s.on ? "" : " off"}` });
      // Umriss (beim Raster als Kurve) und Hilfslinien in der Form der Leinwand
      const N = 24, outline: string[] = [];
      for (const [u0, v0, du, dv] of [[0, 0, 1, 0], [1, 0, 0, 1], [1, 1, -1, 0], [0, 1, 0, -1]] as const)
        for (let k = 0; k < N; k++) outline.push(P(surfPoint(s, u0 + du * k / N, v0 + dv * k / N)).join(","));
      const poly = svg("polygon", { points: outline.join(" "), class: "mp-poly" });
      g.append(poly);
      const lines = s.grid ? s.grid.n - 1 : 4;
      for (let i = 1; i < lines; i++) {
        const t = i / lines;
        for (const horiz of [false, true]) {
          const pts: string[] = [];
          for (let k = 0; k <= N; k++) pts.push(P(horiz ? surfPoint(s, k / N, t) : surfPoint(s, t, k / N)).join(","));
          g.append(svg("polyline", { points: pts.join(" "), class: "mp-grid" }));
        }
      }
      const cx = s.corners.reduce((a, c) => a + c[0], 0) / 4, cy = s.corners.reduce((a, c) => a + c[1], 0) / 4;
      const name = svg("text", { x: P([cx, cy])[0], y: P([cx, cy])[1], class: "mp-name", "text-anchor": "middle" }); name.textContent = s.name;
      g.append(name);
      poly.addEventListener("pointerdown", e => this.drag(e, s, null));

      handles(s).forEach((c, i) => {
        const h = svg("circle", { cx: P(c)[0], cy: P(c)[1], r: sel ? (s.grid ? 6 : 8) : 5, class: `mp-corner${sel && this.selCorner === i ? " sel" : ""}` });
        h.addEventListener("pointerdown", e => this.drag(e, s, i));
        g.append(h);
      });
      root.append(g);
    }
    // Masken (über den Leinwänden): rot gestrichelt, Punkte ziehbar, Doppelklick auf eine Kante = Punkt einfügen
    for (const m of this.myMasks()) {
      const sel = m.id === this.sel;
      const g = svg("g", { class: `mp-mask${sel ? " sel" : ""}${m.on ? "" : " off"}${m.invert ? " inv" : ""}` });
      const poly = svg("polygon", { points: m.pts.map(p => P(p).join(",")).join(" "), class: "mp-mpoly" });
      poly.addEventListener("pointerdown", e => this.dragMask(e, m, null));
      g.append(poly);
      const cx = m.pts.reduce((a, p) => a + p[0], 0) / m.pts.length, cy = m.pts.reduce((a, p) => a + p[1], 0) / m.pts.length;
      const name = svg("text", { x: P([cx, cy])[0], y: P([cx, cy])[1], class: "mp-name", "text-anchor": "middle" });
      name.textContent = `${m.name}${m.invert ? t(" (nur innen)") : ""}`;
      g.append(name);
      m.pts.forEach((p, i) => {
        const h = svg("circle", { cx: P(p)[0], cy: P(p)[1], r: sel ? 6 : 4, class: `mp-mcorner${sel && this.selCorner === i ? " sel" : ""}` });
        h.addEventListener("pointerdown", e => this.dragMask(e, m, i));
        g.append(h);
      });
      root.append(g);
    }
    st.append(root);
    st.tabIndex = 0;
    st.onkeydown = e => this.key(e);
  }

  /** Ecke (corner) oder ganze Leinwand (null) ziehen. */
  private lastDown = { id: "", at: 0 };

  private drag(e: PointerEvent, s: Surface, corner: number | null): void {
    e.preventDefault(); e.stopPropagation();
    // Doppelklick auf die Leinwand (Mitte): umbenennen
    const now = performance.now();
    if (corner === null && this.lastDown.id === s.id && now - this.lastDown.at < 350) {
      this.lastDown = { id: "", at: 0 };
      setTimeout(() => { const n = document.getElementById("mp-name") as HTMLInputElement | null; n?.focus(); n?.select(); }, 30);
      return;
    }
    this.lastDown = { id: corner === null ? s.id : "", at: now };
    const first = this.sel !== s.id;
    this.sel = s.id; this.selCorner = corner;
    this.stage?.focus();
    const f = this.frame();
    const start = handles(s).map(c => [...c] as [number, number]);
    const sx = e.clientX, sy = e.clientY;
    const tol = 10 / Math.min(f.w, f.h);
    const others = this.mine().filter(o => o.id !== s.id).flatMap(o => handles(o));
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - sx) / f.w, dy = (ev.clientY - sy) / f.h;
      const hs = handles(s);
      if (corner === null) start.forEach((c, i) => { hs[i] = [c[0] + dx, c[1] + dy]; });
      else {
        const p: [number, number] = [start[corner]![0] + dx, start[corner]![1] + dy];
        hs[corner] = this.snap && !ev.altKey ? snapCorner(p, [...others, ...start.filter((_, i) => i !== corner)], tol) : p;
      }
      syncCorners(s);
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

  /** Masken-Punkt (i) oder ganze Maske (null) ziehen; Doppelklick auf die Fläche fügt an der nächsten Kante einen Punkt ein. */
  private dragMask(e: PointerEvent, m: Mask, i: number | null): void {
    e.preventDefault(); e.stopPropagation();
    const f = this.frame();
    const at: [number, number] = [(e.clientX - this.stage!.getBoundingClientRect().left - f.x) / f.w, (e.clientY - this.stage!.getBoundingClientRect().top - f.y) / f.h];
    const now = performance.now();
    if (i === null && this.lastDown.id === m.id && now - this.lastDown.at < 350) {
      this.lastDown = { id: "", at: 0 };
      if (m.pts.length < MAX_MASK_POINTS) {
        // nächste Kante suchen und dort einfügen
        let best = 0, bd = Infinity;
        m.pts.forEach((a, k) => {
          const b = m.pts[(k + 1) % m.pts.length]!, dx = b[0] - a[0], dy = b[1] - a[1];
          const t = Math.max(0, Math.min(1, ((at[0] - a[0]) * dx + (at[1] - a[1]) * dy) / Math.max(1e-9, dx * dx + dy * dy)));
          const d = Math.hypot(at[0] - (a[0] + dx * t), at[1] - (a[1] + dy * t));
          if (d < bd) { bd = d; best = k; }
        });
        m.pts.splice(best + 1, 0, at);
        this.selCorner = best + 1;
        this.changed(); this.drawStage(); this.drawTools(document.getElementById("cv-tools")!);
      }
      return;
    }
    this.lastDown = { id: i === null ? m.id : "", at: now };
    const first = this.sel !== m.id;
    this.sel = m.id; this.selCorner = i;
    this.stage?.focus();
    const start = m.pts.map(p => [...p] as [number, number]);
    const sx = e.clientX, sy = e.clientY, tol = 10 / Math.min(f.w, f.h);
    const others = [...this.mine().flatMap(o => handles(o)), ...this.myMasks().filter(o => o !== m).flatMap(o => o.pts)];
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - sx) / f.w, dy = (ev.clientY - sy) / f.h;
      if (i === null) start.forEach((p, k) => { m.pts[k] = [p[0] + dx, p[1] + dy]; });
      else {
        const p: [number, number] = [start[i]![0] + dx, start[i]![1] + dy];
        m.pts[i] = this.snap && !ev.altKey ? snapCorner(p, [...others, ...start.filter((_, k) => k !== i)], tol) : p;
      }
      this.drawStage();
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); this.changed(); if (first) this.drawTools(document.getElementById("cv-tools")!); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    this.drawStage();
    if (first) this.drawTools(document.getElementById("cv-tools")!);
  }

  private key(e: KeyboardEvent): void {
    const mk = this.curMask();
    if (mk) {
      const d = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, [number, number]>)[e.key];
      if ((e.key === "Delete" || e.key === "Backspace") && this.selCorner !== null && mk.pts.length > 3) { e.preventDefault(); mk.pts.splice(this.selCorner, 1); this.selCorner = null; this.drawStage(); this.changed(); return; }
      if (!d) return;
      e.preventDefault();
      const scr = this.open.find(o => o.id === this.screen)!, step = e.shiftKey ? 10 : 1;
      const dx = d[0] * step / scr.w, dy = d[1] * step / scr.h;
      if (this.selCorner === null) mk.pts.forEach((p, k) => { mk.pts[k] = [p[0] + dx, p[1] + dy]; });
      else mk.pts[this.selCorner] = [mk.pts[this.selCorner]![0] + dx, mk.pts[this.selCorner]![1] + dy];
      this.drawStage(); this.changed();
      return;
    }
    const s = this.cur(); if (!s) return;
    const d = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, [number, number]>)[e.key];
    if (e.key === "Tab" && !e.shiftKey && this.selCorner !== null) { e.preventDefault(); this.selCorner = (this.selCorner + 1) % handles(s).length; this.drawStage(); return; }
    if (!d) return;
    e.preventDefault();
    const scr = this.open.find(o => o.id === this.screen)!;
    const step = e.shiftKey ? 10 : 1;
    const dx = d[0] * step / scr.w, dy = d[1] * step / scr.h;
    const hs = handles(s);
    if (this.selCorner === null) hs.forEach((c, i) => { hs[i] = [c[0] + dx, c[1] + dy]; });
    else hs[this.selCorner] = [hs[this.selCorner]![0] + dx, hs[this.selCorner]![1] + dy];
    syncCorners(s);
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
    const add = el("button", "btn small-btn", t("+ Leinwand"));
    add.addEventListener("click", () => {
      const s = newSurface(this.screen!, this.mine().length + 1, 0.25);
      this.surfaces().push(s); this.sel = s.id; this.selCorner = null;
      this.changed(); this.drawStage(); this.drawTools(tools);
    });
    const grid = el("button", `btn small-btn${this.testGrid.on() ? " on" : ""}`, t("Raster zum Ausrichten"));
    grid.title = t("Raster-Testbild auf die Leinwände legen (verzerrt), um Ecken genau an Kanten auszurichten");
    grid.addEventListener("click", () => { this.testGrid.toggle(); grid.classList.toggle("on", this.testGrid.on()); });
    const snap = el("button", `btn small-btn${this.snap ? " on" : ""}`, this.snap ? t("Einrasten an") : t("Einrasten aus"));
    snap.title = t("Ecken rasten am Bildrand und an anderen Leinwänden ein. Aus für volle Präzision (⌥ beim Ziehen schaltet es kurz ab).");
    snap.addEventListener("click", () => {
      this.snap = !this.snap;
      try { localStorage.setItem("vjlink.mapSnap", this.snap ? "1" : "0"); } catch { /* ohne Speicher */ }
      snap.classList.toggle("on", this.snap); snap.textContent = this.snap ? t("Einrasten an") : t("Einrasten aus");
    });
    const addMask = el("button", "btn small-btn", t("+ Maske"));
    addMask.title = t("Bereich schwärzen (z. B. Tür, Fenster, Person) – Punkte ziehen, Doppelklick auf die Maske fügt einen Punkt ein");
    addMask.addEventListener("click", () => {
      const m = newMask(this.screen!, this.myMasks().length + 1);
      this.masks().push(m); this.sel = m.id; this.selCorner = null;
      this.changed(); this.drawStage(); this.drawTools(tools);
    });
    // Bühnenfoto laden (vom Standort des Beamers fotografiert): Hilfe zum Anlegen der Leinwände
    const ph = this.photos()[String(this.screen)];
    const photoBtn = el("button", "btn small-btn", ph ? t("Foto ersetzen") : t("Bühnenfoto …"));
    photoBtn.title = t("Foto der Bühne (am besten vom Beamer aus) als Hilfe hinter die Leinwände legen; geht nicht an den Beamer");
    const file = el("input"); file.type = "file"; file.accept = "image/png,image/jpeg,image/webp"; file.hidden = true;
    photoBtn.addEventListener("click", () => file.click());
    file.addEventListener("change", async () => {
      const f = file.files?.[0]; if (!f) return;
      file.value = "";
      // Als data:-URL lesen (blob: ist in der Oberfläche gesperrt)
      const src = await new Promise<string>(r => { const fr = new FileReader(); fr.onload = () => r(String(fr.result)); fr.onerror = () => r(""); fr.readAsDataURL(f); });
      const img = new Image(); img.src = src;
      try { await img.decode(); } catch { photoBtn.textContent = t("Foto nicht lesbar"); return; }
      const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = el("canvas"); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      this.photos()[String(this.screen)] = { url: c.toDataURL("image/jpeg", 0.85), opacity: ph?.opacity ?? 0.6 };
      this.changed(); this.drawStage(); this.drawTools(tools);
    });
    tools.append(add, addMask, grid, snap, photoBtn, file);
    if (ph) {
      const ol = el("label", "", t("Foto"));
      const op = el("input"); op.type = "range"; op.min = "5"; op.max = "100"; op.value = String(Math.round(ph.opacity * 100));
      op.addEventListener("input", () => { ph.opacity = Number(op.value) / 100; this.drawStage(); });
      op.addEventListener("change", () => this.changed());
      const rm = el("button", "icon", "×"); rm.title = t("Foto entfernen");
      rm.addEventListener("click", () => { delete this.photos()[String(this.screen)]; this.changed(); this.drawStage(); this.drawTools(tools); });
      ol.append(op, rm); tools.append(ol);
    }
    const mk = this.curMask();
    if (mk) {
      const nameLab = el("label", "", t("Name"));
      const nm = el("input", "mp-nm"); nm.value = mk.name; nm.maxLength = 40; nm.id = "mp-name";
      nm.addEventListener("change", () => { mk.name = nm.value.trim() || mk.name; this.changed(); this.drawStage(); });
      nameLab.append(nm);
      const inv = el("button", `btn small-btn${mk.invert ? " on" : ""}`, mk.invert ? t("Nur innen zeigen") : t("Innen schwärzen"));
      inv.title = t("Umschalten: Bereich schwärzen ↔ nur diesen Bereich zeigen");
      inv.addEventListener("click", () => { mk.invert = !mk.invert; this.changed(); this.drawStage(); this.drawTools(tools); });
      const fl = el("label", "", t("Weiche Kante"));
      const fr = el("input"); fr.type = "range"; fr.min = "0"; fr.max = "120"; fr.value = String(mk.feather);
      const fv = el("small", "muted", `${mk.feather} px`);
      fr.addEventListener("input", () => { mk.feather = Number(fr.value); fv.textContent = `${fr.value} px`; this.changed(); });
      fl.append(fr, fv);
      const delPt = el("button", "btn small-btn", t("Punkt löschen"));
      delPt.disabled = this.selCorner === null || mk.pts.length <= 3;
      delPt.addEventListener("click", () => { if (this.selCorner !== null && mk.pts.length > 3) { mk.pts.splice(this.selCorner, 1); this.selCorner = null; this.changed(); this.drawStage(); this.drawTools(tools); } });
      const tog = el("button", `btn small-btn${mk.on ? " on" : ""}`, mk.on ? t("An") : t("Aus"));
      tog.addEventListener("click", () => { mk.on = !mk.on; this.changed(); this.drawStage(); this.drawTools(tools); });
      const del = el("button", "btn small-btn", t("Maske löschen"));
      del.addEventListener("click", () => { const l = this.get(); l.masks = this.masks().filter(x => x !== mk); this.sel = null; this.selCorner = null; this.changed(); this.drawStage(); this.drawTools(tools); });
      tools.append(nameLab, inv, fl, delPt, tog, del,
        el("small", "muted", t("Doppelklick auf die Maske: Punkt einfügen · Punkt wählen + Entf: löschen")));
      return;
    }
    const s = this.cur();
    if (!s) return;
    const nameLab = el("label", "", t("Name"));
    const name = el("input", "mp-nm"); name.value = s.name; name.maxLength = 40; name.setAttribute("aria-label", t("Name der Leinwand"));
    name.id = "mp-name";
    name.addEventListener("keydown", e => { if (e.key === "Enter") name.blur(); });
    nameLab.append(name);
    name.addEventListener("change", () => { s.name = name.value.trim() || s.name; this.changed(); this.drawStage(); });
    const full = s.src.x === 0 && s.src.y === 0 && s.src.w === 1 && s.src.h === 1;
    // Welches Bild (Tab VISUALS unter „Ausgang“), ganz oder als Ausschnitt
    const imgs = this.images();
    const img = el("select"); img.setAttribute("aria-label", t("Bild auf dieser Leinwand"));
    for (const im of imgs) img.append(new Option(t("Zeigt: {name}", { name: im.name }), im.id));
    img.value = imgs.some(im => im.id === s.image) ? s.image! : "main";
    img.addEventListener("change", () => { s.image = img.value; this.changed(); });
    const content = el("select"); content.setAttribute("aria-label", t("Ganzes Bild oder Ausschnitt"));
    content.append(new Option(t("ganz"), "full"), new Option(t("Ausschnitt"), "part"));
    content.value = full ? "full" : "part";
    content.addEventListener("change", () => {
      s.src = content.value === "full" ? { x: 0, y: 0, w: 1, h: 1 } : { x: 0, y: 0, w: 0.5, h: 0.5 };
      this.changed(); this.drawTools(tools);
    });
    tools.append(nameLab, img, content);
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
      num("X", "x"); num("Y", "y"); num(t("Breite"), "w"); num(t("Höhe"), "h");
    }
    const rect = el("button", "btn small-btn", t("Ecken zurücksetzen"));
    rect.title = t("Wieder ein gerades Rechteck");
    rect.addEventListener("click", () => {
      const xs = s.corners.map(c => c[0]), ys = s.corners.map(c => c[1]);
      const a = Math.min(...xs), b = Math.max(...xs), c = Math.min(...ys), d = Math.max(...ys);
      s.corners = [[a, c], [b, c], [b, d], [a, d]];
      if (s.grid) s.grid = gridFromCorners(s.corners, s.grid.n);
      this.changed(); this.drawStage();
    });
    // Raster-Verzerrung für gewölbte oder unebene Flächen
    const gridSel = el("select"); gridSel.setAttribute("aria-label", t("Raster-Verzerrung"));
    gridSel.title = t("Raster: mehr Punkte zum Ziehen, die Fläche wird weich gebogen (Säulen, Kuppeln, unebene Wände)");
    gridSel.append(new Option(t("Form: 4 Ecken"), "0"), new Option(t("Form: Raster 3×3"), "3"), new Option(t("Form: Raster 5×5"), "5"));
    gridSel.value = String(s.grid?.n ?? 0);
    gridSel.addEventListener("change", () => {
      const n = Number(gridSel.value);
      if (!n) { if (s.grid) { s.corners = gridCorners(s.grid); delete s.grid; } }
      else if (s.grid) {
        // Andere Punktzahl: aus der jetzigen Form neu abtasten
        const g = s.grid, pts: [number, number][] = [];
        for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) pts.push(gridPoint(g, i / (n - 1), j / (n - 1)));
        s.grid = { n, pts };
      } else s.grid = gridFromCorners(s.corners, n);
      this.selCorner = null;
      syncCorners(s);
      this.changed(); this.drawStage();
    });
    tools.append(gridSel);
    const tog = el("button", `btn small-btn${s.on ? " on" : ""}`, s.on ? t("An") : t("Aus"));
    tog.addEventListener("click", () => { s.on = !s.on; this.changed(); this.drawStage(); this.drawTools(tools); });
    const del = el("button", "btn small-btn", t("Löschen"));
    del.addEventListener("click", () => {
      const l = this.get(); l.surfaces = this.surfaces().filter(x => x.id !== s.id);
      this.sel = null; this.selCorner = null; this.changed(); this.drawStage(); this.drawTools(tools);
    });
    tools.append(rect, tog, del);
  }
}
