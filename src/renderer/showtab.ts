// SHOW: der Ablauf eines Abends. Eine Liste von Cues, ein großer WEITER-Knopf, Details zum Einstellen.
import type { ControlContext } from "../core/control";
import { showBack, showGo, showStop } from "../core/control";
import {
  cueSetNext, cueStatus, cueTime, goLabel, isVideoClip, newCue, newCueId, videoIdOf,
  type Cue, type CueEnd, type CueEnv, type CueLoop, type CueOver, type CueStart, type Fit,
} from "../core/video";
import type { MediaLibrary } from "./medialib";
import { formatFrames, formatTc, parseTc, type TcFps, type TcNow } from "../core/timecode";
import type { VideoLibrary } from "./videolib";
import { TimelineView } from "./timelineview";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e;
}
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const fmt1 = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;

const START_LABEL: Record<CueStart, string> = { manual: "von Hand", after: "nach vorigem", with: "mit vorigem", timecode: "Timecode" };
const END_LABEL: Record<CueEnd, string> = { hold: "stehen bleiben", fade: "ausblenden", next: "weiter" };
const LOOP_LABEL: Record<CueLoop, string> = { off: "aus", count: "x-mal", untilGo: "bis WEITER", forever: "endlos" };
const FIT_LABEL: Record<Fit, string> = { fill: "füllen", fit: "einpassen", original: "original" };
const OVER_LABEL: Record<CueOver, string> = { replace: "Visuals aus", over: "darüber legen" };

export interface ShowDeps {
  ctx: ControlContext;
  env: CueEnv;
  videos: VideoLibrary;
  images: MediaLibrary;
  /** Dateien übernehmen; gibt die Clip-IDs (vid:/img:) zurück. */
  importFiles(files: File[]): Promise<{ id: string; name: string }[]>;
  toast(msg: string): void;
  /** Laufender Timecode (oder null) und seine Bildrate. */
  tcNow(): TcNow | null;
  tcFps(): TcFps;
  /** Mehrere Bilder (Projektionsmapping)? Nur dann gibt es „nur andere Bilder“. */
  multiImage?(): boolean;
}

export class ShowTab {
  private selected = -1;
  private sig = "";
  private detSig = "";
  private rows: HTMLElement[] = [];
  private armedDelete = false;
  /** Timeline: Abspielposition und gewählter Marker im Detail-Bereich. */
  private playhead: HTMLElement | null = null;
  private selMark = -1;
  private tl: TimelineView | null = null;

  constructor(private d: ShowDeps) {
    const $ = (id: string) => document.getElementById(id)!;
    $("cue-go").addEventListener("click", e => { (e.currentTarget as HTMLElement).blur(); showGo(d.ctx); });
    $("cue-back").addEventListener("click", () => showBack(d.ctx));
    $("cue-stop").addEventListener("click", () => showStop(d.ctx));
    const file = $("cue-file") as HTMLInputElement;
    $("cue-add-media").addEventListener("click", () => file.click());
    file.addEventListener("change", () => { if (file.files?.length) void this.addFiles(Array.from(file.files)); file.value = ""; });
    $("cue-add-black").addEventListener("click", () => this.insert(newCue("black", "Schwarz")));
    $("cue-add-scene").addEventListener("click", () => {
      const c = newCue("scene", `VJ-Szene: ${d.ctx.scenes[0]?.name ?? "1"}`);
      this.insert(c);
    });
    $("cue-add-tc").addEventListener("click", () => {
      const c = newCue("tcsignal", "Timecode starten"); c.start = this.list.length ? "with" : "manual";
      this.insert(c);
    });
    const drop = $("tab-show");
    drop.addEventListener("dragover", e => { if (e.dataTransfer?.types.includes("Files")) { e.preventDefault(); $("cue-drop").classList.add("hot"); } });
    drop.addEventListener("dragleave", () => $("cue-drop").classList.remove("hot"));
    drop.addEventListener("drop", e => {
      if (!e.dataTransfer?.files.length) return;
      e.preventDefault(); e.stopPropagation();
      $("cue-drop").classList.remove("hot");
      void this.addFiles(Array.from(e.dataTransfer.files));
    });
  }

