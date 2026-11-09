// Startbildschirm: großes Logo, die wichtigsten Wege als Knöpfe, rechts die zuletzt geöffneten Projekte.
import type { RecentProject } from "../core/frame";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e;
}

/** Einfache Linien-Symbole (24 × 24, Farbe aus dem Text). */
const ICONS: Record<string, string> = {
  new: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M12 12v6M9 15h6"/>',
  open: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1"/><path d="M3 7v11a2 2 0 0 0 2 2h13l3-9H7l-4 9"/>',
  play: '<circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l6-3.5z"/>',
  output: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  mapping: '<path d="M6 4v16M12 4v16M18 4v16"/><rect x="4" y="13" width="4" height="3" rx="1"/><rect x="10" y="7" width="4" height="3" rx="1"/><rect x="16" y="11" width="4" height="3" rx="1"/>',
  gallery: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>',
};
function icon(name: string): SVGSVGElement {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true");
  s.setAttribute("fill", "none"); s.setAttribute("stroke", "currentColor"); s.setAttribute("stroke-width", "1.8");
  s.setAttribute("stroke-linecap", "round"); s.setAttribute("stroke-linejoin", "round");
  s.innerHTML = ICONS[name] ?? "";
  return s;
}

export interface StartDeps {
  projectName: () => string;
  recent: () => Promise<RecentProject[]>;
  clearRecent: () => Promise<void>;
  /** Neu, Öffnen (Dialog) oder eine bestimmte Datei: lädt die Oberfläche neu. */
  file: (cmd: "new" | "open" | "openPath", path?: string) => Promise<void>;
  goTab: (tab: string) => void;
  openSettings: () => void;
  openMapping: () => void;
  version: string;
}

const KEY_STARTED = "vjlink.started", KEY_SHOW = "vjlink.startScreen";

export class StartScreen {
  private root = el("div", "start");

  constructor(private d: StartDeps) {
    this.root.hidden = true;
    this.root.setAttribute("role", "dialog");
    this.root.setAttribute("aria-label", "VJ-Link Start");
    document.body.append(this.root);
    window.addEventListener("keydown", e => { if (!this.root.hidden && e.key === "Escape") this.continue(); }, true);
  }

  /** Beim App-Start einmal zeigen (nicht nach Neu/Öffnen, das lädt die Oberfläche neu). */
  static shouldShow(): boolean {
    try {
      if (sessionStorage.getItem(KEY_STARTED)) return false;
      return localStorage.getItem(KEY_SHOW) !== "off";
    } catch { return true; }
  }
  private markStarted(): void { try { sessionStorage.setItem(KEY_STARTED, "1"); } catch { /* egal */ } }

  async show(): Promise<void> {
    await this.render();
    this.root.hidden = false;
    this.root.querySelector<HTMLButtonElement>(".start-btn")?.focus();
  }
  hide(): void { this.root.hidden = true; }
  private continue(): void { this.markStarted(); this.hide(); }

  private async render(): Promise<void> {
    const r = this.root;
    r.replaceChildren();
    const card = el("div", "start-card");
    // Links: Logo und Knöpfe
    const left = el("div", "start-left");
    const logo = el("div", "start-logo");
    const dots = el("span", "slots big"); for (let i = 0; i < 5; i++) dots.append(el("i"));
    logo.append(dots, el("span", "", "VJ-Link"));
    left.append(logo, el("p", "start-tag", "Visuals, die das Lichtpult steuert."));
    const grid = el("div", "start-grid");
    const btn = (ic: string, title: string, sub: string, run: () => void, primary = false) => {
      const b = el("button", `start-btn${primary ? " primary" : ""}`);
      b.append(icon(ic));
      const t = el("span", "start-btxt"); t.append(el("b", "", title), el("small", "", sub));
      b.append(t);
      b.addEventListener("click", run);
      grid.append(b);
    };
    btn("play", "Weiterarbeiten", this.d.projectName(), () => this.continue(), true);
    btn("new", "Neues Projekt", "Start-Aufbau mit sechs Ebenen", () => { this.markStarted(); void this.d.file("new"); });
    btn("open", "Projekt laden", ".vjlink-Datei öffnen", () => { this.markStarted(); void this.d.file("open"); });
    btn("gallery", "Galerie", "Visuals, Effekte, Medien", () => { this.continue(); this.d.goTab("build"); });
    btn("output", "Ausgänge einrichten", "Beamer, LED-Wand, Mapping", () => { this.continue(); this.d.goTab("output"); });
    btn("mapping", "Controller zuweisen", "MIDI, DMX, OSC, Tastatur", () => { this.continue(); this.d.openMapping(); });
    btn("settings", "Einstellungen", "Audio, Timecode, Netzwerk", () => { this.continue(); this.d.openSettings(); });
    left.append(grid);

    // Rechts: zuletzt geöffnet
    const right = el("div", "start-right");
    right.append(el("h3", "", "Zuletzt geöffnet"));
    const list = el("div", "start-recent");
    const recent = await this.d.recent().catch(() => []);
    if (!recent.length) list.append(el("p", "muted small", "Noch keine Projekte gespeichert. Mit ⌘S wird das aktuelle Projekt zur Datei."));
    for (const p of recent.slice(0, 5)) {
      const b = el("button", `start-proj${p.exists ? "" : " missing"}`);
      b.disabled = !p.exists;
      b.title = p.path;
      b.append(icon("file"));
      const t = el("span", "start-btxt");
      t.append(el("b", "", p.name), el("small", "", p.exists ? `${shortFolder(p.folder)} · ${when(p.modified)}` : "Datei nicht gefunden"));
      b.append(t);
      b.addEventListener("click", () => { this.markStarted(); void this.d.file("openPath", p.path); });
      list.append(b);
    }
    right.append(list);
    if (recent.length) {
      const clr = el("button", "linkish", "Liste leeren");
      clr.addEventListener("click", async () => { await this.d.clearRecent(); void this.render(); });
      right.append(clr);
    }

    card.append(left, right);
    const foot = el("div", "start-foot");
    const chk = el("label", "start-check");
    const box = el("input"); box.type = "checkbox";
    try { box.checked = localStorage.getItem(KEY_SHOW) !== "off"; } catch { box.checked = true; }
    box.addEventListener("change", () => { try { localStorage.setItem(KEY_SHOW, box.checked ? "on" : "off"); } catch { /* egal */ } });
    chk.append(box, document.createTextNode(" Beim Start anzeigen"));
    foot.append(chk, el("span", "muted small", `Version ${this.d.version} · Esc: weiterarbeiten`));
    r.append(card, foot);
  }
}

function shortFolder(f: string): string {
  const parts = f.split(/[\\/]/).filter(Boolean);
  return parts.length > 2 ? `…/${parts.slice(-2).join("/")}` : f;
}
function when(ms: number): string {
  if (!ms) return "";
  const d = new Date(ms), now = new Date();
  const day = 86400000, diff = now.getTime() - ms;
  const time = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return `heute ${time}`;
  if (diff < 2 * day && new Date(now.getTime() - day).toDateString() === d.toDateString()) return `gestern ${time}`;
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}
