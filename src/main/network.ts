// Netzwerk-Eingänge: Art-Net, sACN, OSC (UDP) und LJ-Link (WebSocket). Alles nur Empfang.
import dgram from "node:dgram";
import { WebSocket as WsClient, WebSocketServer, type WebSocket } from "ws";
import { ARTNET_PORT, parseArtDmx } from "../core/artnet";
import { parseArtTimecode } from "../core/timecode";
import { SACN_PORT, parseSacn, sacnMulticastAddress } from "../core/sacn";
import { parseOsc } from "../core/osc";
import { LJ_DEFAULT_PORT, parseLjMessage, type LjMessage } from "../core/ljlink";
import { LJ_NATIVE_PATH, LJ_PRO_PATH, LJ_PRO_PORT, LjNativeTracker, LjProAdapter, type LjSource } from "../core/ljpro";
import type { ControlEvent, NetStatus } from "../core/frame";

export const OSC_PORT = 8000;

export class Network {
  status: NetStatus = {
    artnet: { listening: false, packets: 0 },
    sacn: { listening: false, packets: 0 },
    osc: { listening: false, port: OSC_PORT, packets: 0 },
    lj: { listening: false, port: LJ_DEFAULT_PORT, clients: 0, pro: { host: "127.0.0.1", connected: false } },
  };
  private pro?: WsClient;
  private proHost = "127.0.0.1";
  private proTimer?: NodeJS.Timeout;
  private proAdapter?: LjSource;
  /** Welcher Endpunkt als Nächstes versucht wird: zuerst der eigene (/vjlink), sonst die Weboberfläche (/ws). */
  private proNative = true;
  private sockets: dgram.Socket[] = [];
  private artnet?: dgram.Socket;
  private wss?: WebSocketServer;
  private sacn?: dgram.Socket;
  private joined?: string;

  constructor(private emit: (e: ControlEvent) => void) {}

  start(sacnUniverse = 1): void {
    this.artnet = this.udp("artnet", ARTNET_PORT, (msg, from) => {
      const p = parseArtDmx(msg);
      if (p) { this.emit({ type: "dmx", source: "artnet", universe: p.universe, data: p.data }); return; }
      const t = parseArtTimecode(msg);
      if (t) { this.emit({ type: "timecode", source: "artnet", tc: t.tc, fps: t.fps, from }); return; }
      return false;
    });
    this.artnet.on("listening", () => { try { this.artnet!.setBroadcast(true); } catch { /* ohne Broadcast */ } });
    this.sacn = this.udp("sacn", SACN_PORT, msg => {
      const p = parseSacn(msg);
      if (p) this.emit({ type: "dmx", source: "sacn", universe: p.universe, data: p.data });
      else return false;
    });
    this.joinSacn(sacnUniverse);
    this.udp("osc", OSC_PORT, msg => {
      const list = parseOsc(msg);
      if (!list.length) return false;
      for (const m of list) {
        const args = m.args.filter((a): a is number | string | boolean | null => !(a instanceof Uint8Array));
        this.emit({ type: "osc", address: m.address, args });
      }
    });
    this.ws(LJ_DEFAULT_PORT);
    this.connectPro();
    setInterval(() => this.emit({ type: "status", status: this.status }), 500).unref();
  }

  private udp(key: "artnet" | "sacn" | "osc", port: number, onMsg: (b: Buffer, from: string) => false | void): dgram.Socket {
    const s = dgram.createSocket({ type: "udp4", reuseAddr: true });
    s.on("message", (msg, rinfo) => {
      if (onMsg(msg, rinfo.address) === false) return;
      const st = this.status[key];
      st.packets++;
      if (key === "artnet") this.status.artnet.lastFrom = rinfo.address;
    });
    s.on("error", err => { this.status[key].error = err.message; this.status[key].listening = false; });
    s.bind(port, () => { this.status[key].listening = true; this.status[key].error = undefined; });
    this.sockets.push(s);
    return s;
  }

  /** Multicast-Gruppe für das gewählte sACN-Universe betreten, die alte verlassen. */
  joinSacn(universe: number): void {
    const s = this.sacn; if (!s) return;
    const addr = sacnMulticastAddress(Math.max(1, Math.min(63999, universe)));
    s.once("listening", () => this.join(s, addr));
    try { this.join(s, addr); } catch { /* Socket noch nicht gebunden: 'listening' erledigt es */ }
  }
  private join(s: dgram.Socket, addr: string): void {
    if (this.joined === addr) return;
    try {
      if (this.joined) s.dropMembership(this.joined);
      s.addMembership(addr);
      this.joined = addr;
    } catch (e) { this.status.sacn.error = (e as Error).message; }
  }

