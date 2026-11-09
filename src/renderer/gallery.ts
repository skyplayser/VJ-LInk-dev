// GALERIE: alle Visuals, Effekte und Medien an einem Ort. Ansehen (Live-Vorschau), einer Ebene zuweisen,
// Medien umbenennen und löschen.
import type { ControlContext } from "../core/control";
import { CATEGORY_LABEL, EFFECTS, POST_EFFECTS, READY_GENERATORS, type EffectCategory, type EffectDef } from "../core/effects";
import { mediaClip } from "../core/media";
import { addClip, defaultLayer, forgetClip, MAX_EFFECTS, type ShowState } from "../core/show";
import { videoClip } from "../core/video";
import { camClip } from "../core/camera";
import { Engine } from "../engine/engine";
import type { MediaLibrary } from "./medialib";
import type { VideoLibrary } from "./videolib";
import { t } from "../core/i18n";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e;
}
const REACT = { beat: t("Beat"), bass: t("Bass"), mid: t("Mitten"), high: t("Höhen"), wave: t("Wellenform") } as const;
type Section = "visuals" | "effects" | "media";

export interface GalleryDeps {
  ctx: ControlContext;
  images: MediaLibrary;
  videos: VideoLibrary;
  importFiles: (f: File[]) => Promise<{ id: string; name: string }[]>;
  changed: () => void;
  toast: (m: string) => void;
  /** Ebene, die gerade bearbeitet wird (Vorauswahl). */
  currentLayer: () => number;
  /** Ebene auswählen (öffnet ihre Einstellungen). */
  selectLayer: (l: number) => void;
}

export class Gallery {
  private section: Section = "visuals";
  private cat: EffectCategory | "all" = "all";
  private query = "";
  private selected: string = READY_GENERATORS[0]!.id;
  private engine: Engine | null = null;
  private live = el("canvas", "gal-live");
  private thumbCanvas = el("canvas");
  private thumbs = new Map<string, string>();
  private queue: string[] = [];
  private armed = "";
  private layerSel = el("select");

  constructor(private d: GalleryDeps, private root: HTMLElement) {
    this.live.width = 640; this.live.height = 360;
    this.thumbCanvas.width = 256; this.thumbCanvas.height = 144;
    try {
      this.engine = new Engine(this.live, { transparent: false });
      d.images.attach(this.engine);
      this.engine.videoSource = (_k, id) => { const p = d.videos.posters.get(id); return p ? { el: p, w: p.width, h: p.height } : null; };
    } catch { this.engine = null; }
    this.render();
  }

  /** Probe-Show: eine neutrale Ebene, damit jedes Visual so aussieht, wie es gebaut ist.
   *  Eigene Medien (Grafik, Video, Text) stehen still, statt im Takt zu pulsieren. */
  private probeShow(clip: string | null = null): ShowState {
    const s = this.d.ctx.show;
    const own = !!clip && !READY_GENERATORS.some(g => g.id === clip);
    const l = { ...defaultLayer(), effects: [], colorSource: "original" as const, ...(own ? { drive: "static" as const } : {}) };
    return { ...s, layers: [l], blackout: false, master: 1 } as ShowState;
  }

  /** Einmal pro Bild, solange die Galerie offen ist. */
  tick(nowMs: number): void {
    if (!this.engine || !this.root.offsetParent) return;
    const beat = this.d.ctx.tempo.beatAt(nowMs);
    const show = this.probeShow(this.section === "effects" ? null : this.selected);
    // Ein Vorschaubild pro Bild nachziehen, damit die Oberfläche flüssig bleibt
    const next = this.queue.shift();
    if (next) {
      this.engine.resize(256, 144);
      this.engine.renderThumbs(this.probeShow(next), beat + 0.37, nowMs + 1500, [{ layer: 0, col: 0, clip: next, x: 0, y: 0, w: 256, h: 144 }]);
      try { this.thumbs.set(next, this.live.toDataURL("image/jpeg", 0.8)); } catch { /* ohne Bild */ }
      const img = this.root.querySelector<HTMLImageElement>(`img[data-thumb="${CSS.escape(next)}"]`);
      if (img) img.src = this.thumbs.get(next) ?? "";
    }
    this.engine.resize(640, 360);
    if (this.section !== "effects") this.engine.renderThumbs(show, beat, nowMs, [{ layer: 0, col: 0, clip: this.selected, x: 0, y: 0, w: 640, h: 360 }]);
    else this.renderEffectPreview(show, beat, nowMs);
  }

