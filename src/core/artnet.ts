// Art-Net-ArtDMX-Paket lesen (UDP Port 6454). Nur Eingang, kein Senden.
export const ARTNET_PORT = 6454;
export interface ArtDmx { universe: number; sequence: number; data: Uint8Array }

const ID = [0x41, 0x72, 0x74, 0x2d, 0x4e, 0x65, 0x74, 0x00]; // "Art-Net\0"

export function parseArtDmx(buf: Uint8Array): ArtDmx | null {
  if (buf.length < 18) return null;
  for (let i = 0; i < 8; i++) if (buf[i] !== ID[i]) return null;
  const opcode = buf[8]! | (buf[9]! << 8); // little endian
  if (opcode !== 0x5000) return null;
  const length = (buf[16]! << 8) | buf[17]!; // big endian
  if (length < 1 || length > 512 || buf.length < 18 + length) return null;
  const universe = buf[14]! | (buf[15]! << 8); // 15 Bit: Net/SubUni
  return { universe, sequence: buf[12]!, data: buf.slice(18, 18 + length) };
}
