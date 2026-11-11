import { t } from "./i18n";
// Ausgänge: entweder zeigt jeder Bildschirm dasselbe Bild („Gleiches Bild“), oder die Bildschirme liegen
// auf einer gemeinsamen Leinwand und jeder zeigt seinen Ausschnitt („Leinwand“), z. B. zwei Beamer
// nebeneinander oder LED-Wand über Bühnenbeamer.

export type OutputMode = "mirror" | "canvas" | "mapping";

/** Lage eines Bildschirms auf der Leinwand, in Leinwand-Pixeln (Ursprung oben links). */
export interface ScreenRect { id: number; label: string; x: number; y: number; w: number; h: number }

/**
 * Projektionsmapping: eine Leinwand (Fläche) auf einem Ausgang. Die vier Ecken liegen im Bild des Beamers
 * (0–1, oben links = 0/0, Reihenfolge oben links, oben rechts, unten rechts, unten links). Die Leinwand zeigt
 * einen Ausschnitt des Gesamtbilds (src, 0–1), perspektivisch verzerrt. Außerhalb aller Leinwände bleibt es schwarz.
 */
export interface Surface {
  id: string;
  screen: number;
  name: string;
  corners: [number, number][];
  src: { x: number; y: number; w: number; h: number };
  on: boolean;
  /** Welches Bild die Leinwand zeigt („main“ = Bild 1, sonst Bild-ID); dazu `src` als Ausschnitt. */
  image?: string;
  /** Alt (vor den Bildern): „own“ hieß eigene Ebenen unter der Leinwand-ID. */
  content?: "main" | "own";
  /** Raster-Verzerrung: n × n Stützpunkte (3 oder 5), zeilenweise, im Bild des Beamers (0–1). Fehlt = 4 Ecken. */
  grid?: Grid;
}

export interface Grid { n: number; pts: [number, number][] }

/** Maske im Bild eines Beamers (Projektionsmapping): Vieleck, das schwärzt (umgekehrt: nur innen zeigen). */
export interface Mask {
  id: string; screen: number; name: string;
  /** Punkte im Bild des Beamers (0–1, oben links = 0/0), mindestens 3. */
  pts: [number, number][];
  /** true = nur innerhalb zeigen, außen schwarz. */
  invert: boolean;
  /** Weiche Kante in Pixeln des Ausgangs. */
  feather: number;
  on: boolean;
}

export interface OutputLayout { mode: OutputMode; screens: ScreenRect[]; surfaces?: Surface[]; masks?: Mask[]; res?: OutputRes }

// ---- Auflösung des Ausgabebilds ------------------------------------------------------------

/**
 * Auflösung, in der die Visuals gerechnet werden.
 * auto:   so groß wie der jeweilige Ausgang (Standard)
 * pixels: feste Pixelgröße (z. B. 1920 × 1080 für eine LED-Wand oder ein Aufnahmegerät)
 * format: festes Seitenverhältnis (z. B. 9:16), so groß wie in den Ausgang passt
 * `fit` legt fest, wie das Bild auf einen Ausgang mit anderem Seitenverhältnis kommt.
 */
export interface OutputRes { mode: "auto" | "pixels" | "format"; w: number; h: number; aspect: string; fit: ResFit }
export type ResFit = "contain" | "cover" | "stretch";
export const RES_FITS: readonly ResFit[] = ["contain", "cover", "stretch"];
export const defaultRes = (): OutputRes => ({ mode: "auto", w: 1920, h: 1080, aspect: "16:9", fit: "contain" });

/** Seitenverhältnisse zur Auswahl (LED-Bänder 3:1 bis 6:1, Hochformat für Stelen). */
export const ASPECTS = ["16:9", "16:10", "4:3", "5:4", "1:1", "4:5", "9:16", "21:9", "32:9", "3:1", "4:1", "6:1"] as const;
/** Gängige Pixelgrößen. */
export const RES_PRESETS: readonly [number, number][] = [
  [1280, 720], [1920, 1080], [2560, 1440], [3840, 2160], [1080, 1920], [1920, 1200], [1024, 768], [1280, 1024], [1080, 1080], [3840, 1080], [1152, 192],
];
export const MAX_RES = 8192;

