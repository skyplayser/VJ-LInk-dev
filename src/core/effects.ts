// Katalog der Visuals. `status: "ready"` heißt: die Engine hat dafür einen Generator.
export type EffectCategory = "audio" | "geometry" | "particles" | "retro" | "optical" | "laser" | "lj" | "tools";
export type EffectKind = "generator" | "post" | "master";
export type EffectStatus = "ready" | "planned";

export interface EffectDef {
  /** Nummer im Katalog (1–35 aus der Wunschliste, ab 36 Laser). */
  no: number;
  id: string;
  name: string;
  category: EffectCategory;
  kind: EffectKind;
  status: EffectStatus;
  /** Kurzbeschreibung für die Bibliothek. */
  info: string;
  /** Reaktion auf Audio/Takt, für die Anzeige in der Bibliothek. */
  reactsTo: ("beat" | "bass" | "mid" | "high" | "wave")[];
}

const e = (no: number, id: string, name: string, category: EffectCategory, kind: EffectKind,
  status: EffectStatus, info: string, reactsTo: EffectDef["reactsTo"] = []): EffectDef =>
  ({ no, id, name, category, kind, status, info, reactsTo });

export const EFFECTS: readonly EffectDef[] = [
  // Audio-reaktiv und Equalizer
  e(1, "bar-spectrum", "Balken-Spektrum", "audio", "generator", "ready", "Pegelbalken je Frequenzband, grün bis rot.", ["bass", "mid", "high"]),
  e(2, "radial-eq", "Kreis-Equalizer", "audio", "generator", "ready", "Frequenz-Ring mit Strahlen nach außen.", ["bass", "mid", "high"]),
  e(3, "oscilloscope", "Oszilloskop", "audio", "generator", "ready", "Audiosignal als Neon-Linie.", ["wave"]),
  e(4, "lissajous", "Lissajous-Figuren", "audio", "generator", "ready", "X/Y-Schleifen aus dem Signal.", ["wave"]),
  e(5, "vu-meter", "VU-Meter", "audio", "generator", "ready", "Zeigerinstrument oder LED-Kette mit Peak-Hold.", ["bass"]),
  e(6, "dot-matrix", "Punkt-Matrix", "audio", "generator", "ready", "Rasterpunkte, Höhe nach Frequenz.", ["bass", "mid", "high"]),
  e(7, "pulse-rings", "Pulsierende Ringe", "audio", "generator", "ready", "Kreise, die mit der Bassdrum nach außen laufen.", ["beat", "bass"]),
  // Geometrie und Tunnel
  e(8, "tunnel", "Tunnel", "geometry", "generator", "ready", "Endloser Blick in einen Zylinder aus Ringen.", ["beat"]),
  e(9, "synth-grid", "Synthwave-Raster", "geometry", "generator", "ready", "Rollendes 3D-Bodenraster im 80er-Stil.", ["beat"]),
  e(10, "plexus", "Wireframe-Plexus", "geometry", "generator", "ready", "Vernetzte 3D-Punkte, die sich verformen."),
  e(11, "hypercube", "Würfel / Tesserakt", "geometry", "generator", "ready", "Ineinander verdrehte Körper."),
  e(12, "vector-gobos", "Vektor-Gobos", "geometry", "generator", "ready", "Kreuze, Dreiecke, Hexagone im Takt skaliert.", ["beat"]),
  e(13, "kaleidoscope", "Kaleidoskop", "geometry", "post", "ready", "Spiegelungen, die zu radialen Mustern werden."),
  // Partikel und Natur
  e(14, "starfield", "Sternenfeld", "particles", "generator", "ready", "Sterne fliegen auf dich zu, Hyperdrive bei Beat.", ["beat"]),
  e(15, "bokeh", "Staub und Bokeh", "particles", "generator", "ready", "Weiche, langsam schwebende Lichtpunkte."),
  e(16, "burst", "Partikel-Explosion", "particles", "generator", "ready", "Auf den Beat getriggerter Burst.", ["beat"]),
  e(17, "plasma", "Plasma", "particles", "generator", "ready", "Fließende psychedelische Farbströme.", ["bass"]),
  e(18, "lightning", "Blitz", "particles", "generator", "ready", "Elektrische Entladungen zwischen zwei Punkten.", ["beat"]),
  e(19, "ripples", "Wellen / Wasser", "particles", "generator", "ready", "Wellenlandschaft, die auf Frequenzen schwingt.", ["bass"]),
  e(20, "fire", "Feuer", "particles", "generator", "ready", "Flammen und Rauch.", ["bass"]),
  // Retro und Analog
  e(21, "feedback", "Video-Feedback", "retro", "post", "ready", "Unendlicher Spiegel mit Korridoren."),
  e(22, "liquid-light", "Liquid Light", "retro", "generator", "ready", "Öl-Wasser-Mischung wie vom Tageslichtprojektor."),
  e(23, "glitch", "Glitch und Rauschen", "retro", "post", "ready", "VHS-Fehler, Scanlines, Schnee.", ["beat"]),
  e(24, "crt", "CRT und Pixel", "retro", "post", "ready", "Röhrenmonitor-Look oder grobe Pixel."),
  e(25, "ascii", "ASCII-Video", "retro", "post", "ready", "Bild als Buchstabenraster."),
  e(26, "strobe-zoom", "Strobe-Zoom", "retro", "post", "ready", "Schnelles Ein- und Auszoomen im Takt.", ["beat"]),
  // Optische Raumeffekte
  e(27, "mirror-ball", "Spiegelkugel", "optical", "generator", "ready", "Tausende drehende Lichtpunkte im Raum."),
  e(28, "uv-glow", "UV / Schwarzlicht", "optical", "generator", "ready", "Fluoreszierende Muster auf Schwarz."),
  e(29, "laser-sheet", "Laser-Fläche", "laser", "generator", "ready", "Gerade Linie über die ganze Breite, pulsiert im Takt: im Nebel eine Lichtdecke. Höhe einstellbar (vorgegeben oberes Drittel).", ["beat"]),
  e(30, "laser-fans", "Laser-Fächer", "optical", "generator", "ready", "Grüne oder RGB-Fächer (Ansicht für Leinwand und LED-Wand).", ["beat"]),
  e(31, "strobe-flash", "Strobe / Blinder", "optical", "master", "ready", "Weiße oder farbige Blitze, taktgebunden (Master- und Ebenen-Strobe).", ["beat"]),
  e(32, "moire", "Moiré-Strahlen", "optical", "generator", "ready", "Überlagerte Reflexionen mit Moiré-Mustern."),
  e(33, "flower", "Blumen-Strahlen", "optical", "generator", "ready", "Gegenläufig drehende Strahlenkränze.", ["beat"]),
  e(34, "co2-jet", "CO2-Stoß", "optical", "generator", "ready", "Weiße Vertikal-Stöße, die sofort verfliegen.", ["beat"]),
  e(35, "silhouette", "Silhouette", "optical", "post", "ready", "Kamera-Clip → Darstellung „Silhouette“: Personen als Umriss vor den Visuals (Gegenlicht oder gemerkter Hintergrund)."),
  // Laser: Beamer als Showlaser in Nebel/Hazer. Ein Punkt im Bild wird ein Strahl, eine Linie eine Lichtfläche,
  // ein Kreis ein Kegel. Darum: dünne, satte Punkte und Linien auf reinem Schwarz, wie ein Laserprojektor.
  e(36, "laser-beams", "Strahlen-Fächer", "laser", "generator", "ready", "Reihe aus Punkten: im Nebel ein Fächer aus Einzelstrahlen. Schwenkt, öffnet sich, Lauflicht im Takt.", ["beat"]),
  e(37, "laser-sky", "Lichtdecke (Liquid Sky)", "laser", "generator", "ready", "Wellige Linie: im Nebel eine fließende Lichtdecke über dem Publikum.", ["bass"]),
  e(38, "laser-cone", "Kegel / Tunnel", "laser", "generator", "ready", "Kreis: im Nebel ein Lichtkegel, der im Takt atmet, mit drehenden Lücken.", ["beat"]),
  e(39, "laser-wave", "Laser-Welle", "laser", "generator", "ready", "Sinuslinie, Höhe folgt dem Bass: im Nebel eine wogende Fläche.", ["bass", "beat"]),
  e(40, "laser-matrix", "Strahlen-Matrix", "laser", "generator", "ready", "Raster aus Punkten: viele Einzelstrahlen, blinken, laufen, funkeln im Takt.", ["beat"]),
  e(41, "laser-propeller", "Propeller", "laser", "generator", "ready", "Drehende Linien durch die Mitte: im Nebel rotierende Lichtflächen.", ["beat"]),
  e(42, "laser-scan", "Laser-Figuren", "laser", "generator", "ready", "Lissajous-Figuren wie ein Laserscanner, wechseln alle 8 Beats.", ["beat"]),
  // Lichteffekt-Typen im Nebel: so wirkt der Beamer wie das jeweilige Gerät
  e(43, "beam-moonflower", "Moonflower", "laser", "generator", "ready", "Viele farbige Strahlen aus einem Punkt, drehen sich langsam, wechseln im Takt.", ["beat"]),
  e(44, "beam-derby", "Derby", "laser", "generator", "ready", "Strahlenbündel in mehreren Farben, gegenläufig schwenkend.", ["beat"]),
  e(45, "beam-scanner", "Scanner horizontal", "laser", "generator", "ready", "Waagerechter Balken fährt über den ganzen Bildschirm von oben nach unten und zurück (2 Beats pro Weg). Mit XY-Override setzt Y die Lage.", ["beat"]),
  e(46, "beam-spots", "RGB-Spots", "laser", "generator", "ready", "Wenige breite, weiche Strahlen in kräftigen Farben, wandern durch den Raum.", ["beat"]),
  e(47, "beam-snow", "Schneesturm", "laser", "generator", "ready", "Sehr viele feine weiße Strahlen, drehen und funkeln.", ["high"]),
  e(48, "beam-polygon", "Polygon", "laser", "generator", "ready", "Drehendes Vieleck (3–8 Ecken): Lichtflächen wie ein Prisma-Tunnel, dazu Eckstrahlen.", ["beat"]),
  e(49, "beam-burst", "Laser-Burst", "laser", "generator", "ready", "Feine grüne Strahlen, die auf jedem Beat neu aufblitzen.", ["beat"]),
  e(50, "beam-scanner-v", "Scanner vertikal", "laser", "generator", "ready", "Senkrechter Balken fährt über den ganzen Bildschirm von links nach rechts und zurück (2 Beats pro Weg). Mit XY-Override setzt X die Lage.", ["beat"]),
  // LJ-Link: Daten vom DJ-Pult
  e(51, "now-playing", "Now Playing", "lj", "generator", "ready", "Bauchbinde mit Titel, Artist und Cover des Master-Decks aus LJ-Link. Erscheint beim Trackwechsel (Dauer unter VERBINDEN → LJ-Link). Im Privatsphäre-Modus leer."),
  e(52, "dj-waveform", "DJ-Waveform", "lj", "generator", "ready", "Scrollende Wellenform des Master-Decks aus LJ-Link, wie auf dem CDJ, mit Abspielkopf in der Mitte.", ["beat"]),
];

