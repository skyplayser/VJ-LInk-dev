// Mapping-Modus wie bei Daslight: Art wählen, alle zuweisbaren Elemente leuchten lila,
// Element anklicken, dann Taste, MIDI-Regler, DMX-Kanal oder OSC-Adresse bewegen.
import type { ControlContext } from "../core/control";
import { resolveControl } from "../core/controls";
import {
  DmxLearner, PROTOCOL_LABEL, describeInput, parseMappings, type MapExtra, type MapInput, type MapProtocol, type MappingTable,
} from "../core/mapping";
import { TEMPLATES, buildTemplate, exportMappings, templateFor } from "../core/templates";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e;
}

export interface MapInfo {
  midiDevices: () => string[]; midiError: () => string; dmx: () => string; osc: () => string;
  toast: (msg: string) => void;
}

export class MapMode {
  protocol: MapProtocol | null = null;
  target: string | null = null;
  private panel = el("aside", "map-panel");
  private learner = new DmxLearner();
  private lastAssigned = "";
  private confirmClear = false;
  private confirmTemplate = false;
  private tplId = "";
  private tplDevice = "";
  private timer = 0;

  constructor(private ctx: ControlContext, private table: MappingTable, private info: MapInfo, private onChanged: () => void) {
    this.panel.setAttribute("aria-label", "Zuweisungen");
    this.panel.hidden = true;
    document.body.append(this.panel);
    this.restorePlace();
    window.addEventListener("resize", () => this.keepInside());
    // Größe merken, wenn an der Ecke gezogen wurde
    new ResizeObserver(() => { if (!this.panel.hidden && !this.panel.classList.contains("collapsed")) this.savePlace(); }).observe(this.panel);
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
    this.keepInside();
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
  input(input: MapInput | { p: "dmx-frame"; universe: number; data: Uint8Array }, extra: MapExtra & { value?: number } = {}): boolean {
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
    // CC mit Wert 0 oder 127 beim Lernen ist fast immer eine Taste
    const button = inp.p === "midi" && inp.type === "cc" && (extra.value === 0 || extra.value === 1);
    this.table.add(this.target, inp, undefined, { device: extra.device, button });
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
    head.title = "Zum Verschieben ziehen";
    head.append(el("span", "grip", "⋮⋮"), el("b", "", "Zuweisungen"));
    this.dragBy(head);
    const tabs = el("div", "map-tabs");
    for (const q of ["key", "midi", "dmx", "osc"] as MapProtocol[]) {
      const b = el("button", q === p ? "on" : "", PROTOCOL_LABEL[q]);
      b.addEventListener("click", () => this.open(q));
      tabs.append(b);
    }
    const fold = el("button", "icon", this.panel.classList.contains("collapsed") ? "▢" : "–");
    fold.title = this.panel.classList.contains("collapsed") ? "Aufklappen" : "Einklappen (nur Kopfzeile)";
    fold.addEventListener("click", () => { this.panel.classList.toggle("collapsed"); this.render(); this.keepInside(); });
    const done = el("button", "btn small-btn", "Fertig");
    done.title = "Mapping beenden (Esc)";
    done.addEventListener("click", () => this.close());
    const right = el("span", "inline"); right.append(fold, done);
    head.append(right);
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

    if (p === "midi") box.append(this.templateBox());

    const foot = el("div", "map-foot");
    const exp = el("button", "btn small-btn", "Exportieren");
    exp.title = "Alle Zuweisungen (Tastatur, MIDI, DMX, OSC) als Datei speichern";
    exp.addEventListener("click", () => {
      const url = URL.createObjectURL(new Blob([exportMappings(this.table.list)], { type: "application/json" }));
      const a = el("a"); a.href = url; a.download = "vj-link-zuweisungen.json"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    const imp = el("button", "btn small-btn", "Importieren");
    imp.title = "Zuweisungen aus Datei laden (ersetzt die Arten, die in der Datei vorkommen)";
    const file = el("input"); file.type = "file"; file.accept = "application/json,.json"; file.hidden = true;
    imp.addEventListener("click", () => file.click());
    file.addEventListener("change", async () => {
      const f = file.files?.[0]; if (!f) return;
      try {
        const data = JSON.parse(await f.text()) as { kind?: unknown; mappings?: unknown };
        const list = data.kind === "mappings" ? parseMappings(data.mappings) : null;
        if (!list) { this.info.toast("Diese Datei enthält keine VJ-Link-Zuweisungen."); return; }
        const kinds = new Set(list.map(m => m.input.p));
        this.table.replace([...this.table.list.filter(m => !kinds.has(m.input.p)), ...list]);
        this.onChanged(); this.render(); this.mark();
        this.info.toast(`${list.length} Zuweisungen geladen.`);
      } catch { this.info.toast("Datei lässt sich nicht lesen."); }
    });
    foot.append(exp, imp, file);
    const clr = el("button", "btn small-btn danger", this.confirmClear ? "Wirklich alle löschen?" : `Alle ${PROTOCOL_LABEL[p]}-Zuweisungen löschen`);
    clr.disabled = !list.length;
    clr.addEventListener("click", () => {
      if (!this.confirmClear) { this.confirmClear = true; this.render(); return; }
      this.table.clear(p); this.confirmClear = false; this.onChanged(); this.render(); this.mark();
    });
    foot.append(clr);
    box.append(foot);
  }

  // ---- Fenster verschieben und Lage merken ---------------------------------------
  private dragBy(handle: HTMLElement): void {
    handle.addEventListener("pointerdown", e => {
      if ((e.target as HTMLElement).closest("button")) return;
      e.preventDefault();
      const r = this.panel.getBoundingClientRect();
      const dx = e.clientX - r.left, dy = e.clientY - r.top;
      handle.setPointerCapture(e.pointerId);
      const move = (ev: PointerEvent) => {
        this.panel.style.left = `${ev.clientX - dx}px`;
        this.panel.style.top = `${ev.clientY - dy}px`;
        this.keepInside();
      };
      const up = () => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", up);
        this.savePlace();
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", up);
    });
  }

  /** Fenster bleibt immer mit der Kopfzeile im sichtbaren Bereich. */
  private keepInside(): void {
    const r = this.panel.getBoundingClientRect();
    const x = Math.min(Math.max(0, r.left), window.innerWidth - Math.min(r.width, 120));
    const y = Math.min(Math.max(0, r.top), window.innerHeight - 40);
    this.panel.style.left = `${x}px`; this.panel.style.top = `${y}px`;
  }

  private savePlace(): void {
    const r = this.panel.getBoundingClientRect();
    try { localStorage.setItem("vjlink.mapPanel", JSON.stringify({ x: r.left, y: r.top, w: r.width, h: r.height })); } catch { /* ohne Speicher */ }
  }

  private restorePlace(): void {
    try {
      const p = JSON.parse(localStorage.getItem("vjlink.mapPanel") ?? "null") as { x: number; y: number; w: number; h: number } | null;
      if (!p) return;
      Object.assign(this.panel.style, { left: `${p.x}px`, top: `${p.y}px`, width: `${p.w}px`, height: `${p.h}px` });
    } catch { /* Standardlage */ }
  }

  /** Vorlage für einen Controller laden (ersetzt die MIDI-Zuweisungen). */
  private templateBox(): HTMLElement {
    const box = el("div", "tpl-box");
    box.append(el("b", "", "Controller-Vorlage"));
    const devs = this.info.midiDevices();
    if (!this.tplDevice || !devs.includes(this.tplDevice)) this.tplDevice = devs[0] ?? "";
    const auto = this.tplDevice ? templateFor(this.tplDevice) : undefined;
    if (!this.tplId || !TEMPLATES.some(t => t.id === this.tplId)) this.tplId = auto?.id ?? TEMPLATES[0]!.id;
    const tplSel = el("select"); tplSel.setAttribute("aria-label", "Vorlage");
    for (const t of TEMPLATES) tplSel.append(new Option(t.name + (auto?.id === t.id ? " (erkannt)" : ""), t.id));
    tplSel.value = this.tplId;
    tplSel.addEventListener("change", () => { this.tplId = tplSel.value; this.confirmTemplate = false; this.render(); });
    const devSel = el("select"); devSel.setAttribute("aria-label", "Gerät für die Vorlage");
    if (!devs.length) devSel.append(new Option("Kein Gerät angeschlossen", ""));
    for (const d of devs) devSel.append(new Option(d, d));
    devSel.value = this.tplDevice;
    devSel.addEventListener("change", () => { this.tplDevice = devSel.value; this.tplId = templateFor(devSel.value)?.id ?? this.tplId; this.render(); });
    const t = TEMPLATES.find(x => x.id === this.tplId)!;
    const hasMidi = this.table.ofProtocol("midi").length > 0;
    const load = el("button", "btn small-btn", this.confirmTemplate ? "Ersetzt alle MIDI-Zuweisungen. Laden?" : "Vorlage laden");
    load.disabled = !this.tplDevice;
    load.addEventListener("click", () => {
      if (hasMidi && !this.confirmTemplate) { this.confirmTemplate = true; this.render(); return; }
      const keep = this.table.list.filter(m => m.input.p !== "midi");
      this.table.replace(keep);
      for (const e of buildTemplate(t, this.tplDevice)) this.table.add(e.target, e.input, undefined, e);
      this.confirmTemplate = false;
      this.onChanged(); this.render(); this.mark();
      this.info.toast(`Vorlage „${t.name}“ geladen.`);
    });
    const row = el("div", "inline wrap"); row.append(tplSel, devSel, load);
    box.append(row, el("p", "muted small", t.info), el("p", "muted small", "Noch nicht an echten Geräten geprüft. Einzelne Tasten lassen sich danach wie gewohnt umbelegen."));
    return box;
  }
}

/** Lesbarer Name eines Ziels, z. B. „Strobe · Speed“ oder „Szenen · Drop“. */
export function label(id: string): string {
  const d = resolveControl(id);
  if (!d) return id;
  const name = id.startsWith("scene.") && /^\d+$/.test(id.slice(6)) ? `Szene ${id.slice(6)}` : d.label;
  return `${d.group} · ${name}`;
}
