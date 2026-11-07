// Startet die Oberfläche ohne Electron im Browser (zum Entwickeln und Testen der Engine).
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".map": "application/json" };
const root = "dist/renderer";
const port = Number(process.env.PORT ?? 8097);

createServer(async (req, res) => {
  const path = new URL(req.url ?? "/", "http://x").pathname;
  const file = normalize(join(root, path === "/" ? "index.html" : path));
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" }).end(body);
  } catch { res.writeHead(404).end("nicht gefunden"); }
}).listen(port, "127.0.0.1", () => console.log(`VJ-Link Web: http://127.0.0.1:${port}`));
