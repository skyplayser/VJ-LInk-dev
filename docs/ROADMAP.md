# Roadmap: Schritt für Schritt zu VJ-Link 1.0

Leitsatz: **Alles, was man während der Show braucht, ist mit einem Griff erreichbar** (Fader, Taste, MIDI-Controller, Pult, OSC) und nie hinter einem Menü versteckt.

Dafür gibt es eine zentrale Liste aller Bedienelemente, die **Control-Registry** (`src/core/controls.ts`). Jedes Element hat eine feste ID (z. B. `strobe.speed`, `layer.2.opacity`, `scene.4`). Oberfläche, MIDI, OSC und Pult greifen alle auf diese Liste zu. Neue Funktionen sind damit automatisch auf Fadern, Tasten und Controllern verfügbar.

Aufwand: S = ein Abend, M = zwei bis drei Abende, L = eine Woche oder mehr.

## Phase 1: Bedienbarkeit (fertig, Hardware-Test steht aus)

| # | Schritt | Inhalt | Aufwand | Stand |
|---|---|---|---|---|
| 1.1 | Control-Registry | Eine Liste aller Regler und Tasten mit ID, Name, Typ (Fader, Schalter, Taste, Halten) | S | erledigt |
| 1.2 | Strobe richtig | Geschwindigkeit, Intensität, Takt-Sync oder freie Hz, Ein/Aus, Flash zum Halten, auch per Pult und OSC | S | erledigt |
| 1.3 | Fader-Leiste | Immer sichtbare Leiste: Master, Strobe, Ebenen, Effekt, Szenen, Blackout, Tap | S | erledigt |
| 1.4 | App-Icon | Logo im Dock, in der Taskleiste und im Fenster | S | erledigt |
| 1.5 | **MIDI-Controller** | Geräte erkennen, Hot-Plug, Mapping-Modus wie Daslight für Tastatur, MIDI, DMX und OSC, Zuordnung speichern, LED-Rückmeldung | M | erledigt (ungetestet an Hardware) |
| 1.6 | Controller-Vorlagen | APC mini mk2, APC mini, nanoKONTROL2; Zuweisungen exportieren und importieren. Launchpad/APC40 folgen (brauchen SysEx bzw. Gerät zum Testen) | M | erledigt (ungetestet an Hardware) |
| 1.7 | MIDI-Clock | Tempo und Start von MIDI-Clock als Takt-Quelle | S | erledigt |

Fertig, wenn: ein Controller ohne Maus die ganze Show fährt, und jede Zuordnung nach einem Neustart noch da ist.

## Phase 2: Speichern und Szenen (fertig)

| # | Schritt | Inhalt | Aufwand |
|---|---|---|---|
| 2.1 | Projekte | Automatisch sichern; Projektdateien (.vjlink) neu, öffnen, speichern, speichern unter, zuletzt geöffnet; Grafiken in der Datei, Videos im Medienordner; Ausgänge und Modulationen gehören dazu | M | erledigt |
| 2.2 | Szenen bearbeiten | Speichern, benennen, sortieren, löschen; Übergang je Szene (Beats/Sekunden, über Schwarz); Abfolge nach Takten, Sekunden, Phrase | M | erledigt |
| 2.3 | Überblendung | Szenenwechsel im Takt über 0 bis 8 Beats | M | erledigt |
| 2.4 | Sperrmodus | Schloss oben: nur noch bedienen (Fader, Clips, Szenen, GO …), nichts ändern; Entsperren durch 1 s Halten | S | erledigt |

## Phase 3: Effekt-Editor (fertig)

| # | Schritt | Inhalt | Aufwand |
|---|---|---|---|
| 3.1 | Effekt-Stapel | Pro Ebene bis zu 6 Effekte, Reihenfolge, einzeln abschaltbar, Live-Vorschau im Clip-Raster | L | erledigt |
| 3.2 | Erste Post-Effekte | Kaleidoskop, Spiegeln, RGB-Versatz, Feedback, Glitch, Röhre, Pixel, Leuchten, Beat-Zoom, Invertieren | L | erledigt |
| 3.3 | Modulation | Regler anklicken und an LFO im Takt (Sinus, Dreieck, Säge, Rechteck, Zufall, ¼–32 Beats) oder Audio-Band (Bass, Mitten, Höhen) hängen; MIDI, DMX, OSC über das Mapping | M | erledigt |
| 3.4 | Restliche Generatoren | Alle Visuals der Liste bis auf „Silhouette“ (braucht Kamera) | L | erledigt |

