# Drittanbieter-Bausteine

Stand: Beta 0.1.3. VJ-Link selbst steht unter der Eclipse Public License 2.0 (`LICENSE`). Der Bau (`npm run build`) erzeugt `dist/THIRD_PARTY_LICENSES.txt` mit den Lizenztexten aller Laufzeit-Pakete aus `package-lock.json` und bricht ab, wenn einer fehlt. Die App liefert diese Datei und `LICENSE` neben `app.asar` mit (Hilfe → Lizenzen und Hinweise); der Windows-Installer zeigt die Lizenz als eigene Seite.

## Mitgeliefert (Laufzeit)

| Baustein | Zweck | Lizenz |
|---|---|---|
| Electron | Desktop-Rahmen (enthält Chromium, FFmpeg und Node.js); Hinweise in `LICENSE.electron.txt` und `LICENSES.chromium.html` im Programmordner | MIT (Chromium: BSD u. a.) |
| ws | WebSocket-Server für LJ-Link | MIT |
| bonjour-service | LJ-Link im Netz finden (Bonjour/mDNS) | MIT |
| ↳ multicast-dns, dns-packet, @leichtgewicht/ip-codec, thunky, fast-deep-equal | Abhängigkeiten von bonjour-service | MIT |
| MediaPipe Tasks Vision (@mediapipe/tasks-vision) | Personen-Erkennung für Kamera-Looks (Silhouette, Umriss, Masken), läuft lokal; Lizenztext in `vendor/mediapipe/LICENSE` | Apache-2.0 |
| MediaPipe Selfie Segmenter (Modell `vendor/mediapipe/selfie_segmenter.tflite`) | Modell der Personen-Erkennung | Apache-2.0 |
| Inter Display ExtraBold (`assets/fonts`) | Schriftzug in Logo und App-Icon, in Pfade umgewandelt | SIL Open Font License 1.1 (`assets/fonts/Inter-OFL.txt`) |

## Nur zum Entwickeln

| Baustein | Zweck | Lizenz |
|---|---|---|
| esbuild | Bauen | MIT |
| TypeScript | Typprüfung | Apache-2.0 |
| Vitest | Tests | MIT |
| electron-builder | Installer | MIT |
| fontTools (Python, `scripts/logo`) | Logo-Schrift in Pfade umwandeln | MIT |

## Shader credits

- Signed distance functions sdHex, sdTri and sdBox3, the domain-warping offsets in domainWarp, ink and liquidLight, and the cosine color palette follow the articles of Inigo Quilez (https://iquilezles.org/articles/). MIT License, Copyright (c) Inigo Quilez.
- Settings icon in the start screen: based on the "settings" icon of Feather (https://github.com/feathericons/feather). MIT License, Copyright (c) 2013-2023 Cole Bemis.
- hash(): a common GLSL hash idiom, as popularized by "The Art of Code" (Martijn Steinrucken).

The full MIT license texts are in `vendor/licenses/` and in THIRD_PARTY_LICENSES.txt, which ships with the program. All other generators are written for VJ-Link. "Water caustics" and "Apollonian" were rewritten in 0.1.3 with an own approach (moving Voronoi cells; circle inversion in the dual circles of a Descartes configuration).

## Protokolle und Marken

- **Art-Net™ Designed by and Copyright Artistic Licence Holdings Ltd.** VJ-Link empfängt Art-Net als Eingang (eigene Umsetzung des offenen Protokolls).
- **sACN (ANSI E1.31), OSC, MIDI:** offene Protokolle, eigene Umsetzung.
- **Marken:** VJ-Link ist ein unabhängiges Projekt und kein offizielles Produkt der genannten Hersteller; es wird von ihnen weder unterstützt noch geprüft. Alle genannten Produktnamen und Marken gehören ihren jeweiligen Inhabern und werden nur genannt, um die Kompatibilität zu beschreiben. Ableton und Link sind Marken der Ableton AG.

## Bewusst nicht enthalten

- **Ableton Link SDK:** GPL-2.0-oder-später, oder kommerzielle Lizenz von Ableton. VJ-Link enthält keinen Link-Code. Es verbindet sich per TCP (Port 17000) mit **Carabiner** (Deep Symmetry, GPL), das als eigenes Programm läuft. Soll Carabiner mitgeliefert werden: als getrenntes Programm mit Lizenztext und Quelltext-Hinweis, oder eine kommerzielle Link-Lizenz bei Ableton anfragen.
- **NDI SDK:** eigene Lizenzbedingungen von Vizrt. Nicht eingebaut; NDI und Syphon nur über OBS-Plugins oder andere Zusatzprogramme, die den Fenster-Ausgang abgreifen.
- **Syphon (macOS) und Spout (Windows):** jeweils eigene, freizügige Lizenzen; noch nicht eingebaut.
- **Videoformate:** Die Videodekodierung (H.264, HEVC, VP9, AV1) macht Chromium bzw. das Betriebssystem in Electron; VJ-Link liefert keinen eigenen Codec. Hinweise zu Chromium und FFmpeg: `LICENSES.chromium.html`.
- **Schriften der Oberfläche:** Die Oberfläche nutzt die Systemschrift des Rechners (nicht mitgeliefert).

## Herkunft prüfen

Bei markanten Algorithmen, Shadern, Protokoll-Code oder ungewöhnlichen Konstanten vor dem Commit die Herkunft prüfen (GitHub-Codesuche nach den Konstanten). Übernehmen nur mit passender Lizenz und Nennung hier.
