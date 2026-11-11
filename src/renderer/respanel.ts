// Auflösung des Ausgabebilds (VISUALS, neben der Vorschau): Auto, feste Pixel oder festes Format, dazu wie das Bild
// auf Ausgänge mit anderem Seitenverhältnis kommt. Gehört zum Projekt (Anordnung der Ausgänge).
import {
  ASPECTS, MAX_RES, RES_PRESETS, defaultRes, parseAspect, resLabel, type OutputLayout, type OutputRes, type ResFit,
} from "../core/layout";
import { t } from "../core/i18n";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e;
}

const FIT_LABEL: Record<ResFit, string> = { contain: t("Ganz zeigen"), cover: t("Füllen"), stretch: t("Strecken") };
const FIT_HINT: Record<ResFit, string> = {
  contain: t("Das ganze Bild ist zu sehen; passt das Seitenverhältnis nicht, bleiben schwarze Ränder."),
  cover: t("Der Ausgang ist ganz gefüllt; was übersteht, wird abgeschnitten."),
  stretch: t("Das Bild wird auf den Ausgang gezogen und dabei verzerrt."),
};

export class ResPanel {
  private pop: HTMLDivElement;
  private open = false;

  constructor(private btn: HTMLButtonElement, private layout: () => OutputLayout, private changed: () => void) {
    this.pop = el("div", "res-pop");
    this.pop.hidden = true;
    this.pop.setAttribute("role", "dialog");
    this.pop.setAttribute("aria-label", t("Auflösung des Ausgabebilds"));
    btn.after(this.pop);
    btn.setAttribute("aria-haspopup", "dialog");
    btn.addEventListener("click", e => { e.stopPropagation(); this.toggle(); });
    document.addEventListener("pointerdown", e => { if (this.open && !this.pop.contains(e.target as Node) && e.target !== btn) this.toggle(false); });
    window.addEventListener("keydown", e => { if (this.open && e.key === "Escape") { e.stopPropagation(); this.toggle(false); btn.focus(); } }, true);
    this.sync();
  }

  private get res(): OutputRes {
    const l = this.layout();
    return (l.res ??= defaultRes());
  }

  private toggle(on = !this.open): void {
    this.open = on;
    this.pop.hidden = !on;
    this.btn.setAttribute("aria-expanded", String(on));
    if (on) this.build();
  }

  /** Beschriftung des Knopfs nachziehen (z. B. nach dem Laden eines Projekts). */
  sync(): void {
    const txt = `${t("Auflösung")}: ${resLabel(this.layout().res)}`;
    if (this.btn.textContent !== txt) this.btn.textContent = txt;
    this.btn.classList.toggle("on", !!this.layout().res && this.layout().res!.mode !== "auto");
  }

  private set(patch: Partial<OutputRes>): void {
    Object.assign(this.res, patch);
    this.changed();
    this.sync();
    this.build();
  }

