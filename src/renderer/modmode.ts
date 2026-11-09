// Modulations-Modus: Regler anklicken und an einen LFO im Takt oder ein Audio-Band hängen.
// Modulierte Regler tragen immer einen türkisen Rand (auch außerhalb des Modus).
import { CONTROL_BY_ID } from "../core/controls";
import type { ControlContext } from "../core/control";
import {
  MAX_MODS, MOD_BEATS, MOD_LFO, MOD_SOURCES, MOD_SOURCE_LABEL, modSignal, modulatable, newModulation, type Modulation, type ModSource,
} from "../core/modulation";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e;
}
const label = (id: string) => CONTROL_BY_ID.get(id)?.label ?? id;
const beatsLabel = (b: number) => `${b === 0.25 ? "¼" : b === 0.5 ? "½" : b} ${b === 1 ? "Beat" : "Beats"}`;

export class ModMode {
  private panel = el("div", "map-panel mod-panel");
  private on = false;
  private target: string | null = null;
  private meter: HTMLElement | null = null;
  private timer = 0;

  constructor(private ctx: ControlContext, private beat: () => number, private bands: () => readonly number[],
    private toast: (m: string) => void) {
    this.panel.hidden = true;
    document.body.append(this.panel);
    // Im Modus wählt ein Klick den Regler, statt ihn zu bewegen
    const block = (e: Event) => {
      if (!this.on) return;
      const t = e.target as HTMLElement;
      if (t.closest(".mod-panel, .map-menu, #map-btn")) return;
      const ctl = t.closest<HTMLElement>("[data-ctl]");
      if (ctl || t.closest("main, .deck, .top")) { e.preventDefault(); e.stopPropagation(); }
      if (ctl && e.type === "pointerdown") this.pick(ctl.dataset.ctl!);
    };
    for (const ev of ["pointerdown", "mousedown", "click", "dblclick", "input", "change"]) document.addEventListener(ev, block, true);
    window.addEventListener("keydown", e => { if (this.on && e.key === "Escape") { e.preventDefault(); this.close(); } });
    // Markierung der modulierten Regler auch außerhalb des Modus
    window.setInterval(() => this.mark(), 500);
  }

  get active(): boolean { return this.on; }
  private get mods(): Modulation[] { return (this.ctx.mods ??= []); }

  open(): void {
    this.on = true; this.target = null;
    document.body.classList.add("modding");
    this.panel.hidden = false;
    this.render(); this.mark();
    clearInterval(this.timer);
    this.timer = window.setInterval(() => this.tick(), 50);
  }

  close(): void {
    this.on = false; this.target = null;
    document.body.classList.remove("modding");
    this.panel.hidden = true;
    clearInterval(this.timer);
    this.mark();
  }

  private pick(id: string): void {
    if (!modulatable(id)) { this.toast(`„${label(id)}“ lässt sich nicht modulieren (nur Regler, kein Tempo, keine Auswahl).`); return; }
    this.target = id;
    if (!this.mods.some(m => m.target === id)) {
      if (this.mods.length >= MAX_MODS) { this.toast(`Höchstens ${MAX_MODS} Modulationen.`); return; }
      this.mods.push(newModulation(id));
    }
    this.render(); this.mark();
  }

  /** Signalanzeige des gewählten Reglers. */
  private tick(): void {
    const m = this.mods.find(x => x.target === this.target);
    if (m && this.meter) this.meter.style.setProperty("--v", String(m.on ? modSignal(m, this.beat(), this.bands()) : 0));
  }

  private mark(): void {
    const modded = new Set(this.mods.filter(m => m.on && m.depth > 0).map(m => m.target));
    document.querySelectorAll<HTMLElement>("[data-ctl]").forEach(e => {
      const id = e.dataset.ctl!;
      e.toggleAttribute("data-mod", modded.has(id));
      e.toggleAttribute("data-mod-sel", this.on && id === this.target);
      e.toggleAttribute("data-modable", this.on && modulatable(id));
    });
  }

  private render(): void {
    const box = this.panel;
    box.replaceChildren();
    const head = el("div", "map-head");
    head.append(el("span", "grip", "∿"), el("b", "", "Modulation"));
    const done = el("button", "btn small-btn", "Fertig"); done.title = "Beenden (Esc)";
    done.addEventListener("click", () => this.close());
    head.append(done);
    box.append(head);
    const m = this.mods.find(x => x.target === this.target);
    if (!m) {
      box.append(el("p", "map-hint", "Einen Regler anklicken (türkis umrandet). Er schwingt dann um seine eingestellte Position, im Takt (LFO) oder mit dem Audio."));
    } else {
      const ed = el("div", "mod-edit");
      ed.append(el("b", "mod-target", label(m.target)));
      // Quelle
      const src = el("div", "mod-src");
      for (const s of MOD_SOURCES) {
        const b = el("button", m.source === s ? "on" : "", MOD_SOURCE_LABEL[s]);
        if (s === "bass") src.append(el("span", "mod-gap"));
        b.addEventListener("click", () => { m.source = s as ModSource; this.render(); });
        src.append(b);
      }
      ed.append(src);
      if (MOD_LFO.has(m.source)) {
        const r = el("label", "mrow"); r.append(el("span", "", "Tempo"));
        const sel = el("select");
        for (const b of MOD_BEATS) sel.append(new Option(beatsLabel(b), String(b)));
        sel.value = String(m.beats);
        sel.addEventListener("change", () => { m.beats = Number(sel.value); });
        r.append(sel, el("span")); ed.append(r);
      } else {
        ed.append(el("p", "map-hint", "Folgt dem Audio-Eingang (Einstellungen → Audio) oder LJ-Link. Ohne Audio bleibt der Regler auf seinem Grundwert minus der halben Stärke."));
      }
      const r = el("label", "mrow"); r.append(el("span", "", "Stärke"));
      const depth = el("input"); depth.type = "range"; depth.min = "0"; depth.max = "100"; depth.value = String(Math.round(m.depth * 100));
      const val = el("span", "mval", `${Math.round(m.depth * 100)} %`);
      depth.addEventListener("input", () => { m.depth = Number(depth.value) / 100; val.textContent = `${depth.value} %`; });
      r.append(depth, val); ed.append(r);
      this.meter = el("div", "mod-meter"); this.meter.title = "Signal jetzt";
      ed.append(this.meter);
      const acts = el("div", "inline wrap");
      const tog = el("button", `btn small-btn${m.on ? " on" : ""}`, m.on ? "An" : "Aus");
      tog.addEventListener("click", () => { m.on = !m.on; this.render(); this.mark(); });
      const del = el("button", "btn small-btn", "Entfernen");
      del.addEventListener("click", () => { this.mods.splice(this.mods.indexOf(m), 1); this.target = null; this.render(); this.mark(); });
      acts.append(tog, del); ed.append(acts);
      box.append(ed);
    }
    // Liste aller Modulationen
    if (this.mods.length) {
      const list = el("div", "map-list");
      for (const x of this.mods) {
        const row = el("button", `mod-row${x.target === this.target ? " sel" : ""}${x.on ? "" : " off"}`);
        row.append(el("span", "", label(x.target)), el("small", "", `${MOD_SOURCE_LABEL[x.source]}${MOD_LFO.has(x.source) ? ` · ${beatsLabel(x.beats)}` : ""} · ${Math.round(x.depth * 100)} %`));
        row.addEventListener("click", () => { this.target = x.target; this.render(); this.mark(); });
        list.append(row);
      }
      box.append(el("div", "map-sub", "Alle Modulationen"), list);
    }
  }
}
