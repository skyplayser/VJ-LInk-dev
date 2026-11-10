// Baut Main-Prozess, Preload und Renderer mit esbuild und kopiert die statischen Dateien.
import { build } from "esbuild";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";

await rm("dist", { recursive: true, force: true });
await mkdir("dist/main", { recursive: true });
await mkdir("dist/renderer", { recursive: true });

const pkgVersion = JSON.parse((await import("node:fs")).readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
const common = { bundle: true, sourcemap: true, logLevel: "info", define: { APP_VERSION: JSON.stringify(pkgVersion) } };

await build({ ...common, entryPoints: ["src/main/main.ts"], outfile: "dist/main/main.js",
  platform: "node", format: "cjs", target: "node22", external: ["electron"] });
await build({ ...common, entryPoints: ["src/main/preload.ts"], outfile: "dist/main/preload.js",
  platform: "node", format: "cjs", target: "node22", external: ["electron"] });
await build({ ...common, loader: { ".png": "dataurl" }, entryPoints: { app: "src/renderer/app.ts", output: "src/renderer/output.ts" },
  outdir: "dist/renderer", platform: "browser", format: "iife", target: "chrome120" });

await cp("src/renderer/index.html", "dist/renderer/index.html");
await cp("src/renderer/output.html", "dist/renderer/output.html");
await cp("src/renderer/style.css", "dist/renderer/style.css");
await cp("build/icon.png", "dist/icon.png");
// Personen-Erkennung (MediaPipe, Apache-2.0): Laufzeit aus node_modules, Modell aus vendor/
await mkdir("dist/renderer/vendor/mediapipe", { recursive: true });
for (const f of ["vision_wasm_internal.js", "vision_wasm_internal.wasm"]) await cp(`node_modules/@mediapipe/tasks-vision/wasm/${f}`, `dist/renderer/vendor/mediapipe/${f}`);
await cp("vendor/mediapipe/selfie_segmenter.tflite", "dist/renderer/vendor/mediapipe/selfie_segmenter.tflite");
await cp("vendor/mediapipe/LICENSE", "dist/renderer/vendor/mediapipe/LICENSE");

// Lizenzen und Hinweise für die App (Hilfe → Lizenzen und Hinweise, liegt per extraResources neben app.asar).
// Alle Laufzeit-Pakete aus package-lock.json mit ihrem Lizenztext; fehlt einer, bricht der Bau ab.
{
  const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
  const sep = "\n" + "=".repeat(100) + "\n";
  const parts = [`VJ-Link ${pkgVersion} – Licenses and third-party notices

VJ-Link: Copyright (c) 2026 Philipp Spruck / NEXTPHILM. Licensed under the Eclipse Public License 2.0 (text below).
Source code: https://github.com/skyplayser/VJ-LInk-dev

Art-Net™ Designed by and Copyright Artistic Licence Holdings Ltd
Ableton and Link are trademarks of Ableton AG. VJ-Link is an independent project and not an official product of, or
endorsed by, any of the manufacturers named. All product names and trademarks belong to their respective owners and are
used only to describe compatibility.

Electron, Chromium and FFmpeg: see LICENSE.electron.txt and LICENSES.chromium.html next to this file (Windows: in the
installation folder). Video decoding (H.264, HEVC, VP9, AV1) is done by Chromium or the operating system inside Electron;
VJ-Link ships no codec of its own.`];
  parts.push("VJ-Link – Eclipse Public License 2.0\n\n" + (await readFile("LICENSE", "utf8")));
  const missing = [];
  for (const [key, info] of Object.entries(lock.packages)) {
    if (!key || info.dev) continue;
    const dir = key; // node_modules/<name>
    const name = key.replace(/^.*node_modules\//, "");
    let text = null;
    try {
      const f = (await readdir(dir)).find(x => /^(licen[cs]e|copying)(\.|$)/i.test(x));
      if (f) text = await readFile(`${dir}/${f}`, "utf8");
    } catch { /* fehlt */ }
    if (!text && name === "@mediapipe/tasks-vision") text = await readFile("vendor/mediapipe/LICENSE", "utf8");
    if (!text) { missing.push(name); continue; }
    parts.push(`${name} ${info.version} (${info.license})${name.startsWith("@mediapipe/") ? "\nIncludes the MediaPipe Selfie Segmenter model (vendor/mediapipe/selfie_segmenter.tflite), Apache-2.0." : ""}\n\n${text.trim()}`);
  }
  if (missing.length) throw new Error(`Lizenztext fehlt für: ${missing.join(", ")}`);
  parts.push(`Shader credits

- Signed distance functions sdHex, sdTri and sdBox3, the domain-warping in domainWarp, ink and liquidLight, and the
  cosine color palette follow the articles of Inigo Quilez (https://iquilezles.org/articles/). MIT License.
- Settings icon in the start screen: based on the "settings" icon of Feather (https://github.com/feathericons/feather).
  MIT License.
- hash(): a common GLSL hash idiom, as popularized by "The Art of Code" (Martijn Steinrucken).

${(await readFile("vendor/licenses/MIT-inigo-quilez.txt", "utf8")).trim()}

${(await readFile("vendor/licenses/MIT-feather.txt", "utf8")).trim()}`);
  parts.push(`Logo lettering: Inter Display (https://github.com/rsms/inter), converted to outlines.\n\n${(await readFile("assets/fonts/Inter-OFL.txt", "utf8")).trim()}`);
  await writeFile("dist/THIRD_PARTY_LICENSES.txt", parts.join(sep) + "\n");
  // Lizenzseite im Windows-Installer
  await writeFile("build/license.txt", await readFile("LICENSE", "utf8"));
}
