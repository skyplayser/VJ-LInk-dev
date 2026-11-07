// Fader-Leiste: immer sichtbar, für alles, was man in der Show schnell braucht.
// Aufgebaut aus dem Control-Register (src/core/controls.ts), also genau die Elemente,
// die später auch per MIDI belegt werden.
import { CONTROLS, setControl, type ControlDef } from "../core/controls";
import { strobeHz } from "../core/audio";
import type { ControlContext } from "../core/control";

const GROUPS = ["Master", "Ebenen", "Effekt", "Strobe", "Tempo", "Szenen"] as const;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e;
}

export function buildDeck(ctx: ControlContext, mount: HTMLElement): () => void {
  const updaters: (() => void)[] = [];
  const defs = CONTROLS.filter(c => c.quick);

  for (const group of GROUPS) {
    const items = defs.filter(d => d.group === group);
    if (!items.length) continue;
    const box = el("section", `dg dg-${group.toLowerCase()}`);
    box.append(el("h3", "", group));
    const faders = el("div", "faders"), pads = el("div", "pads");
    for (const d of items) {
      if (d.kind === "fader") faders.append(fader(d, ctx, updaters));
      else pads.append(pad(d, ctx, updaters));
    }
    if (faders.childElementCount) box.append(faders);
    if (pads.childElementCount) box.append(pads);
    if (group === "Strobe") {
      const info = el("div", "info"); box.append(info);
      updaters.push(() => {
        const s = ctx.show.strobe;
        info.textContent = `${strobeHz(s, ctx.tempo.bpm).toFixed(1)} Hz · ${s.sync ? "im Takt" : "frei"}`;
      });
    }
    mount.append(box);
  }
  return () => { for (const u of updaters) u(); };
}

function fader(d: ControlDef, ctx: ControlContext, updaters: (() => void)[]): HTMLElement {
  const wrap = el("label", "fader");
  const val = el("span", "val");
  const input = el("input"); input.type = "range"; input.min = "0"; input.max = "1000"; input.className = "v";
  input.setAttribute("aria-label", `${d.label} (${d.id})`);
  let dragging = false;
  input.addEventListener("pointerdown", () => { dragging = true; });
  window.addEventListener("pointerup", () => { dragging = false; });
  input.addEventListener("input", () => { setControl(ctx, d.id, Number(input.value) / 1000); show(); });
  input.addEventListener("dblclick", () => { setControl(ctx, d.id, d.id === "master" ? 1 : 0); });
  const show = () => { val.textContent = d.format ? d.format(ctx) : String(Math.round(d.get(ctx) * 100)); };
  updaters.push(() => { if (!dragging) input.value = String(Math.round(d.get(ctx) * 1000)); show(); });
  wrap.append(val, input, el("span", "name", d.label));
  wrap.title = d.id;
  return wrap;
}

function pad(d: ControlDef, ctx: ControlContext, updaters: (() => void)[]): HTMLElement {
  const b = el("button", `pad pad-${d.kind}`, d.label);
  b.dataset.id = d.id; b.title = d.id;
  if (d.id === "blackout") b.classList.add("pad-danger");
  if (d.id.startsWith("strobe")) b.classList.add("pad-strobe");
  if (d.kind === "hold") {
    b.addEventListener("pointerdown", e => { b.setPointerCapture(e.pointerId); setControl(ctx, d.id, 1); });
    b.addEventListener("pointerup", () => { setControl(ctx, d.id, 0); });
    b.addEventListener("pointercancel", () => { setControl(ctx, d.id, 0); });
  } else if (d.kind === "toggle") {
    b.addEventListener("click", () => { setControl(ctx, d.id, d.get(ctx) >= 0.5 ? 0 : 1); });
  } else {
    b.addEventListener("pointerdown", () => { setControl(ctx, d.id, 1); });
    b.addEventListener("pointerup", () => { setControl(ctx, d.id, 0); });
  }
  b.addEventListener("keydown", e => { if (e.key === " " || e.key === "Enter") e.preventDefault(); });
  updaters.push(() => { b.classList.toggle("on", d.kind !== "trigger" ? d.get(ctx) >= 0.5 : d.id.startsWith("scene.") && d.get(ctx) >= 0.5); });
  return b;
}
