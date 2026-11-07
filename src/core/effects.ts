// Katalog der Visuals. `status: "ready"` heißt: die Engine hat dafür einen Generator.
export type EffectCategory = "audio" | "geometry" | "particles" | "retro" | "optical";
export type EffectKind = "generator" | "post" | "master";
export type EffectStatus = "ready" | "planned";

export interface EffectDef {
  /** Nummer aus der Wunschliste (1–35). */
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
  e(4, "lissajous", "Lissajous-Figuren", "audio", "generator", "planned", "X/Y-Schleifen aus dem Signal.", ["wave"]),
  e(5, "vu-meter", "VU-Meter", "audio", "generator", "planned", "Zeigerinstrument oder LED-Kette mit Peak-Hold.", ["bass"]),
  e(6, "dot-matrix", "Punkt-Matrix", "audio", "generator", "planned", "Rasterpunkte, Höhe nach Frequenz.", ["bass", "mid", "high"]),
  e(7, "pulse-rings", "Pulsierende Ringe", "audio", "generator", "ready", "Kreise, die mit der Bassdrum nach außen laufen.", ["beat", "bass"]),
  // Geometrie und Tunnel
  e(8, "tunnel", "Tunnel", "geometry", "generator", "ready", "Endloser Blick in einen Zylinder aus Ringen.", ["beat"]),
  e(9, "synth-grid", "Synthwave-Raster", "geometry", "generator", "ready", "Rollendes 3D-Bodenraster im 80er-Stil.", ["beat"]),
  e(10, "plexus", "Wireframe-Plexus", "geometry", "generator", "planned", "Vernetzte 3D-Punkte, die sich verformen."),
  e(11, "hypercube", "Würfel / Tesserakt", "geometry", "generator", "planned", "Ineinander verdrehte Körper."),
  e(12, "vector-gobos", "Vektor-Gobos", "geometry", "generator", "planned", "Kreuze, Dreiecke, Hexagone im Takt skaliert.", ["beat"]),
  e(13, "kaleidoscope", "Kaleidoskop", "geometry", "post", "planned", "Spiegelungen, die zu radialen Mustern werden."),
  // Partikel und Natur
  e(14, "starfield", "Sternenfeld", "particles", "generator", "ready", "Sterne fliegen auf dich zu, Hyperdrive bei Beat.", ["beat"]),
  e(15, "bokeh", "Staub und Bokeh", "particles", "generator", "planned", "Weiche, langsam schwebende Lichtpunkte."),
  e(16, "burst", "Partikel-Explosion", "particles", "generator", "planned", "Auf den Beat getriggerter Burst.", ["beat"]),
  e(17, "plasma", "Plasma", "particles", "generator", "ready", "Fließende psychedelische Farbströme.", ["bass"]),
  e(18, "lightning", "Blitz", "particles", "generator", "planned", "Elektrische Entladungen zwischen zwei Punkten.", ["beat"]),
  e(19, "ripples", "Wellen / Wasser", "particles", "generator", "planned", "Wellenlandschaft, die auf Frequenzen schwingt.", ["bass"]),
  e(20, "fire", "Feuer", "particles", "generator", "planned", "Flammen und Rauch.", ["bass"]),
  // Retro und Analog
  e(21, "feedback", "Video-Feedback", "retro", "post", "planned", "Unendlicher Spiegel mit Korridoren."),
  e(22, "liquid-light", "Liquid Light", "retro", "generator", "planned", "Öl-Wasser-Mischung wie vom Tageslichtprojektor."),
  e(23, "glitch", "Glitch und Rauschen", "retro", "post", "planned", "VHS-Fehler, Scanlines, Schnee.", ["beat"]),
  e(24, "crt", "CRT und Pixel", "retro", "post", "planned", "Röhrenmonitor-Look oder grobe Pixel."),
  e(25, "ascii", "ASCII-Video", "retro", "post", "planned", "Bild als Buchstabenraster."),
  e(26, "strobe-zoom", "Strobe-Zoom", "retro", "post", "planned", "Schnelles Ein- und Auszoomen im Takt.", ["beat"]),
  // Optische Raumeffekte
  e(27, "mirror-ball", "Spiegelkugel", "optical", "generator", "planned", "Tausende drehende Lichtpunkte im Raum."),
  e(28, "uv-glow", "UV / Schwarzlicht", "optical", "generator", "planned", "Fluoreszierende Muster auf Schwarz."),
  e(29, "laser-sheet", "Laser-Fläche", "optical", "generator", "planned", "Waagerechte Laserebene wie Nebeldecke."),
  e(30, "laser-fans", "Laser-Fächer", "optical", "generator", "planned", "Grüne oder RGB-Fächer und Wellenformen.", ["beat"]),
  e(31, "strobe-flash", "Strobe / Blinder", "optical", "master", "ready", "Weiße oder farbige Blitze, taktgebunden (Master- und Ebenen-Strobe).", ["beat"]),
  e(32, "moire", "Moiré-Strahlen", "optical", "generator", "planned", "Überlagerte Reflexionen mit Moiré-Mustern."),
  e(33, "flower", "Blumen-Strahlen", "optical", "generator", "planned", "Gegenläufig drehende Strahlenkränze.", ["beat"]),
  e(34, "co2-jet", "CO2-Stoß", "optical", "generator", "planned", "Weiße Vertikal-Stöße, die sofort verfliegen.", ["beat"]),
  e(35, "silhouette", "Silhouette", "optical", "post", "planned", "Gegenlicht: Personen als schwarze Umrisse."),
];

export const EFFECT_BY_ID: ReadonlyMap<string, EffectDef> = new Map(EFFECTS.map(x => [x.id, x]));

/** Clips, die der Spieler heute abspielen kann (Reihenfolge = Position im Clip-Raster). */
export const READY_GENERATORS: readonly EffectDef[] =
  EFFECTS.filter(x => x.kind === "generator" && x.status === "ready");
