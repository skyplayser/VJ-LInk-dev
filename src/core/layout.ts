// Ausgänge: entweder zeigt jeder Bildschirm dasselbe Bild („Gleiches Bild“), oder die Bildschirme liegen
// auf einer gemeinsamen Leinwand und jeder zeigt seinen Ausschnitt („Leinwand“), z. B. zwei Beamer
// nebeneinander oder LED-Wand über Bühnenbeamer.

export type OutputMode = "mirror" | "canvas";

/** Lage eines Bildschirms auf der Leinwand, in Leinwand-Pixeln (Ursprung oben links). */
export interface ScreenRect { id: number; label: string; x: number; y: number; w: number; h: number }

export interface OutputLayout { mode: OutputMode; screens: ScreenRect[] }

export const defaultLayout = (): OutputLayout => ({ mode: "mirror", screens: [] });

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
