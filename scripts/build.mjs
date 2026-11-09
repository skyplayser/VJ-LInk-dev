// Baut Main-Prozess, Preload und Renderer mit esbuild und kopiert die statischen Dateien.
import { build } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";

await rm("dist", { recursive: true, force: true });
await mkdir("dist/main", { recursive: true });
await mkdir("dist/renderer", { recursive: true });

const common = { bundle: true, sourcemap: true, logLevel: "info" };

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
