import { t } from "../core/i18n";
// Einstellungen → Timecode. Empfangen und Senden sind getrennt einschaltbar:
// VJ-Link folgt einem Pult/Programm und kann gleichzeitig Timecode an eine MA schicken.
import {
  TC_RATES, buildArtTimecode, formatFrames, framesToTc, mtcQuarterFrames, parseTc, tcToFrames,
  type TcFps, type TcSendFrom, type TcSource, type TimecodeClock,
} from "../core/timecode";

export interface TcSettings {
  receive: boolean; send: boolean; sendFrom: TcSendFrom;
  source: TcSource; fps: TcFps; chase: boolean; offset: string; freewheel: number;
  via: "artnet" | "mtc" | "both"; host: string; midiOut: string; start: string;
  /** Alt (vor Version mit getrenntem Empfangen/Senden). */
  mode?: "off" | "receive" | "send";
}
export const defaultTcSettings = (): TcSettings => ({
  receive: false, send: false, sendFrom: "own",
  source: "artnet", fps: 25, chase: true, offset: "00:00:00:00", freewheel: 2,
  via: "artnet", host: "255.255.255.255", midiOut: "", start: "00:00:00:00",
});

export interface TcDeps {
  midiOutputs(): string[];
  sendMidi(device: string, bytes: number[]): void;
  sendArt(bytes: Uint8Array, host: string): void;
  toast(msg: string): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e;
}
const fpsLabel = (f: TcFps) => (f === 29.97 ? "29,97 DF" : String(f));
const realRate = (f: TcFps) => (f === 29.97 ? 30000 / 1001 : f);

export class TcPanel {
  private root: HTMLElement | null = null;
  private inBig = el("div", "tc-big");
  private inStatus = el("p", "am-hint");
  private outBig = el("div", "tc-big");
  private outStatus = el("p", "am-hint");
  private qf = 0;
  private latched = 0;
  private timer = 0;

  constructor(private clock: TimecodeClock, private s: TcSettings, private save: () => void, private d: TcDeps) {
    // Alte Einstellung übernehmen
    if (s.mode) { s.receive = s.mode === "receive"; s.send = s.mode === "send"; delete s.mode; }
    this.apply();
  }

  /** Einstellungen auf die Uhr übertragen und den Sende-Takt anpassen. */
  apply(): void {
    const c = this.clock, s = this.s;
    c.receiveOn = s.receive; c.sendOn = s.send; c.sendFrom = s.sendFrom;
    c.source = s.source; c.chase = s.chase; c.freewheel = s.freewheel; c.sendFps = s.fps;
    const off = parseTc(s.offset, c.fps);
    c.offset = off ? tcToFrames(off, c.fps) : 0;
    clearInterval(this.timer);
    if (s.send) this.timer = window.setInterval(() => this.tick(), 1000 / (realRate(s.fps) * 4));
  }

  /** Viermal pro Bild: MTC-Viertelbilder, einmal pro Bild Art-Net. */
  private tick(): void {
    const now = this.clock.outgoing(Date.now());
    if (!now || !now.running) return;
    const s = this.s, fps = now.fps;
    if (s.via !== "artnet" && s.midiOut) {
      if (this.qf === 0) this.latched = Math.floor(now.frames);
      this.d.sendMidi(s.midiOut, [0xf1, mtcQuarterFrames(framesToTc(this.latched, fps), fps)[this.qf]!]);
    }
    if (s.via !== "mtc" && this.qf % 4 === 0) this.d.sendArt(buildArtTimecode(framesToTc(Math.floor(now.frames), fps), fps), s.host);
    this.qf = (this.qf + 1) % 8;
  }