  /** Effekte zeigen sich auf einem ruhigen Visual (Plasma) in voller Stärke. */
  private renderEffectPreview(show: ShowState, beat: number, nowMs: number): void {
    const fx = POST_EFFECTS.find(e => e.id === this.selected) ?? POST_EFFECTS[0]!;
    const l = { ...show.layers[0]!, effects: [{ id: fx.id, on: true, amount: 0.8 }] };
    this.engine!.renderThumbs({ ...show, layers: [l] }, beat, nowMs, [{ layer: 0, col: 0, clip: "tunnel", x: 0, y: 0, w: 640, h: 360 }]);
  }

  render(): void {
    const r = this.root;
    r.replaceChildren();
    const head = el("div", "gal-head");
    head.append(el("h2", "", t("Galerie")));
    const tabs = el("div", "seg gal-tabs");
    for (const [k, label] of [["visuals", `Visuals (${READY_GENERATORS.length})`], ["effects", `${t("Effekte")} (${POST_EFFECTS.length})`], ["media", t("Medien")]] as const) {
      const b = el("button", k === this.section ? "on" : "", label);
      b.addEventListener("click", () => {
        this.section = k; this.armed = "";
        this.selected = k === "effects" ? POST_EFFECTS[0]!.id : k === "visuals" ? READY_GENERATORS[0]!.id : this.selected;
        this.render();
      });
      tabs.append(b);
    }
    head.append(tabs);
    r.append(head);

    const body = el("div", "gal-body");
    const side = el("aside", "gal-side");
    side.append(this.live);
    const info = el("div", "gal-info");
    side.append(info, this.layerPicker());
    const main = el("div", "gal-main");
    body.append(main, side);
    r.append(body);

    if (this.section === "visuals") this.renderVisuals(main, info);
    else if (this.section === "effects") this.renderEffects(main, info);
    else this.renderMedia(main, info);
  }

  private layerPicker(): HTMLElement {
    const row = el("div", "gal-layer");
    this.layerSel.replaceChildren();
    this.d.ctx.show.layers.forEach((l, i) => this.layerSel.append(new Option(`${t("Ebene {n}", { n: i + 1 })}${(l as { name?: string }).name ? ` · ${(l as { name?: string }).name}` : ""}`, String(i))));
    this.layerSel.value = String(Math.min(this.d.currentLayer(), this.d.ctx.show.layers.length - 1));
    this.layerSel.setAttribute("aria-label", t("Ziel-Ebene"));
    row.append(el("span", "am-cap", t("Ziel-Ebene")), this.layerSel);
    return row;
  }
  private target(): number { return Number(this.layerSel.value) || 0; }