## Phase 4: Ausgänge und Mapping

| # | Schritt | Inhalt | Aufwand |
|---|---|---|---|
| 4.1 | Ausgänge | Freie Auflösung pro Ausgang, Ausschnitt aus der Leinwand (erledigt: Leinwand mit frei angeordneten Bildschirmen, Testbilder zum Ausrichten) | M |
| 4.2 | Eckpunkte | Vier Ecken ziehen, Beamer-Trapez ausgleichen | M |
| 4.3 | Raster und Masken | 3×3 und 5×5 Punkte, Masken, Bühnenfoto als Hilfe | L |
| 4.4 | Syphon und Spout | Bild an andere Programme weitergeben | M |

## Phase 5: Medien und Text

| # | Schritt | Inhalt | Aufwand |
|---|---|---|---|
| 5.1 | Bilder und Videos | Bilder/Logos und Videos (Clip mit Takt-Loop, SHOW-Ablauf) erledigt. Offen: Lizenzfrage H.264 klären, nahtloser Loop mit zwei Abspielern | L | erledigt |
| 5.2 | Text | DJ-Name, Logo, Laufschrift, Tracktitel aus LJ-Link | M |
| 5.3 | Auto-VJ | Szenenwechsel bei Phrasen oder alle n Takte | S | erledigt |

## Phase 6: Anbindung vertiefen

| # | Schritt | Inhalt | Aufwand |
|---|---|---|---|
| 6.1 | LJ-Link-Seite | Der Ausgang „VJ-Link“ in LJ-Link selbst, mit Finden im Netzwerk (mDNS) | M |
| 6.2 | Regel-Editor | Wenn-dann-Regeln in der Oberfläche bearbeiten | M |
| 6.3 | Pult-Profile | GDTF, grandMA2-XML, Daslight-Profil, Test an echten Pulten | L |
| 6.4 | Fernbedienung | Tablet und Handy im Browser, mit PIN | M |
| 6.5 | Ableton Link | Über Carabiner (separates Programm). Offen: Carabiner mitliefern (GPL, Quelltext beilegen) oder Lizenz von Ableton | M | teilweise |
| 6.6 | Audio-Eingang | Beat-Erkennung und Bänder von Mikrofon oder Line-In | M |

## Phase 7: Release

| # | Schritt | Inhalt | Aufwand |
|---|---|---|---|
| 7.1 | Installer | macOS (Apple Silicon und Intel) und Windows, Signierung, Update-Prüfung | L |
| 7.2 | Leistungstest | 4 Ebenen, 3 Ausgänge, 60 fps auf Mittelklasse-Hardware | M |
| 7.3 | Praxistest | Eine echte Veranstaltung mit grandMA und Daslight | M |
| 7.4 | Lizenz und Rechtliches | Lizenz festlegen, Drittanbieter prüfen, README und Doku | S |

## Heute

1.1 bis 1.4 in dieser Reihenfolge. Danach steht die Grundlage für MIDI (1.5), das beim nächsten Mal beginnt.

## SHOW (Video-Ablauf), siehe docs/video-ablauf-konzept.html

| Stufe | Inhalt | Stand |
|---|---|---|
| 1 | Video als Clip (Loop-Bereich, Takt-Loop, Größe, Ton) | erledigt |
| 2 | Ablauf-Ansicht SHOW: Cues, WEITER, Start/Ende, Kürzen, Loops, Blenden | erledigt |
| 3 | Timecode empfangen und senden, auch gleichzeitig (Art-Net, MTC), Videos folgen dem Timecode, Timecode-Cues steuern die eigene Uhr (z. B. für eine MA) | erledigt (an Pulten noch zu testen) |
| 4 | Vorlagen, Uhrzeit-Start, Signal-Cues, LTC, Probe-Modus, Sperre | offen |
| 5 | Ausgang pro Cue (hängt an Mapping 4.1–4.3), Umwandeln | offen |
