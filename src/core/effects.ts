// Katalog der Visuals. `status: "ready"` heißt: die Engine hat dafür einen Generator.
// Englische Namen und Beschreibungen: i18n-catalog.ts (gelten, wenn die Oberfläche auf Englisch steht).
import { getLang } from "./i18n";
import { CATEGORY_EN, EFFECT_EN, POST_EN } from "./i18n-catalog";
export type EffectCategory = "audio" | "geometry" | "particles" | "retro" | "optical" | "laser" | "lj" | "tools"
  | "minimal" | "space3d" | "data" | "opart" | "organic" | "fractal" | "demo" | "sacred";

/** Anzeigenamen der Kategorien (Galerie, Bibliothek), in dieser Reihenfolge. */
const CATEGORY_DE: Record<EffectCategory, string> = {
  minimal: "Minimal und Monochrom", space3d: "3D und Raum", fractal: "Fraktale", demo: "Demoscene", sacred: "Heilige Geometrie", data: "Daten und Glitch", opart: "Op-Art und Muster", organic: "Organisch und Flüssig",
  audio: "Audio und Equalizer", geometry: "Geometrie und Tunnel", particles: "Partikel und Natur", retro: "Retro und Analog",
  optical: "Licht und Raum", laser: "Laser (Beamer im Nebel)", lj: "LJ-Link (DJ)", tools: "Werkzeuge",
};
export const CATEGORY_LABEL: Record<EffectCategory, string> = getLang() === "en" ? CATEGORY_EN : CATEGORY_DE;
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
  status: EffectStatus, info: string, reactsTo: EffectDef["reactsTo"] = []): EffectDef => {
  const en = getLang() === "en" ? EFFECT_EN[id] : undefined;
  return { no, id, name: en?.[0] ?? name, category, kind, status, info: en?.[1] ?? info, reactsTo };
};

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
  // Moderne Techno-Visuals (Recherche 2026: generativ, monochrom, 3D, Daten/Glitch, Op-Art, organisch)
  e(53, "mono-bars", "Mono-Balken", "minimal", "generator", "ready", "Schwarz-weiße Balken, jeder Beat ein neues Muster.", ["beat"]),
  e(54, "strobe-grid", "Strobe-Raster", "minimal", "generator", "ready", "Raster aus Feldern, zufällige Felder blitzen im Achtel-Takt.", ["beat"]),
  e(55, "line-scan", "Linien-Scan", "minimal", "generator", "ready", "Feine Linien wandern in verschiedenen Tempi über das Bild.", ["beat"]),
  e(56, "rotor", "Rotor", "minimal", "generator", "ready", "Radar-Wischer mit Nachleuchten, ein Umlauf pro Takt.", ["beat"]),
  e(57, "split-flash", "Split-Flash", "minimal", "generator", "ready", "Vier Bildviertel blitzen reihum im Achtel-Takt.", ["beat"]),
  e(58, "pulse-square", "Quadrat-Puls", "minimal", "generator", "ready", "Rechteck-Rahmen laufen im Takt nach außen.", ["beat"]),
  e(59, "cube-tunnel", "Würfel-Tunnel", "space3d", "generator", "ready", "Fahrt durch einen Gang aus leuchtenden Rahmen (3D).", ["beat"]),
  e(60, "gyroid", "Gyroid", "space3d", "generator", "ready", "Flug durch eine endlose, verschlungene 3D-Fläche."),
  e(61, "chrome-blobs", "Chrom-Blobs", "space3d", "generator", "ready", "Flüssige Chrom-Tropfen, die verschmelzen und sich trennen.", ["bass"]),
  e(62, "neon-corridor", "Neon-Korridor", "space3d", "generator", "ready", "Endloser Korridor aus farbigen Neonrahmen.", ["beat"]),
  e(63, "point-sphere", "Punkt-Kugel", "space3d", "generator", "ready", "Drehende Kugel aus Lichtpunkten, pulsiert im Takt.", ["beat"]),
  e(64, "terrain", "Wireframe-Terrain", "space3d", "generator", "ready", "Fliegen über eine Gitter-Landschaft, Bass hebt die Berge.", ["bass"]),
  e(65, "ring-stack", "Ring-Stapel", "space3d", "generator", "ready", "Kippende Ringe in verschiedenen Größen.", ["beat"]),
  e(66, "code-rain", "Code-Regen", "data", "generator", "ready", "Fallende Zeichenkolonnen."),
  e(67, "barcode", "Barcode", "data", "generator", "ready", "Strichcode, jeder Beat neu, mit rotem Scan.", ["beat"]),
  e(68, "data-blocks", "Datenblöcke", "data", "generator", "ready", "Flackernde Felder wie eine Datenoberfläche.", ["beat"]),
  e(69, "hud", "HUD", "data", "generator", "ready", "Drehende Messringe, Skalen und Fadenkreuz.", ["beat"]),
  e(70, "glitch-wall", "Glitch-Wand", "data", "generator", "ready", "Datamosh-Blöcke mit springenden Zeilen.", ["beat"]),
  e(71, "truchet", "Truchet", "opart", "generator", "ready", "Kachelmuster aus Bögen, alle 4 Beats neu gelegt.", ["beat"]),
  e(72, "riley-waves", "Op-Art-Wellen", "opart", "generator", "ready", "Schwarz-weiße Wellenlinien, die flimmern.", ["bass"]),
  e(73, "checker-warp", "Schachbrett-Warp", "opart", "generator", "ready", "Verbogenes Schachbrett.", ["beat"]),
  e(74, "voronoi", "Zellen", "opart", "generator", "ready", "Wandernde Zellen mit leuchtenden Kanten, Zellen blitzen im Takt.", ["beat"]),
  e(75, "hex-pulse", "Hex-Puls", "opart", "generator", "ready", "Wabenraster, Wellen laufen aus der Mitte.", ["beat"]),
  e(76, "interference", "Interferenz", "opart", "generator", "ready", "Überlagerte Kreiswellen aus zwei Quellen."),
  e(77, "hypno-spiral", "Hypno-Spirale", "opart", "generator", "ready", "Drehende Schwarz-Weiß-Spirale."),
  e(78, "ink", "Tinte", "organic", "generator", "ready", "Tinte, die sich in Wasser verteilt."),
  e(79, "aurora", "Polarlicht", "organic", "generator", "ready", "Leuchtende Vorhänge am Himmel.", ["mid"]),
  e(80, "iridescent", "Irisierend", "organic", "generator", "ready", "Schillernde Farben wie Öl auf Wasser."),
  e(81, "smoke", "Rauch", "organic", "generator", "ready", "Aufsteigende Rauchschwaden."),
  e(82, "nebula", "Nebel-Galaxie", "organic", "generator", "ready", "Kosmischer Nebel mit funkelnden Sternen."),
  // Paket 1: Fraktale, Demoscene, Heilige Geometrie
  e(83, "mandel-zoom", "Mandelbrot-Zoom", "fractal", "generator", "ready", "Endloser Flug in die Mandelbrot-Menge.", ["beat"]),
  e(84, "julia", "Julia-Menge", "fractal", "generator", "ready", "Fließende Julia-Fraktale, die sich ständig verwandeln.", ["beat"]),
  e(85, "sierpinski", "Sierpinski", "fractal", "generator", "ready", "Sierpinski-Dreieck, zoomt endlos.", ["beat"]),
  e(86, "kifs", "Kaleido-Fraktal", "fractal", "generator", "ready", "Gefaltete, drehende Fraktal-Kreise (KIFS).", ["beat"]),
  e(87, "apollonian", "Apollonius", "fractal", "generator", "ready", "Kreis-Fraktal aus unendlich vielen Kreisen.", ["beat"]),
  e(88, "carpet", "Sierpinski-Teppich", "fractal", "generator", "ready", "Quadratisches Loch-Fraktal, zoomt.", ["beat"]),
  e(89, "newton", "Newton-Fraktal", "fractal", "generator", "ready", "Farbige Becken des Newton-Verfahrens, dreht sich.", ["beat"]),
  e(90, "tricorn", "Tricorn", "fractal", "generator", "ready", "Dreizack-Fraktal, Verwandter der Mandelbrot-Menge.", ["beat"]),
  e(91, "rotozoom", "Rotozoomer", "demo", "generator", "ready", "Drehendes, zoomendes Schachbrett wie in 90er-Demos.", ["beat"]),
  e(92, "twister", "Twister", "demo", "generator", "ready", "Sich windende Säule aus vier Farbflächen.", ["beat"]),
  e(93, "copper-bars", "Copper-Bars", "demo", "generator", "ready", "Glänzende Farbbalken, die auf und ab schwingen.", ["beat"]),
  e(94, "sine-dots", "Sinus-Punkte", "demo", "generator", "ready", "Punktereihe, die über eine Sinuswelle läuft.", ["beat"]),
  e(95, "raster-bars", "Raster-Bars", "demo", "generator", "ready", "Wellige Farbstreifen über das ganze Bild.", ["beat"]),
  e(96, "xor-tunnel", "XOR-Tunnel", "demo", "generator", "ready", "Klassischer Textur-Tunnel mit XOR-Muster.", ["beat"]),
  e(97, "vector-balls", "Vector-Balls", "demo", "generator", "ready", "Würfel aus glänzenden Kugeln, dreht sich.", ["beat"]),
  e(98, "shade-bobs", "Shadebobs", "demo", "generator", "ready", "Leuchtende Spur, die über das Bild tanzt.", ["beat"]),
  e(99, "flower-of-life", "Blume des Lebens", "sacred", "generator", "ready", "Überlappende Kreise der Blume des Lebens.", ["beat"]),
  e(100, "metatron", "Metatron", "sacred", "generator", "ready", "13 Kreise, alle Mittelpunkte verbunden.", ["beat"]),
  e(101, "spirograph", "Spirograph", "sacred", "generator", "ready", "Schlaufen-Kurve wie vom Spirographen.", ["beat"]),
  e(102, "star-polygons", "Sternpolygone", "sacred", "generator", "ready", "Ineinander drehende Sterne mit 5, 7 und 9 Zacken.", ["beat"]),
  e(103, "nested-polygons", "Polygon-Schachtel", "sacred", "generator", "ready", "Verschachtelte Vielecke, jedes dreht anders.", ["beat"]),
  e(104, "seed-of-life", "Saat des Lebens", "sacred", "generator", "ready", "Sieben Kreise, pulsieren im Takt.", ["beat"]),
  e(105, "mandala", "Mandala", "sacred", "generator", "ready", "Wellenringe mit Blütenblättern, gegenläufig.", ["beat"]),
  e(106, "lissajous-knot", "Lissajous-Knoten", "sacred", "generator", "ready", "3D-Knotenkurve, die sich dreht.", ["beat"]),
  e(107, "circle-grid", "Kreisraster", "sacred", "generator", "ready", "Kreise wachsen in Wellen aus der Mitte.", ["beat"]),
  // Paket 2: 3D-Raum, Organisch, Partikel
  e(108, "sphere-field", "Kugelfeld", "space3d", "generator", "ready", "Flug durch ein endloses Gitter aus Kugeln.", ["beat"]),
  e(109, "box-field", "Würfelfeld", "space3d", "generator", "ready", "Flug durch gedrehte Würfel, raymarched.", ["beat"]),
  e(110, "torus-ring", "Torus", "space3d", "generator", "ready", "Leuchtender 3D-Ring, dreht sich im Raum.", ["beat"]),
  e(111, "ring-tunnel", "Ringtunnel", "space3d", "generator", "ready", "Flug durch eine Röhre aus Lichtringen.", ["beat"]),
  e(112, "hex-tunnel", "Sechseck-Tunnel", "space3d", "generator", "ready", "Sechseckiger Tunnel mit Speichen, zieht nach vorn.", ["beat"]),
  e(113, "wormhole", "Wurmloch", "space3d", "generator", "ready", "Wirbelnder Nebel-Tunnel mit Sternen.", ["beat"]),
  e(114, "infinite-squares", "Endlos-Quadrate", "space3d", "generator", "ready", "Quadrate fliegen endlos auf dich zu.", ["beat"]),
  e(115, "dna-helix", "DNA-Helix", "space3d", "generator", "ready", "Doppelhelix, die sich durchs Bild schraubt.", ["beat"]),
  e(116, "lava-lamp", "Lavalampe", "organic", "generator", "ready", "Zähe Blasen steigen und verschmelzen.", ["beat"]),
  e(117, "caustics", "Wasser-Kaustik", "organic", "generator", "ready", "Lichtnetz wie am Grund eines Pools.", ["beat"]),
  e(118, "flow-lines", "Strömungslinien", "organic", "generator", "ready", "Linien folgen einem fließenden Feld.", ["beat"]),
  e(119, "domain-warp", "Fluid-Marmor", "organic", "generator", "ready", "Verwirbelter, farbiger Rauch (Domain-Warping).", ["beat"]),
  e(120, "bubbles", "Blasen", "organic", "generator", "ready", "Seifenblasen steigen auf.", ["beat"]),
  e(121, "electric", "Strom", "organic", "generator", "ready", "Zuckende Stromlinien quer durchs Bild.", ["beat"]),
  e(122, "cells", "Zellen", "organic", "generator", "ready", "Lebende Zellen, die sich bewegen und teilen.", ["beat"]),
  e(123, "tentacles", "Tentakel", "organic", "generator", "ready", "Acht Arme winden sich aus der Mitte.", ["beat"]),
  e(124, "marble", "Marmor", "organic", "generator", "ready", "Glänzende Marmor-Adern, fließen langsam.", ["beat"]),
  e(125, "hyperspace", "Hyperraum", "particles", "generator", "ready", "Sterne ziehen zu Lichtstreifen (Warp-Sprung).", ["beat"]),
  e(126, "fireflies", "Glühwürmchen", "particles", "generator", "ready", "Warme Lichtpunkte schweben und blinken.", ["beat"]),
  e(127, "confetti", "Konfetti", "particles", "generator", "ready", "Bunte Schnipsel rieseln und drehen sich.", ["beat"]),
  e(128, "rain-lines", "Regen", "particles", "generator", "ready", "Feine Regenstriche fallen.", ["beat"]),
  e(129, "galaxy", "Galaxie", "particles", "generator", "ready", "Spiralgalaxie mit funkelnden Sternen.", ["beat"]),
  e(130, "vortex", "Strudel", "particles", "generator", "ready", "Teilchen werden in die Mitte gesaugt.", ["beat"]),
  e(131, "fireworks", "Feuerwerk", "particles", "generator", "ready", "Raketen explodieren in bunten Kugeln.", ["beat"]),
  e(132, "particle-ring", "Partikelring", "particles", "generator", "ready", "Schwingender Ring aus Lichtpunkten.", ["beat"]),
  e(133, "dust-storm", "Staubsturm", "particles", "generator", "ready", "Staubkörner wehen in Schichten vorbei.", ["beat"]),
  // Paket 3: Retro, Op-Art, Audio, Minimal, Daten
  e(134, "outrun-sun", "Outrun-Sonne", "retro", "generator", "ready", "Gestreifte Sonne über Neon-Raster, 80er-Synthwave.", ["beat"]),
  e(135, "vhs-tape", "VHS-Band", "retro", "generator", "ready", "Farbbalken mit Bandrauschen und Zittern.", ["beat"]),
  e(136, "pixel-space", "Pixel-Weltraum", "retro", "generator", "ready", "8-Bit-Raumschiffe ziehen durch Pixelsterne.", ["beat"]),
  e(137, "c64-load", "Heimcomputer-Laden", "retro", "generator", "ready", "Flackernde Ladestreifen am Bildrand wie beim C64.", ["beat"]),
  e(138, "op-waves", "Op-Wellen", "opart", "generator", "ready", "Schwarz-weiße Linien, die sich wellen (Bridget Riley).", ["beat"]),
  e(139, "bulge-grid", "Wölb-Schachbrett", "opart", "generator", "ready", "Schachbrett, das sich in der Mitte aufbläht.", ["beat"]),
  e(140, "concentric-shift", "Kreis-Moiré", "opart", "generator", "ready", "Zwei verschobene Kreisscharen ergeben Moiré.", ["beat"]),
  e(141, "vasarely", "Vasarely", "opart", "generator", "ready", "Kreise und Quadrate im Raster, pulsieren als Welle.", ["beat"]),
  e(142, "zebra-twist", "Zebra-Wirbel", "opart", "generator", "ready", "Verdrehte Zebrastreifen aus der Mitte.", ["beat"]),
  e(143, "spectrum-circle", "Spektrum-Kreis", "audio", "generator", "ready", "Frequenzbalken rund um einen Ring.", ["bass", "mid", "high"]),
  e(144, "wave-ribbon", "Wellenband", "audio", "generator", "ready", "Leuchtende Bänder folgen der Wellenform.", ["wave", "mid"]),
  e(145, "eq-tower", "LED-Equalizer", "audio", "generator", "ready", "Segment-Equalizer grün-gelb-rot mit Spitzen.", ["bass", "mid", "high"]),
  e(146, "bass-ring", "Bass-Ring", "audio", "generator", "ready", "Ring wächst mit dem Bass.", ["bass"]),
  e(147, "audio-mesh", "Klang-Gebirge", "audio", "generator", "ready", "Linien-Landschaft, die das Spektrum zeigt.", ["bass", "mid", "high"]),
  e(148, "single-line", "Eine Linie", "minimal", "generator", "ready", "Eine weiße Linie wandert im Takt.", ["beat"]),
  e(149, "dot-pulse", "Punkt-Puls", "minimal", "generator", "ready", "Ein Punkt springt auf jedem Beat auf.", ["beat"]),
  e(150, "crosshair", "Fadenkreuz", "minimal", "generator", "ready", "Zielkreuz gleitet übers Bild.", ["beat"]),
  e(151, "bars-3", "Drei Balken", "minimal", "generator", "ready", "Drei Felder leuchten nacheinander im Takt.", ["beat"]),
  e(152, "frame-zoom", "Rahmen-Zoom", "minimal", "generator", "ready", "Rahmen zieht sich im Takt zur Mitte.", ["beat"]),
  e(153, "radar", "Radar", "data", "generator", "ready", "Radar-Schirm mit Strahl und Zielen.", ["beat"]),
  e(154, "matrix-grid", "LED-Matrix", "data", "generator", "ready", "Flackernde LED-Felder im Raster.", ["beat"]),
  e(155, "world-map", "Punkt-Weltkarte", "data", "generator", "ready", "Punktekarte mit Scan-Linie und Signalen.", ["beat"]),
  e(156, "neon-triangles", "Neon-Dreiecke", "geometry", "generator", "ready", "Dreiecke wachsen drehend aus der Mitte.", ["beat"]),
  e(157, "kaleido-burst", "Kaleido-Explosion", "geometry", "generator", "ready", "Zwölffaches Kaleidoskop mit Strahlen.", ["beat"]),
  e(158, "infinity-loop", "Unendlich-Schleife", "geometry", "generator", "ready", "Lichtkomet läuft eine liegende Acht.", ["beat"]),
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

