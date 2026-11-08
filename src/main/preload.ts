import { contextBridge, ipcRenderer } from "electron";
import type { ControlEvent, Frame, MediaEvent, NetConfig, VjBridge } from "../core/frame";

const bridge: VjBridge = {
  onControl: cb => { ipcRenderer.on("control", (_e, ev: ControlEvent) => cb(ev)); },
  publishFrame: f => { ipcRenderer.send("frame", f); },
  onFrame: cb => { ipcRenderer.on("frame", (_e, f: Frame) => cb(f)); },
  listDisplays: () => ipcRenderer.invoke("displays:list"),
  toggleOutput: id => ipcRenderer.invoke("displays:toggle", id),
  configure: (c: NetConfig) => { ipcRenderer.send("configure", c); },
  addMedia: p => { ipcRenderer.send("media:add", p); },
  removeMedia: id => { ipcRenderer.send("media:remove", id); },
  onMedia: cb => { ipcRenderer.on("media", (_e, ev: MediaEvent) => cb(ev)); },
  saveProject: json => { ipcRenderer.send("project:save", json); },
  onDisplays: cb => { ipcRenderer.on("displays", (_e, d) => cb(d)); },
  setUiScale: v => { ipcRenderer.send("ui:scale", v); },
  askMicrophone: () => ipcRenderer.invoke("audio:ask"),
  loadProject: () => ipcRenderer.invoke("project:load"),
  platform: process.platform,
};
contextBridge.exposeInMainWorld("vj", bridge);
