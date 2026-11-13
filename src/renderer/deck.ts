// Fader-Leiste: immer sichtbar, für alles, was man in der Show schnell braucht.
// Aufgebaut aus dem Control-Register (src/core/controls.ts), also genau die Elemente,
// die später auch per MIDI belegt werden.
import { CONTROLS, setControl, type ControlDef } from "../core/controls";
import { recallScene, stepScene } from "../core/control";
import { flashMax, strobeHz } from "../core/audio";
import type { ControlContext } from "../core/control";
import { t } from "../core/i18n";

const GROUPS = ["Master", "Ebenen", "Effekt", "Strobe", "Tempo", "Szenen"] as const;
/** Großer Knopf (wirkt, solange gedrückt) → kleiner „Dauer-An“-Schalter darunter. */
const LATCH: Record<string, string> = { "strobe.flash": "strobe.on", "strobe.whiteFlash": "strobe.white", blinder: "blinder.on" };
const LATCHES = new Set(Object.values(LATCH));

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e;
}

export function buildDeck(ctx: ControlContext, mount: HTMLElement, opts: { openSafety?: () => void } = {}): () => void {
  const updaters: (() => void)[] = [];
  const defs = CONTROLS.filter(c => {
    if (!c.quick) return false;
    const m = /^layer\.(\d+)\./.exec(c.id);
    return !m || Number(m[1]) <= ctx.show.layers.length;
  });

  for (const group of GROUPS) {
    const items = defs.filter(d => d.group === group);
    if (!items.length) continue;
    const box = el("section", `dg dg-${group.toLowerCase()}`);
    box.append(el("h3", "", t(group)));
    const faders = el("div", "faders"), pads = el("div", "pads");
    for (const d of items) {
      if (d.kind === "fader") faders.append(fader(d, ctx, updaters));
      else if (LATCHES.has(d.id)) continue; // steht klein unter seinem großen Knopf
      else if (LATCH[d.id]) {
        const latch = items.find(x => x.id === LATCH[d.id]);
        const col = el("div", "pad-col");
        col.append(pad(d, ctx, updaters));
        if (latch) { const p = pad(latch, ctx, updaters); p.textContent = t("Dauer-An"); p.title = latch.label; p.classList.add("pad-latch"); col.append(p); }
        pads.append(col);
      } else pads.append(pad(d, ctx, updaters));
    }
    if (group === "Strobe") {
      // Rechts neben den Fadern: Blitze pro Sekunde und „Sichere Blitze“ (Klick öffnet Einstellungen → Sicherheit)
      const side = el("div", "strobe-side"), hzEl = el("div", "hz"), mode = el("div", "mode");
      const safeBtn = el("button", "safe-lim");
      safeBtn.title = t("Sichere Blitze: höchstens 3 Blitze pro Sekunde. Klick: Einstellungen → Sicherheit");
      safeBtn.addEventListener("click", () => opts.openSafety?.());
      side.append(hzEl, mode, safeBtn);
      const top = el("div", "strobe-top"); top.append(faders, side); box.append(top);
      updaters.push(() => {
        const s = ctx.show.strobe, safe = ctx.show.safeFlash !== false;
        const hz = strobeHz(s, ctx.tempo.bpm, flashMax(safe));
        const limited = safe && strobeHz(s, ctx.tempo.bpm, flashMax(false)) > hz + 1e-6;
        hzEl.textContent = `${hz.toFixed(1)} Hz`;
        mode.textContent = s.sync ? t("im Takt") : t("frei");
        safeBtn.textContent = limited ? t("begrenzt: Sichere Blitze") : safe ? t("Sichere Blitze an") : t("Sichere Blitze aus");
        safeBtn.classList.toggle("lim", limited); safeBtn.classList.toggle("off", !safe);
      });
    } else if (faders.childElementCount) box.append(faders);
    if (pads.childElementCount) box.append(pads);
    if (group === "Szenen") box.append(sceneButtons(ctx, updaters));
    mount.append(box);
  }
  return () => { for (const u of updaters) u(); };
}

