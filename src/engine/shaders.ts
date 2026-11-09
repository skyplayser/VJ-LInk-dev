// GLSL ES 3.00. Ein Programm, Generator per Nummer gewählt (uGen).
export const GEN_IDS = ["bar-spectrum", "radial-eq", "oscilloscope", "pulse-rings", "tunnel", "synth-grid", "starfield", "plasma",
  "lissajous", "vu-meter", "dot-matrix", "plexus", "hypercube", "vector-gobos", "bokeh", "burst", "lightning", "ripples", "fire", "liquid-light", "mirror-ball", "uv-glow", "laser-sheet", "laser-fans", "moire", "flower", "co2-jet", "testcard",
  "laser-beams", "laser-sky", "laser-cone", "laser-wave", "laser-matrix", "laser-propeller", "laser-scan",
  "beam-moonflower", "beam-derby", "beam-scanner", "beam-spots", "beam-snow", "beam-polygon", "beam-burst", "beam-scanner-v",
  // Eigene Wege in der Engine (kein Generator-Shader): Bauchbinde und DJ-Wellenform aus LJ-Link
  "now-playing", "dj-waveform",
  // Moderne Techno-Visuals
  "mono-bars", "strobe-grid", "line-scan", "rotor", "split-flash", "pulse-square", "cube-tunnel", "gyroid", "chrome-blobs", "neon-corridor", "point-sphere", "terrain", "ring-stack", "code-rain", "barcode", "data-blocks", "hud", "glitch-wall", "truchet", "riley-waves", "checker-warp", "voronoi", "hex-pulse", "interference", "hypno-spiral", "ink", "aurora", "iridescent", "smoke", "nebula",
  // Paket 1: Fraktale, Demoscene, Heilige Geometrie
  "mandel-zoom", "julia", "sierpinski", "kifs", "apollonian", "carpet", "newton", "tricorn", "rotozoom", "twister", "copper-bars", "sine-dots", "raster-bars", "xor-tunnel", "vector-balls", "shade-bobs", "flower-of-life", "metatron", "spirograph", "star-polygons", "nested-polygons", "seed-of-life", "mandala", "lissajous-knot", "circle-grid",
  // Paket 2: 3D-Raum, Organisch, Partikel
  "sphere-field", "box-field", "torus-ring", "ring-tunnel", "hex-tunnel", "wormhole", "infinite-squares", "dna-helix", "lava-lamp", "caustics", "flow-lines", "domain-warp", "bubbles", "electric", "cells", "tentacles", "marble", "hyperspace", "fireflies", "confetti", "rain-lines", "galaxy", "vortex", "fireworks", "particle-ring", "dust-storm",
  // Paket 3: Retro, Op-Art, Audio, Minimal, Daten
  "outrun-sun", "vhs-tape", "pixel-space", "c64-load", "op-waves", "bulge-grid", "concentric-shift", "vasarely", "zebra-twist", "spectrum-circle", "wave-ribbon", "eq-tower", "bass-ring", "audio-mesh", "single-line", "dot-pulse", "crosshair", "bars-3", "frame-zoom", "radar", "matrix-grid", "world-map",
  "neon-triangles", "kaleido-burst", "infinity-loop"] as const;
export type GenId = typeof GEN_IDS[number];

