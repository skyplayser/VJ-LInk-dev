# Drittanbieter-Bausteine

Stand: Grundgerüst 0.1.0. Vor jeder Veröffentlichung mit `npm ls --all` und den Lizenzdateien in `node_modules` gegenprüfen.

| Baustein | Zweck | Lizenz |
|---|---|---|
| Electron | Desktop-Rahmen (enthält Chromium und Node.js) | MIT |
| ws | WebSocket-Server für LJ-Link | MIT |
| esbuild | Bauen (nur Entwicklung) | MIT |
| TypeScript | Typprüfung (nur Entwicklung) | Apache-2.0 |
| Vitest | Tests (nur Entwicklung) | MIT |

## Bewusst nicht enthalten

- **Ableton Link SDK:** GPL-2.0-oder-später, oder kommerzielle Lizenz von Ableton. Wird erst eingebaut, wenn die Lizenz von VJ-Link feststeht. Bis dahin kommt der Takt aus LJ-Link, OSC, MIDI, Audio oder Tap. (LJ-Link steht unter EPL-2.0, die sich mit der GPL nicht ohne Weiteres mischen lässt.)
- **NDI SDK:** eigene Lizenzbedingungen von Vizrt. Nicht eingebaut.
- **Syphon (macOS) und Spout (Windows):** jeweils eigene, freizügige Lizenzen; noch nicht eingebaut.
- **Videoformate:** Electron liefert Chromium mit FFmpeg. H.264 und H.265 sind patentbelastet. Bei Videowiedergabe vor einer Veröffentlichung klären, oder auf HAP und freie Formate setzen.
- **Schriften und Bilder:** Es werden nur Systemschriften verwendet. Alle Generatoren sind selbst geschrieben.
- **Gerätenamen:** „grandMA“, „Daslight“ u. a. sind Marken ihrer Hersteller und dürfen nur zur Beschreibung der Kompatibilität genannt werden.
