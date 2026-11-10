// Ende-zu-Ende-Test der fertigen App auf macOS und Windows (gleiches Skript).
// Startet VJ-Link mit eigenem Datenordner und Debug-Port und steuert es über das Chrome-DevTools-Protokoll.
// Ohne Node (Windows): die App selbst als Node starten:
//   set "ELECTRON_RUN_AS_NODE=1" && "C:\Pfad\VJ-Link.exe" tests\e2e\smoke.cjs "C:\Pfad\VJ-Link.exe" C:\temp\vj-report
// macOS:  node tests/e2e/smoke.cjs release/mac-arm64/VJ-Link.app/Contents/MacOS/VJ-Link /tmp/vj-report
// Entwicklungsstand: npm run test:e2e (= node tests/e2e/smoke.cjs dev release/e2e)
// Fasst keine laufende VJ-Link-Instanz an: eigener Datenordner, eigener Prozess, wird am Ende beendet.
// Netzwerk-Test (Art-Net, sACN, OSC, LJ-Link an 127.0.0.1) nur mit VJ_E2E_NET=1 (oder Liste wie sacn,osc,lj) und nur,
// wenn kein anderes Programm auf diesen Ports lauscht (anderes VJ-Link, Lichtsoftware mit Art-Net …).
"use strict";
const { spawn } = require("child_process");
const fs = require("fs"), os = require("os"), path = require("path"), dgram = require("dgram"), http = require("http");

// "dev" = Entwicklungsstand mit dem Electron aus node_modules (läuft auf macOS und Windows)
const dev = process.argv[2] === "dev";
const exe = dev ? require("electron") : process.argv[2];
const outDir = process.argv[3] || path.join(os.tmpdir(), "vj-report");
if (!exe) { console.log("Aufruf: smoke.cjs <VJ-Link-Programm> [Berichtsordner]"); process.exit(2); }
fs.mkdirSync(outDir, { recursive: true });
const PORT = 9300 + Math.floor(Math.random() * 400);
const data = fs.mkdtempSync(path.join(os.tmpdir(), "vj-e2e-"));
const report = { system: `${os.platform()} ${os.release()} ${os.arch()}`, started: new Date().toISOString(), steps: [], errors: [] };
const t0 = Date.now();
const log = (name, ok, detail = "") => { report.steps.push({ name, ok, detail, at: Date.now() - t0 }); console.log(`${ok ? "OK  " : "FEHLER"} ${name}${detail ? " · " + detail : ""}`); };
const wait = ms => new Promise(r => setTimeout(r, ms));

const saveFile = path.join(data, "e2e-projekt.vjlink");
const env = { ...process.env, VJLINK_DATA: data, VJLINK_TEST_SAVE: saveFile };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(exe, [...(dev ? [path.join(__dirname, "..", "..")] : []), `--remote-debugging-port=${PORT}`], { env, stdio: "ignore" });
child.on("exit", c => { if (!finished) { log("App läuft bis zum Ende", false, `beendet mit ${c}`); } });
let finished = false;

const getJson = () => new Promise((res, rej) => http.get(`http://127.0.0.1:${PORT}/json`, r => { let b = ""; r.on("data", d => b += d); r.on("end", () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } }); }).on("error", rej));

/** Mittlere Helligkeit (0–255) eines PNG (8 Bit, RGB oder RGBA), ohne Zusatzpakete. */
function pngBrightness(buf) {
  const zlib = require("zlib");
  let w = 0, h = 0, ch = 4; const idat = [];
  for (let o = 8; o < buf.length; ) {
    const len = buf.readUInt32BE(o), type = buf.toString("latin1", o + 4, o + 8), d = buf.subarray(o + 8, o + 8 + len);
    if (type === "IHDR") { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ch = d[9] === 6 ? 4 : d[9] === 2 ? 3 : 0; if (d[8] !== 8 || !ch) return -1; }
    else if (type === "IDAT") idat.push(d);
    o += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * ch, prev = Buffer.alloc(stride), row = Buffer.alloc(stride);
  let sum = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? row[i - ch] : 0, b = prev[i], cc = i >= ch ? prev[i - ch] : 0;
      let p = 0;
      if (f === 1) p = a; else if (f === 2) p = b; else if (f === 3) p = (a + b) >> 1;
      else if (f === 4) { const pa = Math.abs(b - cc), pb = Math.abs(a - cc), pc = Math.abs(a + b - 2 * cc); p = pa <= pb && pa <= pc ? a : pb <= pc ? b : cc; }
      row[i] = (src[i] + p) & 255;
    }
    for (let x = 0; x < w; x++) sum += row[x * ch] + row[x * ch + 1] + row[x * ch + 2];
    row.copy(prev);
  }
  return sum / (w * h * 3);
}

