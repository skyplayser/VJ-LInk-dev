// Kamera auswählen: Freigabe holen, Geräte auflisten, kleines Menü am Knopf.
import { CameraPool, type CamDevice } from "./campool";
import { bridge } from "./bridge";

/** Geräte mit Namen (fragt beim ersten Mal nach der Kamera-Freigabe). */
export async function cameraDevices(): Promise<CamDevice[]> {
  if (bridge && !(await bridge.askCamera())) return [];
  let list = await CameraPool.devices();
  if (list.length && list.every(d => /^Kamera \d+$/.test(d.label))) { await CameraPool.unlock(); list = await CameraPool.devices(); }
  return list;
}

/** Menü mit den Geräten unter dem Knopf; gibt das gewählte Gerät zurück. */
export function pickCamera(anchor: HTMLElement, devices: CamDevice[]): Promise<CamDevice | null> {
  return new Promise(resolve => {
    const menu = document.createElement("div");
    menu.className = "map-menu cam-menu";
    menu.setAttribute("role", "menu");
    const r = anchor.getBoundingClientRect();
    Object.assign(menu.style, { position: "fixed", left: `${Math.max(8, Math.min(r.left, window.innerWidth - 300))}px`, top: `${r.bottom + 6}px` });
    const done = (d: CamDevice | null) => { menu.remove(); document.removeEventListener("pointerdown", outside, true); resolve(d); };
    const outside = (e: Event) => { if (!menu.contains(e.target as Node)) done(null); };
    if (!devices.length) {
      const p = document.createElement("p"); p.className = "am-hint";
      p.textContent = "Keine Kamera gefunden. Kamera anstecken oder in OBS „Virtuelle Kamera starten“ (VJ-Link danach neu öffnen).";
      menu.append(p);
    }
    for (const d of devices) {
      const b = document.createElement("button"); b.setAttribute("role", "menuitem");
      b.textContent = d.label;
      b.addEventListener("click", () => done(d));
      menu.append(b);
    }
    document.body.append(menu);
    setTimeout(() => document.addEventListener("pointerdown", outside, true), 0);
  });
}
