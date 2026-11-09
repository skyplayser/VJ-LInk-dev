// Timeline-Editor (SHOW): ein Cue als Zeitleiste. Szenen-Spur mit Blöcken, Lineal, Abspielposition, Cursor.
// Szenen setzen: Palette anklicken (an der Abspielposition bzw. am Cursor) oder „Aufnehmen“ und Szenen live
// auslösen (Tasten, Pads, MIDI, Pult) – jede Szene landet an der Stelle im Video, an der sie kam.
import type { ControlContext } from "../core/control";
import { showGo, showStop } from "../core/control";
import { cueSeek, cueSetNext, cueTime, timelineSpan, type Cue, type CueEnv, type SceneMark } from "../core/video";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e;
}
const fmt1 = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
const sceneColor = (n: number) => `hsl(${(n * 47) % 360} 70% 55%)`;

export interface TimelineDeps {
  ctx: ControlContext;
  env: CueEnv;
  toast(msg: string): void;
  /** Index des Cues in der Liste (für „Abspielen“). */
  indexOf(c: Cue): number;
  changed(): void;
}

export class TimelineView {
  private cue: Cue | null = null;
  private sig = "";
  private sel = -1;
  private cursorT = 0;
  private recording = false;
  private play: HTMLElement | null = null;
  private cursor: HTMLElement | null = null;
  private lane: HTMLElement | null = null;
  private span: [number, number] = [0, 0];
  private timeEl: HTMLElement | null = null;
  private playBtn: HTMLButtonElement | null = null;

  constructor(private root: HTMLElement, private d: TimelineDeps) {
    root.tabIndex = 0;
    root.addEventListener("keydown", e => {
      if ((e.key === "Delete" || e.key === "Backspace") && this.cue && this.sel >= 0 && !(e.target as HTMLElement).closest("input,select")) {
        e.preventDefault(); this.cue.marks?.splice(this.sel, 1); this.sel = -1; this.d.changed();
      }
    });
  }

  /** Aktive Stelle des Cues (null = läuft nicht). */
  private liveT(c: Cue, now = Date.now()): number | null {
    const ac = this.d.ctx.cues.run.active.find(a => a.cueId === c.id && a.fadeOutMs === null);
    if (!ac || now < ac.startMs) return null;
    return cueTime(c, ac, now, this.d.env.duration(c.media)).t;
  }

  /** Marker an Stelle t setzen (liegt dort schon einer, bekommt er die neue Szene). */
  private place(c: Cue, t: number, scene: number): number {
    const marks = (c.marks ??= []);
    const near = marks.find(m => Math.abs(m.t - t) < 0.05);
    if (near) near.scene = scene; else marks.push({ t: Math.round(t * 100) / 100, scene, others: true });
    marks.sort((a, b) => a.t - b.t);
    return marks.findIndex(m => Math.abs(m.t - t) < 0.051);
  }

  update(c: Cue | null, force = false): void {
    if (!c || !c.timeline) {
      this.root.hidden = true; this.cue = null;
      if (this.recording) { this.recording = false; this.d.ctx.onSceneRecall = undefined; }
      return;
    }
    this.root.hidden = false;
    if (c !== this.cue) { this.cue = c; this.sel = -1; this.cursorT = timelineSpan(c, this.d.env.duration(c.media))[0]; }
    const span = timelineSpan(c, this.d.env.duration(c.media));
    const live = this.liveT(c) !== null;
    const sig = `${JSON.stringify(c.marks ?? [])}|${span.join(",")}|${this.sel}|${this.recording}|${live}|${this.d.ctx.scenes.map(s => s.name).join(",")}|${c.name}`;
    if (force || sig !== this.sig) { this.sig = sig; this.span = span; this.build(c); }
    this.tick(c);
  }

  /** Abspielposition und Zeitanzeige nachführen. */
  private tick(c: Cue): void {
    const [a, b] = this.span;
    if (!this.play || b <= a) return;
    const t = this.liveT(c);
    const pct = (x: number) => `${((Math.max(a, Math.min(b, x)) - a) / (b - a)) * 100}%`;
    this.play.hidden = t === null;
    if (t !== null) this.play.style.left = pct(t);
    if (this.cursor) { this.cursor.hidden = t !== null; this.cursor.style.left = pct(this.cursorT); }
    if (this.timeEl) this.timeEl.textContent = `${fmt1((t ?? this.cursorT) - a)} / ${fmt1(b - a)}`;
  }

