// Installer so benennen, wie die Update-Funktion sie sucht (src/core/update.ts):
// VJ-Link-macos-arm64.dmg, VJ-Link-macos-intel.dmg, VJ-Link-windows.exe
import { existsSync, renameSync } from "node:fs";
const pairs = [["release/VJ-Link-macos-x64.dmg", "release/VJ-Link-macos-intel.dmg"]];
for (const [a, b] of pairs) if (existsSync(a)) { renameSync(a, b); console.log(`${a} → ${b}`); }