  private build(): void {
    const r = this.res;
    const p = this.pop;
    p.replaceChildren(el("h3", "", t("Auflösung des Ausgabebilds")));

    const seg = el("div", "seg res-seg"); seg.setAttribute("role", "radiogroup");
    for (const [m, lbl] of [["auto", t("Auto")], ["pixels", t("Pixel")], ["format", t("Format")]] as const) {
      const b = el("button", r.mode === m ? "on" : "", lbl); b.type = "button";
      b.setAttribute("role", "radio"); b.setAttribute("aria-checked", String(r.mode === m));
      b.addEventListener("click", () => this.set({ mode: m }));
      seg.append(b);
    }
    p.append(seg);

    if (r.mode === "auto") {
      p.append(el("p", "am-hint", t("Jeder Ausgang rechnet in seiner vollen Auflösung. Das passt fast immer.")));
    } else if (r.mode === "pixels") {
      const row = el("div", "res-row");
      const num = (v: number, label: string) => {
        const i = el("input"); i.type = "number"; i.min = "16"; i.max = String(MAX_RES); i.step = "1"; i.value = String(v);
        i.setAttribute("aria-label", label); return i;
      };
      const w = num(r.w, t("Breite in Pixeln")), h = num(r.h, t("Höhe in Pixeln"));
      const apply = () => {
        const cl = (v: number, d: number) => Math.max(16, Math.min(MAX_RES, Math.round(Number.isFinite(v) && v > 0 ? v : d)));
        this.set({ w: cl(Number(w.value), r.w), h: cl(Number(h.value), r.h) });
      };
      w.addEventListener("change", apply); h.addEventListener("change", apply);
      const swap = el("button", "btn small-btn", "⇄"); swap.type = "button"; swap.title = t("Hoch- und Querformat tauschen");
      swap.addEventListener("click", () => this.set({ w: r.h, h: r.w }));
      row.append(w, el("span", "muted", "×"), h, el("span", "muted small", "px"), swap);
      const pre = el("select"); pre.setAttribute("aria-label", t("Vorlage"));
      pre.append(new Option(t("Vorlage …"), ""));
      for (const [pw, ph] of RES_PRESETS) pre.append(new Option(`${pw} × ${ph}${ph > pw ? t(" (hoch)") : ""}`, `${pw}x${ph}`));
      pre.addEventListener("change", () => { const [pw, ph] = pre.value.split("x").map(Number); if (pw && ph) this.set({ w: pw, h: ph }); });
      p.append(row, pre);
      p.append(el("p", "am-hint", t("Die Visuals werden genau in dieser Größe gerechnet, egal wie groß der Ausgang ist. Praktisch für LED-Wände, Aufnahme und schwache Rechner.")));
    } else {
      const chips = el("div", "res-chips");
      for (const a of ASPECTS) {
        const b = el("button", r.aspect === a ? "trans-chip on" : "trans-chip", a); b.type = "button";
        b.addEventListener("click", () => this.set({ aspect: a }));
        chips.append(b);
      }
      const own = el("input"); own.type = "text"; own.placeholder = t("eigenes, z. B. 5:2"); own.maxLength = 12;
      own.value = (ASPECTS as readonly string[]).includes(r.aspect) ? "" : r.aspect;
      own.setAttribute("aria-label", t("Eigenes Seitenverhältnis"));
      own.addEventListener("change", () => {
        const v = own.value.trim().replace(/\s+/g, "");
        if (parseAspect(v)) this.set({ aspect: v }); else { own.value = ""; own.placeholder = t("z. B. 5:2 oder 2.35:1"); }
      });
      p.append(chips, own);
      p.append(el("p", "am-hint", t("Festes Seitenverhältnis, so groß wie es in jeden Ausgang passt.")));
    }

    if (r.mode !== "auto") {
      p.append(el("span", "am-cap", t("Auf Ausgängen mit anderem Seitenverhältnis")));
      const fit = el("div", "seg res-seg"); fit.setAttribute("role", "radiogroup");
      for (const f of ["contain", "cover", "stretch"] as const) {
        const b = el("button", r.fit === f ? "on" : "", FIT_LABEL[f]); b.type = "button";
        b.setAttribute("role", "radio"); b.setAttribute("aria-checked", String(r.fit === f));
        b.addEventListener("click", () => this.set({ fit: f }));
        fit.append(b);
      }
      p.append(fit, el("p", "am-hint", FIT_HINT[r.fit]));
    }
    const mode = this.layout().mode;
    if (mode === "canvas" && r.mode !== "auto") p.append(el("p", "am-hint warn", t("Bei „Leinwand“ bestimmt die Anordnung der Bildschirme die Auflösung. Diese Einstellung gilt dort nicht.")));
    if (mode === "mapping" && r.mode !== "auto") p.append(el("p", "am-hint", t("Projektionsmapping: Das Bild wird in dieser Größe gerechnet und dann auf die Leinwände verteilt.")));
  }
}