  private build(c: Cue): void {
    const r = this.root, d = this.d, [a, b] = this.span;
    r.replaceChildren();
    const marks = (c.marks ??= []);
    const live = this.liveT(c) !== null;
    // Kopf: Name, Zeit, Abspielen/Stopp, Aufnehmen
    const head = el("div", "tlv-head");
    head.append(el("b", "", `Timeline · ${c.name}`));
    this.timeEl = el("span", "tlv-time");
    const playBtn = el("button", `btn small-btn${live ? " on" : ""}`, live ? "■ Stopp" : "▶ Abspielen");
    this.playBtn = playBtn;
    playBtn.addEventListener("click", () => {
      if (this.liveT(c) !== null) showStop(d.ctx);
      else { cueSetNext(d.ctx.cues, d.indexOf(c)); showGo(d.ctx); }
      d.changed();
    });
    const rec = el("button", `btn small-btn tlv-rec${this.recording ? " on" : ""}`, this.recording ? "● Aufnahme läuft" : "● Aufnehmen");
    rec.title = "Während das Video läuft: jede Szene, die du auslöst (Szenen-Tasten, Pads, Tastatur, MIDI, Pult), wird an dieser Stelle eingetragen";
    rec.addEventListener("click", () => {
      this.recording = !this.recording;
      d.ctx.onSceneRecall = this.recording ? (i: number) => {
        const t = this.cue ? this.liveT(this.cue) : null;
        if (t === null || !this.cue) return;
        this.sel = this.place(this.cue, t, i + 1);
        d.changed();
      } : undefined;
      if (this.recording && this.liveT(c) === null) d.toast("Aufnahme bereit: Video abspielen und Szenen auslösen.");
      d.changed();
    });
    const undo = el("button", "btn small-btn", "Alle Marker löschen");
    undo.addEventListener("click", () => {
      if (undo.dataset.armed !== "1") { undo.dataset.armed = "1"; undo.textContent = "Wirklich alle löschen?"; return; }
      c.marks = []; this.sel = -1; d.changed();
    });
    head.append(this.timeEl, el("span", "grow"), playBtn, rec, undo);
    r.append(head);
    if (b <= a) { r.append(el("p", "muted small", c.kind === "video" ? "Länge wird noch gemessen …" : "Für eine Timeline braucht der Cue eine Dauer (Details → Dauer).")); return; }

    // Lineal
    const ruler = el("div", "tlv-ruler");
    const len = b - a, step = len > 600 ? 60 : len > 120 ? 10 : len > 30 ? 5 : 1;
    for (let s = 0; s <= len + 1e-6; s += step) {
      const tk = el("span", "tlv-tick", fmt1(s).replace(/\.0$/, ""));
      tk.style.left = `${(s / len) * 100}%`; ruler.append(tk);
    }
    // Spuren
    const tracks = el("div", "tlv-tracks");
    const vid = el("div", "tlv-video", c.kind === "video" ? `▶ ${c.name}` : c.kind === "image" ? "Bild" : "Schwarz");
    const lane = el("div", "tlv-lane"); this.lane = lane;
    const pctOf = (t: number) => ((t - a) / len) * 100;
    marks.forEach((m, k) => {
      const next = marks[k + 1]?.t ?? b;
      const blk = el("div", `tlv-block${k === this.sel ? " sel" : ""}`);
      const sc = d.ctx.scenes[m.scene - 1];
      blk.style.left = `${pctOf(Math.max(a, m.t))}%`;
      blk.style.width = `${Math.max(0.4, pctOf(Math.min(b, next)) - pctOf(Math.max(a, m.t)))}%`;
      blk.style.setProperty("--c", sceneColor(m.scene));
      blk.append(el("b", "", `${m.scene} · ${sc?.name ?? "?"}`), el("small", "", m.others ? "andere Bilder" : "alle Bilder"));
      blk.title = `${fmt1(m.t - a)} · Szene ${m.scene}. Ziehen verschiebt, Entf löscht.`;
      blk.addEventListener("pointerdown", e => this.dragMark(e, c, m, k));
      lane.append(blk);
    });
    this.play = el("i", "tlv-play"); this.cursor = el("i", "tlv-cursor");
    tracks.append(vid, lane, this.play, this.cursor);
    // Klick ins Lineal/Spuren: spulen (läuft) bzw. Cursor setzen (steht)
    const seekAt = (e: MouseEvent) => {
      const rr = tracks.getBoundingClientRect();
      const t = a + Math.max(0, Math.min(1, (e.clientX - rr.left) / rr.width)) * len;
      if (this.liveT(c) !== null) cueSeek(d.ctx.cues, c.id, t, Date.now(), d.env.duration(c.media));
      else this.cursorT = t;
      this.tick(c);
    };
    ruler.addEventListener("click", seekAt);
    vid.addEventListener("click", seekAt);
    lane.addEventListener("click", e => { if (e.target === lane) { this.sel = -1; seekAt(e); d.changed(); } });
    r.append(ruler, tracks);

    // Szenen-Palette
    const pal = el("div", "tlv-pal");
    pal.append(el("span", "muted small", live ? "Szene jetzt setzen:" : "Szene am Cursor setzen:"));
    d.ctx.scenes.forEach((sc, i) => {
      const bt = el("button", "tlv-scene", `${i + 1} · ${sc.name}`);
      bt.style.setProperty("--c", sceneColor(i + 1));
      bt.addEventListener("click", () => {
        const t = this.liveT(c);
        this.sel = this.place(c, t ?? this.cursorT, i + 1);
        // läuft das Video, sofort zeigen (Marker liegt schon hinter der Abspielposition)
        if (t !== null) d.env.recallScene(i, marks[this.sel]?.others ?? true);
        d.changed();
      });
      pal.append(bt);
    });
    r.append(pal);

    // Gewählter Marker
    const m = marks[this.sel];
    if (m) {
      const row = el("div", "tlv-edit");
      const tIn = el("input", "tc-in"); tIn.value = (m.t - a).toFixed(2); tIn.setAttribute("aria-label", "Zeit in Sekunden");
      tIn.addEventListener("change", () => { const v = Number(tIn.value.replace(",", ".")); if (Number.isFinite(v)) { m.t = Math.max(a, Math.min(b, a + v)); marks.sort((x, y) => x.t - y.t); this.sel = marks.indexOf(m); } d.changed(); });
      const sc = el("select"); d.ctx.scenes.forEach((s, i) => sc.append(new Option(`${i + 1} · ${s.name}`, String(i + 1))));
      sc.value = String(m.scene); sc.addEventListener("change", () => { m.scene = Number(sc.value); d.changed(); });
      const oth = el("button", `btn small-btn${m.others ? " on" : ""}`, m.others ? "nur andere Bilder" : "alle Bilder");
      oth.title = "„nur andere Bilder“: das Bild, auf dem der SHOW-Ablauf läuft, bleibt unberührt";
      oth.addEventListener("click", () => { m.others = !m.others; d.changed(); });
      const del = el("button", "btn small-btn", "Löschen (Entf)");
      del.addEventListener("click", () => { marks.splice(marks.indexOf(m), 1); this.sel = -1; d.changed(); });
      row.append(el("span", "muted small", "Marker:"), tIn, el("small", "muted", "s"), sc, oth, del);
      r.append(row);
    } else if (!marks.length) {
      r.append(el("p", "muted small", "Szenen auf die Timeline setzen: Video abspielen und unten eine Szene anklicken, oder „Aufnehmen“ und Szenen wie gewohnt auslösen. Im Stand setzt ein Klick ins Lineal den Cursor."));
    }
    this.tick(c);
  }

  /** Marker waagerecht ziehen. */
  private dragMark(e: PointerEvent, c: Cue, m: SceneMark, k: number): void {
    e.preventDefault(); e.stopPropagation();
    this.sel = k;
    const lane = this.lane!, [a, b] = this.span, rr = lane.getBoundingClientRect();
    const sx = e.clientX, t0 = m.t;
    let moved = false;
    const move = (ev: PointerEvent) => {
      const dt = ((ev.clientX - sx) / rr.width) * (b - a);
      if (Math.abs(ev.clientX - sx) > 2) moved = true;
      m.t = Math.round(Math.max(a, Math.min(b, t0 + dt)) * 100) / 100;
      const blk = lane.children[k] as HTMLElement | undefined;
      if (blk) blk.style.left = `${((m.t - a) / (b - a)) * 100}%`;
    };
    const up = () => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
      (c.marks ??= []).sort((x, y) => x.t - y.t);
      this.sel = c.marks.indexOf(m);
      void moved;
      this.d.changed();
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  }
}
