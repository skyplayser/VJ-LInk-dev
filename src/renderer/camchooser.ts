// Kamera auswählen: Freigabe holen, Geräte auflisten, kleines Menü am Knopf.
import { CameraPool, type CamDevice } from "./campool";
import { bridge } from "./bridge";
import { t } from "../core/i18n";

/** Gesetzt, wenn macOS den Kamera-Zugriff nicht erlaubt hat (dann hilft nur die Systemeinstellung). */
export let cameraDenied = false;

/** Geräte mit Namen (fragt beim ersten Mal nach der Kamera-Freigabe). */
export async function cameraDevices(): Promise<CamDevice[]> {
  cameraDenied = !!bridge && !(await bridge.askCamera());
  if (cameraDenied) return [];
  let list = await CameraPool.devices();
  if (list.length && list.every(d => /^Kamera \d+$/.test(d.label))) { await CameraPool.unlock(); list = await CameraPool.devices(); }
  return list;
}

/** Hinweis und Knopf, wenn keine Kamera kommt: Freigabe fehlt oder kein Gerät. */
export function cameraHelp(): HTMLElement {
  const box = document.createElement("div"); box.className = "cam-help";
  const p = document.createElement("p"); p.className = "am-hint";
  if (cameraDenied) {
    p.textContent = t("macOS erlaubt VJ-Link den Kamera-Zugriff nicht. Systemeinstellungen → Datenschutz & Sicherheit → Kamera → VJ-Link einschalten, dann VJ-Link neu starten.");
    box.append(p);
    if (bridge) {
      const b = document.createElement("button"); b.className = "btn small-btn"; b.textContent = t("Systemeinstellungen öffnen");
      b.addEventListener("click", () => bridge!.openPrivacy("camera"));
      box.append(b);
    }
  } else {
    p.textContent = t("Keine Kamera gefunden. Kamera anstecken oder in OBS „Virtuelle Kamera starten“, dann neu suchen.");
    box.append(p);
  }
  return box;
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
    if (!devices.length) menu.append(cameraHelp());
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
