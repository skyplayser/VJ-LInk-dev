// Fenster „Fehler melden“: Problem beschreiben, Diagnosedaten ansehen und mitschicken (E-Mail oder GitHub),
// kopieren oder als Datei speichern. Aufbau und Wege wie bei LJ-Link.
import { t } from "../core/i18n";
import { feedbackText, formatDiagnostics, issueLink, mailLink, REPORT_MAIL, reportFileName, reportText, type DiagSection } from "../core/report";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e;
}

/** Letzte Fehlermeldungen der Oberfläche (für die Diagnose), ohne Inhalte aus Dateien. */
const recent: string[] = [];
export function captureErrors(): void {
  const push = (s: string) => { recent.push(`${new Date().toISOString().slice(11, 19)} ${s.slice(0, 300)}`); if (recent.length > 30) recent.shift(); };
  const orig = console.error.bind(console), warn = console.warn.bind(console);
  console.error = (...a: unknown[]) => { push("Fehler: " + a.map(String).join(" ")); orig(...a); };
  console.warn = (...a: unknown[]) => { push("Warnung: " + a.map(String).join(" ")); warn(...a); };
  window.addEventListener("error", e => push(`Fehler: ${e.message} (${(e.filename || "").split("/").pop()}:${e.lineno})`));
  window.addEventListener("unhandledrejection", e => push(`Fehler: ${String((e as PromiseRejectionEvent).reason)}`));
}
export const recentErrors = (): string[] => [...recent];

export class ReportDialog {
  private root = el("div", "report");
  private title = el("h2");
  private intro = el("p", "am-hint");
  /** Feedback (mit Sternen) statt Fehlermeldung. */
  private feedback = false;
  private stars = 0;
  private starRow = el("div", "stars");
  private text = el("textarea");
  private withDiag = el("input");
  private preview = el("pre", "report-pre");
  private status = el("p", "report-status");
  private diag = "";

  constructor(private sections: () => DiagSection[], private version: () => string, private openWeb: (url: string) => void) {
    this.root.hidden = true;
    this.root.setAttribute("role", "dialog");
    const box = el("div", "report-box");
    const head = el("div", "report-head");
    head.append(this.title);
    const close = el("button", "btn small-btn", t("Schließen (Esc)"));
    close.addEventListener("click", () => this.close());
    head.append(close);
    this.text.rows = 6;
    this.starRow.setAttribute("role", "radiogroup");
    this.starRow.setAttribute("aria-label", t("Bewertung"));
    for (let n = 1; n <= 5; n++) {
      const s = el("button", "star", "★"); s.type = "button";
      s.setAttribute("role", "radio"); s.setAttribute("aria-label", t("{n} von 5 Sternen", { n }));
      s.addEventListener("click", () => this.setStars(n));
      this.starRow.append(s);
    }
    this.text.setAttribute("aria-label", t("Beschreibung"));
    this.withDiag.type = "checkbox"; this.withDiag.checked = true;
    this.withDiag.addEventListener("change", () => { this.preview.hidden = !this.withDiag.checked; });
    const row = el("label", "report-check"); row.append(this.withDiag, document.createTextNode(" " + t("Diagnosedaten anhängen")));
    const hint = el("p", "am-hint", t("Die Diagnosedaten enthalten Version, System, Grafikkarte, angeschlossene Geräte, Zustände der Verbindungen und die letzten Fehlermeldungen. Keine Dateinamen, keine Texte, keine Titel aus LJ-Link, keine Passwörter. Du siehst unten genau, was mitgeht."));
    const btns = el("div", "report-btns");
    const b = (label: string, fn: () => void, cls = "btn") => { const x = el("button", cls, label); x.addEventListener("click", fn); btns.append(x); };
    b(t("Per E-Mail senden"), () => void this.mail(), "btn primary");
    b(t("Auf GitHub melden"), () => void this.github());
    b(t("Kopieren"), () => void this.copy());
    b(t("Als Datei speichern"), () => { this.save(); this.status.textContent = t("Gespeichert. Häng die Datei an deine Meldung an oder schick sie uns."); });
    box.append(head, this.intro, this.starRow, this.text, row, hint, btns, this.status, this.preview);
    this.root.append(box);
    document.body.append(this.root);
    this.root.addEventListener("pointerdown", e => { if (e.target === this.root) this.close(); });
    window.addEventListener("keydown", e => { if (e.key === "Escape" && !this.root.hidden) { this.close(); e.stopPropagation(); } }, true);
  }