export const EFFECT_BY_ID: ReadonlyMap<string, EffectDef> = new Map(EFFECTS.map(x => [x.id, x]));

/** Clips, die der Spieler heute abspielen kann (Reihenfolge = Position im Clip-Raster). */
/** Die ersten acht Clips: Standard-Zeile, Controller-Vorlagen und Pult-Clips 1–8 bleiben so stabil. */
export const STARTER_CLIP_IDS = ["bar-spectrum", "radial-eq", "oscilloscope", "pulse-rings", "tunnel", "synth-grid", "starfield", "plasma"] as const;

/** Alle spielbaren Generatoren: erst die Start-Clips, dann der Rest in Katalog-Reihenfolge (Pult-Clip-Nummer = Position). */
export const READY_GENERATORS: readonly EffectDef[] = (() => {
  const ready = EFFECTS.filter(x => x.kind === "generator" && x.status === "ready");
  const starter = STARTER_CLIP_IDS.map(id => ready.find(x => x.id === id)).filter((x): x is EffectDef => !!x);
  return [...starter, ...ready.filter(x => !(STARTER_CLIP_IDS as readonly string[]).includes(x.id))];
})();

/** Effekte im Stapel einer Ebene. Reihenfolge = Nummer im Shader (src/engine/shaders.ts, POST_IDS). */
export interface PostEffectDef { id: string; name: string; info: string; /** Nummer in der Wunschliste, falls vorhanden. */ no?: number }

