// Text-Editor: Text-Rahmen mit Formatierung gestalten (Schrift, Größe, Farbe, Kontur, Leuchten, Kasten …),
// Live-Vorschau, Übernehmen. Ergebnis: Angaben plus PNG (1920 × 1080, durchsichtig).
import { TEXT_FONTS, TEXT_H, TEXT_W, defaultText, fontCss, type TextSpec } from "../core/text";
import { t } from "../core/i18n";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e;
}

const MARGIN = 80;

/** Text auf eine Leinwand 1920 × 1080 zeichnen (durchsichtiger Hintergrund). Zu breite Zeilen werden verkleinert. */
export function drawText(c: HTMLCanvasElement, s: TextSpec): void {
  c.width = TEXT_W; c.height = TEXT_H;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, TEXT_W, TEXT_H);
  const lines = (s.upper ? s.text.toUpperCase() : s.text).split("\n");
  const font = (px: number) => `${s.italic ? "italic " : ""}${s.bold ? "800" : "400"} ${px}px ${fontCss(s.font)}`;
  const ls = (px: number) => { (g as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${px}px`; };
  // Breiteste Zeile passt in den Rahmen: sonst alles gleichmäßig verkleinern
  let size = s.size;
  g.font = font(size); ls(s.letterSpacing);
  const pad = s.box.on ? s.box.padding : 0;
  const maxW = TEXT_W - 2 * MARGIN - 2 * pad - (s.outline.on ? s.outline.width : 0);
  const widest = Math.max(1, ...lines.map(l => g.measureText(l).width));
  if (widest > maxW) { size = Math.max(10, Math.floor(size * maxW / widest)); g.font = font(size); ls(s.letterSpacing * size / s.size); }
  const lh = size * s.lineHeight;
  const blockH = lh * (lines.length - 1) + size;
  const widths = lines.map(l => g.measureText(l).width);
  const blockW = Math.max(...widths);
  const top = s.valign === "top" ? MARGIN + pad : s.valign === "bottom" ? TEXT_H - MARGIN - pad - blockH : (TEXT_H - blockH) / 2;
  const ax = s.align === "left" ? MARGIN + pad : s.align === "right" ? TEXT_W - MARGIN - pad : TEXT_W / 2;
  // Kasten hinter dem Text
  if (s.box.on) {
    const bx = s.align === "left" ? ax - pad : s.align === "right" ? ax - blockW - pad : ax - blockW / 2 - pad;
    g.save();
    g.globalAlpha = s.box.opacity; g.fillStyle = s.box.color;
    g.beginPath(); g.roundRect(bx, top - pad, blockW + 2 * pad, blockH + 2 * pad, s.box.radius); g.fill();
    g.restore();
  }
  g.textAlign = s.align; g.textBaseline = "top";
  g.lineJoin = "round";
  const y = (i: number) => top + i * lh;
  // Leuchten: Schatten ohne Versatz, zweimal für mehr Kraft
  if (s.glow.on) {
    g.save(); g.shadowColor = s.glow.color; g.shadowBlur = s.glow.blur; g.fillStyle = s.glow.color;
    for (let k = 0; k < 2; k++) lines.forEach((l, i) => g.fillText(l, ax, y(i)));
    g.restore();
  }
  if (s.outline.on) {
    g.strokeStyle = s.outline.color; g.lineWidth = s.outline.width * 2;
    lines.forEach((l, i) => g.strokeText(l, ax, y(i)));
  }
  g.fillStyle = s.color;
  lines.forEach((l, i) => g.fillText(l, ax, y(i)));
}

export class TextEditor {
  private dlg = el("div", "text-dlg");
  private spec: TextSpec = defaultText();
  private preview = el("canvas", "text-preview");
  private onDone: ((s: TextSpec, dataUrl: string) => void) | null = null;

  constructor() {
    this.dlg.hidden = true;
    this.dlg.setAttribute("role", "dialog"); this.dlg.setAttribute("aria-label", "Text bearbeiten");
    document.body.append(this.dlg);
    window.addEventListener("keydown", e => { if (!this.dlg.hidden && e.key === "Escape") { e.stopPropagation(); this.close(); } }, true);
  }

  get open(): boolean { return !this.dlg.hidden; }

  /** Editor öffnen; `done` bekommt die Angaben und das fertige Bild. */
  show(spec: TextSpec | null, title: string, done: (s: TextSpec, dataUrl: string) => void): void {
    this.spec = structuredClone(spec ?? defaultText());
    this.onDone = done;
    this.build(title);
    this.dlg.hidden = false;
    this.dlg.querySelector<HTMLTextAreaElement>("textarea")?.focus();
  }

  close(): void { this.dlg.hidden = true; this.onDone = null; }

  private redraw(): void { drawText(this.preview, this.spec); }

  private build(title: string): void {
    const s = this.spec, d = this.dlg;
    d.replaceChildren();
    const box = el("div", "text-box");
    const head = el("div", "text-head"); head.append(el("b", "", title));
    const x = el("button", "btn small-btn", t("Abbrechen (Esc)")); x.addEventListener("click", () => this.close());
    const ok = el("button", "btn small-btn on", t("Übernehmen"));
    ok.addEventListener("click", () => {
      if (!s.text.trim()) { this.dlg.querySelector("textarea")?.focus(); return; }
      this.redraw();
      const url = this.preview.toDataURL("image/png");
      const cb = this.onDone; this.close(); cb?.(s, url);
    });
    head.append(el("span", "grow"), x, ok);
    const body = el("div", "text-body");
    const left = el("div", "text-form"), right = el("div", "text-view");
    right.append(this.preview, el("p", "muted small", t("Vorschau des Rahmens (1920 × 1080). Schwarz = durchsichtig. Lage, Größe und Animation danach rechts unter „Grafik“.")));
    body.append(left, right);
    box.append(head, body);
    d.append(box);

    const change = () => this.redraw();
    const row = (label: string, ...kids: HTMLElement[]) => { const r = el("label", "tf-row"); r.append(el("span", "", label)); const w = el("span", "tf-ctl"); w.append(...kids); r.append(w); left.append(r); };
    const sub = (title: string) => left.append(el("h4", "tf-sub", title));
    const range = (min: number, max: number, step: number, get: () => number, set: (v: number) => void, unit = "") => {
      const i = el("input"); i.type = "range"; i.min = String(min); i.max = String(max); i.step = String(step); i.value = String(get());
      const v = el("small", "tf-val", `${get()}${unit}`);
      i.addEventListener("input", () => { set(Number(i.value)); v.textContent = `${i.value}${unit}`; change(); });
      const w = el("span", "tf-range"); w.append(i, v); return w;
    };
    const color = (get: () => string, set: (v: string) => void) => {
      const i = el("input"); i.type = "color"; i.value = get();
      i.addEventListener("input", () => { set(i.value); change(); }); return i;
    };
    const toggle = (label: string, get: () => boolean, set: (v: boolean) => void) => {
      // „an“-Schalter zeigen ihren Zustand (an/aus), Stil-Schalter ihren Namen
      const txt = () => (label === "an" ? (get() ? t("an") : t("aus")) : label);
      const b = el("button", `tf-tog${get() ? " on" : ""}`, txt()); b.type = "button";
      b.addEventListener("click", e => { e.preventDefault(); set(!get()); b.classList.toggle("on", get()); b.textContent = txt(); change(); }); return b;
    };
    const seg = <T extends string>(opts: [T, string][], get: () => T, set: (v: T) => void) => {
      const w = el("span", "seg2");
      for (const [k, lbl] of opts) {
        const b = el("button", get() === k ? "on" : "", lbl); b.type = "button";
        b.addEventListener("click", e => { e.preventDefault(); set(k); w.querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); change(); });
        w.append(b);
      }
      return w;
    };

    const ta = el("textarea", "tf-text"); ta.value = s.text; ta.rows = 3; ta.placeholder = t("Text (Enter = neue Zeile)");
    ta.addEventListener("input", () => { s.text = ta.value; change(); });
    left.append(ta);
    sub(t("Schrift"));
    const font = el("select");
    for (const f of TEXT_FONTS) { const o = new Option(f.label, f.id); o.style.fontFamily = f.css; font.append(o); }
    font.value = s.font; font.addEventListener("change", () => { s.font = font.value; change(); });
    row(t("Schrift"), font);
    row(t("Größe"), range(20, 600, 2, () => s.size, v => { s.size = v; }, " px"));
    row(t("Stil"), toggle(t("Fett"), () => s.bold, v => { s.bold = v; }), toggle(t("Kursiv"), () => s.italic, v => { s.italic = v; }), toggle(t("GROSS"), () => s.upper, v => { s.upper = v; }));
    row(t("Farbe"), color(() => s.color, v => { s.color = v; }), el("small", "muted", t("Weiß lässt sich über die Farbquelle der Ebene einfärben")));
    sub(t("Anordnung"));
    row(t("Waagerecht"), seg([["left", t("Links")], ["center", t("Mitte")], ["right", t("Rechts")]], () => s.align, v => { s.align = v; }));
    row(t("Senkrecht"), seg([["top", t("Oben")], ["middle", t("Mitte")], ["bottom", t("Unten")]], () => s.valign, v => { s.valign = v; }));
    row(t("Zeilenabstand"), range(0.6, 2.5, 0.05, () => s.lineHeight, v => { s.lineHeight = v; }));
    row(t("Buchstaben"), range(-10, 60, 1, () => s.letterSpacing, v => { s.letterSpacing = v; }, " px"));
    sub(t("Wirkung"));
    row(t("Leuchten"), toggle("an", () => s.glow.on, v => { s.glow.on = v; }), color(() => s.glow.color, v => { s.glow.color = v; }), range(2, 120, 1, () => s.glow.blur, v => { s.glow.blur = v; }));
    row(t("Kontur"), toggle("an", () => s.outline.on, v => { s.outline.on = v; }), color(() => s.outline.color, v => { s.outline.color = v; }), range(1, 40, 1, () => s.outline.width, v => { s.outline.width = v; }, " px"));
    row(t("Kasten"), toggle("an", () => s.box.on, v => { s.box.on = v; }), color(() => s.box.color, v => { s.box.color = v; }), range(0, 1, 0.05, () => s.box.opacity, v => { s.box.opacity = v; }));
    row(t("Kasten-Rand"), range(0, 200, 2, () => s.box.padding, v => { s.box.padding = v; }, " px"), range(0, 120, 2, () => s.box.radius, v => { s.box.radius = v; }, " r"));
    this.redraw();
  }
}