  private get list(): Cue[] { return this.d.ctx.cues.list; }

  /** Nach dem gewählten Cue einfügen (oder am Ende). */
  private insert(c: Cue): void {
    const at = this.selected >= 0 ? this.selected + 1 : this.list.length;
    this.list.splice(at, 0, c);
    if (this.d.ctx.cues.run.next > at || this.d.ctx.cues.run.next >= this.list.length - 1) { /* Zeiger bleibt gültig */ }
    this.selected = at;
    this.update(true);
  }

  private async addFiles(files: File[]): Promise<void> {
    const added = await this.d.importFiles(files);
    for (const a of added) {
      const kind = isVideoClip(a.id) ? "video" : "image";
      const c = newCue(kind, a.name, a.id);
      if (kind === "image") { c.end = "hold"; c.hold = 0; }
      this.insert(c);
    }
    if (added.length) this.d.toast(`${added.length} Cue${added.length === 1 ? "" : "s"} angelegt.`);
  }

  /** Vorschaubild eines Cues (Video-Poster oder Grafik). */
  private thumb(c: Cue): HTMLElement {
    const box = el("span", `cthumb k-${c.kind}`);
    if (c.media && isVideoClip(c.media)) {
      const p = this.d.videos.posters.get(videoIdOf(c.media));
      if (p) { const cv = el("canvas"); cv.width = p.width; cv.height = p.height; cv.getContext("2d")!.drawImage(p, 0, 0); box.append(cv); }
    } else if (c.media?.startsWith("img:")) {
      box.textContent = "BILD";
    } else box.textContent = c.kind === "scene" ? "VJ" : c.kind === "tcsignal" ? "TC" : "";
    return box;
  }

  private dur(c: Cue): number | null {
    if (c.kind === "video") {
      const d = this.d.env.duration(c.media);
      if (!d) return null;
      const a = c.trimIn, b = c.trimOut > 0 ? Math.min(c.trimOut, d) : d;
      return Math.max(0, b - a);
    }
    if (c.kind === "image" || c.kind === "black") return c.hold > 0 ? c.hold : null;
    return null;
  }

  private endChip(c: Cue): string {
    if (c.kind === "scene" || c.kind === "tcsignal") return "sofort";
    if (c.kind === "video" && c.loop === "untilGo") return "Loop bis WEITER";
    if (c.kind === "video" && c.loop === "forever") return "Loop ∞";
    if (c.kind === "video" && c.loop === "count") return `${c.loopCount}× · ${END_LABEL[c.end]}`;
    if ((c.kind === "image" || c.kind === "black") && c.hold === 0) return "bis WEITER";
    return c.end === "fade" ? `ausblenden ${c.fadeOut} s` : END_LABEL[c.end];
  }

  private buildList(): void {
    const box = document.getElementById("cue-list")!;
    box.replaceChildren();
    this.rows = [];
    if (!this.list.length) {
      box.append(el("p", "muted small", "Noch kein Cue. Videos oder Bilder hierher ziehen oder oben „+ Video / Bild“."));
    }
    this.list.forEach((c, i) => {
      const row = el("div", `crow${c.start === "with" ? " sub" : ""}${i === this.selected ? " sel" : ""}`);
      row.append(el("span", "cno", String(i + 1)), this.thumb(c));
      const nm = el("span", "cname"); nm.append(el("b", "", c.name));
      const sub = c.kind === "video" ? (this.d.videos.find(videoIdOf(c.media ?? "vid:"))?.name ?? "Datei fehlt")
        : c.kind === "image" ? (this.d.images.items.find(m => `img:${m.id}` === c.media)?.name ?? "Datei fehlt")
        : c.kind === "scene" ? `Szene ${c.scene} „${this.d.ctx.scenes[c.scene - 1]?.name ?? "?"}“`
        : c.kind === "tcsignal" ? (c.tcAction === "stop" ? "Timecode anhalten" : `Timecode ${c.tcAction === "start" ? "starten ab" : "springen auf"} ${c.tcTarget}`) : "Bild aus";
      nm.append(el("small", (sub === "Datei fehlt" ? "missing" : ""), sub + (c.kind === "video" && c.volume > 0 ? " · Ton" : "")));
      const start = el("span", `chip${c.start === "with" ? " with" : c.start === "timecode" ? " tc" : ""}`,
        c.start === "timecode" ? `TC ${c.tc}` : START_LABEL[c.start] + (c.wait > 0 ? ` +${c.wait} s` : ""));
      const du = this.dur(c);
      row.append(nm, start, el("span", "cdur", du === null ? "–" : fmt(du)), el("span", `chip${c.loop !== "off" && c.kind === "video" ? " loop" : ""}`, this.endChip(c)));
      row.append(el("span", "cstate"), el("i", "cprog"));
      row.addEventListener("click", () => { this.selected = i; this.armedDelete = false; this.update(true); });
      row.addEventListener("dblclick", () => { cueSetNext(this.d.ctx.cues, i); });
      row.title = "Klick: Details · Doppelklick: als Nächstes";
      box.append(row);
      this.rows.push(row);
    });
  }

