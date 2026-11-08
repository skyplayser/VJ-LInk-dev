// Videos: als Clip in den Visuals (loopt, auch im Takt) und als Cue im SHOW-Ablauf.
// Alles hier ist reine Rechnung, damit jedes Fenster (Vorschau, Ausgänge) dieselbe Stelle zeigt.

export const VIDEO_EXTENSIONS = ["mp4", "m4v", "mov", "webm"] as const;
export const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm", "video/x-m4v"] as const;

export interface VideoItem {
  id: string;
  name: string;
  /** Dateiendung (mp4, mov …), für die Adresse vjmedia://video/<id>.<ext>. */
  ext: string;
  /** Sekunden; 0, solange noch nicht gemessen. */
  duration: number;
  width: number;
  height: number;
}

export const videoClip = (id: string): string => `vid:${id}`;
export const isVideoClip = (clip: string | null | undefined): clip is string => !!clip && clip.startsWith("vid:");
export const videoIdOf = (clip: string): string => clip.slice(4);

export type Fit = "fill" | "fit" | "original";
export const FITS: readonly Fit[] = ["fill", "fit", "original"];

/** Einstellungen eines Videos als Clip in einer Ebene. */
export interface VideoSettings {
  /** Loop-Bereich in Sekunden; loopOut 0 = bis zum Ende. */
  loopIn: number;
  loopOut: number;
  /** 0 = normale Geschwindigkeit, sonst wird der Loop auf so viele Beats gedehnt. */
  beats: number;
  fit: Fit;
  /** Ton der Datei abspielen (nur im Hauptfenster). */
  sound: boolean;
}
export const TAKT_BEATS = [0, 4, 8, 16, 32] as const;
export const defaultVideo = (): VideoSettings => ({ loopIn: 0, loopOut: 0, beats: 0, fit: "fill", sound: false });

/** Wann der Clip in der Ebene gestartet wurde (für alle Fenster gleich). */
export interface PlayStart { clip: string | null; ms: number; beat: number }

const clampNum = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** Loop-Grenzen innerhalb der Datei. */
export function loopRange(v: { loopIn: number; loopOut: number }, duration: number): [number, number] {
  const d = duration > 0 ? duration : 1e9;
  const a = clampNum(v.loopIn, 0, d);
  const b = v.loopOut > 0 ? clampNum(v.loopOut, a + 0.05, d) : d;
  return [a, Math.max(a + 0.05, b)];
}

/**
 * Stelle (Sekunden) und Geschwindigkeit eines Clip-Videos.
 * Im Takt: Der Loop-Bereich dauert genau `beats` Beats und beginnt auf dem Beat, an dem der Clip startete.
 */
export function clipVideoTime(v: VideoSettings, start: PlayStart, duration: number, beat: number, nowMs: number, bpm: number): { t: number; rate: number } {
  const [a, b] = loopRange(v, duration);
  const len = b - a;
  if (v.beats > 0 && bpm > 0) {
    const ph = (beat - start.beat) / v.beats;
    const f = ph - Math.floor(ph);
    return { t: a + f * len, rate: len / ((v.beats * 60) / bpm) };
  }
  const el = Math.max(0, (nowMs - start.ms) / 1000);
  return { t: a + (el % len), rate: 1 };
}

// ---- SHOW-Ablauf ---------------------------------------------------------------------

export type CueKind = "video" | "image" | "black" | "scene";
export type CueStart = "manual" | "after" | "with";
export type CueEnd = "hold" | "fade" | "next";
export type CueLoop = "off" | "count" | "untilGo" | "forever";
export type CueOver = "replace" | "over";

export interface Cue {
  id: string;
  name: string;
  kind: CueKind;
  /** Clip-ID der Datei: vid:… oder img:… */
  media: string | null;
  /** Für VJ-Szenen: Nummer 1… */
  scene: number;
  start: CueStart;
  /** Wartezeit nach dem Auslösen, Sekunden. */
  wait: number;
  /** Kürzen: Start und Ende in der Datei (Ende 0 = bis zum Schluss). */
  trimIn: number;
  trimOut: number;
  loop: CueLoop;
  loopCount: number;
  /** Nur diesen Bereich wiederholen (sonst den gekürzten ganzen Film). */
  loopRange: boolean;
  loopIn: number;
  loopOut: number;
  end: CueEnd;
  fadeIn: number;
  fadeOut: number;
  /** Standzeit für Bild und Schwarz in Sekunden, 0 = bis WEITER. */
  hold: number;
  /** 0–1 */
  volume: number;
  fit: Fit;
  over: CueOver;
}

