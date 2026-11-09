// Lage und Animation der Grafik auf der gewählten Ebene.
import type { ControlContext } from "../core/control";
import { KEY_MODES, MEDIA_ANIMS, forgetClip, isMediaClip, mediaIdOf, type KeyMode, type MediaAnim, type MediaSettings } from "../core/show";
import type { MediaLibrary } from "./medialib";
import { t } from "../core/i18n";

const ANIM_LABEL: Record<MediaAnim, string> = {
  none: t("Keine"), pulse: t("Pulsieren"), spin: t("Drehen"), bounce: t("Hüpfen"), float: t("Schweben"), wobble: t("Wackeln"), zoom: t("Heranzoomen"),
};
const BEATS = [0.5, 1, 2, 4, 8];

interface Field { key: keyof MediaSettings; label: string; min: number; max: number; scale: number; unit: string }
const FIELDS: Field[] = [
  { key: "scale", label: t("Größe"), min: 5, max: 200, scale: 100, unit: " %" },
  { key: "x", label: t("Links/Rechts"), min: -100, max: 100, scale: 100, unit: "" },
  { key: "y", label: t("Unten/Oben"), min: -100, max: 100, scale: 100, unit: "" },
  { key: "rotation", label: t("Drehung"), min: -180, max: 180, scale: 1, unit: "°" },
  { key: "animAmount", label: t("Stärke"), min: 0, max: 100, scale: 100, unit: " %" },
  { key: "keyTol", label: t("Toleranz"), min: 2, max: 90, scale: 100, unit: " %" },
];
const KEY_LABEL: Record<KeyMode, string> = { none: t("Freistellen: aus"), white: t("Weiß entfernen"), black: t("Schwarz entfernen") };

export class MediaPanel {
  private inputs = new Map<keyof MediaSettings, { input: HTMLInputElement; val: HTMLElement }>();
  private anim: HTMLSelectElement;
  private beats: HTMLSelectElement;
  private keySel: HTMLSelectElement;
  private name: HTMLElement;
  private del: HTMLButtonElement;
  private armed = false;

  constructor(private ctx: ControlContext, private lib: MediaLibrary, private root: HTMLElement,
    private layerOf: () => number, private onDeleted: () => void) {
    root.replaceChildren();
    const h = document.createElement("h2"); h.textContent = t("Grafik");
    this.name = document.createElement("div"); this.name.className = "media-name";
    root.append(h, this.name);
    for (const f of FIELDS) {
      const row = document.createElement("label"); row.className = "mrow";
      const lab = document.createElement("span"); lab.textContent = f.label;
      const input = document.createElement("input"); input.type = "range";
      input.min = String(f.min); input.max = String(f.max); input.step = "1";
      const val = document.createElement("span"); val.className = "mval";
      input.addEventListener("input", () => { const m = this.media(); if (m) (m[f.key] as number) = Number(input.value) / f.scale; });
      input.addEventListener("dblclick", () => {
        const m = this.media(); if (!m) return;
        (m[f.key] as number) = f.key === "scale" ? 0.6 : f.key === "animAmount" ? 0.4 : f.key === "keyTol" ? 0.25 : 0;
      });
      row.append(lab, input, val); root.append(row);
      this.inputs.set(f.key, { input, val });
    }
    const arow = document.createElement("div"); arow.className = "mrow2";
    this.anim = document.createElement("select"); this.anim.setAttribute("aria-label", t("Animation"));
    for (const a of MEDIA_ANIMS) this.anim.append(new Option(ANIM_LABEL[a], a));
    this.anim.addEventListener("change", () => { const m = this.media(); if (m) m.anim = this.anim.value as MediaAnim; });
    this.beats = document.createElement("select"); this.beats.setAttribute("aria-label", t("Animation: Beats pro Durchlauf"));
    for (const b of BEATS) this.beats.append(new Option(`${b === 0.5 ? "½" : b} ${b === 1 ? "Beat" : "Beats"}`, String(b)));
    this.beats.addEventListener("change", () => { const m = this.media(); if (m) m.animBeats = Number(this.beats.value); });
    arow.append(this.anim, this.beats);
    root.insertBefore(arow, root.querySelectorAll(".mrow")[4] ?? null);
    // Freistellen für Logos mit weißem oder schwarzem Hintergrund
    this.keySel = document.createElement("select"); this.keySel.setAttribute("aria-label", t("Freistellen"));
    for (const k of KEY_MODES) this.keySel.append(new Option(KEY_LABEL[k], k));
    this.keySel.addEventListener("change", () => { const m = this.media(); if (m) m.keyMode = this.keySel.value as KeyMode; });
    const krow = document.createElement("div"); krow.className = "mrow2 one"; krow.append(this.keySel);
    root.insertBefore(krow, root.querySelectorAll(".mrow")[5] ?? null);
    this.del = document.createElement("button"); this.del.className = "btn small-btn";
    this.del.addEventListener("click", () => {
      const l = this.ctx.show.layers[this.layerOf()];
      if (!l || !isMediaClip(l.clip)) return;
      if (!this.armed) { this.armed = true; this.del.textContent = t("Wirklich aus der Bibliothek löschen?"); return; }
      const id = mediaIdOf(l.clip);
      forgetClip(this.ctx.show, this.ctx.scenes, l.clip);
      this.lib.remove(id);
      this.armed = false;
      this.onDeleted();
    });
    root.append(this.del);
    const hint = document.createElement("p"); hint.className = "muted small";
    hint.textContent = t("Doppelklick auf einen Regler setzt ihn zurück. Effekte wie Farbüberlagerung, Leuchten oder Beat-Zoom findest du unten im Effekt-Stapel.");
    root.append(hint);
  }

  private media(): MediaSettings | null {
    const l = this.ctx.show.layers[this.layerOf()];
    return l && isMediaClip(l.clip) ? l.media : null;
  }

  update(): void {
    const l = this.ctx.show.layers[this.layerOf()];
    const m = this.media();
    this.root.hidden = !m;
    if (!m || !l) { this.armed = false; return; }
    const item = this.lib.items.find(i => `img:${i.id}` === l.clip);
    this.name.textContent = `${item?.name ?? t("Grafik")} · ${t("Ebene {n}", { n: this.layerOf() + 1 })}`;
    for (const f of FIELDS) {
      const { input, val } = this.inputs.get(f.key)!;
      const v = (m[f.key] as number) * f.scale;
      if (document.activeElement !== input) input.value = String(Math.round(v));
      val.textContent = `${Math.round(v)}${f.unit}`;
    }
    if (document.activeElement !== this.anim) this.anim.value = m.anim;
    if (document.activeElement !== this.beats) this.beats.value = String(m.animBeats);
    if (document.activeElement !== this.keySel) this.keySel.value = m.keyMode;
    (this.inputs.get("keyTol")!.input.closest(".mrow") as HTMLElement).hidden = m.keyMode === "none";
    if (!this.armed) this.del.textContent = t("Grafik aus der Bibliothek löschen");
  }
}
