// Entwicklung auf dem Mac: `npm start` startet das mitgelieferte Electron-Programmpaket. macOS zeigt in Menüleiste,
// Dock und App-Umschalter dessen Namen und Symbol („Electron“). Dieses Skript trägt VJ-Link und das eigene Symbol
// ins Paket ein. Fertige Builds bekommen Name und Symbol ohnehin aus package.json (productName) und build/.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, utimesSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "darwin") process.exit(0);

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appDir = join(root, "node_modules", "electron", "dist", "Electron.app");
const plist = join(appDir, "Contents", "Info.plist");
if (!existsSync(plist)) process.exit(0);

const name = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).productName ?? "VJ-Link";
const get = key => { try { return execFileSync("/usr/libexec/PlistBuddy", ["-c", `Print :${key}`, plist], { encoding: "utf8" }).trim(); } catch { return ""; } };

let changed = false;
for (const key of ["CFBundleName", "CFBundleDisplayName"]) {
  if (get(key) !== name) { execFileSync("plutil", ["-replace", key, "-string", name, plist]); changed = true; }
}
// Symbol: das Paket verweist auf electron.icns; dort liegt dann das VJ-Link-Symbol
const icon = join(root, "build", "icon.icns"), target = join(appDir, "Contents", "Resources", "electron.icns");
if (existsSync(icon) && (!existsSync(target) || !readFileSync(icon).equals(readFileSync(target)))) { copyFileSync(icon, target); changed = true; }

if (changed) {
  // macOS merkt sich Name und Symbol; Zeitstempel ändern, damit es neu liest
  const now = new Date();
  utimesSync(appDir, now, now);
  try { execFileSync("/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister", ["-f", appDir]); } catch { /* nicht schlimm */ }
  console.log(`Entwicklungs-App heißt jetzt „${name}“.`);
}
