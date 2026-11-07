// Mapping-Modus wie bei Daslight: Art wählen, alle zuweisbaren Elemente leuchten lila,
// Element anklicken, dann Taste, MIDI-Regler, DMX-Kanal oder OSC-Adresse bewegen.
import type { ControlContext } from "../core/control";
import { resolveControl } from "../core/controls";
import {
  DmxLearner, PROTOCOL_LABEL, describeInput, type MapInput, type MapProtocol, type MappingTable,
} from "../core/mapping";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e;
}

export interface MapInfo { midiDevices: () => string[]; midiError: () => string; dmx: () => string; osc: () => string }

export class MapMode {
  protocol: MapProtocol | null = null;
  target: string | null = null;
  private panel = el("aside", "map-panel");
  private learner = new DmxLearner();
  private lastAssigned = "";
  private confirmClear = false;
  private timer = 0;

  constructor(private ctx: ControlContext, private table: MappingTable, private info: MapInfo, private onChanged: () => void) {
    this.panel.setAttribute("aria-label", "Zuweisungen");
    this.panel.hidden = true;
    document.body.append(this.panel);
    // Im Mapping-Modus wählt ein Klick das Element aus, statt es zu bedienen.
    const block = (e: Event) => {
      if (!this.protocol) return;
      const t = e.target as HTMLElement;
      if (t.closest(".map-panel, .map-menu, #map-btn")) return;
      const ctl = t.closest<HTMLElement>("[data-ctl]");
      if (ctl || t.closest("main, .deck, .top")) { e.preventDefault(); e.stopPropagation(); }
      if (ctl && e.type === "pointerdown") this.select(ctl.dataset.ctl!);
    };
    for (const ev of ["pointerdown", "mousedown", "click", "dblclick"]) document.addEventListener(ev, block, true);
  }

  get active(): boolean { return this.protocol !== null; }

  open(p: MapProtocol): void {
    this.protocol = p; this.target = null; this.lastAssigned = ""; this.confirmClear = false;
    document.body.classList.add("mapping");
    document.body.dataset.mapping = p;
    this.panel.hidden = false;
    this.render();
    clearInterval(this.timer);
    this.timer = window.setInterval(() => this.mark(), 300);
  }

  close(): void {
    this.protocol = null; this.target = null;
    document.body.classList.remove("mapping");
    delete document.body.dataset.mapping;
    this.panel.hidden = true;
    clearInterval(this.timer);
    document.querySelectorAll("[data-mapped],[data-map-sel]").forEach(e => { e.removeAttribute("data-mapped"); e.removeAttribute("data-map-sel"); });
  }

  select(target: string): void {
    this.target = target; this.lastAssigned = ""; this.learner.reset();
    this.render(); this.mark();
  }

  /**
   * Eingang im Mapping-Modus. Gibt true zurück, wenn er verbraucht wurde (dann nicht weitergeben).
   * Für DMX kommt hier das ganze Universe an; gelernt wird der Kanal, der sich bewegt.
   */
  input(input: MapInput | { p: "dmx-frame"; universe: number; data: Uint8Array }): boolean {
    if (!this.protocol) return false;
    const p = input.p === "dmx-frame" ? "dmx" : input.p;
    if (p !== this.protocol) return true; // andere Eingänge im Mapping-Modus ruhen lassen
    if (!this.target) return true;
    let inp: MapInput | null = null;
    if (input.p === "dmx-frame") {
      const hit = this.learner.feed(input.universe, input.data);
      if (hit) inp = { p: "dmx", universe: hit.universe, channel: hit.channel };
    } else inp = input;
    if (!inp) return true;
    this.table.add(this.target, inp);
    this.lastAssigned = `${label(this.target)} ← ${describeInput(inp)}`;
    this.target = null;
    this.onChanged();
    this.render(); this.mark();
    return true;
  }

  /** Zugewiesene Elemente markieren, gewähltes hervorheben. */
  private mark(): void {
    if (!this.protocol) return;
    const mapped = new Map<string, string>();
    for (const m of this.table.ofProtocol(this.protocol)) mapped.set(m.target, describeInput(m.input));
    document.querySelectorAll<HTMLElement>("[data-ctl]").forEach(e => {
      const id = e.dataset.ctl!;
      const d = mapped.get(id);
      if (d) { e.dataset.mapped = d; e.title = `${label(id)} · ${d}`; } else { e.removeAttribute("data-mapped"); e.title = label(id); }
      if (id === this.target) e.dataset.mapSel = "1"; else e.removeAttribute("data-map-sel");
    });
  }

