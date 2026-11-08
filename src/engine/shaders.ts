// GLSL ES 3.00. Ein Programm, Generator per Nummer gewählt (uGen).
export const GEN_IDS = ["bar-spectrum", "radial-eq", "oscilloscope", "pulse-rings", "tunnel", "synth-grid", "starfield", "plasma",
  "lissajous", "vu-meter", "dot-matrix", "plexus", "hypercube", "vector-gobos", "bokeh", "burst", "lightning", "ripples", "fire", "liquid-light", "mirror-ball", "uv-glow", "laser-sheet", "laser-fans", "moire", "flower", "co2-jet"] as const;
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
  float t = fract(uBeat * 0.5);
  float acc = 0.0;
  for (int i = 0; i < 4; i++){
    float ph = fract(t + float(i) * 0.25);
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

// 29 Laser-Fläche: waagerechte Laserebene über dem Publikum, wie eine Nebeldecke
vec3 laserSheet(vec2 uv){
  vec2 p = cp(uv);
  float hor = 0.08;
  if (p.y < hor) return vec3(0.0);
  float depth = 0.12 / (p.y - hor + 0.002);
  vec2 w = vec2(p.x * depth, depth - uTime * 1.2);
  float fog = fbm(w * 0.9);
  float wave = smoothstep(0.35, 0.8, fog) * exp(-depth * 0.08);
  float edge = smoothstep(0.012, 0.0, p.y - hor) * 1.5;
  return vec3(0.15, 1.0, 0.3) * (wave * (0.7 + 0.5 * uPulse) + edge);
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

void main(){
  vec2 uv = vUv;
  vec3 c;
  if (uGen == 0) c = barSpectrum(uv);
  else if (uGen == 1) c = radialEq(uv);
  else if (uGen == 2) c = oscilloscope(uv);
  else if (uGen == 3) c = pulseRings(uv);
  else if (uGen == 4) c = tunnel(uv);
  else if (uGen == 5) c = synthGrid(uv);
  else if (uGen == 6) c = starfield(uv);
  else if (uGen == 7) c = plasma(uv);
  else if (uGen == 8) c = lissajous(uv);
  else if (uGen == 9) c = vuMeter(uv);
  else if (uGen == 10) c = dotMatrix(uv);
  else if (uGen == 11) c = plexus(uv);
  else if (uGen == 12) c = hypercube(uv);
  else if (uGen == 13) c = vectorGobos(uv);
  else if (uGen == 14) c = bokeh(uv);
  else if (uGen == 15) c = burst(uv);
  else if (uGen == 16) c = lightning(uv);
  else if (uGen == 17) c = ripples(uv);
  else if (uGen == 18) c = fire(uv);
  else if (uGen == 19) c = liquidLight(uv);
  else if (uGen == 20) c = mirrorBall(uv);
  else if (uGen == 21) c = uvGlow(uv);
  else if (uGen == 22) c = laserSheet(uv);
  else if (uGen == 23) c = laserFans(uv);
  else if (uGen == 24) c = moire(uv);
  else if (uGen == 25) c = flower(uv);
  else if (uGen == 26) c = co2Jet(uv);
  else c = vec3(0.0);

  float lum = clamp(dot(c, vec3(0.299, 0.587, 0.114)) * 1.15, 0.0, 1.0);
  if (uColorMode == 1) c = uColA * lum * 1.25;
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
export const POST_IDS = ["kaleidoscope", "mirror", "rgb-shift", "glitch", "crt", "pixelate", "feedback", "glow", "strobe-zoom", "invert", "tint", "ascii"] as const;

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
void main(){ outColor = texture(uTex, vUv) * uOpacity; }`;

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
void main(){
  float aspect = uRes.x / uRes.y;
  vec2 p = (vUv - 0.5) * vec2(aspect, 1.0) - uPos;
  float cs = cos(-uRot), sn = sin(-uRot);
  p = mat2(cs, sn, -sn, cs) * p;
  vec2 q = p / (max(uScale, 0.001) * vec2(uImgAspect, 1.0)) + 0.5;
  if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) { outColor = vec4(0.0); return; }
  vec4 c = texture(uImg, vec2(q.x, 1.0 - q.y));
  if (uKeyMode != 0 && c.a > 0.0) {
    vec3 u = c.rgb / c.a;                                   // Farbe ohne Vormultiplikation
    float d = uKeyMode == 1 ? 1.0 - min(u.r, min(u.g, u.b)) // Abstand zu Weiß
                            : max(u.r, max(u.g, u.b));      // Abstand zu Schwarz
    float t = max(uKeyTol, 0.01);
    c *= smoothstep(t * 0.4, t, d);                         // weiche Kante, kein harter Rand
  }
  outColor = c * uOpacity;
}`;
