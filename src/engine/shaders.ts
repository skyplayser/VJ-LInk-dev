// GLSL ES 3.00. Ein Programm, Generator per Nummer gewählt (uGen).
export const GEN_IDS = ["bar-spectrum", "radial-eq", "oscilloscope", "pulse-rings", "tunnel", "synth-grid", "starfield", "plasma"] as const;
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
uniform float uOpacity;
uniform float uKey;       // 1 = Helligkeit bestimmt die Deckkraft (Overlay-Ebenen)
uniform int   uGen;
uniform int   uColorMode; // 0 original, 1 Slot, 2 Verlauf A→B, 3 Regenbogen
uniform vec3  uColA;
uniform vec3  uColB;
uniform float uBands[8];
uniform vec3  uFx;        // x Helligkeit, y Spiegeln, z Pixeln

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

vec3 oscilloscope(vec2 uv){
  float x = uv.x;
  float y = 0.5 + 0.18 * (sin(x * 9.0 + uTime * 3.0) * uBands[0] + sin(x * 23.0 - uTime * 5.0) * uBands[3]
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

void main(){
  vec2 uv = vUv;
  // Eingebaute Mini-Effekte der Ebene: Spiegeln und Pixeln (Platzhalter für den späteren Effekt-Stapel)
  if (uFx.y > 0.01) uv.x = mix(vUv.x, abs(vUv.x - 0.5) * 2.0, smoothstep(0.0, 0.5, uFx.y));
  if (uFx.z > 0.01) { float cells = mix(240.0, 24.0, uFx.z); uv = (floor(uv * cells) + 0.5) / cells; }

  vec3 c;
  if (uGen == 0) c = barSpectrum(uv);
  else if (uGen == 1) c = radialEq(uv);
  else if (uGen == 2) c = oscilloscope(uv);
  else if (uGen == 3) c = pulseRings(uv);
  else if (uGen == 4) c = tunnel(uv);
  else if (uGen == 5) c = synthGrid(uv);
  else if (uGen == 6) c = starfield(uv);
  else c = plasma(uv);

  float lum = clamp(dot(c, vec3(0.299, 0.587, 0.114)) * 1.15, 0.0, 1.0);
  if (uColorMode == 1) c = uColA * lum * 1.25;
  else if (uColorMode == 2) c = mix(uColA, uColB, clamp(vUv.y * 0.6 + lum * 0.5, 0.0, 1.0)) * (0.15 + lum * 1.1);
  else if (uColorMode == 3) c = hsv(fract(vUv.x * 0.5 + lum * 0.4 + uTime * 0.08), 0.85, lum * 1.2);

  c *= 1.0 + uFx.x;
  float key = mix(1.0, smoothstep(0.0, 0.12, max(c.r, max(c.g, c.b))), uKey);
  float a = uOpacity * key;
  outColor = vec4(c * a, a);  // vormultipliziert
}`;
