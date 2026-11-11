// Netzwerk-Eingänge: Art-Net, sACN, OSC (UDP) und LJ-Link (WebSocket). Alles nur Empfang.
import dgram from "node:dgram";
import { WebSocket as WsClient, WebSocketServer, type WebSocket } from "ws";
import { ARTNET_PORT, parseArtDmx } from "../core/artnet";
import { parseArtTimecode } from "../core/timecode";
import { SACN_PORT, parseSacn, sacnMulticastAddress } from "../core/sacn";
import { parseOsc } from "../core/osc";
import { LJ_DEFAULT_PORT, parseLjMessage, type LjMessage } from "../core/ljlink";
import { LjNativeTracker, LjProAdapter, type LjSource } from "../core/ljpro";
import { foundFromService, mergeFound, planAttempts, type FoundLj, type LjAttempt, type OwnAddr } from "../core/ljdiscover";
import { Bonjour } from "bonjour-service";
import os from "node:os";

/** Eigene IPv4-Adressen mit Präfixlänge (für „gleicher Rechner“ und „eigenes Subnetz“). */
function ownAddrs(): OwnAddr[] {
  const out: OwnAddr[] = [];
  for (const list of Object.values(os.networkInterfaces())) for (const i of list ?? []) {
    if (i.family !== "IPv4") continue;
    const prefix = Number((i.cidr ?? "").split("/")[1] ?? 24);
    out.push({ addr: i.address, prefix: Number.isFinite(prefix) ? prefix : 24 });
  }
  return out;
}
import type { ControlEvent, NetStatus } from "../core/frame";

export const OSC_PORT = 8000;

export class Network {
  status: NetStatus = {
    artnet: { listening: false, packets: 0 },
    sacn: { listening: false, packets: 0 },
    osc: { listening: false, port: OSC_PORT, packets: 0 },
    lj: { listening: false, port: LJ_DEFAULT_PORT, clients: 0, pro: { host: "auto", connected: false, auto: true, found: [] } },
  };
  private pro?: WsClient;
  /** Feste Adresse; leer = automatisch. */
  private proHost = "";
  /** Laufender bzw. letzter Verbindungsversuch und seine Stelle im Plan. */
  private proAttempt?: LjAttempt;
  private proIdx = 0;
  /** Per Bonjour gefundene LJ-Links (Schlüssel: Dienstname). */
  private found = new Map<string, FoundLj>();
  private bonjour?: Bonjour;
  private discoTimer?: NodeJS.Timeout;
  private proTimer?: NodeJS.Timeout;
  private proAdapter?: LjSource;
  private sockets: dgram.Socket[] = [];
  private artnet?: dgram.Socket;
  private wss?: WebSocketServer;
  private sacn?: dgram.Socket;
  private joined?: string;

  constructor(private emit: (e: ControlEvent) => void) {}

  /** Welche Eingänge laufen (in VERBINDEN schaltbar). */
  private on = { artnet: true, sacn: true, osc: true, lj: true };
  private oscPort = OSC_PORT;
  private osc?: dgram.Socket;
  private sacnUniverse = 1;
  private statusTimer?: NodeJS.Timeout;

  start(sacnUniverse = 1): void {
    this.sacnUniverse = sacnUniverse;
    if (this.on.artnet) this.startArtnet();
    if (this.on.sacn) this.startSacn();
    if (this.on.osc) this.startOsc();
    if (this.on.lj) this.startLj();
    this.statusTimer = setInterval(() => this.emit({ type: "status", status: this.status }), 500);
    this.statusTimer.unref();
  }

  /**
   * Eingänge ein- und ausschalten, OSC-Port ändern. Ausgeschaltet gibt VJ-Link den Port frei (z. B. wenn ein
   * anderes Programm auf demselben Rechner Art-Net empfangen soll).
   */
  setEnabled(want: Partial<{ artnet: boolean; sacn: boolean; osc: boolean; lj: boolean }>, oscPort?: number): void {
    const port = oscPort !== undefined && Number.isInteger(oscPort) && oscPort >= 1024 && oscPort <= 65535 ? oscPort : this.oscPort;
    const flip = (k: keyof typeof this.on, start: () => void, stop: () => void) => {
      const v = want[k];
      if (v === undefined || v === this.on[k]) return;
      this.on[k] = v;
      if (v) start(); else stop();
    };
    flip("artnet", () => this.startArtnet(), () => this.stopArtnet());
    flip("sacn", () => this.startSacn(), () => this.stopSacn());
    flip("lj", () => this.startLj(), () => this.stopLj());
    if (want.osc !== undefined && want.osc !== this.on.osc) {
      this.on.osc = want.osc; this.oscPort = port;
      if (want.osc) this.startOsc(); else this.stopOsc();
    } else if (port !== this.oscPort) {
      this.oscPort = port;
      if (this.on.osc) { this.stopOsc(); this.startOsc(); }
    }
    this.status.artnet.off = !this.on.artnet;
    this.status.sacn.off = !this.on.sacn;
    this.status.osc.off = !this.on.osc;
    this.status.osc.port = this.oscPort;
    this.status.lj.off = !this.on.lj;
  }