  /** Einstell-Bereich für den gewählten Cue. */
  private buildDetails(): void {
    const box = document.getElementById("cue-details")!;
    box.replaceChildren();
    const c = this.list[this.selected];
    if (!c) { box.append(el("p", "muted small", "Einen Cue anklicken, um ihn einzustellen.")); return; }
    const head = el("div", "cd-head");
    const name = el("input"); name.value = c.name; name.maxLength = 60; name.setAttribute("aria-label", "Name des Cues");
    name.addEventListener("change", () => { c.name = name.value.trim() || c.name; this.update(true); });
    head.append(el("span", "cno", String(this.selected + 1)), name);
    box.append(head);

    const seg = <T extends string>(label: string, opts: Record<T, string>, get: () => T, set: (v: T) => void) => {
      const r = el("div", "cd-row"); r.append(el("span", "", label));
      const s = el("div", "seg2");
      for (const k of Object.keys(opts) as T[]) {
        const b = el("button", get() === k ? "on" : "", opts[k]);
        b.addEventListener("click", () => { set(k); this.update(true); });
        s.append(b);
      }
      r.append(s); box.append(r);
    };
    const num = (label: string, get: () => number, set: (v: number) => void, unit: string, step = 0.1, max = 3600) => {
      const r = el("label", "cd-row"); r.append(el("span", "", label));
      const i = el("input"); i.type = "number"; i.min = "0"; i.max = String(max); i.step = String(step); i.value = String(get());
      i.addEventListener("change", () => { const v = Number(i.value.replace(",", ".")); if (Number.isFinite(v) && v >= 0) set(Math.min(max, v)); this.update(true); });
      const w = el("span", "inline"); w.append(i, el("small", "muted", unit)); r.append(w); box.append(r);
    };
    const range = (label: string, get: () => number, set: (v: number) => void, max: number) => {
      const r = el("label", "cd-row"); r.append(el("span", "", label));
      const i = el("input"); i.type = "range"; i.min = "0"; i.max = "1000"; i.value = String(Math.round((get() / Math.max(0.001, max)) * 1000));
      const v = el("span", "mval", fmt1(get()));
      i.addEventListener("input", () => { const x = (Number(i.value) / 1000) * max; set(x); v.textContent = fmt1(x); });
      const w = el("span", "cd-range"); w.append(i, v); r.append(w); box.append(r);
    };

    seg("Start", START_LABEL, () => c.start, v => { c.start = v; });
    if (c.start === "timecode") {
      const r = el("div", "cd-row"); r.append(el("span", "", "Timecode"));
      const w = el("span", "inline");
      const i = el("input", "tc-in"); i.value = c.tc; i.setAttribute("aria-label", "Timecode für den Start"); i.placeholder = "hh:mm:ss:ff";
      i.addEventListener("change", () => {
        const fps = this.d.tcFps();
        const t = parseTc(i.value, fps);
        if (t) c.tc = formatTc(t, 25).replace(";", ":"); else this.d.toast("Timecode als hh:mm:ss:ff eingeben, z. B. 00:20:00:00.");
        this.update(true);
      });
      const learn = el("button", "btn small-btn", "Hier lernen");
      learn.title = "Übernimmt den gerade laufenden Timecode";
      learn.addEventListener("click", () => {
        const now = this.d.tcNow();
        if (!now) { this.d.toast("Kein Timecode aktiv. In den Einstellungen unter Timecode einschalten."); return; }
        c.tc = formatFrames(Math.round(now.frames), now.fps).replace(";", ":");
        this.update(true);
      });
      w.append(i, learn); r.append(w); box.append(r);
    } else num("Wartezeit", () => c.wait, v => { c.wait = v; }, "s");

    if (c.kind === "scene") {
      const r = el("label", "cd-row"); r.append(el("span", "", "Szene"));
      const s = el("select");
      this.d.ctx.scenes.forEach((sc, i) => s.append(new Option(`${i + 1} · ${sc.name}`, String(i + 1))));
      s.value = String(c.scene);
      s.addEventListener("change", () => { c.scene = Number(s.value); c.name = `VJ-Szene: ${this.d.ctx.scenes[c.scene - 1]?.name ?? c.scene}`; this.update(true); });
      r.append(s); box.append(r);
    }

    if (c.kind === "video") {
      const d = this.d.env.duration(c.media);
      box.append(el("h4", "", "Video"));
      if (d > 0) {
        const bar = el("div", "cd-bar");
        const a = c.trimIn, b = c.trimOut > 0 ? c.trimOut : d;
        const pct = (x: number) => `${(Math.max(0, Math.min(d, x)) / d) * 100}%`;
        bar.append(Object.assign(el("i", "keep"), { style: `left:${pct(a)};width:calc(${pct(b)} - ${pct(a)})` }));
        if (c.loopRange) bar.append(Object.assign(el("i", "loopr"), { style: `left:${pct(c.loopIn || a)};width:calc(${pct(c.loopOut || b)} - ${pct(c.loopIn || a)})` }));
        box.append(bar);
        range("Start", () => c.trimIn, v => { c.trimIn = Math.min(v, (c.trimOut || d) - 0.2); }, d);
        range("Ende", () => c.trimOut || d, v => { c.trimOut = v >= d - 0.05 ? 0 : Math.max(v, c.trimIn + 0.2); }, d);
      } else box.append(el("p", "muted small", "Länge wird noch gemessen …"));
      seg("Wiederholen", LOOP_LABEL, () => c.loop, v => { c.loop = v; });
      if (c.loop === "count") num("Anzahl", () => c.loopCount, v => { c.loopCount = Math.max(1, Math.round(v)); }, "×", 1, 999);
      if (c.loop !== "off") {
        seg("Was loopt", { all: "ganzes Video", range: "nur Bereich" } as Record<"all" | "range", string>, () => (c.loopRange ? "range" : "all"), v => { c.loopRange = v === "range"; });
        if (c.loopRange && d > 0) {
          range("Loop von", () => c.loopIn || c.trimIn, v => { c.loopIn = v; }, d);
          range("Loop bis", () => c.loopOut || c.trimOut || d, v => { c.loopOut = v; }, d);
        }
      }
      // Kleine Timeline in den Details; als Timeline umgewandelte Cues haben den großen Editor unter der Liste
      if (d > 0 && !c.timeline) this.timeline(box, c, d);
      if (c.timeline) box.append(el("p", "muted small", "Timeline: Szenen im großen Editor unter der Cue-Liste setzen."));
    }
    if (c.kind === "tcsignal") {
      seg("Befehl", { start: "Start ab", stop: "Stopp", locate: "Springen auf" } as Record<"start" | "stop" | "locate", string>, () => c.tcAction, v => {
        c.tcAction = v; c.name = v === "start" ? "Timecode starten" : v === "stop" ? "Timecode anhalten" : "Timecode springen";
      });
      if (c.tcAction !== "stop") {
        const r = el("div", "cd-row"); r.append(el("span", "", "Zeit"));
        const i = el("input", "tc-in"); i.value = c.tcTarget; i.setAttribute("aria-label", "Timecode-Zeit");
        i.addEventListener("change", () => { const t = parseTc(i.value, 30); if (t) c.tcTarget = formatTc(t, 25); else this.d.toast("Zeit als hh:mm:ss:ff eingeben."); this.update(true); });
        r.append(i); box.append(r);
      }
      box.append(el("p", "muted small", "Steuert die eigene Timecode-Uhr von VJ-Link. Ist unter Einstellungen → Timecode „Senden“ an, bekommt z. B. eine MA den Timecode und ihre Timecode-Show löst Befehle aus."));
    }
    if (c.kind === "image" || c.kind === "black") num("Dauer", () => c.hold, v => { c.hold = v; }, "s · 0 = bis WEITER");
    if (c.kind !== "scene" && c.kind !== "tcsignal") {
      box.append(el("h4", "", "Ende und Blenden"));
      seg("Am Ende", END_LABEL, () => c.end, v => { c.end = v; });
      num("Einblenden", () => c.fadeIn, v => { c.fadeIn = v; }, "s", 0.1, 60);
      num("Ausblenden", () => c.fadeOut, v => { c.fadeOut = v; }, "s", 0.1, 60);
      box.append(el("h4", "", "Bild"));
      if (c.kind !== "black") seg("Größe", FIT_LABEL, () => c.fit, v => { c.fit = v; });
      seg("Visuals", OVER_LABEL, () => c.over, v => { c.over = v; });
    }
    if (c.kind === "video") {
      const r = el("label", "cd-row"); r.append(el("span", "", "Lautstärke"));
      const i = el("input"); i.type = "range"; i.min = "0"; i.max = "100"; i.value = String(Math.round(c.volume * 100));
      const v = el("span", "mval", `${Math.round(c.volume * 100)} %`);
      i.addEventListener("input", () => { c.volume = Number(i.value) / 100; v.textContent = `${i.value} %`; });
      const w = el("span", "cd-range"); w.append(i, v); r.append(w); box.append(r);
    }

    const act = el("div", "cd-actions");
    const mk = (t: string, fn: () => void, cls = "btn small-btn") => { const b = el("button", cls, t); b.addEventListener("click", fn); act.append(b); return b; };
    mk("Als Nächstes", () => { cueSetNext(this.d.ctx.cues, this.selected); });
    mk("↑", () => this.move(-1)); mk("↓", () => this.move(1));
    // Timeline: Cue als Zeitleiste bearbeiten (großer Editor unter der Liste)
    if (c.kind === "video" || c.kind === "image" || c.kind === "black") {
      mk(c.timeline ? "Timeline schließen" : "In Timeline umwandeln", () => {
        // Bild/Schwarz ohne Dauer: 30 s vorgeben (in der Timeline oben änderbar)
        if (!c.timeline && c.kind !== "video" && !(c.hold > 0)) { c.hold = 30; this.d.toast("Timeline mit 30 s Länge angelegt – oben in der Timeline änderbar."); }
        c.timeline = !c.timeline; this.update(true);
      });
    }
    mk("Kopieren", () => { const cp = { ...c, id: newCueId(), name: `${c.name} (Kopie)` }; this.list.splice(this.selected + 1, 0, cp); this.selected++; this.update(true); });
    const del = mk(this.armedDelete ? "Wirklich löschen?" : "Löschen", () => {
      if (!this.armedDelete) { this.armedDelete = true; this.update(true); return; }
      this.list.splice(this.selected, 1);
      const run = this.d.ctx.cues.run;
      run.active = run.active.filter(a => a.cueId !== c.id);
      if (run.next > this.selected) run.next--;
      if (run.current >= this.selected) run.current--;
      this.selected = Math.min(this.selected, this.list.length - 1);
      this.armedDelete = false;
      this.update(true);
    }, "btn small-btn danger");
    del.title = "Cue entfernen (die Datei bleibt in der Bibliothek)";
    box.append(act);
  }