class Cdp {
  constructor(url) { this.ws = new WebSocket(url); this.id = 0; this.pending = new Map(); this.handlers = [];
    this.ready = new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
    this.ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && this.pending.has(d.id)) { this.pending.get(d.id)(d); this.pending.delete(d.id); } else if (d.method) this.handlers.forEach(h => h(d)); }; }
  send(method, params = {}, timeout = 30000) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => { const t = setTimeout(() => { this.pending.delete(id); rej(new Error(`Zeitüberschreitung ${method}`)); }, timeout); this.pending.set(id, d => { clearTimeout(t); res(d); }); }); }
  async eval(expr, timeout = 30000) { const d = await this.send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }, timeout);
    if (d.result?.exceptionDetails) throw new Error(d.result.exceptionDetails.exception?.description?.split("\n")[0] || "Ausnahme"); return d.result?.result?.value; }
}

async function main() {
  // 1) Start: Fenster und Startbildschirm
  let page = null;
  for (let i = 0; i < 600 && !page; i++) { try { page = (await getJson()).find(p => p.type === "page" && /index\.html/.test(p.url)); } catch { /* noch nicht da */ } if (!page) await wait(100); }
  if (!page) { log("Hauptfenster erscheint", false, "kein Fenster nach 60 s"); return; }
  log("Hauptfenster erscheint", true, `${((Date.now() - t0) / 1000).toFixed(1)} s`);
  const c = new Cdp(page.webSocketDebuggerUrl); await c.ready;
  await c.send("Runtime.enable");
  c.handlers.push(d => {
    if (d.method === "Runtime.exceptionThrown") report.errors.push("Ausnahme: " + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text).split("\n")[0]);
    if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") report.errors.push("Konsole: " + d.params.args.map(a => a.value ?? a.description ?? "").join(" ").slice(0, 300));
  });
  const tStart = Date.now();
  let start = false;
  while (Date.now() - tStart < 120000) { try { start = await c.eval("!!document.querySelector('.start-btn')", 3000); } catch { /* Seite blockiert */ } if (start) break; await wait(100); }
  log("Startbildschirm bedienbar", start, `${((Date.now() - t0) / 1000).toFixed(1)} s nach Programmstart`);
  if (!start) return;
  const info = await c.eval(`JSON.stringify({ zoom: devicePixelRatio, w: innerWidth, h: innerHeight, version: document.title, bridge: !!window.vj,
    gl: (()=>{ const g=document.createElement('canvas').getContext('webgl2'); if(!g) return null; const d=g.getExtension('WEBGL_debug_renderer_info');
      return { parallel: !!g.getExtension('KHR_parallel_shader_compile'), renderer: g.getParameter(d ? d.UNMASKED_RENDERER_WEBGL : g.RENDERER) }; })() })`);
  const inf = JSON.parse(info); report.info = inf;
  log("WebGL2 vorhanden", !!inf.gl, inf.gl ? `${inf.gl.renderer} · Übersetzen im Hintergrund: ${inf.gl.parallel ? "ja" : "nein"}` : "");
  log("Brücke zum Hauptprozess", inf.bridge);

  // 2) Projekt öffnen (erster Knopf: Weiterarbeiten)
  await c.eval("document.querySelector('.start-btn').click(), true"); await wait(1000);
  const startGone = await c.eval("!document.querySelector('.start:not([hidden]) .start-btn')");
  log("Startbildschirm schließt", startGone);

  // 3) Shader-Übersetzung des Projekts
  const tGpu = Date.now(); let gpu = null;
  while (Date.now() - tGpu < 180000) { gpu = await c.eval("window.__vj.gpu()", 10000).catch(() => null); if (gpu && gpu.pending === 0 && gpu.ready > 0) break; await wait(500); }
  log("Visuals des Projekts übersetzt", !!gpu && gpu.pending === 0, gpu ? `${gpu.ready} Programme in ${((Date.now() - tGpu) / 1000).toFixed(1)} s` : "");
  // Oberfläche reagiert währenddessen? (Antwortzeit einer einfachen Abfrage)
  const tr = Date.now(); await c.eval("1"); log("Oberfläche reagiert", Date.now() - tr < 1000, `${Date.now() - tr} ms`);

  // 4) Jedes Visual und jeder Effekt zeichnet ein Bild
  const brightness = async () => {
    const r = await c.eval("JSON.stringify(document.getElementById('preview').getBoundingClientRect())").then(JSON.parse);
    const shot = await c.send("Page.captureScreenshot", { format: "png", clip: { x: r.x, y: r.y, width: Math.max(1, r.width), height: Math.max(1, r.height), scale: 0.25 } });
    const b64 = shot.result?.data; if (!b64) return 0;
    return pngBrightness(Buffer.from(b64, "base64"));
  };
  const setLayer = (clip, fx) => c.eval(`(()=>{ const s = window.__vj.ctx.show; s.autoVj = false; s.blackout = false; s.master = 1;
    s.layers.forEach((l, i) => { l.clip = i === 0 ? ${JSON.stringify(clip)} : null; l.opacity = 1; l.colorSource = 'original'; l.effects = ${JSON.stringify(fx)}; });
    window.__vj.rebuild(); return true; })()`);
  const gens = await c.eval("window.__vj.genIds()"), fxs = await c.eval("window.__vj.fxIds()");
  const quick = process.env.VJ_E2E_QUICK === "1"; // nur zum Entwickeln des Tests: lange Durchläufe auslassen
  const dark = [], slow = [];
  for (const g of quick ? gens.slice(0, 3) : gens) {
    await setLayer(g, []); const tg = Date.now(); let v = 0;
    while (Date.now() - tg < 30000) { await wait(150); v = await brightness(); if (v >= 2) break; }
    if (v < 2) dark.push(g); else if (Date.now() - tg > 3000) slow.push(`${g} ${((Date.now() - tg) / 1000).toFixed(1)} s`);
  }
  log(`Alle ${gens.length} Visuals zeichnen ein Bild`, dark.length === 0, (dark.length ? "dunkel: " + dark.join(", ") : "") + (slow.length ? " · langsam: " + slow.join(", ") : ""));
  const fxDark = [];
  for (const f of quick ? fxs.slice(0, 3) : fxs) {
    await setLayer("plasma", [{ id: f, on: true, amount: 0.8 }]); const tf = Date.now(); let v = 0;
    while (Date.now() - tf < 30000) { await wait(150); v = await brightness(); if (v >= 2) break; }
    if (v < 2) fxDark.push(f);
  }
  log(`Alle ${fxs.length} Effekte zeichnen ein Bild`, fxDark.length === 0, fxDark.join(", "));

  // 7) Netzwerk: Art-Net (Master auf 50 %) und OSC. Nur mit VJ_E2E_NET=1 und nur, wenn KEIN anderes VJ-Link läuft:
  //    die Pakete gehen an 127.0.0.1 und würden sonst eine laufende Instanz steuern.
  //    VJ_E2E_NET=1 testet alles, sonst eine Liste, z. B. VJ_E2E_NET=sacn,osc,lj (wenn eine Lichtsoftware Art-Net belegt).
  const netWant = (process.env.VJ_E2E_NET || "").toLowerCase();
  const net = k => netWant === "1" || netWant.split(",").map(x => x.trim()).includes(k);
  if (!netWant) { log("Netzwerk-Eingang", true, "übersprungen (VJ_E2E_NET=1 setzen, wenn kein anderes VJ-Link läuft)"); }
  else {
  const sock = dgram.createSocket("udp4");
  const art = Buffer.alloc(18 + 512); art.write("Art-Net\0", 0, "latin1"); art.writeUInt16LE(0x5000, 8); art.writeUInt16BE(14, 10); art.writeUInt16BE(512, 16); art[18] = 128;
  await c.eval("window.__vj.ctx.show.master = 1, true");
  if (net("artnet")) {
  for (let i = 0; i < 10; i++) { sock.send(art, 6454, "127.0.0.1"); await wait(60); }
  await wait(400);
  const m = await c.eval("window.__vj.ctx.show.master");
  log("Art-Net-Eingang (Master über DMX)", Math.abs(m - 128 / 255) < 0.05, `Master = ${Math.round(m * 100)} %`);
  }
  const osc = Buffer.concat([Buffer.from("/vj/ping\0\0\0\0", "latin1"), Buffer.from(",\0\0\0", "latin1")]);
  if (net("osc")) {
  for (let i = 0; i < 5; i++) { sock.send(osc, 8000, "127.0.0.1"); await wait(60); }
  await wait(1200);
  const oscOk = await c.eval("document.getElementById('st-osc')?.classList.contains('ok')");
  log("OSC-Eingang", !!oscOk);
  }
  // sACN (E1.31) auf Universe 1: Master auf 25 %. Art-Net davor 2 s ruhen lassen, sonst gewinnt die frischere Quelle.
  if (net("sacn")) {
  if (net("artnet")) await wait(2500);
  const sacn = Buffer.alloc(126 + 512); Buffer.from("ASC-E1.17", "latin1").copy(sacn, 4); sacn[108] = 100; sacn.writeUInt16BE(1, 113); sacn.writeUInt16BE(513, 123); sacn[125] = 0; sacn[126] = 64;
  for (let i = 0; i < 10; i++) { sock.send(sacn, 5568, "127.0.0.1"); await wait(60); }
  await wait(400);
  const ms = await c.eval("window.__vj.ctx.show.master");
  log("sACN-Eingang (Master über DMX)", Math.abs(ms - 64 / 255) < 0.05, `Master = ${Math.round(ms * 100)} %`);
  }
  sock.close();
  // LJ-Link: WebSocket auf Port 9099, Begrüßung wie LJ-Link
  if (net("lj")) {
  const lj = await new Promise(res => { try {
    const w = new WebSocket("ws://127.0.0.1:9099");
    w.onopen = () => w.send(JSON.stringify({ t: "hello", version: 1, privacy: false, app: "E2E-Test" }));
    w.onerror = () => res(false);
    setTimeout(async () => { const ok = await c.eval("window.__vj.ctx.lj.connected").catch(() => false); try { w.close(); } catch { /* egal */ } res(ok); }, 1500);
  } catch { res(false); } });
  log("LJ-Link-Verbindung (WebSocket)", !!lj);
  }
  await c.eval("window.__vj.ctx.show.master = 1, true");
  }

  const waitFor = async (expr, ms = 20000) => { const tw = Date.now(); while (Date.now() - tw < ms) { const v = await c.eval(expr, 5000).catch(() => null); if (v) return v; await wait(200); } return null; };
  const frameKey = async () => { const r = await c.eval("JSON.stringify(document.getElementById('preview').getBoundingClientRect())").then(JSON.parse);
    const sh = await c.send("Page.captureScreenshot", { format: "png", clip: { x: r.x, y: r.y, width: r.width, height: r.height, scale: 0.25 } }); return sh.result?.data ?? ""; };
  const clipsNow = () => c.eval("JSON.stringify(window.__vj.ctx.show.layers.map(l => l.clip))").then(JSON.parse);

  // 8) Medien: Bild und Videos über den echten Datei-Import (wie Ziehen oder „+ Clips“)
  const fx = path.join(__dirname, "fixtures");
  await c.send("DOM.enable");
  const media = {};
  for (const [file, label, optional] of [["test.png", "Bild (PNG)"], ["test-h264.mp4", "Video H.264 (MP4)"], ["test-vp9.webm", "Video VP9 (WebM)"], ["test-hevc.mp4", "Video HEVC/H.265 (MP4)", true]]) {
    const src = path.join(fx, file);
    if (!fs.existsSync(src)) { log(label, false, "Testdatei fehlt"); continue; }
    await c.eval("window.__vj.ctx.show.layers.forEach(l => { l.clip = null; }), true");
    const doc = await c.send("DOM.getDocument", { depth: 0 });
    const q = await c.send("DOM.querySelector", { nodeId: doc.result.root.nodeId, selector: "#file-input" });
    await c.send("DOM.setFileInputFiles", { nodeId: q.result.nodeId, files: [src] });
    let id = null; const ti = Date.now();
    while (Date.now() - ti < 30000 && !id) { await wait(300); id = (await clipsNow()).find(x => x) ?? null; }
    if (!id) { log(label, !!optional, "Import ohne Ergebnis" + (optional ? " (unter Windows braucht HEVC die HEVC-Erweiterung)" : "")); continue; }
    media[file] = id;
    await setLayer(id, []); let v = 0; const tb = Date.now();
    while (Date.now() - tb < 15000) { await wait(250); v = await brightness(); if (v >= 2) break; }
    let moving = true;
    if (file.endsWith(".mp4") || file.endsWith(".webm")) { const a = await frameKey(); await wait(700); const b = await frameKey(); moving = a !== b; }
    const ok = v >= 2 && moving;
    log(label, ok || !!optional, ok ? `zeigt Bild${file === "test.png" ? "" : " und läuft"}` : (v < 2 ? "bleibt schwarz" : "Bild steht still") + (optional && !ok ? " (optional: HEVC braucht unter Windows die HEVC-Erweiterung)" : ""));
  }

  // 9) Projekt speichern und wieder öffnen (Datei auf der Platte, mit Medienordner)
  if (media["test-h264.mp4"]) {
    await c.eval(`(()=>{ const s = window.__vj.ctx.show; s.layers[0].clip = ${JSON.stringify(media["test-h264.mp4"])}; s.layers[1].clip = 'plasma'; s.layers[1].opacity = 0.42; return true })()`);
    await c.eval("window.__vj.file('saveAs')");
    await wait(1500);
    const saved = fs.existsSync(saveFile);
    log("Projekt speichern", saved, saved ? `${Math.round(fs.statSync(saveFile).size / 1024)} KB` : "keine Datei");
    if (saved) {
      await c.eval("(()=>{ const s = window.__vj.ctx.show; s.layers[0].clip = null; s.layers[1].clip = null; return true })()");
      await c.eval(`window.__vj.file('openPath', ${JSON.stringify(saveFile)})`).catch(() => null);
      await wait(2500);
      const back = await waitFor("window.__vj && window.__vj.ctx.show.layers[1].clip === 'plasma' && JSON.stringify([window.__vj.ctx.show.layers[0].clip, window.__vj.ctx.show.layers[1].opacity])", 30000);
      const [c0, op] = back ? JSON.parse(back) : [null, 0];
      log("Projekt öffnen", !!back && !!c0 && Math.abs(op - 0.42) < 0.01, back ? `Ebene 1: ${c0 ? "Video da" : "Video fehlt"}, Deckkraft Ebene 2: ${Math.round(op * 100)} %` : "Stand nicht wiederhergestellt");
      await c.eval("document.querySelector('.start:not([hidden]) .start-btn')?.click(), true").catch(() => 0);
    }
  }

  // 10) Ausgang als Fenster öffnen, Bild prüfen, schließen
  await setLayer("plasma", []);
  const before2 = (await getJson()).filter(p => /output\.html/.test(p.url)).length;
  await c.eval("window.vj.toggleOutput(-1)");
  let outPage = null;
  for (let i = 0; i < 100 && !outPage; i++) { await wait(200); outPage = (await getJson()).find(p => p.type === "page" && /output\.html/.test(p.url)); }
  if (!outPage) log("Ausgang öffnen", false, "kein Ausgabefenster");
  else {
    const o = new Cdp(outPage.webSocketDebuggerUrl); await o.ready;
    let ov = 0; const to = Date.now();
    while (Date.now() - to < 30000) { await wait(400); const sh = await o.send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: 400, height: 300, scale: 0.5 } }); ov = sh.result?.data ? pngBrightness(Buffer.from(sh.result.data, "base64")) : 0; if (ov >= 2) break; }
    log("Ausgang öffnen und Bild zeigen", ov >= 2, `nach ${((Date.now() - to) / 1000).toFixed(1)} s`);
    try { o.ws.close(); } catch { /* egal */ }
    await c.eval("window.vj.toggleOutput(-1)"); await wait(1500);
    const left = (await getJson()).filter(p => /output\.html/.test(p.url)).length;
    log("Ausgang schließen", left === before2);
  }

  // 11) Kopfzeile, Szenen, Blackout
  const hBefore = report.errors.length;
  for (const id of ["map-btn", "proj-btn", "tempo-lock", "bpm", "blackout", "blackout"]) {
    await c.eval(`document.getElementById('${id}')?.click(), true`); await wait(300);
    await c.eval("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})), true"); await wait(150);
  }
  for (let i = 1; i <= 6; i++) { await c.eval(`window.__vj.scene(${i}), true`); await wait(300); }
  log("Kopfzeile, Szenen, Blackout", report.errors.length === hBefore);

  // 12) Demo-Show 6 s laufen lassen: Bildrate. Vorher speichern, sonst fragt VJ-Link beim Neuladen nach.
  const saveNow = async () => { await c.eval("window.__vj.file('save')").catch(() => 0); await wait(1200); };
  await saveNow();
  // Neu laden geht nur über den Hauptprozess (location.reload() sperrt der Navigationsschutz)
  await c.eval("sessionStorage.clear(), window.vj.setLang(localStorage.getItem('vjlink.lang') || 'de', true), true").catch(() => 0);
  await wait(1500);
  const startAgain = await waitFor("!!document.querySelector('.start-btn')", 30000);
  if (startAgain) {
    await c.eval("[...document.querySelectorAll('.start-btn')][3].click(), true"); await wait(6000);
    const f = await c.eval("JSON.stringify(window.__vj.fps())").then(JSON.parse).catch(() => null);
    log("Demo-Show läuft", !!f && f.fps > 20, f ? `${Math.round(f.fps)} Bilder/s, ${f.frameMs.toFixed(1)} ms pro Bild` : "");
  } else log("Demo-Show läuft", false, "Startbildschirm nach Neuladen nicht da: " + await c.eval("location.href.slice(-30) + ' ' + document.readyState + ' vj=' + !!window.__vj + ' start=' + document.querySelectorAll('.start-btn').length + ' ss=' + JSON.stringify(Object.keys(sessionStorage)) + ' ls=' + localStorage.getItem('vjlink.startScreen')").catch(e => "eval: " + e.message)
    + " · loadProject: " + await c.eval("Promise.race([window.vj.loadProject().then(r => 'ok ' + (r.project || '').length + ' videos ' + (JSON.parse(r.project || '{}').videos || []).length), new Promise(r => setTimeout(() => r('hängt'), 5000))])", 15000).catch(e => e.message)
    + " · toast: " + await c.eval("document.getElementById('toast')?.textContent").catch(() => ""));

  // 13) Sprache: Englisch und zurück
  await saveNow();
  await c.eval("localStorage.setItem('vjlink.lang', 'en'), window.vj.setLang('en', true), true").catch(() => 0);
  const en = await waitFor("document.querySelector('[data-tab=build]')?.textContent.trim() === 'GALLERY'", 30000);
  await saveNow();
  await c.eval("localStorage.setItem('vjlink.lang', 'de'), window.vj.setLang('de', true), true").catch(() => 0);
  const de = await waitFor("document.querySelector('[data-tab=build]')?.textContent.trim() === 'GALERIE'", 30000);
  log("Sprache wechseln (Englisch und zurück)", !!en && !!de);

  // 14) Update-Prüfung (fragt GitHub nach der neuesten Version)
  const up = await c.eval("window.vj.updateCheck(true).then(r => JSON.stringify(r))", 30000).catch(e => JSON.stringify({ error: e.message }));
  const upo = JSON.parse(up || "null");
  log("Update-Prüfung", !!upo && !upo.error, upo ? JSON.stringify(upo).slice(0, 160) : "");

  // 15) Mitgelieferte Lizenzen (nur fertige App)
  if (!dev) {
    const res = process.platform === "darwin" ? path.join(path.dirname(exe), "..", "Resources") : path.join(path.dirname(exe), "resources");
    const files = ["LICENSE.txt", "THIRD_PARTY_LICENSES.txt"].filter(f => fs.existsSync(path.join(res, f)));
    log("Lizenzdateien im Programm", files.length === 2, files.join(", "));
  }

  // 16) Zum Schluss (verstellt den Zustand): Alle Tabs und Knöpfe durchklicken (ohne Löschen, Beenden, Dateidialoge)
  await c.eval(`(()=>{ window.open=()=>null; window.confirm=()=>true; window.alert=()=>{}; window.prompt=()=>null;
    const oc=HTMLInputElement.prototype.click; HTMLInputElement.prototype.click=function(){ if(this.type==='file') return; return oc.call(this); };
    window.showOpenFilePicker=()=>Promise.reject(new DOMException('x','AbortError')); return true; })()`);
  const before = report.errors.length; let clicks = 0;
  const skip = "/quit|beenden|löschen|delete|entfernen|remove|neues projekt|new project|zurücksetzen|reset|×|✕|fehler melden|report a problem|github|lizenzen|licenses|website|instagram/i";
  for (const tab of quick ? [] : ["visuals", "show", "build", "output", "connect"]) {
    await c.eval(`document.querySelector('.tabs [data-tab=${tab}]').click(), true`); await wait(500);
    const seen = new Set();
    for (let n = 0; n < 400; n++) {
      const sig = await c.eval(`(()=>{ const sec=document.getElementById('tab-${tab}'); const vis=e=>{const r=e.getBoundingClientRect(); return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden'};
        const seen=new Set(${JSON.stringify([...seen])}); const sig=e=>(e.id||'')+'|'+e.className+'|'+(e.textContent||'').trim().slice(0,30)+'|'+(e.title||'').slice(0,20);
        const b=[...sec.querySelectorAll('button, [role=button], .cell, input[type=checkbox], select')].filter(vis).find(e=>!seen.has(sig(e)) && !${skip}.test((e.textContent||'')+' '+(e.title||'')));
        if(!b) return null; const s=sig(b);
        if (b.tagName==='SELECT') { if (b.options.length>1) { b.selectedIndex=(b.selectedIndex+1)%b.options.length; b.dispatchEvent(new Event('change',{bubbles:true})); } } else b.click();
        return s; })()`, 15000).catch(e => "AUSNAHME " + e.message);
      if (!sig) break; seen.add(sig); clicks++; await wait(120);
      const modal = await c.eval("!!document.querySelector('.report, dialog[open], .modal:not([hidden])')").catch(() => false);
      if (modal) { await c.eval("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})), (document.activeElement||document.body).dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})), true"); await wait(150); }
    }
  }
  log("Alle Tabs und Knöpfe bedienbar", report.errors.length === before, `${clicks} Bedienelemente geklickt${report.errors.length > before ? ", " + (report.errors.length - before) + " Fehler" : ""}`);

  // 17) Einstellungen: jede Seite öffnen
  await c.eval("document.getElementById('settings-btn').click(), true"); await wait(400);
  const secs = await c.eval("[...document.querySelectorAll('.set-nav [data-sec]')].map(b=>b.dataset.sec)");
  for (const s of secs) { await c.eval(`document.querySelector('.set-nav [data-sec=${s}]').click(), true`); await wait(250); }
  await c.eval("document.getElementById('set-close')?.click(), true");
  log("Einstellungen", secs.length > 0, `${secs.length} Seiten`);

  // 18) Größe der Oberfläche
  log("Oberfläche skaliert", inf.zoom > 0, `Zoom × Pixeldichte ${inf.zoom.toFixed(2)}, Fläche ${inf.w} × ${inf.h} CSS-Pixel`);

  // 19) Abschluss: Bildschirmfoto, Fehler
  const shot = await c.send("Page.captureScreenshot", { format: "png" });
  if (shot.result?.data) fs.writeFileSync(path.join(outDir, "ende.png"), Buffer.from(shot.result.data, "base64"));
  log("Keine Fehler in der Konsole", report.errors.length === 0, report.errors.slice(0, 5).join(" | "));
}

main().catch(e => log("Testlauf", false, e.message)).finally(async () => {
  finished = true;
  report.total = `${((Date.now() - t0) / 1000).toFixed(0)} s`;
  const md = [`# VJ-Link Testlauf`, ``, `System: ${report.system}`, `Start: ${report.started}`, `Dauer: ${report.total}`, ``,
    ...report.steps.map(s => `- ${s.ok ? "✅" : "❌"} ${s.name}${s.detail ? ": " + s.detail : ""}`), ``, `## Fehler (${report.errors.length})`, ...report.errors.slice(0, 50).map(e => `- ${e}`)].join("\n");
  fs.writeFileSync(path.join(outDir, "bericht.md"), md); fs.writeFileSync(path.join(outDir, "bericht.json"), JSON.stringify(report, null, 1));
  console.log(`\nBericht: ${path.join(outDir, "bericht.md")}`);
  try { child.kill(); } catch { /* schon beendet */ }
  setTimeout(() => { try { fs.rmSync(data, { recursive: true, force: true }); } catch { /* Windows sperrt evtl. noch */ } process.exit(report.steps.every(s => s.ok) ? 0 : 1); }, 1500);
});
