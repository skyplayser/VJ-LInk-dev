// Timecode (SMPTE): Umrechnung, Art-Net-Timecode, MIDI-Timecode (MTC) und eine Uhr,
// die entweder einem Pult folgt (Empfangen) oder selbst läuft (Senden).

export type TcFps = 24 | 25 | 29.97 | 30;
export const TC_RATES: readonly TcFps[] = [24, 25, 29.97, 30];
export interface Tc { h: number; m: number; s: number; f: number }

/** Bilder pro Sekunde, wie sie in der Zählung vorkommen (29,97 zählt bis 29). */
export const nominal = (fps: TcFps): number => (fps === 29.97 ? 30 : fps);
/** Echte Bildrate (29,97 = 30000/1001). */
export const realFps = (fps: TcFps): number => (fps === 29.97 ? 30000 / 1001 : fps);

/** Timecode → fortlaufende Bildnummer. 29,97 ist Drop-Frame (überspringt Nummern 0 und 1 außer jede 10. Minute). */
export function tcToFrames(tc: Tc, fps: TcFps): number {
  const base = (tc.h * 3600 + tc.m * 60 + tc.s) * nominal(fps) + tc.f;
  if (fps !== 29.97) return base;
  const mins = tc.h * 60 + tc.m;
  return base - 2 * (mins - Math.floor(mins / 10));
}

export function framesToTc(n: number, fps: TcFps): Tc {
  let x = Math.max(0, Math.floor(n));
  if (fps === 29.97) {
    const d = Math.floor(x / 17982), mod = x % 17982;
    x += 18 * d + (mod >= 2 ? 2 * Math.floor((mod - 2) / 1798) : 0);
  }
  const nf = nominal(fps);
  const f = x % nf, totalS = Math.floor(x / nf);
  return { h: Math.floor(totalS / 3600) % 24, m: Math.floor(totalS / 60) % 60, s: totalS % 60, f };
}

const p2 = (v: number) => String(v).padStart(2, "0");
export function formatTc(tc: Tc, fps: TcFps = 25): string {
  return `${p2(tc.h)}:${p2(tc.m)}:${p2(tc.s)}${fps === 29.97 ? ";" : ":"}${p2(tc.f)}`;
}
export const formatFrames = (n: number, fps: TcFps): string => formatTc(framesToTc(n, fps), fps);

/** „00:20:00:00“ (auch mit ; oder .) → Timecode, sonst null. */
export function parseTc(str: string, fps: TcFps = 25): Tc | null {
  const m = /^\s*(\d{1,2})[:.;](\d{1,2})[:.;](\d{1,2})[:.;](\d{1,2})\s*$/.exec(str);
  if (!m) return null;
  const tc = { h: +m[1]!, m: +m[2]!, s: +m[3]!, f: +m[4]! };
  if (tc.h > 23 || tc.m > 59 || tc.s > 59 || tc.f >= nominal(fps)) return null;
  return tc;
}

// ---- Art-Net OpTimeCode (0x9700) -------------------------------------------------------

const ARTNET_ID = [0x41, 0x72, 0x74, 0x2d, 0x4e, 0x65, 0x74, 0x00];
const TYPE_FPS: readonly TcFps[] = [24, 25, 29.97, 30];

export function parseArtTimecode(buf: Uint8Array): { tc: Tc; fps: TcFps } | null {
  if (buf.length < 19) return null;
  for (let i = 0; i < 8; i++) if (buf[i] !== ARTNET_ID[i]) return null;
  if ((buf[8]! | (buf[9]! << 8)) !== 0x9700) return null;
  const fps = TYPE_FPS[buf[18]!];
  if (!fps) return null;
  const tc = { f: buf[14]!, s: buf[15]!, m: buf[16]!, h: buf[17]! };
  if (tc.h > 23 || tc.m > 59 || tc.s > 59 || tc.f >= nominal(fps)) return null;
  return { tc, fps };
}

export function buildArtTimecode(tc: Tc, fps: TcFps): Uint8Array {
  const b = new Uint8Array(19);
  b.set(ARTNET_ID, 0);
  b[8] = 0x00; b[9] = 0x97; // OpCode, little endian
  b[10] = 0; b[11] = 14;    // Protokoll 14
  b[14] = tc.f; b[15] = tc.s; b[16] = tc.m; b[17] = tc.h;
  b[18] = TYPE_FPS.indexOf(fps);
  return b;
}

// ---- MIDI-Timecode (Quarter Frames, 0xF1) ----------------------------------------------

/** Setzt aus 8 Quarter-Frame-Teilen einen Timecode zusammen (2 Bilder Nachlauf werden ausgeglichen). */
export class MtcDecoder {
  private parts = new Array<number>(8).fill(0);
  private seen = 0;

  feed(data1: number): { tc: Tc; fps: TcFps } | null {
    const piece = (data1 >> 4) & 7, val = data1 & 0x0f;
    if (piece === 0) this.seen = 0;
    this.parts[piece] = val;
    this.seen |= 1 << piece;
    if (piece !== 7 || this.seen !== 0xff) return null;
    const p = this.parts;
    const fps = TYPE_FPS[(p[7]! >> 1) & 3]!;
    const tc = { f: p[0]! | (p[1]! << 4), s: p[2]! | (p[3]! << 4), m: p[4]! | (p[5]! << 4), h: p[6]! | ((p[7]! & 1) << 4) };
    // Die vollständige Zeit gilt schon 2 Bilder lang
    return { tc: framesToTc(tcToFrames(tc, fps) + 2, fps), fps };
  }
}