  private move(dir: -1 | 1): void {
    const i = this.selected, j = i + dir;
    if (!this.list[i] || !this.list[j]) return;
    [this.list[i], this.list[j]] = [this.list[j]!, this.list[i]!];
    const run = this.d.ctx.cues.run;
    if (run.next === i) run.next = j; else if (run.next === j) run.next = i;
    if (run.current === i) run.current = j; else if (run.current === j) run.current = i;
    this.selected = j;
    this.update(true);
  }

  /**
   * Timeline eines Videos: Szenen-Marker. Klick auf die Leiste setzt einen Marker, Marker anklicken wählt ihn.
   * Läuft das Video über einen Marker, wird seine Szene abgerufen (vorgegeben: nur die anderen Bilder).
   */
  private timeline(box: HTMLElement, c: Cue, d: number): void {
    const marks = (c.marks ??= []);
    box.append(el("h4", "", "Timeline: Szenen im Video"));
    const bar = el("div", "tl-bar");
    bar.title = "Klicken: hier einen Szenen-Marker setzen";
    const pct = (x: number) => `${(Math.max(0, Math.min(d, x)) / d) * 100}%`;
    this.playhead = el("i", "tl-play");
    bar.append(this.playhead);
    marks.forEach((m, k) => {
      const pin = el("button", `tl-mark${k === this.selMark ? " sel" : ""}`, String(m.scene));
      pin.style.left = pct(m.t);
      pin.title = `${fmt1(m.t)} · Szene ${m.scene} „${this.d.ctx.scenes[m.scene - 1]?.name ?? "?"}“`;
      pin.addEventListener("click", e => { e.stopPropagation(); this.selMark = k; this.update(true); });
      bar.append(pin);
    });
    bar.addEventListener("click", e => {
      const r = bar.getBoundingClientRect();
      const t = Math.round(((e.clientX - r.left) / r.width) * d * 10) / 10;
      const last = marks.filter(m => m.t <= t).pop();
      marks.push({ t, scene: Math.min(this.d.ctx.scenes.length || 1, (last?.scene ?? 0) + 1), others: this.d.multiImage?.() ?? false });
      marks.sort((a, b) => a.t - b.t);
      this.selMark = marks.findIndex(m => m.t === t);
      this.update(true);
    });
    box.append(bar);
    if (!marks.length) { box.append(el("p", "muted small", "Auf die Leiste klicken, um an dieser Stelle eine Szene abzurufen. So wechseln z. B. die anderen Leinwände passend zum Video.")); return; }
    const m = marks[this.selMark];
    if (!m) { box.append(el("p", "muted small", `${marks.length} Marker. Einen anklicken, um Zeit und Szene einzustellen.`)); return; }
    const r1 = el("div", "cd-row"); r1.append(el("span", "", "Marker"));
    const w = el("span", "inline wrap");
    const tIn = el("input", "tc-in"); tIn.value = m.t.toFixed(1); tIn.setAttribute("aria-label", "Zeit im Video in Sekunden");
    tIn.addEventListener("change", () => { const v = Number(tIn.value.replace(",", ".")); if (Number.isFinite(v)) { m.t = Math.max(0, Math.min(d, v)); marks.sort((a, b) => a.t - b.t); this.selMark = marks.indexOf(m); } this.update(true); });
    const sc = el("select"); sc.setAttribute("aria-label", "Szene");
    this.d.ctx.scenes.forEach((s, i) => sc.append(new Option(`${i + 1} · ${s.name}`, String(i + 1))));
    sc.value = String(m.scene);
    sc.addEventListener("change", () => { m.scene = Number(sc.value); this.update(true); });
    const oth = el("button", `btn small-btn${m.others ? " on" : ""}`, m.others ? "nur andere Bilder" : "alle Bilder");
    oth.title = "„nur andere Bilder“: das Bild, auf dem der SHOW-Ablauf läuft, bleibt unberührt";
    oth.addEventListener("click", () => { m.others = !m.others; this.update(true); });
    const del = el("button", "btn small-btn", "Löschen");
    del.addEventListener("click", () => { marks.splice(marks.indexOf(m), 1); this.selMark = -1; this.update(true); });
    w.append(tIn, el("small", "muted", "s"), sc);
    if (this.d.multiImage?.()) w.append(oth);
    w.append(del);
    r1.append(w); box.append(r1);
  }

