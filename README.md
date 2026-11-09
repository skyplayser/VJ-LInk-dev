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
| Speichern | Arbeitsstand wird laufend gesichert. Projektdateien (.vjlink): Neu, Öffnen, Speichern, Speichern unter (Menü Ablage, ⌘N/⌘O/⌘S/⇧⌘S, Projektknopf oben), Grafiken in der Datei, Videos im Ordner „<Name> Medien“ daneben, zuletzt geöffnet, Hinweis auf ungespeicherte Änderungen |
| Visuals | 27 Generatoren aus der Wunschliste (alle außer „Silhouette“, die eine Kamera braucht) und 14 Laser-Visuals, Live-Vorschau im Clip-Raster mit Farbe und Effekten der Ebene |
| Laser | Kategorie für den Beamer als Showlaser im Nebel: ein Punkt im Bild wird ein Strahl, eine Linie eine Lichtfläche, ein Kreis ein Kegel. Strahlen-Fächer, Lichtdecke (Liquid Sky), Kegel/Tunnel, Laser-Welle, Strahlen-Matrix, Propeller, Laser-Figuren (Lissajous) und die Lichteffekt-Typen Moonflower, Derby, Scanner, RGB-Spots, Schneesturm, Polygon, Laser-Burst. Laser-Fläche und Laser-Fächer (Seitenansicht für Leinwände) stehen bei Licht und Raum. Effekt „Laser-Look“ macht aus jedem Visual dünne, satte Linien auf Schwarz. Laserfarben mit Wechsel alle 8 Beats oder eigene Farb-Slots, reines Schwarz. Je Ebene einstellbar: Höhe, Seite, Größe, Stärke (auch per Mapping) |
| Katalog | Alle 35 Visuals der Wunschliste und die Laser mit Status (`bereit` / `geplant`) |
| Takt | Quellen-Rangfolge LJ-Link → Ableton Link → OSC → MIDI → Audio → Tap, Tap-Tempo, Rückfall bei Ausfall ohne Phasensprung |
| Pult | Art-Net und sACN als Eingang, DMX-Belegung „Standard“ (70 Kanäle), nur geänderte Kanäle wirken, Kanalliste als CSV |
| OSC | Eingang auf Port 8000, Adressen `/vjlink/…` |
| LJ-Link | WebSocket-Eingang auf Port 9099, Deck-Zustand, Regeln „Wenn … dann …“, Privatsphäre-Modus |
| Ausgänge | Tab AUSGABE: ein Vollbild-Fenster pro Bildschirm, gemeinsame Takt-Uhr. Anordnung „Gleiches Bild auf allen“ oder „Leinwand“: Bildschirme frei anordnen (ziehen, einrasten, Werte eintippen, nebeneinander/untereinander), jeder Ausgang zeigt seinen Ausschnitt, Visuals, Videos und Cues laufen nahtlos über alle |
| Mapping | Wie Daslight: MAPPING → Tastatur, MIDI, DMX/Art-Net oder OSC (⇧⌘K/M/D/O). Alle zuweisbaren Elemente leuchten lila, anklicken, Eingang bewegen. Liste der Zuweisungen je Art, wird mit dem Projekt gespeichert. Clips, Szenen, Fader, Effekte, BPM |
| Modulation | MAPPING → Modulation (⇧⌘L): Regler anklicken, LFO im Takt (Sinus, Dreieck, Säge, Rechteck, Zufall, ¼–32 Beats) oder Audio-Band (Bass, Mitten, Höhen), Stärke. Der Regler schwingt um seine Position, modulierte Regler sind türkis umrandet. Wird mit dem Projekt gespeichert |
| Sperrmodus | Schloss oben rechts: während der Show nur bedienen (Fader, Clips, Szenen, Effekt-Stärken, GO, Blackout …), nichts löschen, hinzufügen, umbenennen oder laden. Entsperren: Schloss 1 Sekunde halten |
| MIDI | Controller per Web MIDI, Hot-Plug, Noten und CCs, LED-Rückmeldung, Vorlagen (APC mini mk2, APC mini, nanoKONTROL2), Export/Import der Zuweisungen, MIDI-Clock als Tempo-Quelle |
| Ebenen | 1 bis 8 Ebenen, hinzufügen und entfernen (Pult-Profil steuert Ebene 1–4). Jede Ebene hat ihre eigene Clip-Zeile, zusammengestellt aus der Bibliothek („+ Clips“), Clips per × aus der Zeile nehmen |
| Ebene | Panel rechts je Ebene: Antrieb Auto / Takt / Audio / Statisch (woher Pulsieren und Reaktion kommen), Farben Original, ein oder mehrere Slots (Reihenfolge wählbar), Verlauf, Regenbogen. Antrieb und Laser-Regler auch per Mapping |
| Audio | Audio-Eingang (Mikrofon, Line-In) für Equalizer und Oszilloskop oder alle Visuals, mit Pegel |
| Tempo | BPM anklicken und eintippen, Tempo-Quelle festlegen (Auto, LJ-Link, Ableton Link, OSC, Manuell), Ableton Link über Carabiner |
| Bedienung | Fader-Leiste (Master, Ebenen, Effekt, Strobe mit Speed und Intensität, Strobe White, Szenen, Tap, Blackout), jedes Element auch per OSC (`/vjlink/ctl/<id>`) |
| Oberfläche | VISUALS, SHOW, Bauen (Katalog), Ausgabe, Verbinden; Logo als App-Icon |
| Videos | MP4, MOV, M4V, WebM in die Bibliothek (Kopie im App-Ordner, gestreamt über vjmedia://). Nahtloser Loop mit zwei Abspielern. Als Clip mit Loop-Bereich, Takt-Loop (4–32 Beats), Größe, Ton. Läuft auf allen Ausgängen synchron |
| Timecode | Empfangen und Senden getrennt einschaltbar, auch gleichzeitig (Art-Net, MIDI-Timecode), 24/25/29,97 DF/30 fps. Empfangen: Cues starten per Timecode, Videos folgen (Spulen, Anhalten), Versatz. Senden: eigene Uhr oder Empfangenen weitergeben, z. B. an eine MA; Timecode-Cues im SHOW-Ablauf (Start ab Zeit, Stopp, Springen) und Mapping steuern die Uhr |
| Einstellungen | Zahnrad oben rechts: Audio-Eingang und -Ausgang, Timecode, MIDI-Geräte, DMX und Netzwerk, Oberfläche |
| Testbild | Im Tab AUSGABE, 9 Testbilder zum Durchschalten: Farbbalken, Raster, Raster über alle (eine Leinwand über alle Bildschirme), Nummern, Graustufen, Weiß, Rot, Grün, Blau. Mit Auflösung, Name und Lage je Ausgang. Per Mapping: Testbild, Nächstes, Voriges |
| SHOW | Ablauf mit Cues (Video, Bild, Schwarz, VJ-Szene, Timecode): WEITER (Leertaste), Zurück, Alles stoppen; Start von Hand / nach vorigem / mit vorigem + Wartezeit; Kürzen; Wiederholen aus / x-mal / bis WEITER / endlos, auch nur einen Bereich; Ende stehen bleiben / ausblenden / weiter; Einblenden, Lautstärke, Größe, Visuals aus oder darüber |

## Noch offen

Modulation der Effekt-Regler, Mapping (Ausschnitt, Eckpunkte, Raster), Video-Clips, mehrere Projekte, Ableton Link, Audio-Eingang, GDTF-/XML-Profile, Fernbedienung im Browser. MIDI-Controller als Nächstes. Reihenfolge und Aufwand siehe `docs/ROADMAP.md`.

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
