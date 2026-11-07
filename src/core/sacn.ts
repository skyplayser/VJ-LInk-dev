// sACN (E1.31) Datenpaket lesen (UDP Port 5568, Multicast 239.255.universe-hi.universe-lo).
export const SACN_PORT = 5568;
export interface SacnDmx { universe: number; priority: number; data: Uint8Array }

export function parseSacn(buf: Uint8Array): SacnDmx | null {
  if (buf.length < 126) return null;
  // ACN-Packet-Identifier "ASC-E1.17" ab Byte 4
  const asc = [0x41, 0x53, 0x43, 0x2d, 0x45, 0x31, 0x2e, 0x31, 0x37];
  for (let i = 0; i < asc.length; i++) if (buf[4 + i] !== asc[i]) return null;
  const priority = buf[108]!;
  const universe = (buf[113]! << 8) | buf[114]!;
  const count = ((buf[123]! << 8) | buf[124]!) - 1; // inkl. Startcode
  if (buf[125] !== 0 || count < 1 || count > 512 || buf.length < 126 + count) return null;
  return { universe, priority, data: buf.slice(126, 126 + count) };
}

export function sacnMulticastAddress(universe: number): string {
  return `239.255.${(universe >> 8) & 0xff}.${universe & 0xff}`;
}
