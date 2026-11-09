// Bibliothek: Clips für eine Ebene an- und abwählen (Visuals nach Kategorie, eigene Grafiken).
import { CAM_LOOKS, CAM_LOOK_INFO, CAM_LOOK_LABEL, camClip, ensureCamera, isCamClip } from "../core/camera";
import { cameraDevices, cameraHelp } from "./camchooser";
import type { CamDevice } from "./campool";
import type { ControlContext } from "../core/control";
import { CATEGORY_LABEL, EFFECTS, type EffectCategory } from "../core/effects";
import { mediaClip } from "../core/media";
import { addClip, forgetClip, removeClip } from "../core/show";
import type { MediaLibrary } from "./medialib";
import type { VideoLibrary } from "./videolib";
import { videoClip } from "../core/video";
import { t } from "../core/i18n";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e;
}

const CAT: Record<EffectCategory, string> = CATEGORY_LABEL;

export class LibraryPanel {
  private panel = el("div", "lib-panel");
  layer = 0;
  /** Gefundene Kameras (erst nach „Kameras suchen“, damit nicht ungefragt die Kamera-Freigabe kommt). */
  private camDevices: CamDevice[] = [];
  private camSearched = false;
  private armedDelete = "";

  constructor(private ctx: ControlContext, private lib: MediaLibrary, private videos: VideoLibrary, private onChange: () => void, private onImport: (layer: number) => void, private onText: (layer: number) => void = () => {}) {
    navigator.mediaDevices?.addEventListener("devicechange", () => { if (this.camDevices.length) void cameraDevices().then(d => { this.camDevices = d; this.render(); }); });
    this.panel.setAttribute("role", "dialog");
    this.panel.setAttribute("aria-label", t("Bibliothek"));
    this.panel.hidden = true;
    document.body.append(this.panel);
    document.addEventListener("pointerdown", e => {
      if (this.panel.hidden) return;
      const tg = e.target as HTMLElement;
      if (!tg.closest(".lib-panel, .cell.add")) this.close();
    });
    window.addEventListener("keydown", e => { if (e.key === "Escape") this.close(); });
  }

  get open(): boolean { return !this.panel.hidden; }

  /** Neben der „+“-Zelle der Ebene öffnen. */
  show(layer: number, anchor: HTMLElement): void {
    this.layer = layer; this.armedDelete = "";
    this.panel.hidden = false;
    this.render();
    const r = anchor.getBoundingClientRect(), p = this.panel.getBoundingClientRect();
    const x = Math.min(window.innerWidth - p.width - 8, Math.max(8, r.right - p.width));
    const y = r.top - p.height - 8 > 8 ? r.top - p.height - 8 : Math.min(window.innerHeight - p.height - 8, r.bottom + 8);
    this.panel.style.left = `${x}px`; this.panel.style.top = `${Math.max(8, y)}px`;
  }

  close(): void { this.panel.hidden = true; }

