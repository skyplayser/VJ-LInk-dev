<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo-for-dark.png">
    <img src="assets/logo-for-light.png" alt="VJ-Link" width="360">
  </picture>
</h1>

Einfache VJ-Software für LJs. Das Lichtpult steuert die Visuals, der Takt kommt aus LJ-Link, Ableton Link, OSC oder MIDI. Schwesterprojekt von [LJ-Link](https://github.com/skyplayser/LJ-Link).

> Stand: **Grundgerüst** (Version 0.1.0). Lauffähig, aber noch kein fertiges Programm.

## Was schon läuft

| Bereich | Stand |
|---|---|
| Engine | WebGL2-Compositor mit 4 Ebenen, Mischmodi (Normal, Addieren, Bildschirm, Multiplizieren), Deckkraft, Farbquellen (Slot A–E, Verlauf, Regenbogen), Master, Strobe, Blackout |
| Effekte | Effekt-Stapel pro Ebene (bis 6): Kaleidoskop, Spiegeln, RGB-Versatz, Glitch, Röhre, Pixel, Feedback, Leuchten, Beat-Zoom, Invertieren, Farbüberlagerung, ASCII. Effekt 1–3 jeder Ebene per Pult, MIDI-Registry und OSC |
| Szenen | Eigene Szenen anlegen, umbenennen, überschreiben, sortieren, löschen. Übergang je Szene: Schnitt, Beats oder Sekunden, Überblenden oder über Schwarz. Abfolge: weiter nach Takten, Sekunden oder Phrasenwechsel (mit „Auto“). Auslöser: Tasten 1–9, Pfeile, Pult, OSC |
| Grafiken | Logos und Bilder (PNG, JPG, WebP, GIF, SVG) laden oder hineinziehen, Freistellen (weißen/schwarzen Hintergrund entfernen, wird erkannt), Größe, Lage, Drehung, Animation im Takt (Pulsieren, Drehen, Hüpfen, Schweben, Wackeln, Heranzoomen), Effekte und Farbüberlagerung |
| Neues Projekt | Startet mit sechs Ebenen (laufend: Tunnel in Slot A, Sternenfeld, Text, Logo): E1 Basis, E2/E3 Overlay, E4 Laser (alle Laser), E5 Text („VJ-Link“), E6 Logo (VJ-Link-Logo klein unten rechts). Ebenen lassen sich im Ebenen-Panel umbenennen |
| Speichern | Arbeitsstand wird laufend gesichert. Projektdateien (.vjlink): Neu, Öffnen, Speichern, Speichern unter (Menü Ablage, ⌘N/⌘O/⌘S/⇧⌘S, Projektknopf oben), Grafiken in der Datei, Videos im Ordner „<Name> Medien“ daneben, zuletzt geöffnet, Hinweis auf ungespeicherte Änderungen |
| Visuals | 27 Generatoren aus der Wunschliste (alle außer „Silhouette“, die eine Kamera braucht) und 16 Laser-Visuals, Live-Vorschau im Clip-Raster mit Farbe und Effekten der Ebene |
| Laser | Kategorie für den Beamer als Showlaser im Nebel: ein Punkt im Bild wird ein Strahl, eine Linie eine Lichtfläche, ein Kreis ein Kegel. Strahlen-Fächer, Lichtdecke (Liquid Sky), Kegel/Tunnel, Laser-Welle, Strahlen-Matrix, Propeller, Laser-Figuren (Lissajous) und die Lichteffekt-Typen Moonflower, Derby, Scanner, RGB-Spots, Schneesturm, Polygon, Laser-Burst. Laser-Fläche: gerade, im Takt pulsierende Linie (Höhe einstellbar, vorgegeben oberes Drittel). Scanner horizontal und Scanner vertikal: ein Balken fährt über den ganzen Bildschirm (oben ↔ unten bzw. links ↔ rechts). Laser-Fächer (Seitenansicht für Leinwände) steht bei Licht und Raum. Effekt „Laser-Look“ macht aus jedem Visual dünne, satte Linien auf Schwarz. Laserfarben mit Wechsel alle 8 Beats oder eigene Farb-Slots, reines Schwarz. Je Ebene einstellbar: Höhe, Seite, Größe, Stärke (auch per Mapping). XY-Override: Eigenbewegung aus, X/Y setzen die Lage direkt, z. B. von der MA per DMX; Schalter, X, Y und Größe auch per Mapping |
| Katalog | Alle 35 Visuals der Wunschliste und die Laser mit Status (`bereit` / `geplant`) |
| Takt | Quellen-Rangfolge LJ-Link → Ableton Link → OSC → MIDI → Audio → Tap, Tap-Tempo, Rückfall bei Ausfall ohne Phasensprung |
| Pult | Art-Net und sACN als Eingang, DMX-Belegung „Standard“ (91 Kanäle, 71–91 für die Bilder im Projektionsmapping), nur geänderte Kanäle wirken, Kanalliste als CSV |
| OSC | Eingang auf Port 8000, Adressen `/vjlink/…` |
| LJ-Link | LJ-Link PRO wird automatisch gefunden: VJ-Link meldet sich an dessen Weboberfläche an (ws://…:8080/ws, alle 3 s neuer Versuch), übernimmt Decks, Master-Tempo, Tonart, Titel, Trackwechsel und Loops; anderer Rechner unter VERBINDEN → LJ-Link. Zusätzlich WebSocket-Eingang auf Port 9099 (eigenes Protokoll), Regeln „Wenn … dann …“, Privatsphäre-Modus |
| Ausgänge | Tab AUSGABE: ein Vollbild-Fenster pro Bildschirm, gemeinsame Takt-Uhr. Anordnung „Gleiches Bild auf allen“ oder „Leinwand“: Bildschirme frei anordnen (ziehen, einrasten, Werte eintippen, nebeneinander/untereinander), jeder Ausgang zeigt seinen Ausschnitt, Visuals, Videos und Cues laufen nahtlos über alle |
| Mapping | Wie Daslight: MAPPING → Tastatur, MIDI, DMX/Art-Net oder OSC (⇧⌘K/M/D/O). Alle zuweisbaren Elemente leuchten lila, anklicken, Eingang bewegen. Liste der Zuweisungen je Art, wird mit dem Projekt gespeichert. Clips, Szenen, Fader, Effekte, BPM |
| Lage | Jedes Visual in jeder Ebene: X, Y, Größe, Drehung; das Visual füllt dabei weiter den ganzen Bildschirm (Ebenen-Panel „Lage“, auch per Mapping für MA, MIDI, OSC). Laser rechnen die Lage selbst (Linien bleiben dünn), dazu Stärke und XY-Override |
| Text | „+ Text“ (Clip-Raster oder Bibliothek): Text-Rahmen gestalten mit Schrift, Größe, Fett/Kursiv/GROSS, Ausrichtung, Zeilen- und Buchstabenabstand, Farbe, Leuchten, Kontur, Kasten; Live-Vorschau. Wird ein Clip wie eine Grafik; Bleistift am Clip zum Bearbeiten |
| Modulation | MAPPING → Modulation (⇧⌘L): Regler anklicken, LFO im Takt (Sinus, Dreieck, Säge, Rechteck, Zufall, ¼–32 Beats) oder Audio-Band (Bass, Mitten, Höhen), Stärke. Der Regler schwingt um seine Position, modulierte Regler sind türkis umrandet. Wird mit dem Projekt gespeichert |
| Sperrmodus | Schloss oben rechts: während der Show nur bedienen (Fader, Clips, Szenen, Effekt-Stärken, GO, Blackout …), nichts löschen, hinzufügen, umbenennen oder laden. Entsperren: Schloss 1 Sekunde halten |
| MIDI | Controller per Web MIDI, Hot-Plug, Noten und CCs, LED-Rückmeldung, Vorlagen (APC mini mk2, APC mini, nanoKONTROL2), Export/Import der Zuweisungen, MIDI-Clock als Tempo-Quelle |
| Ebenen | 1 bis 8 Ebenen, hinzufügen und entfernen (Pult-Profil steuert Ebene 1–4). Jede Ebene hat ihre eigene Clip-Zeile, zusammengestellt aus der Bibliothek („+ Clips“), Clips per × aus der Zeile nehmen |
| Ebene | Antrieb auch direkt in jeder Ebenen-Zeile wählbar. Panel rechts je Ebene: Antrieb Auto / Takt / Audio / Statisch (woher Pulsieren und Reaktion kommen), Farben Original, ein oder mehrere Slots (Reihenfolge wählbar), Verlauf, Regenbogen. Antrieb und Laser-Regler auch per Mapping |
| Audio | Audio-Eingang (Mikrofon, Line-In) für Equalizer und Oszilloskop oder alle Visuals, mit Pegel |
| Tempo | BPM anklicken und eintippen, Tempo-Quelle festlegen (Auto, LJ-Link, Ableton Link, OSC, Manuell), Ableton Link über Carabiner |
| Bedienung | Fader-Leiste (Master, Ebenen, Effekt, Strobe mit Speed und Intensität, Strobe White, Blinder (statisch weiß), Szenen, Tap, Blackout), jedes Element auch per OSC (`/vjlink/ctl/<id>`) |
| Oberfläche | VISUALS, SHOW, Bauen (Katalog), Ausgabe, Verbinden; Logo als App-Icon |
| Videos | MP4, MOV, M4V, WebM in die Bibliothek (Kopie im App-Ordner, gestreamt über vjmedia://). Nahtloser Loop mit zwei Abspielern. Als Clip mit Loop-Bereich, Takt-Loop (4–32 Beats), Größe, Ton. Läuft auf allen Ausgängen synchron |
| Timecode | Empfangen und Senden getrennt einschaltbar, auch gleichzeitig (Art-Net, MIDI-Timecode), 24/25/29,97 DF/30 fps. Empfangen: Cues starten per Timecode, Videos folgen (Spulen, Anhalten), Versatz. Senden: eigene Uhr oder Empfangenen weitergeben, z. B. an eine MA; Timecode-Cues im SHOW-Ablauf (Start ab Zeit, Stopp, Springen) und Mapping steuern die Uhr |
| Einstellungen | Zahnrad oben rechts: Audio-Eingang und -Ausgang, Timecode, MIDI-Geräte, DMX und Netzwerk, Oberfläche |
| Projektionsmapping | AUSGABE → Anordnung → Projektionsmapping: auf das Bild jedes Beamers Leinwände legen (Vierecke). Ecke ziehen verzerrt (Wand, Kiste, Trapez), Mitte ziehen verschiebt, Pfeiltasten 1 px (⇧ 10 px), Ecken rasten ein („Einrasten aus“ oder ⌥ beim Ziehen für volle Präzision). Jede Leinwand zeigt das ganze Bild oder einen Ausschnitt; außerhalb bleibt der Beamer schwarz. „Raster zum Ausrichten“ legt das Raster-Testbild verzerrt auf die Leinwände. „Form“: 4 Ecken oder Raster 3×3/5×5 für runde und gewölbte Flächen (Punkte einzeln ziehen, weich gekrümmt). „+ Maske“: Vieleck (bis 32 Punkte, Doppelklick fügt einen Punkt ein, Entf löscht), „Innen schwärzen“ oder „Nur innen zeigen“, weiche Kante. „Bühnenfoto …“ legt ein Foto (vom Beamer aus) halbdurchsichtig hinter die Leinwände, nur im Editor |
| Fenster-Ausgang | AUSGABE → Bildschirme → Fenster-Ausgang: normales Fenster mit fester Bildgröße (720p bis 4K, hochkant) statt Vollbild, für OBS, NDI-Werkzeuge oder Syphon Recorder per Fensteraufnahme. Wie ein Beamer in Leinwand und Projektionsmapping nutzbar |
| Bilder | Im Mapping-Modus zeigt „Ausgang“ im Tab VISUALS bis zu 5 Bilder als Live-Kacheln („+ Bild“, Doppelklick auf den Namen benennt um, × löscht). Klick auf ein Bild bearbeitet es (Clip-Raster, Ebenen, Effekte, Fader). Rechts unter „Leinwände“ wählt je Leinwand ein Dropdown, welches Bild darauf läuft (auch im Mapping-Editor, ganz oder als Ausschnitt). Szenen speichern und rufen alle Bilder ab, mit Überblendung. Regler unten in jeder Kachel: Helligkeit des Bilds. Fest belegbar (MIDI, OSC, Pult): bild.N.hell, bild.N.eK (Deckkraft Ebene K), bild.N.bearbeiten – wirken immer auf dasselbe Bild, egal welches gerade bearbeitet wird |
| Testbild | Im Tab AUSGABE, 9 Testbilder zum Durchschalten: Farbbalken, Raster, Raster über alle (eine Leinwand über alle Bildschirme), Nummern, Graustufen, Weiß, Rot, Grün, Blau. Mit Auflösung, Name und Lage je Ausgang. Per Mapping: Testbild, Nächstes, Voriges |
| SHOW | Ablauf mit Cues (Video, Bild, Schwarz, VJ-Szene, Timecode): WEITER (Leertaste), Zurück, Alles stoppen; Start von Hand / nach vorigem / mit vorigem + Wartezeit; Kürzen; Wiederholen aus / x-mal / bis WEITER / endlos, auch nur einen Bereich; Ende stehen bleiben / ausblenden / weiter; Einblenden, Lautstärke, Größe, Visuals aus oder darüber |
| Timeline | Cue-Optionen → „In Timeline umwandeln“ (Video, oder Bild/Schwarz mit Dauer): großer Editor unter der Cue-Liste mit Lineal, Video- und Szenen-Spur. Szenen setzen wie im Schnittprogramm: aus der Palette auf die Spur ziehen (4 s), Länge an den Rändern ziehen, Mitte ziehen verschiebt, Kanten rasten ein (⌥ ohne); oder antippen bzw. „Aufnehmen“ und Szenen live auslösen (Pads, Tasten, MIDI, Pult). In Lücken gilt die Szene, die beim Start lief. Helligkeit je Szenen-Block. Zweite Spur „Effekte“: Strobe, Flash, White, W-Flash, Blinder (statisch weiß), Blackout – ziehen, trimmen, verschieben wie Szenen. Entf löscht, Klick ins Lineal spult. Beim Abspielen werden die Szenen abgerufen (vorgegeben nur für die anderen Bilder). Kleine Timeline auch direkt in den Details jedes Video-Cues. Im Mapping-Modus wählt „läuft auf“ im SHOW-Tab das Bild für den Ablauf |

## Noch offen

Echtes Syphon/Spout (nativ; bis dahin Fenster-Ausgang), Laufschrift und Tracktitel aus LJ-Link, Tempo-Erkennung aus Audio, Regel-Editor, Pult-Profile (GDTF, grandMA2-XML), Fernbedienung im Browser, LJ-Link-Seite mit mDNS, SHOW-Vorlagen/Uhrzeit-Start/Probe-Modus/LTC, Installer und Signierung. Hardware-Tests (MIDI-Controller, MA, Beamer im Nebel) stehen aus. Reihenfolge und Aufwand siehe `docs/ROADMAP.md`.

## Starten

Voraussetzung: Node.js 22 oder neuer.

```bash
npm install
npm start
```

Nur die Oberfläche im Browser (ohne Netzwerk-Eingänge und ohne Mehrfach-Ausgänge):

```bash
npm run web
```

Prüfen:

```bash
npm run check
```

## Aufbau

```
src/core/      Reine Logik ohne Oberfläche: Takt, DMX, Art-Net, sACN, OSC, LJ-Link, Katalog, Show-Zustand
src/engine/    WebGL2-Renderer und Shader
src/main/      Electron: Fenster, Ausgänge, Netzwerk-Eingänge
src/renderer/  Oberfläche und Ausgangsfenster
tests/         Tests für src/core
docs/          Architektur, LJ-Link-Protokoll
```

## Technik-Entscheidung

Electron mit TypeScript und WebGL2. Gründe: nur Bausteine mit freizügigen Lizenzen (MIT, Apache, BSD), läuft auf macOS und Windows, jede Oberfläche ist zugleich die spätere Fernbedienung, und Ausgabe und Oberfläche laufen in getrennten Prozessen. Das Konzept sah zuerst Rust und wgpu vor. Die Engine ist so gekapselt (`src/engine`), dass sie später ersetzt werden kann, wenn die Leistung es verlangt.

## Lizenz

Noch nicht festgelegt. Bis dahin gilt: alle Rechte vorbehalten. Abhängigkeiten und ihre Lizenzen: `THIRD_PARTY.md`.