  /** Fehlermeldung (Standard) oder Feedback mit Sternen 1–5 (`stars` vorbelegt). */
  open(mode: "bug" | "feedback" = "bug", stars = 0): void {
    const fb = mode === "feedback";
    if (fb !== this.feedback) this.withDiag.checked = !fb; // Feedback: Diagnosedaten nur, wenn man sie anhakt
    this.feedback = fb;
    this.title.textContent = fb ? t("Feedback geben") : t("Fehler melden");
    this.root.setAttribute("aria-label", this.title.textContent);
    this.intro.textContent = fb
      ? t("Wie gefällt dir VJ-Link? Sag uns, was gut ist, was fehlt oder was nicht stimmt. Die Nachricht geht an {mail} oder als Issue an GitHub.", { mail: REPORT_MAIL })
      : t("Beschreib kurz das Problem. Die Meldung geht an {mail} oder als Issue an GitHub.", { mail: REPORT_MAIL });
    this.text.placeholder = fb ? t("Was gefällt dir? Was wünschst du dir? Was stimmt nicht?") : t("Was ist passiert? Was hast du davor gemacht? Was hättest du erwartet?");
    this.starRow.hidden = !fb;
    this.setStars(fb ? stars : 0);
    this.diag = formatDiagnostics(this.sections());
    this.preview.textContent = this.diag;
    this.preview.hidden = !this.withDiag.checked;
    this.status.textContent = "";
    this.root.hidden = false;
    this.text.focus();
  }
  close(): void { this.root.hidden = true; }
  get isOpen(): boolean { return !this.root.hidden; }

  private setStars(n: number): void {
    this.stars = n;
    Array.from(this.starRow.children).forEach((s, i) => { s.classList.toggle("on", i < n); s.setAttribute("aria-checked", String(i + 1 === n)); });
  }
  /** Text der Nachricht: bei Feedback mit der Bewertung in der ersten Zeile. */
  private message(): string { return this.feedback ? feedbackText(this.stars, this.text.value) : this.text.value; }
  private body(): string { return reportText(this.message(), this.withDiag.checked ? this.diag : null, t("(keine Beschreibung)")); }
  private described(): boolean {
    if (this.message().trim()) return true;
    this.status.textContent = this.feedback ? t("Bitte wähl Sterne oder schreib ein paar Worte.") : t("Bitte beschreib zuerst das Problem.");
    this.text.focus(); return false;
  }

  private async mail(): Promise<void> {
    if (!this.described()) return;
    const r = mailLink(this.message(), this.withDiag.checked ? this.diag : null, t("Die Diagnosedaten hängen als Datei an (VJ-Link-Bericht-….txt aus dem Download-Ordner)."));
    let note = "";
    if (r.attach) {
      this.save();
      try { await navigator.clipboard.writeText(this.diag); } catch { /* die Datei reicht */ }
      note = t("Die Diagnosedaten wurden als Datei gespeichert: Häng sie an die Mail an (sie liegen auch in der Zwischenablage).") + " ";
    }
    this.openWeb(r.url);
    this.status.textContent = note + t("Dein Mailprogramm öffnet sich mit der Meldung an {mail}. Falls nichts passiert, schick sie bitte von Hand an diese Adresse.", { mail: REPORT_MAIL });
  }

  private async github(): Promise<void> {
    if (!this.described()) return;
    const r = issueLink(this.message(), this.withDiag.checked ? this.diag : null, this.version(), "Diagnosedaten hier einfügen", this.feedback ? "feedback" : "bug");
    let note = "";
    if (r.clipboard) {
      try { await navigator.clipboard.writeText(this.diag); note = t("Die Diagnosedaten liegen in der Zwischenablage: Füg sie ins Issue ein (Strg/Cmd+V).") + " "; }
      catch { note = t("Häng bitte zusätzlich die Datei aus „Als Datei speichern“ an.") + " "; }
    }
    this.openWeb(r.url);
    this.status.textContent = note + t("Zum Absenden brauchst du ein GitHub-Konto. Ohne Konto: „Per E-Mail senden“.");
  }

  private async copy(): Promise<void> {
    try { await navigator.clipboard.writeText(this.body()); this.status.textContent = t("Kopiert."); }
    catch { this.status.textContent = t("Kopieren ist hier nicht erlaubt; nutze „Als Datei speichern“."); }
  }

  private save(): void {
    const blob = new Blob([this.body()], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = reportFileName();
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
}