export const POST_EFFECTS: readonly PostEffectDef[] = [
  { id: "kaleidoscope", name: "Kaleidoskop", info: "Spiegelt in 3 bis 12 Segmente, dreht langsam.", no: 13 },
  { id: "mirror", name: "Spiegeln", info: "Links auf rechts, ab halber Stärke auch oben auf unten." },
  { id: "rgb-shift", name: "RGB-Versatz", info: "Farbkanäle laufen auseinander, stärker auf dem Beat." },
  { id: "glitch", name: "Glitch", info: "Zeilen springen, Farben tauschen, Rauschen.", no: 23 },
  { id: "crt", name: "Röhre", info: "Scanlines, Wölbung und dunkle Ecken.", no: 24 },
  { id: "pixelate", name: "Pixel", info: "Grobe Pixel, je stärker, desto gröber.", no: 24 },
  { id: "feedback", name: "Feedback", info: "Das letzte Bild bleibt stehen und zoomt nach innen.", no: 21 },
  { id: "glow", name: "Leuchten", info: "Weicher Schein um helle Stellen." },
  { id: "strobe-zoom", name: "Beat-Zoom", info: "Zoomt auf jedem Beat kurz heran.", no: 26 },
  { id: "invert", name: "Invertieren", info: "Kehrt die Farben um." },
  { id: "tint", name: "Farbüberlagerung", info: "Färbt die Ebene in ihrer Farbquelle (Slot, Verlauf, Regenbogen; Original = Slot A)." },
  { id: "ascii", name: "ASCII", info: "Bild als Zeichenraster (. : + # @) in den Farben des Bildes.", no: 25 },
  { id: "laser", name: "Laser-Look", info: "Macht aus jedem Visual dünne, satte Linien auf reinem Schwarz, wie ein Laser. Für den Beamer im Nebel." },
];

export const POST_BY_ID: ReadonlyMap<string, PostEffectDef> = new Map(POST_EFFECTS.map(x => [x.id, x]));
