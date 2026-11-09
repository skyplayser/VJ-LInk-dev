// Sprache der Oberfläche: Deutsch oder Englisch. Beim ersten Start aus der Systemsprache gewählt,
// im Startbildschirm umschaltbar. Texte stehen hier mit Schlüssel; fehlt eine Übersetzung, gilt Deutsch.

export type Lang = "de" | "en";
export const LANGS: readonly { id: Lang; label: string }[] = [
  { id: "de", label: "Deutsch" },
  { id: "en", label: "English" },
];

/** Systemsprache → Oberflächensprache: Deutsch für de-*, sonst Englisch. */
export function detectLang(langs: readonly string[]): Lang {
  for (const l of langs) {
    const k = l.toLowerCase().slice(0, 2);
    if (k === "de") return "de";
    if (k === "en") return "en";
  }
  return "en";
}

type Entry = { de: string; en: string };
const D: Record<string, Entry> = {
  // Startbildschirm
  "start.tag": { de: "Visuals, die das Lichtpult steuert.", en: "Visuals your lighting desk controls." },
  "start.continue": { de: "Weiterarbeiten", en: "Continue" },
  "start.new": { de: "Neues Projekt", en: "New project" },
  "start.new.sub": { de: "Start-Aufbau mit sechs Ebenen", en: "Starter setup with six layers" },
  "start.open": { de: "Projekt laden", en: "Open project" },
  "start.open.sub": { de: ".vjlink-Datei öffnen", en: "Open a .vjlink file" },
  "start.demo": { de: "Demo öffnen", en: "Open demo" },
  "start.demo.sub": { de: "Fertige Show: 8 Ebenen, 10 Szenen, Auto", en: "Ready show: 8 layers, 10 scenes, auto" },
  "start.gallery": { de: "Galerie", en: "Gallery" },
  "start.gallery.sub": { de: "Visuals, Effekte, Medien", en: "Visuals, effects, media" },
  "start.outputs": { de: "Ausgänge einrichten", en: "Set up outputs" },
  "start.outputs.sub": { de: "Beamer, LED-Wand, Mapping", en: "Projector, LED wall, mapping" },
  "start.mapping": { de: "Controller zuweisen", en: "Map controllers" },
  "start.mapping.sub": { de: "MIDI, DMX, OSC, Tastatur", en: "MIDI, DMX, OSC, keyboard" },
  "start.settings": { de: "Einstellungen", en: "Settings" },
  "start.settings.sub": { de: "Audio, Timecode, Netzwerk, Update", en: "Audio, timecode, network, update" },
  "start.recent": { de: "Zuletzt geöffnet", en: "Recently opened" },
  "start.recent.none": { de: "Noch keine Projekte gespeichert. Mit ⌘S wird das aktuelle Projekt zur Datei.", en: "No saved projects yet. Press ⌘S to save the current project as a file." },
  "start.recent.missing": { de: "Datei nicht gefunden", en: "File not found" },
  "start.recent.clear": { de: "Liste leeren", en: "Clear list" },
  "start.today": { de: "heute", en: "today" },
  "start.yesterday": { de: "gestern", en: "yesterday" },
  "start.showOnStart": { de: "Beim Start anzeigen", en: "Show on startup" },
  "start.foot": { de: "Version {v} · Esc: weiterarbeiten", en: "Version {v} · Esc: continue" },
  "start.lang": { de: "Sprache", en: "Language" },
  "start.love.title": { de: "Dir gefällt unser Programm?", en: "Enjoying VJ-Link?" },
  "start.love.text": { de: "Wir freuen uns über jede Erwähnung oder jedes Reel auf Instagram! Verlinke gerne @nextphilm.", en: "We love every mention or reel on Instagram! Feel free to tag @nextphilm." },
  "start.untitled": { de: "Unbenannt", en: "Untitled" },
  // Updates
  "upd.title": { de: "Update", en: "Update" },
  "upd.version": { de: "Installiert: Version {v}", en: "Installed: version {v}" },
  "upd.check": { de: "Nach Updates suchen", en: "Check for updates" },
  "upd.checking": { de: "Suche nach Updates …", en: "Checking for updates …" },
  "upd.latest": { de: "VJ-Link ist auf dem neuesten Stand.", en: "VJ-Link is up to date." },
  "upd.none": { de: "Noch keine Veröffentlichung vorhanden.", en: "No release published yet." },
  "upd.available": { de: "Version {v} ist da.", en: "Version {v} is available." },
  "upd.install": { de: "Laden und installieren", en: "Download and install" },
  "upd.page": { de: "Zur Download-Seite", en: "Open download page" },
  "upd.downloading": { de: "Lädt … {p} %", en: "Downloading … {p} %" },
  "upd.installing": { de: "Installiert, VJ-Link startet neu …", en: "Installing, VJ-Link restarts …" },
  "upd.error": { de: "Prüfen hat nicht geklappt", en: "Update check failed" },
  "upd.dev": { de: "Entwicklungsversion: Updates installiert nur die fertige App. Die Seite zeigt die neue Version.", en: "Development build: only the packaged app installs updates. The page shows the new version." },
  "upd.checked": { de: "Zuletzt geprüft {t}", en: "Last checked {t}" },
  "upd.onlyApp": { de: "Updates gibt es nur in der App.", en: "Updates are only available in the app." },
  // Einstellungen
  "set.title": { de: "Einstellungen", en: "Settings" },
  "set.audio": { de: "Audio", en: "Audio" },
  "set.timecode": { de: "Timecode", en: "Timecode" },
  "set.midi": { de: "MIDI", en: "MIDI" },
  "set.dmx": { de: "DMX und Netzwerk", en: "DMX and network" },
  "set.ui": { de: "Oberfläche", en: "Interface" },
  "set.update": { de: "Update", en: "Update" },
  "set.close": { de: "Schließen (Esc)", en: "Close (Esc)" },
  // Hauptreiter
  "tab.visuals": { de: "VISUALS", en: "VISUALS" },
  "tab.show": { de: "SHOW", en: "SHOW" },
  "tab.build": { de: "GALERIE", en: "GALLERY" },
  "tab.output": { de: "AUSGABE", en: "OUTPUT" },
  "tab.connect": { de: "VERBINDEN", en: "CONNECT" },
};

let current: Lang = "de";
export const getLang = (): Lang => current;
export function setLang(l: Lang): void { current = LANGS.some(x => x.id === l) ? l : "de"; }

/** Text zum Schlüssel in der aktuellen Sprache; {name} wird durch vars ersetzt. */
export function t(key: string, vars: Record<string, string | number> = {}): string {
  const e = D[key];
  const s = e ? e[current] || e.de : key;
  return s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}

/** Alle Schlüssel (für Tests: jede Übersetzung vorhanden). */
export const I18N_KEYS = (): string[] => Object.keys(D);
export const entry = (key: string): Entry | undefined => D[key];