export const VERT = `#version 300 es
out vec2 vUv;
void main(){
  // Ein Dreieck, das den Bildschirm abdeckt.
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

export const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;

uniform vec2  uRes;
uniform float uTime;      // Ebenen-Zeit in Sekunden (mit Geschwindigkeit)
uniform float uBeat;      // fortlaufender Beat
uniform float uPulse;     // 1 auf dem Beat, fällt ab
uniform float uKey;       // 1 = Helligkeit bestimmt die Deckkraft (Overlay-Ebenen)
uniform int   uGen;
uniform int   uTest;      // Testbild-Muster
uniform vec3  uPal[5];    // mehrere Slots: Palette
uniform int   uPalN;      // Anzahl Farben in der Palette (0 = keine)
uniform vec4  uLz;        // Laser: x, y (-1 … 1), Größe, Stärke
uniform float uLzOv;      // XY-Override: 1 = keine Eigenbewegung, nur X/Y bestimmen die Lage
uniform float uLzRot;     // Drehung (Bogenmaß)
uniform float uRings[4];  // Pulsierende Ringe: Phase 0–1 je Ring, -1 = keiner (Takt oder echte Bass-Schläge)
uniform int   uColorMode; // 0 original, 1 Slot, 2 Verlauf A→B, 3 Regenbogen
uniform vec3  uColA;
uniform vec3  uColB;
uniform float uBands[8];
uniform float uWave[64];   // Wellenform vom Audio-Eingang (-1 … 1)
uniform int   uHasWave;

const float PI = 3.14159265;

float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec3 hsv(float h, float s, float v){
  vec3 k = clamp(abs(fract(h + vec3(0.0, 2.0/3.0, 1.0/3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
  return v * mix(vec3(1.0), k, s);
}
float band(float x){ // x 0..1 → interpolierter Bandwert
  float f = clamp(x, 0.0, 1.0) * 7.0; int i = int(floor(f)); int j = min(i + 1, 7);
  return mix(uBands[i], uBands[j], f - float(i));
}

vec3 barSpectrum(vec2 uv){
  float bars = 32.0;
  float id = floor(uv.x * bars);
  float cx = fract(uv.x * bars);
  float h = band((id + 0.5) / bars) * 0.92 + 0.04;
  float segs = 24.0;
  float sy = floor(uv.y * segs) / segs;
  float on = step(sy, h) * step(0.12, cx) * step(cx, 0.88) * step(0.12, fract(uv.y * segs)) ;
  vec3 c = mix(vec3(0.1, 1.0, 0.2), vec3(1.0, 0.1, 0.05), smoothstep(0.45, 0.9, sy));
  return c * on;
}

vec3 radialEq(vec2 uv){
  vec2 p = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  float r = length(p), a = atan(p.y, p.x);
  float m = abs(a) / PI;                         // gespiegelt links/rechts
  float n = 48.0;
  float id = floor(m * n), cx = fract(m * n);
  float len = band((id + 0.5) / n) * 0.32;
  float inner = 0.16 + 0.03 * uPulse;
  float ray = step(inner, r) * step(r, inner + len) * step(0.15, cx) * step(cx, 0.85);
  float ring = smoothstep(0.006, 0.0, abs(r - inner));
  return hsv(m * 0.8 + uTime * 0.05, 0.85, 1.0) * ray + vec3(1.0) * ring * 0.7;
}

float wave(float x){ // Wellenform interpoliert, x 0–1
  float f = clamp(x, 0.0, 1.0) * 63.0; int i = int(floor(f)); int j = min(i + 1, 63);
  return mix(uWave[i], uWave[j], f - float(i));
}

vec3 oscilloscope(vec2 uv){
  float x = uv.x;
  float y = uHasWave == 1
    ? 0.5 + 0.4 * wave(x)
    : 0.5 + 0.18 * (sin(x * 9.0 + uTime * 3.0) * uBands[0] + sin(x * 23.0 - uTime * 5.0) * uBands[3]
                         + sin(x * 47.0 + uTime * 9.0) * uBands[6] * 0.6);
  float d = abs(uv.y - y);
  float core = smoothstep(0.006, 0.0, d);
  float glow = 0.004 / (d + 0.004);
  return vec3(0.15, 1.0, 0.45) * (core + glow * 0.5);
}

vec3 pulseRings(vec2 uv){
  vec2 p = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  float d = length(p);
  float acc = 0.0;
  for (int i = 0; i < 4; i++){
    float ph = uRings[i];
    if (ph < 0.0) continue;
    float rr = ph * 0.9;
    acc += smoothstep(0.02 + 0.02 * uBands[0], 0.0, abs(d - rr)) * (1.0 - ph);
  }
  acc += smoothstep(0.06, 0.0, d - 0.04 * uPulse) * uPulse;
  return vec3(acc);
}

vec3 tunnel(vec2 uv){
  vec2 p = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  float r = length(p) + 1e-4, a = atan(p.y, p.x);
  float z = 0.35 / r + uTime * 1.5 + uPulse * 0.25;
  float rings = smoothstep(0.35, 0.5, abs(fract(z) - 0.5));
  float rays = smoothstep(0.42, 0.5, abs(fract(a / PI * 6.0 + z * 0.15) - 0.5));
  float v = max(rings, rays * 0.8);
  float fade = smoothstep(0.0, 0.25, r);
  return vec3(v * fade * (0.7 + 0.5 * uPulse));
}

vec3 synthGrid(vec2 uv){
  float hor = 0.45;
  vec2 p = uv;
  vec3 c = vec3(0.0);
  if (p.y < hor){
    float depth = 0.12 / (hor - p.y);
    float x = (p.x - 0.5) * depth * (uRes.x / uRes.y) * 2.0;
    float z = depth + uTime * 1.2;
    float gx = smoothstep(0.0, 0.03, abs(fract(x) - 0.5) - 0.465);
    float gz = smoothstep(0.0, 0.03, abs(fract(z) - 0.5) - 0.465);
    float fog = clamp(1.0 - (hor - p.y) * 0.0, 0.0, 1.0) * smoothstep(0.0, 0.25, hor - p.y);
    c = vec3(max(gx, gz)) * fog * (0.8 + 0.5 * uPulse);
  } else {
    vec2 q = (p - vec2(0.5, hor + 0.22)) * vec2(uRes.x / uRes.y, 1.0);
    float sun = smoothstep(0.2, 0.19, length(q));
    float cut = step(0.0, sin((q.y + uTime * 0.05) * 80.0)) * smoothstep(0.1, -0.1, q.y);
    c = vec3(sun * (1.0 - cut * 0.9));
    c += vec3(0.2) * smoothstep(0.1, 0.0, p.y - hor);
  }
  return c;
}

vec3 starfield(vec2 uv){
  vec2 p = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  float acc = 0.0;
  float speed = 0.25 + 0.9 * uPulse;
  for (int i = 0; i < 90; i++){
    float fi = float(i);
    float ang = hash(vec2(fi, 1.0)) * 2.0 * PI;
    float ph = fract(hash(vec2(fi, 2.0)) + uTime * 0.12 * (0.5 + hash(vec2(fi, 3.0))) + uPulse * 0.02);
    float rad = ph * ph * 1.2;
    vec2 pos = vec2(cos(ang), sin(ang)) * rad;
    vec2 dir = normalize(pos + 1e-5);
    float d = length(p - pos);
    float streak = length((p - pos) - dir * clamp(dot(p - pos, dir), -speed * 0.05 * ph, 0.0));
    acc += smoothstep(0.006 + 0.008 * ph, 0.0, streak) * (0.4 + ph) * 1.6;
  }
  return vec3(acc);
}

vec3 plasma(vec2 uv){
  vec2 p = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0) * 4.0;
  float t = uTime * 0.6;
  float v = sin(p.x + t) + sin((p.y + t) * 0.7) + sin((p.x + p.y + t) * 0.5) + sin(length(p) * 1.5 - t * 1.3 + uBands[0] * 2.0);
  v = v * 0.25 + 0.5;
  return hsv(v + uTime * 0.03, 0.8, 0.35 + 0.65 * v);
}

// ---- Hilfen für die weiteren Generatoren ----------------------------------------------
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for (int k = 0; k < 5; k++) { v += a * vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return v;
}
float segDist(vec2 p, vec2 a, vec2 b){
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h);
}
vec2 cp(vec2 uv){ return (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0); }
mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
float glowLine(float d, float core, float glow){ return smoothstep(core, 0.0, d) + glow / (d + glow) * 0.5; }

// 4 Lissajous-Figuren: echte Wellenform (X = Signal, Y = Signal eine Viertelperiode später) oder im Takt
vec3 lissajous(vec2 uv){
  vec2 p = cp(uv);
  float d = 1e3; vec2 prev = vec2(0.0);
  float b = 2.0 + floor(uBands[2] * 3.0);
  for (int i = 0; i <= 96; i++) {
    float s = float(i) / 96.0;
    vec2 q = uHasWave == 1
      ? vec2(wave(s), wave(fract(s + 0.25))) * 0.42
      : vec2(sin(3.0 * s * 6.2832 + uTime * 0.7), sin(b * s * 6.2832)) * (0.3 + 0.12 * uBands[0]);
    if (i > 0) d = min(d, segDist(p, prev, q));
    prev = q;
  }
  return vec3(0.3, 1.0, 0.6) * glowLine(d, 0.005, 0.003);
}

// 5 VU-Meter: zwei LED-Ketten (tief / hoch) mit grün, gelb, rot
vec3 vuMeter(vec2 uv){
  float upper = step(0.5, uv.y);
  float lv = upper > 0.5 ? (uBands[0] + uBands[1] + uBands[2] + uBands[3]) * 0.27 : (uBands[3] + uBands[4] + uBands[5] + uBands[6]) * 0.29;
  lv = clamp(lv, 0.0, 1.0);
  float y = fract(uv.y * 2.0);
  float bar = step(0.3, y) * step(y, 0.7);
  float segs = 32.0, sx = floor(uv.x * segs) / segs;
  float gap = step(0.14, fract(uv.x * segs)) * step(0.04, uv.x) * step(uv.x, 0.96);
  vec3 col = sx < 0.62 ? vec3(0.1, 1.0, 0.25) : sx < 0.84 ? vec3(1.0, 0.85, 0.1) : vec3(1.0, 0.15, 0.1);
  return col * bar * gap * (step(sx, lv) + 0.08);
}

// 6 Punkt-Matrix: Rasterpunkte, Höhe je Spalte nach Frequenz
vec3 dotMatrix(vec2 uv){
  vec2 g = vec2(floor(32.0 * uRes.x / uRes.y / 2.6), 16.0);
  vec2 id = floor(uv * g), f = fract(uv * g) - 0.5;
  float v = band((id.x + 0.5) / g.x) * 0.95 + 0.04;
  float lit = step((id.y + 0.5) / g.y, v);
  float dotm = smoothstep(0.38, 0.28, length(f));
  return hsv(0.33 - 0.33 * (id.y / g.y), 0.9, 1.0) * dotm * (lit + 0.07);
}

// 10 Wireframe-Plexus: Punkte im Raum, nahe Punkte verbunden
vec3 plexus(vec2 uv){
  vec2 p = cp(uv);
  float a = uRes.x / uRes.y;
  vec2 pt[18];
  for (int i = 0; i < 18; i++) {
    float fi = float(i);
    pt[i] = vec2(sin(uTime * 0.23 * (0.6 + hash(vec2(fi, 1.0))) + fi * 1.7) * 0.46 * a,
                 cos(uTime * 0.19 * (0.6 + hash(vec2(fi, 2.0))) + fi * 2.3) * 0.44);
  }
  float acc = 0.0;
  for (int i = 0; i < 18; i++) {
    acc += smoothstep(0.012 + 0.006 * uPulse, 0.0, length(p - pt[i]));
    for (int j = i + 1; j < 18; j++) {
      float dd = length(pt[i] - pt[j]);
      if (dd < 0.42) acc += smoothstep(0.0035, 0.0, segDist(p, pt[i], pt[j])) * (1.0 - dd / 0.42) * (0.6 + 0.6 * uPulse);
    }
  }
  return vec3(acc);
}

// 11 Tesserakt: 4D-Würfel, gedreht und projiziert
vec3 hypercube(vec2 uv){
  vec2 p = cp(uv);
  vec2 V[16];
  float a = uTime * 0.5, b = uTime * 0.31, c = uTime * 0.2;
  for (int i = 0; i < 16; i++) {
    vec4 v = vec4(float(i & 1), float((i >> 1) & 1), float((i >> 2) & 1), float((i >> 3) & 1)) - 0.5;
    v = vec4(v.x * cos(a) - v.w * sin(a), v.y, v.z, v.x * sin(a) + v.w * cos(a));
    v = vec4(v.x, v.y * cos(b) - v.z * sin(b), v.y * sin(b) + v.z * cos(b), v.w);
    v = vec4(v.x * cos(c) - v.z * sin(c), v.y, v.x * sin(c) + v.z * cos(c), v.w);
    vec3 p3 = v.xyz / (2.0 - v.w);
    V[i] = p3.xy / (2.2 - p3.z) * (1.5 + 0.25 * uPulse);
  }
  float d = 1e3;
  for (int i = 0; i < 16; i++) for (int k = 0; k < 4; k++) {
    int j = i ^ (1 << k);
    if (j > i) d = min(d, segDist(p, V[i], V[j]));
  }
  return vec3(glowLine(d, 0.004, 0.002));
}

// 12 Vektor-Gobos: Kreuz, Dreieck, Hexagon, alle 4 Beats wechselnd, im Takt skaliert
float sdHex(vec2 p, float r){ const vec3 k = vec3(-0.8660254, 0.5, 0.57735); p = abs(p); p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy; p -= vec2(clamp(p.x, -k.z * r, k.z * r), r); return length(p) * sign(p.y); }
float sdTri(vec2 p, float r){ const float k = 1.7320508; p.x = abs(p.x) - r; p.y = p.y + r / k; if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.0; p.x -= clamp(p.x, -2.0 * r, 0.0); return -length(p) * sign(p.y); }
float sdCross(vec2 p, float r){ p = abs(p); vec2 q = p.x > p.y ? p : p.yx; return length(max(q - vec2(r, r * 0.25), 0.0)) + min(max(q.x - r, q.y - r * 0.25), 0.0); }
vec3 vectorGobos(vec2 uv){
  vec2 p = rot(uTime * 0.3) * cp(uv);
  int shape = int(mod(floor(uBeat / 4.0), 3.0));
  float acc = 0.0;
  for (int k = 0; k < 4; k++) {
    float s = (0.12 + 0.1 * float(k)) * (1.0 + 0.25 * uPulse);
    vec2 q = rot(float(k) * 0.4 * (mod(float(k), 2.0) * 2.0 - 1.0) * uTime * 0.2) * p;
    float d = shape == 0 ? sdCross(q, s) : shape == 1 ? sdTri(q, s) : sdHex(q, s);
    acc += smoothstep(0.006, 0.0, abs(d)) * (1.0 - float(k) * 0.2);
  }
  return vec3(acc);
}

// 15 Staub und Bokeh: weiche, langsam steigende Lichtpunkte
vec3 bokeh(vec2 uv){
  vec2 p = cp(uv);
  float a = uRes.x / uRes.y;
  vec3 col = vec3(0.0);
  for (int i = 0; i < 40; i++) {
    float fi = float(i);
    vec2 c = vec2((hash(vec2(fi, 1.0)) - 0.5) * a + sin(uTime * 0.2 + fi) * 0.05,
                  fract(hash(vec2(fi, 2.0)) + uTime * 0.02 * (0.4 + hash(vec2(fi, 3.0)))) * 1.3 - 0.65);
    float r = 0.02 + 0.07 * hash(vec2(fi, 4.0));
    float disc = smoothstep(r, r * 0.55, length(p - c));
    col += hsv(0.08 + 0.15 * hash(vec2(fi, 6.0)), 0.5, 1.0) * disc * (0.15 + 0.35 * hash(vec2(fi, 5.0))) * (0.8 + 0.5 * uBands[1]);
  }
  return col;
}

// 16 Partikel-Explosion: auf jedem Beat ein Burst aus der Mitte
vec3 burst(vec2 uv){
  vec2 p = cp(uv);
  float ph = fract(uBeat), seed = floor(uBeat);
  float acc = 0.0;
  for (int i = 0; i < 70; i++) {
    float fi = float(i);
    float an = hash(vec2(fi, seed)) * 6.2832;
    float sp = 0.3 + 0.7 * hash(vec2(seed, fi + 3.0));
    vec2 dir = vec2(cos(an), sin(an));
    float r = sp * ph * (1.0 - 0.35 * ph);
    float d = segDist(p, dir * r * 0.85, dir * r);
    acc += smoothstep(0.006, 0.0, d) * pow(1.0 - ph, 1.5);
  }
  return vec3(acc) * vec3(1.0, 0.85, 0.6);
}

// 18 Blitz: gezackte Entladung zwischen zwei Punkten, flackert
float boltY(float x, float seed){
  float y = 0.0, amp = 0.16, f = 3.0;
  for (int k = 0; k < 5; k++) { y += (vnoise(vec2(x * f, seed * 7.0 + float(k) * 13.0)) - 0.5) * amp; amp *= 0.5; f *= 2.1; }
  return y;
}
vec3 lightning(vec2 uv){
  vec2 p = cp(uv);
  float a = uRes.x / uRes.y;
  float seed = floor(uTime * 9.0);
  float flick = step(0.35, hash(vec2(seed, 2.0))) * (0.6 + 0.6 * uPulse);
  float acc = 0.0;
  for (int b = 0; b < 2; b++) {
    float off = float(b) * 0.22 - 0.11;
    float y = boltY(p.x, seed + float(b) * 31.0) + off;
    float edge = smoothstep(0.5 * a, 0.42 * a, abs(p.x));
    acc += glowLine(abs(p.y - y), 0.003, 0.002) * edge;
  }
  return vec3(0.7, 0.8, 1.0) * acc * flick;
}

// 19 Wellen / Wasser: Höhenfeld aus zwei Quellen, beleuchtet
float waterH(vec2 p){
  float r1 = length(p - vec2(-0.3, 0.1)), r2 = length(p - vec2(0.35, -0.15));
  return sin(r1 * 38.0 - uTime * 3.0 - uBands[0] * 2.0) / (1.0 + r1 * 6.0) + sin(r2 * 31.0 - uTime * 2.4) / (1.0 + r2 * 6.0);
}
vec3 ripples(vec2 uv){
  vec2 p = cp(uv);
  float e = 0.002;
  vec3 n = normalize(vec3(waterH(p - vec2(e, 0.0)) - waterH(p + vec2(e, 0.0)), waterH(p - vec2(0.0, e)) - waterH(p + vec2(0.0, e)), e * 6.0));
  float lit = clamp(dot(n, normalize(vec3(0.4, 0.5, 0.8))), 0.0, 1.0);
  float spec = pow(lit, 24.0);
  return mix(vec3(0.0, 0.08, 0.2), vec3(0.1, 0.55, 0.9), lit) + spec * (0.6 + 0.6 * uBands[1]);
}

// 20 Feuer: Flammen aus Rauschen, Bass macht sie höher
vec3 fire(vec2 uv){
  vec2 p = cp(uv);
  float n = fbm(vec2(p.x * 3.0, uv.y * 4.0 - uTime * 2.4));
  float h = (1.0 - uv.y * 1.3) + (n - 0.5) * 0.9 + uBands[0] * 0.3;
  float i = clamp(h * 1.4 - abs(p.x) * 0.5, 0.0, 1.0);
  return vec3(1.6 * i, 1.4 * i * i, 0.9 * i * i * i * i);
}

// 22 Liquid Light: Öl-Wasser-Farben, langsam fließend
vec3 liquidLight(vec2 uv){
  vec2 q = cp(uv) * 1.6;
  vec2 w = vec2(fbm(q + uTime * 0.05), fbm(q + vec2(5.2, 1.3) - uTime * 0.04));
  float n = fbm(q + 2.2 * w + uTime * 0.03);
  float blob = smoothstep(0.35, 0.75, n);
  return hsv(n * 1.3 + uTime * 0.02, 0.85, 0.15 + blob * 1.1);
}

// 27 Spiegelkugel: viele kleine Lichtpunkte, die durch den Raum wandern
vec3 mirrorBall(vec2 uv){
  vec2 p = cp(uv);
  vec3 col = vec3(0.0);
  for (int l = 0; l < 2; l++) {
    float sc = 14.0 + float(l) * 9.0;
    vec2 g = vec2(p.x * sc + uTime * (0.5 + 0.3 * float(l)), p.y * sc + float(l) * 3.7);
    vec2 id = floor(g), f = fract(g) - 0.5;
    float h = hash(id + float(l) * 11.0);
    vec2 off = (vec2(hash(id + 3.1), hash(id + 7.7)) - 0.5) * 0.6;
    float spot = smoothstep(0.13, 0.0, length(f - off)) * step(0.3, h) * (0.55 + 0.45 * sin(uTime * 3.0 + h * 20.0));
    col += mix(vec3(1.0), hsv(h, 0.3, 1.0), 0.3) * spot;
  }
  return col * (0.8 + 0.4 * uPulse);
}

// 28 UV / Schwarzlicht: fluoreszierende Linien auf Schwarz
vec3 uvGlow(vec2 uv){
  vec2 p = cp(uv);
  float n = fbm(p * 2.2 + uTime * 0.05);
  float line = smoothstep(0.07, 0.0, abs(fract(n * 5.0 + uTime * 0.05) - 0.5) - 0.0) * 1.2;
  vec3 pal = mix(vec3(1.0, 0.1, 0.9), vec3(0.3, 1.0, 0.2), step(0.5, fract(n * 2.5)));
  return pal * line + vec3(0.18, 0.0, 0.35) * 0.25;
}

// 30 Laser-Fächer: Strahlen aus einem Punkt, schwenkend
vec3 laserFans(vec2 uv){
  vec2 d = cp(uv) - vec2(0.0, -0.48);
  float ang = atan(d.x, d.y), r = length(d);
  vec3 col = vec3(0.0);
  float spread = 0.75 + 0.25 * sin(uTime * 0.7);
  for (int i = 0; i < 12; i++) {
    float a = (float(i) / 11.0 - 0.5) * 2.4 * spread + sin(uTime * 1.1) * 0.18;
    float g = 0.003 / (abs(sin(ang - a)) * r + 0.003) * smoothstep(1.6, 0.0, r);
    col += hsv(0.33 + 0.03 * float(i), 0.9, 1.0) * g * 0.9;
  }
  return col * (0.7 + 0.5 * uPulse);
}

// 32 Moiré-Strahlen: zwei Strahlenbündel überlagert
vec3 moire(vec2 uv){
  vec2 p = cp(uv);
  vec2 c1 = vec2(-0.25 + sin(uTime * 0.3) * 0.15, 0.05), c2 = vec2(0.25 + cos(uTime * 0.23) * 0.15, -0.05);
  float a1 = atan(p.y - c1.y, p.x - c1.x), a2 = atan(p.y - c2.y, p.x - c2.x);
  float m = (0.5 + 0.5 * sin(a1 * 48.0 + uTime)) * (0.5 + 0.5 * sin(a2 * 48.0 - uTime * 0.7));
  return vec3(smoothstep(0.55, 1.0, m)) * (0.8 + 0.4 * uPulse);
}

// 33 Blumen-Strahlen: gegenläufige Strahlenkränze mit Farbwechsel
vec3 flower(vec2 uv){
  vec2 p = cp(uv);
  float r = length(p), a = atan(p.y, p.x);
  float r1 = pow(max(0.0, cos((a + uTime * 0.8) * 12.0)), 18.0) * smoothstep(0.6, 0.1, r) * step(0.06, r);
  float r2 = pow(max(0.0, cos((a - uTime * 0.6) * 8.0)), 18.0) * smoothstep(0.45, 0.05, r);
  vec3 col = hsv(uTime * 0.05 + floor(uBeat) * 0.13, 0.8, 1.0) * r1 + hsv(uTime * 0.05 + 0.5, 0.8, 1.0) * r2;
  return col * (0.8 + 0.4 * uPulse) + vec3(smoothstep(0.08, 0.0, r)) * uPulse;
}

// 34 CO2-Stoß: weiße Nebelsäulen auf jedem zweiten Beat, die sofort verfliegen
vec3 co2Jet(vec2 uv){
  vec2 p = cp(uv);
  float a = uRes.x / uRes.y;
  float age = fract(uBeat * 0.5), fade = pow(1.0 - age, 1.2);
  float acc = 0.0;
  for (int j = 0; j < 4; j++) {
    vec2 q = p - vec2((float(j) - 1.5) * 0.28 * a, -0.5);
    float h = min(1.2, age * 5.0);
    float w = 0.02 + q.y * 0.28;
    float inside = smoothstep(w, w * 0.25, abs(q.x)) * step(0.0, q.y) * smoothstep(h, h - 0.3, q.y);
    float n = fbm(vec2(q.x * 8.0, q.y * 4.0 - uTime * 3.0) + float(j) * 4.0);
    acc += inside * (0.5 + 1.1 * n);
  }
  return vec3(min(1.0, acc * fade * 1.4));
}

// 36 Testbild: Farbbalken, Graustufen, Raster, Kreis, Ränder, laufender Zeiger (zeigt, dass das Bild lebt)
/** Raster mit Kreisen und Diagonalen. q: Pixel (y nach unten) in einer Fläche der Größe sz, k: Fläche-Pixel pro Bildschirm-Pixel. */
vec3 alignGrid(vec2 q, vec2 sz, float k){
  float m = min(sz.x, sz.y), cell = m / 12.0, lw = 0.75 * k;
  vec3 c = vec3(0.0);
  vec2 g = abs(fract((q - sz * 0.5) / cell + 0.5) - 0.5) * cell;
  c = max(c, vec3(0.45) * step(min(g.x, g.y), lw));
  vec2 g4 = abs(fract((q - sz * 0.5) / (cell * 4.0) + 0.5) - 0.5) * cell * 4.0;
  c = max(c, vec3(0.8) * step(min(g4.x, g4.y), lw * 1.6));
  vec2 d = abs(q - sz * 0.5);
  c = max(c, vec3(1.0, 0.25, 0.3) * step(min(d.x, d.y), lw * 2.2));
  float diag = length(sz);
  float d1 = abs(q.x * sz.y - q.y * sz.x) / diag, d2 = abs(q.x * sz.y + q.y * sz.x - sz.x * sz.y) / diag;
  c = max(c, vec3(0.3, 0.8, 1.0) * step(min(d1, d2), lw * 1.4));
  float r = length(q - sz * 0.5);
  c = max(c, vec3(1.0) * step(abs(r - m * 0.45), lw * 1.6));
  // Kreise in den Ecken (rund = keine Verzerrung)
  vec2 cq = min(q, sz - q);
  c = max(c, vec3(1.0, 0.85, 0.2) * step(abs(length(cq - cell * 1.5) - cell), lw * 1.4));
  vec2 e = min(q, sz - q);
  c = max(c, vec3(1.0) * step(min(e.x, e.y), lw * 3.0));
  return c;
}

vec3 testcard(vec2 uv){
  vec2 px = uv * uRes;
  // 1 Raster pro Ausgang, 2 Raster über alle (wird auf der ganzen Leinwand gerechnet und dann aufgeteilt)
  if (uTest == 1 || uTest == 2) return alignGrid(px, uRes, 1.0);
  if (uTest == 3) {
    vec2 e = min(px, uRes - px);
    return mix(vec3(0.06, 0.07, 0.1), vec3(1.0), step(min(e.x, e.y), 6.0));
  }
  if (uTest == 4) {
    if (uv.y > 0.5) return vec3(uv.x);
    if (uv.y > 0.06) return vec3(floor(uv.x * 16.0) / 15.0);
    // Schwarz-Stufen nahe 0: sind 1–5 % noch unterscheidbar?
    return vec3(floor(uv.x * 6.0) * 0.01);
  }
  if (uTest == 5) return vec3(1.0);
  if (uTest == 6) return vec3(1.0, 0.0, 0.0);
  if (uTest == 7) return vec3(0.0, 1.0, 0.0);
  if (uTest == 8) return vec3(0.0, 0.0, 1.0);
  vec3 c;
  if (uv.y > 0.34) {
    int bar = int(floor(uv.x * 7.0));
    c = bar == 0 ? vec3(0.75) : bar == 1 ? vec3(0.75, 0.75, 0.0) : bar == 2 ? vec3(0.0, 0.75, 0.75) : bar == 3 ? vec3(0.0, 0.75, 0.0)
      : bar == 4 ? vec3(0.75, 0.0, 0.75) : bar == 5 ? vec3(0.75, 0.0, 0.0) : vec3(0.0, 0.0, 0.75);
  } else if (uv.y > 0.22) {
    c = vec3(floor(uv.x * 11.0) / 10.0);
  } else {
    c = uv.x < 0.25 ? vec3(0.0, 0.13, 0.3) : uv.x < 0.5 ? vec3(1.0) : uv.x < 0.75 ? vec3(0.2, 0.0, 0.4) : vec3(0.02);
  }
  float cell = uRes.y / 12.0;
  vec2 g = abs(fract(px / cell + 0.5) - 0.5) * cell;
  float grid = step(min(g.x, g.y), 0.75);
  c = mix(c, vec3(0.92), grid * 0.65);
  // Kreis nach der kürzeren Seite, damit er auch hochkant ganz drauf ist
  float m = min(uRes.x, uRes.y);
  vec2 p = (uv - 0.5) * uRes / m;
  float r = length(p);
  c = mix(c, vec3(1.0), smoothstep(1.6 / m, 0.0, abs(r - 0.42)));
  c = mix(c, vec3(1.0), step(abs(p.x), 1.0 / m) * step(r, 0.42) + step(abs(p.y), 1.0 / m) * step(r, 0.42));
  float a = atan(p.y, p.x), sweep = mod(-uTime * 3.1416, 6.2832) - 3.1416;
  c = mix(c, vec3(1.0, 0.2, 0.4), smoothstep(0.05, 0.0, abs(a - sweep)) * step(r, 0.4) * step(0.05, r));
  vec2 e = min(px, uRes - px);
  c = mix(c, vec3(1.0), step(min(e.x, e.y), 3.0));
  c = mix(c, vec3(1.0, 0.1, 0.1), step(max(e.x, e.y), cell * 0.5) * step(min(e.x, e.y), cell * 0.5) * 0.9);
  return c;
}

/** Verlauf durch alle Farben der Palette (rundum), t 0–1. */
vec3 palAt(float t){
  float n = float(max(uPalN, 1)), f = fract(t) * n;
  int i = int(floor(f)), j = int(mod(floor(f) + 1.0, n));
  return mix(uPal[i], uPal[j], smoothstep(0.0, 1.0, fract(f)));
}

// ---- Laser: Beamer als Showlaser ---------------------------------------------------------
// Im Nebel wird jeder helle Bildpunkt ein Strahl. Darum: harte, dünne Punkte und Linien (Breite in Bildschirm-
// Pixeln, unabhängig von der Auflösung), satte Laserfarben, alles andere exakt Schwarz (kein Schein, kein Nebel im Bild).
vec3 laserColor(float k){
  float i = mod(k, 7.0);
  return i < 0.5 ? vec3(0.0, 1.0, 0.08) : i < 1.5 ? vec3(1.0, 0.0, 0.04) : i < 2.5 ? vec3(0.08, 0.2, 1.0)
       : i < 3.5 ? vec3(0.0, 1.0, 1.0) : i < 4.5 ? vec3(1.0, 0.8, 0.0) : i < 5.5 ? vec3(1.0, 0.0, 1.0) : vec3(1.0);
}
// Stärke in Pixeln bezogen auf 1080 Zeilen: auf 4K-Beamern wachsen Linien mit, sonst würden die Strahlen dunkler.
float lzK(){ return max(1.0, uRes.y / 1080.0) * clamp(uLz.w, 0.25, 6.0); }
/** Laser-Koordinaten: Lage und Größe der Ebene (Regler Höhe, Seite, Größe). */
// Ohne XY-Override liegen Laser von sich aus im oberen Drittel (Y = 0 → +0,15), mit Override zählt nur X/Y.
vec2 lzOff(){ return vec2(uLz.x * 0.5 * uRes.x / uRes.y, uLz.y * 0.5 + 0.15 * (1.0 - uLzOv)); }
vec2 lzP(vec2 uv){
  vec2 p = cp(uv) - lzOff();
  float c = cos(uLzRot), s = sin(uLzRot);
  p = mat2(c, s, -s, c) * p;
  return p / max(uLz.z, 0.05);
}
/** Pixel pro Laser-Einheit (für Abstände in Pixeln). */
float lzPx(){ return uRes.y * max(uLz.z, 0.05); }
/** Farbe eines Elements: mehrere Slots → jedes Element eine andere, alle 8 Beats weiter; sonst Laserfarben. */
vec3 lzCol(float k, float i){
  if (uColorMode == 4 && uPalN > 0) return uPal[int(mod(k + i, float(uPalN)))];
  return laserColor(k);
}
/** Linie (wird im Nebel eine Lichtfläche): etwa 4 px. d = Abstand in Pixeln. */
float lzLine(float d){ float k = lzK(); return smoothstep(2.6 * k, 1.2 * k, d); }
/** Punkt (wird im Nebel ein Einzelstrahl): etwa 10 px, damit er genug Licht trägt. */
float lzDot(float d){ float k = lzK(); return smoothstep(5.5 * k, 3.5 * k, d); }
/** Abstand zu einer Kurve y = f(x) mit Steigung s (in cp-Einheiten). */
float curveDist(float dy, float s){ return abs(dy) / sqrt(1.0 + s * s); }

// 29 Laser-Fläche: gerade Linie über die ganze Breite, wird im Nebel eine Lichtdecke. Pulsiert in der Helligkeit.
// Höhe, Seite, Breite und Stärke über die Laser-Regler der Ebene (vorgegeben: oberes Drittel).
vec3 laserSheet(vec2 uv){
  vec2 p = lzP(uv); float P = lzPx();
  float half_ = uRes.x / uRes.y * 0.5 / max(uLz.z, 0.05);
  float d = abs(p.y - 0.18) * P;
  float ends = smoothstep(half_ * 0.98, half_ * 0.9, abs(p.x));
  float pulse = 0.35 + 0.65 * uPulse;
  return lzCol(floor(uBeat / 16.0), 0.0) * lzLine(d) * ends * pulse;
}

// 36 Strahlen-Fächer: Reihe aus Punkten
vec3 laserBeams(vec2 uv){
  vec2 p = lzP(uv); float P = lzPx();
  float spread = 0.6 + 0.45 * sin(uTime * 0.45);
  vec2 c0 = vec2(sin(uTime * 0.6) * 0.22, sin(uTime * 0.37) * 0.08) * (1.0 - uLzOv);
  float mode = mod(floor(uBeat / 8.0), 3.0), step2 = floor(uBeat * 2.0);
  vec3 acc = vec3(0.0);
  float k = floor(uBeat / 8.0);
  for (int i = 0; i < 12; i++) {
    float fi = float(i);
    vec2 q = c0 + vec2((fi / 11.0 - 0.5) * spread, 0.0);
    float on = mode < 0.5 ? 1.0
      : mode < 1.5 ? max(step(abs(fi - mod(step2, 12.0)), 0.5), step(abs(fi - mod(step2 + 6.0, 12.0)), 0.5))
      : step(0.5, mod(fi + floor(uBeat), 2.0));
    acc += lzCol(k, fi) * on * lzDot(length(p - q) * P);
  }
  return min(acc, vec3(1.0));
}

// 37 Lichtdecke (Liquid Sky): wellige Linie
vec3 laserSky(vec2 uv){
  vec2 p = lzP(uv); float P = lzPx(), x = p.x;
  float b = 0.6 + 0.8 * uBands[0];
  float y = b * (0.04 * sin(x * 3.0 + uTime * 0.9) + 0.025 * sin(x * 7.0 - uTime * 1.3) + 0.012 * sin(x * 13.0 + uTime * 2.1));
  float s = b * (0.12 * cos(x * 3.0 + uTime * 0.9) + 0.175 * cos(x * 7.0 - uTime * 1.3) + 0.156 * cos(x * 13.0 + uTime * 2.1));
  // mehrere Slots: Abschnitte der Decke in verschiedenen Farben
  return lzCol(floor(uBeat / 16.0) * 3.0, floor(x * 2.5 + uTime * 0.2)) * lzLine(curveDist(p.y - y, s) * P);
}

// 38 Kegel / Tunnel: Kreis, atmet im Takt, mit drehenden Lücken
vec3 laserCone(vec2 uv){
  vec2 c0 = vec2(sin(uTime * 0.31) * 0.18, sin(uTime * 0.23) * 0.06) * (1.0 - uLzOv);
  vec2 d = lzP(uv) - c0; float P = lzPx();
  float r = length(d), a = atan(d.y, d.x);
  float R = 0.17 + 0.05 * uPulse + 0.04 * sin(uTime * 0.5);
  float gaps = mod(floor(uBeat / 8.0), 2.0) < 0.5 ? 1.0 : step(0.35, fract(a / 6.2832 * 8.0 + uTime * 0.4));
  float inner = step(0.5, fract(uBeat / 16.0)) * lzLine(abs(r - R * 0.45) * P);
  float k = floor(uBeat / 8.0);
  // mehrere Slots: Bogenstücke wechseln die Farbe
  return lzCol(k, floor(fract(a / 6.2832 + uTime * 0.05) * 4.0)) * lzLine(abs(r - R) * P) * gaps + lzCol(k + 3.0, 1.0) * inner;
}

// 39 Laser-Welle: Sinus, Höhe folgt dem Bass
vec3 laserWave(vec2 uv){
  vec2 p = lzP(uv); float P = lzPx();
  float k = 7.0 + 4.0 * sin(uTime * 0.2);
  float A = 0.05 + 0.12 * uBands[0] + 0.04 * uPulse;
  float ph = uTime * 2.5;
  float d = curveDist(p.y - A * sin(p.x * k + ph), A * k * cos(p.x * k + ph));
  // mehrere Slots: jede Wellenhälfte eine Farbe
  return lzCol(floor(uBeat / 8.0) + 1.0, floor((p.x * k + ph) / 3.14159)) * lzLine(d * P);
}

// 40 Strahlen-Matrix: Raster aus Punkten, Muster wechseln alle 8 Beats
vec3 laserMatrix(vec2 uv){
  vec2 p = lzP(uv); float P = lzPx();
  vec2 n = vec2(8.0, 4.0), sp = vec2(0.13, 0.12);
  vec2 id = floor(p / sp + n * 0.5);
  if (id.x < 0.0 || id.y < 0.0 || id.x > n.x - 1.0 || id.y > n.y - 1.0) return vec3(0.0);
  vec2 q = (id - n * 0.5 + 0.5) * sp;
  float mode = mod(floor(uBeat / 8.0), 3.0), b = floor(uBeat * 2.0);
  float on = mode < 0.5 ? step(0.5, hash(id + b * 1.37))
           : mode < 1.5 ? step(abs(id.x - mod(b, n.x)), 0.5)
           : step(0.5, fract((id.x + id.y) * 0.25 - uBeat * 0.5));
  return lzCol(floor(uBeat / 8.0) + 2.0, id.x + id.y) * on * lzDot(length(p - q) * P);
}

// 41 Propeller: 2–4 Linien durch die Mitte, drehen sich
vec3 laserPropeller(vec2 uv){
  vec2 p = lzP(uv) - vec2(0.0, sin(uTime * 0.3) * 0.06 * (1.0 - uLzOv)); float P = lzPx();
  float K = mod(floor(uBeat / 8.0), 3.0) + 2.0;
  float rot = uTime * 0.8 + uPulse * 0.12;
  vec3 acc = vec3(0.0);
  float kc = floor(uBeat / 8.0) + 4.0;
  for (int i = 0; i < 4; i++) {
    if (float(i) >= K) break;
    float an = rot + float(i) * 3.14159 / K;
    vec2 dir = vec2(cos(an), sin(an));
    float along = abs(dot(p, dir)), perp = abs(dot(p, vec2(-dir.y, dir.x)));
    float L = 0.36;
    acc += lzCol(kc, float(i)) * lzLine((along < L ? perp : length(vec2(along - L, perp))) * P);
  }
  return min(acc, vec3(1.0));
}

// 42 Laser-Figuren: Lissajous wie ein Scanner
vec2 lissa(float t, vec2 ab, float ph){ return vec2(sin(ab.x * t + ph), sin(ab.y * t)) * vec2(0.4, 0.28); }
vec3 laserScan(vec2 uv){
  float s = 1.0 + 0.08 * uPulse;
  vec2 p = lzP(uv) / s; float P = lzPx() * s;
  if (abs(p.x) > 0.42 || abs(p.y) > 0.3) return vec3(0.0);
  float m = mod(floor(uBeat / 8.0), 4.0);
  vec2 ab = m < 0.5 ? vec2(1.0, 2.0) : m < 1.5 ? vec2(3.0, 2.0) : m < 2.5 ? vec2(3.0, 4.0) : vec2(5.0, 4.0);
  float ph = uTime * 0.6, best = 1e3;
  vec2 prev = lissa(0.0, ab, ph);
  for (int i = 1; i <= 120; i++) {
    vec2 cur = lissa(float(i) / 120.0 * 6.28318, ab, ph);
    vec2 pa = p - prev, ba = cur - prev;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-7), 0.0, 1.0);
    best = min(best, length(pa - ba * h));
    prev = cur;
  }
  return lzCol(floor(uBeat / 8.0) + 5.0, 0.0) * lzLine(best * P);
}

// ---- Lichteffekt-Typen im Nebel (Moonflower, Derby, Scanner …) ---------------------------
/** Weicher Fleck = breiter Strahl. d und r in Pixeln, soft 0–1 (Anteil des weichen Rands). Stärke-Regler vergrößert. */
float lzSpot(float d, float r, float soft){ r *= clamp(uLz.w, 0.25, 6.0); return smoothstep(r, r * (1.0 - soft), d); }
float lzSpot(float d, float r){ return lzSpot(d, r, 0.55); }
/** Mehrfarbig auch ohne Slots: jedes Element eine andere Laserfarbe. */
vec3 lzColN(float k, float i){
  if (uColorMode == 4 && uPalN > 0) return uPal[int(mod(k + i, float(uPalN)))];
  return laserColor(k + i);
}

// 43 Moonflower: drei Ringe farbiger Strahlen, gegenläufig drehend
vec3 beamMoonflower(vec2 uv){
  vec2 p = lzP(uv); float P = lzPx();
  vec3 acc = vec3(0.0); float k = floor(uBeat / 4.0);
  float rot = uTime * 0.35;
  for (int ring = 0; ring < 3; ring++) {
    float fr = float(ring), n = 6.0 + fr * 4.0, R = (0.07 + fr * 0.075) * (1.0 + 0.12 * uPulse);
    float dir = mod(fr, 2.0) < 0.5 ? 1.0 : -1.0;
    for (int i = 0; i < 14; i++) {
      if (float(i) >= n) break;
      float a = float(i) / n * 6.28318 + rot * dir + fr;
      acc += lzColN(k, float(i) + fr) * lzSpot(length(p - vec2(cos(a), sin(a)) * R) * P, (0.017 - fr * 0.003) * P);
    }
  }
  return min(acc, vec3(1.0));
}

// 44 Derby: vier Bündel aus je sechs Strahlen, schwenken gegeneinander
vec3 beamDerby(vec2 uv){
  vec2 p = lzP(uv); float P = lzPx();
  vec3 acc = vec3(0.0); float k = floor(uBeat / 8.0);
  for (int c = 0; c < 4; c++) {
    float fc = float(c);
    float base = fc * 1.5708 + sin(uTime * 0.6 + fc * 1.7) * 0.9 * (mod(fc, 2.0) < 0.5 ? 1.0 : -1.0);
    float R = 0.17 + 0.05 * sin(uTime * 0.4 + fc);
    for (int i = 0; i < 6; i++) {
      float a = base + (float(i) - 2.5) * 0.12;
      acc += lzColN(k, fc) * lzSpot(length(p - vec2(cos(a), sin(a)) * R) * P, 0.009 * P, 0.4);
    }
  }
  return min(acc, vec3(1.0)) * (0.75 + 0.25 * uPulse);
}

// 45/50 Scanner: ein Balken (Linie wie die Laser-Fläche) fährt über den ganzen Bildschirm hin und her.
// Horizontal: waagerechter Balken, oben ↔ unten. Vertikal: senkrechter Balken, links ↔ rechts. 2 Beats pro Weg.
// XY-Override: keine Fahrt, Y (horizontal) bzw. X (vertikal) setzt die Lage des Balkens.
float pingPong(float x){ float f = fract(x * 0.5) * 2.0; return f < 1.0 ? f : 2.0 - f; }
vec3 beamScan(vec2 uv, bool vertical){
  float sz = max(uLz.z, 0.05);
  // Scanner nutzen die ganze Fläche: den eingebauten Laser-Versatz nach oben hier wieder abziehen
  vec2 p = lzP(uv) + vec2(0.0, 0.15 * (1.0 - uLzOv)) / sz;
  float P = lzPx();
  float a = uRes.x / uRes.y * 0.5 / sz, h = 0.5 / sz;
  float s = smoothstep(0.0, 1.0, pingPong(uBeat / 2.0)) * (1.0 - uLzOv) + 0.5 * uLzOv;
  float d, ends;
  if (vertical) { d = abs(p.x - mix(-a * 0.97, a * 0.97, s)) * P; ends = smoothstep(h * 1.02, h * 0.92, abs(p.y)); }
  else { d = abs(p.y - mix(h * 0.97, -h * 0.97, s)) * P; ends = smoothstep(a * 1.02, a * 0.92, abs(p.x)); }
  return lzCol(floor(uBeat / 8.0), vertical ? 1.0 : 0.0) * lzLine(d) * ends * (0.75 + 0.25 * uPulse);
}
vec3 beamScanner(vec2 uv){ return beamScan(uv, false); }

// 46 RGB-Spots: fünf breite, weiche Strahlen wandern
vec3 beamSpots(vec2 uv){
  vec2 p = lzP(uv); float P = lzPx();
  vec3 acc = vec3(0.0); float k = floor(uBeat / 8.0);
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    vec2 q = uLzOv > 0.5 ? vec2((fi - 2.0) * 0.12, 0.0)
      : vec2(sin(uTime * (0.21 + fi * 0.05) + fi * 2.1) * 0.5, sin(uTime * (0.17 + fi * 0.04) + fi * 1.3) * 0.22);
    acc += lzColN(k, fi) * lzSpot(length(p - q) * P, (0.05 + 0.012 * uPulse) * P, 0.85);
  }
  return min(acc, vec3(1.0));
}

// 47 Schneesturm: viele feine Strahlen, drehen, funkeln (Höhen machen dichter)
vec3 beamSnow(vec2 uv){
  vec2 p = lzP(uv); float P = lzPx();
  float a = uTime * 0.12;
  p = mat2(cos(a), -sin(a), sin(a), cos(a)) * p;
  float cell = 0.045;
  vec2 id = floor(p / cell), f = fract(p / cell) - 0.5;
  vec2 o = vec2(hash(id), hash(id + 7.3)) - 0.5;
  float tw = step(0.3, hash(id + floor(uTime * 3.0 + hash(id) * 5.0)));
  float on = step(hash(id + 3.1), 0.55 + 0.4 * uBands[6]) * tw;
  vec3 col = uColorMode == 4 && uPalN > 0 ? uPal[int(mod(floor(hash(id + 9.0) * 17.0), float(uPalN)))] : vec3(1.0);
  return col * on * lzSpot(length(f - o * 0.7) * cell * P, 0.0045 * P, 0.4) * smoothstep(0.75, 0.6, length(p));
}

// 48 Polygon: drehendes Vieleck (Lichtflächen wie ein Prisma-Tunnel), inneres gegenläufig, Eckstrahlen
float polyDist(vec2 p, float n, float R, float rot){
  float seg = 6.28318 / n;
  float a = mod(atan(p.y, p.x) - rot + seg * 0.5, seg) - seg * 0.5;
  return abs(cos(a) * length(p) - R);
}
vec3 beamPolygon(vec2 uv){
  vec2 p = lzP(uv); float P = lzPx(); float k = floor(uBeat / 8.0);
  float n = 3.0 + mod(k, 6.0), seg = 6.28318 / n;
  float R = 0.2 * (1.0 + 0.08 * uPulse), rot = uTime * 0.45;
  float outer = lzLine(polyDist(p, n, R, rot) * P);
  float inner = lzLine(polyDist(p, n, R * 0.5, -rot * 1.3) * P);
  float corners = 0.0;
  for (int i = 0; i < 8; i++) {
    if (float(i) >= n) break;
    float a = rot + (float(i) + 0.5) * seg;
    corners += lzSpot(length(p - vec2(cos(a), sin(a)) * R / cos(seg * 0.5)) * P, 0.012 * P, 0.4);
  }
  return min(lzCol(k, 0.0) * outer + lzCol(k + 2.0, 1.0) * inner + lzColN(k + 4.0, 0.0) * min(corners, 1.0), vec3(1.0));
}

// 49 Laser-Burst: auf jedem Beat 40 feine Strahlen an neuen Stellen, verglühen bis zum nächsten
vec3 beamBurst(vec2 uv){
  vec2 p = lzP(uv); float P = lzPx(); float b = floor(uBeat);
  float acc = 0.0;
  for (int i = 0; i < 40; i++) {
    float fi = float(i);
    float a = hash(vec2(fi, b)) * 6.28318, r = sqrt(hash(vec2(b, fi + 3.0))) * 0.42;
    acc += lzSpot(length(p - vec2(cos(a) * 1.4, sin(a)) * r) * P, 0.0055 * P, 0.4);
  }
  // voll an bis zur Beat-Mitte, dann verglühen
  return lzCol(0.0, 0.0) * min(acc, 1.0) * (1.0 - smoothstep(0.45, 1.0, fract(uBeat)));
}


// ==== Moderne Techno-Visuals ===========================================================
float sdBox3(vec3 p, vec3 b){ vec3 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0); }

// -- Minimal / Monochrom --
vec3 monoBars(vec2 uv){
  float bt = floor(uBeat);
  float n = 6.0 + floor(hash(vec2(bt, 1.0)) * 4.0) * 4.0;
  float on = step(0.5, hash(vec2(floor(uv.x * n), bt)));
  return vec3(on) * (0.55 + 0.45 * uPulse);
}
vec3 strobeGrid(vec2 uv){
  vec2 g = vec2(floor(8.0 * uRes.x / uRes.y), 8.0);
  vec2 id = floor(uv * g), f = fract(uv * g);
  float st = floor(uBeat * 2.0);
  float lit = step(0.72, hash(id + st * 1.37)) * pow(1.0 - fract(uBeat * 2.0), 2.0);
  float frame = step(0.04, f.x) * step(f.x, 0.96) * step(0.04, f.y) * step(f.y, 0.96);
  return vec3(lit * frame + 0.04 * frame);
}
vec3 lineScan(vec2 uv){
  float acc = 0.0;
  for (int i = 0; i < 9; i++) {
    float fi = float(i);
    float y = fract(uTime * (0.08 + 0.12 * hash(vec2(fi, 2.0))) + hash(vec2(fi, 5.0)));
    if (mod(fi, 2.0) > 0.5) y = 1.0 - y;
    acc += glowLine(abs(uv.y - y), 0.0015, 0.0008) * (0.5 + 0.5 * hash(vec2(fi, 9.0)));
  }
  return vec3(acc) * (0.7 + 0.5 * uPulse);
}
vec3 rotor(vec2 uv){
  vec2 p = cp(uv);
  float r = length(p), a = atan(p.y, p.x);
  float sw = fract(a / 6.2832 - uBeat * 0.25);
  float trail = pow(1.0 - sw, 10.0) * smoothstep(0.55, 0.05, r);
  float bars = pow(abs(cos((a - uTime * 0.6) * 2.0)), 80.0) * smoothstep(0.6, 0.0, r);
  float rings = smoothstep(0.004, 0.0, abs(fract(r * 8.0) - 0.5) - 0.46) * 0.15 * step(r, 0.55);
  return vec3(trail + bars * 0.8 + rings);
}
vec3 splitFlash(vec2 uv){
  float k = mod(floor(uBeat * 2.0), 4.0);
  vec2 q = step(0.5, uv);
  float idx = q.x + q.y * 2.0;
  float order = k == 0.0 ? 0.0 : k == 1.0 ? 3.0 : k == 2.0 ? 1.0 : 2.0;
  float lit = step(abs(idx - order), 0.1) * pow(1.0 - fract(uBeat * 2.0), 1.5);
  float gap = step(0.004, abs(uv.x - 0.5)) * step(0.006, abs(uv.y - 0.5));
  return vec3(lit * gap);
}
vec3 pulseSquare(vec2 uv){
  vec2 p = cp(uv);
  float d = max(abs(p.x) * 0.75, abs(p.y));
  float ring = smoothstep(0.035, 0.0, abs(fract(d * 4.0 - uBeat * 0.5) - 0.5) - 0.44);
  return vec3(ring) * (0.5 + 0.7 * uPulse) * smoothstep(0.75, 0.05, d);
}

// -- 3D und Raum --
vec3 cubeTunnel(vec2 uv){
  vec2 p = cp(uv);
  vec3 ro = vec3(0.0, 0.0, uTime * 2.0);
  vec3 rd = normalize(vec3(p, 1.1));
  rd.xy = rot(uTime * 0.12) * rd.xy;
  float t = 0.0, glow = 0.0;
  for (int i = 0; i < 64; i++) {
    vec3 q = ro + rd * t;
    vec3 r = q; r.z = mod(r.z, 2.0) - 1.0;
    r.xy = rot(floor(q.z * 0.5) * 0.35) * r.xy;
    float frame = max(sdBox3(r, vec3(1.5, 0.95, 0.04)), -sdBox3(r, vec3(1.32, 0.78, 0.3)));
    float walls = -sdBox3(vec3(r.xy, 0.0), vec3(1.7, 1.1, 1.0));
    glow += 0.01 / (0.015 + abs(frame));
    float d = min(walls, frame);
    if (d < 0.001 || t > 30.0) break;
    t += max(d * 0.8, 0.02);
  }
  return vec3(glow * 0.12) * (0.7 + 0.5 * uPulse);
}
// Gyroid als leuchtendes Gitter (Volumen-Leuchten statt Fläche: wirkt wie Neon-Struktur im Raum)
vec3 gyroid(vec2 uv){
  vec2 p = cp(uv);
  vec3 ro = vec3(0.0, 0.0, uTime * 0.5);
  vec3 rd = normalize(vec3(p, 1.0));
  rd.xy = rot(uTime * 0.07) * rd.xy;
  vec3 col = vec3(0.0);
  float t = 0.1;
  for (int i = 0; i < 56; i++) {
    vec3 q = ro + rd * t;
    float g = abs(dot(sin(q * 3.0), cos(q.zxy * 3.0)));
    float w = exp(-g * 14.0) * exp(-t * 0.35);
    col += hsv(0.55 + 0.15 * sin(q.z * 0.5), 0.6, 1.0) * w * 0.35;
    t += 0.09;
  }
  return col * (0.8 + 0.5 * uPulse);
}
float mbField(vec2 p){
  float f = 0.0;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    vec2 c = vec2(sin(uTime * 0.5 * (0.7 + 0.1 * fi) + fi * 2.0) * 0.55, cos(uTime * 0.4 * (0.6 + 0.13 * fi) + fi) * 0.3);
    f += (0.03 + 0.015 * uBands[0]) / max(dot(p - c, p - c), 1e-4);
  }
  return f;
}
vec3 chromeBlobs(vec2 uv){
  vec2 p = cp(uv);
  float f = mbField(p), e = 0.004;
  // Normale aus 1/f (verhält sich wie ein Abstand): gleichmäßige Wölbung statt Spitzen in den Zentren
  float F0 = 1.0 / f;
  vec2 g = vec2(1.0 / mbField(p + vec2(e, 0.0)) - F0, 1.0 / mbField(p + vec2(0.0, e)) - F0) / e;
  vec3 n = normalize(vec3(g * 0.6, 1.0));
  float inside = smoothstep(0.95, 1.1, f);
  float env = 0.5 + 0.5 * sin(n.x * 5.0 + n.y * 3.0 + uTime * 0.8);
  vec3 chrome = mix(vec3(0.03, 0.04, 0.08), vec3(1.0), env * env);
  chrome += vec3(0.4, 0.6, 1.0) * pow(1.0 - n.z, 1.5) * 0.7 + pow(max(0.0, dot(n, normalize(vec3(-0.4, 0.5, 0.8)))), 30.0);
  return chrome * inside;
}
vec3 neonCorridor(vec2 uv){
  vec2 p = cp(uv);
  float a = uRes.x / uRes.y;
  vec3 c = vec3(0.0);
  for (int i = 0; i < 12; i++) {
    float z = fract(float(i) / 12.0 - uTime * 0.25);
    float s = 0.06 / (z + 0.03);
    vec2 q = abs(p) - vec2(0.9 * a, 0.9) * s * 0.5;
    float d = abs(max(q.x, q.y));
    c += hsv(0.62 + 0.25 * sin(float(i) * 0.7 + uBeat * 0.25), 0.8, 1.0) * smoothstep(0.004 * s + 0.002, 0.0, d) * smoothstep(1.0, 0.6, z) * smoothstep(0.0, 0.12, z);
  }
  return c * (0.8 + 0.4 * uPulse);
}
vec3 pointSphere(vec2 uv){
  vec2 p = cp(uv);
  float acc = 0.0, R = 0.4 * (1.0 + 0.12 * uPulse);
  for (int i = 0; i < 160; i++) {
    float fi = float(i) + 0.5;
    float y = 1.0 - 2.0 * fi / 160.0, r = sqrt(1.0 - y * y), th = fi * 2.39996;
    vec3 v = vec3(cos(th) * r, y, sin(th) * r);
    v.xz = rot(uTime * 0.4) * v.xz; v.yz = rot(uTime * 0.23) * v.yz;
    float pers = 1.0 / (2.2 - v.z);
    acc += smoothstep(0.013 * pers, 0.0, length(p - v.xy * R * pers * 2.0)) * (0.35 + 0.65 * (v.z * 0.5 + 0.5));
  }
  return vec3(acc * 1.6);
}
vec3 terrain(vec2 uv){
  vec2 p = cp(uv);
  float s = uTime * 0.6, acc = 0.0;
  for (int k = 1; k <= 28; k++) {
    float z = float(k) * 0.35 - fract(s) * 0.35;
    float zw = z + floor(s) * 0.35;
    float h = fbm(vec2(p.x * z * 1.3, zw * 0.8)) * (0.8 + 0.5 * uBands[0]);
    float y = 0.1 - (0.45 - h * 0.6) / max(z, 0.05);
    acc += smoothstep(0.0035, 0.0, abs(p.y - y)) * smoothstep(10.0, 2.5, z) * smoothstep(0.0, 0.4, z);
  }
  return vec3(0.35, 0.9, 1.0) * acc;
}
vec3 ringStack(vec2 uv){
  vec2 p = cp(uv);
  float acc = 0.0;
  for (int i = 0; i < 8; i++) {
    float fi = float(i), r = 0.08 + fi * 0.045;
    float tilt = cos(uTime * (0.3 + 0.07 * fi) + fi);
    vec2 q = rot(uTime * 0.1 * (mod(fi, 2.0) * 2.0 - 1.0)) * p;
    float d = abs(length(vec2(q.x, q.y / max(abs(tilt), 0.06))) - r) * max(abs(tilt), 0.06);
    acc += smoothstep(0.003, 0.0, d) * (0.5 + 0.5 * abs(tilt));
  }
  return vec3(acc) * (0.8 + 0.4 * uPulse);
}

// -- Daten und Glitch --
vec3 codeRain(vec2 uv){
  vec2 g = vec2(floor(30.0 * uRes.x / uRes.y), 30.0);
  vec2 id = floor(uv * g), f = fract(uv * g);
  float sp = 0.5 + hash(vec2(id.x, 3.0)) * 1.5;
  float head = fract(uTime * sp * 0.15 + hash(vec2(id.x, 9.0)));
  float dist = fract(head - (1.0 - uv.y) + 1.0);
  float tr = pow(1.0 - dist, 6.0) * step(dist, 0.6);
  vec2 bit = floor(f * vec2(3.0, 5.0));
  float on = step(0.45, hash(id * vec2(1.3, 2.1) + bit + floor(uTime * 4.0 + hash(id) * 10.0)));
  float gl = on * step(0.15, f.x) * step(f.x, 0.85) * step(0.1, f.y) * step(f.y, 0.9);
  return vec3(0.2, 1.0, 0.4) * gl * tr + vec3(0.85, 1.0, 0.9) * gl * smoothstep(0.035, 0.0, dist);
}
vec3 barcode(vec2 uv){
  float bt = floor(uBeat);
  float w = step(0.5, hash(vec2(floor(uv.x * 140.0), bt))) * step(0.3, hash(vec2(floor(uv.x * 37.0), bt + 3.0)));
  float band = step(0.18, uv.y) * step(uv.y, 0.82);
  float scan = smoothstep(0.004, 0.0, abs(uv.x - fract(uBeat * 0.25)));
  return vec3(w * band) * (0.7 + 0.3 * uPulse) + vec3(1.0, 0.1, 0.1) * scan;
}
vec3 dataBlocks(vec2 uv){
  vec3 c = vec3(0.0);
  for (int l = 0; l < 3; l++) {
    float fl = float(l);
    vec2 g = vec2(6.0, 4.0) * pow(2.0, fl) * vec2(uRes.x / uRes.y / 1.78, 1.0);
    vec2 id = floor(uv * g), f = fract(uv * g);
    float on = step(0.86, hash(id + fl * 7.0 + floor(uTime * (3.0 + fl * 2.0))));
    float edge = step(0.06, f.x) * step(f.x, 0.94) * step(0.08, f.y) * step(f.y, 0.92);
    float lines = step(0.5, fract(f.y * 6.0)) * step(0.3, hash(id + floor(f.y * 6.0)));
    c += vec3(on * edge * (0.35 + 0.65 * lines)) * (0.5 / (fl + 1.0));
  }
  return c * (0.8 + 0.5 * uPulse);
}
vec3 hud(vec2 uv){
  vec2 p = cp(uv);
  float r = length(p), a = atan(p.y, p.x), c = 0.0;
  for (int i = 0; i < 5; i++) {
    float fi = float(i), R = 0.12 + fi * 0.07;
    float seg = step(0.5, fract((a / 6.2832) * (4.0 + fi * 3.0) + uTime * 0.05 * (mod(fi, 2.0) * 2.0 - 1.0) * (1.0 + fi)));
    c += smoothstep(0.0025, 0.0, abs(r - R)) * mix(0.25, 1.0, seg);
    c += smoothstep(0.003, 0.0, abs(r - R - 0.015)) * step(0.85, fract(a / 6.2832 * 60.0 + fi)) * 0.7;
  }
  c += (smoothstep(0.002, 0.0, abs(p.x)) + smoothstep(0.002, 0.0, abs(p.y))) * step(r, 0.5) * 0.4;
  c += pow(fract(a / 6.2832 - uTime * 0.2), 12.0) * step(r, 0.45) * 0.6;
  return vec3(0.4, 0.9, 1.0) * c * (0.8 + 0.3 * uPulse);
}
vec3 glitchWall(vec2 uv){
  float row = floor(uv.y * 36.0), bt = floor(uTime * 8.0);
  float shift = (hash(vec2(row, bt)) - 0.5) * 0.4 * step(0.6, hash(vec2(row, bt + 1.0)));
  vec2 q = vec2(uv.x + shift, uv.y);
  vec2 id = floor(q * vec2(18.0, 36.0));
  float h = hash(id + floor(uBeat) * 3.0);
  vec3 col = h > 0.92 ? vec3(1.0, 0.1, 0.4) : h > 0.84 ? vec3(0.1, 0.9, 1.0) : h > 0.7 ? vec3(0.9) : vec3(0.0);
  float noise = hash(uv * uRes + uTime) * 0.12;
  return col * (0.7 + 0.5 * uPulse) + noise;
}

// -- Op-Art und Muster --
vec3 truchet(vec2 uv){
  vec2 p = cp(uv) * 8.0;
  vec2 id = floor(p), f = fract(p) - 0.5;
  if (hash(id + floor(uBeat / 4.0) * 1.7) > 0.5) f.x = -f.x;
  float d = min(abs(length(f - 0.5) - 0.5), abs(length(f + 0.5) - 0.5));
  float flow = 0.5 + 0.5 * sin((f.x + f.y) * 12.0 - uTime * 3.0);
  return vec3(smoothstep(0.07, 0.035, d)) * (0.55 + 0.45 * flow);
}
vec3 rileyWaves(vec2 uv){
  vec2 p = cp(uv);
  float v = sin((p.y + 0.09 * sin(p.x * 5.0 + uTime) * (1.0 + 0.5 * uBands[0])) * 70.0);
  return vec3(smoothstep(-0.15, 0.15, v));
}
vec3 checkerWarp(vec2 uv){
  vec2 p = cp(uv) * (1.0 + 0.15 * uPulse);
  vec2 q = p + 0.15 * vec2(sin(p.y * 4.0 + uTime), cos(p.x * 4.0 + uTime * 0.8));
  vec2 g = floor(q * 10.0);
  return vec3(mod(g.x + g.y, 2.0));
}
vec3 voronoiCells(vec2 uv){
  vec2 p = cp(uv) * 6.0;
  vec2 i = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0; vec2 cid = vec2(0.0);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y));
    vec2 o = 0.5 + 0.4 * sin(uTime * 0.7 + 6.2831 * vec2(hash(i + g), hash(i + g + 5.3)));
    float d = length(g + o - f);
    if (d < d1) { d2 = d1; d1 = d; cid = i + g; } else if (d < d2) d2 = d;
  }
  float edge = smoothstep(0.08, 0.0, d2 - d1);
  float fill = step(0.85, hash(cid + floor(uBeat))) * pow(1.0 - fract(uBeat), 2.0);
  return vec3(edge) * 0.9 + hsv(hash(cid), 0.6, 1.0) * fill * 0.7;
}
vec3 hexPulse(vec2 uv){
  vec2 p = cp(uv) * 10.0;
  vec2 s = vec2(1.0, 1.7320508), hh = s * 0.5;
  vec2 a = mod(p, s) - hh, b = mod(p - hh, s) - hh;
  vec2 gv = dot(a, a) < dot(b, b) ? a : b;
  vec2 id = p - gv;
  float edge = smoothstep(0.05, 0.0, abs(sdHex(gv, 0.45)));
  float r = length(id) / 10.0;
  float wave = pow(1.0 - abs(fract(r * 1.5 - uBeat * 0.5) - 0.5) * 2.0, 8.0);
  return vec3(0.2, 0.8, 1.0) * edge * (0.25 + wave) + vec3(1.0) * wave * 0.25 * step(sdHex(gv, 0.4), 0.0);
}
vec3 interference(vec2 uv){
  vec2 p = cp(uv);
  vec2 c1 = vec2(sin(uTime * 0.3) * 0.35, cos(uTime * 0.21) * 0.2), c2 = -c1;
  float v = sin(length(p - c1) * 70.0 - uTime * 4.0) + sin(length(p - c2) * 70.0 - uTime * 4.0);
  return vec3(smoothstep(0.0, 0.4, v)) * (0.8 + 0.3 * uPulse);
}
vec3 hypnoSpiral(vec2 uv){
  vec2 p = cp(uv);
  float r = length(p) + 1e-4, a = atan(p.y, p.x);
  float v = fract(a / 6.2832 * 4.0 + log(r) * 2.5 - uTime * 0.5);
  return vec3(step(0.5, v)) * smoothstep(0.0, 0.05, r);
}

// -- Organisch und Flüssig --
vec3 ink(vec2 uv){
  vec2 p = cp(uv) * 2.0;
  vec2 q = vec2(fbm(p + uTime * 0.05), fbm(p + vec2(3.1, 1.7) + uTime * 0.04));
  vec2 r = vec2(fbm(p + 4.0 * q + vec2(1.7, 9.2) + uTime * 0.08), fbm(p + 4.0 * q + vec2(8.3, 2.8) - uTime * 0.06));
  float f = fbm(p + 4.0 * r);
  vec3 c = mix(vec3(0.02, 0.0, 0.08), vec3(0.9, 0.1, 0.5), clamp(f * f * 2.0, 0.0, 1.0));
  c = mix(c, vec3(0.1, 0.8, 1.0), clamp(length(q) * 0.6, 0.0, 1.0) * smoothstep(0.4, 0.9, f));
  return c * smoothstep(0.25, 0.7, f) * 1.5;
}
vec3 aurora(vec2 uv){
  vec2 p = cp(uv);
  vec3 c = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float off = (fbm(vec2(p.x * 1.5 + fi * 3.0, uTime * 0.1)) - 0.5) * 0.5;
    float band = exp(-abs(p.y - 0.12 - fi * 0.08 - off) * 9.0);
    float rays = 0.5 + 0.5 * fbm(vec2(p.x * 18.0 + fi, uTime * 0.3));
    c += mix(vec3(0.1, 1.0, 0.5), vec3(0.6, 0.2, 1.0), fi / 2.0) * band * rays * 0.7;
  }
  return c * (0.85 + 0.3 * uBands[1]);
}
vec3 iridescent(vec2 uv){
  vec2 p = cp(uv);
  float n = fbm(p * 1.5 + uTime * 0.05) * 5.0 + length(p) * 2.0 + uTime * 0.1;
  vec3 c = 0.5 + 0.5 * cos(6.2832 * (n + vec3(0.0, 0.33, 0.67)));
  float blob = smoothstep(0.3, 0.7, fbm(p * 2.0 - uTime * 0.07));
  return c * (0.3 + 0.9 * blob);
}
vec3 smoke(vec2 uv){
  vec2 p = cp(uv);
  float n = fbm(vec2(p.x * 2.0, p.y * 2.0 - uTime * 0.5) + fbm(vec2(p.x * 3.0 + uTime * 0.1, p.y * 3.0)) * 1.5);
  float v = smoothstep(0.45, 0.85, n) * smoothstep(0.6, -0.2, p.y);
  return vec3(v) * 0.9;
}
vec3 nebula(vec2 uv){
  vec2 p = rot(uTime * 0.02) * cp(uv);
  float n = fbm(p * 2.0 + fbm(p * 3.0 + uTime * 0.03));
  vec3 c = mix(vec3(0.05, 0.0, 0.15), vec3(0.8, 0.2, 0.6), smoothstep(0.35, 0.8, n));
  c += vec3(0.1, 0.5, 1.0) * smoothstep(0.6, 0.95, fbm(p * 4.0 - uTime * 0.02)) * 0.6;
  vec2 sg = floor(uv * uRes / 3.0);
  c += vec3(step(0.997, hash(sg))) * (0.5 + 0.5 * sin(uTime * 3.0 + hash(sg) * 30.0));
  return c;
}


// ==== Paket 1: Fraktale, Demoscene, Heilige Geometrie =================================
// -- Fraktale --
vec3 mandelZoom(vec2 uv){
  vec2 p = cp(uv);
  float z = pow(0.5, mod(uTime * 0.35, 17.0));
  vec2 c = vec2(-0.743643887, 0.131825904) + rot(uTime * 0.05) * p * z * 2.5;
  vec2 w = vec2(0.0); float n = 0.0;
  for (int i = 0; i < 160; i++) { w = vec2(w.x * w.x - w.y * w.y, 2.0 * w.x * w.y) + c; if (dot(w, w) > 16.0) break; n += 1.0; }
  if (n >= 160.0) return vec3(0.0);
  float sn = n - log2(log2(dot(w, w))) + 4.0;
  return hsv(sn * 0.025 + uTime * 0.02, 0.8, 0.55 + 0.45 * sin(sn * 0.3)) * (0.85 + 0.3 * uPulse);
}
vec3 julia(vec2 uv){
  vec2 w = rot(uTime * 0.05) * cp(uv) * 2.2;
  float ang = 2.2 + 0.5 * sin(uTime * 0.13);
  vec2 c = vec2(cos(ang), sin(ang)) * 0.7885;
  float n = 0.0;
  for (int i = 0; i < 96; i++) { w = vec2(w.x * w.x - w.y * w.y, 2.0 * w.x * w.y) + c; if (dot(w, w) > 16.0) break; n += 1.0; }
  if (n >= 96.0) return vec3(0.0);
  float sn = n - log2(log2(dot(w, w))) + 4.0;
  return hsv(0.6 + sn * 0.03 + uTime * 0.02, 0.75, pow(clamp(sn / 18.0, 0.0, 1.0), 0.6)) * (0.9 + 0.3 * uPulse);
}
vec3 sierpinski(vec2 uv){
  vec2 p = cp(uv);
  float s = pow(2.0, fract(uTime * 0.15)) * 256.0;
  vec2 q = (p + vec2(0.5, 0.45)) * s;
  ivec2 iq = ivec2(floor(q));
  float on = ((iq.x & iq.y) == 0 && iq.x >= 0 && iq.y >= 0) ? 1.0 : 0.0;
  return hsv(0.08 + float(iq.y) / s * 0.3, 0.7, on) * (0.7 + 0.5 * uPulse);
}
vec3 kifs(vec2 uv){
  vec2 p = cp(uv) * 2.2;
  float d = 1e3, sc = 1.0;
  for (int i = 0; i < 8; i++) {
    p = abs(p) - vec2(0.5, 0.3);
    p = rot(uTime * 0.11 + float(i) * 0.4) * p;
    p *= 1.35; sc *= 1.35;
    d = min(d, abs(length(p) - 0.4) / sc);
  }
  return hsv(0.55 + d * 20.0 + uTime * 0.03, 0.7, 1.0) * glowLine(d, 0.003, 0.002) * (0.8 + 0.4 * uPulse);
}
vec3 apollonian(vec2 uv){
  vec2 p = rot(uTime * 0.05) * cp(uv) * (1.6 + 0.4 * sin(uTime * 0.2));
  float sc = 1.0;
  for (int i = 0; i < 8; i++) {
    p = -1.0 + 2.0 * fract(0.5 * p + 0.5);
    float k = 1.15 / max(dot(p, p), 1e-4);
    p *= k; sc *= k;
  }
  float d = 0.25 * abs(p.y) / sc;
  return hsv(0.08 + log(sc) * 0.05, 0.6, 1.0) * glowLine(d, 0.0025, 0.0015);
}
vec3 carpet(vec2 uv){
  vec2 q = fract(cp(uv) * pow(3.0, fract(uTime * 0.1)) * 0.9 + 0.5);
  float on = 1.0;
  for (int i = 0; i < 5; i++) {
    vec2 g = floor(mod(q * pow(3.0, float(i + 1)), 3.0));
    if (g.x == 1.0 && g.y == 1.0) { on = 0.0; break; }
  }
  return vec3(on) * hsv(0.5 + q.y * 0.2, 0.3, 1.0) * (0.7 + 0.4 * uPulse);
}
vec3 newton(vec2 uv){
  vec2 z = rot(uTime * 0.1) * cp(uv) * 3.0;
  float n = 0.0;
  for (int i = 0; i < 24; i++) {
    vec2 z2 = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y);
    vec2 z3 = vec2(z2.x * z.x - z2.y * z.y, z2.x * z.y + z2.y * z.x);
    vec2 num = z3 - vec2(1.0, 0.0), den = 3.0 * z2;
    float dd = max(dot(den, den), 1e-6);
    vec2 step = vec2(num.x * den.x + num.y * den.y, num.y * den.x - num.x * den.y) / dd;
    z -= step; n += 1.0;
    if (dot(step, step) < 1e-6) break;
  }
  float a = atan(z.y, z.x);
  return hsv(a / 6.2832 + uTime * 0.03, 0.7, 1.0 - n / 30.0);
}
vec3 tricorn(vec2 uv){
  vec2 c = rot(uTime * 0.04) * cp(uv) * 2.6 - vec2(0.3, 0.0);
  vec2 w = vec2(0.0); float n = 0.0;
  for (int i = 0; i < 80; i++) { w = vec2(w.x * w.x - w.y * w.y, -2.0 * w.x * w.y) + c; if (dot(w, w) > 16.0) break; n += 1.0; }
  if (n >= 80.0) return vec3(0.0);
  return hsv(0.9 + n * 0.02 + uTime * 0.02, 0.8, smoothstep(0.0, 20.0, n));
}

// -- Demoscene --
vec3 rotozoom(vec2 uv){
  vec2 q = rot(uTime * 0.4) * cp(uv) * (1.8 + sin(uTime * 0.5) * 1.2) * 3.0;
  vec2 g = floor(q);
  float ch = mod(g.x + g.y, 2.0);
  return hsv(fract((g.x + g.y) * 0.05 + uTime * 0.05), 0.7, 0.3 + 0.7 * ch) * (0.8 + 0.4 * uPulse);
}
vec3 twister(vec2 uv){
  vec2 p = cp(uv);
  float a = p.y * 3.0 + uTime * 2.0 + sin(p.y * 2.0 + uTime) * 1.5;
  vec3 col = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    float x1 = sin(a + float(i) * 1.5708) * 0.22, x2 = sin(a + float(i + 1) * 1.5708) * 0.22;
    if (x2 > x1 && p.x > x1 && p.x < x2) col = hsv(float(i) * 0.25 + uTime * 0.05, 0.7, 0.4 + 0.6 * (x2 - x1) / 0.31);
  }
  return col;
}
vec3 copperBars(vec2 uv){
  vec3 col = vec3(0.0);
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    float y = 0.5 + 0.38 * sin(uTime * 1.3 + fi * 0.6);
    float d = abs(uv.y - y) / 0.045;
    col = d < 1.0 ? hsv(fi / 7.0 + uTime * 0.05, 0.85, 1.0 - d * d) : col;
  }
  return col;
}
vec3 sineDots(vec2 uv){
  vec2 p = cp(uv);
  float a = uRes.x / uRes.y, acc = 0.0;
  for (int i = 0; i < 64; i++) {
    float fi = float(i);
    float x = (fract(fi / 64.0 + uTime * 0.08) - 0.5) * a;
    float y = 0.25 * sin(x * 6.0 + uTime * 2.0) + 0.1 * sin(x * 13.0 - uTime * 3.0);
    acc += smoothstep(0.018, 0.0, length(p - vec2(x, y)));
  }
  return hsv(uv.x + uTime * 0.1, 0.7, 1.0) * acc;
}
vec3 rasterBars(vec2 uv){
  float y = uv.y + 0.06 * sin(uv.x * 9.0 + uTime * 3.0) + 0.04 * sin(uv.x * 23.0 - uTime * 2.0);
  return hsv(floor(y * 24.0) / 24.0 + uTime * 0.1, 0.85, 0.6 + 0.4 * sin(y * 150.0)) * (0.8 + 0.3 * uPulse);
}
vec3 xorTunnel(vec2 uv){
  vec2 p = cp(uv);
  float r = length(p) + 1e-3, a = atan(p.y, p.x);
  ivec2 t = ivec2(int(floor((a / 3.14159 + 1.0) * 32.0)), int(floor((0.4 / r + uTime * 1.5) * 32.0)));
  float v = float((t.x ^ t.y) & 63) / 63.0;
  return hsv(v * 0.5 + uTime * 0.05, 0.8, v) * smoothstep(0.0, 0.25, r);
}
vec3 vectorBalls(vec2 uv){
  vec2 p = cp(uv);
  vec3 col = vec3(0.0);
  float zbest = -9.0;
  for (int i = 0; i < 27; i++) {
    vec3 v = vec3(float(i % 3), float((i / 3) % 3), float(i / 9)) - 1.0;
    v.xz = rot(uTime * 0.7) * v.xz; v.yz = rot(uTime * 0.45) * v.yz;
    float pers = 1.0 / (4.0 - v.z);
    vec2 s = v.xy * pers * 0.9;
    float r = 0.07 * pers * 2.5 * (1.0 + 0.15 * uPulse);
    float d = length(p - s);
    if (d < r && v.z > zbest) {
      zbest = v.z;
      float h = sqrt(1.0 - (d * d) / (r * r));
      col = hsv(float(i) / 27.0, 0.6, 0.3 + 0.7 * h) + pow(h, 12.0) * 0.6;
    }
  }
  return col;
}
vec3 shadeBobs(vec2 uv){
  vec2 p = cp(uv);
  float acc = 0.0;
  for (int i = 0; i < 24; i++) {
    float t = uTime - float(i) * 0.05;
    vec2 c = vec2(sin(t * 1.3) * 0.5, sin(t * 1.7 + 1.0) * 0.32);
    acc += exp(-dot(p - c, p - c) * 120.0);
  }
  return hsv(0.05 + acc * 0.1 + uTime * 0.03, 0.8, min(acc * 0.6, 1.2));
}

// -- Heilige Geometrie --
float circleLine(vec2 p, vec2 c, float r){ return abs(length(p - c) - r); }
vec3 flowerOfLife(vec2 uv){
  vec2 p = rot(uTime * 0.05) * cp(uv);
  float r = 0.12 * (1.0 + 0.06 * uPulse), d = 1e3;
  for (int i = -3; i <= 3; i++) for (int j = -3; j <= 3; j++) {
    vec2 c = vec2(float(i) + float(j) * 0.5, float(j) * 0.8660254) * r;
    if (length(c) < r * 2.6) d = min(d, circleLine(p, c, r));
  }
  return hsv(0.12 + uTime * 0.02, 0.5, 1.0) * glowLine(d, 0.003, 0.0015) * step(length(p), r * 3.7);
}
vec3 metatron(vec2 uv){
  vec2 p = rot(uTime * 0.07) * cp(uv);
  vec2 c[13];
  c[0] = vec2(0.0);
  for (int i = 0; i < 6; i++) { float a = float(i) * 1.0472; c[1 + i] = vec2(cos(a), sin(a)) * 0.15; c[7 + i] = vec2(cos(a), sin(a)) * 0.3; }
  float d = 1e3;
  for (int i = 0; i < 13; i++) {
    d = min(d, circleLine(p, c[i], 0.075));
    for (int j = i + 1; j < 13; j++) d = min(d, segDist(p, c[i], c[j]));
  }
  return vec3(0.75, 0.85, 1.0) * glowLine(d, 0.002, 0.0012) * (0.8 + 0.4 * uPulse);
}
vec3 spirograph(vec2 uv){
  vec2 p = cp(uv);
  float R = 0.42, r = 0.15 + 0.04 * sin(uTime * 0.2), dd = 0.17 + 0.04 * cos(uTime * 0.13);
  float d = 1e3; vec2 prev = vec2(0.0);
  for (int i = 0; i <= 200; i++) {
    float t = float(i) / 200.0 * 6.2832 * 7.0 + uTime * 0.3;
    vec2 q = vec2((R - r) * cos(t) + dd * cos((R - r) / r * t), (R - r) * sin(t) - dd * sin((R - r) / r * t));
    if (i > 0) d = min(d, segDist(p, prev, q));
    prev = q;
  }
  return hsv(0.8 + uTime * 0.03, 0.6, 1.0) * glowLine(d, 0.002, 0.0015);
}
vec3 starPolygons(vec2 uv){
  vec2 p = cp(uv);
  float d = 1e3;
  for (int s = 0; s < 3; s++) {
    float n = 5.0 + float(s) * 2.0, k = 2.0 + float(s);
    float R = 0.15 + float(s) * 0.13;
    float off = uTime * 0.2 * (mod(float(s), 2.0) * 2.0 - 1.0);
    for (int i = 0; i < 9; i++) {
      if (float(i) >= n) break;
      float a1 = off + float(i) * 6.2832 / n, a2 = off + (float(i) + k) * 6.2832 / n;
      d = min(d, segDist(p, vec2(cos(a1), sin(a1)) * R, vec2(cos(a2), sin(a2)) * R));
    }
  }
  return hsv(0.55 + uTime * 0.02, 0.6, 1.0) * glowLine(d, 0.0025, 0.0015) * (0.8 + 0.4 * uPulse);
}
float sdPoly(vec2 p, float n, float r){ float a = atan(p.y, p.x), s = 6.2832 / n; return cos(floor(0.5 + a / s) * s - a) * length(p) - r; }
vec3 nestedPolygons(vec2 uv){
  vec2 p = cp(uv);
  float acc = 0.0;
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    vec2 q = rot(uTime * 0.15 * (fi + 1.0) * (mod(fi, 2.0) * 2.0 - 1.0)) * p;
    acc += smoothstep(0.004, 0.0, abs(sdPoly(q, 3.0 + mod(fi, 4.0), 0.05 + fi * 0.045)));
  }
  return vec3(acc) * (0.8 + 0.4 * uPulse);
}
vec3 seedOfLife(vec2 uv){
  vec2 p = cp(uv);
  float r = 0.13 * (1.0 + 0.15 * uPulse), d = circleLine(p, vec2(0.0), r);
  for (int i = 0; i < 6; i++) { float a = float(i) * 1.0472 + uTime * 0.1; d = min(d, circleLine(p, vec2(cos(a), sin(a)) * r, r)); }
  d = min(d, circleLine(p, vec2(0.0), r * 2.0));
  return hsv(0.1 + uTime * 0.03, 0.6, 1.0) * glowLine(d, 0.003, 0.002);
}
vec3 mandala(vec2 uv){
  vec2 p = cp(uv);
  float r = length(p), a = atan(p.y, p.x), acc = 0.0;
  for (int i = 0; i < 5; i++) {
    float fi = float(i), k = 6.0 + fi * 2.0;
    float R = 0.08 + fi * 0.07 + 0.03 * cos(a * k + uTime * (0.5 + fi * 0.1) * (mod(fi, 2.0) * 2.0 - 1.0));
    acc += smoothstep(0.004, 0.0, abs(r - R)) * (1.0 - fi * 0.12);
  }
  return hsv(0.02 + r + uTime * 0.03, 0.6, 1.0) * acc * (0.8 + 0.4 * uPulse);
}
vec3 lissajousKnot(vec2 uv){
  vec2 p = cp(uv);
  float d = 1e3; vec2 prev = vec2(0.0);
  for (int i = 0; i <= 150; i++) {
    float t = float(i) / 150.0 * 6.2832;
    vec3 v = vec3(sin(3.0 * t + 0.5), sin(2.0 * t), sin(5.0 * t + 1.0)) * 0.35;
    v.xz = rot(uTime * 0.4) * v.xz; v.yz = rot(uTime * 0.27) * v.yz;
    vec2 q = v.xy / (1.6 - v.z) * 1.4;
    if (i > 0) d = min(d, segDist(p, prev, q));
    prev = q;
  }
  return hsv(0.45 + uTime * 0.03, 0.7, 1.0) * glowLine(d, 0.003, 0.002);
}
vec3 circleGrid(vec2 uv){
  vec2 p = cp(uv) * 12.0;
  vec2 id = floor(p), f = fract(p) - 0.5;
  float w = sin(length(id) * 0.6 - uBeat * 3.1416) * 0.5 + 0.5;
  float r = 0.08 + 0.32 * w;
  return vec3(smoothstep(r + 0.03, r, length(f))) * (0.4 + 0.6 * w);
}


// ==== Paket 2: 3D-Raum, Organisch, Partikel ==========================================
// -- 3D und Raum (Raymarching) --
float g2Map(vec3 p, int kind){
  if (kind == 0) { vec3 q = mod(p, 2.0) - 1.0; return length(q) - 0.28 - 0.08 * uPulse; }
  if (kind == 1) { vec3 q = mod(p, 2.0) - 1.0; q.xy = rot(p.z * 0.3) * q.xy; vec3 d = abs(q) - vec3(0.32); return min(max(d.x, max(d.y, d.z)), 0.0) + length(max(d, 0.0)); }
  if (kind == 2) { vec2 q = vec2(length(p.xz) - 1.2, p.y); return length(q) - 0.3 - 0.05 * uPulse; }
  vec3 q = p; q.z = mod(q.z, 1.0) - 0.5; return abs(length(q.xy) - 1.4) - 0.03 + abs(q.z) * 0.0 + max(abs(q.z) - 0.05, 0.0);
}
vec3 g2March(vec2 uv, int kind, vec3 ro, vec3 rd, vec3 tint){
  float t = 0.0, glow = 0.0; int hit = 0;
  for (int i = 0; i < 72; i++) {
    float d = g2Map(ro + rd * t, kind);
    glow += 0.012 / (0.02 + abs(d));
    if (d < 0.002) { hit = 1; break; }
    t += d * 0.9; if (t > 30.0) break;
  }
  vec3 col = tint * glow * 0.06;
  if (hit == 1) {
    vec3 p = ro + rd * t; vec2 e = vec2(0.002, 0.0);
    vec3 n = normalize(vec3(g2Map(p + e.xyy, kind) - g2Map(p - e.xyy, kind), g2Map(p + e.yxy, kind) - g2Map(p - e.yxy, kind), g2Map(p + e.yyx, kind) - g2Map(p - e.yyx, kind)));
    float dif = max(dot(n, normalize(vec3(0.5, 0.8, -0.6))), 0.0), rim = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
    col += tint * (0.15 + dif * 0.8) + vec3(1.0) * rim * 0.6;
  }
  return col * exp(-t * 0.08);
}
vec3 sphereField(vec2 uv){ vec2 p = cp(uv); vec3 rd = normalize(vec3(p, 1.2)); rd.xy = rot(uTime * 0.1) * rd.xy; return g2March(uv, 0, vec3(0.0, 0.0, uTime * 2.0), rd, hsv(0.55 + uTime * 0.02, 0.6, 1.0)); }
vec3 boxField(vec2 uv){ vec2 p = cp(uv); vec3 rd = normalize(vec3(p, 1.1)); rd.xz = rot(sin(uTime * 0.2) * 0.4) * rd.xz; return g2March(uv, 1, vec3(0.0, 0.0, uTime * 1.6), rd, hsv(0.08 + uTime * 0.02, 0.7, 1.0)); }
vec3 torusRing(vec2 uv){ vec2 p = cp(uv); vec3 ro = vec3(0.0, 0.0, -4.0), rd = normalize(vec3(p, 1.4)); ro.yz = rot(uTime * 0.3) * ro.yz; rd.yz = rot(uTime * 0.3) * rd.yz; ro.xz = rot(uTime * 0.2) * ro.xz; rd.xz = rot(uTime * 0.2) * rd.xz; return g2March(uv, 2, ro, rd, hsv(0.8 + uTime * 0.03, 0.6, 1.0)); }
vec3 ringTunnel(vec2 uv){ vec2 p = cp(uv); vec3 rd = normalize(vec3(p, 1.0)); rd.xy = rot(uTime * 0.2) * rd.xy; return g2March(uv, 3, vec3(0.0, 0.0, uTime * 3.0), rd, hsv(0.5 + uTime * 0.03, 0.7, 1.0)); }
vec3 hexTunnel(vec2 uv){
  vec2 p = rot(uTime * 0.15) * cp(uv);
  float a = atan(p.y, p.x), r = max(abs(p.x) * 0.866 + abs(p.y) * 0.5, abs(p.y));
  float z = 0.35 / max(r, 1e-3) + uTime * 2.0;
  float ring = smoothstep(0.08, 0.0, abs(fract(z) - 0.5) - 0.38);
  float spoke = smoothstep(0.03, 0.0, abs(fract(a / 1.0472 + 0.5) - 0.5));
  return hsv(floor(z) * 0.07 + uTime * 0.03, 0.7, 1.0) * max(ring, spoke * 0.6) * smoothstep(0.0, 0.3, r) * (0.7 + 0.5 * uPulse);
}
vec3 wormhole(vec2 uv){
  vec2 p = cp(uv);
  p += 0.08 * vec2(sin(uTime * 0.7), cos(uTime * 0.5));
  float r = length(p) + 1e-3, a = atan(p.y, p.x);
  float z = 0.3 / r + uTime * 1.2;
  float n = fbm(vec2(a * 2.0 + z * 0.5, z * 2.0));
  float stars = step(0.985, hash(floor(vec2(a * 40.0, z * 20.0))));
  return (hsv(0.7 + n * 0.3, 0.8, n * n * 1.5) + stars) * smoothstep(0.0, 0.25, r) * (0.8 + 0.4 * uPulse);
}
vec3 infiniteSquares(vec2 uv){
  vec2 p = cp(uv);
  float acc = 0.0;
  for (int i = 0; i < 12; i++) {
    float fi = float(i), s = exp2(fract(uTime * 0.4 + fi / 12.0) * 6.0 - 4.0);
    vec2 q = rot(fi * 0.25 + uTime * 0.1) * p;
    float d = abs(max(abs(q.x), abs(q.y)) - s * 0.1);
    acc += smoothstep(0.006 + s * 0.004, 0.0, d) * smoothstep(0.0, 0.5, s);
  }
  return hsv(0.6 + uTime * 0.05, 0.5, 1.0) * acc * (0.8 + 0.4 * uPulse);
}
vec3 dnaHelix(vec2 uv){
  vec2 p = rot(0.5) * cp(uv);
  float ph = p.x * 7.0 + uTime * 2.0;
  float y1 = sin(ph) * 0.2, y2 = -y1, z = cos(ph);
  vec3 col = hsv(0.55, 0.7, 1.0) * smoothstep(0.022, 0.0, abs(p.y - y1)) * (0.55 + 0.45 * z)
           + hsv(0.95, 0.7, 1.0) * smoothstep(0.022, 0.0, abs(p.y - y2)) * (0.55 - 0.45 * z);
  float rung = smoothstep(0.03, 0.0, abs(fract(ph / 0.7) - 0.5) - 0.47) * step(abs(p.y), abs(y1));
  col += vec3(0.7) * rung * 0.45;
  return col * (0.8 + 0.4 * uPulse);
}

// -- Organisch --
vec3 lavaLamp(vec2 uv){
  vec2 p = cp(uv);
  float f = 0.0;
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    vec2 c = vec2(sin(fi * 2.1 + uTime * 0.2) * 0.5, sin(uTime * (0.25 + fi * 0.05) + fi) * 0.45);
    f += (0.02 + 0.01 * sin(fi)) / max(dot(p - c, p - c), 1e-4);
  }
  float m = smoothstep(0.9, 1.1, f);
  return mix(vec3(0.08, 0.0, 0.12), hsv(0.02 + p.y * 0.1 + uTime * 0.01, 0.85, 1.0), m) + vec3(1.0, 0.6, 0.3) * smoothstep(1.1, 2.5, f) * 0.3;
}
vec3 caustics(vec2 uv){
  vec2 p = mod(cp(uv) * 6.2832 * 1.5, 6.2832) - 250.0;
  float c = 1.0;
  vec2 i = p;
  for (int n = 0; n < 5; n++) {
    float t = uTime * 0.5 * (1.0 - 3.5 / float(n + 1));
    i = p + vec2(cos(t - i.x) + sin(t + i.y), sin(t - i.y) + cos(t + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + t) / 0.005), p.y / (cos(i.y + t) / 0.005)));
  }
  c = 1.17 - pow(c / 5.0, 1.4);
  float v = pow(abs(c), 8.0);
  return clamp(vec3(v * 0.6, v * 0.9, v) + vec3(0.0, 0.12, 0.25), 0.0, 1.5) * (0.8 + 0.4 * uPulse);
}
vec3 flowLines(vec2 uv){
  vec2 p = cp(uv) * 3.0;
  float n = fbm(p * 0.8 + uTime * 0.1);
  float k = n * 14.0 - uTime * 0.4;
  float w = fwidth(k) * 1.2;
  float l = smoothstep(w, 0.0, abs(fract(k) - 0.5) - 0.5 + w * 1.5);
  return hsv(0.45 + n * 0.5 + uTime * 0.02, 0.7, 1.0) * l * (0.5 + n);
}
vec3 domainWarp(vec2 uv){
  vec2 p = cp(uv) * 2.5;
  vec2 q = vec2(fbm(p + uTime * 0.05), fbm(p + vec2(5.2, 1.3)));
  vec2 r = vec2(fbm(p + 4.0 * q + vec2(1.7, 9.2) + uTime * 0.12), fbm(p + 4.0 * q + vec2(8.3, 2.8)));
  float f = fbm(p + 4.0 * r);
  vec3 col = mix(vec3(0.1, 0.05, 0.2), vec3(0.9, 0.3, 0.1), clamp(f * f * 2.0, 0.0, 1.0));
  col = mix(col, vec3(0.0, 0.6, 0.8), clamp(length(q), 0.0, 1.0) * 0.6);
  return col * (f * 1.6 + 0.2) * (0.85 + 0.3 * uPulse);
}
vec3 bubbles(vec2 uv){
  vec2 p = cp(uv);
  vec3 col = vec3(0.0);
  for (int i = 0; i < 30; i++) {
    float fi = float(i), sp = 0.1 + hash(vec2(fi, 2.0)) * 0.2;
    vec2 c = vec2((hash(vec2(fi, 1.0)) - 0.5) * 1.8 + sin(uTime + fi) * 0.03, fract(hash(vec2(fi, 3.0)) + uTime * sp) * 1.4 - 0.7);
    float r = 0.02 + hash(vec2(fi, 4.0)) * 0.06;
    float d = length(p - c);
    col += hsv(0.5 + fi * 0.02, 0.5, 1.0) * (smoothstep(0.006, 0.0, abs(d - r)) + smoothstep(r * 0.4, 0.0, length(p - c - vec2(-r, r) * 0.4)) * 0.6);
  }
  return col;
}
vec3 electric(vec2 uv){
  vec2 p = cp(uv);
  vec3 col = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float y = (fbm(vec2(p.x * 3.0 + fi * 10.0, uTime * 3.0 + fi)) - 0.5) * 0.6 + (fi - 1.5) * 0.04;
    col += hsv(0.6 + fi * 0.05, 0.6, 1.0) * 0.004 / max(abs(p.y - y), 1e-3);
  }
  return col * (0.6 + 0.8 * uPulse);
}
vec3 cellDivision(vec2 uv){
  vec2 p = cp(uv) * 5.0;
  vec2 g = floor(p), f = fract(p);
  float d1 = 9.0, d2 = 9.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 o = vec2(float(x), float(y));
    vec2 h = vec2(hash(g + o), hash(g + o + 17.0));
    vec2 c = o + 0.5 + 0.4 * sin(uTime * 0.6 + 6.2832 * h) - f;
    float d = dot(c, c);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  float e = sqrt(d2) - sqrt(d1);
  return mix(vec3(0.6, 0.05, 0.15), vec3(1.0, 0.75, 0.6), smoothstep(0.0, 0.3, e)) * smoothstep(0.02, 0.08, e) * (0.4 + 0.6 * exp(-d1 * 3.0)) * (0.8 + 0.4 * uPulse);
}
vec3 tentacles(vec2 uv){
  vec2 p = cp(uv);
  float r = length(p), a = atan(p.y, p.x);
  float acc = 0.0;
  for (int i = 0; i < 8; i++) {
    float fi = float(i), aa = fi * 0.7854 + sin(r * 8.0 - uTime * 2.0 + fi) * 0.35 * r * 3.0;
    float d = abs(sin((a - aa) * 0.5)) * r;
    acc += smoothstep(0.03 * (1.0 - r), 0.0, d) * smoothstep(0.6, 0.0, r);
  }
  return hsv(0.85 - r * 0.4 + uTime * 0.02, 0.7, 1.0) * acc * (0.8 + 0.4 * uPulse);
}
vec3 marble(vec2 uv){
  vec2 p = cp(uv) * 3.0;
  float n = fbm(p + fbm(p * 2.0 + uTime * 0.1) * 2.0);
  float v = 0.5 + 0.5 * sin(p.x * 3.0 + n * 10.0 + uTime * 0.3);
  return mix(vec3(0.03, 0.04, 0.08), hsv(0.58 + uTime * 0.01, 0.35, 0.9), pow(v, 4.0)) + vec3(1.0, 0.85, 0.5) * pow(v, 60.0) * 0.8;
}

// -- Partikel --
vec3 hyperspace(vec2 uv){
  vec2 p = cp(uv);
  float a = atan(p.y, p.x), r = length(p);
  float seg = floor(a * 60.0 / 6.2832 * 3.0);
  float h = hash(vec2(seg, 1.0));
  float z = fract(h + uTime * (0.4 + h * 0.6));
  float rr = z * z * 1.2;
  float streak = smoothstep(0.0, 0.01, r - rr * 0.6) * smoothstep(0.01, 0.0, r - rr);
  float w = smoothstep(0.5, 0.0, abs(fract(a * 60.0 / 6.2832 * 3.0) - 0.5) * 2.0 - 0.3);
  return hsv(0.6 + h * 0.15, 0.4, 1.0) * streak * w * (0.7 + 0.6 * uPulse) * 2.0;
}
vec3 fireflies(vec2 uv){
  vec2 p = cp(uv);
  vec3 col = vec3(0.0);
  for (int i = 0; i < 40; i++) {
    float fi = float(i);
    vec2 c = vec2(fbm(vec2(fi, uTime * 0.15)) - 0.5, fbm(vec2(fi + 30.0, uTime * 0.15)) - 0.5) * vec2(2.2, 1.4);
    float bl = 0.5 + 0.5 * sin(uTime * 3.0 + fi * 1.7);
    col += vec3(1.0, 0.85, 0.3) * 0.0008 / max(dot(p - c, p - c), 1e-5) * bl;
  }
  return col;
}
vec3 confetti(vec2 uv){
  vec2 p = uv * vec2(uRes.x / uRes.y, 1.0) * 14.0;
  vec3 col = vec3(0.0);
  for (int k = 0; k < 3; k++) {
    vec2 q = p + vec2(float(k) * 3.7, uTime * (2.0 + float(k)));
    vec2 g = floor(q), f = fract(q) - 0.5;
    float h = hash(g + float(k) * 9.0);
    if (h > 0.6) {
      vec2 r = rot(uTime * 4.0 * (h - 0.8) + h * 20.0) * f;
      col += hsv(h * 7.0, 0.8, 1.0) * step(abs(r.x), 0.2) * step(abs(r.y), 0.08 + 0.1 * abs(sin(uTime * 5.0 + h * 30.0)));
    }
  }
  return col;
}
vec3 rainLines(vec2 uv){
  vec2 p = uv * vec2(uRes.x / uRes.y * 60.0, 1.0);
  float x = floor(p.x), h = hash(vec2(x, 3.0));
  float y = fract(uv.y + uTime * (0.8 + h * 1.2) + h);
  float drop = smoothstep(0.0, 0.15, y) * step(y, 0.15) * step(0.5, h);
  float w = smoothstep(0.5, 0.0, abs(fract(p.x) - 0.5));
  return vec3(0.6, 0.8, 1.0) * drop * w * (0.6 + 0.6 * uPulse);
}
vec3 galaxy(vec2 uv){
  vec2 p = rot(uTime * 0.1) * cp(uv) * vec2(1.0, 1.8);
  float r = length(p), a = atan(p.y, p.x);
  float arm = 0.5 + 0.5 * cos(2.0 * (a - log(r + 1e-3) * 2.5));
  float dust = fbm(vec2(a * 3.0 - log(r + 1e-3) * 7.0, r * 8.0));
  float stars = step(0.992, hash(floor(cp(uv) * 300.0))) * (0.5 + 0.5 * sin(uTime * 4.0 + hash(floor(cp(uv) * 300.0)) * 30.0));
  vec3 col = hsv(0.65 - r * 0.3, 0.6, 1.0) * arm * dust * exp(-r * 2.5) * 2.0 + vec3(1.0, 0.9, 0.7) * exp(-r * 12.0);
  return col + stars;
}
vec3 vortex(vec2 uv){
  vec2 p = cp(uv);
  float r = length(p) + 1e-3, a = atan(p.y, p.x);
  vec3 col = vec3(0.0);
  for (int k = 0; k < 2; k++) {
    float fk = float(k);
    vec2 q = vec2((a + 0.6 / r * 0.5) / 6.2832 * (24.0 + fk * 12.0) + uTime * 0.6, log(r) * (6.0 + fk * 3.0) + uTime * (2.0 + fk));
    vec2 g = floor(q), f = fract(q) - 0.5;
    float h = hash(g + fk * 13.0);
    col += hsv(0.55 + h * 0.2 - r * 0.3, 0.6, 1.0) * smoothstep(0.3, 0.0, length(f)) * step(0.55, h);
  }
  return col * smoothstep(0.02, 0.15, r) * (0.8 + 0.5 * uPulse);
}
vec3 fireworks(vec2 uv){
  vec2 p = cp(uv);
  vec3 col = vec3(0.0);
  for (int k = 0; k < 5; k++) {
    float fk = float(k), t = uTime * 0.6 + fk * 0.37, id = floor(t), ph = fract(t);
    vec2 c = vec2(hash(vec2(id, fk)) - 0.5, hash(vec2(id, fk + 9.0)) * 0.4 - 0.05) * vec2(1.4, 1.0);
    vec3 hue = hsv(hash(vec2(id, fk + 3.0)), 0.7, 1.0);
    for (int i = 0; i < 24; i++) {
      float a = float(i) * 0.2618 + id;
      vec2 q = c + vec2(cos(a), sin(a)) * ph * 0.35 - vec2(0.0, ph * ph * 0.15);
      col += hue * 0.00012 / max(dot(p - q, p - q), 2e-5) * (1.0 - ph);
    }
  }
  return col;
}
vec3 particleRing(vec2 uv){
  vec2 p = cp(uv);
  vec3 col = vec3(0.0);
  for (int i = 0; i < 80; i++) {
    float fi = float(i), a = fi / 80.0 * 6.2832 + uTime * 0.3;
    float r = 0.3 + 0.06 * sin(a * 5.0 + uTime * 2.0) + 0.04 * uPulse * sin(fi * 3.0);
    vec2 c = vec2(cos(a), sin(a)) * r;
    col += hsv(fi / 80.0 + uTime * 0.05, 0.6, 1.0) * 0.00006 / max(dot(p - c, p - c), 1e-5);
  }
  return col;
}
vec3 dustStorm(vec2 uv){
  vec2 p = cp(uv);
  float acc = 0.0;
  for (int k = 0; k < 4; k++) {
    float s = 40.0 + float(k) * 30.0;
    vec2 q = p * s + vec2(uTime * (3.0 + float(k) * 2.0), sin(uTime * 0.5 + float(k)) * 2.0);
    vec2 g = floor(q);
    float h = hash(g + float(k) * 31.0);
    acc += step(0.93, h) * smoothstep(0.35, 0.0, length(fract(q) - 0.5)) * (0.4 + 0.2 * float(k));
  }
  return vec3(1.0, 0.85, 0.65) * acc * 2.0 * (0.7 + 0.6 * uPulse);
}


// ==== Paket 3: Retro/Synthwave, Op-Art, Audio, Minimal, Daten ========================
// -- Retro --
vec3 outrunSun(vec2 uv){
  vec2 p = cp(uv);
  vec3 col = mix(vec3(0.05, 0.0, 0.15), vec3(0.6, 0.05, 0.4), smoothstep(-0.1, 0.5, p.y));
  vec2 c = p - vec2(0.0, 0.12);
  float sun = smoothstep(0.255, 0.25, length(c));
  float cut = step(0.0, sin((c.y + uTime * 0.03) * 70.0) + 1.6 + c.y * 9.0);
  col = mix(col, mix(vec3(1.0, 0.2, 0.5), vec3(1.0, 0.85, 0.2), smoothstep(-0.2, 0.25, c.y)), sun * (c.y > -0.0 ? 1.0 : cut));
  if (p.y < -0.05) {
    float z = 0.25 / (-p.y + 0.0001), x = p.x * z;
    float g = max(smoothstep(0.06 * z, 0.0, abs(fract(x * 2.0) - 0.5)), smoothstep(0.06 * z, 0.0, abs(fract(z * 2.0 + uTime * 2.0) - 0.5)));
    col = vec3(0.04, 0.0, 0.1) + vec3(0.1, 0.9, 1.0) * g * exp(-z * 0.12) * (0.8 + 0.4 * uPulse);
  }
  return col;
}
vec3 vhsTape(vec2 uv){
  float t = floor(uTime * 12.0);
  float y = uv.y + 0.002 * sin(uv.y * 400.0 + uTime * 20.0);
  float jitter = (hash(vec2(floor(y * 120.0), t)) - 0.5) * 0.01 * step(0.85, hash(vec2(t, 3.0)));
  vec2 q = vec2(uv.x + jitter, y);
  vec3 col = vec3(0.0);
  float bars = floor(q.x * 8.0);
  col = hsv(bars / 8.0, 0.75, 0.85) * step(q.y, 0.7);
  col = q.y < 0.7 ? col : vec3(step(0.5, hash(floor(q * vec2(80.0, 40.0)) + t)) * 0.15);
  col += (hash(q * 500.0 + t) - 0.5) * 0.18;
  float band = smoothstep(0.03, 0.0, abs(fract(uv.y - uTime * 0.15) - 0.5) - 0.02);
  col += band * 0.25;
  return col * (0.9 - 0.15 * sin(uv.y * 900.0));
}
vec3 pixelSpace(vec2 uv){
  vec2 p = floor(uv * vec2(uRes.x / uRes.y, 1.0) * 48.0);
  vec3 col = step(0.985, hash(p + floor(uTime * 0.5))) * vec3(0.7);
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    vec2 c = vec2(mod(fi * 13.0 + uTime * (6.0 + fi * 2.0), 90.0) - 4.0, 8.0 + fi * 6.0 + 2.0 * sin(uTime * 2.0 + fi));
    vec2 d = abs(p - floor(c));
    float ship = step(d.x, 2.0) * step(d.y, 1.0) * step(0.5, hash(vec2(d.x * (step(p.x, c.x) * 2.0 - 1.0), d.y) + fi * 7.0) + step(d.x, 0.5));
    col = mix(col, hsv(fi / 6.0, 0.7, 1.0), ship);
  }
  return col * (0.8 + 0.4 * uPulse);
}
vec3 c64Load(vec2 uv){
  float t = floor(uTime * 30.0);
  float stripe = hash(vec2(floor(uv.y * 60.0 + hash(vec2(t, 1.0)) * 60.0), t));
  vec3 border = hsv(floor(stripe * 8.0) / 8.0, 0.8, 0.9);
  vec2 inner = abs(uv - 0.5);
  vec3 screen = vec3(0.25, 0.2, 0.75);
  float txt = step(0.5, hash(floor(uv * vec2(40.0, 25.0)))) * step(abs(uv.y - 0.62), 0.03) * step(uv.x, 0.6) * step(0.18, uv.x);
  screen += vec3(0.4, 0.4, 1.0) * txt;
  return (inner.x < 0.38 && inner.y < 0.36) ? screen : border;
}

// -- Op-Art --
vec3 opWaves(vec2 uv){
  vec2 p = cp(uv);
  float v = sin((p.y + 0.08 * sin(p.x * 8.0 + uTime * 2.0) * (1.0 - abs(p.x))) * 90.0);
  return vec3(smoothstep(-0.2, 0.2, v)) * (0.85 + 0.3 * uPulse);
}
vec3 bulgeGrid(vec2 uv){
  vec2 p = cp(uv);
  float r = length(p);
  vec2 q = p * (1.0 - 0.6 * exp(-r * r * 6.0) * (0.8 + 0.4 * sin(uTime * 1.5)));
  vec2 g = floor(q * 14.0);
  return vec3(mod(g.x + g.y, 2.0)) * (0.85 + 0.3 * uPulse);
}
vec3 concentricShift(vec2 uv){
  vec2 p = cp(uv);
  float a = smoothstep(0.0, 0.0, sin(length(p - vec2(0.08 * sin(uTime), 0.0)) * 120.0));
  float b = smoothstep(0.0, 0.0, sin(length(p + vec2(0.08 * sin(uTime), 0.0)) * 120.0));
  return vec3(abs(a - b)) * (0.8 + 0.4 * uPulse);
}
vec3 vasarely(vec2 uv){
  vec2 p = cp(uv) * 10.0;
  vec2 g = floor(p), f = fract(p) - 0.5;
  float r = length(g + 0.5) / 7.0;
  float s = 0.15 + 0.3 * (0.5 + 0.5 * sin(r * 6.0 - uTime * 1.5));
  float shape = mod(g.x + g.y, 2.0) > 0.5 ? step(length(f), s) : step(max(abs(f.x), abs(f.y)), s);
  vec3 bg = hsv(0.6 + r * 0.2, 0.7, 0.7), fg = hsv(0.05 + r * 0.2, 0.8, 1.0);
  return mix(bg, fg, shape);
}
vec3 zebraTwist(vec2 uv){
  vec2 p = cp(uv);
  float r = length(p), a = atan(p.y, p.x);
  float v = sin(a * 12.0 + r * 20.0 * sin(uTime * 0.4) + uTime);
  return vec3(step(0.0, v));
}

// -- Audio --
vec3 spectrumCircle(vec2 uv){
  vec2 p = cp(uv);
  float a = atan(p.y, p.x), r = length(p);
  float x = abs(a) / 3.1416;
  float b = band(x);
  float inner = 0.18 + 0.03 * uPulse;
  float bar = step(inner, r) * step(r, inner + b * 0.3) * step(0.25, abs(fract(x * 48.0) - 0.5) * 2.0 * 0.0 + 1.0) * smoothstep(0.45, 0.35, abs(fract(x * 48.0) - 0.5));
  return hsv(x * 0.6 + uTime * 0.03, 0.75, 1.0) * bar + vec3(0.9) * smoothstep(0.004, 0.0, abs(r - inner + 0.01));
}
vec3 waveRibbon(vec2 uv){
  vec3 col = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float y = 0.5 + (fi - 3.5) * 0.04 + (uHasWave > 0 ? wave(uv.x) * 0.25 : sin(uv.x * 10.0 + uTime * 3.0 + fi * 0.4) * 0.15 * (0.5 + band(fi / 8.0)));
    col += hsv(0.5 + fi * 0.06, 0.7, 1.0) * 0.0025 / max(abs(uv.y - y), 1e-3);
  }
  return col * 0.5;
}
vec3 eqTower(vec2 uv){
  vec2 p = uv * vec2(16.0, 1.0);
  float id = floor(p.x), f = fract(p.x);
  float h = band((id + 0.5) / 16.0) * 0.9 + 0.03;
  float seg = step(0.2, fract(uv.y * 24.0));
  float on = step(uv.y, h) * step(0.12, f) * step(f, 0.88) * seg;
  vec3 c = uv.y > 0.8 ? vec3(1.0, 0.15, 0.1) : uv.y > 0.55 ? vec3(1.0, 0.8, 0.1) : vec3(0.1, 1.0, 0.4);
  float peak = step(abs(uv.y - h - 0.03), 0.012) * step(0.12, f) * step(f, 0.88);
  return c * on + vec3(1.0) * peak;
}
vec3 bassRing(vec2 uv){
  vec2 p = cp(uv);
  float bass = band(0.05), r = length(p);
  float R = 0.15 + bass * 0.2 + 0.05 * uPulse;
  float ring = 0.004 / max(abs(r - R), 1e-3) + 0.002 / max(abs(r - R * 1.4), 1e-3) * band(0.5);
  return hsv(0.95 - bass * 0.3, 0.7, 1.0) * ring;
}
vec3 audioMesh(vec2 uv){
  vec2 p = cp(uv);
  float d = 1e3;
  for (int j = 0; j < 12; j++) {
    float fy = float(j) / 11.0;
    float y0 = (fy - 0.5) * 0.7;
    vec2 prev = vec2(-0.9, y0);
    for (int i = 1; i <= 24; i++) {
      float fx = float(i) / 24.0;
      float x = -0.9 + fx * 1.8;
      float y = y0 + band(fx) * 0.15 * sin(fx * 3.1416) + 0.02 * sin(fx * 12.0 + uTime * 2.0 + fy * 4.0);
      d = min(d, segDist(p, prev, vec2(x, y)));
      prev = vec2(x, y);
    }
  }
  return hsv(0.55 + uTime * 0.02, 0.6, 1.0) * glowLine(d, 0.0015, 0.0012);
}

// -- Minimal --
vec3 singleLine(vec2 uv){
  float y = 0.5 + 0.35 * sin(uBeat * 1.5708);
  return vec3(smoothstep(0.004, 0.0, abs(uv.y - y))) * (0.8 + 0.4 * uPulse);
}
vec3 dotPulse(vec2 uv){
  vec2 p = cp(uv);
  float r = 0.05 + 0.25 * pow(1.0 - fract(uBeat), 3.0);
  return vec3(smoothstep(r + 0.004, r, length(p)));
}
vec3 crossHair(vec2 uv){
  vec2 p = cp(uv);
  vec2 c = vec2(sin(uTime * 0.7) * 0.5, sin(uTime * 0.9) * 0.3);
  float l = smoothstep(0.003, 0.0, abs(p.x - c.x)) + smoothstep(0.003, 0.0, abs(p.y - c.y));
  float box = smoothstep(0.003, 0.0, abs(max(abs(p.x - c.x), abs(p.y - c.y)) - 0.05 - 0.02 * uPulse));
  return vec3(1.0, 0.2, 0.2) * box + vec3(0.7) * l * 0.6;
}
vec3 bars3(vec2 uv){
  float k = floor(mod(uBeat, 3.0));
  float x = (k + 0.5) / 3.0;
  return vec3(smoothstep(0.12, 0.11, abs(uv.x - x))) * (0.6 + 0.6 * uPulse);
}
vec3 frameZoom(vec2 uv){
  vec2 p = cp(uv);
  float s = fract(uBeat * 0.5);
  float d = abs(max(abs(p.x) / (uRes.x / uRes.y), abs(p.y)) - mix(0.5, 0.0, s));
  return vec3(smoothstep(0.006, 0.0, d)) * (1.0 - s);
}

// -- Daten --
vec3 radar(vec2 uv){
  vec2 p = cp(uv);
  float r = length(p), a = atan(p.y, p.x);
  float sweep = mod(a - uTime * 1.5, 6.2832);
  float trail = exp(-sweep * 2.0) * step(r, 0.45);
  float rings = smoothstep(0.003, 0.0, abs(fract(r * 8.0 + 0.5) - 0.5) / 8.0) * step(r, 0.45);
  float cross = (smoothstep(0.002, 0.0, abs(p.x)) + smoothstep(0.002, 0.0, abs(p.y))) * step(r, 0.45);
  vec2 g = floor(p * 14.0);
  float blip = step(0.97, hash(g)) * smoothstep(0.05, 0.0, length(fract(p * 14.0) - 0.5) / 14.0) * exp(-mod(atan(g.y, g.x) - uTime * 1.5, 6.2832) * 1.5);
  return vec3(0.15, 1.0, 0.4) * (trail * 0.6 + rings * 0.4 + cross * 0.3 + blip * 3.0);
}
vec3 matrixGrid(vec2 uv){
  vec2 p = uv * vec2(uRes.x / uRes.y, 1.0) * 30.0;
  vec2 g = floor(p), f = fract(p);
  float h = hash(g + floor(uTime * 4.0 + hash(g) * 4.0));
  float on = step(0.7, h) * step(0.15, f.x) * step(f.x, 0.85) * step(0.15, f.y) * step(f.y, 0.85);
  return mix(vec3(0.0, 0.6, 1.0), vec3(1.0, 0.3, 0.6), step(0.95, h)) * on * (0.6 + 0.6 * uPulse);
}
vec3 worldMap(vec2 uv){
  vec2 p = uv * vec2(uRes.x / uRes.y, 1.0) * 60.0;
  vec2 g = floor(p);
  vec2 q = g / vec2(uRes.x / uRes.y * 60.0, 60.0);
  float land = step(0.52, fbm(q * vec2(4.0, 3.0) + 3.0));
  float dot = smoothstep(0.35, 0.25, length(fract(p) - 0.5));
  float scan = exp(-abs(fract(q.x - uTime * 0.1) - 0.5) * 30.0);
  return vec3(0.2, 0.6, 1.0) * land * dot * (0.35 + scan * 1.5) + vec3(1.0, 0.3, 0.3) * dot * step(0.995, hash(g + floor(uTime))) * land;
}

// -- Geometrie (Ergänzung) --
vec3 neonTriangles(vec2 uv){
  vec2 p = cp(uv);
  float acc = 0.0;
  for (int i = 0; i < 6; i++) {
    float fi = float(i), s = fract(uTime * 0.25 + fi / 6.0);
    vec2 q = rot(fi * 0.5 + uTime * 0.3) * p;
    float d = abs(sdPoly(q, 3.0, s * 0.6));
    acc += smoothstep(0.006, 0.0, d) * (1.0 - s) * 1.5;
  }
  return hsv(0.9 + uTime * 0.04, 0.8, 1.0) * acc * (0.8 + 0.4 * uPulse);
}
vec3 kaleidoBurst(vec2 uv){
  vec2 p = cp(uv);
  float r = length(p), a = atan(p.y, p.x);
  float k = 6.2832 / 12.0;
  a = abs(mod(a + uTime * 0.2, k) - k * 0.5);
  vec2 q = vec2(cos(a), sin(a)) * r;
  float v = fbm(q * 6.0 - vec2(uTime * 0.8, 0.0));
  float rays = smoothstep(0.02, 0.0, abs(q.y - 0.02 * sin(q.x * 30.0 - uTime * 4.0)));
  return hsv(0.1 + v * 0.6 + uTime * 0.03, 0.8, 1.0) * (pow(v, 2.0) * 1.5 + rays) * smoothstep(0.7, 0.1, r) * (0.8 + 0.4 * uPulse);
}
vec3 infinityLoop(vec2 uv){
  vec2 p = cp(uv);
  float d = 1e3; vec2 prev = vec2(0.0);
  float head = fract(uTime * 0.3);
  vec3 col = vec3(0.0);
  for (int i = 0; i <= 120; i++) {
    float t = float(i) / 120.0 * 6.2832;
    vec2 q = vec2(sin(t), sin(t) * cos(t)) * vec2(0.55, 0.6) / (1.0 + cos(t) * cos(t) * 0.0);
    if (i > 0) {
      float dd = segDist(p, prev, q);
      float age = fract(head - float(i) / 120.0);
      col += hsv(0.5 + age * 0.3, 0.7, 1.0) * smoothstep(0.007, 0.0, dd) * pow(1.0 - age, 2.0) * 2.5;
      d = min(d, dd);
    }
    prev = q;
  }
  return col + vec3(0.2, 0.3, 0.5) * glowLine(d, 0.0015, 0.001) * 0.8;
}

void main(){
  vec2 uv = vUv;
  vec3 c;
  // Lage, Größe, Drehung für alle Visuals außer Lasern (die rechnen sie selbst, damit Linien dünn bleiben).
  // Das Visual läuft dabei weiter über den ganzen Bildschirm (kein Rahmen).
  bool isLz = (uGen >= 28 && uGen <= 42) || uGen == 22;
  if (!isLz && uGen != 27) {
    float asp = uRes.x / uRes.y;
    vec2 p = (vUv - 0.5) * vec2(asp, 1.0) - vec2(uLz.x * 0.5 * asp, uLz.y * 0.5);
    float co = cos(uLzRot), si = sin(uLzRot);
    p = mat2(co, si, -si, co) * p / max(uLz.z, 0.05);
    uv = p / vec2(asp, 1.0) + 0.5;
  }
  switch (uGen) {
    case 0: c = barSpectrum(uv); break;
    case 1: c = radialEq(uv); break;
    case 2: c = oscilloscope(uv); break;
    case 3: c = pulseRings(uv); break;
    case 4: c = tunnel(uv); break;
    case 5: c = synthGrid(uv); break;
    case 6: c = starfield(uv); break;
    case 7: c = plasma(uv); break;
    case 8: c = lissajous(uv); break;
    case 9: c = vuMeter(uv); break;
    case 10: c = dotMatrix(uv); break;
    case 11: c = plexus(uv); break;
    case 12: c = hypercube(uv); break;
    case 13: c = vectorGobos(uv); break;
    case 14: c = bokeh(uv); break;
    case 15: c = burst(uv); break;
    case 16: c = lightning(uv); break;
    case 17: c = ripples(uv); break;
    case 18: c = fire(uv); break;
    case 19: c = liquidLight(uv); break;
    case 20: c = mirrorBall(uv); break;
    case 21: c = uvGlow(uv); break;
    case 22: c = laserSheet(uv); break;
    case 23: c = laserFans(uv); break;
    case 24: c = moire(uv); break;
    case 25: c = flower(uv); break;
    case 26: c = co2Jet(uv); break;
    case 27: c = testcard(uv); break;
    case 28: c = laserBeams(uv); break;
    case 29: c = laserSky(uv); break;
    case 30: c = laserCone(uv); break;
    case 31: c = laserWave(uv); break;
    case 32: c = laserMatrix(uv); break;
    case 33: c = laserPropeller(uv); break;
    case 34: c = laserScan(uv); break;
    case 35: c = beamMoonflower(uv); break;
    case 36: c = beamDerby(uv); break;
    case 37: c = beamScanner(uv); break;
    case 38: c = beamSpots(uv); break;
    case 39: c = beamSnow(uv); break;
    case 40: c = beamPolygon(uv); break;
    case 41: c = beamBurst(uv); break;
    case 42: c = beamScan(uv, true); break;
    case 45: c = monoBars(uv); break;
    case 46: c = strobeGrid(uv); break;
    case 47: c = lineScan(uv); break;
    case 48: c = rotor(uv); break;
    case 49: c = splitFlash(uv); break;
    case 50: c = pulseSquare(uv); break;
    case 51: c = cubeTunnel(uv); break;
    case 52: c = gyroid(uv); break;
    case 53: c = chromeBlobs(uv); break;
    case 54: c = neonCorridor(uv); break;
    case 55: c = pointSphere(uv); break;
    case 56: c = terrain(uv); break;
    case 57: c = ringStack(uv); break;
    case 58: c = codeRain(uv); break;
    case 59: c = barcode(uv); break;
    case 60: c = dataBlocks(uv); break;
    case 61: c = hud(uv); break;
    case 62: c = glitchWall(uv); break;
    case 63: c = truchet(uv); break;
    case 64: c = rileyWaves(uv); break;
    case 65: c = checkerWarp(uv); break;
    case 66: c = voronoiCells(uv); break;
    case 67: c = hexPulse(uv); break;
    case 68: c = interference(uv); break;
    case 69: c = hypnoSpiral(uv); break;
    case 70: c = ink(uv); break;
    case 71: c = aurora(uv); break;
    case 72: c = iridescent(uv); break;
    case 73: c = smoke(uv); break;
    case 74: c = nebula(uv); break;
    case 75: c = mandelZoom(uv); break;
    case 76: c = julia(uv); break;
    case 77: c = sierpinski(uv); break;
    case 78: c = kifs(uv); break;
    case 79: c = apollonian(uv); break;
    case 80: c = carpet(uv); break;
    case 81: c = newton(uv); break;
    case 82: c = tricorn(uv); break;
    case 83: c = rotozoom(uv); break;
    case 84: c = twister(uv); break;
    case 85: c = copperBars(uv); break;
    case 86: c = sineDots(uv); break;
    case 87: c = rasterBars(uv); break;
    case 88: c = xorTunnel(uv); break;
    case 89: c = vectorBalls(uv); break;
    case 90: c = shadeBobs(uv); break;
    case 91: c = flowerOfLife(uv); break;
    case 92: c = metatron(uv); break;
    case 93: c = spirograph(uv); break;
    case 94: c = starPolygons(uv); break;
    case 95: c = nestedPolygons(uv); break;
    case 96: c = seedOfLife(uv); break;
    case 97: c = mandala(uv); break;
    case 98: c = lissajousKnot(uv); break;
    case 99: c = circleGrid(uv); break;
    case 100: c = sphereField(uv); break;
    case 101: c = boxField(uv); break;
    case 102: c = torusRing(uv); break;
    case 103: c = ringTunnel(uv); break;
    case 104: c = hexTunnel(uv); break;
    case 105: c = wormhole(uv); break;
    case 106: c = infiniteSquares(uv); break;
    case 107: c = dnaHelix(uv); break;
    case 108: c = lavaLamp(uv); break;
    case 109: c = caustics(uv); break;
    case 110: c = flowLines(uv); break;
    case 111: c = domainWarp(uv); break;
    case 112: c = bubbles(uv); break;
    case 113: c = electric(uv); break;
    case 114: c = cellDivision(uv); break;
    case 115: c = tentacles(uv); break;
    case 116: c = marble(uv); break;
    case 117: c = hyperspace(uv); break;
    case 118: c = fireflies(uv); break;
    case 119: c = confetti(uv); break;
    case 120: c = rainLines(uv); break;
    case 121: c = galaxy(uv); break;
    case 122: c = vortex(uv); break;
    case 123: c = fireworks(uv); break;
    case 124: c = particleRing(uv); break;
    case 125: c = dustStorm(uv); break;
    case 126: c = outrunSun(uv); break;
    case 127: c = vhsTape(uv); break;
    case 128: c = pixelSpace(uv); break;
    case 129: c = c64Load(uv); break;
    case 130: c = opWaves(uv); break;
    case 131: c = bulgeGrid(uv); break;
    case 132: c = concentricShift(uv); break;
    case 133: c = vasarely(uv); break;
    case 134: c = zebraTwist(uv); break;
    case 135: c = spectrumCircle(uv); break;
    case 136: c = waveRibbon(uv); break;
    case 137: c = eqTower(uv); break;
    case 138: c = bassRing(uv); break;
    case 139: c = audioMesh(uv); break;
    case 140: c = singleLine(uv); break;
    case 141: c = dotPulse(uv); break;
    case 142: c = crossHair(uv); break;
    case 143: c = bars3(uv); break;
    case 144: c = frameZoom(uv); break;
    case 145: c = radar(uv); break;
    case 146: c = matrixGrid(uv); break;
    case 147: c = worldMap(uv); break;
    case 148: c = neonTriangles(uv); break;
    case 149: c = kaleidoBurst(uv); break;
    case 150: c = infinityLoop(uv); break;
    default: c = vec3(0.0);
  }

  // Laser: Helligkeit = stärkster Kanal (ein blauer Strahl ist voll hell, nicht dunkel)
  bool laser = (uGen >= 28 && uGen <= 42) || uGen == 22 || uGen == 23;
  float lum = laser ? clamp(max(c.r, max(c.g, c.b)), 0.0, 1.0) : clamp(dot(c, vec3(0.299, 0.587, 0.114)) * 1.15, 0.0, 1.0);
  if (uColorMode == 1) c = uColA * lum * (laser ? 1.0 : 1.25);
  else if (uColorMode == 4 && uPalN > 0 && !laser) c = palAt(fract(vUv.x * 0.5 + lum * 0.45 + uTime * 0.05)) * (0.1 + lum * 1.15);
  else if (uColorMode == 2) c = mix(uColA, uColB, clamp(vUv.y * 0.6 + lum * 0.5, 0.0, 1.0)) * (0.15 + lum * 1.1);
  else if (uColorMode == 3) c = hsv(fract(vUv.x * 0.5 + lum * 0.4 + uTime * 0.08), 0.85, lum * 1.2);

  // Overlay-Ebenen: Deckkraft = Helligkeit. Dunkle Pixel werden durchsichtig statt den Hintergrund
  // abzudunkeln (sonst entsteht auf hellem Grund eine schwarze Kontur um Linien und Strahlen).
  c = clamp(c, 0.0, 1.0);
  float a = mix(1.0, max(c.r, max(c.g, c.b)), uKey);
  outColor = vec4(c, a);  // vormultipliziert (rgb ≤ a); Deckkraft der Ebene kommt beim Mischen
}`;

