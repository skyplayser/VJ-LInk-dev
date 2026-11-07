# Architektur

## Prozesse

```
Hauptfenster (Oberfläche + Steuer-Kern)
  │  Eingänge: Art-Net, sACN, OSC, LJ-Link  ← Main-Prozess (src/main/network.ts)
  │  hält: ShowState, TempoClock, DmxDecoder, Regeln
  └─ sendet alle ~33 ms ein Frame (Show-Zustand + Takt-Ursprung) an den Main-Prozess
        └─ Main leitet es an alle Ausgangsfenster weiter
              └─ jedes Fenster rechnet das Bild selbst in seiner Auflösung (src/engine)
```

Alle Fenster teilen sich eine Takt-Uhr: Das Frame enthält `bpm`, `originMs` und `beatAtOrigin`. Jeder Ausgang rechnet daraus die Beat-Position für `Date.now()`. Dadurch zeigen alle Bildschirme dasselbe Bild, ohne dass Bilder übertragen werden.

Fällt das Hauptfenster aus, laufen die Ausgänge mit dem letzten Frame und der Takt-Uhr weiter.

## Sicherheit

- Fenster mit `contextIsolation`, `sandbox`, ohne Node-Zugriff und ohne Navigation.
- Content-Security-Policy ohne Fremdquellen.
- Das Preload-Skript gibt nur eine schmale Brücke (`VjBridge`) frei.
- Alle Netzwerk-Eingänge sind nur Empfang, jedes Paket wird geprüft (Länge, Kennung, Wertebereich) und bei Fehlern verworfen. WebSocket-Nachrichten sind auf 64 KB begrenzt.
- Der WebSocket-Port 9099 lauscht auf allen Netzwerkkarten, damit LJ-Link auf einem anderen Rechner senden kann. Eine Zugangssperre (PIN) ist noch offen.

## Pult hat Vorrang

Der DMX-Decoder wendet nur Kanäle an, deren Wert sich seit dem letzten Bild geändert hat. Wer zuletzt etwas bedient (Pult oder Oberfläche), gewinnt. Beim ersten Bild werden Kanäle mit Wert 0 übersprungen, außer bei Farbslots, damit ein frisch verbundenes Pult nicht alles schwarz schaltet.

## Nächste Schritte (Reihenfolge)

1. Szenen-Übergänge (Überblenden über `transitionBeats`)
2. Effekt-Stapel pro Clip mit Modulation (Beat-LFO, Audio-Bänder) und die ersten Post-Effekte (Kaleidoskop, Feedback, Glitch, CRT)
3. Ausgänge: freie Auflösung, Ausschnitt, Eckpunkte-Mapping
4. Speichern und Laden von Projekten
5. Restliche Generatoren aus `src/core/effects.ts`
6. Audio-Eingang, MIDI-Clock und -Lernen
7. Profil-Export (GDTF, grandMA2-XML, Daslight)
8. Fernbedienung im Browser
9. Ableton Link (Lizenz klären, siehe `THIRD_PARTY.md`)
