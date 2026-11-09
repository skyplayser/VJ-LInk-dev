// Timeline-Editor (SHOW): ein Cue als Zeitleiste. Szenen-Spur mit Blöcken, Lineal, Abspielposition, Cursor.
// Szenen setzen: Palette anklicken (an der Abspielposition bzw. am Cursor) oder „Aufnehmen“ und Szenen live
// auslösen (Tasten, Pads, MIDI, Pult) – jede Szene landet an der Stelle im Video, an der sie kam.
import type { ControlContext } from "../core/control";
import { showGo, showStop } from "../core/control";
import { FX_KINDS, FX_LABEL, cueSeek, cueSetNext, cueTime, timelineSpan, type Cue, type CueEnv, type FxBlock, type FxKind, type SceneMark } from "../core/video";
import { t } from "../core/i18n";

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
  /** Mehrere Bilder (Projektionsmapping)? Sonst gibt es kein „nur andere Bilder“. */
  multiImage(): boolean;
}

export class TimelineView {
  private cue: Cue | null = null;
  private sig = "";
  private sel = -1;
  /** Gewählter Effekt-Block (Strobe, Blinder …). */
  private selFx = -1;
  private fxLane: HTMLElement | null = null;
  private fxDrop: HTMLElement | null = null;
  private cursorT = 0;
  private recording = false;
  private play: HTMLElement | null = null;
  private cursor: HTMLElement | null = null;
  private lane: HTMLElement | null = null;
  private span: [number, number] = [0, 0];
  private timeEl: HTMLElement | null = null;
  private playBtn: HTMLButtonElement | null = null;
  /** Während gezogen wird, nicht neu aufbauen (die Elemente unter dem Zeiger bleiben). */
  private dragging = false;
  private drop: HTMLElement | null = null;

