// Kleiner OSC-1.0-Parser (Nachrichten und Bundles). Keine Abhängigkeiten.
export type OscArg = number | string | boolean | Uint8Array | null;
export interface OscMessage { address: string; args: OscArg[]; /** Typ-Kennungen der Argumente („i“, „f“ …), gleiche Reihenfolge. */ tags?: string }

const pad4 = (n: number) => (n + 3) & ~3;

/** Obergrenzen gegen manipulierte Pakete aus dem Netz (OSC hat keine Anmeldung). */
const MAX_ARGS = 64, MAX_MESSAGES = 256;

function readString(buf: Uint8Array, pos: number): [string, number] {
  if (!Number.isInteger(pos) || pos < 0 || pos >= buf.length) throw new Error("OSC: Position außerhalb");
  let end = pos;
  while (end < buf.length && buf[end] !== 0) end++;
  if (end >= buf.length) throw new Error("OSC: String nicht beendet");
  const s = new TextDecoder().decode(buf.subarray(pos, end));
  return [s, pad4(end + 1)];
}

export function parseOsc(buf: Uint8Array): OscMessage[] {
  const out: OscMessage[] = [];
  try { parseInto(buf, out, 0); } catch { /* defekte Pakete verwerfen */ }
  if (out.length > MAX_MESSAGES) out.length = MAX_MESSAGES;
  return out;
}

function parseInto(buf: Uint8Array, out: OscMessage[], depth: number): void {
  if (depth > 4 || buf.length < 4) return;
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let [addr, pos] = readString(buf, 0);
  if (addr === "#bundle") {
    pos = 16; // Name + Timetag
    while (pos + 4 <= buf.length && out.length < MAX_MESSAGES) {
      const size = view.getInt32(pos); pos += 4;
      if (size < 0 || pos + size > buf.length) return;
      parseInto(buf.subarray(pos, pos + size), out, depth + 1);
      pos += size;
    }
    return;
  }
  if (!addr.startsWith("/")) return;
  const [tags, next] = readString(buf, pos);
  pos = next;
  const args: OscArg[] = [];
  if (!tags.startsWith(",") || tags.length - 1 > MAX_ARGS) return;
  const need = (n: number) => { if (pos + n > buf.length) throw new Error("OSC: Paket zu kurz"); };
  for (const t of tags.slice(1)) {
    switch (t) {
      case "i": need(4); args.push(view.getInt32(pos)); pos += 4; break;
      case "f": need(4); args.push(view.getFloat32(pos)); pos += 4; break;
      case "d": need(8); args.push(view.getFloat64(pos)); pos += 8; break;
      case "h": need(8); args.push(Number(view.getBigInt64(pos))); pos += 8; break;
      case "s": { const [s, n] = readString(buf, pos); args.push(s); pos = n; break; }
      case "b": { need(4); const len = view.getInt32(pos); pos += 4; if (len < 0) return; need(len); args.push(buf.slice(pos, pos + len)); pos += pad4(len); break; }
      case "T": args.push(true); break;
      case "F": args.push(false); break;
      case "N": case "I": args.push(null); break;
      default: return; // unbekannter Typ: Rest unlesbar
    }
  }
  out.push({ address: addr, args, tags: tags.slice(1, 1 + args.length) });
}

/** OSC-Nachricht bauen (für Rückmeldungen an Tablets). */
export function buildOsc(address: string, ...args: (number | string)[]): Uint8Array {
  const enc = new TextEncoder();
  const str = (s: string) => { const b = enc.encode(s + "\0"); const o = new Uint8Array(pad4(b.length)); o.set(b); return o; };
  const tags = "," + args.map(a => typeof a === "string" ? "s" : Number.isInteger(a) ? "i" : "f").join("");
  const parts: Uint8Array[] = [str(address), str(tags)];
  for (const a of args) {
    if (typeof a === "string") parts.push(str(a));
    else { const b = new Uint8Array(4); const v = new DataView(b.buffer); Number.isInteger(a) ? v.setInt32(0, a) : v.setFloat32(0, a); parts.push(b); }
  }
  const total = parts.reduce((n, p) => n + p.length, 0);
  const res = new Uint8Array(total); let o = 0;
  for (const p of parts) { res.set(p, o); o += p.length; }
  return res;
}
