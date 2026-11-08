// Netzwerk-Eingänge: Art-Net, sACN, OSC (UDP) und LJ-Link (WebSocket). Alles nur Empfang.
import dgram from "node:dgram";
import { WebSocketServer, type WebSocket } from "ws";
import { ARTNET_PORT, parseArtDmx } from "../core/artnet";
import { parseArtTimecode } from "../core/timecode";
import { SACN_PORT, parseSacn, sacnMulticastAddress } from "../core/sacn";
import { parseOsc } from "../core/osc";
import { LJ_DEFAULT_PORT, parseLjMessage } from "../core/ljlink";
import type { ControlEvent, NetStatus } from "../core/frame";

export const OSC_PORT = 8000;

export class Network {
  status: NetStatus = {
    artnet: { listening: false, packets: 0 },
    sacn: { listening: false, packets: 0 },
    osc: { listening: false, port: OSC_PORT, packets: 0 },
    lj: { listening: false, port: LJ_DEFAULT_PORT, clients: 0 },
  };
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
      this.emit({ type: "lj-connection", clients: wss.clients.size });
      sock.on("message", data => {
        const raw = data.toString();
        if (parseLjMessage(raw)) this.emit({ type: "lj", raw });
      });
      sock.on("close", () => {
        this.status.lj.clients = wss.clients.size;
        this.emit({ type: "lj-connection", clients: wss.clients.size });
      });
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
  }
}
