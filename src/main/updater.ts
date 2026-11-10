// Updates wie bei LJ-Link: neueste Veröffentlichung auf GitHub suchen, passendes Paket laden und installieren.
// macOS: Ein kleines Skript wartet, bis VJ-Link beendet ist, kopiert die neue App aus dem Disk-Image an die Stelle
// der alten und startet sie. Windows: Der Installer wird gestartet und ersetzt die installierte Version.
import { app, shell } from "electron";
import { spawn } from "node:child_process";
import { createHash, verify as verifySig } from "node:crypto";
import { createReadStream, createWriteStream, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { isNewer, parseSums, pickRelease, RELEASES_PAGE, UPDATE_PUBLIC_KEY, UPDATE_REPO, type ReleaseInfo, type UpdateState } from "../core/update";
import { t } from "../core/i18n";

const HOUR = 3_600_000;

export class Updater {
  private state: UpdateState;
  private busy = false;

  constructor(private send: (s: UpdateState) => void) {
    this.state = { status: "idle", current: app.getVersion(), dev: !app.isPackaged };
  }

  get(): UpdateState { return this.state; }

  private set(p: Partial<UpdateState>): void {
    this.state = { ...this.state, ...p };
    this.send(this.state);
  }

  /** Bei GitHub nachsehen (höchstens einmal pro Stunde, außer `force`). */
  async check(force = false): Promise<UpdateState> {
    if (this.busy) return this.state;
    if (!force && this.state.checkedAt && Date.now() - this.state.checkedAt < HOUR && this.state.status !== "error") return this.state;
    this.set({ status: "checking", message: undefined });
    try {
      const res = await fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`, {
        headers: { Accept: "application/vnd.github+json", "User-Agent": `VJ-Link/${this.state.current}` },
        signal: AbortSignal.timeout(15_000),
      });
      if (res.status === 404) { this.set({ status: "latest", latest: undefined, checkedAt: Date.now(), message: t("Noch keine Veröffentlichung vorhanden.") }); return this.state; }
      if (!res.ok) throw new Error(t("GitHub antwortet {status}", { status: res.status }));
      const rel = pickRelease(await res.json(), process.platform, process.arch);
      if (!rel) throw new Error(t("Antwort von GitHub nicht lesbar"));
      const newer = isNewer(rel.version, this.state.current);
      this.set({ status: newer ? "available" : "latest", latest: rel, checkedAt: Date.now(), message: undefined });
    } catch (e) {
      const offline = e instanceof TypeError || (e as Error).name === "TimeoutError";
      this.set({ status: "error", checkedAt: Date.now(), message: offline ? t("Keine Verbindung zum Internet.") : (e as Error).message });
    }
    return this.state;
  }

  /** Paket laden und installieren. Danach beendet sich VJ-Link (die neue Version startet von selbst). */
  async install(confirmQuit: () => Promise<boolean>): Promise<UpdateState> {
    const rel = this.state.latest;
    if (this.busy || this.state.status !== "available" || !rel) return this.state;
    // Ohne passendes Paket, ohne Prüfsumme oder in der Entwicklungsversion: Seite der Veröffentlichung öffnen
    if (!rel.url || !rel.sha256 || this.state.dev) { void shell.openExternal(rel.page || RELEASES_PAGE); return this.state; }
    this.busy = true;
    try {
      this.set({ status: "downloading", progress: 0, message: undefined });
      const file = await this.download(rel.url, rel.asset, rel.size);
      // Echtheit: SHA-256 muss zu GitHub passen; mit eigenem Schlüssel zusätzlich die signierte Prüfsummenliste
      const hash = await sha256File(file);
      if (hash !== rel.sha256) throw new Error(t("Prüfsumme stimmt nicht, das Paket wird nicht installiert."));
      if (UPDATE_PUBLIC_KEY && !(await this.signed(rel, hash))) {
        void shell.openExternal(rel.page || RELEASES_PAGE);
        this.set({ status: "available", progress: undefined, message: t("Keine gültige Signatur: Bitte von der Seite der Veröffentlichung laden.") });
        return this.state;
      }
      if (!(await confirmQuit())) { this.set({ status: "available", progress: undefined, message: t("Update geladen, Installation abgebrochen.") }); return this.state; }
      this.set({ status: "installing", progress: 1 });
      await this.runInstaller(file);
      setTimeout(() => app.quit(), 300);
    } catch (e) {
      this.set({ status: "error", progress: undefined, message: t("Update fehlgeschlagen: {msg}", { msg: (e as Error).message }) });
    } finally {
      this.busy = false;
    }
    return this.state;
  }

  /** SHA256SUMS mit dem eingebauten öffentlichen Schlüssel prüfen und den Eintrag des Pakets vergleichen. */
  private async signed(rel: ReleaseInfo, hash: string): Promise<boolean> {
    if (!rel.sumsUrl || !rel.sigUrl) return false;
    try {
      const get = async (u: string) => { const r = await fetch(u, { headers: { "User-Agent": `VJ-Link/${this.state.current}` }, signal: AbortSignal.timeout(15_000) }); if (!r.ok) throw new Error(String(r.status)); return Buffer.from(await r.arrayBuffer()); };
      const [sums, sig] = await Promise.all([get(rel.sumsUrl), get(rel.sigUrl)]);
      if (sums.length > 64_000 || sig.length > 1_000) return false;
      if (!verifySig(null, sums, UPDATE_PUBLIC_KEY, sig)) return false;
      return parseSums(sums.toString("utf8")).get(rel.asset) === hash;
    } catch { return false; }
  }

  private async download(url: string, name: string, size: number): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vjlink-update-"));
    const file = path.join(dir, name);
    const res = await fetch(url, { headers: { "User-Agent": `VJ-Link/${this.state.current}` } });
    if (!res.ok || !res.body) throw new Error(`Download ${res.status}`);
    const total = Number(res.headers.get("content-length")) || size;
    const out = createWriteStream(file);
    let done = 0, lastSent = 0;
    const reader = res.body.getReader();
    for (;;) {
      const { done: end, value } = await reader.read();
      if (end) break;
      done += value.length;
      if (!out.write(value)) await new Promise<void>(r => out.once("drain", () => r()));
      if (total > 0 && Date.now() - lastSent > 150) { lastSent = Date.now(); this.set({ progress: Math.min(1, done / total) }); }
    }
    await new Promise<void>((resolve, reject) => out.end((err?: Error | null) => (err ? reject(err) : resolve())));
    if (size > 0 && (await fs.stat(file)).size !== size) throw new Error(t("Download unvollständig"));
    return file;
  }

  private async runInstaller(file: string): Promise<void> {
    if (process.platform === "win32") {
      spawn(file, [], { detached: true, stdio: "ignore" }).unref();
      return;
    }
    const bundle = runningAppBundle();
    if (process.platform !== "darwin" || !bundle) { await shell.openPath(file); return; }
    const script = path.join(path.dirname(file), "update.sh");
    await fs.writeFile(script, `#!/bin/bash
# Ersetzt VJ-Link durch die neue Version, sobald das laufende Programm beendet ist.
PID="$1"; DMG="$2"; APP="$3"
for i in $(seq 1 120); do kill -0 "$PID" 2>/dev/null || break; sleep 0.5; done
MNT="$(mktemp -d)"
if ! hdiutil attach -nobrowse -readonly -mountpoint "$MNT" "$DMG" >/dev/null; then open "$DMG"; exit 1; fi
SRC="$(ls -d "$MNT"/*.app | head -1)"
if [ -n "$SRC" ]; then
  rm -rf "$APP.old"
  if mv "$APP" "$APP.old" && ditto "$SRC" "$APP"; then rm -rf "$APP.old"; else rm -rf "$APP"; mv "$APP.old" "$APP"; fi
fi
hdiutil detach "$MNT" -quiet
open "$APP"
`);
    const log = await fs.open(path.join(path.dirname(file), "update.log"), "w");
    spawn("/bin/bash", [script, String(process.pid), file, bundle], { detached: true, stdio: ["ignore", log.fd, log.fd] }).unref();
  }
}

async function sha256File(file: string): Promise<string> {
  const h = createHash("sha256");
  for await (const chunk of createReadStream(file)) h.update(chunk as Buffer);
  return h.digest("hex");
}

/** Der .app-Ordner, aus dem VJ-Link läuft (nur in der fertigen App). */
function runningAppBundle(): string | null {
  if (!app.isPackaged) return null;
  let p = path.dirname(process.execPath);
  for (let i = 0; i < 3; i++) {
    if (p.endsWith(".app")) return p;
    p = path.dirname(p);
  }
  return null;
}
