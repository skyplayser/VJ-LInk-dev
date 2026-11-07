import { BrowserWindow, app, ipcMain, screen, type Display } from "electron";
import path from "node:path";
import { Network } from "./network";
import type { ControlEvent, DisplayInfo, Frame, NetConfig } from "../core/frame";

let control: BrowserWindow | null = null;
const outputs = new Map<number, BrowserWindow>();
let net: Network | null = null;
let lastFrame: Frame | null = null;

const rendererFile = (name: string) => path.join(__dirname, "..", "renderer", name);

function secureWindow(opts: Electron.BrowserWindowConstructorOptions): BrowserWindow {
  const win = new BrowserWindow({
    ...opts,
    backgroundColor: "#0C0E13",
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

function createControl(): void {
  control = secureWindow({ width: 1360, height: 860, minWidth: 1000, minHeight: 640, title: "VJ-Link" });
  control.loadFile(rendererFile("index.html"));
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
  win.once("ready-to-show", () => { win.show(); if (lastFrame) win.webContents.send("frame", lastFrame); });
  win.on("closed", () => { outputs.delete(id); control?.webContents.send("displays", listDisplays()); });
  outputs.set(id, win);
  return listDisplays();
}

app.whenReady().then(() => {
  createControl();
  net = new Network((e: ControlEvent) => { control?.webContents.send("control", e); });
  net.start();

  ipcMain.handle("displays:list", () => listDisplays());
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
  app.on("activate", () => { if (!control) createControl(); });
});

app.on("window-all-closed", () => { net?.stop(); app.quit(); });
