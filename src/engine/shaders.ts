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
uniform float uKey;       // 1 = Helligkeit bestimmt die Deckkraft (Overlay-Ebenen)
uniform int   uGen;
uniform int   uColorMode; // 0 original, 1 Slot, 2 Verlauf A→B, 3 Regenbogen
uniform vec3  uColA;
uniform vec3  uColB;
uniform float uBands[8];

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

  float key = mix(1.0, smoothstep(0.0, 0.12, max(c.r, max(c.g, c.b))), uKey);
  outColor = vec4(c * key, key);  // vormultipliziert; Deckkraft kommt beim Mischen
}`;

// ---- Effekt-Stapel ------------------------------------------------------------------
/** Reihenfolge = uEffect-Nummer. Muss zu POST_EFFECTS in src/core/effects.ts passen. */
export const POST_IDS = ["kaleidoscope", "mirror", "rgb-shift", "glitch", "crt", "pixelate", "feedback", "glow", "strobe-zoom", "invert"] as const;

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
const float PI = 3.14159265;

float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec4 tex(vec2 uv){ return texture(uTex, uv); }
vec2 mirrorRepeat(vec2 x){ return 1.0 - abs(1.0 - mod(x, 2.0)); }

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
  } else {                       // Invertieren (vormultipliziert)
    vec4 t = tex(uv);
    c = mix(t, vec4(t.a - t.rgb, t.a), a);
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
void main(){
  vec3 c = mix(texture(uFrom, vUv).rgb, texture(uTo, vUv).rgb, uMix);
  outColor = vec4(c * uGain, 1.0);
}`;