  /** Zehnmal pro Sekunde: Liste nur bei Änderungen neu bauen, sonst Zustände nachführen. */
  update(force = false): void {
    const s = this.d.ctx.cues, now = Date.now();
    const sig = s.list.map(c => JSON.stringify(c)).join("|") + `#${this.selected}#${this.d.videos.posters.size}#${this.d.videos.items.map(v => v.duration).join(",")}`;
    if (force || sig !== this.sig) { this.sig = sig; this.buildList(); }
    const dsig = `${this.selected}|${JSON.stringify(s.list[this.selected] ?? null)}|${this.armedDelete}|${this.d.ctx.scenes.length}`;
    if (force || dsig !== this.detSig) {
      const focusInDetails = document.activeElement && document.getElementById("cue-details")!.contains(document.activeElement) && (document.activeElement as HTMLElement).tagName !== "BUTTON";
      if (!focusInDetails || force) { this.detSig = dsig; this.buildDetails(); }
    }
    // Timeline-Editor des gewählten Cues
    this.tl ??= new TimelineView(document.getElementById("cue-timeline")!, {
      ctx: this.d.ctx, env: this.d.env, toast: m => this.d.toast(m),
      indexOf: cc => this.d.ctx.cues.list.indexOf(cc), changed: () => this.update(true),
      multiImage: () => this.d.multiImage?.() ?? false,
    });
    this.tl.update(s.list[this.selected] ?? null, force);
    // Timeline: Abspielposition des gewählten Videos
    const selC = s.list[this.selected];
    if (this.playhead && selC?.kind === "video") {
      const ac = s.run.active.find(a => a.cueId === selC.id);
      const d = this.d.env.duration(selC.media);
      if (ac && d > 0 && now >= ac.startMs) { this.playhead.hidden = false; this.playhead.style.left = `${(Math.min(d, cueTime(selC, ac, now, d).t) / d) * 100}%`; }
      else this.playhead.hidden = true;
    }
    let liveName = "", liveTime = "";
    s.list.forEach((c, i) => {
      const row = this.rows[i]; if (!row) return;
      const st = cueStatus(s, c, now, this.d.env);
      row.classList.toggle("live", st.live);
      row.classList.toggle("next", i === s.run.next);
      const lab = row.querySelector<HTMLElement>(".cstate")!;
      lab.textContent = st.live ? (st.remaining !== null ? `LÄUFT · ${fmt(st.remaining)} übrig` : "LÄUFT") : i === s.run.next ? "ALS NÄCHSTES" : "";
      row.querySelector<HTMLElement>(".cprog")!.style.width = st.live ? `${Math.round(st.progress * 100)}%` : "0";
      if (st.live && i === s.run.current) { liveName = c.name; liveTime = st.remaining !== null ? `${fmt(st.remaining)} übrig` : ""; }
    });
    document.getElementById("sh-now")!.textContent = liveName ? `● JETZT · ${liveName.toUpperCase()}` : "● AUSGANG";
    document.getElementById("sh-now-time")!.textContent = liveTime;
    const n = s.list[s.run.next];
    document.getElementById("sh-next-name")!.textContent = n ? `${s.run.next + 1} · ${n.name}` : "Ende des Ablaufs";
    const nt = document.getElementById("sh-next-thumb")!;
    const ntSig = n ? n.id + this.d.videos.posters.size : "";
    if (nt.dataset.sig !== ntSig) { nt.dataset.sig = ntSig; nt.replaceChildren(...(n ? [this.thumb(n)] : [])); }
    document.getElementById("cue-go-sub")!.textContent = `${goLabel(s, now, this.d.env)} · Leertaste`;
    const total = s.list.reduce((a, c) => a + (this.dur(c) ?? 0), 0);
    document.getElementById("cue-sum")!.textContent = s.list.length ? `· ${s.list.length} Cues · ${fmt(total)}` : "";
  }
}
