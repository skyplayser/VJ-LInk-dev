// Entwicklung: VJ-Link starten (npm start). Auf dem Mac läuft die App als eigenes Programmpaket „VJ-Link.app“
// (APFS-Klon des mitgelieferten Electron.app, kostet keinen Platz), mit eigenem Namen, Symbol und eigener Kennung.
// So zeigen Dock, Menüleiste und App-Umschalter „VJ-Link“ statt „Electron“. Fertige Builds bekommen Name und Symbol
// ohnehin aus package.json (productName) und build/.
import { execFileSync, spawn } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const run = process.argv.includes("--run");
const name = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).productName ?? "VJ-Link";

/** Pfad zum Electron-Programm, das gestartet wird. */
function electronBinary() {
  const electron = createRequire(import.meta.url)("electron");
  if (process.platform !== "darwin") return electron;
  const dist = join(root, "node_modules", "electron", "dist");
  const src = join(dist, "Electron.app"), dst = join(dist, `${name}.app`);
  const plist = (app) => join(app, "Contents", "Info.plist");
  const get = (file, key) => { try { return execFileSync("/usr/libexec/PlistBuddy", ["-c", `Print :${key}`, file], { encoding: "utf8" }).trim(); } catch { return ""; } };
  if (!existsSync(src)) return electron;
  // Neu anlegen, wenn es fehlt oder Electron aktualisiert wurde
  const fresh = !existsSync(plist(dst)) || get(plist(dst), "CFBundleVersion") !== get(plist(src), "CFBundleVersion");
  if (fresh) {
    rmSync(dst, { recursive: true, force: true });
    try { execFileSync("cp", ["-cR", src, dst]); } catch { execFileSync("cp", ["-R", src, dst]); }
    const p = plist(dst);
    for (const [key, val] of [["CFBundleName", name], ["CFBundleDisplayName", name], ["CFBundleIdentifier", "de.vjlink.app.dev"]]) {
      execFileSync("plutil", ["-replace", key, "-string", val, p]);
    }
    const icon = join(root, "build", "icon.icns");
    if (existsSync(icon)) copyFileSync(icon, join(dst, "Contents", "Resources", "electron.icns"));
    try { execFileSync("/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister", ["-f", dst]); } catch { /* nicht schlimm */ }
    console.log(`Entwicklungs-App „${name}.app“ angelegt.`);
  }
  return join(dst, "Contents", "MacOS", "Electron");
}

const bin = electronBinary();
if (run) {
  const child = spawn(bin, [root, ...process.argv.slice(2).filter(a => a !== "--run")], { stdio: "inherit" });
  child.on("exit", code => process.exit(code ?? 0));
  for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
}
