// Ableton Link über Carabiner (https://github.com/Deep-Symmetry/carabiner).
// Carabiner ist ein eigenes Programm, das Link spricht und Tempo und Beat per TCP (Port 17000) meldet.
// VJ-Link enthält dadurch keinen Link-Code selbst (Link-SDK ist GPL; Carabiner läuft getrennt).
import net from "node:net";

export const CARABINER_PORT = 17000;

export interface LinkState { connected: boolean; peers: number; bpm: number; beat: number }

const STATUS = /status \{ :peers (\d+) :bpm ([\d.]+) :start (-?\d+) :beat (-?[\d.]+) \}/;

export class LinkClient {
  state: LinkState = { connected: false, peers: 0, bpm: 0, beat: 0 };
  private sock: net.Socket | null = null;
  private buf = "";
  private poll: NodeJS.Timeout | null = null;

  constructor(private onStatus: (s: LinkState) => void) {}

  private on = false;
  private retryTimer: NodeJS.Timeout | null = null;

  start(): void { if (this.on) return; this.on = true; this.connect(); }

  private connect(): void {
    if (!this.on) return;
    const s = net.createConnection({ host: "127.0.0.1", port: CARABINER_PORT });
    this.sock = s;
    s.setEncoding("utf8");
    s.on("connect", () => {
      this.state.connected = true;
      s.write("status\n");
      // Beat-Phase regelmäßig holen; Tempoänderungen meldet Carabiner zusätzlich von sich aus.
      this.poll = setInterval(() => s.write("status\n"), 250);
    });
    s.on("data", (d: string) => {
      this.buf += d;
      if (this.buf.length > 65536) this.buf = "";
      let i;
      while ((i = this.buf.indexOf("\n")) >= 0) {
        const line = this.buf.slice(0, i); this.buf = this.buf.slice(i + 1);
        const m = STATUS.exec(line);
        if (m) {
          this.state = { connected: true, peers: Number(m[1]), bpm: Number(m[2]), beat: Number(m[4]) };
          this.onStatus(this.state);
        }
      }
    });
    const retry = () => {
      if (this.poll) { clearInterval(this.poll); this.poll = null; }
      const was = this.state.connected;
      this.state = { connected: false, peers: 0, bpm: 0, beat: 0 };
      if (was) this.onStatus(this.state);
      this.sock = null;
      if (!this.on) return;
      this.retryTimer = setTimeout(() => this.connect(), 3000); this.retryTimer.unref();
    };
    s.on("error", () => { /* Carabiner läuft nicht: still neu versuchen */ });
    s.on("close", retry);
  }

  /** Verbindung trennen und nicht mehr neu versuchen. */
  stop(): void {
    this.on = false;
    if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = null; }
    if (this.poll) { clearInterval(this.poll); this.poll = null; }
    this.sock?.destroy();
    if (this.state.connected) { this.state = { connected: false, peers: 0, bpm: 0, beat: 0 }; this.onStatus(this.state); }
  }
}