/** Die 8 Datenbytes der Quarter Frames für einen Timecode (jeweils nach 0xF1 senden). */
export function mtcQuarterFrames(tc: Tc, fps: TcFps): number[] {
  const rate = TYPE_FPS.indexOf(fps);
  const v = [tc.f & 15, tc.f >> 4, tc.s & 15, tc.s >> 4, tc.m & 15, tc.m >> 4, tc.h & 15, ((tc.h >> 4) & 1) | (rate << 1)];
  return v.map((x, i) => (i << 4) | (x & 15));
}

// ---- Uhr ----------------------------------------------------------------------------------

export type TcSource = "artnet" | "mtc";
/** Was gesendet wird: die eigene Uhr von VJ-Link oder der empfangene Timecode (Weitergabe). */
export type TcSendFrom = "own" | "thru";

export interface TcNow { frames: number; fps: TcFps; running: boolean; stale: boolean }

/**
 * Empfangen und Senden sind unabhängig: VJ-Link kann einem Pult folgen und gleichzeitig Timecode an eine MA
 * schicken (eigene Uhr, gesteuert von Cues oder Tasten, oder der empfangene Timecode weitergereicht).
 */
export class TimecodeClock {
  receiveOn = false;
  sendOn = false;
  sendFrom: TcSendFrom = "own";
  source: TcSource = "artnet";
  /** Bildrate: beim Empfang aus dem Signal, beim Senden eingestellt. */
  fps: TcFps = 25;
  sendFps: TcFps = 25;
  /** Versatz in Bildern (wird auf den empfangenen Wert addiert). */
  offset = 0;
  /** Videos folgen dem Timecode (sonst werden sie nur gestartet). */
  chase = true;
  /** So lange läuft die Uhr bei einem Aussetzer weiter (Sekunden). */
  freewheel = 2;
  /** Absender des letzten Timecodes (z. B. IP des Pults). */
  from = "";

  private last: { frames: number; at: number } | null = null;
  private advancing = false;
  private own: { frames: number; at: number; running: boolean } = { frames: 0, at: 0, running: false };

  /** Empfangenen Timecode übernehmen (nur von der gewählten Quelle). */
  receive(tc: Tc, fps: TcFps, src: TcSource, nowMs: number, from = ""): boolean {
    if (!this.receiveOn || src !== this.source) return false;
    const frames = tcToFrames(tc, fps);
    const prev = this.last;
    this.advancing = !!prev && frames > prev.frames && frames - prev.frames <= nominal(fps) * 2 && nowMs - prev.at < 1000;
    this.fps = fps;
    this.last = { frames, at: nowMs };
    if (from) this.from = from;
    return true;
  }

  /** Empfangener Timecode (inkl. Versatz) oder null. */
  incoming(nowMs: number): TcNow | null {
    if (!this.receiveOn || !this.last) return null;
    const age = (nowMs - this.last.at) / 1000;
    if (age > this.freewheel) return { frames: this.last.frames + this.offset, fps: this.fps, running: false, stale: true };
    const frames = this.last.frames + (this.advancing ? age * realFps(this.fps) : 0);
    return { frames: frames + this.offset, fps: this.fps, running: this.advancing, stale: age > 0.5 };
  }

  /** Eigene Uhr (zum Senden). */
  ownNow(nowMs: number): TcNow {
    const s = this.own;
    return { frames: s.frames + (s.running ? ((nowMs - s.at) / 1000) * realFps(this.sendFps) : 0), fps: this.sendFps, running: s.running, stale: false };
  }

  /** Was gesendet wird, oder null wenn Senden aus ist. */
  outgoing(nowMs: number): TcNow | null {
    if (!this.sendOn) return null;
    if (this.sendFrom === "thru") { const i = this.incoming(nowMs); return i ? { ...i, fps: this.fps } : null; }
    return this.ownNow(nowMs);
  }

  /** Zeit für Cues: empfangener Timecode, sonst die eigene (gesendete) Uhr. */
  now(nowMs: number): TcNow | null {
    if (this.receiveOn) return this.incoming(nowMs);
    if (this.sendOn) return this.ownNow(nowMs);
    return null;
  }

  // Eigene Uhr steuern (Tasten, Cues, Einstellungen)
  start(nowMs: number): void { if (!this.own.running) this.own = { frames: this.ownNow(nowMs).frames, at: nowMs, running: true }; }
  stop(nowMs: number): void { this.own = { frames: this.ownNow(nowMs).frames, at: nowMs, running: false }; }
  locate(frames: number, nowMs: number): void { this.own = { frames: Math.max(0, frames), at: nowMs, running: this.own.running }; }
  get sending(): boolean { return this.sendOn && (this.sendFrom === "thru" ? !!this.incoming(Date.now())?.running : this.own.running); }
}
