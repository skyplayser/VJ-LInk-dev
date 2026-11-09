# Drittanbieter-Bausteine

Stand: Grundgerüst 0.1.0. Vor jeder Veröffentlichung mit `npm ls --all` und den Lizenzdateien in `node_modules` gegenprüfen.

| Baustein | Zweck | Lizenz |
|---|---|---|
| Electron | Desktop-Rahmen (enthält Chromium und Node.js) | MIT |
| ws | WebSocket-Server für LJ-Link | MIT |
| MediaPipe Tasks Vision (@mediapipe/tasks-vision) | Personen-Erkennung für Kamera-Looks (Silhouette, Umriss, Masken), läuft lokal | Apache-2.0 |
| MediaPipe Selfie Segmenter (Modell `vendor/mediapipe/selfie_segmenter.tflite`) | Modell der Personen-Erkennung | Apache-2.0 |
| esbuild | Bauen (nur Entwicklung) | MIT |
| TypeScript | Typprüfung (nur Entwicklung) | Apache-2.0 |
| Vitest | Tests (nur Entwicklung) | MIT |

## Bewusst nicht enthalten

- **Ableton Link SDK:** GPL-2.0-oder-später, oder kommerzielle Lizenz von Ableton. VJ-Link enthält keinen Link-Code. Es verbindet sich per TCP (Port 17000) mit **Carabiner** (Deep Symmetry, GPL), das als eigenes Programm läuft. Soll Carabiner mitgeliefert werden: als getrenntes Programm mit Lizenztext und Quelltext-Hinweis, oder eine kommerzielle Link-Lizenz bei Ableton anfragen.
- **NDI SDK:** eigene Lizenzbedingungen von Vizrt. Nicht eingebaut.
- **Syphon (macOS) und Spout (Windows):** jeweils eigene, freizügige Lizenzen; noch nicht eingebaut.
- **Videoformate:** Electron liefert Chromium mit FFmpeg. H.264 und H.265 sind patentbelastet. Bei Videowiedergabe vor einer Veröffentlichung klären, oder auf HAP und freie Formate setzen.
- **Schriften und Bilder:** Es werden nur Systemschriften verwendet. Alle Generatoren sind selbst geschrieben.
- **Gerätenamen:** „grandMA“, „Daslight“ u. a. sind Marken ihrer Hersteller und dürfen nur zur Beschreibung der Kompatibilität genannt werden.
