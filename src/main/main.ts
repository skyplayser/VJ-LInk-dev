import { BrowserWindow, Menu, app, dialog, ipcMain, nativeImage, protocol, screen, session, shell, systemPreferences, type Display, type MenuItemConstructorOptions } from "electron";
import path from "node:path";
import { Network } from "./network";
import { Storage } from "./storage";
import { LinkClient } from "./link";
import { ProjectFiles } from "./projectfile";
import { PROJECT_EXT } from "../core/projectfile";
import { WINDOW_OUTPUT, WINDOW_SIZES, type ControlEvent, type DisplayInfo, type Frame, type MediaEvent, type NetConfig } from "../core/frame";

// Eigenes Protokoll für Videos: streamt aus dem Bibliotheksordner, spulbar, für WebGL freigegeben.
protocol.registerSchemesAsPrivileged([{ scheme: "vjmedia", privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, corsEnabled: true } }]);

let control: BrowserWindow | null = null;
const outputs = new Map<number, BrowserWindow>();
let net: Network | null = null;
let lastFrame: Frame | null = null;
let storage: Storage | null = null;
let files: ProjectFiles | null = null;
/** Live-Grafiken (nicht gespeichert): zuletzt gesendeter Stand je ID, für neu geöffnete Ausgänge. */
const liveMedia = new Map<string, MediaEvent>();
const LIVE_IDS = new Set(["nowplaying", "djwave"]);
/** Während ein Projekt geladen oder neu angelegt wird: Sicherungen der alten Oberfläche ignorieren. */
let switching = false;

// Logo für Fenster (Windows, Linux) und Dock (macOS). Die Installer nutzen build/icon.icns und build/icon.ico.
const ICON = path.join(__dirname, "..", "icon.png");
app.setName("VJ-Link");
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

function applyScale(): void {
  if (!control || control.isDestroyed()) return;
  const [w, h] = control.getContentSize();
  const auto = Math.min(w! / DESIGN_W, h! / DESIGN_H);
  const f = uiScale === "auto" ? Math.min(2.2, Math.max(0.7, auto)) : uiScale;
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
  control.on("closed", () => { control = null; for (const w of outputs.values()) w.close(); });
}

// ---- Projektdateien und Menü --------------------------------------------------------------

function updateTitle(): void {
  if (!control || control.isDestroyed() || !files) return;
  control.setTitle(`${files.name}${files.dirty ? " •" : ""} – VJ-Link`);
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
    type: "warning", buttons: ["Speichern", "Nicht speichern", "Abbrechen"], defaultId: 0, cancelId: 2,
    message: `Änderungen in „${files.name}“ speichern?`,
    detail: "Sonst gehen die Änderungen seit dem letzten Speichern verloren.",
  });
  if (r.response === 2) return false;
  if (r.response === 0) return (await saveTo(json, false)).ok;
  return true;
}