  private ws(port: number): void {
    const wss = new WebSocketServer({ port, maxPayload: 64 * 1024 });
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

  /** Adresse von LJ-Link PRO (http://Rechner:8080), wenn verbunden. */
  ljBase(): string | null {
    if (!this.status.lj.pro?.connected) return null;
    return `http://${this.proAuthority()}`;
  }
  /** Adresse der Weboberfläche zum Öffnen (auch ohne Verbindung). */
  ljWebUrl(): string { return `http://${this.proAuthority()}/`; }

  /** „Rechner:Port“ für LJ-Link: Eingabe „rechner“ oder „rechner:port“ (IPv6 in eckigen Klammern); ohne Port 8080. */
  private proAuthority(): string {
    const h = this.proHost;
    const m = /^(\[[0-9a-fA-F:.]+\]|[^:]+):(\d{2,5})$/.exec(h);
    if (m && Number(m[2]) <= 65535) return `${m[1]}:${m[2]}`;
    return `${h.includes(":") && !h.startsWith("[") ? `[${h}]` : h}:${LJ_PRO_PORT}`;
  }

  /** Status von VJ-Link an LJ-Link schicken (nur über /vjlink, die Weboberfläche kennt das nicht). */
  sendLj(json: string): void {
    const s = this.pro;
    if (s && s.readyState === WsClient.OPEN && this.status.lj.pro?.connected && this.status.lj.pro.native) s.send(json);
  }

  /** Stand von LJ-Link PRO erneut schicken (die Oberfläche hat neu geladen und kennt ihn nicht). */
  replayLj(): void {
    if (!this.status.lj.pro?.connected || !this.proAdapter) return;
    for (const m of this.proAdapter.snapshot()) this.emit({ type: "lj", raw: JSON.stringify(m) });
  }

  /** Verbundene Gegenstellen insgesamt (LJ-Link mit eigenem Ausgang plus LJ-Link PRO). */
  private ljClients(): number { return (this.wss?.clients.size ?? 0) + (this.status.lj.pro?.connected ? 1 : 0); }

  /** Rechner mit LJ-Link PRO ändern (leer = dieser Rechner) und neu verbinden. */
  setLjHost(host: string): void {
    const h = host.trim() || "127.0.0.1";
    if (h === this.proHost) return;
    this.proHost = h; this.proNative = true; this.status.lj.pro = { host: h, connected: false };
    clearTimeout(this.proTimer);
    const old = this.pro; this.pro = undefined; old?.terminate();
    this.connectPro();
  }

  /**
   * LJ-Link PRO automatisch finden: VJ-Link meldet sich an dessen Weboberfläche an (ws://Rechner:8080/ws),
   * versucht es alle 3 Sekunden neu und übersetzt Decks, Tempo, Trackwechsel und Loops.
   */
  private connectPro(): void {
    const host = this.proHost;
    const native = this.proNative;
    const adapter: LjSource = native ? new LjNativeTracker() : new LjProAdapter();
    this.proAdapter = adapter;
    const send = (list: LjMessage[]) => { for (const m of list) this.emit({ type: "lj", raw: JSON.stringify(m) }); };
    let sock: WsClient;
    try { sock = new WsClient(`ws://${this.proAuthority()}${native ? LJ_NATIVE_PATH : LJ_PRO_PATH}`, { handshakeTimeout: 2500, maxPayload: 1024 * 1024 }); }
    catch { this.proTimer = setTimeout(() => this.connectPro(), 3000); this.proTimer.unref(); return; }
    this.pro = sock;
    sock.on("message", data => {
      const was = adapter.recognized;
      send(adapter.feed(data.toString()));
      if (!was && adapter.recognized && this.pro === sock) {
        this.status.lj.pro = { host, connected: true, native };
        this.emit({ type: "lj-connection", clients: this.ljClients() });
      }
    });
    // Ohne Erkennung nach kurzer Zeit: falscher Endpunkt oder fremder Dienst
    const probe = setTimeout(() => { if (!adapter.recognized && this.pro === sock) sock.terminate(); }, 4000);
    sock.on("error", () => { /* LJ-Link PRO läuft nicht: still neu versuchen */ });
    sock.on("close", () => {
      clearTimeout(probe);
      if (this.pro !== sock) return; // Rechner gewechselt
      // Nicht erkannt: beim nächsten Mal den anderen Endpunkt versuchen (ältere LJ-Link-Versionen haben kein /vjlink)
      // Verbindung war da und ist weg (LJ-Link neu gestartet, vielleicht neuere Version): wieder zuerst /vjlink
      this.proNative = adapter.recognized ? true : !native;
      if (adapter.recognized) {
        send(adapter.clear());
        this.status.lj.pro = { host, connected: false };
        this.emit({ type: "lj-connection", clients: this.ljClients() });
      }
      // Gleich den anderen Endpunkt versuchen, sonst in 3 s neu
      this.proTimer = setTimeout(() => this.connectPro(), !adapter.recognized && native ? 200 : adapter.recognized ? 1000 : 3000); this.proTimer.unref();
    });
  }

  /** Art-Net-Timecode senden (VJ-Link ist die Uhr). Ziel: IP oder Broadcast-Adresse. */
  sendArtnet(bytes: Uint8Array, host: string): void {
    if (!this.artnet || !/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return;
    this.artnet.send(bytes, ARTNET_PORT, host, () => { /* Fehler zählen nicht */ });
  }

  stop(): void {
    for (const s of this.sockets) { try { s.close(); } catch { /* schon zu */ } }
    this.wss?.close();
    clearTimeout(this.proTimer);
    const p = this.pro; this.pro = undefined; p?.terminate();
  }
}