export function newCue(kind: CueKind, name: string, media: string | null = null, id = newCueId()): Cue {
  return {
    id, name, kind, media, scene: 1, start: "manual", wait: 0,
    trimIn: 0, trimOut: 0, loop: kind === "video" ? "off" : "off", loopCount: 2, loopRange: false, loopIn: 0, loopOut: 0,
    end: kind === "video" ? "hold" : "hold", fadeIn: 0.5, fadeOut: 1, hold: 0, volume: 1, fit: "fill", over: "replace",
  };
}
export function newCueId(): string { return "c" + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3); }

export interface ActiveCue {
  cueId: string;
  /** Wann der Cue sichtbar wird (Auslösen + Wartezeit). */
  startMs: number;
  /** „bis WEITER“: Zeitpunkt, an dem WEITER den Loop beendet hat. */
  releasedMs: number | null;
  /** Ausblenden läuft seit … (ms) über … (s). */
  fadeOutMs: number | null;
  fadeOutDur: number;
  /** Ende schon behandelt (weiter / ausblenden). */
  endHandled: boolean;
  /** Szene schon abgerufen. */
  fired: boolean;
}

export interface CueRun { active: ActiveCue[]; next: number; current: number }
export interface CueState { list: Cue[]; run: CueRun }
export const newCueState = (): CueState => ({ list: [], run: { active: [], next: 0, current: -1 } });

/** Was ein Fenster zeichnen muss: Datei, Stelle, Deckkraft. */
export interface CueRender {
  key: string;
  kind: "video" | "image" | "black";
  media: string | null;
  t: number;
  rate: number;
  atMs: number;
  opacity: number;
  fit: Fit;
  over: CueOver;
  volume: number;
}

/** Länge des gekürzten Films. */
function trimmed(c: Cue, duration: number): [number, number] {
  const d = duration > 0 ? duration : 1e9;
  const a = clampNum(c.trimIn, 0, d);
  const b = c.trimOut > 0 ? clampNum(c.trimOut, a + 0.05, d) : d;
  return [a, Math.max(a + 0.05, b)];
}

/**
 * Stelle im Video und ob der Cue zu Ende ist.
 * Loop „bis WEITER“: wiederholt bis zum Loslassen, spielt dann bis zum Ende.
 */
export function cueTime(c: Cue, ac: ActiveCue, nowMs: number, duration: number): { t: number; ended: boolean; looping: boolean; endMs: number | null } {
  const el = (nowMs - ac.startMs) / 1000;
  if (c.kind !== "video") {
    const ended = c.hold > 0 && el >= c.hold;
    return { t: 0, ended, looping: false, endMs: c.hold > 0 ? ac.startMs + c.hold * 1000 : null };
  }
  const [a, b] = trimmed(c, duration);
  const la = c.loopRange ? clampNum(c.loopIn || a, a, b - 0.05) : a;
  const lb = c.loopRange ? clampNum(c.loopOut || b, la + 0.05, b) : b;
  const span = lb - la, intro = lb - a;
  const linear = (x: number) => ({ t: Math.min(b, a + x), ended: a + x >= b, looping: false, endMs: ac.startMs + (b - a) * 1000 });
  if (el < 0) return { t: a, ended: false, looping: false, endMs: null };
  switch (c.loop) {
    case "off": return linear(el);
    case "forever": {
      const t = el < intro ? a + el : la + ((el - intro) % span);
      return { t, ended: false, looping: el >= intro, endMs: null };
    }
    case "count": {
      const n = Math.max(1, Math.round(c.loopCount));
      const loopsTotal = intro + (n - 1) * span;
      if (el < loopsTotal) {
        const t = el < intro ? a + el : la + ((el - intro) % span);
        return { t, ended: false, looping: el >= intro, endMs: ac.startMs + (loopsTotal + (b - lb)) * 1000 };
      }
      const t = lb + (el - loopsTotal);
      return { t: Math.min(b, t), ended: t >= b, looping: false, endMs: ac.startMs + (loopsTotal + (b - lb)) * 1000 };
    }
    case "untilGo": {
      const posAt = (x: number) => (x < intro ? a + x : la + ((x - intro) % span));
      if (ac.releasedMs === null) {
        return { t: posAt(el), ended: false, looping: el >= intro, endMs: null };
      }
      const rel = Math.max(0, (ac.releasedMs - ac.startMs) / 1000);
      const t0 = posAt(rel);
      const t = t0 + (el - rel);
      return { t: Math.min(b, t), ended: t >= b, looping: false, endMs: ac.releasedMs + (b - t0) * 1000 };
    }
  }
}