  private startArtnet(): void {
    if (this.artnet) return;
    this.artnet = this.udp("artnet", ARTNET_PORT, (msg, from) => {
      const p = parseArtDmx(msg);
      if (p) { this.emit({ type: "dmx", source: "artnet", universe: p.universe, data: p.data }); return; }
      const t = parseArtTimecode(msg);
      if (t) { this.emit({ type: "timecode", source: "artnet", tc: t.tc, fps: t.fps, from }); return; }
      return false;
    });
    this.artnet.on("listening", () => { try { this.artnet?.setBroadcast(true); } catch { /* ohne Broadcast */ } });
  }
  private stopArtnet(): void { this.close("artnet", this.artnet); this.artnet = undefined; }

  private startSacn(): void {
    if (this.sacn) return;
    this.sacn = this.udp("sacn", SACN_PORT, msg => {
      const p = parseSacn(msg);
      if (p) this.emit({ type: "dmx", source: "sacn", universe: p.universe, data: p.data });
      else return false;
    });
    this.joined = undefined; this.joinedIfaces.clear();
    this.joinSacn(this.sacnUniverse);
  }
  private stopSacn(): void {
    clearInterval(this.rejoinTimer); this.rejoinTimer = undefined;
    this.pendingSacn = null;
    this.close("sacn", this.sacn); this.sacn = undefined;
    this.joined = undefined; this.joinedIfaces.clear();
  }

  private startOsc(): void {
    if (this.osc) return;
    this.status.osc.port = this.oscPort;
    this.osc = this.udp("osc", this.oscPort, msg => {
      const list = parseOsc(msg);
      if (!list.length) return false;
      for (const m of list) {
        const keep = m.args.map(a => !(a instanceof Uint8Array));
        const args = m.args.filter((a): a is number | string | boolean | null => !(a instanceof Uint8Array));
        const tags = [...(m.tags ?? "")].filter((_, i) => keep[i]).join("");
        this.emit({ type: "osc", address: m.address, args, tags });
      }
    });
  }
  private stopOsc(): void { this.close("osc", this.osc); this.osc = undefined; }

  private startLj(): void {
    if (this.wss) return;
    this.ws(LJ_DEFAULT_PORT);
    this.startDiscovery();
    this.restartPro();
  }
  private stopLj(): void {
    const w = this.wss; this.wss = undefined;
    if (w) { for (const c of w.clients) { try { c.terminate(); } catch { /* weg */ } } w.close(); }
    clearTimeout(this.proTimer);
    const old = this.pro; this.pro = undefined; old?.terminate();
    if (this.proAdapter) for (const m of this.proAdapter.clear()) this.emit({ type: "lj", raw: JSON.stringify(m) });
    this.proAdapter = undefined; this.proAttempt = undefined;
    clearInterval(this.discoTimer); this.discoTimer = undefined;
    try { this.bonjour?.destroy(); } catch { /* schon zu */ }
    this.bonjour = undefined; this.found.clear();
    this.status.lj = { ...this.status.lj, listening: false, clients: 0, error: undefined,
      pro: { host: this.proHost || "auto", connected: false, auto: !this.proHost, found: [] } };
    this.emit({ type: "lj-connection", clients: 0 });
  }

  /** Socket eines Eingangs schließen und den Port freigeben. */
  private close(key: "artnet" | "sacn" | "osc", s: dgram.Socket | undefined): void {
    if (s) { try { s.close(); } catch { /* schon zu */ } this.sockets = this.sockets.filter(x => x !== s); }
    this.status[key].listening = false; this.status[key].error = undefined;
  }

  private udp(key: "artnet" | "sacn" | "osc", port: number, onMsg: (b: Buffer, from: string) => false | void): dgram.Socket {
    const s = dgram.createSocket({ type: "udp4", reuseAddr: true });
    s.on("message", (msg, rinfo) => {
      if (onMsg(msg, rinfo.address) === false) return;
      const st = this.status[key];
      st.packets++;
      if (key === "artnet") this.status.artnet.lastFrom = rinfo.address;
      if (key === "osc") this.status.osc.lastFrom = rinfo.address;
    });
    s.on("error", err => { this.status[key].error = err.message; this.status[key].listening = false; });
    s.bind(port, () => { this.status[key].listening = true; this.status[key].error = undefined; });
    this.sockets.push(s);
    return s;
  }

