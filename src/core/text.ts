// Text-Clips: ein Text-Rahmen (1920 × 1080, durchsichtig) mit Formatierung. Wird als Grafik gerendert und
// ist damit überall nutzbar, wo Grafiken gehen (Clip-Raster, Szenen, SHOW). Die Angaben bleiben im Projekt,
// damit man den Text später bearbeiten kann.

export type TextAlign = "left" | "center" | "right";
export type TextVAlign = "top" | "middle" | "bottom";

export interface TextSpec {
  text: string;
  font: string;
  /** Schriftgröße in Pixeln bei 1080 Zeilen. */
  size: number;
  bold: boolean;
  italic: boolean;
  upper: boolean;
  align: TextAlign;
  valign: TextVAlign;
  /** Zeilenabstand (Faktor der Schriftgröße). */
  lineHeight: number;
  /** Buchstabenabstand in Pixeln. */
  letterSpacing: number;
  color: string;
  outline: { on: boolean; color: string; width: number };
  glow: { on: boolean; color: string; blur: number };
  box: { on: boolean; color: string; opacity: number; padding: number; radius: number };
}

/** Schriften, die auf macOS und Windows meist vorhanden sind (sonst greift der Browser auf eine ähnliche zurück). */
export const TEXT_FONTS: readonly { id: string; label: string; css: string }[] = [
  { id: "system", label: "System (klar)", css: "system-ui, -apple-system, 'Segoe UI', sans-serif" },
  { id: "helvetica", label: "Helvetica / Arial", css: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
  { id: "black", label: "Arial Black (fett)", css: "'Arial Black', 'Helvetica Neue', Arial, sans-serif" },
  { id: "impact", label: "Impact (schmal, laut)", css: "Impact, 'Haettenschweiler', 'Arial Narrow Bold', sans-serif" },
  { id: "futura", label: "Futura / Century Gothic", css: "Futura, 'Century Gothic', 'Avenir Next', sans-serif" },
  { id: "avenir", label: "Avenir / Segoe", css: "'Avenir Next', Avenir, 'Segoe UI', sans-serif" },
  { id: "georgia", label: "Georgia (Serif)", css: "Georgia, 'Times New Roman', serif" },
  { id: "mono", label: "Monospace", css: "Menlo, Consolas, 'Courier New', monospace" },
  { id: "marker", label: "Handschrift", css: "'Marker Felt', 'Segoe Print', 'Comic Sans MS', cursive" },
];
export const fontCss = (id: string): string => (TEXT_FONTS.find(f => f.id === id) ?? TEXT_FONTS[0]!).css;

export const TEXT_W = 1920, TEXT_H = 1080;

export const defaultText = (): TextSpec => ({
  text: "DJ NAME", font: "black", size: 200, bold: true, italic: false, upper: true,
  align: "center", valign: "middle", lineHeight: 1.1, letterSpacing: 4, color: "#ffffff",
  outline: { on: false, color: "#000000", width: 8 },
  glow: { on: true, color: "#ff3b8a", blur: 30 },
  box: { on: false, color: "#000000", opacity: 0.6, padding: 40, radius: 16 },
});

const isColor = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);
const num = (v: unknown, d: number, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const pick = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);
const obj = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null ? v as Record<string, unknown> : {});

/** Text-Angaben aus einer Datei prüfen; null, wenn es keine sind. */
export function parseTextSpec(v: unknown): TextSpec | null {
  if (typeof v !== "object" || v === null) return null;
  const r = v as Record<string, unknown>;
  if (typeof r.text !== "string") return null;
  const d = defaultText(), o = obj(r.outline), g = obj(r.glow), b = obj(r.box);
  return {
    text: r.text.slice(0, 2000),
    font: TEXT_FONTS.some(f => f.id === r.font) ? r.font as string : d.font,
    size: num(r.size, d.size, 10, 900), bold: r.bold === true, italic: r.italic === true, upper: r.upper === true,
    align: pick(r.align, ["left", "center", "right"] as const, "center"),
    valign: pick(r.valign, ["top", "middle", "bottom"] as const, "middle"),
    lineHeight: num(r.lineHeight, d.lineHeight, 0.6, 3), letterSpacing: num(r.letterSpacing, 0, -20, 100),
    color: isColor(r.color) ? r.color : d.color,
    outline: { on: o.on === true, color: isColor(o.color) ? o.color : d.outline.color, width: num(o.width, d.outline.width, 1, 60) },
    glow: { on: g.on === true, color: isColor(g.color) ? g.color : d.glow.color, blur: num(g.blur, d.glow.blur, 1, 120) },
    box: { on: b.on === true, color: isColor(b.color) ? b.color : d.box.color, opacity: num(b.opacity, d.box.opacity, 0, 1),
      padding: num(b.padding, d.box.padding, 0, 300), radius: num(b.radius, d.box.radius, 0, 200) },
  };
}

/** Name für die Bibliothek: erste Zeile, gekürzt. */
export const textName = (s: TextSpec): string => (s.text.split("\n").find(l => l.trim()) ?? "Text").trim().slice(0, 40) || "Text";
