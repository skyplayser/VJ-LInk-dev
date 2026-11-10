// Rendert die SVGs aus scripts/logo/make_svgs.py zu PNG, .icns und .ico (Chromium zeichnet die Pfade).
// Aufruf: npx electron scripts/logo/render.cjs
// Danach build/logo-src/icon.iconset mit iconutil zu build/icon.icns, und build/icon.png mit Pillow zu build/icon.ico
// (Größen 16–256) umwandeln; siehe CLAUDE.md.
const { app, BrowserWindow } = require("electron");
const fs = require("fs"), path = require("path");
const ROOT = path.resolve(__dirname, "../..");
const SRC = path.join(ROOT, "build/logo-src");
const jobs = [
  ["logo-for-dark.svg", 585, 144, ["assets/logo-for-dark.png"]],
  ["logo-for-light.svg", 585, 144, ["assets/logo-for-light.png"]],
  ["icon.svg", 1024, 1024, ["build/icon.png"]],
  ...[16, 32, 64, 128, 256, 512, 1024].map(n => ["icon.svg", n, n, [`build/logo-src/icon.iconset/${n}.png`]]),
];
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await win.loadURL("data:text/html,<canvas id=c></canvas>");
  fs.mkdirSync(path.join(SRC, "icon.iconset"), { recursive: true });
  for (const [file, w, h, outs] of jobs) {
    const svg = fs.readFileSync(path.join(SRC, file), "utf8");
    const url = "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");
    const png = await win.webContents.executeJavaScript(`new Promise(r => { const i = new Image(); i.onload = () => {
      const c = document.getElementById('c'); c.width = ${w}; c.height = ${h}; const g = c.getContext('2d');
      g.clearRect(0, 0, ${w}, ${h}); g.imageSmoothingQuality = 'high'; g.drawImage(i, 0, 0, ${w}, ${h}); r(c.toDataURL('image/png')); }; i.src = ${JSON.stringify(url)}; })`);
    for (const o of outs) fs.writeFileSync(path.join(ROOT, o), Buffer.from(png.split(",")[1], "base64"));
  }
  console.log("PNGs geschrieben");
  app.quit();
});