  /** Multicast-Gruppe für das gewählte sACN-Universe betreten, die alte verlassen. */
  joinSacn(universe: number): void {
    this.sacnUniverse = universe;
    const s = this.sacn; if (!s) return;
    const addr = sacnMulticastAddress(Math.max(1, Math.min(63999, universe)));
    // Erst nach dem Binden anmelden: addMembership auf einem ungebundenen Socket bindet ihn unter macOS
    // an einen Zufalls-Port, danach scheitert bind(5568) mit EINVAL und sACN kommt nie an.
    let bound = false;
    try { s.address(); bound = true; } catch { /* noch nicht gebunden */ }
    if (bound) this.join(s, addr);
    else { this.pendingSacn = addr; s.once("listening", () => { if (this.pendingSacn) this.join(s, this.pendingSacn); this.pendingSacn = null; }); }
  }
  private pendingSacn: string | null = null;
  /** Netzwerk-Schnittstellen (IPv4), auf denen die Gruppe schon betreten ist. */
  private joinedIfaces = new Set<string>();
  private rejoinTimer?: NodeJS.Timeout;
  /**
   * Gruppe auf JEDER IPv4-Schnittstelle betreten. Ohne Angabe nimmt das System nur eine (meist WLAN mit der
   * Standardroute) – hängt das Pult am Kabel, käme sonst kein sACN an. Neu eingesteckte Kabel werden alle
   * 10 Sekunden nachgezogen.
   */
  private join(s: dgram.Socket, addr: string): void {
    if (this.joined !== addr) {
      for (const ifc of this.joinedIfaces) { try { s.dropMembership(this.joined!, ifc); } catch { /* Schnittstelle weg */ } }
      this.joinedIfaces.clear();
      this.joined = addr;
    }
    const ifaces = Object.values(os.networkInterfaces()).flat()
      .filter((n): n is os.NetworkInterfaceInfo => !!n && n.family === "IPv4" && !n.internal).map(n => n.address);
    for (const ifc of [...this.joinedIfaces]) if (!ifaces.includes(ifc)) this.joinedIfaces.delete(ifc); // Kabel gezogen
    let ok = this.joinedIfaces.size > 0, lastErr = "";
    for (const ifc of ifaces) {
      if (this.joinedIfaces.has(ifc)) continue;
      try { s.addMembership(addr, ifc); this.joinedIfaces.add(ifc); ok = true; } catch (e) { lastErr = (e as Error).message; }
    }
    if (!ok && !ifaces.length) { try { s.addMembership(addr); ok = true; } catch (e) { lastErr = (e as Error).message; } }
    this.status.sacn.error = ok ? undefined : lastErr || undefined;
    if (!this.rejoinTimer) {
      this.rejoinTimer = setInterval(() => { if (this.sacn && this.joined) this.join(this.sacn, this.joined); }, 10_000);
      this.rejoinTimer.unref();
    }
  }

  private ws(port: number): void {
    // Webseiten im Browser dürfen sich nicht verbinden (Cross-Site-WebSocket): Browser senden immer „Origin“,
    // LJ-Link und andere Programme nicht. Nur Seiten vom eigenen Rechner (localhost) sind erlaubt.
    const verifyClient = (info: { origin?: string }) => !info.origin || /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(info.origin);
    const wss = new WebSocketServer({ port, maxPayload: 64 * 1024, verifyClient });
    this.wss = wss;
    wss.on("listening", () => { this.status.lj.listening = true; this.status.lj.error = undefined; });
    wss.on("error", err => { this.status.lj.error = err.message; this.status.lj.listening = false; });
    wss.on("connection", (sock: WebSocket) => {
      this.status.lj.clients = wss.clients.size;
      this.emit({ type: "lj-connection", clients: this.ljClients() });
      sock.on("message", data => {
        const raw = data.toString();
        if (parseLjMessage(raw)) this.emit({ type: "lj", raw });
      });
      sock.on("close", () => {
        this.status.lj.clients = wss.clients.size;
        this.emit({ type: "lj-connection", clients: this.ljClients() });
      });
    });
  }