  // ---- Visuals ----------------------------------------------------------------------
  private renderVisuals(main: HTMLElement, info: HTMLElement): void {
    const bar = el("div", "gal-bar");
    const search = el("input", "gal-search"); search.type = "search"; search.placeholder = t("Suchen …"); search.value = this.query;
    search.setAttribute("aria-label", t("Visuals suchen"));
    search.addEventListener("input", () => { this.query = search.value; this.fillGrid(grid); });
    const chips = el("div", "filters");
    const cats = (Object.keys(CATEGORY_LABEL) as EffectCategory[]).filter(c => READY_GENERATORS.some(g => g.category === c));
    for (const c of ["all", ...cats] as const) {
      const n = c === "all" ? READY_GENERATORS.length : READY_GENERATORS.filter(g => g.category === c).length;
      const b = el("button", c === this.cat ? "on" : "", `${c === "all" ? t("Alle") : CATEGORY_LABEL[c]} ${n}`);
      b.addEventListener("click", () => { this.cat = c; chips.querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); this.fillGrid(grid); });
      chips.append(b);
    }
    bar.append(search, chips);
    const grid = el("div", "gal-grid");
    main.append(bar, grid);
    this.fillGrid(grid);
    this.fillInfoVisual(info);
  }

  private fillGrid(grid: HTMLElement): void {
    grid.replaceChildren();
    const q = this.query.trim().toLowerCase();
    const list = READY_GENERATORS.filter(g => (this.cat === "all" || g.category === this.cat)
      && (!q || g.name.toLowerCase().includes(q) || g.info.toLowerCase().includes(q) || CATEGORY_LABEL[g.category].toLowerCase().includes(q)));
    // „Alle“: nach Kategorien in der festen Reihenfolge (neue Techno-Visuals zuerst)
    const order = Object.keys(CATEGORY_LABEL);
    list.sort((x, y) => order.indexOf(x.category) - order.indexOf(y.category));
    let lastCat = "";
    for (const g of list) {
      if (this.cat === "all" && g.category !== lastCat) { lastCat = g.category; grid.append(el("h4", "gal-cat", CATEGORY_LABEL[g.category])); }
      grid.append(this.card(g));
    }
    if (!list.length) grid.append(el("p", "muted small", t("Nichts gefunden.")));
  }

  private card(g: EffectDef): HTMLElement {
    const c = el("button", `gal-card${g.id === this.selected ? " sel" : ""}`);
    const img = el("img"); img.alt = ""; img.dataset.thumb = g.id;
    const t = this.thumbs.get(g.id);
    if (t) img.src = t; else if (!this.queue.includes(g.id)) this.queue.push(g.id);
    c.append(img, el("b", "", g.name), el("small", "", g.reactsTo.map(x => REACT[x]).join(" · ") || CATEGORY_LABEL[g.category]));
    c.title = g.info;
    c.addEventListener("click", () => {
      this.selected = g.id;
      this.root.querySelectorAll(".gal-card").forEach(x => x.classList.toggle("sel", x === c));
      this.fillInfoVisual(this.root.querySelector(".gal-info")!);
    });
    c.addEventListener("dblclick", () => this.addVisual(g.id, true));
    return c;
  }

  private fillInfoVisual(info: HTMLElement): void {
    const g = EFFECTS.find(e => e.id === this.selected);
    info.replaceChildren();
    if (!g) return;
    info.append(el("b", "", g.name), el("span", "am-cap", CATEGORY_LABEL[g.category]), el("p", "muted small", g.info));
    if (g.reactsTo.length) info.append(el("p", "muted small", t("Reagiert auf: {list}", { list: g.reactsTo.map(x => REACT[x]).join(", ") })));
    const row = el("div", "inline wrap");
    const add = el("button", "btn small-btn", t("In die Ebene legen"));
    add.title = t("Nimmt das Visual in die Clip-Zeile der Ziel-Ebene auf");
    add.addEventListener("click", () => this.addVisual(g.id, false));
    const play = el("button", "btn small-btn primary-btn", t("Jetzt abspielen"));
    play.title = t("Aufnehmen und sofort in der Ziel-Ebene starten (Doppelklick auf die Karte)");
    play.addEventListener("click", () => this.addVisual(g.id, true));
    row.append(add, play);
    info.append(row);
  }

  private addVisual(id: string, play: boolean): void {
    const i = this.target(), l = this.d.ctx.show.layers[i];
    if (!l) return;
    addClip(l, id);
    if (play) l.clip = id;
    this.d.changed();
    this.d.toast(play ? t("Läuft jetzt auf Ebene {n}.", { n: i + 1 }) : t("In Ebene {n} aufgenommen.", { n: i + 1 }));
  }

  // ---- Effekte ----------------------------------------------------------------------
  private renderEffects(main: HTMLElement, info: HTMLElement): void {
    const grid = el("div", "gal-list");
    for (const fx of POST_EFFECTS) {
      const c = el("button", `gal-row${fx.id === this.selected ? " sel" : ""}`);
      c.append(el("b", "", fx.name), el("small", "", fx.info));
      c.addEventListener("click", () => {
        this.selected = fx.id;
        grid.querySelectorAll(".gal-row").forEach(x => x.classList.toggle("sel", x === c));
        fill();
      });
      grid.append(c);
    }
    main.append(el("p", "muted small", t("Effekte liegen im Stapel einer Ebene und wirken auf ihren Clip. Vorschau: Tunnel mit dem Effekt bei 80 %.")), grid);
    const fill = () => {
      const fx = POST_EFFECTS.find(e => e.id === this.selected)!;
      info.replaceChildren(el("b", "", fx.name), el("p", "muted small", fx.info));
      const add = el("button", "btn small-btn primary-btn", t("Zum Effekt-Stapel der Ebene"));
      add.addEventListener("click", () => {
        const i = this.target(), l = this.d.ctx.show.layers[i];
        if (!l) return;
        if (l.effects.length >= MAX_EFFECTS) { this.d.toast(t("Ebene {n} hat schon {max} Effekte.", { n: i + 1, max: MAX_EFFECTS })); return; }
        l.effects.push({ id: fx.id, on: true, amount: 0.5 });
        this.d.changed(); this.d.selectLayer(i);
        this.d.toast(t("{name} liegt im Stapel von Ebene {n} (Stärke 50 %).", { name: fx.name, n: i + 1 }));
      });
      info.append(add);
    };
    fill();
  }

  // ---- Medien -----------------------------------------------------------------------
  private renderMedia(main: HTMLElement, info: HTMLElement): void {
    const file = el("input"); file.type = "file"; file.multiple = true; file.hidden = true;
    file.accept = "image/png,image/jpeg,image/webp,image/gif,image/svg+xml,video/mp4,video/quicktime,video/webm,.mov,.m4v";
    file.addEventListener("change", async () => {
      if (!file.files?.length) return;
      const added = await this.d.importFiles(Array.from(file.files));
      file.value = "";
      if (added.length) { this.d.toast(added.length === 1 ? t("1 Datei in der Galerie.") : t("{n} Dateien in der Galerie.", { n: added.length })); this.d.changed(); this.render(); }
    });
    const load = el("button", "btn small-btn primary-btn", t("+ Dateien laden"));
    load.addEventListener("click", () => file.click());
    main.append(el("div", "gal-bar"), file);
    main.firstElementChild!.append(load, el("span", "muted small", t("Bilder, Logos und Videos. Auch einfach hineinziehen.")));

    const section = (title: string, items: { id: string; clip: string; name: string; kind: string; rename?: (n: string) => void; remove?: () => void }[], empty: string) => {
      main.append(el("h4", "gal-cat", `${title} (${items.length})`));
      const grid = el("div", "gal-grid");
      if (!items.length) grid.append(el("p", "muted small", empty));
      for (const it of items) {
        const c = el("div", `gal-card media${it.clip === this.selected ? " sel" : ""}`);
        const img = el("img"); img.alt = ""; img.dataset.thumb = it.clip;
        const th = this.thumbs.get(it.clip);
        if (th) img.src = th; else if (it.kind !== "Kamera" && !this.queue.includes(it.clip)) this.queue.push(it.clip);
        if (it.kind === "Kamera") { img.remove(); c.append(el("div", "gal-cam", t("LIVE-KAMERA"))); } else c.append(img);
        const name = el("input", "gal-name"); name.value = it.name; name.setAttribute("aria-label", t("{kind} umbenennen", { kind: t(it.kind) }));
        name.disabled = !it.rename;
        name.addEventListener("change", () => { const v = name.value.trim(); if (v && it.rename) { it.rename(v); this.d.changed(); } });
        const row = el("div", "inline");
        const add = el("button", "icon", "+"); add.title = t("In die Ziel-Ebene legen");
        add.addEventListener("click", () => {
          const i = this.target(), l = this.d.ctx.show.layers[i]; if (!l) return;
          addClip(l, it.clip); this.d.changed(); this.d.toast(t("„{name}“ in Ebene {n}.", { name: it.name, n: i + 1 }));
        });
        row.append(el("small", "", t(it.kind)), add);
        if (it.remove) {
          const del = el("button", `icon danger${this.armed === it.clip ? " wide" : ""}`, this.armed === it.clip ? t("Löschen?") : "×");
          del.title = t("Aus der Galerie löschen (auch aus allen Ebenen, Szenen und Cues)");
          del.addEventListener("click", () => {
            if (this.armed !== it.clip) { this.armed = it.clip; this.render(); return; }
            it.remove!(); this.armed = ""; this.d.changed(); this.render();
          });
          row.append(del);
        }
        c.append(name, row);
        c.addEventListener("click", e => {
          if ((e.target as HTMLElement).closest("input,button")) return;
          this.selected = it.clip; this.root.querySelectorAll(".gal-card").forEach(x => x.classList.toggle("sel", x === c));
          info.replaceChildren(el("b", "", it.name), el("span", "am-cap", t(it.kind)));
        });
        grid.append(c);
      }
      main.append(grid);
    };
    const forget = (clip: string) => { forgetClip(this.d.ctx.show, this.d.ctx.scenes, clip); for (const c of this.d.ctx.cues.list) if (c.media === clip) c.media = null; };
    section(t("Grafiken und Logos"), this.d.images.items.map(m => ({
      id: m.id, clip: mediaClip(m.id), name: m.name, kind: "Grafik",
      rename: (n: string) => { m.name = n; }, remove: () => { forget(mediaClip(m.id)); this.d.images.remove(m.id); },
    })), t("Noch keine Grafiken."));
    section("Videos", this.d.videos.items.map(v => ({
      id: v.id, clip: videoClip(v.id), name: v.name, kind: "Video",
      rename: (n: string) => { v.name = n; }, remove: () => { forget(videoClip(v.id)); this.d.videos.remove(v.id); },
    })), t("Noch keine Videos."));
    section(t("Kameras"), this.d.ctx.show.cameras.map(k => ({
      id: k.id, clip: camClip(k.id), name: k.label || t("Kamera"), kind: "Kamera",
      rename: (n: string) => { k.label = n; },
      remove: () => { forget(camClip(k.id)); this.d.ctx.show.cameras.splice(this.d.ctx.show.cameras.indexOf(k), 1); },
    })), t("Noch keine Kamera. VISUALS → „+ Clips“ → Kameras suchen, oder SHOW → „+ Kamera“."));
    info.replaceChildren(el("p", "muted small", t("Namen anklicken zum Umbenennen. „+“ legt in die Ziel-Ebene, „×“ löscht (fragt einmal nach).")));
  }
}