function fader(d: ControlDef, ctx: ControlContext, updaters: (() => void)[]): HTMLElement {
  const wrap = el("label", "fader");
  // Modulation (Anzeige setzt die Hauptschleife, siehe modFeedback): pinker Balken = Wert im Bild, Farbe = Ausschlag
  const track = el("span", "ftrack"), fill = el("i", "fmodfill"), mark = el("i", "fmod");
  const val = el("span", "val");
  const input = el("input"); input.type = "range"; input.min = "0"; input.max = "1000"; input.className = "v";
  input.setAttribute("aria-label", `${d.label} (${d.id})`);
  let dragging = false;
  // Zeiger fangen statt auf window zu lauschen (das Pult wird oft neu gebaut, window-Listener blieben liegen)
  input.addEventListener("pointerdown", e => { dragging = true; try { input.setPointerCapture(e.pointerId); } catch { /* egal */ } });
  const stop = () => { dragging = false; };
  input.addEventListener("pointerup", stop); input.addEventListener("pointercancel", stop); input.addEventListener("lostpointercapture", stop);
  input.addEventListener("input", () => { setControl(ctx, d.id, Number(input.value) / 1000); show(); });
  input.addEventListener("dblclick", () => { setControl(ctx, d.id, d.id === "master" ? 1 : 0); });
  const show = () => { val.textContent = d.format ? d.format(ctx) : String(Math.round(d.get(ctx) * 100)); };
  updaters.push(() => { if (!dragging) input.value = String(Math.round(d.get(ctx) * 1000)); show(); });
  track.append(fill, input, mark);
  wrap.append(val, track, el("span", "name", d.label));
  wrap.dataset.ctl = d.id;
  return wrap;
}

function pad(d: ControlDef, ctx: ControlContext, updaters: (() => void)[]): HTMLElement {
  const b = el("button", `pad pad-${d.kind}`, d.label);
  b.dataset.ctl = d.id;
  if (d.id === "blackout") b.classList.add("pad-danger");
  if (d.id.startsWith("strobe.white")) b.classList.add("pad-white");
  else if (d.id.startsWith("strobe")) b.classList.add("pad-strobe");
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

/** Szenen-Tasten aus der aktuellen Szenenliste (bis 12), dazu Weiter und Auto. */
function sceneButtons(ctx: ControlContext, updaters: (() => void)[]): HTMLElement {
  const wrap = el("div", "pads scene-pads");
  let sig = "";
  const build = () => {
    wrap.replaceChildren();
    ctx.scenes.slice(0, 12).forEach((s, i) => {
      const b = el("button", "pad", s.name); b.dataset.ctl = `scene.${i + 1}`;
      b.addEventListener("pointerdown", () => { recallScene(ctx, i); });
      wrap.append(b);
    });
    const next = el("button", "pad pad-alt", t("Weiter ›")); next.dataset.ctl = "scene.next";
    next.addEventListener("pointerdown", () => { stepScene(ctx, 1); });
    const auto = el("button", "pad pad-alt pad-auto", "Auto"); auto.dataset.ctl = "scene.auto";
    auto.addEventListener("click", () => { ctx.show.autoVj = !ctx.show.autoVj; });
    wrap.append(next, auto);
  };
  updaters.push(() => {
    const s = ctx.scenes.slice(0, 12).map(x => x.name).join("\u0000");
    if (s !== sig) { sig = s; build(); }
    wrap.querySelectorAll<HTMLButtonElement>(".pad").forEach((b, i) => {
      if (b.classList.contains("pad-auto")) b.classList.toggle("on", ctx.show.autoVj);
      else if (!b.classList.contains("pad-alt")) b.classList.toggle("on", ctx.show.scene === i + 1);
    });
  });
  return wrap;
}