/** „16:9“ → 1.777…; ungültig → null. Erlaubt auch Dezimalzahlen („2.35:1“). */
export function parseAspect(a: string): number | null {
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*[:x×/]\s*(\d+(?:[.,]\d+)?)\s*$/.exec(a);
  if (!m) return null;
  const w = Number(m[1]!.replace(",", ".")), h = Number(m[2]!.replace(",", "."));
  const r = w / h;
  return w > 0 && h > 0 && r >= 0.05 && r <= 20 ? r : null;
}

/** Seitenverhältnis des Ausgabebilds, oder null bei „Auto“. */
export function resAspect(r: OutputRes | undefined): number | null {
  if (!r || r.mode === "auto") return null;
  if (r.mode === "pixels") return r.w / r.h;
  return parseAspect(r.aspect);
}

/** Rechengröße des Ausgabebilds für einen Ausgang mit outW × outH Pixeln. */
export function renderSize(r: OutputRes | undefined, outW: number, outH: number): { w: number; h: number } {
  if (!r || r.mode === "auto") return { w: outW, h: outH };
  const lim = (v: number) => Math.max(16, Math.min(MAX_RES, Math.round(v)));
  if (r.mode === "pixels") return { w: lim(r.w), h: lim(r.h) };
  const a = parseAspect(r.aspect);
  if (!a || outW < 1 || outH < 1) return { w: outW, h: outH };
  // Füllen: so groß, dass der Ausgang ganz bedeckt ist; sonst so groß, dass alles hineinpasst
  const wide = outW / outH > a;
  const cover = r.fit === "cover";
  const w = wide === cover ? outW : outH * a, h = wide === cover ? outW / a : outH;
  const k = Math.min(1, MAX_RES / Math.max(w, h));
  return { w: lim(w * k), h: lim(h * k) };
}

/**
 * Wohin ein Bild sw × sh auf einem Ausgang dw × dh kommt: Rechteck (Pixel, Ursprung unten links wie in WebGL)
 * und der sichtbare Ausschnitt des Bilds (0–1).
 */
export function fitRect(sw: number, sh: number, dw: number, dh: number, fit: ResFit):
  { x: number; y: number; w: number; h: number; region: [number, number, number, number] } {
  if (fit === "stretch" || sw < 1 || sh < 1) return { x: 0, y: 0, w: dw, h: dh, region: [0, 0, 1, 1] };
  if (fit === "cover") {
    const s = Math.max(dw / sw, dh / sh);
    const fw = Math.min(1, dw / (sw * s)), fh = Math.min(1, dh / (sh * s));
    return { x: 0, y: 0, w: dw, h: dh, region: [(1 - fw) / 2, (1 - fh) / 2, fw, fh] };
  }
  const s = Math.min(dw / sw, dh / sh);
  const w = Math.max(1, Math.round(sw * s)), h = Math.max(1, Math.round(sh * s));
  return { x: Math.floor((dw - w) / 2), y: Math.floor((dh - h) / 2), w, h, region: [0, 0, 1, 1] };
}

/** Kurzbeschreibung für die Oberfläche, z. B. „Auto“, „1920 × 1080“, „9:16“. */
export function resLabel(r: OutputRes | undefined): string {
  if (!r || r.mode === "auto") return t("Auto");
  return r.mode === "pixels" ? `${r.w} × ${r.h}` : r.aspect;
}

export const defaultLayout = (): OutputLayout => ({ mode: "mirror", screens: [], surfaces: [] });

/** Neue Leinwand: Rechteck mit etwas Rand, zeigt das ganze Bild. */
export function newSurface(screen: number, n: number, inset = 0.1): Surface {
  const a = inset, b = 1 - inset;
  return { id: `s${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`, screen, name: t("Leinwand {n}", { n }),
    corners: [[a, a], [b, a], [b, b], [a, b]], src: { x: 0, y: 0, w: 1, h: 1 }, on: true, image: "main" };
}

