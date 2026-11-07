// MIDI-Controller über Web MIDI (in Electron freigegeben, nur Eingang, ohne SysEx).
export type MidiHandler = (data: Uint8Array, device: string) => void;

export class MidiIn {
  devices: string[] = [];
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
      input.onmidimessage = e => { if (e.data) this.onMessage(e.data, input.name ?? ""); };
    });
    this.devices = names;
    this.onChange();
  }
}
