// Ebene: Antrieb (Takt, Audio, ruhig), Farben (auch mehrere Slots) und bei Laser-Visuals Lage, Größe und Stärke.
import type { ControlContext } from "../core/control";
import { DRIVE_LABEL } from "../core/controls";
import { EFFECT_BY_ID } from "../core/effects";
import {
  DRIVES, LASER_LIMITS, SLOT_NAMES, defaultLaser, toggleColorSlot,
  type ColorSource, type Drive, type LaserSettings, type LayerState,
} from "../core/show";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e;
}

const DRIVE_HINT: Record<Drive, string> = {
  auto: "Audio-Eingang, wenn er auf diese Ebene wirkt, sonst im Takt.",
  bpm: "Pulsiert nur im Takt der BPM. Audio wird ignoriert.",
  audio: "Reagiert nur auf Audio (Eingang oder LJ-Link). Ohne Audio bleibt es ruhig.",
  static: "Kein Pulsieren: gleichmäßige Bewegung, unabhängig von Takt und Audio.",
};

type NumKey = "x" | "y" | "size" | "thick";
interface LaserField { key: NumKey; label: string; scale: number; unit: string }
const LASER_FIELDS: LaserField[] = [
  { key: "y", label: "Y · Höhe", scale: 100, unit: "" },
  { key: "x", label: "X · Seite", scale: 100, unit: "" },
  { key: "size", label: "Größe", scale: 100, unit: " %" },
  { key: "thick", label: "Stärke", scale: 100, unit: " %" },
];

const rgbCss = (c: readonly number[]) => `rgb(${c.map(v => Math.round(v * 255)).join(",")})`;

export class LayerPanel {
  private sig = "";
  private ranges = new Map<NumKey, { input: HTMLInputElement; val: HTMLElement }>();

  constructor(private ctx: ControlContext, private root: HTMLElement, private layerOf: () => number) {}

  private layer(): LayerState | undefined { return this.ctx.show.layers[this.layerOf()]; }

  update(force = false): void {
    const l = this.layer();
    if (!l) { this.root.hidden = true; return; }
    this.root.hidden = false;
    const isLaser = !!l.clip && EFFECT_BY_ID.get(l.clip)?.category === "laser";
    const slots = this.ctx.show.slots.map(rgbCss).join(";");
    const sig = `${this.layerOf()}|${l.laser?.override ? 1 : 0}|${l.drive}|${l.colorSource}|${(l.colorSlots ?? []).join(",")}|${isLaser}|${slots}`;
    if (force || sig !== this.sig) { this.sig = sig; this.build(l, isLaser); }
    const z = l.laser ?? defaultLaser();
    for (const f of LASER_FIELDS) {
      const r = this.ranges.get(f.key); if (!r) continue;
      if (document.activeElement !== r.input) r.input.value = String(Math.round(z[f.key] * f.scale));
      r.val.textContent = `${Math.round(z[f.key] * f.scale)}${f.unit}`;
    }
  }