// ---- Effekt-Stapel ------------------------------------------------------------------
/** Reihenfolge = uEffect-Nummer. Muss zu POST_EFFECTS in src/core/effects.ts passen. */
export const POST_IDS = ["kaleidoscope", "mirror", "rgb-shift", "glitch", "crt", "pixelate", "feedback", "glow", "strobe-zoom", "invert", "tint", "ascii", "laser",
  // Techno-Effekte
  "datamosh", "echo", "stutter", "zoom-blur", "tiles", "edges", "one-bit", "shake", "polar", "liquid", "slices", "hue-cycle", "posterize", "beat-invert",
  // Paket Effekte 2
  "slit-scan", "zoom-feedback", "vhs", "bloom", "vignette", "wave-warp", "twirl", "fisheye", "lcd", "halftone", "duotone", "film", "emboss", "pixel-sort", "lens", "luma-key", "color-strobe", "hex-pixel", "spin-blur", "solarize", "false-color", "beat-flip", "turbulence"] as const;
/** Effekte, die das letzte Bild der Ebene brauchen (eigener Zwischenspeicher je Effekt). */
export const HISTORY_FX: ReadonlySet<string> = new Set(["feedback", "datamosh", "echo", "stutter", "slit-scan", "zoom-feedback"]);

export const POST_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTex;
uniform sampler2D uPrev;   // nur Feedback: letztes Bild dieser Ebene
uniform vec2  uRes;
uniform float uAmount;
uniform float uTime;
uniform float uPulse;
uniform float uBeat;       // fortlaufender Beat (Stutter, Slices, Shake, Farbrad)
uniform int   uEffect;
uniform int   uColorMode;  // Farbüberlagerung: 0 = Slot A, 1 = Slot, 2 = Verlauf, 3 = Regenbogen
uniform vec3  uColA;
uniform vec3  uColB;
const float PI = 3.14159265;

