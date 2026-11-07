// Szenenliste: abrufen, neu anlegen, Übergang und Abfolge einstellen, sortieren, löschen.
import {
  addSceneFromCurrent, deleteScene, moveScene, overwriteScene, recallScene, sceneTransition, type ControlContext,
} from "../core/control";
import type { Scene } from "../core/show";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e;
}

export class ScenePanel {
  private edit = -1;
  private sig = "";
  private confirmDelete = false;

  constructor(private ctx: ControlContext, private root: HTMLElement, private autoBtn: HTMLButtonElement, addBtn: HTMLButtonElement) {
    addBtn.addEventListener("click", () => { this.edit = addSceneFromCurrent(ctx); this.update(true); });
    autoBtn.addEventListener("click", () => { ctx.show.autoVj = !ctx.show.autoVj; });
    autoBtn.dataset.ctl = "scene.auto";
  }

  update(force = false): void {
    const c = this.ctx;
    const sig = `${this.edit}|${c.show.scene}|${this.confirmDelete}|${c.scenes.map(s => s.name).join("\u0000")}`;
    this.autoBtn.classList.toggle("on", c.show.autoVj);
    this.autoBtn.setAttribute("aria-pressed", String(c.show.autoVj));
    if (!force && sig === this.sig) return;
    this.sig = sig;
    this.build();
  }

  private build(): void {
    const c = this.ctx;
    this.root.replaceChildren();
    c.scenes.forEach((sc, i) => {
      const row = el("div", "scene-row");
      const b = el("button", c.show.scene === i + 1 ? "scene-btn on" : "scene-btn");
      b.append(el("span", "scene-key", i < 9 ? String(i + 1) : ""), el("span", "", sc.name));
      b.title = describe(c, sc);
      b.dataset.ctl = `scene.${i + 1}`;
      b.addEventListener("click", () => { recallScene(c, i); });
      const e = el("button", this.edit === i ? "icon on" : "icon", "✎");
      e.title = "Szene bearbeiten"; e.setAttribute("aria-label", `Szene ${sc.name} bearbeiten`);
      e.addEventListener("click", () => { this.edit = this.edit === i ? -1 : i; this.confirmDelete = false; this.update(true); });
      row.append(b, e);
      this.root.append(row);
      if (this.edit === i) this.root.append(this.editor(sc, i));
    });
    if (!c.scenes.length) this.root.append(el("p", "muted small", "Noch keine Szene. „+ Szene speichern“ legt das aktuelle Bild als Szene ab."));
  }