  private build(l: LayerState, isLaser: boolean): void {
    const n = this.layerOf();
    this.root.replaceChildren();
    this.ranges.clear();
    this.root.append(el("h2", "", `Ebene ${n + 1}`));

    // Antrieb
    const dr = el("div", "lp-row"); dr.append(el("span", "lp-lab", "Antrieb"));
    const seg = el("div", "seg2 lp-seg"); seg.setAttribute("role", "radiogroup"); seg.setAttribute("aria-label", `Antrieb Ebene ${n + 1}`);
    seg.dataset.ctl = `layer.${n + 1}.drive`;
    for (const d of DRIVES) {
      const b = el("button", l.drive === d ? "on" : "", DRIVE_LABEL[d]);
      b.setAttribute("role", "radio"); b.setAttribute("aria-checked", String(l.drive === d)); b.title = DRIVE_HINT[d];
      b.addEventListener("click", () => { l.drive = d; this.update(true); });
      seg.append(b);
    }
    dr.append(seg);
    this.root.append(dr, el("p", "muted small lp-hint", DRIVE_HINT[l.drive ?? "auto"]));

    // Farben: Original | A B C D E (mehrere wählbar) | Verlauf | Regenbogen
    const cr = el("div", "lp-row"); cr.append(el("span", "lp-lab", "Farben"));
    const chips = el("div", "lp-colors");
    const plain = (src: ColorSource, label: string) => {
      const b = el("button", `lp-chip${l.colorSource === src ? " on" : ""}`, label);
      b.setAttribute("aria-pressed", String(l.colorSource === src));
      b.addEventListener("click", () => { l.colorSource = src; this.update(true); });
      return b;
    };
    chips.append(plain("original", "Original"));
    const chosen = l.colorSource === "multi" ? l.colorSlots : SLOT_NAMES.includes(l.colorSource as typeof SLOT_NAMES[number]) ? [SLOT_NAMES.indexOf(l.colorSource as typeof SLOT_NAMES[number])] : [];
    SLOT_NAMES.forEach((name, i) => {
      const pos = chosen.indexOf(i);
      const b = el("button", `lp-chip lp-slot${pos >= 0 ? " on" : ""}`, name);
      b.style.setProperty("--sw", rgbCss(this.ctx.show.slots[i] ?? [1, 1, 1]));
      b.setAttribute("aria-pressed", String(pos >= 0));
      b.title = `Slot ${name}: antippen fügt ihn hinzu oder nimmt ihn heraus. Mehrere Slots = mehrere Farben.`;
      if (pos >= 0 && chosen.length > 1) b.append(el("small", "", String(pos + 1)));
      b.addEventListener("click", () => { toggleColorSlot(l, i); this.update(true); });
      chips.append(b);
    });
    chips.append(plain("gradient", "Verlauf"), plain("rainbow", "Regenbogen"));
    cr.append(chips);
    this.root.append(cr);
    if (l.colorSource === "multi") {
      this.root.append(el("p", "muted small lp-hint", isLaser
        ? `${chosen.length} Farben: jeder Strahl bzw. jede Linie bekommt eine andere, alle 8 Beats rücken sie weiter.`
        : `${chosen.length} Farben: Verlauf durch alle gewählten Slots in dieser Reihenfolge.`));
    }

    // Laser: Lage, Größe, Stärke
    if (!isLaser) return;
    this.root.append(el("h4", "lp-sub", "Laser"));
    // XY-Override: Eigenbewegung aus, Lage nur über X/Y (z. B. MA per DMX)
    const ov = !!l.laser?.override;
    const ovRow = el("div", "lp-row");
    ovRow.append(el("span", "lp-lab", "XY-Override"));
    const ovBtn = el("button", `btn small-btn${ov ? " on" : ""}`, ov ? "An: X/Y steuern die Lage" : "Aus: Effekt bewegt sich selbst");
    ovBtn.dataset.ctl = `layer.${n + 1}.laser.xy`;
    ovBtn.setAttribute("aria-pressed", String(ov));
    ovBtn.addEventListener("click", () => { l.laser = { ...(l.laser ?? defaultLaser()), override: !ov }; this.update(true); });
    ovRow.append(ovBtn);
    this.root.append(ovRow);
    if (ov) this.root.append(el("p", "muted small lp-hint", "Die Eigenbewegung ist aus: X und Y setzen die Lage direkt (-100 bis 100 = Bildrand). Per Mapping auf Kanäle der MA legen (MAPPING → DMX), auch Größe und den Schalter selbst."));
    for (const f of LASER_FIELDS) {
      const [lo, hi] = LASER_LIMITS[f.key];
      const row = el("label", "mrow"); row.append(el("span", "", f.label));
      const input = el("input"); input.type = "range";
      input.min = String(Math.round(lo * f.scale)); input.max = String(Math.round(hi * f.scale)); input.step = "1";
      input.dataset.ctl = `layer.${n + 1}.laser.${f.key}`;
      input.setAttribute("aria-label", `Laser ${f.label}`);
      input.addEventListener("input", () => { l.laser = { ...(l.laser ?? defaultLaser()), [f.key]: Number(input.value) / f.scale }; });
      input.addEventListener("dblclick", () => { l.laser = { ...(l.laser ?? defaultLaser()), [f.key]: defaultLaser()[f.key] }; });
      const val = el("span", "mval");
      row.append(input, val);
      this.root.append(row);
      this.ranges.set(f.key, { input, val });
    }
    const reset = el("button", "btn small-btn", "Laser zurücksetzen");
    reset.addEventListener("click", () => { l.laser = defaultLaser(); });
    this.root.append(reset, el("p", "muted small lp-hint",
      "Beamer auf der Bühne: Höhe nach oben schiebt die Strahlen über das Publikum. Stärke macht Linien und Punkte dicker, damit sie im Nebel mehr Licht tragen. Doppelklick setzt einen Regler zurück."));
  }
}