  render(): void {
    if (this.panel.hidden) return;
    const l = this.ctx.show.layers[this.layer];
    if (!l) { this.close(); return; }
    const box = this.panel;
    box.replaceChildren();
    const head = el("div", "lib-head");
    head.append(el("b", "", t("Bibliothek · Ebene {n}", { n: this.layer + 1 })));
    const x = el("button", "icon", "×"); x.title = t("Schließen (Esc)"); x.addEventListener("click", () => this.close());
    head.append(x);
    box.append(head, el("p", "lib-hint", t("Antippen nimmt einen Clip in diese Zeile auf oder wieder heraus.")));

    const body = el("div", "lib-body");
    for (const cat of Object.keys(CAT) as EffectCategory[]) {
      const items = EFFECTS.filter(e => e.category === cat && e.kind === "generator");
      if (!items.length) continue;
      body.append(el("h4", "", CAT[cat]));
      const grid = el("div", "lib-grid");
      for (const e of items) {
        const ready = e.status === "ready";
        const on = l.clips.includes(e.id);
        const b = el("button", `lib-chip${on ? " on" : ""}${ready ? "" : " soon"}`, e.name);
        b.title = ready ? e.info : `${e.info} ${t("(kommt bald)")}`;
        b.setAttribute("aria-pressed", String(on));
        b.disabled = !ready;
        if (!ready) b.append(el("small", "", t("bald")));
        b.addEventListener("click", () => { if (on) removeClip(l, e.id); else addClip(l, e.id); this.onChange(); this.render(); });
        grid.append(b);
      }
      body.append(grid);
    }

    // Kameras und Video-Eingänge (Webcam, Capture-Karte, OBS Virtual Camera)
    body.append(el("h4", "", t("Kameras und Video-Eingänge · Silhouette, Dot-Matrix, ASCII, Masken")));
    const cg = el("div", "lib-grid");
    for (const d of this.camDevices) {
      const known = this.ctx.show.cameras.find(c => c.deviceId === d.deviceId || (d.label && c.label === d.label));
      const id = known ? camClip(known.id) : "";
      const on = !!id && l.clips.includes(id);
      const b = el("button", `lib-chip${on ? " on" : ""}`, d.label);
      b.setAttribute("aria-pressed", String(on));
      b.title = t("Live-Bild als Clip in diese Ebene (Bild oder Silhouette)");
      b.addEventListener("click", () => {
        const cam = ensureCamera(this.ctx.show.cameras, d.deviceId, d.label);
        const cid = camClip(cam.id);
        if (on) removeClip(l, cid); else addClip(l, cid);
        this.onChange(); this.render();
      });
      cg.append(b);
    }
    const find = el("button", "lib-chip add", this.camDevices.length ? t("Kameras neu suchen") : t("Kameras suchen"));
    find.title = t("Fragt einmal nach der Kamera-Freigabe und listet alle Video-Eingänge");
    find.addEventListener("click", async () => { this.camDevices = await cameraDevices(); this.camSearched = true; this.render(); });
    cg.append(find);
    if (this.camSearched && !this.camDevices.length) { const h = cameraHelp(); h.style.gridColumn = "1 / -1"; cg.append(h); }
    body.append(cg);
    // Darstellung der Kamera in dieser Ebene: Silhouette, Dot-Matrix, ASCII, Masken …
    if (l.clips.some(c => isCamClip(c))) {
      body.append(el("h4", "", t("Kamera-Darstellung in dieser Ebene")));
      const lg = el("div", "lib-grid");
      for (const lk of CAM_LOOKS) {
        const on = l.cam.look === lk;
        const b = el("button", `lib-chip${on ? " on" : ""}`, CAM_LOOK_LABEL[lk]);
        b.title = CAM_LOOK_INFO[lk];
        b.setAttribute("aria-pressed", String(on));
        b.addEventListener("click", () => {
          l.cam.look = lk;
          // Kamera gleich starten, wenn in der Ebene noch nichts läuft
          if (!isCamClip(l.clip)) l.clip = l.clips.find(c => isCamClip(c)) ?? l.clip;
          this.onChange(); this.render();
        });
        lg.append(b);
      }
      body.append(lg);
    }

    body.append(el("h4", "", t("Eigene Videos")));
    const vg = el("div", "lib-grid");
    for (const v of this.videos.items) {
      const id = videoClip(v.id);
      const on = l.clips.includes(id);
      const wrap = el("div", "lib-media");
      const b = el("button", `lib-chip${on ? " on" : ""}`, v.name);
      b.setAttribute("aria-pressed", String(on));
      b.addEventListener("click", () => { if (on) removeClip(l, id); else addClip(l, id); this.onChange(); this.render(); });
      const del = el("button", "icon danger", this.armedDelete === v.id ? t("Löschen?") : "×");
      del.title = t("Video ganz aus der Bibliothek löschen (alle Ebenen, Szenen und Cues)");
      del.classList.toggle("wide", this.armedDelete === v.id);
      del.addEventListener("click", () => {
        if (this.armedDelete !== v.id) { this.armedDelete = v.id; this.render(); return; }
        forgetClip(this.ctx.show, this.ctx.scenes, id);
        for (const c of this.ctx.cues.list) if (c.media === id) c.media = null;
        this.videos.remove(v.id);
        this.armedDelete = "";
        this.onChange(); this.render();
      });
      wrap.append(b, del);
      vg.append(wrap);
    }
    if (!this.videos.items.length) vg.append(el("p", "lib-hint", t("Noch keine Videos. Über „+ Datei laden“ unten oder einfach hineinziehen.")));
    body.append(vg);

    body.append(el("h4", "", t("Eigene Grafiken")));
    const mg = el("div", "lib-grid");
    for (const m of this.lib.items) {
      const id = mediaClip(m.id);
      const on = l.clips.includes(id);
      const wrap = el("div", "lib-media");
      const b = el("button", `lib-chip${on ? " on" : ""}`, m.name);
      b.setAttribute("aria-pressed", String(on));
      b.addEventListener("click", () => { if (on) removeClip(l, id); else addClip(l, id); this.onChange(); this.render(); });
      const del = el("button", "icon danger", this.armedDelete === m.id ? t("Löschen?") : "×");
      del.title = t("Grafik ganz aus der Bibliothek löschen (alle Ebenen und Szenen)");
      del.classList.toggle("wide", this.armedDelete === m.id);
      del.addEventListener("click", () => {
        if (this.armedDelete !== m.id) { this.armedDelete = m.id; this.render(); return; }
        forgetClip(this.ctx.show, this.ctx.scenes, id);
        this.lib.remove(m.id);
        this.armedDelete = "";
        this.onChange(); this.render();
      });
      wrap.append(b, del);
      mg.append(wrap);
    }
    const imp = el("button", "lib-chip add", t("+ Datei laden"));
    imp.title = t("Video (MP4, MOV, WebM) oder Bild (PNG, JPG, WebP, GIF, SVG) laden");
    imp.addEventListener("click", () => this.onImport(this.layer));
    const txt = el("button", "lib-chip add", "+ Text");
    txt.title = t("Text-Clip gestalten (Schrift, Farbe, Leuchten, Kasten …)");
    txt.addEventListener("click", () => this.onText(this.layer));
    mg.append(imp, txt);
    body.append(mg);
    box.append(body);
  }
}
