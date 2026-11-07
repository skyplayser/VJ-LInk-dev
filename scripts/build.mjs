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
await build({ ...common, entryPoints: { app: "src/renderer/app.ts", output: "src/renderer/output.ts" },
  outdir: "dist/renderer", platform: "browser", format: "iife", target: "chrome120" });

await cp("src/renderer/index.html", "dist/renderer/index.html");
await cp("src/renderer/output.html", "dist/renderer/output.html");
await cp("src/renderer/style.css", "dist/renderer/style.css");
