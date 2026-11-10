// Fehler melden (wie bei LJ-Link): Beschreibung plus Diagnosedaten, per E-Mail oder als GitHub-Issue.
// Die Diagnosedaten enthalten nur Technik (Version, System, Grafik, Geräte, Zustände, letzte Fehlermeldungen),
// keine Dateinamen, Texte von Text-Clips, Titel aus LJ-Link oder Passwörter.

export const REPORT_MAIL = "fehlermelden@nextphilm.de";
export const REPORT_REPO = "skyplayser/VJ-LINK";

/** Grenzen für Links: Mailprogramme (vor allem unter Windows) nehmen nur kurze mailto-Links, GitHub etwas längere. */
export const MAIL_LIMIT = 1800;
export const ISSUE_LIMIT = 6500;

export interface DiagSection { title: string; lines: string[] }

/** Diagnosedaten als Text, Abschnitte wie bei LJ-Link („== Titel ==“). */
/** Benutzernamen aus Pfaden entfernen (/Users/name, /home/name, C:\\Users\\name), bevor etwas das Gerät verlässt. */
export function scrubPaths(text: string): string {
  return text
    .replace(/(\/(?:Users|home)\/)[^/\s"'):]+/g, "$1…")
    .replace(/([A-Za-z]:[\\/]+Users[\\/]+)[^\\/\n"'):]+/gi, "$1…");
}

export function formatDiagnostics(sections: readonly DiagSection[]): string {
  return scrubPaths(sections.map(s => [`== ${s.title} ==`, ...s.lines].join("\n")).join("\n\n") + "\n");
}

/** Text des Berichts: Beschreibung, darunter (wenn gewünscht) die Diagnosedaten. */
export function reportText(description: string, diag: string | null, none = "(keine Beschreibung)"): string {
  const d = description.trim() || none;
  return diag ? `${d}\n\n${diag}` : d;
}

/** Erste Zeile der Beschreibung als Betreff bzw. Titel. */
export const firstLine = (s: string, max: number): string => (s.trim().split(/\r?\n/)[0] ?? "").slice(0, max);

/**
 * mailto-Link. Passt der Bericht nicht in einen Link, kommen die Diagnosedaten nicht mit; `attach` sagt dann,
 * dass sie als Datei angehängt werden sollen (die Oberfläche speichert sie und legt sie in die Zwischenablage).
 */
export function mailLink(description: string, diag: string | null, attachNote: string): { url: string; attach: boolean } {
  const subject = `VJ-Link: ${firstLine(description, 80)}`;
  let body = reportText(description, diag);
  let attach = false;
  if (diag && encodeURIComponent(body).length > MAIL_LIMIT) { body = `${description.trim()}\n\n${attachNote}`; attach = true; }
  return { url: `mailto:${REPORT_MAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, attach };
}

/** GitHub-Issue mit vorausgefülltem Titel und Text; zu lange Diagnosedaten gehen über die Zwischenablage. */
export function issueLink(description: string, diag: string | null, version: string, pasteHint: string, label = "bug"): { url: string; clipboard: boolean } {
  const title = firstLine(description, 90);
  let body = `${description.trim()}\n\n${version ? `Version: ${version}\n` : ""}`;
  let clipboard = false;
  if (diag) {
    const block = `\n<details><summary>Diagnose</summary>\n\n\`\`\`\n${diag}\`\`\`\n</details>\n`;
    if (encodeURIComponent(body + block).length < ISSUE_LIMIT) body += block;
    else { body += `\n<!-- ${pasteHint} -->\n`; clipboard = true; }
  }
  return {
    url: `https://github.com/${REPORT_REPO}/issues/new?labels=${encodeURIComponent(label)}&title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`,
    clipboard,
  };
}

/** Sterne als Text, z. B. 4 → „★★★★☆“. */
export const starString = (n: number): string => "★".repeat(Math.max(0, Math.min(5, Math.round(n)))) + "☆".repeat(5 - Math.max(0, Math.min(5, Math.round(n))));

/** Feedback-Text: Bewertung in der ersten Zeile (wird Betreff bzw. Titel), darunter die Worte. Ohne Sterne nur die Worte. */
export function feedbackText(stars: number, words: string): string {
  const w = words.trim();
  if (!(stars >= 1 && stars <= 5)) return w;
  const head = `Feedback ${starString(stars)} (${Math.round(stars)}/5)`;
  return w ? `${head}\n\n${w}` : head;
}

/** Dateiname für „Als Datei speichern“. */
export const reportFileName = (d = new Date()): string => `VJ-Link-Bericht-${d.toISOString().slice(0, 19).replace(/[:T]/g, "-")}.txt`;
