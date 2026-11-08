// Audio-Eingang (Mikrofon, Line-In, Audio-Interface): Spektrum und Wellenform für die Visuals.
import { analyzeSpectrum, sampleWave } from "../core/audio";
import type { MicData } from "../core/show";

export interface AudioDevice { id: string; label: string }

export class AudioIn {
  deviceId = "";
  label = "";
  gain = 1;
  scope: MicData["scope"] = "audio";
  error = "";
  private ac: AudioContext | null = null;
  private an: AnalyserNode | null = null;
  private stream: MediaStream | null = null;
  private freq = new Float32Array(1024);
  private time = new Float32Array(2048);
  private bands: number[] = [];

  get active(): boolean { return !!this.an; }

  /** Eingänge auflisten. Namen gibt es erst nach der ersten Freigabe. */
  async devices(): Promise<AudioDevice[]> {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      return all.filter(d => d.kind === "audioinput" && d.deviceId !== "communications")
        .map((d, i) => ({ id: d.deviceId, label: d.label || `Eingang ${i + 1}` }));
    } catch { return []; }
  }

  async start(deviceId: string): Promise<boolean> {
    this.stop();
    this.error = "";
    try {
      // Rohsignal: keine Sprach-Filter, sonst wird Musik weichgespült
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: deviceId && deviceId !== "default" ? { exact: deviceId } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        video: false,
      });
    } catch (e) {
      this.error = (e as Error).name === "NotAllowedError"
        ? "Kein Zugriff auf das Mikrofon. macOS: Systemeinstellungen → Datenschutz → Mikrofon → VJ-Link erlauben."
        : "Eingang lässt sich nicht öffnen.";
      return false;
    }
    this.ac = new AudioContext();
    void this.ac.resume();
    const src = this.ac.createMediaStreamSource(this.stream);
    this.an = this.ac.createAnalyser();
    this.an.fftSize = 2048;
    this.an.smoothingTimeConstant = 0.55;
    src.connect(this.an);
    this.freq = new Float32Array(this.an.frequencyBinCount);
    this.time = new Float32Array(this.an.fftSize);
    this.deviceId = deviceId;
    this.label = this.stream.getAudioTracks()[0]?.label ?? "Audio-Eingang";
    // Gerät abgezogen: sauber beenden
    this.stream.getAudioTracks()[0]?.addEventListener("ended", () => { this.stop(); this.error = "Eingang getrennt."; });
    return true;
  }

  stop(): void {
    this.stream?.getTracks().forEach(t => t.stop());
    void this.ac?.close();
    this.stream = null; this.ac = null; this.an = null; this.bands = [];
  }

  /** Einmal pro Bild: aktuelle Bänder und Wellenform. */
  sample(): MicData | null {
    if (!this.an || !this.ac) return null;
    this.an.getFloatFrequencyData(this.freq);
    this.an.getFloatTimeDomainData(this.time);
    this.bands = analyzeSpectrum(this.freq, this.ac.sampleRate, this.gain, this.bands);
    return { bands: this.bands, wave: sampleWave(this.time, this.gain * 1.5), scope: this.scope };
  }
}
