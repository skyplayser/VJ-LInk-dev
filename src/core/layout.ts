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
  /** Inhalt: Hauptbild (ganz oder Ausschnitt) oder eigene Ebenen (im Tab VISUALS bearbeiten). */
  content?: "main" | "own";
}

export interface OutputLayout { mode: OutputMode; screens: ScreenRect[]; surfaces?: Surface[] }

export const defaultLayout = (): OutputLayout => ({ mode: "mirror", screens: [], surfaces: [] });

/** Neue Leinwand: Rechteck mit etwas Rand, zeigt das ganze Bild. */
export function newSurface(screen: number, n: number, inset = 0.1): Surface {
  const a = inset, b = 1 - inset;
  return { id: `s${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`, screen, name: `Leinwand ${n}`,
    corners: [[a, a], [b, a], [b, b], [a, b]], src: { x: 0, y: 0, w: 1, h: 1 }, on: true, content: "main" };
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
export interface Warp { hinv: number[]; src: [number, number, number, number]; /** Leinwand mit eigenen Ebenen: ihr Stapel. */ stack?: string }

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
      ...(s.content === "own" ? { stack: s.id } : {}) });
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
