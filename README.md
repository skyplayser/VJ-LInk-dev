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
| Effekte | Effekt-Stapel pro Ebene (bis 6): Kaleidoskop, Spiegeln, RGB-Versatz, Glitch, Röhre, Pixel, Feedback, Leuchten, Beat-Zoom, Invertieren. Effekt 1–3 jeder Ebene per Pult, MIDI-Registry und OSC |
| Szenen | Eigene Szenen anlegen, umbenennen, überschreiben, sortieren, löschen. Übergang je Szene: Schnitt, Beats oder Sekunden, Überblenden oder über Schwarz. Abfolge: weiter nach Takten, Sekunden oder Phrasenwechsel (mit „Auto“). Auslöser: Tasten 1–9, Pfeile, Pult, OSC |
| Grafiken | Logos und Bilder (PNG, JPG, WebP, GIF, SVG) laden oder hineinziehen, Freistellen (weißen/schwarzen Hintergrund entfernen, wird erkannt), Größe, Lage, Drehung, Animation im Takt (Pulsieren, Drehen, Hüpfen, Schweben, Wackeln, Heranzoomen), Effekte und Farbüberlagerung |
| Speichern | Projekt und Grafiken werden automatisch gespeichert und beim Start geladen |
| Visuals | Live-Vorschau jedes Clips im Clip-Raster, mit Farbe und Effekten der Ebene. 8 Generatoren: Balken-Spektrum, Kreis-Equalizer, Oszilloskop, Pulsierende Ringe, Tunnel, Synthwave-Raster, Sternenfeld, Plasma |
| Katalog | Alle 35 Visuals der Wunschliste mit Status (`bereit` / `geplant`) |
| Takt | Quellen-Rangfolge LJ-Link → Ableton Link → OSC → MIDI → Audio → Tap, Tap-Tempo, Rückfall bei Ausfall ohne Phasensprung |
| Pult | Art-Net und sACN als Eingang, DMX-Belegung „Standard“ (70 Kanäle), nur geänderte Kanäle wirken, Kanalliste als CSV |
| OSC | Eingang auf Port 8000, Adressen `/vjlink/…` |
| LJ-Link | WebSocket-Eingang auf Port 9099, Deck-Zustand, Regeln „Wenn … dann …“, Privatsphäre-Modus |
| Ausgänge | Ein Vollbild-Fenster pro Bildschirm, gemeinsame Takt-Uhr, Testbild |
| Mapping | Wie Daslight: MAPPING → Tastatur, MIDI, DMX/Art-Net oder OSC (⇧⌘K/M/D/O). Alle zuweisbaren Elemente leuchten lila, anklicken, Eingang bewegen. Liste der Zuweisungen je Art, wird mit dem Projekt gespeichert. Clips, Szenen, Fader, Effekte, BPM |
| MIDI | Controller per Web MIDI, Hot-Plug, Noten und CCs, LED-Rückmeldung, Vorlagen (APC mini mk2, APC mini, nanoKONTROL2), Export/Import der Zuweisungen, MIDI-Clock als Tempo-Quelle |
| Ebenen | 1 bis 8 Ebenen, hinzufügen und entfernen (Pult-Profil steuert Ebene 1–4) |
| Tempo | BPM anklicken und eintippen, Tempo-Quelle festlegen (Auto, LJ-Link, Ableton Link, OSC, Manuell), Ableton Link über Carabiner |
| Bedienung | Fader-Leiste (Master, Ebenen, Effekt, Strobe mit Speed und Intensität, Strobe White, Szenen, Tap, Blackout), jedes Element auch per OSC (`/vjlink/ctl/<id>`) |
| Oberfläche | Show, Bauen (Katalog), Ausgabe, Verbinden; Logo als App-Icon |

## Noch offen

Modulation der Effekt-Regler, Mapping (Ausschnitt, Eckpunkte, Raster), Video-Clips, mehrere Projekte, Ableton Link, Audio-Eingang, GDTF-/XML-Profile, Fernbedienung im Browser, die 27 weiteren Visuals. MIDI-Controller als Nächstes. Reihenfolge und Aufwand siehe `docs/ROADMAP.md`.

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
