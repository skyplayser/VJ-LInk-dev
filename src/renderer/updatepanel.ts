// Update-Anzeige: Version, Prüfen, Laden und Installieren. Erscheint in den Einstellungen und im Startbildschirm.
import { t } from "../core/i18n";
import { RELEASES_PAGE, type UpdateState } from "../core/update";
import type { VjBridge } from "../core/frame";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e;
}

export class UpdateUi {
  state: UpdateState | null = null;
  private boxes = new Set<{ el: HTMLElement; compact: boolean }>();

  constructor(private bridge: VjBridge | null, private version: string) {
    bridge?.onUpdate(s => { this.state = s; this.renderAll(); });
  }

  /** Einmal beim Start (höchstens stündlich wirklich im Netz). */
  async check(force = false): Promise<void> {
    if (!this.bridge) return;
    const s = await this.bridge.updateCheck(force);
    if (s) { this.state = s; this.renderAll(); }
  }

  /** Anzeige in ein Element hängen; `compact` = eine Zeile für den Startbildschirm. */
  mount(box: HTMLElement, compact = false): void {
    for (const b of this.boxes) if (!b.el.isConnected) this.boxes.delete(b);
    const entry = { el: box, compact };
    this.boxes.add(entry);
    this.render(entry);
  }

  private renderAll(): void {
    for (const b of [...this.boxes]) { if (b.el.isConnected) this.render(b); else this.boxes.delete(b); }
  }

  private render({ el: box, compact }: { el: HTMLElement; compact: boolean }): void {
    box.replaceChildren();
    box.classList.add("upd", compact ? "upd-compact" : "upd-full");
    const s = this.state;
    const cur = s?.current ?? this.version;
    if (!compact) box.append(el("p", "upd-ver", t("upd.version", { v: cur })));
    const line = el("div", "upd-line");
    const msg = el("span", "upd-msg");
    const btn = (label: string, run: () => void, primary = false) => {
      const b = el("button", primary ? "primary" : "", label); b.addEventListener("click", run); line.append(b); return b;
    };
    if (!this.bridge) {
      msg.textContent = t("upd.onlyApp"); line.append(msg); box.append(line); return;
    }
    switch (s?.status ?? "idle") {
      case "checking": msg.textContent = t("upd.checking"); line.append(msg); break;
      case "available": {
        msg.textContent = t("upd.available", { v: s!.latest!.version }); msg.classList.add("hot");
        line.append(msg);
        if (s!.dev || !s!.latest!.url) btn(t("upd.page"), () => this.bridge!.openWeb(s!.latest!.page || RELEASES_PAGE), true);
        else btn(t("upd.install"), () => void this.bridge!.updateInstall(), true);
        break;
      }
      case "downloading": {
        msg.textContent = t("upd.downloading", { p: Math.round((s!.progress ?? 0) * 100) });
        const bar = el("span", "upd-bar"); const fill = el("i"); fill.style.width = `${Math.round((s!.progress ?? 0) * 100)}%`; bar.append(fill);
        line.append(msg, bar); break;
      }
      case "installing": msg.textContent = t("upd.installing"); line.append(msg); break;
      case "error": msg.textContent = `${t("upd.error")}: ${s!.message ?? ""}`; msg.classList.add("warn"); line.append(msg); btn(t("upd.check"), () => void this.check(true)); break;
      case "latest": msg.textContent = s!.latest ? t("upd.latest") : (s!.message ? t("upd.none") : t("upd.latest")); line.append(msg); if (!compact) btn(t("upd.check"), () => void this.check(true)); break;
      default: msg.textContent = compact ? t("upd.version", { v: cur }) : ""; line.append(msg); btn(t("upd.check"), () => void this.check(true));
    }
    box.append(line);
    if (!compact && s?.status === "available" && s.latest?.notes) box.append(el("pre", "upd-notes", s.latest.notes));
    if (!compact && s?.dev && s.status === "available") box.append(el("p", "am-hint", t("upd.dev")));
    if (!compact && s?.checkedAt) {
      const time = new Date(s.checkedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
      box.append(el("p", "am-hint", t("upd.checked", { t: time })));
    }
  }
}