  /** Adresse von LJ-Link (http://Rechner:Port), wenn verbunden. */
  ljBase(): string | null {
    if (!this.status.lj.pro?.connected || !this.proAttempt) return null;
    return `http://${this.proAttempt.auth}`;
  }
  /** Adresse der Weboberfläche zum Öffnen (auch ohne Verbindung: bestes bekanntes Ziel). */
  ljWebUrl(): string { return `http://${(this.proAttempt ?? this.plan()[0]!).auth}/`; }

  /** Status von VJ-Link an LJ-Link schicken (nur über /vjlink, die Weboberfläche kennt das nicht). */
  sendLj(json: string): void {
    const s = this.pro;
    if (s && s.readyState === WsClient.OPEN && this.status.lj.pro?.connected && this.status.lj.pro.native) s.send(json);
  }

  /** Stand von LJ-Link erneut schicken (die Oberfläche hat neu geladen und kennt ihn nicht). */
  replayLj(): void {
    if (!this.status.lj.pro?.connected || !this.proAdapter) return;
    for (const m of this.proAdapter.snapshot()) this.emit({ type: "lj", raw: JSON.stringify(m) });
  }

  /** Verbundene Gegenstellen insgesamt (LJ-Link mit eigenem Ausgang plus LJ-Link PRO). */
  private ljClients(): number { return (this.wss?.clients.size ?? 0) + (this.status.lj.pro?.connected ? 1 : 0); }

  /** Feste Adresse für LJ-Link („rechner“ oder „rechner:port“); leer = automatisch (Bonjour, sonst dieser Rechner). */
  setLjHost(host: string): void {
    const h = host.trim();
    if (h === this.proHost) return;
    this.proHost = h;
    this.restartPro();
  }

  /** Verbindung neu planen (Adresse geändert oder ein besseres LJ-Link gefunden). */
  private restartPro(): void {
    clearTimeout(this.proTimer);
    const old = this.pro; this.pro = undefined; old?.terminate();
    if (this.status.lj.pro?.connected && this.proAdapter) {
      for (const m of this.proAdapter.clear()) this.emit({ type: "lj", raw: JSON.stringify(m) });
      this.emit({ type: "lj-connection", clients: (this.wss?.clients.size ?? 0) });
    }
    this.proIdx = 0;
    this.status.lj.pro = { host: this.proHost || "auto", connected: false, auto: !this.proHost, found: this.foundNames() };
    this.connectPro();
  }

  /** Reihenfolge der Ziele: feste Adresse oder gefundene LJ-Links, zuletzt dieser Rechner. */
  private plan(): LjAttempt[] { return planAttempts(this.proHost, [...this.found.values()], ownAddrs()); }
  private foundNames(): string[] { return mergeFound([...this.found.values()]).map(f => f.name.replace(/\s\(\d+\)$/, "")); }

  /** Bonjour: LJ-Link-Instanzen im Netz („_ljlink._tcp“) beobachten. */
  private startDiscovery(): void {
    try {
      this.bonjour = new Bonjour();
      const browser = this.bonjour.find({ type: "ljlink" });
      const key = (s: { fqdn?: string; name?: string; port?: number }) => s.fqdn ?? `${s.name}:${s.port}`;
      const changed = (isNew: boolean) => {
        if (this.status.lj.pro) this.status.lj.pro.found = this.foundNames();
        if (this.proHost) return; // feste Adresse: nichts umstellen
        const best = this.plan()[0], cur = this.proAttempt;
        // Noch nicht verbunden und ein neues LJ-Link ist da: sofort dorthin; verbunden nur über die Weboberfläche
        // und eins mit eigenem Endpunkt taucht auf: umsteigen
        // Umsteigen nur auf denselben Rechner (eigener Endpunkt derselben LJ-Link-Installation). Ein fremder Rechner,
        // der sich per Bonjour als LJ-Link ausgibt, kann eine laufende Verbindung so nicht übernehmen.
        const host = (auth: string) => auth.replace(/:\d+$/, "");
        if ((isNew && !this.status.lj.pro?.connected)
          || (this.status.lj.pro?.connected && cur && !cur.native && best?.native && host(best.auth) === host(cur.auth))) this.restartPro();
      };
      const add = (s: Parameters<typeof foundFromService>[0] & { fqdn?: string; name?: string; port?: number }) => {
        const f = foundFromService(s); if (!f) return;
        const k = key(s), isNew = !this.found.has(k);
        if (isNew && this.found.size >= 32) return; // Bonjour-Flut aus dem Netz: Liste begrenzen
        this.found.set(k, f); changed(isNew);
      };
      browser.on("up", add);
      browser.on("srv-update", add);
      browser.on("txt-update", add);
      browser.on("down", s => { this.found.delete(key(s)); if (this.status.lj.pro) this.status.lj.pro.found = this.foundNames(); });
      // Regelmäßig neu fragen (neu gestartete LJ-Links, verlorene Pakete)
      this.discoTimer = setInterval(() => { try { browser.update(); } catch { /* weiter */ } }, 10000);
      this.discoTimer.unref();
    } catch { /* ohne Bonjour: nur dieser Rechner bzw. feste Adresse */ }
  }

