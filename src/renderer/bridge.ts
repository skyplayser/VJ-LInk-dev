import type { VjBridge } from "../core/frame";

declare global { interface Window { vj?: VjBridge } }

/** Im Browser (npm run web) gibt es keine App-Brücke: alles läuft lokal, ohne Netzwerk-Eingänge. */
export const bridge: VjBridge | null = window.vj ?? null;