// ---- Perspektive: Einheitsquadrat → Viereck (Heckbert) ----------------------------------------

/** 3×3-Matrix (zeilenweise), die (u, v) aus dem Einheitsquadrat auf das Viereck abbildet. */
export function squareToQuad(c: readonly (readonly [number, number])[]): number[] {
  const [x0, y0] = c[0]!, [x1, y1] = c[1]!, [x2, y2] = c[2]!, [x3, y3] = c[3]!;
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  let g = 0, h = 0;
  if (Math.abs(dx3) > 1e-12 || Math.abs(dy3) > 1e-12) {
    const det = dx1 * dy2 - dx2 * dy1;
    if (Math.abs(det) > 1e-12) { g = (dx3 * dy2 - dx2 * dy3) / det; h = (dx1 * dy3 - dx3 * dy1) / det; }
  }
  return [x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h, 1];
}

/** Inverse einer 3×3-Matrix (zeilenweise); null, wenn nicht umkehrbar (Viereck zusammengefallen). */
export function invert3(m: readonly number[]): number[] | null {
  const [a, b, c, d, e, f, g, h, i] = m as [number, number, number, number, number, number, number, number, number];
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return null;
  return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det,
    B / det, (a * i - c * g) / det, -(a * f - c * d) / det,
    C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
}

/** Punkt mit einer Matrix (zeilenweise) abbilden. */
export function applyH(m: readonly number[], x: number, y: number): [number, number] {
  const w = m[6]! * x + m[7]! * y + m[8]!;
  return [(m[0]! * x + m[1]! * y + m[2]!) / w, (m[3]! * x + m[4]! * y + m[5]!) / w];
}

/** Für den Shader: Inverse (Bildpunkt → Leinwand-Koordinate) spaltenweise, dazu der Ausschnitt. */
export interface Warp {
  hinv: number[]; src: [number, number, number, number];
  /** Leinwand mit eigenen Ebenen: ihr Stapel. */ stack?: string;
  /** Raster-Verzerrung: Dreiecke (x, y, u, v; oben links = 0/0), statt der Perspektive. */ mesh?: Float32Array;
}

/** Leinwände dieses Ausgangs (nur im Mapping-Modus), sonst null. */
export function warpFor(layout: OutputLayout | undefined, screen: number): Warp[] | null {
  if (!layout || layout.mode !== "mapping") return null;
  const out: Warp[] = [];
  for (const s of layout.surfaces ?? []) {
    if (s.screen !== screen || !s.on || s.corners.length !== 4) continue;
    const inv = invert3(squareToQuad(s.corners));
    if (!inv) continue;
    // spaltenweise für uniformMatrix3fv
    out.push({ hinv: [inv[0]!, inv[3]!, inv[6]!, inv[1]!, inv[4]!, inv[7]!, inv[2]!, inv[5]!, inv[8]!], src: [s.src.x, s.src.y, s.src.w, s.src.h],
      ...(s.image && s.image !== "main" ? { stack: s.image } : {}),
      ...(s.grid && s.grid.pts.length === s.grid.n * s.grid.n ? { mesh: cachedMesh(s.grid) } : {}) });
  }
  return out;
}

/** Ecke an Bildrand und Ecken anderer Leinwände einrasten (tol in 0–1). */
export function snapCorner(p: [number, number], others: readonly [number, number][], tol: number): [number, number] {
  const snap = (v: number, cands: number[]) => { let best = v, d = tol; for (const c of cands) if (Math.abs(v - c) <= d) { d = Math.abs(v - c); best = c; } return best; };
  return [snap(p[0], [0, 1, ...others.map(o => o[0])]), snap(p[1], [0, 1, ...others.map(o => o[1])])];
}

/** Größe der Leinwand: umschließt alle offenen Bildschirme. */
export function canvasBounds(screens: readonly ScreenRect[]): { x: number; y: number; w: number; h: number } {
  if (!screens.length) return { x: 0, y: 0, w: 1920, h: 1080 };
  const x0 = Math.min(...screens.map(s => s.x)), y0 = Math.min(...screens.map(s => s.y));
  const x1 = Math.max(...screens.map(s => s.x + s.w)), y1 = Math.max(...screens.map(s => s.y + s.h));
  return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
}