float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec4 tex(vec2 uv){ return texture(uTex, uv); }
vec3 hsv(float h, float s, float v){
  vec3 k = clamp(abs(fract(h + vec3(0.0, 2.0/3.0, 1.0/3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
  return v * mix(vec3(1.0), k, s);
}
vec2 mirrorRepeat(vec2 x){ return 1.0 - abs(1.0 - mod(x, 2.0)); }

// ASCII: Zeichen nach Helligkeit (leer . : + # @), als einfache Formen in der Zelle f (0–1)
float box(vec2 f, vec2 c, vec2 h){ vec2 d = abs(f - c) - h; return step(max(d.x, d.y), 0.0); }
float glyph(float l, vec2 f){
  if (l < 0.08) return 0.0;
  if (l < 0.25) return box(f, vec2(0.5, 0.2), vec2(0.09));
  if (l < 0.45) return max(box(f, vec2(0.5, 0.25), vec2(0.09)), box(f, vec2(0.5, 0.7), vec2(0.09)));
  if (l < 0.65) return max(box(f, vec2(0.5), vec2(0.07, 0.32)), box(f, vec2(0.5), vec2(0.32, 0.07)));
  if (l < 0.85) return max(max(box(f, vec2(0.35, 0.5), vec2(0.06, 0.38)), box(f, vec2(0.65, 0.5), vec2(0.06, 0.38))),
                           max(box(f, vec2(0.5, 0.35), vec2(0.38, 0.06)), box(f, vec2(0.5, 0.65), vec2(0.38, 0.06))));
  float r = length(f - 0.5);
  return max(step(abs(r - 0.33), 0.07), step(r, 0.12));
}

void main(){
  vec2 uv = vUv;
  float a = clamp(uAmount, 0.0, 1.0);
  float aspect = uRes.x / uRes.y;
  vec4 c;
  if (uEffect == 0) {            // Kaleidoskop
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float r = length(p);
    float ang = atan(p.y, p.x) + uTime * 0.15;
    float seg = floor(mix(3.0, 12.0, a));
    float w = 2.0 * PI / seg;
    ang = abs(mod(ang, w) - w * 0.5);
    vec2 q = vec2(cos(ang), sin(ang)) * r;
    q.x /= aspect;
    c = mix(tex(uv), tex(mirrorRepeat(q + 0.5)), smoothstep(0.0, 0.12, a));
  } else if (uEffect == 1) {     // Spiegeln
    vec2 m = uv;
    m.x = 0.5 - abs(uv.x - 0.5);
    if (a > 0.5) m.y = 0.5 - abs(uv.y - 0.5);
    c = tex(m);
  } else if (uEffect == 2) {     // RGB-Versatz
    float d = a * 0.03 * (0.4 + 0.6 * uPulse);
    vec4 r = tex(uv + vec2(d, 0.0)), g = tex(uv), b = tex(uv - vec2(d, 0.0));
    c = vec4(r.r, g.g, b.b, max(max(r.a, g.a), b.a));
  } else if (uEffect == 3) {     // Glitch
    float t = floor(uTime * 12.0);
    float row = floor(uv.y * 24.0);
    float h = hash(vec2(row, t));
    vec2 g = uv;
    if (h < a * 0.6) g.x += (hash(vec2(t, row)) - 0.5) * 0.25 * a;
    c = tex(g);
    if (h < a * 0.3) c.rgb = c.gbr;
    float n = hash(uv * uRes + t) * a * 0.15;
    c.rgb += n; c.a = max(c.a, n);
    c.rgb *= 1.0 - 0.25 * a * step(0.5, fract(uv.y * uRes.y * 0.5));
  } else if (uEffect == 4) {     // Röhre
    vec2 p = uv - 0.5;
    vec2 b = p * (1.0 + 0.25 * a * dot(p, p)) + 0.5;
    c = (b.x < 0.0 || b.x > 1.0 || b.y < 0.0 || b.y > 1.0) ? vec4(0.0) : tex(b);
    float scan = 0.5 + 0.5 * sin(b.y * uRes.y * PI * 0.5);
    c.rgb *= mix(1.0, 0.55 + 0.45 * scan, a);
    c.rgb *= mix(1.0, smoothstep(0.85, 0.3, length(p)), a);
  } else if (uEffect == 5) {     // Pixel
    float cells = mix(200.0, 12.0, a);
    vec2 cs = vec2(cells * aspect, cells);
    c = tex((floor(uv * cs) + 0.5) / cs);
  } else if (uEffect == 6) {     // Feedback
    vec2 p = uv - 0.5;
    float z = 1.0 + 0.03 * a;
    float rt = 0.02 * a * sin(uTime * 0.3);
    vec2 q = mat2(cos(rt), -sin(rt), sin(rt), cos(rt)) * p / z + 0.5;
    vec4 prev = texture(uPrev, q) * (0.80 + 0.17 * a);
    c = max(tex(uv), prev);
  } else if (uEffect == 7) {     // Leuchten
    vec4 base = tex(uv), acc = vec4(0.0);
    float r = 0.004 + 0.014 * a;
    vec2 k = vec2(1.0 / aspect, 1.0);
    for (int i = 0; i < 12; i++) {
      float an = float(i) * PI / 6.0;
      vec2 d = vec2(cos(an), sin(an)) * r * k;
      acc += tex(uv + d) + tex(uv + d * 2.0);
    }
    c = min(base + acc / 24.0 * a * 1.6, vec4(1.0));
    c.a = max(c.a, max(c.r, max(c.g, c.b)));
  } else if (uEffect == 8) {     // Beat-Zoom
    float z = 1.0 + a * 0.35 * uPulse;
    c = tex((uv - 0.5) / z + 0.5);
  } else if (uEffect == 9) {     // Invertieren (vormultipliziert)
    vec4 t = tex(uv);
    c = mix(t, vec4(t.a - t.rgb, t.a), a);
  } else if (uEffect == 11) {    // ASCII
    float cell = max(6.0, uRes.y / 54.0);
    vec2 id = floor(uv * uRes / cell), f = fract(uv * uRes / cell);
    vec4 t = tex((id + 0.5) * cell / uRes);
    float lum = clamp(dot(t.rgb, vec3(0.299, 0.587, 0.114)) * 1.3, 0.0, 1.0);
    float g = glyph(lum, vec2(f.x, 1.0 - f.y));
    vec3 col = t.rgb / max(max(t.r, max(t.g, t.b)), 0.001);   // Farbe voll, Helligkeit macht das Zeichen
    vec4 asc = vec4(col * g, g);
    c = mix(tex(uv), asc, smoothstep(0.0, 0.2, a));
  } else if (uEffect == 12) {    // Laser-Look: Kanten als dünne, satte Linien auf reinem Schwarz
    vec2 px = 1.0 / uRes;
    vec3 W = vec3(0.299, 0.587, 0.114);
    float tl = dot(tex(uv + vec2(-px.x, -px.y)).rgb, W), tc = dot(tex(uv + vec2(0.0, -px.y)).rgb, W), tr = dot(tex(uv + vec2(px.x, -px.y)).rgb, W);
    float ml = dot(tex(uv + vec2(-px.x, 0.0)).rgb, W), mr = dot(tex(uv + vec2(px.x, 0.0)).rgb, W);
    float bl = dot(tex(uv + vec2(-px.x, px.y)).rgb, W), bc = dot(tex(uv + vec2(0.0, px.y)).rgb, W), br = dot(tex(uv + vec2(px.x, px.y)).rgb, W);
    float gx = (tr + 2.0 * mr + br) - (tl + 2.0 * ml + bl), gy = (bl + 2.0 * bc + br) - (tl + 2.0 * tc + tr);
    float line = smoothstep(0.1, 0.3, length(vec2(gx, gy)));
    // Farbe der Umgebung, voll gesättigt (Laser kennen kein Grau)
    vec3 col = max(max(tex(uv).rgb, tex(uv + vec2(px.x * 2.0, 0.0)).rgb), max(tex(uv - vec2(px.x * 2.0, 0.0)).rgb, tex(uv + vec2(0.0, px.y * 2.0)).rgb));
    col /= max(max(col.r, max(col.g, col.b)), 0.001);
    float mn = min(col.r, min(col.g, col.b));
    col = clamp((col - mn * 0.85) / max(1.0 - mn * 0.85, 0.001), 0.0, 1.0);
    if (max(col.r, max(col.g, col.b)) < 0.01) col = vec3(0.0, 1.0, 0.08);
    c = mix(tex(uv), vec4(col * line, line), smoothstep(0.0, 0.2, a));
  } else if (uEffect == 13) {    // Datamosh: Blöcke bleiben vom letzten Bild stehen und verschmieren
    vec2 bs = vec2(16.0) / uRes;
    vec2 bid = floor(uv / bs);
    float h = hash(bid + floor(uTime * 8.0));
    vec2 drift = (vec2(hash(bid + 3.1), hash(bid + 7.7)) - 0.5) * bs * 1.5;
    c = h < a * 0.75 ? texture(uPrev, uv + drift) : tex(uv);
  } else if (uEffect == 14) {    // Echo-Spuren: farbige Nachzieher
    vec4 pr = texture(uPrev, (uv - 0.5) * 0.995 + 0.5);
    pr = vec4(pr.gbr, pr.a) * (0.72 + 0.25 * a);
    c = max(tex(uv), pr);
  } else if (uEffect == 15) {    // Stutter: im Takt einfrieren (Anteil je Beat = Stärke)
    float ph = fract(uBeat * 2.0);
    c = ph > 1.0 - a * 0.85 ? texture(uPrev, uv) : tex(uv);
  } else if (uEffect == 16) {    // Zoom-Blur zur Mitte, auf dem Beat stärker
    vec2 d = (uv - 0.5) * (0.02 + 0.12 * a * (0.4 + 0.6 * uPulse));
    vec4 acc = vec4(0.0);
    for (int i = 0; i < 12; i++) acc += tex(uv - d * float(i) / 11.0);
    c = acc / 12.0;
  } else if (uEffect == 17) {    // Kacheln: 2×2 bis 5×5, jede zweite gespiegelt
    float n = 2.0 + floor(a * 3.99);
    vec2 g = uv * n;
    vec2 f = fract(g), id = floor(g);
    if (mod(id.x + floor(uBeat), 2.0) > 0.5) f.x = 1.0 - f.x;
    if (mod(id.y, 2.0) > 0.5) f.y = 1.0 - f.y;
    c = tex(f);
  } else if (uEffect == 18) {    // Neon-Kanten
    vec2 e = 1.0 / uRes;
    float l00 = dot(tex(uv + vec2(-e.x, -e.y)).rgb, vec3(0.333)), l10 = dot(tex(uv + vec2(0.0, -e.y)).rgb, vec3(0.333)), l20 = dot(tex(uv + vec2(e.x, -e.y)).rgb, vec3(0.333));
    float l01 = dot(tex(uv + vec2(-e.x, 0.0)).rgb, vec3(0.333)), l21 = dot(tex(uv + vec2(e.x, 0.0)).rgb, vec3(0.333));
    float l02 = dot(tex(uv + vec2(-e.x, e.y)).rgb, vec3(0.333)), l12 = dot(tex(uv + vec2(0.0, e.y)).rgb, vec3(0.333)), l22 = dot(tex(uv + vec2(e.x, e.y)).rgb, vec3(0.333));
    float gx = -l00 - 2.0 * l01 - l02 + l20 + 2.0 * l21 + l22, gy = -l00 - 2.0 * l10 - l20 + l02 + 2.0 * l12 + l22;
    float edge = clamp(length(vec2(gx, gy)) * 2.5, 0.0, 1.0);
    vec4 t = tex(uv);
    vec3 col = t.rgb / max(max(t.r, max(t.g, t.b)), 0.05);
    c = mix(t, vec4(col * edge, edge), a);
  } else if (uEffect == 19) {    // 1-Bit: schwarz-weiß mit Raster (Bayer 4×4)
    vec4 t = tex(uv);
    vec2 pp = mod(floor(uv * uRes / max(1.0, uRes.y / 360.0)), 4.0);
    float bay = mod(pp.x * 4.0 + pp.y * 11.0, 16.0) / 16.0;
    float lum = dot(t.rgb, vec3(0.299, 0.587, 0.114));
    float bit = step(bay, lum);
    c = mix(t, vec4(vec3(bit), max(t.a, bit)), a);
  } else if (uEffect == 20) {    // Shake: Bild ruckt auf dem Beat
    float b = floor(uBeat);
    vec2 o = (vec2(hash(vec2(b, 1.0)), hash(vec2(b, 2.0))) - 0.5) * 0.08 * a * uPulse;
    float rt = (hash(vec2(b, 3.0)) - 0.5) * 0.08 * a * uPulse;
    vec2 q = (uv - 0.5); q = mat2(cos(rt), -sin(rt), sin(rt), cos(rt)) * q;
    c = tex(q / (1.0 + 0.05 * a * uPulse) + 0.5 + o);
  } else if (uEffect == 21) {    // Polar-Warp: Bild wird zum Tunnel
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    vec2 q = vec2(atan(p.y, p.x) / (2.0 * PI) + 0.5, fract(0.25 / max(length(p), 0.01) + uTime * 0.2));
    c = mix(tex(uv), tex(q), a);
  } else if (uEffect == 22) {    // Liquid-Warp: wellige Verformung
    vec2 d = vec2(sin(uv.y * 18.0 + uTime * 3.0), cos(uv.x * 14.0 + uTime * 2.4)) * 0.035 * a * (0.6 + 0.6 * uPulse);
    c = tex(uv + d);
  } else if (uEffect == 23) {    // Beat-Slices: Streifen verrutschen im Takt
    float n = 6.0 + floor(hash(vec2(floor(uBeat), 9.0)) * 18.0);
    float sl = floor(uv.y * n);
    float sh = (hash(vec2(sl, floor(uBeat))) - 0.5) * 0.6 * a * (0.3 + 0.7 * uPulse);
    c = tex(vec2(fract(uv.x + sh), uv.y));
  } else if (uEffect == 24) {    // Farbrad: Farbton dreht sich, springt auf jedem Beat
    vec4 t = tex(uv);
    float ang = (floor(uBeat) * 0.37 + uTime * 0.1) * 6.2832 * a;
    const mat3 toY = mat3(0.299, 0.596, 0.211, 0.587, -0.274, -0.523, 0.114, -0.322, 0.312);
    const mat3 toR = mat3(1.0, 1.0, 1.0, 0.956, -0.272, -1.106, 0.621, -0.647, 1.703);
    vec3 yiq = toY * t.rgb;
    yiq.yz = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * yiq.yz;
    c = vec4(clamp(toR * yiq, 0.0, 1.0), t.a);
  } else if (uEffect == 25) {    // Posterize: wenige Farbstufen
    vec4 t = tex(uv);
    float lv = mix(8.0, 2.0, a);
    c = vec4(floor(t.rgb * lv + 0.5) / lv, t.a);
  } else if (uEffect == 26) {    // Beat-Invert: blitzt auf dem Beat ins Negativ
    vec4 t = tex(uv);
    c = mix(t, vec4(t.a - t.rgb, t.a), step(0.65, uPulse) * a);
  } else if (uEffect == 27) {    // Slit-Scan: neue Zeile oben, der Rest rutscht nach unten
    float band = 0.02 + 0.2 * (1.0 - a);
    c = uv.y > 1.0 - band ? tex(uv) : texture(uPrev, uv + vec2(0.0, (1.0 + 5.0 * a) / uRes.y));
  } else if (uEffect == 28) {    // Zoom-Feedback: Bild fällt endlos in sich hinein, Farbe dreht
    vec2 p = (uv - 0.5) * (0.96 - 0.04 * a * uPulse);
    p = mat2(cos(0.01), -sin(0.01), sin(0.01), cos(0.01)) * p;
    vec4 pr = texture(uPrev, p + 0.5);
    pr.rgb = mix(pr.rgb, pr.brg, 0.08);
    c = max(tex(uv), pr * (0.80 + 0.17 * a));
  } else if (uEffect == 29) {    // VHS: Farbbluten, Spurfehler, Rauschen
    float t = floor(uTime * 20.0);
    float trk = smoothstep(0.03, 0.0, abs(fract(uTime * 0.13) - uv.y));
    vec2 q = uv + vec2((hash(vec2(floor(uv.y * 200.0), t)) - 0.5) * 0.004 * a + trk * 0.03 * a, 0.0);
    float bl = 0.006 * a;
    vec4 y = tex(q);
    c = vec4(tex(q + vec2(bl, 0.0)).r, y.g, tex(q - vec2(bl, 0.0)).b, y.a);
    c.rgb = mix(c.rgb, vec3(dot(c.rgb, vec3(0.33))), 0.25 * a);
    c.rgb += (hash(uv * uRes + t) - 0.5) * 0.15 * a + trk * 0.3 * a;
  } else if (uEffect == 30) {    // Bloom: helle Stellen strahlen weich aus
    vec4 base = tex(uv), acc = vec4(0.0);
    for (int i = 0; i < 16; i++) {
      float an = float(i) * 2.39996, rr = sqrt(float(i) / 16.0) * (0.01 + 0.04 * a);
      vec4 s = tex(uv + vec2(cos(an), sin(an)) * rr * vec2(1.0 / aspect, 1.0));
      acc += max(s - 0.45, 0.0);
    }
    c = base + acc / 16.0 * (2.0 + 4.0 * a);
  } else if (uEffect == 31) {    // Vignette: dunkle Ränder, auf dem Beat enger
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float v = smoothstep(0.9 - 0.5 * a - 0.1 * uPulse, 0.2, length(p));
    c = tex(uv); c.rgb *= v;
  } else if (uEffect == 32) {    // Wellen-Verzerrung
    vec2 q = uv + vec2(sin(uv.y * 20.0 + uTime * 3.0), cos(uv.x * 16.0 + uTime * 2.5)) * 0.02 * a * (0.6 + 0.4 * uPulse);
    c = tex(mirrorRepeat(q));
  } else if (uEffect == 33) {    // Strudel: Mitte verdreht sich
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float r = length(p), ang = (1.0 - smoothstep(0.0, 0.6, r)) * a * 4.0 * sin(uTime * 0.5);
    p = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * p;
    c = tex(p / vec2(aspect, 1.0) + 0.5);
  } else if (uEffect == 34) {    // Fischauge: Wölbung nach außen, pumpt im Takt
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float r = length(p), k = a * (0.8 + 0.4 * uPulse);
    p *= mix(1.0, pow(r * 1.6, 1.0 + k) / max(r * 1.6, 1e-4), 1.0);
    c = tex(mirrorRepeat(p / vec2(aspect, 1.0) + 0.5));
  } else if (uEffect == 35) {    // LCD: RGB-Subpixel wie ein Bildschirm aus der Nähe
    float px = mix(2.0, 12.0, a);
    vec2 cell = floor(uv * uRes / px), f = fract(uv * uRes / px);
    vec4 t = tex((cell + 0.5) * px / uRes);
    float sub = floor(f.x * 3.0);
    vec3 m = sub < 0.5 ? vec3(1.0, 0.0, 0.0) : sub < 1.5 ? vec3(0.0, 1.0, 0.0) : vec3(0.0, 0.0, 1.0);
    c = vec4(t.rgb * m * 2.6 * step(0.12, f.y), t.a);
  } else if (uEffect == 36) {    // Halbton: Zeitungsdruck-Punkte
    float s = mix(4.0, 18.0, a);
    vec2 p = uv * uRes;
    p = mat2(0.707, -0.707, 0.707, 0.707) * p;
    vec2 cell = floor(p / s), f = fract(p / s) - 0.5;
    vec2 cc = mat2(0.707, 0.707, -0.707, 0.707) * ((cell + 0.5) * s) / uRes;
    vec4 t = tex(cc);
    float l = max(t.r, max(t.g, t.b));
    float dotm = smoothstep(0.05, 0.0, length(f) - sqrt(l) * 0.55);
    c = vec4(t.rgb / max(l, 0.01) * dotm, t.a * dotm);
  } else if (uEffect == 37) {    // Duoton: dunkel = Slot A, hell = Slot B
    vec4 t = tex(uv);
    float l = dot(t.rgb, vec3(0.299, 0.587, 0.114));
    c = vec4(mix(t.rgb, mix(uColA * 0.15, uColB, smoothstep(0.05, 0.8, l)), a), t.a);
  } else if (uEffect == 38) {    // Film: Korn, Flackern, Kratzer
    float t = floor(uTime * 24.0);
    c = tex(uv + vec2(0.0, (hash(vec2(t, 1.0)) - 0.5) * 0.004 * a));
    c.rgb *= 1.0 - 0.15 * a * hash(vec2(t, 2.0));
    c.rgb += (hash(uv * uRes + t) - 0.5) * 0.25 * a;
    float x = hash(vec2(t, 5.0));
    c.rgb *= 1.0 - 0.6 * a * step(0.7, hash(vec2(t, 6.0))) * smoothstep(0.002, 0.0, abs(uv.x - x));
    c.rgb = mix(c.rgb, c.rgb * vec3(1.05, 0.95, 0.8), a);
  } else if (uEffect == 39) {    // Relief: Prägung aus Kanten
    vec2 e = vec2(1.0) / uRes * (1.0 + 2.0 * a);
    vec4 t = tex(uv);
    vec3 d = tex(uv + e).rgb - tex(uv - e).rgb;
    c = vec4(mix(t.rgb, vec3(0.5) + d * 2.0, a), max(t.a, a));
  } else if (uEffect == 40) {    // Pixel-Sort: helle Stellen verlaufen nach unten
    vec4 t = tex(uv), best = t;
    float th = 0.75 - 0.5 * a;
    for (int i = 1; i < 24; i++) {
      vec4 s = tex(uv + vec2(0.0, float(i) * 0.006 * a));
      if (dot(s.rgb, vec3(0.33)) > th && dot(s.rgb, vec3(0.33)) > dot(best.rgb, vec3(0.33))) best = s;
    }
    c = best;
  } else if (uEffect == 41) {    // Linse: Farbsäume nach außen
    vec2 d = (uv - 0.5) * 0.04 * a * (0.6 + 0.4 * uPulse);
    vec4 g = tex(uv);
    c = vec4(tex(uv - d).r, g.g, tex(uv + d).b, g.a);
  } else if (uEffect == 42) {    // Luma-Key: Dunkles wird durchsichtig
    vec4 t = tex(uv);
    float l = max(t.r, max(t.g, t.b));
    float k = smoothstep(a * 0.6, a * 0.6 + 0.1, l);
    c = vec4(t.rgb * k, t.a * k);
  } else if (uEffect == 43) {    // Farb-Strobe: blitzt auf dem Beat in Slot-Farbe
    vec4 t = tex(uv);
    float f = step(0.6, uPulse) * a;
    vec3 col = mod(floor(uBeat), 2.0) < 1.0 ? uColA : uColB;
    c = vec4(mix(t.rgb, col, f), max(t.a, f));
  } else if (uEffect == 44) {    // Waben: Sechseck-Mosaik
    float s = mix(0.012, 0.06, a);
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0) / s;
    vec2 r = vec2(1.0, 1.732), h = r * 0.5;
    vec2 a1 = mod(p, r) - h, b1 = mod(p - h, r) - h;
    vec2 g = dot(a1, a1) < dot(b1, b1) ? a1 : b1;
    vec2 ctr = (p - g) * s / vec2(aspect, 1.0) + 0.5;
    vec4 t = tex(ctr);
    float edge = smoothstep(0.5, 0.44, max(abs(g.x) * 0.866 + abs(g.y) * 0.5, abs(g.y)));
    c = vec4(t.rgb * mix(1.0, edge, 0.6), t.a);
  } else if (uEffect == 45) {    // Dreh-Unschärfe um die Mitte
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    vec4 acc = vec4(0.0);
    float sp = 0.15 * a * (0.5 + 0.5 * uPulse);
    for (int i = 0; i < 12; i++) {
      float an = (float(i) / 11.0 - 0.5) * sp;
      acc += tex(mat2(cos(an), -sin(an), sin(an), cos(an)) * p / vec2(aspect, 1.0) + 0.5);
    }
    c = acc / 12.0;
  } else if (uEffect == 46) {    // Solarisation: helle Töne kippen um
    vec4 t = tex(uv);
    vec3 s = mix(t.rgb, abs(t.rgb * 2.0 - 1.0) * vec3(1.0, 0.8, 1.2), a);
    c = vec4(s, t.a);
  } else if (uEffect == 47) {    // Falschfarben: Helligkeit als Farbskala
    vec4 t = tex(uv);
    float l = dot(t.rgb, vec3(0.299, 0.587, 0.114));
    vec3 fc = hsv(0.7 - l * 0.75 + uTime * 0.02 * a, 0.9, smoothstep(0.0, 0.3, l) * 0.8 + 0.2 * step(0.02, l));
    c = vec4(mix(t.rgb, fc, a), t.a);
  } else if (uEffect == 48) {    // Beat-Flip: spiegelt auf jedem Beat
    float b = mod(floor(uBeat), 4.0);
    vec2 q = uv;
    if (a > 0.0 && (b == 1.0 || b == 3.0)) q.x = 1.0 - q.x;
    if (a > 0.5 && b >= 2.0) q.y = 1.0 - q.y;
    c = tex(q);
  } else if (uEffect == 49) {    // Turbulenz: Bild flimmert wie über heißem Asphalt
    vec2 n = vec2(hash(floor(uv * 40.0 + uTime * 3.0)), hash(floor(uv * 40.0 - uTime * 3.0) + 7.0)) - 0.5;
    vec2 m = vec2(sin(uv.y * 40.0 + uTime * 6.0), cos(uv.x * 35.0 + uTime * 5.0));
    c = tex(mirrorRepeat(uv + (m * 0.7 + n * 0.6) * 0.012 * a));
  } else {                       // Farbüberlagerung
    vec4 t = tex(uv);
    vec3 col = uColorMode == 2 ? mix(uColA, uColB, uv.y)
             : uColorMode == 3 ? hsv(fract(uv.x * 0.6 + uTime * 0.08), 0.85, 1.0)
             : uColA;
    float lum = dot(t.rgb, vec3(0.299, 0.587, 0.114));
    // Farbe übernimmt die Helligkeit des Bildes, damit Details erhalten bleiben
    c = vec4(mix(t.rgb, col * mix(t.a, lum * 1.4, 0.5), a), t.a);
  }
  outColor = c;
}`;

/** Ebene auf die Komposition legen (Deckkraft; Mischmodus macht gl.blendFunc). */
export const COMPOSITE_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTex;
uniform float uOpacity;
uniform vec4 uRegion;  // Ausschnitt (x, y, Breite, Höhe) in 0–1; (0,0,1,1) = ganzes Bild
void main(){ outColor = texture(uTex, uRegion.xy + vUv * uRegion.zw) * uOpacity; }`;

/** Letzter Schritt: Überblendung alt → neu, Master und Strobe. */
export const FINAL_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uFrom;
uniform sampler2D uTo;
uniform float uMix;
uniform float uGain;
uniform int   uDip;   // 1 = über Schwarz
uniform float uWhite; // Strobe White: Anteil Weiß
void main(){
  vec3 a = texture(uFrom, vUv).rgb, b = texture(uTo, vUv).rgb;
  vec3 c = uDip == 1
    ? (uMix < 0.5 ? a * (1.0 - uMix * 2.0) : b * (uMix * 2.0 - 1.0))
    : mix(a, b, uMix);
  outColor = vec4(mix(c * uGain, vec3(1.0), uWhite), 1.0);
}`;

/** Grafik (Logo, Bild) mit Lage, Größe und Drehung. Textur ist vormultipliziert. */
export const IMAGE_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uImg;
uniform vec2  uRes;
uniform float uImgAspect;
uniform vec2  uPos;
uniform float uScale;
uniform float uRot;
uniform float uOpacity;  // Deckkraft (Cues im SHOW-Ablauf), sonst 1
uniform int   uKeyMode;  // 0 aus, 1 Weiß entfernen, 2 Schwarz entfernen
uniform float uKeyTol;
// Kamera: spiegeln und Silhouette (Person als Umriss, Hintergrund durchsichtig)
uniform int   uMirror;
// 0 normal, 1 Silhouette, 2 Umriss, 3 Dot-Matrix, 4 ASCII, 5 Raster, 6 Wärmebild, 7 Duoton, 8 Maske positiv, 9 Maske negativ
uniform int   uLook;
uniform float uSilTol;
uniform sampler2D uRef;  // gemerkter Hintergrund (Einheit 1)
uniform int   uHasRef;
uniform vec3  uFig;      // Farbe der Silhouette bzw. des Rasters
uniform vec3  uFig2;     // zweite Farbe (Duoton hell)
uniform float uCells;    // Zellen über die Bildhöhe
uniform int   uOnlyFig;  // stilisierte Looks nur auf der Person
uniform vec2  uTexel;    // 1 / Größe des Kamerabilds

float camLum(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
// Gehört dieser Bildpunkt zur Person? Mit gemerktem Hintergrund: Unterschied, sonst Gegenlicht (dunkel vor hell)
float camFig(vec2 tc, vec3 col){
  if (uHasRef == 1) {
    float d = length(col - texture(uRef, tc).rgb) / 1.732;
    return smoothstep(uSilTol * 0.5, uSilTol * 0.5 + 0.06, d);
  }
  return 1.0 - smoothstep(uSilTol, uSilTol + 0.08, camLum(col));
}
float boxI(vec2 f, vec2 c, vec2 h){ vec2 d = abs(f - c) - h; return step(max(d.x, d.y), 0.0); }
float glyphI(float l, vec2 f){
  if (l < 0.08) return 0.0;
  if (l < 0.25) return boxI(f, vec2(0.5, 0.2), vec2(0.09));
  if (l < 0.45) return max(boxI(f, vec2(0.5, 0.25), vec2(0.09)), boxI(f, vec2(0.5, 0.7), vec2(0.09)));
  if (l < 0.65) return max(boxI(f, vec2(0.5), vec2(0.07, 0.32)), boxI(f, vec2(0.5), vec2(0.32, 0.07)));
  if (l < 0.85) return max(max(boxI(f, vec2(0.35, 0.5), vec2(0.06, 0.38)), boxI(f, vec2(0.65, 0.5), vec2(0.06, 0.38))),
                           max(boxI(f, vec2(0.5, 0.35), vec2(0.38, 0.06)), boxI(f, vec2(0.5, 0.65), vec2(0.38, 0.06))));
  float r = length(f - 0.5);
  return max(step(abs(r - 0.33), 0.07), step(r, 0.12));
}
vec2 camTc(vec2 q){ return vec2(clamp(q.x, 0.0, 1.0), 1.0 - clamp(q.y, 0.0, 1.0)); }
void main(){
  float aspect = uRes.x / uRes.y;
  vec2 p = (vUv - 0.5) * vec2(aspect, 1.0) - uPos;
  float cs = cos(-uRot), sn = sin(-uRot);
  p = mat2(cs, sn, -sn, cs) * p;
  vec2 q = p / (max(uScale, 0.001) * vec2(uImgAspect, 1.0)) + 0.5;
  // Textur immer lesen (gleichmäßiger Ablauf: sonst wählt die Grafikkarte an der Bildkante die falsche
  // Mipmap-Stufe, und es entsteht ein feiner Rahmen). Außerhalb der Bildfläche per Maske ausblenden.
  if (uMirror == 1) q.x = 1.0 - q.x;
  vec2 tc = vec2(clamp(q.x, 0.0, 1.0), 1.0 - clamp(q.y, 0.0, 1.0));
  vec4 c = texture(uImg, tc);
  c.rgb = min(c.rgb, vec3(c.a));   // vormultipliziert: keine Farbe ohne Deckkraft
  c *= step(0.0, q.x) * step(q.x, 1.0) * step(0.0, q.y) * step(q.y, 1.0);
  if (uKeyMode != 0 && c.a > 0.0) {
    vec3 u = c.rgb / c.a;                                   // Farbe ohne Vormultiplikation
    float d = uKeyMode == 1 ? 1.0 - min(u.r, min(u.g, u.b)) // Abstand zu Weiß
                            : max(u.r, max(u.g, u.b));      // Abstand zu Schwarz
    float t = max(uKeyTol, 0.01);
    c *= smoothstep(t * 0.4, t, d);                         // weiche Kante, kein harter Rand
  }
  if (uLook >= 1) {
    float inside = step(0.0, q.x) * step(q.x, 1.0) * step(0.0, q.y) * step(q.y, 1.0);
    float fig = camFig(tc, c.rgb) * inside;
    if (uLook == 1) {                      // Silhouette
      c = vec4(uFig * fig, fig);
    } else if (uLook == 8) {               // Maske positiv: Loch außerhalb der Person (Mischen: Ziel × (1 − a))
      c = vec4(0.0, 0.0, 0.0, 1.0 - fig);
    } else if (uLook == 9) {               // Maske negativ: Loch in der Person
      c = vec4(0.0, 0.0, 0.0, fig);
    } else if (uLook == 2) {               // Umriss: Kanten der Personenmaske (bzw. des Bildes)
      vec2 e = uTexel * 2.0;
      float m = 0.0;
      for (int k = 0; k < 8; k++) {
        float an = float(k) * 0.7854;
        vec2 o = vec2(cos(an), sin(an)) * e;
        vec2 t2 = tc + o;
        m += abs(camFig(t2, texture(uImg, t2).rgb) - camFig(tc, c.rgb));
      }
      float edge = smoothstep(0.4, 1.6, m) * inside;
      vec3 col = uFig == vec3(0.0) ? vec3(1.0) : uFig;
      c = vec4(col * edge, edge);
    } else {
      // Raster-Looks: Zelle in Bildkoordinaten, Farbe aus der Zellmitte
      float aspectI = uImgAspect;
      vec2 g = vec2(max(4.0, floor(uCells * aspectI)), uCells);
      vec2 qq = vec2(uMirror == 1 ? 1.0 - q.x : q.x, q.y);
      vec2 id = floor(qq * g), f = fract(qq * g);
      vec2 qc = (id + 0.5) / g;
      vec2 tcc = camTc(vec2(uMirror == 1 ? 1.0 - qc.x : qc.x, qc.y));
      vec3 cc = texture(uImg, tcc).rgb;
      float l = camLum(cc);
      float figc = camFig(tcc, cc);
      vec4 o;
      if (uLook == 3) {                    // Dot-Matrix
        float r = length(f - 0.5);
        float dotm = smoothstep(0.48 * sqrt(l) + 0.04, 0.48 * sqrt(l) - 0.02, r);
        vec3 col = cc / max(max(cc.r, max(cc.g, cc.b)), 0.001);
        o = vec4(col * dotm, dotm);
      } else if (uLook == 4) {             // ASCII
        float gl = glyphI(clamp(l * 1.2, 0.0, 1.0), vec2(f.x, 1.0 - f.y));
        vec3 col = cc / max(max(cc.r, max(cc.g, cc.b)), 0.001);
        o = vec4(col * gl, gl);
      } else if (uLook == 5) {             // Raster (Halbton, 45° gedreht)
        vec2 rq = mat2(0.7071, -0.7071, 0.7071, 0.7071) * (qq * g);
        vec2 rf = fract(rq) - 0.5;
        vec3 sc = texture(uImg, tc).rgb;
        float dk = 1.0 - camLum(sc);
        float dotm = smoothstep(0.55 * sqrt(dk) + 0.03, 0.55 * sqrt(dk) - 0.03, length(rf));
        vec3 col = uFig == vec3(0.0) ? vec3(1.0) : uFig;
        o = vec4(col * dotm, dotm);
        figc = fig;
      } else if (uLook == 6) {             // Wärmebild
        float t = camLum(c.rgb);
        vec3 th = t < 0.25 ? mix(vec3(0.0, 0.0, 0.2), vec3(0.4, 0.0, 0.7), t * 4.0)
                : t < 0.5  ? mix(vec3(0.4, 0.0, 0.7), vec3(0.95, 0.1, 0.1), (t - 0.25) * 4.0)
                : t < 0.75 ? mix(vec3(0.95, 0.1, 0.1), vec3(1.0, 0.8, 0.0), (t - 0.5) * 4.0)
                           : mix(vec3(1.0, 0.8, 0.0), vec3(1.0), (t - 0.75) * 4.0);
        o = vec4(th, 1.0) * inside;
        figc = fig;
      } else {                             // Duoton
        float t = smoothstep(0.1, 0.9, camLum(c.rgb));
        o = vec4(mix(uFig, uFig2, t), 1.0) * inside;
        figc = fig;
      }
      c = (uOnlyFig == 1 ? o * figc : o) * inside;
    }
  }
  outColor = c * uOpacity;
}`;

/** Projektionsmapping: eine Leinwand perspektivisch aus dem Gesamtbild zeichnen. */
export const WARP_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTex;
uniform mat3 uHinv;   // Bildpunkt (0–1, oben links) → Leinwand-Koordinate (0–1)
uniform vec4 uSrc;    // Ausschnitt des Gesamtbilds (x, y, Breite, Höhe), oben links = 0/0
void main(){
  vec2 p = vec2(vUv.x, 1.0 - vUv.y);
  vec3 h = uHinv * vec3(p, 1.0);
  vec2 uv = h.xy / (abs(h.z) < 1e-6 ? 1e-6 : h.z);
  vec2 fw = fwidth(uv) + 1e-5;
  // weiche Kante (ein Pixel), damit die Ränder nicht treppig werden
  float m = smoothstep(0.0, fw.x, uv.x) * smoothstep(0.0, fw.x, 1.0 - uv.x) * smoothstep(0.0, fw.y, uv.y) * smoothstep(0.0, fw.y, 1.0 - uv.y);
  m *= step(0.0, h.z);
  vec2 s = uSrc.xy + clamp(uv, 0.0, 1.0) * uSrc.zw;
  outColor = texture(uTex, vec2(s.x, 1.0 - s.y)) * m;
}`;

/** Einfarbige Fläche (für Strobe und Blinder über den Cues). */
export const SOLID_FRAG = `#version 300 es
precision highp float;
out vec4 outColor;
uniform vec4 uColor;
void main(){ outColor = uColor; }`;

/** Raster-Verzerrung: Dreiecksnetz, Ecken im Bild des Beamers (oben links = 0/0), Inhalt per u/v. */
export const MESH_VERT = `#version 300 es
in vec2 aPos;
in vec2 aUv;
out vec2 vUv;
void main(){
  vUv = aUv;
  gl_Position = vec4(aPos.x * 2.0 - 1.0, 1.0 - aPos.y * 2.0, 0.0, 1.0);
}`;
export const MESH_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTex;
uniform vec4 uSrc;
void main(){
  vec2 s = uSrc.xy + clamp(vUv, 0.0, 1.0) * uSrc.zw;
  outColor = texture(uTex, vec2(s.x, 1.0 - s.y));
}`;

/** Maske: Vieleck schwärzen (umgekehrt: außen schwärzen), mit weicher Kante. */
export const MASK_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform vec2 uPts[32];
uniform int uN;
uniform int uInv;
uniform float uFeather;  // Pixel
uniform vec2 uRes;
float segDist(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-9), 0.0, 1.0); return length(pa - ba * h); }
void main(){
  vec2 p = vec2(vUv.x, 1.0 - vUv.y) * uRes;
  bool inside = false;
  float d = 1e9;
  for (int i = 0; i < 32; i++) {
    if (i >= uN) break;
    int j = i == 0 ? uN - 1 : i - 1;
    vec2 a = uPts[i] * uRes, b = uPts[j] * uRes;
    if ((a.y > p.y) != (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    d = min(d, segDist(p, a, b));
  }
  // Abdeckung: 1 = schwarz. Innen schwärzen (bzw. außen bei „umkehren“), weiche Kante nach innen
  float cover = inside ? 1.0 : 0.0;
  if (uFeather > 0.5) cover = inside ? smoothstep(0.0, uFeather, d) : 0.0;
  if (uInv == 1) cover = inside ? 1.0 - cover : 1.0;
  outColor = vec4(0.0, 0.0, 0.0, cover);
}`;

/** DJ-Wellenform (rekordbox-Detail, 4 Byte je Frame, 150 Frames/s) als Textur 4096 breit; Abspielkopf bei uHead. */
export const DJWAVE_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uData;
uniform vec2 uRes;
uniform float uN;       // Frames
uniform float uCenter;  // Frame am Abspielkopf
uniform float uSpan;    // Frames über die ganze Breite
uniform float uHead;    // Lage des Abspielkopfs (0–1)
uniform int uStyle;     // 0 Farbe (Höhe, R, G, B), 1 drei Bänder
uniform float uBeatLen; // Frames je Beat (0 = keine Taktstriche)
uniform float uBeatOff; // Frame eines Beats (Raster)
out vec4 outColor;
vec4 at(float f) {
  f = floor(f);
  if (f < 0.0 || f >= uN) return vec4(0.0);
  return texelFetch(uData, ivec2(int(mod(f, 4096.0)), int(f / 4096.0)), 0);
}
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float step = uSpan / uRes.x;
  float f0 = uCenter + (uv.x - uHead) * uSpan;
  vec4 m = vec4(0.0);
  for (int k = 0; k < 4; k++) m = max(m, at(f0 + step * float(k) * 0.25));
  float y = abs(uv.y - 0.5) * 2.0;
  vec3 col = vec3(0.0); float a = 0.0;
  if (uStyle == 1) {
    if (y < m.r) { col = vec3(0.125, 0.325, 0.85); a = 1.0; }
    if (y < m.g) { col = vec3(0.95, 0.667, 0.235); a = 1.0; }
    if (y < m.b) { col = vec3(1.0); a = 1.0; }
  } else if (y < m.r) { col = m.gba; a = 1.0; }
  if (uv.x < uHead) col *= 0.5;
  // Taktstriche
  if (uBeatLen > 1.0) {
    float b = (f0 - uBeatOff) / uBeatLen;
    float d = abs(fract(b + 0.5) - 0.5) * uBeatLen / step;
    if (d < 0.6 && y > 0.9) { col = vec3(0.8); a = 1.0; }
  }
  // Abspielkopf
  if (abs(uv.x - uHead) * uRes.x < 1.5) { col = vec3(1.0, 0.25, 0.25); a = 1.0; }
  outColor = vec4(col * a, a);
}`;
