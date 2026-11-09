// Sperrmodus (Show-Sperre): während der Show nur bedienen, nichts versehentlich ändern.
// Erlaubt bleibt alles, was man in der Show braucht: jedes zuweisbare Element (Fader, Clips, Szenen, Effekt-Stärken,
// Blackout, Tap, GO …), Tabs wechseln, Ebene auswählen. Gesperrt ist alles, was das Projekt verändert: löschen,
// hinzufügen, umbenennen, Einstellungen, Mapping, Ausgänge öffnen/schließen, Dateien laden.
// Sperren: ein Klick aufs Schloss. Entsperren: Schloss 1 Sekunde halten (damit es nicht aus Versehen passiert).

/** Was trotz Sperre bedienbar bleibt. */
const ALLOW = [
  "[data-ctl]", ".tabs", "#lock-btn", ".lname", ".deck", ".cue-list .crow", "#cue-go", "#cue-back", "#cue-stop",
  ".mon", "#toast",
].join(",");
/** Ausnahmen innerhalb erlaubter Bereiche. */
const DENY = [".layer-del", ".cell-x", ".cell-edit", "#text-add", ".cell.add", "#layer-add", "#cue-details", ".lib-panel", ".map-panel"].join(",");

const HOLD_MS = 1000;
const KEY = "vjlink.locked";

export class ShowLock {
  private on = false;
  private holdTimer = 0;
  private lastHint = 0;
  /** Gerade durch Halten entsperrt: der folgende Klick (beim Loslassen) darf nicht wieder sperren. */
  private justUnlocked = false;

  constructor(private btn: HTMLButtonElement, private toast: (msg: string) => void) {
    try { this.on = localStorage.getItem(KEY) === "1"; } catch { /* ohne Speicher */ }
    this.apply();
    // Sperren: Klick. Entsperren: halten.
    btn.addEventListener("pointerdown", e => {
      if (!this.on) return;
      e.preventDefault();
      btn.classList.add("holding");
      this.holdTimer = window.setTimeout(() => { btn.classList.remove("holding"); this.justUnlocked = true; this.set(false); this.toast("Entsperrt."); }, HOLD_MS);
    });
    const cancel = () => { clearTimeout(this.holdTimer); btn.classList.remove("holding"); };
    btn.addEventListener("pointerup", cancel);
    btn.addEventListener("pointerleave", cancel);
    btn.addEventListener("click", () => {
      if (this.justUnlocked) { this.justUnlocked = false; return; }
      if (this.on) { if (!btn.classList.contains("holding")) this.hint(); return; }
      this.set(true);
      this.toast("Gesperrt: nur noch bedienen. Zum Entsperren das Schloss 1 Sekunde halten.");
    });
    // Alles außerhalb der erlaubten Bereiche abfangen, bevor es wirkt
    const block = (e: Event) => {
      if (!this.on) return;
      const t = e.target as HTMLElement | null;
      if (!t || !(t instanceof Element) || this.allowed(t)) return;
      e.preventDefault(); e.stopPropagation();
      if (e.type === "pointerdown") this.hint();
    };
    for (const ev of ["pointerdown", "mousedown", "click", "dblclick", "dragstart", "contextmenu", "change", "input"]) document.addEventListener(ev, block, true);
    // Dateien hineinziehen ist auch eine Änderung
    window.addEventListener("drop", e => { if (this.on) { e.preventDefault(); e.stopImmediatePropagation(); this.hint(); } }, true);
  }

  get locked(): boolean { return this.on; }

  allowed(t: Element): boolean {
    if (t.closest(DENY)) return false;
    return !!t.closest(ALLOW);
  }

  set(on: boolean): void {
    this.on = on;
    try { localStorage.setItem(KEY, on ? "1" : "0"); } catch { /* ohne Speicher */ }
    this.apply();
  }

  /** Hinweis, wenn etwas Gesperrtes angeklickt wurde (nicht öfter als alle 3 Sekunden). */
  hint(): void {
    const now = Date.now();
    if (now - this.lastHint < 3000) return;
    this.lastHint = now;
    this.toast("Gesperrt. Zum Entsperren das Schloss oben 1 Sekunde halten.");
  }

  private apply(): void {
    document.body.classList.toggle("locked", this.on);
    this.btn.classList.toggle("on", this.on);
    this.btn.setAttribute("aria-pressed", String(this.on));
    this.btn.title = this.on ? "Gesperrt: zum Entsperren 1 Sekunde halten" : "Sperren: während der Show nur bedienen, nichts ändern";
    this.btn.querySelector("span")!.textContent = this.on ? "GESPERRT" : "";
  }
}