  build(root: HTMLElement): void {
    this.root = root;
    root.replaceChildren();
    const s = this.s;
    const rebuild = () => { this.save(); this.apply(); this.build(root); };
    const seg = <T extends string>(label: string, opts: [T, string][], get: () => T, set: (v: T) => void) => {
      const r = el("div", "set-row"); r.append(el("span", "", label));
      const g = el("div", "seg2");
      for (const [k, lbl] of opts) {
        const b = el("button", get() === k ? "on" : "", lbl);
        b.addEventListener("click", () => { set(k); rebuild(); });
        g.append(b);
      }
      r.append(g); root.append(r);
    };
    const text = (label: string, get: () => string, set: (v: string) => boolean, hint = "", wide = false) => {
      const r = el("label", "set-row"); r.append(el("span", "", label));
      const w = el("span", "inline");
      const i = el("input", wide ? "tc-in wide" : "tc-in"); i.value = get();
      i.addEventListener("change", () => { if (set(i.value.trim())) { this.save(); this.apply(); } else { this.d.toast(t("Bitte die Eingabe prüfen.")); i.value = get(); } });
      w.append(i); if (hint) w.append(el("small", "muted", hint));
      r.append(w); root.append(r);
    };
    const onOff = (title: string, get: () => boolean, set: (v: boolean) => void, sub: string) => {
      const h = el("div", "tc-head");
      const hd = el("div"); hd.append(el("h3", "", title), el("p", "am-hint", sub));
      const b = el("button", `btn small-btn${get() ? " on" : ""}`, get() ? t("an") : t("aus"));
      b.setAttribute("aria-pressed", String(get()));
      b.addEventListener("click", () => { set(!get()); rebuild(); });
      h.append(hd, b); root.append(h);
    };

    // ---- Eingang
    onOff(t("Empfangen"), () => s.receive, v => { s.receive = v; }, t("Ein Pult oder Programm gibt die Zeit vor. Cues mit Start „Timecode“ folgen ihm."));
    if (s.receive) {
      root.append(this.inBig, this.inStatus);
      seg(t("Quelle"), [["artnet", "Art-Net"], ["mtc", "MIDI (MTC)"]], () => s.source, v => { s.source = v; });
      seg(t("Videos"), [["chase", t("folgen dem Timecode")], ["start", t("werden nur gestartet")]], () => (s.chase ? "chase" : "start"), v => { s.chase = v === "chase"; });
      seg(t("Bei Aussetzer"), [["2", t("2 s weiterlaufen")], ["0.3", t("sofort anhalten")]], () => (s.freewheel >= 1 ? "2" : "0.3"), v => { s.freewheel = Number(v); });
      text(t("Versatz"), () => s.offset, v => { if (!parseTc(v, this.clock.fps)) return false; s.offset = v; return true; }, t("wird zum empfangenen Wert addiert"));
    }

    // ---- Ausgang
    onOff(t("Senden"), () => s.send, v => { s.send = v; }, t("VJ-Link sendet Timecode, z. B. an eine MA, deren Timecode-Show dann Befehle auslöst."));
    if (s.send) {
      root.append(this.outBig, this.outStatus);
      seg(t("Was senden"), [["own", t("eigene Uhr")], ["thru", t("Empfangenen weitergeben")]], () => s.sendFrom, v => { s.sendFrom = v; });
      if (s.sendFrom === "own") seg(t("Bildrate"), TC_RATES.map(f => [String(f), fpsLabel(f)] as [string, string]), () => String(s.fps), v => { s.fps = Number(v) as TcFps; });
      seg(t("Senden über"), [["artnet", "Art-Net"], ["mtc", "MIDI (MTC)"], ["both", t("beides")]], () => s.via, v => { s.via = v; });
      if (s.via !== "mtc") text(t("Art-Net-Ziel"), () => s.host, v => { if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(v)) return false; s.host = v; return true; }, t("IP der MA oder 255.255.255.255 für alle"), true);
      if (s.via !== "artnet") {
        const r = el("div", "set-row"); r.append(el("span", "", t("MIDI-Ausgang")));
        const g = el("div", "am-list");
        const outs = this.d.midiOutputs();
        if (!outs.length) g.append(el("p", "am-hint", t("Kein MIDI-Ausgang gefunden.")));
        for (const o of outs) {
          const b = el("button", "am-item", o); b.setAttribute("aria-checked", String(s.midiOut === o));
          b.addEventListener("click", () => { s.midiOut = o; rebuild(); });
          g.append(b);
        }
        r.append(g); root.append(r);
      }
      if (s.sendFrom === "own") {
        text(t("Startzeit"), () => s.start, v => { if (!parseTc(v, s.fps)) return false; s.start = v; return true; });
        const act = el("div", "set-row"); act.append(el("span", "", t("Uhr")));
        const w = el("span", "inline wrap");
        const go = el("button", "btn small-btn", "▶ Start"); go.dataset.ctl = "tc.start";
        go.addEventListener("click", () => this.clock.start(Date.now()));
        const st = el("button", "btn small-btn", t("■ Stopp")); st.dataset.ctl = "tc.stop";
        st.addEventListener("click", () => this.clock.stop(Date.now()));
        const zero = el("button", "btn small-btn", t("Auf Startzeit")); zero.dataset.ctl = "tc.zero";
        zero.addEventListener("click", () => { const t = parseTc(s.start, s.fps); this.clock.locate(t ? tcToFrames(t, s.fps) : 0, Date.now()); });
        w.append(go, st, zero); act.append(w); root.append(act);
        root.append(el("p", "am-hint", t("Steuern lässt sich die Uhr auch aus dem SHOW-Ablauf (Cue „+ Timecode“: Start ab Zeit, Stopp, Springen) und per Mapping.")));
      }
    }
    this.update();
  }

  /** Anzeigen nachführen (wenn sichtbar). */
  update(): void {
    if (!this.root || !this.root.isConnected) return;
    const nowMs = Date.now(), c = this.clock;
    const i = c.incoming(nowMs), o = c.outgoing(nowMs);
    this.inBig.textContent = i ? formatFrames(Math.floor(i.frames), i.fps) : "--:--:--:--";
    this.inBig.classList.toggle("run", !!i?.running); this.inBig.classList.toggle("stale", !!i?.stale);
    this.inStatus.textContent = i ? `${i.stale ? t("Kein Signal mehr · ") : i.running ? t("läuft · ") : t("steht · ")}${fpsLabel(c.fps)} fps${c.from ? t(" · von {host}", { host: c.from }) : ""}` : t("Wartet auf Timecode …");
    this.outBig.textContent = o ? formatFrames(Math.floor(o.frames), o.fps) : "--:--:--:--";
    this.outBig.classList.toggle("run", !!o?.running);
    this.outStatus.textContent = o ? (o.running ? `${t("sendet")} · ${fpsLabel(o.fps)} fps · ${this.s.via === "artnet" ? "Art-Net" : this.s.via === "mtc" ? "MIDI" : t("Art-Net und MIDI")}` : t("angehalten")) : t("nichts zu senden (kein Eingang)");
  }
}
