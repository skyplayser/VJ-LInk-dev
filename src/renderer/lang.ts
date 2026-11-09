// Sprache beim Start festlegen und feste Texte (data-i18n) übersetzen.
import { detectLang, getLang, LANGS, setLang, t, type Lang } from "../core/i18n";

const KEY = "vjlink.lang";

/** Gespeicherte Wahl, sonst Systemsprache. */
export function initLang(): Lang {
  let saved: string | null = null;
  try { saved = localStorage.getItem(KEY); } catch { /* egal */ }
  const l = LANGS.some(x => x.id === saved) ? saved as Lang : detectLang(navigator.languages?.length ? navigator.languages : [navigator.language ?? "en"]);
  setLang(l);
  document.documentElement.lang = l;
  translateStatic();
  return l;
}

/** Elemente mit data-i18n="schlüssel" bekommen den Text in der aktuellen Sprache. */
export function translateStatic(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>("[data-i18n]").forEach(e => { e.textContent = t(e.dataset.i18n!); });
}

/** Sprache wechseln: merken und Oberfläche neu laden (das Projekt ist laufend gesichert). */
export function changeLang(l: Lang): void {
  if (l === getLang()) return;
  try { localStorage.setItem(KEY, l); } catch { /* egal */ }
  location.reload();
}