/** Ausschnitt eines Bildschirms relativ zur Leinwand. */
export interface View { cw: number; ch: number; x: number; y: number; w: number; h: number }

export function viewFor(layout: OutputLayout | undefined, openIds: readonly number[], id: number): View | null {
  if (!layout || layout.mode !== "canvas") return null;
  const open = layout.screens.filter(s => openIds.includes(s.id));
  const me = open.find(s => s.id === id);
  if (!me) return null;
  const b = canvasBounds(open);
  return { cw: b.w, ch: b.h, x: me.x - b.x, y: me.y - b.y, w: me.w, h: me.h };
}

/** Jeden offenen Bildschirm auf die Leinwand bringen; neue kommen rechts daneben. */
export function syncScreens(layout: OutputLayout, open: readonly { id: number; label: string; w: number; h: number }[]): OutputLayout {
  const screens = [...layout.screens];
  for (const d of open) {
    const s = screens.find(x => x.id === d.id);
    if (s) { s.label = d.label; continue; }
    const others = screens.filter(x => open.some(o => o.id === x.id));
    const b = others.length ? canvasBounds(others) : { x: 0, y: 0, w: 0, h: 0 };
    screens.push({ id: d.id, label: d.label, x: b.x + b.w, y: b.y, w: d.w, h: d.h });
  }
  return { ...layout, screens };
}

/** Automatisch anordnen: nebeneinander oder untereinander, bündig ab 0/0. */
export function arrange(screens: readonly ScreenRect[], dir: "row" | "column"): ScreenRect[] {
  let pos = 0;
  return screens.map(s => {
    const r = dir === "row" ? { ...s, x: pos, y: 0 } : { ...s, x: 0, y: pos };
    pos += dir === "row" ? s.w : s.h;
    return r;
  });
}

/** Beim Ziehen an Kanten der anderen Bildschirme (und an 0) einrasten. */
export function snapRect(r: ScreenRect, others: readonly ScreenRect[], tol: number): ScreenRect {
  const xs = [0, ...others.flatMap(o => [o.x, o.x + o.w])];
  const ys = [0, ...others.flatMap(o => [o.y, o.y + o.h])];
  const pick = (v: number, len: number, cands: number[]) => {
    let best = v, d = tol + 1;
    for (const c of cands) {
      for (const [cand, off] of [[c, 0], [c - len, len]] as const) {
        const dd = Math.abs(v - cand);
        if (dd < d) { d = dd; best = cand; void off; }
      }
    }
    return d <= tol ? best : Math.round(v);
  };
  return { ...r, x: pick(r.x, r.w, xs), y: pick(r.y, r.h, ys) };
}

// ---- Raster-Verzerrung (3×3 / 5×5 Stützpunkte, weich interpoliert) -----------------------------

/** Raster aus der Perspektive der vier Ecken (Umschalten ohne Sprung). */
export function gridFromCorners(corners: readonly (readonly [number, number])[], n: number): Grid {
  const H = squareToQuad(corners);
  const pts: [number, number][] = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) pts.push(applyH(H, i / (n - 1), j / (n - 1)));
  return { n, pts };
}

/** Vier Ecken eines Rasters (oben links, oben rechts, unten rechts, unten links). */
export function gridCorners(g: Grid): [number, number][] {
  const n = g.n, p = g.pts;
  return [[...p[0]!], [...p[n - 1]!], [...p[n * n - 1]!], [...p[n * (n - 1)]!]] as [number, number][];
}

const cr = (a: number, b: number, c: number, d: number, t: number) =>
  0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);