/** Deckkraft aus Einblenden und Ausblenden. */
export function cueOpacity(c: Cue, ac: ActiveCue, nowMs: number): number {
  const el = (nowMs - ac.startMs) / 1000;
  if (el < 0) return 0;
  let o = c.fadeIn > 0 ? Math.min(1, el / c.fadeIn) : 1;
  if (ac.fadeOutMs !== null) {
    const f = ac.fadeOutDur > 0 ? (nowMs - ac.fadeOutMs) / 1000 / ac.fadeOutDur : 1;
    o *= Math.max(0, 1 - f);
  }
  return o;
}

export interface CueEnv {
  /** Länge eines Videos (Sekunden) aus der Bibliothek. */
  duration(media: string | null): number;
  /** VJ-Szene abrufen (Index 0…). */
  recallScene(index: number): void;
}

const byId = (s: CueState, id: string) => s.list.find(c => c.id === id);

/** Cue Nr. `index` starten, plus alle direkt folgenden „mit vorigem“. Gibt den nächsten Index zurück. */
function startAt(s: CueState, index: number, nowMs: number): void {
  const first = s.list[index];
  if (!first) return;
  // Neuer Programmpunkt: Bisheriges blendet über die Einblendzeit des neuen aus
  const xf = Math.max(0.05, first.fadeIn);
  for (const ac of s.run.active) if (ac.fadeOutMs === null) { ac.fadeOutMs = nowMs; ac.fadeOutDur = xf; }
  let i = index;
  do {
    const c = s.list[i]!;
    s.run.active.push({ cueId: c.id, startMs: nowMs + Math.max(0, c.wait) * 1000, releasedMs: null, fadeOutMs: null, fadeOutDur: 0, endHandled: false, fired: false });
    i++;
  } while (s.list[i] && s.list[i]!.start === "with");
  s.run.current = index;
  s.run.next = i;
}

/** Hauptcue (der zuletzt mit WEITER/automatisch gestartete). */
function currentActive(s: CueState): ActiveCue | undefined {
  const cur = s.list[s.run.current];
  return cur ? s.run.active.find(a => a.cueId === cur.id && a.fadeOutMs === null) : undefined;
}

/**
 * WEITER: Hängt der aktuelle Cue in „bis WEITER“, wird erst der Loop beendet.
 * Sonst startet der nächste Cue. Gibt zurück, was passiert ist.
 */
export function cueGo(s: CueState, nowMs: number, env: CueEnv): "released" | "started" | "end" {
  const cur = s.list[s.run.current], ac = currentActive(s);
  if (cur && ac && cur.loop === "untilGo" && ac.releasedMs === null) {
    const tm = cueTime(cur, ac, nowMs, env.duration(cur.media));
    if (tm.looping) { ac.releasedMs = nowMs; return "released"; }
  }
  if (s.run.next >= s.list.length) return "end";
  startAt(s, s.run.next, nowMs);
  return "started";
}

/** Text für den WEITER-Knopf. */
export function goLabel(s: CueState, nowMs: number, env: CueEnv): string {
  const cur = s.list[s.run.current], ac = currentActive(s);
  if (cur && ac && cur.loop === "untilGo" && ac.releasedMs === null && cueTime(cur, ac, nowMs, env.duration(cur.media)).looping)
    return `beendet den Loop von „${cur.name}“`;
  const n = s.list[s.run.next];
  return n ? `startet Cue ${s.run.next + 1} „${n.name}“` : "Ende des Ablaufs";
}