  constructor(private root: HTMLElement, private d: TimelineDeps) {
    root.tabIndex = 0;
    root.addEventListener("keydown", e => {
      if ((e.key === "Delete" || e.key === "Backspace") && this.cue && this.selFx >= 0 && !(e.target as HTMLElement).closest("input,select")) {
        e.preventDefault(); this.cue.fx?.splice(this.selFx, 1); this.selFx = -1; this.d.changed(); return;
      }
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
    if (near) near.scene = scene; else marks.push({ t: Math.round(t * 100) / 100, scene, others: this.d.multiImage() });
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
    const sig = `${JSON.stringify(c.marks ?? [])}|${JSON.stringify(c.fx ?? [])}|${this.selFx}|${span.join(",")}|${this.sel}|${this.recording}|${live}|${this.d.multiImage()}|${this.d.ctx.scenes.map(s => s.name).join(",")}|${c.name}`;
    if (!this.dragging && (force || sig !== this.sig)) { this.sig = sig; this.span = span; this.build(c); }
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
    head.append(el("b", "", `${t("Timeline")} · ${c.name}`));
    this.timeEl = el("span", "tlv-time");
    const playBtn = el("button", `btn small-btn${live ? " on" : ""}`, live ? t("■ Stopp") : t("▶ Abspielen"));
    this.playBtn = playBtn;
    playBtn.addEventListener("click", () => {
      if (this.liveT(c) !== null) showStop(d.ctx);
      else { cueSetNext(d.ctx.cues, d.indexOf(c)); showGo(d.ctx); }
      d.changed();
    });
    const rec = el("button", `btn small-btn tlv-rec${this.recording ? " on" : ""}`, this.recording ? t("● Aufnahme läuft") : t("● Aufnehmen"));
    rec.title = t("Während das Video läuft: jede Szene, die du auslöst (Szenen-Tasten, Pads, Tastatur, MIDI, Pult), wird an dieser Stelle eingetragen");
    rec.addEventListener("click", () => {
      this.recording = !this.recording;
      d.ctx.onSceneRecall = this.recording ? (i: number) => {
        const t = this.cue ? this.liveT(this.cue) : null;
        if (t === null || !this.cue) return;
        this.sel = this.place(this.cue, t, i + 1);
        d.changed();
      } : undefined;
      if (this.recording && this.liveT(c) === null) d.toast(t("Aufnahme bereit: Video abspielen und Szenen auslösen."));
      d.changed();
    });
    const undo = el("button", "btn small-btn", t("Alle Marker löschen"));
    undo.addEventListener("click", () => {
      if (undo.dataset.armed !== "1") { undo.dataset.armed = "1"; undo.textContent = t("Wirklich alle löschen?"); return; }
      c.marks = []; this.sel = -1; d.changed();
    });
    head.append(this.timeEl);
    if (c.kind !== "video") {
      const dur = el("input", "tc-in"); dur.value = String(c.hold || 0); dur.setAttribute("aria-label", t("Länge der Timeline in Sekunden"));
      dur.addEventListener("change", () => { const v = Number(dur.value.replace(",", ".")); if (Number.isFinite(v) && v >= 1) c.hold = Math.min(36000, v); d.changed(); });
      const lab = el("label", "tlv-len", t("Länge")); lab.append(dur, el("small", "muted", "s"));
      head.append(lab);
    }
    head.append(el("span", "grow"), playBtn, rec, undo);
    r.append(head);
    if (b <= a) { r.append(el("p", "muted small", c.kind === "video" ? t("Länge wird noch gemessen …") : t("Für eine Timeline braucht der Cue eine Dauer (Details → Dauer)."))); return; }

    // Lineal
    const ruler = el("div", "tlv-ruler");
    const len = b - a, step = len > 600 ? 60 : len > 120 ? 10 : len > 30 ? 5 : 1;
    for (let s = 0; s <= len + 1e-6; s += step) {
      const tk = el("span", "tlv-tick", fmt1(s).replace(/\.0$/, ""));
      tk.style.left = `${(s / len) * 100}%`; ruler.append(tk);
    }
    // Spuren
    const tracks = el("div", "tlv-tracks");
    const vid = el("div", "tlv-video", c.kind === "video" ? `▶ ${c.name}` : c.kind === "image" ? t("Bild") : c.kind === "camera" ? t("Kamera") : t("Schwarz"));
    const lane = el("div", "tlv-lane"); this.lane = lane;
    const pctOf = (t: number) => ((t - a) / len) * 100;
    const multi = d.multiImage();
    marks.forEach((m, k) => {
      const end = this.endOf(marks, k, b);
      const blk = el("div", `tlv-block${k === this.sel ? " sel" : ""}${m.len === undefined ? " open" : ""}`);
      const sc = d.ctx.scenes[m.scene - 1];
      blk.style.left = `${pctOf(Math.max(a, m.t))}%`;
      blk.style.width = `${Math.max(0.4, pctOf(Math.min(b, end)) - pctOf(Math.max(a, m.t)))}%`;
      blk.style.setProperty("--c", sceneColor(m.scene));
      blk.append(el("b", "", `${m.scene} · ${sc?.name ?? "?"}`), el("small", "", `${fmt1(end - m.t)}${m.len === undefined ? t(" · bis zur nächsten") : ""}${multi ? (m.others ? t(" · andere Bilder") : t(" · alle Bilder")) : ""}${m.level !== undefined && m.level < 1 ? ` · ${Math.round(m.level * 100)} %` : ""}${multi && m.others && !Object.keys(sc?.stacks ?? {}).length ? t(" · ⚠ Szene kennt keine anderen Bilder") : ""}`));
      blk.title = t("{t} · Szene {n}. Mitte ziehen verschiebt, Ränder ziehen ändert die Länge (⌥ ohne Einrasten), Entf löscht.", { t: fmt1(m.t - a), n: m.scene });
      const hl = el("span", "tlv-h l"), hr = el("span", "tlv-h r");
      hl.title = t("Anfang ziehen"); hr.title = t("Ende ziehen (Länge)");
      hl.addEventListener("pointerdown", e => this.dragMark(e, c, m, k, "l", blk));
      hr.addEventListener("pointerdown", e => this.dragMark(e, c, m, k, "r", blk));
      blk.addEventListener("pointerdown", e => { this.selFx = -1; this.dragMark(e, c, m, k, "move", blk); });
      blk.append(hl, hr);
      lane.append(blk);
    });
    this.drop = el("i", "tlv-drop"); this.drop.hidden = true; lane.append(this.drop);
    // Klick ins Lineal/Spuren: spulen (läuft) bzw. Cursor setzen (steht)
    const seekAt = (e: MouseEvent) => {
      const rr = tracks.getBoundingClientRect();
      const t = a + Math.max(0, Math.min(1, (e.clientX - rr.left) / rr.width)) * len;
      if (this.liveT(c) !== null) cueSeek(d.ctx.cues, c.id, t, Date.now(), d.env.duration(c.media));
      else this.cursorT = t;
      this.tick(c);
    };
    // Effekt-Spur: Strobe, Flash, White, W-Flash, Blinder, Blackout
    const fxLane = el("div", "tlv-lane tlv-fxlane"); this.fxLane = fxLane;
    const fxs = (c.fx ??= []);
    fxs.forEach((fb, k) => {
      const blk = el("div", `tlv-block tlv-fx k-${fb.kind}${k === this.selFx ? " sel" : ""}`);
      blk.style.left = `${pctOf(Math.max(a, fb.t))}%`;
      blk.style.width = `${Math.max(0.4, pctOf(Math.min(b, fb.t + fb.len)) - pctOf(Math.max(a, fb.t)))}%`;
      blk.append(el("b", "", FX_LABEL[fb.kind]), el("small", "", fmt1(fb.len)));
      blk.title = t("{fx} ab {t}, {len} lang. Mitte ziehen verschiebt, Ränder ändern die Länge, Entf löscht.", { fx: FX_LABEL[fb.kind], t: fmt1(fb.t - a), len: fmt1(fb.len) });
      const hl = el("span", "tlv-h l"), hr = el("span", "tlv-h r");
      hl.addEventListener("pointerdown", e => this.dragFx(e, c, fb, "l", blk));
      hr.addEventListener("pointerdown", e => this.dragFx(e, c, fb, "r", blk));
      blk.addEventListener("pointerdown", e => this.dragFx(e, c, fb, "move", blk));
      blk.append(hl, hr);
      fxLane.append(blk);
    });
    this.fxDrop = el("i", "tlv-drop"); this.fxDrop.hidden = true; fxLane.append(this.fxDrop);
    fxLane.addEventListener("click", e => { if (e.target === fxLane) { this.selFx = -1; seekAt(e); d.changed(); } });
    this.play = el("i", "tlv-play"); this.cursor = el("i", "tlv-cursor");
    tracks.append(vid, lane, fxLane, this.play, this.cursor);
    ruler.addEventListener("click", seekAt);
    vid.addEventListener("click", seekAt);
    lane.addEventListener("click", e => { if (e.target === lane) { this.sel = -1; this.selFx = -1; seekAt(e); d.changed(); } });
    r.append(ruler, tracks);
    // Ein Bild/Video „statt Visuals“ deckt alles ab: Szenenwechsel der Timeline wären dann unsichtbar
    if (marks.length && c.over === "replace" && !d.multiImage()) {
      const warn = el("div", "tlv-warn");
      warn.append(el("span", "", t("Der Cue liegt deckend über den Visuals („Visuals aus“) – die Szenenwechsel passieren unsichtbar dahinter.")));
      const fix = el("button", "btn small-btn", t("Cue darüber legen"));
      fix.title = t("Das Bild bzw. Video liegt dann über den Visuals; dunkle oder durchsichtige Stellen zeigen die Szenen");
      fix.addEventListener("click", () => { c.over = "over"; d.changed(); });
      warn.append(fix);
      r.append(warn);
    }

    // Szenen-Palette
    const pal = el("div", "tlv-pal");
    pal.append(el("span", "muted small", live ? t("Szenen ziehen oder antippen (jetzt):") : t("Szenen auf die Spur ziehen oder antippen (Cursor):")));
    d.ctx.scenes.forEach((sc, i) => {
      const bt = el("button", "tlv-scene", `${i + 1} · ${sc.name}`);
      bt.style.setProperty("--c", sceneColor(i + 1));
      bt.title = t("Auf die Szenen-Spur ziehen (4 s, Länge danach an den Rändern ziehen) oder antippen (an Abspielposition bzw. Cursor)");
      bt.addEventListener("pointerdown", e => this.dragScene(e, c, i + 1, bt));
      pal.append(bt);
    });
    r.append(pal);
    const fpal = el("div", "tlv-pal");
    fpal.append(el("span", "muted small", t("Effekte auf die Effekt-Spur ziehen oder antippen:")));
    for (const k of FX_KINDS) {
      const bt = el("button", `tlv-scene tlv-fxchip k-${k}`, FX_LABEL[k]);
      bt.title = k === "blinder" ? t("Blinder: ganzes Bild statisch weiß") : k === "blackout" ? t("Blackout: alles schwarz") : t("{fx} wie in der Fader-Leiste", { fx: FX_LABEL[k] });
      bt.addEventListener("pointerdown", e => this.dragFxChip(e, c, k, bt));
      fpal.append(bt);
    }
    r.append(fpal);
    // Gewählter Effekt-Block
    const fb = fxs[this.selFx];
    if (fb) {
      const row = el("div", "tlv-edit");
      const tIn = el("input", "tc-in"); tIn.value = (fb.t - a).toFixed(2); tIn.setAttribute("aria-label", t("Start in Sekunden"));
      tIn.addEventListener("change", () => { const v = Number(tIn.value.replace(",", ".")); if (Number.isFinite(v)) fb.t = Math.max(a, Math.min(b - 0.05, a + v)); d.changed(); });
      const lIn = el("input", "tc-in"); lIn.value = fb.len.toFixed(2); lIn.setAttribute("aria-label", t("Länge in Sekunden"));
      lIn.addEventListener("change", () => { const v = Number(lIn.value.replace(",", ".")); if (Number.isFinite(v) && v > 0) fb.len = Math.min(v, b - fb.t); d.changed(); });
      const kind = el("select"); for (const k of FX_KINDS) kind.append(new Option(FX_LABEL[k], k));
      kind.value = fb.kind; kind.addEventListener("change", () => { fb.kind = kind.value as FxKind; d.changed(); });
      const del = el("button", "btn small-btn", t("Löschen (Entf)"));
      del.addEventListener("click", () => { fxs.splice(fxs.indexOf(fb), 1); this.selFx = -1; d.changed(); });
      row.append(el("span", "muted small", t("Effekt:")), kind, tIn, el("small", "muted", t("s ab")), lIn, el("small", "muted", t("s lang")), del);
      r.append(row);
    }

    // Gewählter Marker
    const m = marks[this.sel];
    if (m) {
      const row = el("div", "tlv-edit");
      const tIn = el("input", "tc-in"); tIn.value = (m.t - a).toFixed(2); tIn.setAttribute("aria-label", t("Zeit in Sekunden"));
      tIn.addEventListener("change", () => { const v = Number(tIn.value.replace(",", ".")); if (Number.isFinite(v)) { m.t = Math.max(a, Math.min(b, a + v)); marks.sort((x, y) => x.t - y.t); this.sel = marks.indexOf(m); } d.changed(); });
      const sc = el("select"); d.ctx.scenes.forEach((s, i) => sc.append(new Option(`${i + 1} · ${s.name}`, String(i + 1))));
      sc.value = String(m.scene); sc.addEventListener("change", () => { m.scene = Number(sc.value); d.changed(); });
      const oth = el("button", `btn small-btn${m.others ? " on" : ""}`, m.others ? t("nur andere Bilder") : t("alle Bilder"));
      oth.title = t("„nur andere Bilder“: das Bild, auf dem der SHOW-Ablauf läuft, bleibt unberührt");
      oth.addEventListener("click", () => { m.others = !m.others; d.changed(); });
      const del = el("button", "btn small-btn", t("Löschen (Entf)"));
      del.addEventListener("click", () => { marks.splice(marks.indexOf(m), 1); this.sel = -1; d.changed(); });
      const lenIn = el("input", "tc-in"); lenIn.placeholder = t("bis nächste");
      lenIn.value = m.len !== undefined ? m.len.toFixed(2) : ""; lenIn.setAttribute("aria-label", t("Länge in Sekunden (leer = bis zur nächsten Szene)"));
      lenIn.addEventListener("change", () => { const v = Number(lenIn.value.replace(",", ".")); if (lenIn.value.trim() === "") delete m.len; else if (Number.isFinite(v) && v > 0) m.len = Math.min(v, b - m.t); d.changed(); });
      const open = el("button", "btn small-btn", t("bis zur nächsten"));
      open.title = t("Keine eigene Länge: die Szene gilt bis zum nächsten Block");
      open.addEventListener("click", () => { delete m.len; d.changed(); });
      const lv = el("input"); lv.type = "range"; lv.min = "0"; lv.max = "100"; lv.value = String(Math.round((m.level ?? 1) * 100));
      lv.setAttribute("aria-label", t("Helligkeit der Szene")); lv.className = "tlv-level";
      const lvv = el("small", "muted", `${lv.value} %`);
      lv.addEventListener("input", () => { lvv.textContent = `${lv.value} %`; });
      lv.addEventListener("change", () => { const v = Number(lv.value) / 100; if (v >= 0.995) delete m.level; else m.level = v; d.changed(); });
      row.append(el("span", "muted small", t("Block:")), tIn, el("small", "muted", t("s ab")), lenIn, el("small", "muted", t("s lang")), open, sc);
      if (d.multiImage()) row.append(oth);
      row.append(el("span", "muted small", t("Helligkeit")), lv, lvv, del);
      r.append(row);
    } else if (!marks.length) {
      r.append(el("p", "muted small", t("Szenen aus der Palette auf die Spur ziehen und die Länge an den Rändern ziehen – wie im Schnittprogramm. Oder Video abspielen und Szenen antippen bzw. „Aufnehmen“. In Lücken gilt die Szene, die beim Start lief.")));
    }
    this.tick(c);
  }

  /** Ende eines Blocks: eigene Länge, sonst bis zum nächsten Block bzw. Ende der Timeline. */
  private endOf(marks: readonly SceneMark[], k: number, b: number): number {
    const m = marks[k]!;
    return m.len !== undefined ? Math.min(b, m.t + m.len) : (marks[k + 1]?.t ?? b);
  }

  /** Einrasten an Blockkanten, Anfang/Ende und Cursor (tol in Sekunden). */
  private snapT(t: number, c: Cue, skip: SceneMark | FxBlock | null, tol: number): number {
    const [a, b] = this.span, marks = c.marks ?? [];
    const pts = [a, b, this.cursorT];
    marks.forEach((m, k) => { if (m !== skip) pts.push(m.t, this.endOf(marks, k, b)); });
    for (const f of c.fx ?? []) if (f !== (skip as unknown)) pts.push(f.t, f.t + f.len);
    let best = t, dist = tol;
    for (const p of pts) if (Math.abs(p - t) < dist) { dist = Math.abs(p - t); best = p; }
    return best;
  }

  /** Block ziehen: Mitte verschiebt, linker Rand = Anfang, rechter Rand = Ende (Länge). */
  private dragMark(e: PointerEvent, c: Cue, m: SceneMark, k: number, mode: "move" | "l" | "r", blk: HTMLElement): void {
    e.preventDefault(); e.stopPropagation();
    this.sel = k; this.dragging = true;
    blk.classList.add("sel");
    const marks = (c.marks ??= []);
    const lane = this.lane!, [a, b] = this.span, rr = lane.getBoundingClientRect();
    const secPerPx = (b - a) / rr.width, tol = 8 * secPerPx;
    const sx = e.clientX, t0 = m.t, end0 = this.endOf(marks, k, b), len0 = end0 - t0;
    const pct = (x: number) => `${((x - a) / (b - a)) * 100}%`;
    const move = (ev: PointerEvent) => {
      const dt = (ev.clientX - sx) * secPerPx;
      const snap = (x: number) => (ev.altKey ? x : this.snapT(x, c, m, tol));
      if (mode === "move") {
        let t = Math.max(a, Math.min(b - 0.05, t0 + dt));
        const st = snap(t), en = snap(t + len0);
        t = Math.abs(st - t) <= Math.abs(en - (t + len0)) ? st : en - len0;
        m.t = Math.round(Math.max(a, t) * 100) / 100;
        if (m.len !== undefined) m.len = Math.min(m.len, b - m.t);
      } else if (mode === "r") {
        const en = Math.max(t0 + 0.1, Math.min(b, snap(end0 + dt)));
        m.len = Math.round((en - t0) * 100) / 100;
      } else {
        const t = Math.max(a, Math.min(end0 - 0.1, snap(t0 + dt)));
        m.t = Math.round(t * 100) / 100; m.len = Math.round((end0 - m.t) * 100) / 100;
      }
      const en = m.len !== undefined ? m.t + m.len : end0 + (m.t - t0);
      blk.style.left = pct(m.t); blk.style.width = pct(a + Math.max(0.05, Math.min(b, en) - m.t));
    };
    const up = () => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
      marks.sort((x, y) => x.t - y.t);
      this.sel = marks.indexOf(m);
      this.dragging = false;
      this.d.changed();
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  }

  /** Szene aus der Palette ziehen und auf der Spur ablegen; ohne Ziehen = antippen. */
  private dragScene(e: PointerEvent, c: Cue, scene: number, bt: HTMLElement): void {
    e.preventDefault();
    const d = this.d, lane = this.lane, [a, b] = this.span;
    const sx = e.clientX, sy = e.clientY;
    let ghost: HTMLElement | null = null;
    this.dragging = true;
    const tAt = (x: number, alt: boolean) => {
      if (!lane) return null;
      const rr = lane.getBoundingClientRect();
      const t = a + ((x - rr.left) / rr.width) * (b - a);
      return alt ? t : this.snapT(t, c, null, (8 / rr.width) * (b - a));
    };
    const over = (ev: PointerEvent) => {
      if (!lane) return false;
      const rr = lane.getBoundingClientRect();
      return ev.clientX >= rr.left && ev.clientX <= rr.right && ev.clientY >= rr.top - 20 && ev.clientY <= rr.bottom + 20;
    };
    const move = (ev: PointerEvent) => {
      if (!ghost && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 4) {
        ghost = el("div", "tlv-ghost", bt.textContent ?? "");
        ghost.style.setProperty("--c", sceneColor(scene));
        document.body.append(ghost);
      }
      if (!ghost) return;
      ghost.style.left = `${ev.clientX + 10}px`; ghost.style.top = `${ev.clientY + 10}px`;
      const inLane = over(ev);
      if (this.drop && lane) {
        this.drop.hidden = !inLane;
        const t = tAt(ev.clientX, ev.altKey);
        if (inLane && t !== null) this.drop.style.left = `${((Math.max(a, Math.min(b, t)) - a) / (b - a)) * 100}%`;
      }
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
      this.dragging = false;
      if (this.drop) this.drop.hidden = true;
      if (ghost) {
        ghost.remove();
        const t = tAt(ev.clientX, ev.altKey);
        if (over(ev) && t !== null && b > a) {
          const marks = (c.marks ??= []);
          const at = Math.max(a, Math.min(b - 0.1, t));
          const next = marks.filter(m => m.t > at + 0.01).sort((x, y) => x.t - y.t)[0]?.t ?? b;
          this.sel = this.place(c, at, scene);
          const m = marks[this.sel];
          if (m) m.len = Math.round(Math.max(0.2, Math.min(4, next - at, b - at)) * 100) / 100;
        }
        d.changed();
        return;
      }
      // Antippen: an Abspielposition (läuft, sofort zeigen) bzw. am Cursor
      const t = this.liveT(c);
      this.sel = this.place(c, t ?? this.cursorT, scene);
      if (t !== null) d.env.recallScene(scene - 1, c.marks?.[this.sel]?.others ?? true);
      d.changed();
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  }

  /** Effekt-Block ziehen: Mitte verschiebt, Ränder ändern Anfang bzw. Länge. */
  private dragFx(e: PointerEvent, c: Cue, fb: FxBlock, mode: "move" | "l" | "r", blk: HTMLElement): void {
    e.preventDefault(); e.stopPropagation();
    const fxs = (c.fx ??= []);
    this.selFx = fxs.indexOf(fb); this.sel = -1; this.dragging = true;
    blk.classList.add("sel");
    const [a, b] = this.span, rr = this.fxLane!.getBoundingClientRect();
    const secPerPx = (b - a) / rr.width, tol = 8 * secPerPx;
    const sx = e.clientX, t0 = fb.t, end0 = fb.t + fb.len;
    const pct = (x: number) => `${((x - a) / (b - a)) * 100}%`;
    const move = (ev: PointerEvent) => {
      const dt = (ev.clientX - sx) * secPerPx;
      const snap = (x: number) => (ev.altKey ? x : this.snapT(x, c, fb, tol));
      if (mode === "move") {
        let t = Math.max(a, Math.min(b - fb.len, t0 + dt));
        const st = snap(t), en = snap(t + fb.len);
        t = Math.abs(st - t) <= Math.abs(en - (t + fb.len)) ? st : en - fb.len;
        fb.t = Math.round(Math.max(a, t) * 100) / 100;
      } else if (mode === "r") {
        fb.len = Math.round((Math.max(t0 + 0.05, Math.min(b, snap(end0 + dt))) - t0) * 100) / 100;
      } else {
        const t = Math.max(a, Math.min(end0 - 0.05, snap(t0 + dt)));
        fb.t = Math.round(t * 100) / 100; fb.len = Math.round((end0 - fb.t) * 100) / 100;
      }
      blk.style.left = pct(fb.t); blk.style.width = pct(a + fb.len);
    };
    const up = () => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
      fxs.sort((x, y) => x.t - y.t);
      this.selFx = fxs.indexOf(fb);
      this.dragging = false;
      this.d.changed();
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  }

  /** Effekt aus der Palette auf die Effekt-Spur ziehen; ohne Ziehen = antippen (Abspielposition bzw. Cursor). */
  private dragFxChip(e: PointerEvent, c: Cue, kind: FxKind, bt: HTMLElement): void {
    e.preventDefault();
    const lane = this.fxLane, [a, b] = this.span, sx = e.clientX, sy = e.clientY;
    const defLen = kind === "flash" || kind === "wflash" ? 0.5 : 2;
    let ghost: HTMLElement | null = null;
    this.dragging = true;
    const tAt = (x: number, alt: boolean) => {
      if (!lane) return null;
      const rr = lane.getBoundingClientRect();
      const t = a + ((x - rr.left) / rr.width) * (b - a);
      return alt ? t : this.snapT(t, c, null, (8 / rr.width) * (b - a));
    };
    const over = (ev: PointerEvent) => {
      if (!lane) return false;
      const rr = lane.getBoundingClientRect();
      return ev.clientX >= rr.left && ev.clientX <= rr.right && ev.clientY >= rr.top - 20 && ev.clientY <= rr.bottom + 20;
    };
    const add = (t: number) => {
      const fxs = (c.fx ??= []);
      const at = Math.max(a, Math.min(b - 0.05, t));
      const fb: FxBlock = { t: Math.round(at * 100) / 100, len: Math.round(Math.min(defLen, b - at) * 100) / 100, kind };
      fxs.push(fb); fxs.sort((x, y) => x.t - y.t);
      this.selFx = fxs.indexOf(fb); this.sel = -1;
    };
    const move = (ev: PointerEvent) => {
      if (!ghost && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 4) {
        ghost = el("div", `tlv-ghost k-${kind}`, bt.textContent ?? ""); document.body.append(ghost);
      }
      if (!ghost) return;
      ghost.style.left = `${ev.clientX + 10}px`; ghost.style.top = `${ev.clientY + 10}px`;
      const inLane = over(ev), t = tAt(ev.clientX, ev.altKey);
      if (this.fxDrop) { this.fxDrop.hidden = !inLane; if (inLane && t !== null) this.fxDrop.style.left = `${((Math.max(a, Math.min(b, t)) - a) / (b - a)) * 100}%`; }
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
      this.dragging = false;
      if (this.fxDrop) this.fxDrop.hidden = true;
      if (ghost) { ghost.remove(); const t = tAt(ev.clientX, ev.altKey); if (over(ev) && t !== null && b > a) add(t); this.d.changed(); return; }
      if (b > a) add(this.liveT(c) ?? this.cursorT);
      this.d.changed();
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  }
}