/** Stützpunkt (i, j); außerhalb des Rasters gerade weitergeführt, damit die Ränder nicht abknicken. */
function gp(g: Grid, i: number, j: number): [number, number] {
  const n = g.n, at = (x: number, y: number) => g.pts[y * n + x]!;
  const ci = Math.max(0, Math.min(n - 1, i)), cj = Math.max(0, Math.min(n - 1, j));
  let p = at(ci, cj);
  if (i < 0) { const q = at(1, cj); p = [2 * p[0] - q[0], 2 * p[1] - q[1]]; }
  if (i > n - 1) { const q = at(n - 2, cj); p = [2 * p[0] - q[0], 2 * p[1] - q[1]]; }
  if (j < 0) { const q = at(ci, 1); p = [2 * p[0] - q[0], 2 * p[1] - q[1]]; }
  if (j > n - 1) { const q = at(ci, n - 2); p = [2 * p[0] - q[0], 2 * p[1] - q[1]]; }
  return p;
}

/** Punkt der weichen Fläche an (u, v) ∈ [0, 1]² (Catmull-Rom durch alle Stützpunkte). */
export function gridPoint(g: Grid, u: number, v: number): [number, number] {
  const n = g.n, x = Math.max(0, Math.min(1, u)) * (n - 1), y = Math.max(0, Math.min(1, v)) * (n - 1);
  const i = Math.min(n - 2, Math.floor(x)), j = Math.min(n - 2, Math.floor(y)), tu = x - i, tv = y - j;
  const row = (jj: number): [number, number] => {
    const a = gp(g, i - 1, jj), b = gp(g, i, jj), c = gp(g, i + 1, jj), d = gp(g, i + 2, jj);
    return [cr(a[0], b[0], c[0], d[0], tu), cr(a[1], b[1], c[1], d[1], tu)];
  };
  const r0 = row(j - 1), r1 = row(j), r2 = row(j + 1), r3 = row(j + 2);
  return [cr(r0[0], r1[0], r2[0], r3[0], tv), cr(r0[1], r1[1], r2[1], r3[1], tv)];
}

/** Dreiecksnetz der Fläche: je Dreieckspunkt x, y (Bild des Beamers) und u, v (Inhalt), oben links = 0/0. */
export function meshTriangles(g: Grid, steps = 32): Float32Array {
  const m = steps + 1, P: [number, number][] = [];
  for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) P.push(gridPoint(g, i / steps, j / steps));
  const out = new Float32Array(steps * steps * 6 * 4);
  let k = 0;
  const put = (i: number, j: number) => { const p = P[j * m + i]!; out[k++] = p[0]; out[k++] = p[1]; out[k++] = i / steps; out[k++] = j / steps; };
  for (let j = 0; j < steps; j++) for (let i = 0; i < steps; i++) {
    put(i, j); put(i + 1, j); put(i + 1, j + 1);
    put(i, j); put(i + 1, j + 1); put(i, j + 1);
  }
  return out;
}

const meshCache = new Map<string, Float32Array>();
function cachedMesh(g: Grid): Float32Array {
  const key = `${g.n}:${g.pts.map(p => `${p[0].toFixed(5)},${p[1].toFixed(5)}`).join(";")}`;
  let m = meshCache.get(key);
  if (!m) { m = meshTriangles(g); if (meshCache.size > 64) meshCache.clear(); meshCache.set(key, m); }
  return m;
}

// ---- Masken ---------------------------------------------------------------------------------

export const MAX_MASK_POINTS = 32;

/** Neue Maske: Rechteck in der Mitte. */
export function newMask(screen: number, n: number): Mask {
  return { id: `m${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`, screen, name: t("Maske {n}", { n }),
    pts: [[0.4, 0.4], [0.6, 0.4], [0.6, 0.6], [0.4, 0.6]], invert: false, feather: 0, on: true };
}

/** Masken dieses Ausgangs (nur im Mapping-Modus). */
export function masksFor(layout: OutputLayout | undefined, screen: number): Mask[] {
  if (!layout || layout.mode !== "mapping") return [];
  return (layout.masks ?? []).filter(m => m.screen === screen && m.on && m.pts.length >= 3);
}

/** Punkt in einer Maske? (gerade/ungerade Regel, wie im Shader) */
export function inMask(pts: readonly (readonly [number, number])[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i]!, [xj, yj] = pts[j]!;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
