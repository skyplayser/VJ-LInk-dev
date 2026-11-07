# VJ-Link

Einfache VJ-Software für LJs. Das Lichtpult steuert die Visuals, der Takt kommt aus LJ-Link, Ableton Link, OSC oder MIDI. Schwesterprojekt von [LJ-Link](https://github.com/skyplayser/LJ-Link).

> Stand: **Grundgerüst** (Version 0.1.0). Lauffähig, aber noch kein fertiges Programm.

## Was schon läuft

| Bereich | Stand |
|---|---|
| Engine | WebGL2-Compositor mit 4 Ebenen, Mischmodi (Normal, Addieren, Bildschirm, Multiplizieren), Deckkraft, Farbquellen (Slot A–E, Verlauf, Regenbogen), Master, Strobe, Blackout |
| Visuals | 8 Generatoren: Balken-Spektrum, Kreis-Equalizer, Oszilloskop, Pulsierende Ringe, Tunnel, Synthwave-Raster, Sternenfeld, Plasma |
| Katalog | Alle 35 Visuals der Wunschliste mit Status (`bereit` / `geplant`) |
| Takt | Quellen-Rangfolge LJ-Link → Ableton Link → OSC → MIDI → Audio → Tap, Tap-Tempo, Rückfall bei Ausfall ohne Phasensprung |
| Pult | Art-Net und sACN als Eingang, DMX-Belegung „Standard“ (68 Kanäle), nur geänderte Kanäle wirken, Kanalliste als CSV |
| OSC | Eingang auf Port 8000, Adressen `/vjlink/…` |
| LJ-Link | WebSocket-Eingang auf Port 9099, Deck-Zustand, Regeln „Wenn … dann …“, Privatsphäre-Modus |
| Ausgänge | Ein Vollbild-Fenster pro Bildschirm, gemeinsame Takt-Uhr, Testbild |
| Oberfläche | Show, Bauen (Katalog), Ausgabe, Verbinden |

## Noch offen

Effekt-Editor, Mapping (Ausschnitt, Eckpunkte, Raster), Video-Clips, Szenen-Übergänge (der Wert wird gelesen, aber noch nicht überblendet), Ableton Link, MIDI, Audio-Eingang, GDTF-/XML-Profile, Fernbedienung im Browser, die 27 weiteren Visuals. Reihenfolge siehe `docs/ARCHITEKTUR.md`.

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
