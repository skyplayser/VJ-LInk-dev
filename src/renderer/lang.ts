// Sprache beim Start festlegen und feste Texte (data-i18n) übersetzen.
import { getLang, LANG_KEY, setLang, t, type Lang } from "../core/i18n";
import { bridge } from "./bridge";

/** Gespeicherte Wahl, sonst Systemsprache (i18n.ts legt sie schon beim Laden fest). */
export function initLang(): Lang {
  const l = getLang();
  setLang(l);
  document.documentElement.lang = l;
  translateStatic();
  return l;
}

/**
 * Feste Texte in index.html: data-i18n="Text" ersetzt den Text des Elements,
 * data-i18n-title, data-i18n-aria (aria-label) und data-i18n-ph (placeholder) die Attribute.
 * Ohne Wert gilt der vorhandene deutsche Text bzw. das deutsche Attribut als Schlüssel.
 */
export function translateStatic(root: ParentNode = document): void {
  if (getLang() === "de") return;
  root.querySelectorAll<HTMLElement>("[data-i18n]").forEach(e => { e.textContent = t(e.dataset.i18n || e.textContent!.trim()); });
  const attr = (sel: string, name: string) => root.querySelectorAll<HTMLElement>(`[${sel}]`).forEach(e => {
    const k = e.getAttribute(sel) || e.getAttribute(name);
    if (k) e.setAttribute(name, t(k));
  });
  attr("data-i18n-title", "title");
  attr("data-i18n-aria", "aria-label");
  attr("data-i18n-ph", "placeholder");
}

/** Sprache wechseln: merken und Oberfläche neu laden (das Projekt ist laufend gesichert). */
export function changeLang(l: Lang): void {
  if (l === getLang()) return;
  try { localStorage.setItem(LANG_KEY, l); } catch { /* egal */ }
  // In der App lädt der Hauptprozess neu (er blockiert Navigation aus der Seite, auch location.reload()).
  if (bridge) bridge.setLang(l, true); else location.reload();
}
