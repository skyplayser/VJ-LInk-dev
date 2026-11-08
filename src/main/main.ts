import { BrowserWindow, app, ipcMain, nativeImage, screen, session, systemPreferences, type Display } from "electron";
import path from "node:path";
import { Network } from "./network";
import { Storage } from "./storage";
import { LinkClient } from "./link";
import type { ControlEvent, DisplayInfo, Frame, NetConfig } from "../core/frame";

let control: BrowserWindow | null = null;
const outputs = new Map<number, BrowserWindow>();
let net: Network | null = null;
let lastFrame: Frame | null = null;
let storage: Storage | null = null;

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
  control.webContents.on("did-finish-load", applyScale);
  control.on("resize", applyScale);
  control.on("closed", () => { control = null; for (const w of outputs.values()) w.close(); });
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
  win.loadFile(rendererFile("output.html"));
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

app.whenReady().then(async () => {
  // Nur das Hauptfenster: MIDI (ohne SysEx) und Audio-Eingang (Mikrofon/Line-In, keine Kamera).
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb, details) => {
    if (wc !== control?.webContents) return cb(false);
    if (perm === "midi") return cb(true);
    const types = (details as { mediaTypes?: string[] }).mediaTypes ?? [];
    cb(perm === "media" && types.length > 0 && types.every(t => t === "audio"));
  });
  session.defaultSession.setPermissionCheckHandler((wc, perm) => wc === control?.webContents && (perm === "midi" || perm === "media"));
  storage = new Storage(app.getPath("userData"));
  await storage.init();
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
  ipcMain.on("project:save", (e, json: unknown) => { if (fromControl(e)) void storage!.saveProject(json); });
  ipcMain.handle("project:load", async e => {
    if (!fromControl(e)) return { project: null, media: [] };
    return { project: await storage!.loadProject(), media: await storage!.allMedia() };
  });
  app.on("activate", () => { if (!control) createControl(); });
});

app.on("window-all-closed", () => { net?.stop(); app.quit(); });
