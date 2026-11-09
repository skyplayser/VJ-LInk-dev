import { BrowserWindow, Menu, app, dialog, ipcMain, nativeImage, protocol, screen, session, systemPreferences, type Display, type MenuItemConstructorOptions } from "electron";
import path from "node:path";
import { Network } from "./network";
import { Storage } from "./storage";
import { LinkClient } from "./link";
import { ProjectFiles } from "./projectfile";
import { PROJECT_EXT } from "../core/projectfile";
import type { ControlEvent, DisplayInfo, Frame, NetConfig } from "../core/frame";

// Eigenes Protokoll für Videos: streamt aus dem Bibliotheksordner, spulbar, für WebGL freigegeben.
protocol.registerSchemesAsPrivileged([{ scheme: "vjmedia", privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, corsEnabled: true } }]);

let control: BrowserWindow | null = null;
const outputs = new Map<number, BrowserWindow>();
let net: Network | null = null;
let lastFrame: Frame | null = null;
let storage: Storage | null = null;
let files: ProjectFiles | null = null;
/** Während ein Projekt geladen oder neu angelegt wird: Sicherungen der alten Oberfläche ignorieren. */
let switching = false;

// Logo für Fenster (Windows, Linux) und Dock (macOS). Die Installer nutzen build/icon.icns und build/icon.ico.
const ICON = path.join(__dirname, "..", "icon.png");
app.setName("VJ-Link");

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
  control.webContents.on("did-finish-load", () => { applyScale(); switching = false; updateTitle(); });
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
const listDisplays = (): DisplayInfo[] => screen.getAllDisplays().map(displayInfo);

function toggleOutput(id: number): DisplayInfo[] {
  const existing = outputs.get(id);
  if (existing) { existing.close(); return listDisplays(); }
  const d = screen.getAllDisplays().find(x => x.id === id);
  if (!d) return listDisplays();
  const win = secureWindow({
    x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height,
    frame: false, fullscreen: true, show: false, title: `VJ-Link Ausgang ${id}`, skipTaskbar: true,
  });
  win.setMenuBarVisibility(false);
  // Esc schließt den Ausgang, auch wenn er das Hauptfenster verdeckt.
  win.webContents.on("before-input-event", (e, input) => { if (input.type === "keyDown" && input.key === "Escape") { e.preventDefault(); win.close(); } });
  win.loadFile(rendererFile("output.html"), { query: { display: String(id) } });
  win.once("ready-to-show", async () => {
    win.show();
    // Grafiken zuerst, damit das erste Bild vollständig ist.
    for (const item of (await storage?.allMedia()) ?? []) if (!win.isDestroyed()) win.webContents.send("media", { type: "add", item });
    if (lastFrame && !win.isDestroyed()) win.webContents.send("frame", lastFrame);
  });
  win.on("closed", () => { outputs.delete(id); control?.webContents.send("displays", listDisplays()); });
  win.webContents.on("did-finish-load", () => win.webContents.setZoomFactor(1));
  outputs.set(id, win);
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
    if (wc !== control?.webContents) return cb(false);
    // Web MIDI: neuere Electron-Versionen fragen auch ohne SysEx als „midiSysex“ an
    if (perm === "midi" || perm === "midiSysex") return cb(true);
    const types = (details as { mediaTypes?: string[] }).mediaTypes ?? [];
    cb(perm === "media" && types.length > 0 && types.every(t => t === "audio"));
  });
  session.defaultSession.setPermissionCheckHandler((wc, perm, origin) => {
    if (process.env.VJLINK_DEBUG) console.log("[perm check]", perm, wc === control?.webContents, origin);
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
  ipcMain.on("ui:scale", (e, v: unknown) => {
    if (e.sender !== control?.webContents) return;
    uiScale = v === "auto" ? "auto" : typeof v === "number" && v >= 0.5 && v <= 3 ? v : "auto";
    applyScale();
  });
  // Bildschirme kommen und gehen (LED-Wand, Beamer): Oberfläche informieren
  for (const ev of ["display-added", "display-removed", "display-metrics-changed"] as const)
    screen.on(ev as "display-added", () => control?.webContents.send("displays", listDisplays()));
  ipcMain.handle("displays:toggle", (_e, id: unknown) => typeof id === "number" ? toggleOutput(id) : listDisplays());
  ipcMain.on("frame", (e, f: Frame) => {
    if (e.sender !== control?.webContents) return; // nur die Hauptoberfläche darf Bilder liefern
    lastFrame = f;
    for (const w of outputs.values()) if (!w.isDestroyed()) w.webContents.send("frame", f);
  });
  ipcMain.on("configure", (e, c: NetConfig) => {
    if (e.sender !== control?.webContents) return;
    if (Number.isFinite(c?.sacnUniverse)) net?.joinSacn(c.sacnUniverse);
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
