// Einstellungen → Timecode: Wer ist die Uhr? Empfangen (Pult führt) oder Senden (VJ-Link führt).
import {
  TC_RATES, buildArtTimecode, formatFrames, framesToTc, mtcQuarterFrames, parseTc, tcToFrames,
  type TcFps, type TcMode, type TcSource, type TimecodeClock,
} from "../core/timecode";

export interface TcSettings {
  mode: TcMode; source: TcSource; fps: TcFps; chase: boolean; offset: string; freewheel: number;
  via: "artnet" | "mtc" | "both"; host: string; midiOut: string; start: string;
}
export const defaultTcSettings = (): TcSettings => ({
  mode: "off", source: "artnet", fps: 25, chase: true, offset: "00:00:00:00", freewheel: 2,
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

export class TcPanel {
  private root: HTMLElement | null = null;
  private big = el("div", "tc-big");
  private status = el("p", "am-hint");
  private qf = 0;
  private latched = 0;
  private timer = 0;

  constructor(private clock: TimecodeClock, private s: TcSettings, private save: () => void, private d: TcDeps) {
    this.apply();
  }

  /** Einstellungen auf die Uhr übertragen und den Sende-Takt anpassen. */
  apply(): void {
    const c = this.clock, s = this.s;
    c.mode = s.mode; c.source = s.source; c.chase = s.chase; c.freewheel = s.freewheel;
    if (s.mode === "send") c.fps = s.fps;
    const off = parseTc(s.offset, c.fps);
    c.offset = off ? tcToFrames(off, c.fps) : 0;
    clearInterval(this.timer);
    if (s.mode === "send") this.timer = window.setInterval(() => this.tick(), 1000 / (realRate(s.fps) * 4));
  }

  /** Viermal pro Bild: MTC-Viertelbilder, einmal pro Bild Art-Net. */
  private tick(): void {
    const now = this.clock.now(Date.now());
    if (!now || !now.running) return;
    const s = this.s;
    if (s.via !== "artnet" && s.midiOut) {
      if (this.qf === 0) this.latched = Math.floor(now.frames);
      const bytes = mtcQuarterFrames(framesToTc(this.latched, s.fps), s.fps);
      this.d.sendMidi(s.midiOut, [0xf1, bytes[this.qf]!]);
    }
    if (s.via !== "mtc" && this.qf % 4 === 0) this.d.sendArt(buildArtTimecode(framesToTc(Math.floor(now.frames), s.fps), s.fps), s.host);
    this.qf = (this.qf + 1) % 8;
  }

  build(root: HTMLElement): void {
    this.root = root;
    root.replaceChildren();
    const s = this.s;
    const seg = <T extends string>(label: string, opts: [T, string][], get: () => T, set: (v: T) => void) => {
      const r = el("div", "set-row"); r.append(el("span", "", label));
      const g = el("div", "seg2");
      for (const [k, t] of opts) {
        const b = el("button", get() === k ? "on" : "", t);
        b.addEventListener("click", () => { set(k); this.save(); this.apply(); this.build(root); });
        g.append(b);
      }
      r.append(g); root.append(r);
    };
    const text = (label: string, get: () => string, set: (v: string) => boolean, hint = "") => {
      const r = el("label", "set-row"); r.append(el("span", "", label));
      const w = el("span", "inline");
      const i = el("input", "tc-in"); i.value = get();
      i.addEventListener("change", () => { if (set(i.value.trim())) { this.save(); this.apply(); } else { this.d.toast("Eingabe prüfen."); i.value = get(); } });
      w.append(i); if (hint) w.append(el("small", "muted", hint));
      r.append(w); root.append(r);
    };

    root.append(this.big, this.status);
    seg("Wer ist die Uhr?", [["off", "Kein Timecode"], ["receive", "Pult / anderes Programm"], ["send", "VJ-Link"]], () => s.mode, v => { s.mode = v; });
    if (s.mode === "receive") {
      seg("Quelle", [["artnet", "Art-Net"], ["mtc", "MIDI (MTC)"]], () => s.source, v => { s.source = v; });
      seg("Videos", [["chase", "folgen dem Timecode"], ["start", "werden nur gestartet"]], () => (s.chase ? "chase" : "start"), v => { s.chase = v === "chase"; });
      seg("Bei Aussetzer", [["2", "2 s weiterlaufen"], ["0.3", "sofort anhalten"]], () => (s.freewheel >= 1 ? "2" : "0.3"), v => { s.freewheel = Number(v); });
      text("Versatz", () => s.offset, v => { const t = parseTc(v, this.clock.fps); if (!t) return false; s.offset = v; return true; }, "wird zum empfangenen Wert addiert");
      root.append(el("p", "am-hint", "Bildrate kommt mit dem Signal. „Folgen“: Spult das Pult zurück, springen die Videos mit; steht der Timecode, steht das Bild."));
    }
    if (s.mode === "send") {
      seg("Bildrate", TC_RATES.map(f => [String(f), f === 29.97 ? "29,97 DF" : String(f)] as [string, string]), () => String(s.fps), v => { s.fps = Number(v) as TcFps; });
      seg("Senden über", [["artnet", "Art-Net"], ["mtc", "MIDI (MTC)"], ["both", "beides"]], () => s.via, v => { s.via = v; });
      if (s.via !== "mtc") text("Art-Net-Ziel", () => s.host, v => { if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(v)) return false; s.host = v; return true; }, "IP des Pults oder 255.255.255.255 für alle");
      if (s.via !== "artnet") {
        const r = el("div", "set-row"); r.append(el("span", "", "MIDI-Ausgang"));
        const g = el("div", "am-list");
        const outs = this.d.midiOutputs();
        if (!outs.length) g.append(el("p", "am-hint", "Kein MIDI-Ausgang gefunden."));
        for (const o of outs) {
          const b = el("button", "am-item", o); b.setAttribute("aria-checked", String(s.midiOut === o));
          b.addEventListener("click", () => { s.midiOut = o; this.save(); this.build(root); });
          g.append(b);
        }
        r.append(g); root.append(r);
      }
      text("Startzeit", () => s.start, v => { const t = parseTc(v, s.fps); if (!t) return false; s.start = v; return true; });
      const act = el("div", "set-row"); act.append(el("span", "", ""));
      const w = el("span", "inline wrap");
      const go = el("button", "btn small-btn", "▶ Start"); go.dataset.ctl = "tc.start";
      go.addEventListener("click", () => this.clock.start(Date.now()));
      const st = el("button", "btn small-btn", "■ Stopp"); st.dataset.ctl = "tc.stop";
      st.addEventListener("click", () => this.clock.stop(Date.now()));
      const zero = el("button", "btn small-btn", "Auf Startzeit"); zero.dataset.ctl = "tc.zero";
      zero.addEventListener("click", () => { const t = parseTc(s.start, s.fps); this.clock.locate(t ? tcToFrames(t, s.fps) : 0, Date.now()); });
      w.append(go, st, zero); act.append(w); root.append(act);
      root.append(el("p", "am-hint", "VJ-Link gibt den Takt vor, das Pult folgt. Start, Stopp und Startzeit lassen sich auch per Mapping auf Tasten legen."));
    }
    if (s.mode === "off") root.append(el("p", "am-hint", "Ohne Timecode starten Cues von Hand oder nacheinander. Mit Timecode können Cues zu einer festen Zeit starten (Cue → Start: Timecode)."));
    this.update();
  }

  /** Anzeige nachführen (wenn sichtbar). */
  update(): void {
    if (!this.root || !this.root.isConnected) return;
    const now = this.clock.now(Date.now());
    this.big.textContent = now ? formatFrames(Math.floor(now.frames), now.fps) : "--:--:--:--";
    this.big.classList.toggle("run", !!now?.running);
    this.big.classList.toggle("stale", !!now?.stale);
    const c = this.clock;
    this.status.textContent = c.mode === "receive"
      ? (now ? `${now.stale ? "Kein Signal mehr · " : now.running ? "läuft · " : "steht · "}${c.fps === 29.97 ? "29,97 DF" : c.fps} fps${c.from ? ` · von ${c.from}` : ""}` : "Wartet auf Timecode …")
      : c.mode === "send" ? (now?.running ? `sendet · ${c.fps === 29.97 ? "29,97 DF" : c.fps} fps` : "angehalten") : "aus";
  }
}

const realRate = (f: TcFps) => (f === 29.97 ? 30000 / 1001 : f);
