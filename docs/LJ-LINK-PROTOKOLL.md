# LJ-Link → VJ-Link (Entwurf, Version 1)

LJ-Link bekommt einen neuen Ausgang „VJ-Link“. Er verbindet sich als WebSocket-Client mit VJ-Link (`ws://<Rechner>:9099`) und sendet JSON-Nachrichten. VJ-Link sendet nichts zurück. Die Typen stehen in `src/core/ljlink.ts` (`LjMessage`), geprüft wird in `parseLjMessage`.

| `t` | Felder | Wann |
|---|---|---|
| `hello` | `version` (1), `privacy` (bool), `app` | direkt nach dem Verbinden |
| `tempo` | `bpm`, `beat` (fortlaufend, 0-basiert), `masterDeck` | ca. 30× pro Sekunde |
| `deck` | `deck`: `{deck, model?, playing, onAir, master, bpm, key?, phrase?, position?, title?, artist?}` | bei Änderung, mindestens 1× pro Sekunde |
| `event` | `kind: "track" \| "phrase" \| "cue" \| "loop"` plus Felder je Art | sofort |
| `wave` | `deck`, `bass`, `mid`, `high` (0–1) | ca. 30× pro Sekunde, nur Master-Deck nötig |

Beispiele:

```json
{"t":"hello","version":1,"privacy":false,"app":"LJ-Link 1.x"}
{"t":"tempo","bpm":128.0,"beat":512.25,"masterDeck":2}
{"t":"event","kind":"phrase","deck":2,"phrase":"chorus"}
{"t":"event","kind":"cue","deck":1,"cue":"C"}
{"t":"wave","deck":2,"bass":0.82,"mid":0.31,"high":0.12}
```

Regeln:
- Ist `privacy` wahr, sendet LJ-Link keinen Titel, keinen Artist und kein Cover. VJ-Link verwirft sie zusätzlich selbst.
- `beat` bezieht sich auf das Beatgrid des Master-Decks. Der erste Schlag eines Taktes hat eine durch 4 teilbare Zahl, sofern LJ-Link die Taktanfänge kennt.
- Fehlt LJ-Link länger als 2,5 s, schaltet der Takt in VJ-Link ohne Sprung auf „manuell“ und übernimmt wieder, sobald Daten kommen.
- Noch offen: automatisches Finden per mDNS, Zugangssperre.
