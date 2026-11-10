// Hinweis beim Beenden: VJ-Link ist ein Community-Projekt. Bewerten (1–5 Sterne), Problem melden oder Wunsch äußern,
// und VJ-Link weitersagen. Nichts wird automatisch gesendet; Feedback geht nur über „Fehler melden“ (E-Mail oder GitHub).
import { getLang, t } from "../core/i18n";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e;
}

export const SITE_URL = "https://skyplayser.github.io/VJ-LINK/";
export const siteUrl = (lang: string): string => (lang === "de" ? `${SITE_URL}de/` : SITE_URL);

export interface FarewellDeps {
  /** Feedback-Fenster öffnen (Sterne vorbelegt). */
  feedback: (stars: number) => void;
  openWeb: (url: string) => void;
  /** Wahl an den Hauptprozess: beenden oder weiterarbeiten. */
  answer: (choice: "quit" | "stay") => void;
  /** „Nicht mehr zeigen“ gewählt. */
  disable: () => void;
}

export class FarewellDialog {
  private root: HTMLDivElement | null = null;
  /** In dieser Sitzung schon Feedback geöffnet: beim nächsten Beenden nicht noch einmal fragen. */
  private gaveFeedback = false;

  constructor(private d: FarewellDeps) {}

  get isOpen(): boolean { return !!this.root; }

  /** Beim Beenden: zeigen (wenn `enabled`), sonst direkt beenden. */
  ask(enabled: boolean): void {
    if (!enabled || this.gaveFeedback) { this.d.answer("quit"); return; }
    if (this.root) { this.root.querySelector<HTMLButtonElement>(".btn.primary")?.focus(); return; }
    const wrap = el("div", "report farewell"); wrap.setAttribute("role", "dialog"); wrap.setAttribute("aria-modal", "true");
    wrap.setAttribute("aria-label", t("Hinweis"));
    const box = el("div", "report-box");
    const status = el("p", "report-status");
    const done = (choice: "quit" | "stay") => {
      if (choice === "quit" && never.checked) this.d.disable();
      wrap.remove(); this.root = null; window.removeEventListener("keydown", key, true);
      this.d.answer(choice);
    };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); done("stay"); } };

    // Bewerten
    const stars = el("div", "stars"); stars.setAttribute("role", "group"); stars.setAttribute("aria-label", t("Bewertung"));
    const feedback = (n: number) => { this.gaveFeedback = true; done("stay"); this.d.feedback(n); };
    for (let n = 1; n <= 5; n++) {
      const s = el("button", "star", "★"); s.type = "button"; s.setAttribute("aria-label", t("{n} von 5 Sternen", { n }));
      s.addEventListener("pointerenter", () => Array.from(stars.children).forEach((x, i) => x.classList.toggle("on", i < n)));
      s.addEventListener("click", () => feedback(n));
      stars.append(s);
    }
    stars.addEventListener("pointerleave", () => Array.from(stars.children).forEach(x => x.classList.remove("on")));
    const fbRow = el("div", "report-btns");
    const fb = el("button", "btn", t("Problem melden oder Wunsch äußern"));
    fb.addEventListener("click", () => feedback(0));
    fbRow.append(fb);

    // Teilen
    const url = siteUrl(getLang());
    const shareRow = el("div", "report-btns");
    const copy = el("button", "btn", t("Link kopieren"));
    copy.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(t("VJ-Link: kostenlose Live-Visuals, gesteuert vom Lichtpult. {url}", { url })); status.textContent = t("Link kopiert. Danke fürs Weitersagen!"); }
      catch { status.textContent = url; }
    });
    const site = el("button", "btn", t("Website öffnen"));
    site.addEventListener("click", () => this.d.openWeb(url));
    shareRow.append(copy, site);

    // Beenden
    const never = el("input"); never.type = "checkbox";
    const neverRow = el("label", "report-check farewell-never"); neverRow.append(never, document.createTextNode(" " + t("Beim Beenden nicht mehr zeigen")));
    const btns = el("div", "report-btns farewell-end");
    const quit = el("button", "btn primary", t("Beenden")), stay = el("button", "btn", t("Abbrechen"));
    quit.addEventListener("click", () => done("quit")); stay.addEventListener("click", () => done("stay"));
    btns.append(quit, stay);

    box.append(
      el("h2", "", t("Hinweis")),
      el("p", "", t("VJ-Link ist ein Community-Projekt. Es lebt von eurem Feedback und davon, dass ihr es teilt.")),
      el("h3", "", t("Gefällt dir VJ-Link, oder stimmt etwas nicht?")), stars, fbRow,
      el("h3", "", t("Weitersagen")),
      el("p", "am-hint", t("Wenn dir VJ-Link gefällt, teil es gern mit deinen Freunden. Wir freuen uns über jeden Nutzer.")), shareRow,
      status, neverRow, btns,
    );
    wrap.append(box);
    wrap.addEventListener("pointerdown", e => { if (e.target === wrap) done("stay"); });
    window.addEventListener("keydown", key, true);
    document.body.append(wrap); this.root = wrap;
    quit.focus();
  }
}
