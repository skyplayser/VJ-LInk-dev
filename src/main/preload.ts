import { contextBridge, ipcRenderer } from "electron";
import type { ControlEvent, Frame, NetConfig, VjBridge } from "../core/frame";

const bridge: VjBridge = {
  onControl: cb => { ipcRenderer.on("control", (_e, ev: ControlEvent) => cb(ev)); },
  publishFrame: f => { ipcRenderer.send("frame", f); },
  onFrame: cb => { ipcRenderer.on("frame", (_e, f: Frame) => cb(f)); },
  listDisplays: () => ipcRenderer.invoke("displays:list"),
  toggleOutput: id => ipcRenderer.invoke("displays:toggle", id),
  configure: (c: NetConfig) => { ipcRenderer.send("configure", c); },
  platform: process.platform,
};
contextBridge.exposeInMainWorld("vj", bridge);