/** Bei Englisch: Name und Info aus i18n-catalog.ts. */
const localizePosts = (list: PostEffectDef[]): PostEffectDef[] => getLang() !== "en" ? list
  : list.map(p => { const en = POST_EN[p.id]; return en ? { ...p, name: en[0], info: en[1] } : p; });

export const POST_EFFECTS: readonly PostEffectDef[] = localizePosts([
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
  // Techno-Effekte
  { id: "datamosh", name: "Datamosh", info: "Blöcke bleiben vom letzten Bild stehen und verschmieren, wie ein kaputtes Video." },
  { id: "echo", name: "Echo-Spuren", info: "Farbige Nachzieher hinter allem, was sich bewegt." },
  { id: "stutter", name: "Stutter", info: "Friert das Bild im Takt ein (Achtel). Stärke = wie lange es steht." },
  { id: "zoom-blur", name: "Zoom-Blur", info: "Bewegungsunschärfe zur Mitte, auf dem Beat stärker." },
  { id: "tiles", name: "Kacheln", info: "Wiederholt das Bild 2× bis 5×, jede zweite Kachel gespiegelt, wechselt im Takt." },
  { id: "edges", name: "Neon-Kanten", info: "Nur noch leuchtende Umrisse in den Farben des Bildes." },
  { id: "one-bit", name: "1-Bit", info: "Hartes Schwarz-Weiß mit Pixelraster, wie ein alter Monitor." },
  { id: "shake", name: "Shake", info: "Das Bild ruckt und kippt auf jedem Beat." },
  { id: "polar", name: "Polar-Warp", info: "Biegt jedes Visual zu einem Tunnel." },
  { id: "liquid", name: "Liquid-Warp", info: "Wellige, flüssige Verformung, pumpt im Takt." },
  { id: "slices", name: "Beat-Slices", info: "Waagerechte Streifen verrutschen auf jedem Beat." },
  { id: "hue-cycle", name: "Farbrad", info: "Farbton dreht sich langsam und springt auf jedem Beat." },
  { id: "posterize", name: "Posterize", info: "Wenige harte Farbstufen, Pop-Art-Look." },
  { id: "beat-invert", name: "Beat-Invert", info: "Blitzt auf dem Beat ins Negativ." },
  { id: "slit-scan", name: "Slit-Scan", info: "Oben läuft das Bild ein, darunter rutscht die Zeit nach unten (Zeitschlitz)." },
  { id: "zoom-feedback", name: "Zoom-Feedback", info: "Bild fällt endlos in sich hinein, Farben drehen dabei." },
  { id: "vhs", name: "VHS", info: "Farbbluten, Spurfehler und Bandrauschen." },
  { id: "bloom", name: "Bloom", info: "Helle Stellen strahlen weich aus." },
  { id: "vignette", name: "Vignette", info: "Dunkle Ränder, auf dem Beat enger." },
  { id: "wave-warp", name: "Wellen", info: "Bild wellt sich, stärker auf dem Beat." },
  { id: "twirl", name: "Strudel", info: "Die Mitte verdreht sich hin und her." },
  { id: "fisheye", name: "Fischauge", info: "Wölbt das Bild wie durch ein Weitwinkel, pumpt im Takt." },
  { id: "lcd", name: "LCD", info: "Rot-grün-blaue Subpixel wie ein Bildschirm aus der Nähe." },
  { id: "halftone", name: "Halbton", info: "Druckpunkte wie in der Zeitung." },
  { id: "duotone", name: "Duoton", info: "Dunkles in Slot A, Helles in Slot B." },
  { id: "film", name: "Film", info: "Korn, Flackern, Kratzer, warmer Ton." },
  { id: "emboss", name: "Relief", info: "Kanten werden zur Prägung." },
  { id: "pixel-sort", name: "Pixel-Sort", info: "Helle Pixel laufen nach unten aus." },
  { id: "lens", name: "Linse", info: "Farbsäume zum Rand hin, wie ein billiges Objektiv." },
  { id: "luma-key", name: "Luma-Key", info: "Dunkles wird durchsichtig, darunterliegende Ebenen scheinen durch." },
  { id: "color-strobe", name: "Farb-Strobe", info: "Blitzt auf dem Beat abwechselnd in Slot A und B." },
  { id: "hex-pixel", name: "Waben", info: "Sechseck-Mosaik." },
  { id: "spin-blur", name: "Dreh-Unschärfe", info: "Verwischt kreisförmig um die Mitte." },
  { id: "solarize", name: "Solarisation", info: "Helle Töne kippen um, wie in der Dunkelkammer." },
  { id: "false-color", name: "Falschfarben", info: "Helligkeit wird zur Farbskala von Blau bis Rot." },
  { id: "beat-flip", name: "Beat-Flip", info: "Spiegelt im Takt, ab halber Stärke auch oben/unten." },
  { id: "turbulence", name: "Turbulenz", info: "Flimmert wie Luft über heißem Asphalt." },
]);

export const POST_BY_ID: ReadonlyMap<string, PostEffectDef> = new Map(POST_EFFECTS.map(x => [x.id, x]));