async function saveTo(json: string, askPath: boolean): Promise<{ ok: boolean; name?: string; message?: string }> {
  if (!files || !control) return { ok: false };
  let target = askPath ? null : files.current;
  if (!target) {
    const r = await dialog.showSaveDialog(control, {
      title: "Projekt speichern", defaultPath: files.current ?? path.join(app.getPath("documents"), `${files.name}.${PROJECT_EXT}`),
      filters: [{ name: "VJ-Link-Projekt", extensions: [PROJECT_EXT] }],
    });
    if (r.canceled || !r.filePath) return { ok: false };
    target = r.filePath;
  }
  try {
    const res = await files.save(json, target);
    updateTitle(); buildMenu();
    if (res.missing?.length) void dialog.showMessageBox(control, { type: "warning", message: "Projekt gespeichert, aber Videos fehlen", detail: `Nicht in der Bibliothek gefunden:\n${res.missing.join("\n")}` });
    return { ok: true, name: res.name };
  } catch (e) {
    void dialog.showMessageBox(control, { type: "error", message: "Speichern hat nicht geklappt", detail: (e as Error).message });
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
        title: "Projekt öffnen", properties: ["openFile"], filters: [{ name: "VJ-Link-Projekt", extensions: [PROJECT_EXT] }],
        defaultPath: files.current ? path.dirname(files.current) : app.getPath("documents"),
      });
      if (r.canceled || !r.filePaths[0]) return { ok: false };
      file = r.filePaths[0];
    }
    switching = true;
    const res = await files.open(file);
    if (!res.ok) {
      switching = false;
      void dialog.showMessageBox(control, { type: "error", message: "Projekt lässt sich nicht öffnen", detail: res.message ?? "" });
      return { ok: false, message: res.message };
    }
    if (res.missing?.length) void dialog.showMessageBox(control, { type: "warning", message: "Einige Videos fehlen", detail: `Diese Videos lagen nicht im Medienordner neben der Projektdatei:\n${res.missing.join("\n")}` });
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
        { role: "about", label: "Über VJ-Link" }, { type: "separator" },
        { label: "Einstellungen …", accelerator: "Cmd+,", click: menuSend("settings") }, { type: "separator" },
        { role: "services", label: "Dienste" }, { type: "separator" },
        { role: "hide", label: "VJ-Link ausblenden" }, { role: "hideOthers", label: "Andere ausblenden" }, { role: "unhide", label: "Alle einblenden" },
        { type: "separator" }, { role: "quit", label: "VJ-Link beenden" },
      ],
    } as MenuItemConstructorOptions] : []),
    {
      label: mac ? "Ablage" : "Datei", submenu: [
        { label: "Neues Projekt", accelerator: "CmdOrCtrl+N", click: menuSend("new") },
        { label: "Projekt öffnen …", accelerator: "CmdOrCtrl+O", click: menuSend("open") },
        { label: "Zuletzt geöffnet", submenu: recent.length ? [...recent, { type: "separator" }, { label: "Liste leeren", click: () => { void files?.clearRecent().then(buildMenu); } }] : [{ label: "Keine", enabled: false }] },
        { type: "separator" },
        { label: "Speichern", accelerator: "CmdOrCtrl+S", click: menuSend("save") },
        { label: "Speichern unter …", accelerator: "Shift+CmdOrCtrl+S", click: menuSend("saveAs") },
        ...(mac ? [] : [{ type: "separator" } as MenuItemConstructorOptions, { label: "Einstellungen …", accelerator: "Ctrl+,", click: menuSend("settings") }, { type: "separator" } as MenuItemConstructorOptions, { role: "quit", label: "Beenden" } as MenuItemConstructorOptions]),
      ],
    },
    {
      label: "Bearbeiten", submenu: [
        { role: "undo", label: "Widerrufen" }, { role: "redo", label: "Wiederholen" }, { type: "separator" },
        { role: "cut", label: "Ausschneiden" }, { role: "copy", label: "Kopieren" }, { role: "paste", label: "Einsetzen" }, { role: "selectAll", label: "Alles auswählen" },
      ],
    },
    {
      label: "Darstellung", submenu: [
        { role: "togglefullscreen", label: "Vollbild" },
        ...(app.isPackaged ? [] : [{ type: "separator" } as MenuItemConstructorOptions, { role: "reload", label: "Neu laden" } as MenuItemConstructorOptions, { role: "toggleDevTools", label: "Entwicklerwerkzeuge" } as MenuItemConstructorOptions]),
      ],
    },
    { label: "Fenster", role: "windowMenu", submenu: [{ role: "minimize", label: "Im Dock ablegen" }, { role: "zoom", label: "Zoomen" }, ...(mac ? [{ type: "separator" } as MenuItemConstructorOptions, { role: "front", label: "Alle nach vorne bringen" } as MenuItemConstructorOptions] : [{ role: "close", label: "Schließen" } as MenuItemConstructorOptions])] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function displayInfo(d: Display): DisplayInfo {
  return {
    id: d.id, label: d.label || `Bildschirm ${d.id}`, width: d.size.width, height: d.size.height,
    scaleFactor: d.scaleFactor, primary: d.id === screen.getPrimaryDisplay().id, open: outputs.has(d.id),
  };
}
/** Fenster-Ausgang: gewünschte Größe in Pixeln (bei offenem Fenster zählt seine echte Größe). */
let winSize: [number, number] = [1920, 1080];
function windowInfo(): DisplayInfo {
  const w = outputs.get(WINDOW_OUTPUT);
  const sf = w && !w.isDestroyed() ? screen.getDisplayMatching(w.getBounds()).scaleFactor : 1;
  const [cw, ch] = w && !w.isDestroyed() ? w.getContentSize() : [winSize[0], winSize[1]];
  return { id: WINDOW_OUTPUT, label: "Fenster-Ausgang", width: w ? cw ?? winSize[0] : winSize[0], height: w ? ch ?? winSize[1] : winSize[1], scaleFactor: w ? sf : 1, primary: false, open: !!w, window: true };
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
    show: false, title: "VJ-Link Fenster-Ausgang", backgroundColor: "#000000",
  });
  win.setAspectRatio(winSize[0] / winSize[1]);
  win.setMenuBarVisibility(false);
  wireOutput(win, WINDOW_OUTPUT);
  let t: NodeJS.Timeout | undefined;
  win.on("resize", () => { clearTimeout(t); t = setTimeout(() => control?.webContents.send("displays", listDisplays()), 150); });
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
  win.on("closed", () => { outputs.delete(id); control?.webContents.send("displays", listDisplays()); });
  win.webContents.on("did-finish-load", () => win.webContents.setZoomFactor(1));
  outputs.set(id, win);
}

function toggleOutput(id: number): DisplayInfo[] {
  const existing = outputs.get(id);
  if (existing) { existing.close(); return listDisplays(); }
  if (id === WINDOW_OUTPUT) { openWindowOutput(); return listDisplays(); }
  const d = screen.getAllDisplays().find(x => x.id === id);
  if (!d) return listDisplays();
  const win = secureWindow({
    x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height,
    frame: false, fullscreen: true, show: false, title: `VJ-Link Ausgang ${id}`, skipTaskbar: true,
  });
  win.setMenuBarVisibility(false);
  // Esc schließt den Ausgang, auch wenn er das Hauptfenster verdeckt.
  win.webContents.on("before-input-event", (e, input) => { if (input.type === "keyDown" && input.key === "Escape") { e.preventDefault(); win.close(); } });
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
  app.setAboutPanelOptions({ applicationName: "VJ-Link", applicationVersion: app.getVersion() });
  buildMenu();
  protocol.handle("vjmedia", req => storage!.serveVideo(req));
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
      const buf = new Uint8Array(await r.arrayBuffer());
      if (buf.length > 8_000_000) return null;
      return { type: r.headers.get("content-type") ?? "", data: buf };
    } catch { return null; }
  });
  ipcMain.on("lj:status", (e, s: unknown) => {
    if (!fromControl(e) || !s || typeof s !== "object" || (s as { t?: unknown }).t !== "vj") return;
    const json = JSON.stringify(s);
    if (json.length < 4000) net?.sendLj(json);
  });
  ipcMain.on("lj:open", e => { if (fromControl(e) && net) void shell.openExternal(net.ljWebUrl()); });
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
  ipcMain.on("project:save", (e, json: unknown) => { if (fromControl(e) && !switching) void storage!.saveProject(json); });
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