  render(): void {
    const p = this.protocol;
    if (!p) return;
    const box = this.panel;
    box.replaceChildren();
    const head = el("div", "map-head");
    head.append(el("b", "", "Zuweisungen"));
    const tabs = el("div", "map-tabs");
    for (const q of ["key", "midi", "dmx", "osc"] as MapProtocol[]) {
      const b = el("button", q === p ? "on" : "", PROTOCOL_LABEL[q]);
      b.addEventListener("click", () => this.open(q));
      tabs.append(b);
    }
    const done = el("button", "btn small-btn", "Fertig (Esc)");
    done.addEventListener("click", () => this.close());
    head.append(done);
    box.append(head, tabs);

    const status = el("p", "map-status");
    if (p === "midi") {
      const devs = this.info.midiDevices();
      status.textContent = this.info.midiError() || (devs.length ? `Geräte: ${devs.join(", ")}` : "Kein MIDI-Gerät gefunden. Controller anstecken, er erscheint sofort.");
    } else if (p === "dmx") status.textContent = this.info.dmx();
    else if (p === "osc") status.textContent = this.info.osc();
    else status.textContent = "Tasten wirken, solange kein Eingabefeld aktiv ist.";
    box.append(status);

    const hint = el("div", this.target ? "map-hint waiting" : "map-hint");
    if (this.target) {
      const what = p === "key" ? "eine Taste drücken" : p === "midi" ? "Regler, Taste oder Pad am Controller bewegen"
        : p === "dmx" ? "den Kanal am Pult bewegen" : "die OSC-Nachricht senden";
      hint.append(el("b", "", label(this.target)), el("span", "", ` · jetzt ${what} …`));
      const cancel = el("button", "icon", "×"); cancel.title = "Abbrechen";
      cancel.addEventListener("click", () => { this.target = null; this.render(); this.mark(); });
      hint.append(cancel);
    } else {
      hint.textContent = this.lastAssigned ? `Zugewiesen: ${this.lastAssigned}` : "Ein lila markiertes Element anklicken.";
    }
    box.append(hint);

    const list = this.table.ofProtocol(p);
    const tbl = el("div", "map-list");
    const hdr = el("div", "map-row hdr"); hdr.append(el("span", "", "Ziel"), el("span", "", "Eingang"), el("span", "", ""));
    tbl.append(hdr);
    if (!list.length) tbl.append(el("p", "muted small", "Noch keine Zuweisung."));
    for (const m of [...list].sort((a, b) => label(a.target).localeCompare(label(b.target), "de"))) {
      const row = el("div", m.target === this.target ? "map-row sel" : "map-row");
      const t = el("button", "map-target", label(m.target)); t.title = m.target;
      t.addEventListener("click", () => this.select(m.target));
      const del = el("button", "icon", "×"); del.title = "Zuweisung entfernen";
      del.addEventListener("click", () => { this.table.remove(m.id); this.onChanged(); this.render(); this.mark(); });
      row.append(t, el("span", "map-in", describeInput(m.input)), del);
      tbl.append(row);
    }
    box.append(tbl);

    const foot = el("div", "map-foot");
    const clr = el("button", "btn small-btn danger", this.confirmClear ? "Wirklich alle löschen?" : `Alle ${PROTOCOL_LABEL[p]}-Zuweisungen löschen`);
    clr.disabled = !list.length;
    clr.addEventListener("click", () => {
      if (!this.confirmClear) { this.confirmClear = true; this.render(); return; }
      this.table.clear(p); this.confirmClear = false; this.onChanged(); this.render(); this.mark();
    });
    foot.append(clr);
    box.append(foot);
  }
}

/** Lesbarer Name eines Ziels, z. B. „Strobe · Speed“ oder „Szenen · Drop“. */
export function label(id: string): string {
  const d = resolveControl(id);
  if (!d) return id;
  const name = id.startsWith("scene.") && /^\d+$/.test(id.slice(6)) ? `Szene ${id.slice(6)}` : d.label;
  return `${d.group} · ${name}`;
}