  /**
   * LJ-Link automatisch verbinden: Ziele der Reihe nach versuchen (eigener Endpunkt /vjlink, sonst die
   * Weboberfläche /ws, die übersetzt wird). Nach einem Durchlauf ohne Erfolg 3 Sekunden Pause.
   */
  private connectPro(): void {
    const plan = this.plan();
    if (this.proIdx >= plan.length) this.proIdx = 0;
    const at = plan[this.proIdx]!;
    this.proAttempt = at;
    const native = at.native;
    const adapter: LjSource = native ? new LjNativeTracker() : new LjProAdapter();
    this.proAdapter = adapter;
    const send = (list: LjMessage[]) => { for (const m of list) this.emit({ type: "lj", raw: JSON.stringify(m) }); };
    const label = at.label || at.auth;
    let sock: WsClient;
    try { sock = new WsClient(`ws://${at.auth}${at.path}`, { handshakeTimeout: 2500, maxPayload: 1024 * 1024 }); }
    catch { this.proIdx++; this.proTimer = setTimeout(() => this.connectPro(), 300); this.proTimer.unref(); return; }
    this.pro = sock;
    sock.on("message", data => {
      const was = adapter.recognized;
      send(adapter.feed(data.toString()));
      if (!was && adapter.recognized && this.pro === sock) {
        this.status.lj.pro = { host: label, connected: true, native, auto: !this.proHost, found: this.foundNames() };
        this.emit({ type: "lj-connection", clients: this.ljClients() });
      }
    });
    // Ohne Erkennung nach kurzer Zeit: falscher Endpunkt oder fremder Dienst
    const probe = setTimeout(() => { if (!adapter.recognized && this.pro === sock) sock.terminate(); }, 4000);
    sock.on("error", () => { /* nicht erreichbar: nächstes Ziel */ });
    sock.on("close", () => {
      clearTimeout(probe);
      if (this.pro !== sock) return; // neu geplant
      if (adapter.recognized) {
        // Verbindung war da und ist weg (LJ-Link beendet oder neu gestartet): von vorn, zuerst das beste Ziel
        send(adapter.clear());
        this.status.lj.pro = { host: this.proHost || "auto", connected: false, auto: !this.proHost, found: this.foundNames() };
        this.emit({ type: "lj-connection", clients: this.ljClients() });
        this.proIdx = 0;
        this.proTimer = setTimeout(() => this.connectPro(), 1000); this.proTimer.unref();
        return;
      }
      // Nächstes Ziel gleich, nach dem letzten 3 Sekunden Pause
      this.proIdx++;
      const wrap = this.proIdx >= this.plan().length;
      if (wrap) this.proIdx = 0;
      this.proTimer = setTimeout(() => this.connectPro(), wrap ? 3000 : 200); this.proTimer.unref();
    });
  }

  /** Art-Net-Timecode senden (VJ-Link ist die Uhr). Ziel: IP oder Broadcast-Adresse. */
  sendArtnet(bytes: Uint8Array, host: string): void {
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return;
    // Art-Net-Eingang aus: eigener, ungebundener Socket nur zum Senden
    let s = this.artnet;
    if (!s) {
      if (!this.sendSock) {
        this.sendSock = dgram.createSocket({ type: "udp4" });
        this.sendSock.on("error", () => { /* Senden scheitert still */ });
        this.sendSock.bind(() => { try { this.sendSock?.setBroadcast(true); } catch { /* ohne Broadcast */ } });
      }
      s = this.sendSock;
    }
    s.send(bytes, ARTNET_PORT, host, () => { /* Fehler zählen nicht */ });
  }
  private sendSock?: dgram.Socket;

  stop(): void {
    clearInterval(this.rejoinTimer); this.rejoinTimer = undefined;
    clearInterval(this.statusTimer);
    try { this.sendSock?.close(); } catch { /* schon zu */ }
    for (const s of this.sockets) { try { s.close(); } catch { /* schon zu */ } }
    this.wss?.close();
    clearTimeout(this.proTimer);
    const p = this.pro; this.pro = undefined; p?.terminate();
    clearInterval(this.discoTimer);
    try { this.bonjour?.destroy(); } catch { /* schon zu */ }
  }
}
