import { promises as fsp } from "node:fs";
import { BrowserWindow, Menu, app, dialog, ipcMain, nativeImage, powerSaveBlocker, protocol, screen, session, shell, systemPreferences, type Display, type MenuItemConstructorOptions } from "electron";
import path from "node:path";
import { Network } from "./network";
import { Storage } from "./storage";
import { LinkClient } from "./link";
import { ProjectFiles } from "./projectfile";
import { Updater } from "./updater";
import { PROJECT_EXT } from "../core/projectfile";
import { WINDOW_OUTPUT, WINDOW_SIZES, type ControlEvent, type DisplayInfo, type Frame, type MediaEvent, type NetConfig } from "../core/frame";
import { LANGS, detectLang, setLang, t, type Lang } from "../core/i18n";

// Eigenes Protokoll für Videos: streamt aus dem Bibliotheksordner, spulbar, für WebGL freigegeben.
protocol.registerSchemesAsPrivileged([
  { scheme: "vjmedia", privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, corsEnabled: true } },
  // Mitgelieferte Laufzeit und Modell der Personen-Erkennung (nur der Ordner dist/renderer/vendor)
  { scheme: "vjasset", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

let control: BrowserWindow | null = null;
const outputs = new Map<number, BrowserWindow>();
let net: Network | null = null;
let lastFrame: Frame | null = null;
let storage: Storage | null = null;
let files: ProjectFiles | null = null;
const updater = new Updater(st => { if (control && !control.isDestroyed()) control.webContents.send("update", st); });
/** Live-Grafiken (nicht gespeichert): zuletzt gesendeter Stand je ID, für neu geöffnete Ausgänge. */
const liveMedia = new Map<string, MediaEvent>();
const LIVE_IDS = new Set(["nowplaying", "djwave"]);
/** Während ein Projekt geladen oder neu angelegt wird: Sicherungen der alten Oberfläche ignorieren. */
let switching = false;

// Logo für Fenster (Windows, Linux) und Dock (macOS). Die Installer nutzen build/icon.icns und build/icon.ico.
const ICON = path.join(__dirname, "..", "icon.png");
app.setName("VJ-Link");
// Nur eine VJ-Link-Instanz: eine zweite würde dieselben Ports (Art-Net, OSC) und dieselben Projektdateien benutzen.
// Für Tests mit eigenem Datenordner (VJLINK_DATA) gilt das nicht.
if (!process.env.VJLINK_DATA && !app.requestSingleInstanceLock()) app.exit(0);
app.on("second-instance", () => {
  if (!control || control.isDestroyed()) return;
  if (control.isMinimized()) control.restore();
  control.show(); control.focus();
});
// URL-Schema vjlink://focus: z. B. LJ-Link holt VJ-Link damit nach vorn (gemeinsamer Status)
if (process.defaultApp && process.argv[1]) app.setAsDefaultProtocolClient("vjlink", process.execPath, [path.resolve(process.argv[1])]);
else app.setAsDefaultProtocolClient("vjlink");
app.on("open-url", (e, url) => {
  e.preventDefault();
  if (!/^vjlink:\/\/focus\/?$/.test(url) || !control) return;
  if (control.isMinimized()) control.restore();
  control.show(); control.focus();
  if (process.platform === "darwin") app.focus({ steal: true });
});

const rendererFile = (name: string) => path.join(__dirname, "..", "renderer", name);

function secureWindow(opts: Electron.BrowserWindowConstructorOptions): BrowserWindow {
  const win = new BrowserWindow({
    ...opts,
    backgroundColor: "#0C0E13",
    icon: ICON,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false,
    },
  });
  // Keine Navigation und keine neuen Fenster: die App lädt nur ihre eigenen Dateien.
  win.webContents.on("will-navigate", e => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  return win;
}

/** Entwurfsgröße der Oberfläche. Größere Fenster vergrößern alles, kleinere verkleinern es (Zoom). */
const DESIGN_W = 1440, DESIGN_H = 900;
let uiScale: "auto" | number = "auto";
let scaleWatch = false;

function applyScale(): void {
  if (!control || control.isDestroyed()) return;
  const [w, h] = control.getContentSize();
  const auto = Math.min(w! / DESIGN_W, h! / DESIGN_H);
  const f = uiScale === "auto" ? Math.min(3, Math.max(0.7, auto)) : uiScale;
  const r = Math.round(f * 100) / 100;
  if (Math.abs(control.webContents.getZoomFactor() - r) > 0.005) control.webContents.setZoomFactor(r);
}

function createControl(): void {
  // Startet auf dem Hauptbildschirm und nutzt dessen Fläche; Ausgänge kommen auf die anderen Bildschirme.
  const wa = screen.getPrimaryDisplay().workArea;
  const width = Math.round(wa.width * 0.92), height = Math.round(wa.height * 0.92);
  control = secureWindow({
    x: wa.x + Math.round((wa.width - width) / 2), y: wa.y + Math.round((wa.height - height) / 2),
    width, height, minWidth: 900, minHeight: 600, title: "VJ-Link",
  });
  control.loadFile(rendererFile("index.html"));
  control.webContents.on("did-finish-load", () => {
    applyScale(); switching = false; updateTitle();
    // LJ-Link PRO meldet Decks nur bei Änderungen: den bekannten Stand nachreichen
    setTimeout(() => net?.replayLj(), 500);
  });
  control.on("resize", applyScale);
  // Unter Windows kommt beim Maximieren oder bei geänderter Bildschirm-Skalierung nicht immer ein resize
  for (const ev of ["maximize", "unmaximize", "restore", "enter-full-screen", "leave-full-screen"] as const) control.on(ev as "maximize", () => setTimeout(applyScale, 50));
  if (!scaleWatch) { scaleWatch = true; screen.on("display-metrics-changed", () => setTimeout(applyScale, 50)); }
  // Absturz der Oberfläche: neu laden (Projekt ist automatisch gesichert, der Startbildschirm bleibt weg).
  control.webContents.on("render-process-gone", (_e, d) => {
    if (d.reason === "clean-exit" || !control || control.isDestroyed()) return;
    console.error("Oberfläche abgestürzt:", d.reason);
    setTimeout(() => { if (control && !control.isDestroyed()) control.webContents.reload(); }, 500);
  });
  // Beenden, während Ausgänge live sind: nachfragen (⌘Q aus Versehen mitten in der Show)
  let quitOk = false;
  control.on("close", e => {
    const live = [...outputs.values()].filter(w => !w.isDestroyed()).length;
    if (quitOk || live === 0 || !control) return;
    e.preventDefault();
    const r = dialog.showMessageBoxSync(control, {
      type: "warning", buttons: [t("Beenden"), t("Abbrechen")], defaultId: 1, cancelId: 1,
      message: t("{n} Ausgänge sind live. VJ-Link wirklich beenden?", { n: live }),
      detail: t("Die Bildschirme und Beamer werden dann schwarz."),
    });
    if (r === 0) { quitOk = true; app.quit(); }
  });
  control.on("closed", () => { control = null; for (const w of outputs.values()) w.close(); });
}

// ---- Projektdateien und Menü --------------------------------------------------------------

/** Sprache vom letzten Start (die Oberfläche meldet ihre Wahl), sonst Systemsprache. */
const langFile = () => path.join(app.getPath("userData"), "lang.txt");
async function savedLang(): Promise<Lang> {
  try { const s = (await fsp.readFile(langFile(), "utf8")).trim(); if (LANGS.some(x => x.id === s)) return s as Lang; } catch { /* erster Start */ }
  return detectLang(app.getPreferredSystemLanguages());
}
/** Projektname für Titel und Dialoge („Unbenannt“ in der gewählten Sprache). */
const projName = (): string => files?.current ? files.name : t("Unbenannt");

function updateTitle(): void {
  if (!control || control.isDestroyed() || !files) return;
  control.setTitle(`${projName()}${files.dirty ? " •" : ""} – VJ-Link`);
  if (process.platform === "darwin") {
    control.setDocumentEdited(files.dirty);
    control.setRepresentedFilename(files.current ?? "");
  }
}

type FileCmd = "new" | "open" | "save" | "saveAs" | "openPath";

/** Ungespeicherte Änderungen? Fragt: Speichern / Nicht speichern / Abbrechen. Gibt false bei Abbrechen. */
async function confirmDiscard(json: string): Promise<boolean> {
  if (!files?.dirty || !control) return true;
  const r = await dialog.showMessageBox(control, {
    type: "warning", buttons: [t("Speichern"), t("Nicht speichern"), t("Abbrechen")], defaultId: 0, cancelId: 2,
    message: t("Änderungen in „{name}“ speichern?", { name: projName() }),
    detail: t("Sonst gehen die Änderungen seit dem letzten Speichern verloren."),
  });
  if (r.response === 2) return false;
  if (r.response === 0) return (await saveTo(json, false)).ok;
  return true;
}

async function saveTo(json: string, askPath: boolean): Promise<{ ok: boolean; name?: string; message?: string }> {
  if (!files || !control) return { ok: false };
  let target = askPath ? null : files.current;
  // Nur im Testmodus (eigener Datenordner): Ziel ohne Dialog, für tests/e2e/smoke.cjs
  if (process.env.VJLINK_DATA && process.env.VJLINK_TEST_SAVE) target = process.env.VJLINK_TEST_SAVE;
  if (!target) {
    const r = await dialog.showSaveDialog(control, {
      title: t("Projekt speichern"), defaultPath: files.current ?? path.join(app.getPath("documents"), `${projName()}.${PROJECT_EXT}`),
      filters: [{ name: t("VJ-Link-Projekt"), extensions: [PROJECT_EXT] }],
    });
    if (r.canceled || !r.filePath) return { ok: false };
    target = r.filePath;
  }
  try {
    const res = await files.save(json, target);
    updateTitle(); buildMenu();
    if (res.missing?.length) void dialog.showMessageBox(control, { type: "warning", message: t("Projekt gespeichert, aber Videos fehlen"), detail: `${t("Nicht in der Bibliothek gefunden:")}\n${res.missing.join("\n")}` });
    return { ok: true, name: res.name };
  } catch (e) {
    void dialog.showMessageBox(control, { type: "error", message: t("Speichern fehlgeschlagen"), detail: (e as Error).message });
    return { ok: false, message: (e as Error).message };
  }
}

async function fileCommand(cmd: FileCmd, json: string, filePath?: string): Promise<{ ok: boolean; name?: string; message?: string }> {
  if (!files || !control) return { ok: false };
  if (cmd === "save" || cmd === "saveAs") return saveTo(json, cmd === "saveAs");
  if (!(await confirmDiscard(json))) return { ok: false };
  if (cmd === "new") {
    switching = true;
    await files.newProject();
  } else {
    let file = cmd === "openPath" ? filePath : undefined;
    if (!file) {
      const r = await dialog.showOpenDialog(control, {
        title: t("Projekt öffnen"), properties: ["openFile"], filters: [{ name: t("VJ-Link-Projekt"), extensions: [PROJECT_EXT] }],
        defaultPath: files.current ? path.dirname(files.current) : app.getPath("documents"),
      });
      if (r.canceled || !r.filePaths[0]) return { ok: false };
      file = r.filePaths[0];
    }
    switching = true;
    const res = await files.open(file);
    if (!res.ok) {
      switching = false;
      void dialog.showMessageBox(control, { type: "error", message: t("Projekt lässt sich nicht öffnen"), detail: res.message ?? "" });
      return { ok: false, message: res.message };
    }
    if (res.missing?.length) void dialog.showMessageBox(control, { type: "warning", message: t("Einige Videos fehlen"), detail: `${t("Diese Videos lagen nicht im Medienordner neben der Projektdatei:")}\n${res.missing.join("\n")}` });
  }
  buildMenu();
  // Ausgänge: Grafiken neu verteilen; Oberfläche lädt das Projekt frisch
  const media = await storage!.allMedia();
  for (const w of outputs.values()) if (!w.isDestroyed()) for (const item of media) w.webContents.send("media", { type: "add", item });
  control.webContents.reload();
  return { ok: true, name: files.name };
}

const menuSend = (cmd: string, arg?: string) => () => control?.webContents.send("menu", cmd, arg);

function buildMenu(): void {
  const mac = process.platform === "darwin";
  const recent: MenuItemConstructorOptions[] = (files?.recent ?? []).map(f => ({ label: path.basename(f, `.${PROJECT_EXT}`), sublabel: f, click: menuSend("openPath", f) }));
  const template: MenuItemConstructorOptions[] = [
    ...(mac ? [{
      label: "VJ-Link", submenu: [
        { role: "about", label: t("Über VJ-Link") }, { type: "separator" },
        { label: t("Einstellungen …"), accelerator: "Cmd+,", click: menuSend("settings") }, { type: "separator" },
        { role: "services", label: t("Dienste") }, { type: "separator" },
        { role: "hide", label: t("VJ-Link ausblenden") }, { role: "hideOthers", label: t("Andere ausblenden") }, { role: "unhide", label: t("Alle einblenden") },
        { type: "separator" }, { role: "quit", label: t("VJ-Link beenden") },
      ],
    } as MenuItemConstructorOptions] : []),
    {
      label: mac ? t("Ablage") : t("Datei"), submenu: [
        { label: t("Neues Projekt"), accelerator: "CmdOrCtrl+N", click: menuSend("new") },
        { label: t("Projekt öffnen …"), accelerator: "CmdOrCtrl+O", click: menuSend("open") },
        { label: t("Zuletzt geöffnet"), submenu: recent.length ? [...recent, { type: "separator" }, { label: t("Liste leeren"), click: () => { void files?.clearRecent().then(buildMenu); } }] : [{ label: t("Keine"), enabled: false }] },
        { type: "separator" },
        { label: t("Speichern"), accelerator: "CmdOrCtrl+S", click: menuSend("save") },
        { label: t("Speichern unter …"), accelerator: "Shift+CmdOrCtrl+S", click: menuSend("saveAs") },
        ...(mac ? [] : [{ type: "separator" } as MenuItemConstructorOptions, { label: t("Einstellungen …"), accelerator: "Ctrl+,", click: menuSend("settings") }, { type: "separator" } as MenuItemConstructorOptions, { role: "quit", label: t("Beenden") } as MenuItemConstructorOptions]),
      ],
    },
    {
      label: t("Bearbeiten"), submenu: [
        { role: "undo", label: t("Widerrufen") }, { role: "redo", label: t("Wiederholen") }, { type: "separator" },
        { role: "cut", label: t("Ausschneiden") }, { role: "copy", label: t("Kopieren") }, { role: "paste", label: t("Einsetzen") }, { role: "selectAll", label: t("Alles auswählen") },
      ],
    },
    {
      label: t("menu.view"), submenu: [
        { role: "togglefullscreen", label: t("Vollbild") },
        ...(app.isPackaged ? [] : [{ type: "separator" } as MenuItemConstructorOptions, { role: "reload", label: t("Neu laden") } as MenuItemConstructorOptions, { role: "toggleDevTools", label: t("Entwicklerwerkzeuge") } as MenuItemConstructorOptions]),
      ],
    },
    { label: t("Fenster"), role: "windowMenu", submenu: [{ role: "minimize", label: mac ? t("Im Dock ablegen") : t("Minimieren") }, { role: "zoom", label: t("Zoomen") }, ...(mac ? [{ type: "separator" } as MenuItemConstructorOptions, { role: "front", label: t("Alle nach vorne bringen") } as MenuItemConstructorOptions] : [{ role: "close", label: t("Schließen") } as MenuItemConstructorOptions])] },
    { label: t("Hilfe"), role: "help", submenu: [
      { label: t("Fehler melden …"), click: menuSend("report") },
      { label: t("Website und Anleitungen"), click: () => { void shell.openExternal("https://skyplayser.github.io/VJ-LINK/"); } },
      { label: "Discord", click: () => { void shell.openExternal("https://discord.gg/N6DMca4Bjk"); } },
      { type: "separator" },
      { label: t("Lizenzen und Hinweise"), click: () => openLicenses() },
      { label: t("Quellcode auf GitHub"), click: () => { void shell.openExternal("https://github.com/skyplayser/VJ-LInk-dev"); } },
    ] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/** Lizenzen und Hinweise: in der App neben app.asar (extraResources), in der Entwicklung in dist/. */
function openLicenses(): void {
  const file = app.isPackaged ? path.join(process.resourcesPath, "THIRD_PARTY_LICENSES.txt") : path.join(__dirname, "..", "THIRD_PARTY_LICENSES.txt");
  void shell.openPath(file);
}

function displayInfo(d: Display): DisplayInfo {
  return {
    id: d.id, label: d.label || t("Bildschirm {n}", { n: d.id }), width: d.size.width, height: d.size.height,
    scaleFactor: d.scaleFactor, primary: d.id === screen.getPrimaryDisplay().id, open: outputs.has(d.id),
  };
}
/** Fenster-Ausgang: gewünschte Größe in Pixeln (bei offenem Fenster zählt seine echte Größe). */
let winSize: [number, number] = [1920, 1080];
function windowInfo(): DisplayInfo {
  const w = outputs.get(WINDOW_OUTPUT);
  const sf = w && !w.isDestroyed() ? screen.getDisplayMatching(w.getBounds()).scaleFactor : 1;
  const [cw, ch] = w && !w.isDestroyed() ? w.getContentSize() : [winSize[0], winSize[1]];
  return { id: WINDOW_OUTPUT, label: t("Fenster-Ausgang"), width: w ? cw ?? winSize[0] : winSize[0], height: w ? ch ?? winSize[1] : winSize[1], scaleFactor: w ? sf : 1, primary: false, open: !!w, window: true };
}
const listDisplays = (): DisplayInfo[] => [...screen.getAllDisplays().map(displayInfo), windowInfo()];

function setWindowSize(w: number, h: number): DisplayInfo[] {
  if (!WINDOW_SIZES.some(([a, b]) => a === w && b === h)) return listDisplays();
  winSize = [w, h];
  const win = outputs.get(WINDOW_OUTPUT);
  if (win && !win.isDestroyed()) {
    const sf = screen.getDisplayMatching(win.getBounds()).scaleFactor;
    win.setContentSize(Math.round(w / sf), Math.round(h / sf));
  }
  return listDisplays();
}

/** Fenster-Ausgang öffnen: normales, verschiebbares Fenster mit fester Bildgröße (Seitenverhältnis bleibt beim Ziehen). */
function openWindowOutput(): void {
  const sf = screen.getPrimaryDisplay().scaleFactor;
  const win = secureWindow({
    width: Math.round(winSize[0] / sf), height: Math.round(winSize[1] / sf), useContentSize: true,
    show: false, title: `VJ-Link ${t("Fenster-Ausgang")}`, backgroundColor: "#000000",
  });
  win.setAspectRatio(winSize[0] / winSize[1]);
  win.setMenuBarVisibility(false);
  wireOutput(win, WINDOW_OUTPUT);
  let timer: NodeJS.Timeout | undefined;
  win.on("resize", () => { clearTimeout(timer); timer = setTimeout(() => control?.webContents.send("displays", listDisplays()), 150); });
}

function wireOutput(win: BrowserWindow, id: number): void {
  win.loadFile(rendererFile("output.html"), { query: { display: String(id) } });
  win.once("ready-to-show", async () => {
    win.show();
    // Grafiken zuerst, damit das erste Bild vollständig ist.
    for (const item of (await storage?.allMedia()) ?? []) if (!win.isDestroyed()) win.webContents.send("media", { type: "add", item });
    // Live-Grafiken (Bauchbinde, Wellenform), die gerade gelten
    for (const ev of liveMedia.values()) if (!win.isDestroyed()) win.webContents.send("media", ev);
    if (lastFrame && !win.isDestroyed()) win.webContents.send("frame", lastFrame);
  });
  win.on("closed", () => { outputs.delete(id); keepAwake(); control?.webContents.send("displays", listDisplays()); });
  win.webContents.on("did-finish-load", () => win.webContents.setZoomFactor(1));
  // Stürzt ein Ausgang ab (GPU, Speicher), sofort neu öffnen statt schwarz zu bleiben.
  win.webContents.on("render-process-gone", (_e, d) => {
    if (d.reason === "clean-exit") return;
    console.error("Ausgang abgestürzt:", id, d.reason);
    reopenOutput(id, win);
  });
  outputs.set(id, win);
  keepAwake();
}

/** Ausgang schließen und kurz danach auf demselben Bildschirm neu öffnen (nach Absturz oder Grafik-Reset). */
function reopenOutput(id: number, win: BrowserWindow): void {
  win.destroy();
  setTimeout(() => { if (!outputs.has(id)) { if (id === WINDOW_OUTPUT) openWindowOutput(); else toggleOutput(id); } }, 500);
}

/** Solange Ausgänge offen sind, dürfen Bildschirme und Beamer nicht in den Ruhezustand gehen. */
let awakeId: number | null = null;
function keepAwake(): void {
  const need = outputs.size > 0;
  if (need && awakeId === null) awakeId = powerSaveBlocker.start("prevent-display-sleep");
  else if (!need && awakeId !== null) { powerSaveBlocker.stop(awakeId); awakeId = null; }
}

function toggleOutput(id: number): DisplayInfo[] {
  const existing = outputs.get(id);
  if (existing) { existing.close(); return listDisplays(); }
  if (id === WINDOW_OUTPUT) { openWindowOutput(); return listDisplays(); }
  const d = screen.getAllDisplays().find(x => x.id === id);
  if (!d) return listDisplays();
  const win = secureWindow({
    x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height,
    frame: false, fullscreen: true, show: false, title: `VJ-Link ${t("Ausgang {n}", { n: id })}`, skipTaskbar: true,
  });
  win.setMenuBarVisibility(false);
  // Esc schließt den Ausgang, auch wenn er das Hauptfenster verdeckt.
  // Esc schließt den Ausgang nur, wenn er die Oberfläche verdeckt (gleicher Bildschirm). Auf einem Beamer
  // würde ein versehentliches Esc sonst mitten in der Show das Bild wegnehmen.
  win.webContents.on("before-input-event", (e, input) => {
    if (input.type !== "keyDown" || input.key !== "Escape") return;
    const covers = !control || control.isDestroyed() || screen.getDisplayMatching(control.getBounds()).id === id;
    if (covers) { e.preventDefault(); win.close(); }
  });
  wireOutput(win, id);
  return listDisplays();
}

// Für Tests: eigener Datenordner, damit das echte Projekt unberührt bleibt
if (process.env.VJLINK_DATA) app.setPath("userData", process.env.VJLINK_DATA);
// Pixelgenaue Farben auf allen Ausgängen: keine Umrechnung durch das Farbprofil des jeweiligen Bildschirms.
// Sonst sieht dasselbe Rot auf zwei Bildschirmen mit verschiedenen Profilen verschieden aus (und LED-Prozessoren
// bekommen nicht die Werte, die die Visuals rechnen).
app.commandLine.appendSwitch("force-color-profile", "srgb");

app.whenReady().then(async () => {
  // Nur das Hauptfenster: MIDI (ohne SysEx) und Audio-Eingang (Mikrofon/Line-In, keine Kamera).
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb, details) => {
    if (process.env.VJLINK_DEBUG) console.log("[perm request]", perm, wc === control?.webContents, JSON.stringify(details));
    const types = (details as { mediaTypes?: string[] }).mediaTypes ?? [];
    // Ausgangsfenster: nur Kamera (sie zeigen Kamera-Clips selbst an)
    const isOutput = [...outputs.values()].some(w => !w.isDestroyed() && w.webContents === wc);
    if (isOutput) return cb(perm === "media" && types.length > 0 && types.every(t => t === "video"));
    if (wc !== control?.webContents) return cb(false);
    // Web MIDI: neuere Electron-Versionen fragen auch ohne SysEx als „midiSysex“ an
    if (perm === "midi" || perm === "midiSysex") return cb(true);
    // Hauptfenster: Audio-Eingang und Kamera
    cb(perm === "media" && types.length > 0 && types.every(t => t === "audio" || t === "video"));
  });
  session.defaultSession.setPermissionCheckHandler((wc, perm, origin) => {
    if (process.env.VJLINK_DEBUG) console.log("[perm check]", perm, wc === control?.webContents, origin);
    const isOutput = [...outputs.values()].some(w => !w.isDestroyed() && w.webContents === wc);
    if (isOutput) return perm === "media";
    return wc === control?.webContents && (perm === "midi" || perm === "midiSysex" || perm === "media");
  });
  storage = new Storage(app.getPath("userData"));
  await storage.init();
  files = new ProjectFiles(storage, path.join(app.getPath("userData"), "state.json"));
  await files.init();
  app.setAboutPanelOptions({
    applicationName: "VJ-Link", applicationVersion: app.getVersion(),
    copyright: "© 2026 Philipp Spruck / NEXTPHILM · Eclipse Public License 2.0",
    credits: `${t("Quellcode")}: https://github.com/skyplayser/VJ-LInk-dev\n${t("Lizenzen und Hinweise: Hilfe → Lizenzen und Hinweise")}\n\nArt-Net™ Designed by and Copyright Artistic Licence Holdings Ltd\n${t("Ableton und Link sind Marken der Ableton AG. Kein offizielles Produkt der genannten Hersteller; alle Marken gehören ihren Inhabern.")}`,
    website: "https://skyplayser.github.io/VJ-LINK/",
  });
  setLang(await savedLang());
  buildMenu();
  protocol.handle("vjmedia", req => storage!.serveVideo(req));
  protocol.handle("vjasset", async req => {
    const root = path.join(__dirname, "..", "renderer", "vendor");
    const rel = decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/, "");
    const file = path.normalize(path.join(root, rel));
    if (!file.startsWith(root + path.sep) || rel.includes("..")) return new Response("nicht erlaubt", { status: 403 });
    try {
      const data = await fsp.readFile(file);
      const type = file.endsWith(".wasm") ? "application/wasm" : file.endsWith(".js") ? "text/javascript" : "application/octet-stream";
      return new Response(data, { headers: { "Content-Type": type, "Access-Control-Allow-Origin": "*" } });
    } catch { return new Response("nicht gefunden", { status: 404 }); }
  });
  if (process.platform === "darwin") app.dock?.setIcon(nativeImage.createFromPath(ICON));
  createControl();
  net = new Network((e: ControlEvent) => { control?.webContents.send("control", e); });
  net.start();
  const link = new LinkClient(s => control?.webContents.send("control", { type: "link", ...s }));
  link.start();

  ipcMain.handle("displays:list", () => listDisplays());
  // macOS fragt beim ersten Mal nach dem Mikrofon (Systemeinstellungen → Datenschutz)
  ipcMain.handle("audio:ask", async e => {
    if (e.sender !== control?.webContents) return false;
    if (process.platform !== "darwin") return true;
    if (systemPreferences.getMediaAccessStatus("microphone") === "granted") return true;
    return systemPreferences.askForMediaAccess("microphone");
  });
  ipcMain.handle("camera:ask", async e => {
    if (e.sender !== control?.webContents) return false;
    if (process.platform !== "darwin") return true;
    if (systemPreferences.getMediaAccessStatus("camera") === "granted") return true;
    return systemPreferences.askForMediaAccess("camera");
  });
  // Systemeinstellungen → Datenschutz öffnen (Kamera bzw. Mikrofon)
  ipcMain.on("privacy:open", (e, kind: unknown) => {
    if (e.sender !== control?.webContents || process.platform !== "darwin") return;
    void shell.openExternal(`x-apple.systempreferences:com.apple.preference.security?${kind === "microphone" ? "Privacy_Microphone" : "Privacy_Camera"}`);
  });
  // Sprache der Oberfläche: Menü und Dialoge folgen ihr, gemerkt für den nächsten Start
  // Sprachwechsel: neu laden macht der Hauptprozess (location.reload() blockiert der will-navigate-Schutz)
  ipcMain.on("ui:lang", (e, l: unknown, reload: unknown) => {
    if (e.sender !== control?.webContents || !LANGS.some(x => x.id === l)) return;
    setLang(l as Lang); buildMenu(); updateTitle();
    void fsp.writeFile(langFile(), String(l)).catch(() => { /* egal */ });
    if (reload === true) control.webContents.reload();
  });
  ipcMain.on("ui:scale", (e, v: unknown) => {
    if (e.sender !== control?.webContents) return;
    uiScale = v === "auto" ? "auto" : typeof v === "number" && v >= 0.5 && v <= 3 ? v : "auto";
    applyScale();
  });
  // Bildschirme kommen und gehen (LED-Wand, Beamer): Oberfläche informieren
  for (const ev of ["display-added", "display-removed", "display-metrics-changed"] as const)
    screen.on(ev as "display-added", () => control?.webContents.send("displays", listDisplays()));
  ipcMain.handle("displays:toggle", (_e, id: unknown) => typeof id === "number" ? toggleOutput(id) : listDisplays());
  ipcMain.handle("displays:windowSize", (_e, w: unknown, h: unknown) => typeof w === "number" && typeof h === "number" ? setWindowSize(w, h) : listDisplays());
  ipcMain.on("gpu:lost", e => {
    const entry = [...outputs.entries()].find(([, w]) => !w.isDestroyed() && w.webContents === e.sender);
    if (entry) {
      const [id, w] = entry; console.error("Ausgang: WebGL-Kontext verloren", id); reopenOutput(id, w);
    } else if (fromControl(e)) { console.error("Oberfläche: WebGL-Kontext verloren"); setTimeout(() => control?.webContents.reload(), 500); }
  });
  ipcMain.on("frame", (e, f: Frame) => {
    if (e.sender !== control?.webContents) return; // nur die Hauptoberfläche darf Bilder liefern
    lastFrame = f;
    for (const w of outputs.values()) if (!w.isDestroyed()) w.webContents.send("frame", f);
  });
  // Live-Grafiken an die Ausgänge (nur feste IDs, nur vom Hauptfenster)
  ipcMain.on("media:live", (e, ev: MediaEvent) => {
    if (e.sender !== control?.webContents || !ev || typeof ev !== "object") return;
    const ok = ev.type === "add" ? LIVE_IDS.has(ev.item?.id) && typeof ev.item.dataUrl === "string" && /^data:image\/png;base64,/.test(ev.item.dataUrl) && ev.item.dataUrl.length < 12_000_000
      : ev.type === "raw" ? LIVE_IDS.has(ev.id) && ev.data instanceof Uint8Array && Number.isInteger(ev.w) && Number.isInteger(ev.h)
        && ev.w > 0 && ev.h > 0 && ev.w <= 4096 && ev.h <= 4096 && ev.data.length === ev.w * ev.h * 4
      : ev.type === "remove" && LIVE_IDS.has(ev.id);
    if (!ok) return;
    if (ev.type === "remove") liveMedia.delete(ev.id); else liveMedia.set(ev.type === "add" ? ev.item.id : ev.id, ev);
    for (const w of outputs.values()) if (!w.isDestroyed()) w.webContents.send("media", ev);
  });
  // Cover und Wellenform von LJ-Link holen: nur feste Pfade, nur vom verbundenen LJ-Link, höchstens 8 MB
  ipcMain.handle("lj:fetch", async (e, p: unknown) => {
    if (!fromControl(e) || typeof p !== "string" || !/^\/api\/deck\/\d{1,3}\/(art|detail|beats)(\?v=-?\d{1,12})?$/.test(p)) return null;
    const base = net?.ljBase(); if (!base) return null;
    try {
      const r = await fetch(base + p, { signal: AbortSignal.timeout(5000) });
      if (!r.ok) return null;
      const len = Number(r.headers.get("content-length") ?? 0);
      if (len > 8_000_000) return null;
      // Stückweise lesen und abbrechen, sobald es zu groß wird (Server kann die Länge verschweigen)
      const parts: Uint8Array[] = []; let total = 0;
      const reader = r.body?.getReader(); if (!reader) return null;
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        total += value.length;
        if (total > 8_000_000) { void reader.cancel(); return null; }
        parts.push(value);
      }
      const buf = new Uint8Array(total); let o = 0;
      for (const part of parts) { buf.set(part, o); o += part.length; }
      return { type: r.headers.get("content-type") ?? "", data: buf };
    } catch { return null; }
  });
  ipcMain.on("lj:status", (e, s: unknown) => {
    if (!fromControl(e) || !s || typeof s !== "object" || (s as { t?: unknown }).t !== "vj") return;
    const json = JSON.stringify(s);
    if (json.length < 4000) net?.sendLj(json);
  });
  ipcMain.on("lj:open", e => { if (fromControl(e) && net) void shell.openExternal(net.ljWebUrl()); });
  // Updates (Einstellungen und Startbildschirm)
  ipcMain.handle("update:check", async (e, force: unknown) => (fromControl(e) ? updater.check(force === true) : null));
  ipcMain.handle("update:install", async e => {
    if (!fromControl(e)) return null;
    return updater.install(async () => {
      if (!control) return false;
      const r = await dialog.showMessageBox(control, {
        type: "info", buttons: [t("Jetzt installieren"), t("Später")], defaultId: 0, cancelId: 1,
        message: t("Update ist geladen"), detail: t("VJ-Link wird beendet, aktualisiert und startet von selbst neu. Das Projekt ist automatisch gesichert."),
      });
      return r.response === 0;
    });
  });
  // Nur bekannte Seiten öffnen (Instagram, Veröffentlichungen auf GitHub)
  ipcMain.on("licenses:open", e => { if (fromControl(e)) openLicenses(); });
  ipcMain.on("web:open", (e, url: unknown) => {
    if (!fromControl(e) || typeof url !== "string") return;
    if (/^https:\/\/(www\.)?(instagram\.com|github\.com)\//.test(url) || /^mailto:fehlermelden@nextphilm\.de\?/.test(url)) void shell.openExternal(url);
  });
  ipcMain.on("configure", (e, c: NetConfig) => {
    if (e.sender !== control?.webContents) return;
    if (Number.isFinite(c?.sacnUniverse)) net?.joinSacn(c.sacnUniverse);
    if (typeof c?.ljHost === "string" && /^[A-Za-z0-9.:\[\]-]{0,253}$/.test(c.ljHost)) net?.setLjHost(c.ljHost);
  });
  const fromControl = (e: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent) => e.sender === control?.webContents;
  ipcMain.on("media:add", async (e, p: unknown) => {
    if (!fromControl(e)) return;
    const item = await storage!.addMedia(p);
    if (item) for (const w of outputs.values()) if (!w.isDestroyed()) w.webContents.send("media", { type: "add", item });
  });
  ipcMain.on("media:remove", async (e, id: unknown) => {
    if (!fromControl(e)) return;
    if (await storage!.removeMedia(id)) for (const w of outputs.values()) if (!w.isDestroyed()) w.webContents.send("media", { type: "remove", id });
  });
  // Automatische Sicherung. Schlägt sie fehl (zu groß, Platte voll), einmal pro Minute Bescheid sagen statt still zu verlieren.
  let saveWarned = 0;
  ipcMain.on("project:save", (e, json: unknown) => {
    if (!fromControl(e) || switching) return;
    void storage!.saveProject(json).then(ok => {
      if (ok || Date.now() - saveWarned < 60_000) return;
      saveWarned = Date.now();
      control?.webContents.send("menu", "notice", t("Automatische Sicherung fehlgeschlagen (Projekt zu groß oder Speicher voll). Bitte „Speichern unter …“ benutzen."));
    });
  });
  // Startbildschirm: zuletzt geöffnete Projekte mit Änderungsdatum (fehlende Dateien markiert)
  ipcMain.handle("project:recent", async e => {
    if (!fromControl(e) || !files) return [];
    const out = [];
    for (const p of files.recent.slice(0, 5)) {
      let exists = false, modified = 0;
      try { const st = await fsp.stat(p); exists = st.isFile(); modified = st.mtimeMs; } catch { /* verschoben oder gelöscht */ }
      out.push({ path: p, name: path.basename(p).replace(/\.vjlink$/i, ""), folder: path.dirname(p), exists, modified });
    }
    return out;
  });
  ipcMain.handle("project:clearRecent", async e => { if (fromControl(e) && files) await files.clearRecent(); });
  ipcMain.handle("project:file", async (e, cmd: unknown, json: unknown, filePath: unknown) => {
    if (!fromControl(e) || typeof json !== "string" || !["new", "open", "save", "saveAs", "openPath"].includes(cmd as string)) return { ok: false };
    return fileCommand(cmd as FileCmd, json, typeof filePath === "string" ? filePath : undefined);
  });
  ipcMain.on("project:dirty", (e, dirty: unknown) => {
    if (!fromControl(e) || !files || switching) return;
    if (files.dirty !== !!dirty) { files.dirty = !!dirty; updateTitle(); }
  });
  ipcMain.on("project:baseline", (e, hash: unknown) => { if (fromControl(e) && typeof hash === "string" && /^[0-9a-f]{16}$/.test(hash)) void files?.setBaseline(hash); });
  ipcMain.handle("video:add", async (e, src: unknown, name: unknown) => fromControl(e) ? storage!.addVideo(src, name) : "Nicht erlaubt.");
  ipcMain.on("tc:artnet", (e, b: unknown, host: unknown) => {
    if (fromControl(e) && b instanceof Uint8Array && b.length === 19 && typeof host === "string") net?.sendArtnet(b, host);
  });
  ipcMain.on("video:remove", (e, id: unknown) => { if (fromControl(e)) void storage!.removeVideo(id); });
  ipcMain.handle("project:load", async e => {
    if (!fromControl(e)) return { project: null, media: [] };
    return { project: await storage!.loadProject(), media: await storage!.allMedia(), ...files!.info() };
  });
  app.on("activate", () => { if (!control) createControl(); });
});

app.on("window-all-closed", () => { net?.stop(); app.quit(); });
