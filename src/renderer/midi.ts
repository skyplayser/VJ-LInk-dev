// MIDI-Controller über Web MIDI: Eingänge lesen, Ausgänge für LED-Rückmeldung (ohne SysEx).
export type MidiHandler = (data: Uint8Array, device: string, tMs: number) => void;

export class MidiIn {
  devices: string[] = [];
  outputs: string[] = [];
  error = "";
  private access: MIDIAccess | null = null;

  constructor(private onMessage: MidiHandler, private onChange: () => void) {}

  async start(): Promise<void> {
    if (!("requestMIDIAccess" in navigator)) { this.error = "MIDI wird hier nicht unterstützt"; this.onChange(); return; }
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false });
      this.access.onstatechange = () => this.bind();
      this.bind();
    } catch {
      this.error = "Zugriff auf MIDI verweigert";
      this.onChange();
    }
  }

  /** Alle Eingänge verbinden; auch neu angesteckte Geräte (Hot-Plug). */
  private bind(): void {
    if (!this.access) return;
    const names: string[] = [];
    this.access.inputs.forEach(input => {
      if (input.state !== "connected") return;
      names.push(input.name ?? "MIDI-Gerät");
      input.onmidimessage = e => {
        if (!e.data) return;
        // Zeitstempel des Ereignisses in Epoch-ms (genauer für MIDI-Clock)
        const t = Date.now() - (performance.now() - e.timeStamp);
        this.onMessage(e.data, input.name ?? "", t);
      };
    });
    const outs: string[] = [];
    this.access.outputs.forEach(o => { if (o.state === "connected") outs.push(o.name ?? ""); });
    this.devices = names;
    this.outputs = outs;
    this.onChange();
  }

  /** An das Gerät senden, dessen Name passt (Ein- und Ausgang heißen meist gleich). */
  send(device: string, bytes: number[]): void {
    if (!this.access) return;
    const want = device.toLowerCase();
    this.access.outputs.forEach(o => {
      const n = (o.name ?? "").toLowerCase();
      if (o.state === "connected" && n && (n === want || n.startsWith(want) || want.startsWith(n))) {
        try { o.send(bytes); } catch { /* Gerät gerade abgezogen */ }
      }
    });
  }
}