/** Zurück: der nächste Cue rückt eins nach oben (laufende Cues bleiben). */
export function cueBack(s: CueState): void { s.run.next = Math.max(0, s.run.next - 1); }

/** Alles ausblenden (Standard 1 s). Der Ablauf bleibt beim nächsten Cue stehen. */
export function cueStopAll(s: CueState, nowMs: number, fade = 1): void {
  for (const ac of s.run.active) if (ac.fadeOutMs === null) { ac.fadeOutMs = nowMs; ac.fadeOutDur = fade; }
}

/** Einen bestimmten Cue als nächsten setzen (z. B. per Klick in der Liste). */
export function cueSetNext(s: CueState, index: number): void { s.run.next = Math.max(0, Math.min(s.list.length, index)); }

/** Einmal pro Bild: Enden behandeln, Szenen abrufen, „nach vorigem“ starten, Ausgeblendetes entfernen. */
export function cueTick(s: CueState, nowMs: number, env: CueEnv): void {
  for (const ac of [...s.run.active]) {
    const c = byId(s, ac.cueId);
    if (!c) { s.run.active = s.run.active.filter(x => x !== ac); continue; }
    if (c.kind === "scene") {
      if (!ac.fired && nowMs >= ac.startMs) { ac.fired = true; env.recallScene(c.scene - 1); }
      if (ac.fired) { ac.endHandled = true; ac.fadeOutMs ??= nowMs; ac.fadeOutDur = 0; }
    } else if (!ac.endHandled && nowMs >= ac.startMs) {
      const tm = cueTime(c, ac, nowMs, env.duration(c.media));
      if (tm.ended) {
        ac.endHandled = true;
        const isCurrent = s.list[s.run.current]?.id === c.id;
        if (c.end === "fade" && ac.fadeOutMs === null) { ac.fadeOutMs = nowMs; ac.fadeOutDur = Math.max(0.05, c.fadeOut); }
        if (isCurrent && (c.end === "next" || s.list[s.run.next]?.start === "after")) startAt(s, s.run.next, nowMs);
      }
    }
  }
  s.run.active = s.run.active.filter(ac => {
    if (ac.fadeOutMs === null) return true;
    return nowMs - ac.fadeOutMs < ac.fadeOutDur * 1000 + 50;
  });
}

/** Liste der zu zeichnenden Cues (Reihenfolge = Zeichenreihenfolge). */
export function cueRenders(s: CueState, nowMs: number, env: CueEnv): CueRender[] {
  const out: CueRender[] = [];
  for (const ac of s.run.active) {
    const c = byId(s, ac.cueId);
    if (!c || c.kind === "scene" || nowMs < ac.startMs) continue;
    const opacity = cueOpacity(c, ac, nowMs);
    if (opacity <= 0.001) continue;
    const tm = cueTime(c, ac, nowMs, env.duration(c.media));
    const held = c.kind === "video" && tm.ended;
    out.push({
      key: ac.cueId + ":" + ac.startMs, kind: c.kind, media: c.media, t: tm.t, rate: held || c.kind !== "video" ? 0 : 1, atMs: nowMs,
      opacity, fit: c.fit, over: c.over, volume: c.volume,
    });
  }
  return out;
}

/** Status eines Cues für die Liste. */
export function cueStatus(s: CueState, c: Cue, nowMs: number, env: CueEnv): { live: boolean; remaining: number | null; progress: number } {
  const ac = s.run.active.find(a => a.cueId === c.id && a.fadeOutMs === null);
  if (!ac || nowMs < ac.startMs) return { live: false, remaining: null, progress: 0 };
  const tm = cueTime(c, ac, nowMs, env.duration(c.media));
  if (tm.endMs === null) return { live: true, remaining: null, progress: tm.looping ? 1 : 0 };
  const total = (tm.endMs - ac.startMs) / 1000;
  const rem = Math.max(0, (tm.endMs - nowMs) / 1000);
  return { live: true, remaining: rem, progress: total > 0 ? 1 - rem / total : 1 };
}
