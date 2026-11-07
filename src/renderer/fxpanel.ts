// Effekt-Stapel der gewählten Ebene: Reihenfolge, An/Aus, Stärke, Hinzufügen, Entfernen.
import { POST_BY_ID, POST_EFFECTS } from "../core/effects";
import { MAX_EFFECTS } from "../core/show";
import type { ControlContext } from "../core/control";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e;
}

export class FxPanel {
  layer = 0;
  private sig = "";
  private ranges: HTMLInputElement[] = [];

  constructor(private ctx: ControlContext, private title: HTMLElement, private list: HTMLElement, private add: HTMLSelectElement) {
    add.addEventListener("change", () => {
      const fx = this.effects();
      if (add.value && fx.length < MAX_EFFECTS) fx.push({ id: add.value, on: true, amount: 0.5 });
      add.value = "";
      this.update(true);
    });
  }

  private effects() { return this.ctx.show.layers[this.layer]!.effects; }

  select(layer: number): void { this.layer = layer; this.update(true); }

  /** Aufbau nur bei geänderter Struktur, sonst nur Werte nachführen. */
  update(force = false): void {
    const fx = this.effects();
    const sig = `${this.layer}|${fx.map(e => `${e.id}:${e.on}`).join(",")}`;
    if (force || sig !== this.sig) { this.sig = sig; this.build(); }
    fx.forEach((e, i) => {
      const r = this.ranges[i];
      if (r && document.activeElement !== r) r.value = String(Math.round(e.amount * 100));
    });
  }

  private build(): void {
    const fx = this.effects();
    this.title.textContent = `Effekte · Ebene ${this.layer + 1}`;
    this.list.replaceChildren();
    this.ranges = [];
    if (!fx.length) this.list.append(el("p", "muted small", "Kein Effekt. Unten einen hinzufügen."));
    fx.forEach((e, i) => {
      const def = POST_BY_ID.get(e.id);
      const row = el("div", e.on ? "fx-row" : "fx-row off");
      row.title = def?.info ?? e.id;
      const badge = el("span", "fx-num", i < 3 ? `Fx${i + 1}` : "");
      badge.title = i < 3 ? `Pult, MIDI und OSC: Effekt ${i + 1} dieser Ebene` : "";
      const toggle = el("button", e.on ? "fx-name on" : "fx-name", def?.name ?? e.id);
      toggle.setAttribute("aria-pressed", String(e.on));
      toggle.addEventListener("click", () => { e.on = !e.on; this.update(true); });
      const range = el("input"); range.type = "range"; range.min = "0"; range.max = "100";
      range.setAttribute("aria-label", `Stärke ${def?.name ?? e.id}`);
      range.addEventListener("input", () => { e.amount = Number(range.value) / 100; });
      this.ranges[i] = range;
      if (i < 3) range.dataset.ctl = `layer.${this.layer + 1}.fx.${i + 1}`;
      const up = el("button", "icon", "↑"); up.title = "Nach oben"; up.disabled = i === 0;
      up.addEventListener("click", () => { [fx[i - 1], fx[i]] = [fx[i]!, fx[i - 1]!]; this.update(true); });
      const down = el("button", "icon", "↓"); down.title = "Nach unten"; down.disabled = i === fx.length - 1;
      down.addEventListener("click", () => { [fx[i + 1], fx[i]] = [fx[i]!, fx[i + 1]!]; this.update(true); });
      const del = el("button", "icon", "×"); del.title = "Entfernen";
      del.addEventListener("click", () => { fx.splice(i, 1); this.update(true); });
      row.append(badge, toggle, range, up, down, del);
      this.list.append(row);
    });
    this.add.replaceChildren(new Option(fx.length >= MAX_EFFECTS ? `Maximal ${MAX_EFFECTS} Effekte` : "+ Effekt hinzufügen", ""));
    this.add.disabled = fx.length >= MAX_EFFECTS;
    for (const d of POST_EFFECTS) this.add.append(new Option(d.name, d.id));
  }
}