  private editor(sc: Scene, i: number): HTMLElement {
    const c = this.ctx;
    const box = el("div", "scene-edit");
    const name = el("input"); name.value = sc.name; name.maxLength = 40; name.setAttribute("aria-label", "Name der Szene");
    name.addEventListener("change", () => { sc.name = name.value.trim() || `Szene ${i + 1}`; this.update(true); });
    box.append(field("Name", name));

    // Übergang
    const mode = el("select");
    mode.append(new Option("Wie Regler „Blende“", "global"), new Option("Schnitt", "cut"), new Option("Beats", "beats"), new Option("Sekunden", "seconds"));
    const val = el("input"); val.type = "number"; val.min = "0.25"; val.max = "600"; val.step = "0.25";
    const style = el("select");
    style.append(new Option("Überblenden", "fade"), new Option("Über Schwarz", "black"));
    const sync = () => {
      const t = sc.transition;
      mode.value = !t ? "global" : t.value === 0 ? "cut" : t.unit;
      val.value = String(t && t.value > 0 ? t.value : 1);
      style.value = t?.style ?? "fade";
      val.hidden = mode.value === "global" || mode.value === "cut";
      style.hidden = mode.value === "cut";
    };
    const write = () => {
      const v = Math.max(0.25, Math.min(600, Number(val.value) || 1));
      if (mode.value === "global") delete sc.transition;
      else if (mode.value === "cut") sc.transition = { unit: "beats", value: 0, style: "fade" };
      else sc.transition = { unit: mode.value as "beats" | "seconds", value: v, style: style.value as "fade" | "black" };
      sync();
    };
    mode.addEventListener("change", write); val.addEventListener("change", write); style.addEventListener("change", write);
    sync();
    const trRow = el("div", "inline"); trRow.append(mode, val, style);
    box.append(field("Übergang", trRow));

    // Abfolge
    const after = el("select");
    after.append(new Option("Bleibt stehen", "off"), new Option("Weiter nach Takten", "bars"), new Option("Weiter nach Sekunden", "seconds"), new Option("Weiter bei Phrasenwechsel", "phrase"));
    const nval = el("input"); nval.type = "number"; nval.min = "1"; nval.max = "3600"; nval.step = "1";
    const syncN = () => {
      after.value = sc.next?.after ?? "off";
      nval.value = String(sc.next?.value ?? 16);
      nval.hidden = after.value === "off" || after.value === "phrase";
    };
    const writeN = () => {
      sc.next = { after: after.value as "off" | "bars" | "seconds" | "phrase", value: Math.max(1, Math.min(3600, Math.round(Number(nval.value) || 16))) };
      syncN();
    };
    after.addEventListener("change", writeN); nval.addEventListener("change", writeN);
    syncN();
    const nRow = el("div", "inline"); nRow.append(after, nval);
    box.append(field("Danach", nRow));
    box.append(el("p", "muted small", "„Weiter …“ wirkt nur, wenn oben „Auto“ eingeschaltet ist (auch per Pult, Kanal 7)."));

    // Auslöser
    const trig = [i < 9 ? `Taste ${i + 1}` : null, `Pult: Kanal 3 = ${i + 1}`, `OSC: /vjlink/scene/go ${i + 1}`, i < 32 ? `MIDI: scene.${i + 1} (MIDI-Lernen folgt)` : null].filter(Boolean).join(" · ");
    box.append(field("Auslösen", el("span", "muted small", trig)));

    // Aktionen
    const actions = el("div", "inline wrap");
    const over = el("button", "btn small-btn", "Mit aktuellem Bild überschreiben");
    over.addEventListener("click", () => { overwriteScene(c, i); over.textContent = "Überschrieben"; setTimeout(() => { over.textContent = "Mit aktuellem Bild überschreiben"; }, 1200); });
    const up = el("button", "icon", "↑"); up.title = "Nach oben"; up.disabled = i === 0;
    up.addEventListener("click", () => { moveScene(c, i, -1); this.edit = i - 1; this.update(true); });
    const down = el("button", "icon", "↓"); down.title = "Nach unten"; down.disabled = i === c.scenes.length - 1;
    down.addEventListener("click", () => { moveScene(c, i, 1); this.edit = i + 1; this.update(true); });
    const del = el("button", "btn small-btn danger", this.confirmDelete ? "Wirklich löschen?" : "Löschen");
    del.addEventListener("click", () => {
      if (!this.confirmDelete) { this.confirmDelete = true; this.update(true); return; }
      deleteScene(c, i); this.edit = -1; this.confirmDelete = false; this.update(true);
    });
    actions.append(over, up, down, del);
    box.append(actions);
    return box;
  }
}

function field(label: string, control: HTMLElement): HTMLElement {
  const row = el("div", "srow"); row.append(el("span", "slabel", label), control); return row;
}

function describe(c: ControlContext, sc: Scene): string {
  const t = sceneTransition(c, sc);
  const tr = t.value === 0 ? "Schnitt" : `${t.value} ${t.unit === "beats" ? "Beats" : "s"}${t.style === "black" ? " über Schwarz" : ""}`;
  const n = sc.next;
  const nx = !n || n.after === "off" ? "" : n.after === "phrase" ? " · weiter bei Phrasenwechsel" : ` · weiter nach ${n.value} ${n.after === "bars" ? "Takten" : "s"}`;
  return `Übergang: ${tr}${nx}`;
}
