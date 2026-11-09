// LJ-Link im Netz finden (Bonjour „_ljlink._tcp“) und entscheiden, wohin VJ-Link sich verbindet.
// Reine Logik (testbar); die Suche selbst läuft im Hauptprozess.
import { LJ_NATIVE_PATH, LJ_PRO_PATH, LJ_PRO_PORT } from "./ljpro";

/** Ein gefundenes LJ-Link (zusammengefasst über alle Netzwerkkarten). */
export interface FoundLj {
  name: string;
  port: number;
  /** IPv4-Adressen, unter denen es sich meldet. */
  addrs: string[];
  /** Eigener Endpunkt für VJ-Link (TXT path), wenn TXT vjlink=1. */
  path: string | null;
  version?: string;
}

/** Eigene Netzwerkadresse mit Präfixlänge, z. B. { addr: "10.69.10.103", prefix: 24 }. */
export interface OwnAddr { addr: string; prefix: number }

/** Ein Verbindungsversuch: Rechner:Port, Pfad, Protokoll und Anzeigename. */
export interface LjAttempt { auth: string; path: string; native: boolean; label: string }

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const toNum = (ip: string): number | null => {
  const m = IPV4.exec(ip); if (!m) return null;
  const p = m.slice(1).map(Number); if (p.some(x => x > 255)) return null;
  return ((p[0]! << 24) >>> 0) + (p[1]! << 16) + (p[2]! << 8) + p[3]!;
};
const sameNet = (a: string, own: OwnAddr): boolean => {
  const x = toNum(a), y = toNum(own.addr); if (x === null || y === null) return false;
  const mask = own.prefix <= 0 ? 0 : (0xffffffff << (32 - Math.min(32, own.prefix))) >>> 0;
  return ((x & mask) >>> 0) === ((y & mask) >>> 0);
};

/** Beste Adresse: dieser Rechner → 127.0.0.1, sonst eine im eigenen Subnetz, sonst die erste. */
export function pickAddress(addrs: readonly string[], own: readonly OwnAddr[]): { addr: string; rank: number } | null {
  const v4 = addrs.filter(a => toNum(a) !== null);
  if (!v4.length) return null;
  if (v4.some(a => own.some(o => o.addr === a))) return { addr: "127.0.0.1", rank: 0 };
  const local = v4.find(a => own.some(o => sameNet(a, o)));
  return local ? { addr: local, rank: 1 } : { addr: v4[0]!, rank: 2 };
}

/** Eingabe „rechner“ oder „rechner:port“ (IPv6 in eckigen Klammern) → „rechner:port“; ohne Port 8080. */
export function ljAuthority(h: string): string {
  const m = /^(\[[0-9a-fA-F:.]+\]|[^:]+):(\d{2,5})$/.exec(h);
  if (m && Number(m[2]) <= 65535) return `${m[1]}:${m[2]}`;
  return `${h.includes(":") && !h.startsWith("[") ? `[${h}]` : h}:${LJ_PRO_PORT}`;
}

/** Gemeldete Dienste zusammenfassen: gleicher Port und gemeinsame Adresse = dasselbe LJ-Link (z. B. WLAN und Kabel). */
export function mergeFound(list: readonly FoundLj[]): FoundLj[] {
  const out: FoundLj[] = [];
  for (const f of list) {
    const same = out.find(o => o.port === f.port && (o.addrs.some(a => f.addrs.includes(a)) || baseName(o.name) === baseName(f.name)));
    if (same) { for (const a of f.addrs) if (!same.addrs.includes(a)) same.addrs.push(a); same.path ??= f.path; continue; }
    out.push({ ...f, addrs: [...f.addrs] });
  }
  return out;
}
/** Instanzname ohne den Zähler, den Bonjour bei doppelten Namen anhängt („… (2)“). */
const baseName = (n: string): string => n.replace(/\s\(\d+\)$/, "");

/**
 * Reihenfolge der Verbindungsversuche. Feste Adresse: dort erst /vjlink, dann /ws.
 * Automatisch: gefundene LJ-Links (dieser Rechner zuerst, dann eigenes Subnetz), danach dieser Rechner auf 8080.
 */
export function planAttempts(manual: string, found: readonly FoundLj[], own: readonly OwnAddr[]): LjAttempt[] {
  const m = manual.trim();
  if (m) {
    const auth = ljAuthority(m);
    return [{ auth, path: LJ_NATIVE_PATH, native: true, label: m }, { auth, path: LJ_PRO_PATH, native: false, label: m }];
  }
  const ranked = mergeFound(found)
    .map(f => ({ f, a: pickAddress(f.addrs, own) }))
    .filter((x): x is { f: FoundLj; a: { addr: string; rank: number } } => !!x.a)
    .sort((x, y) => x.a.rank - y.a.rank || Number(!!y.f.path) - Number(!!x.f.path));
  const out: LjAttempt[] = [];
  for (const { f, a } of ranked) {
    const auth = `${a.addr}:${f.port}`;
    const label = baseName(f.name);
    if (f.path) out.push({ auth, path: f.path, native: true, label });
    out.push({ auth, path: LJ_PRO_PATH, native: false, label });
  }
  const local = `127.0.0.1:${LJ_PRO_PORT}`;
  if (!out.some(x => x.auth === local && x.native)) out.push({ auth: local, path: LJ_NATIVE_PATH, native: true, label: "" });
  if (!out.some(x => x.auth === local && !x.native)) out.push({ auth: local, path: LJ_PRO_PATH, native: false, label: "" });
  return out;
}

/** Bonjour-Eintrag in FoundLj umwandeln (TXT: vjlink=1, path=/vjlink, app=<Version>). */
export function foundFromService(s: { name?: string; port?: number; addresses?: string[]; txt?: Record<string, unknown> }): FoundLj | null {
  if (!s.port || !Number.isInteger(s.port) || s.port < 1 || s.port > 65535) return null;
  const txt = s.txt ?? {};
  const native = String(txt.vjlink ?? "") === "1";
  const p = typeof txt.path === "string" && /^\/[A-Za-z0-9/_-]{1,40}$/.test(txt.path) ? txt.path : LJ_NATIVE_PATH;
  return {
    name: String(s.name ?? "LJ Link").slice(0, 80), port: s.port,
    addrs: (s.addresses ?? []).filter(a => toNum(a) !== null).slice(0, 8),
    path: native ? p : null,
    ...(typeof txt.app === "string" ? { version: txt.app.slice(0, 20) } : {}),
  };
}
