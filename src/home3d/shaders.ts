export const vertexShader = /* glsl */ `
uniform float uTime;
uniform float uProgress;
uniform float uSize;
uniform float uPixelRatio;
uniform float uRef;
uniform float uIntensity;
uniform int uFrom;
uniform int uTo;
uniform mat4 uSeg[5];
uniform vec3 uTip;
uniform float uWeld;
uniform vec2 uPointer;
uniform float uRepel;
uniform float uAspect;
uniform float uPulse;
attribute vec3 aEdgeA;
attribute vec3 aEdgeB;
attribute vec3 aRobot;
attribute vec3 aFin;
attribute vec3 aOil;
attribute vec3 aEnt;
attribute vec4 aRand;
attribute vec4 aAnim;
attribute vec4 aWarm;
varying vec3 vColor;
varying float vAlpha;

vec3 rotY(vec3 p, float a) {
  float c = cos(a), s = sin(a);
  return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
}

vec3 formPos(int k, out float warm, out float fade) {
  fade = 1.0;
  warm = 0.0;
  if (k == 0) {
    vec3 p = mix(aEdgeA, aEdgeB, fract(aRand.x + uTime * (0.05 + 0.12 * aRand.y)));
    warm = step(0.975, aRand.w);
    return rotY(p, uTime * 0.07);
  }
  if (k == 1) {
    warm = aWarm.x;
    int seg = int(aAnim.x + 0.5);
    if (seg <= 1) return aRobot;
    if (seg == 7) {
      vec3 v = normalize(vec3(aRand.x - 0.5, aRand.y * 0.9 + 0.15, aRand.z - 0.5)) * (1.0 + 2.2 * aRand.w);
      float age = fract(uTime * 1.7 + aRand.x * 7.0);
      fade = uWeld * (1.0 - age) * (1.0 - age);
      vec3 p = uTip + v * age * 0.8;
      p.y -= 2.2 * age * age;
      return p;
    }
    return (uSeg[seg - 2] * vec4(aRobot, 1.0)).xyz;
  }
  if (k == 2) {
    vec3 p = aFin;
    warm = aWarm.y;
    if (aAnim.y > 0.5) {
      p.x = mod(p.x + uTime * (1.0 + aRand.y) + 5.0, 10.0) - 5.0;
      p.y += 0.35 * sin(p.x * 0.7 + p.z * 1.3);
      fade = smoothstep(5.0, 3.6, abs(p.x));
    }
    return p;
  }
  if (k == 3) {
    vec3 p = aOil;
    warm = aWarm.z;
    if (aAnim.z > 0.5) {
      p.y = mod(p.y + 3.25 + uTime * (0.8 + 0.7 * aRand.y), 3.7) - 3.25;
      fade = 1.0 - smoothstep(0.15, 0.45, p.y);
    }
    return p;
  }
  vec3 p = aEnt;
  warm = aWarm.w;
  if (aAnim.w > 0.5) {
    float r = length(p.xz);
    vec2 d = p.xz / max(r, 1e-3);
    float r2 = 0.4 + mod(r - 0.4 + uTime * 1.0, 4.8);
    p.xz = d * r2;
    fade = smoothstep(5.2, 2.5, r2);
  }
  return p;
}

void main() {
  float wA, wB, fA, fB;
  vec3 a = formPos(uFrom, wA, fA);
  vec3 b = formPos(uTo, wB, fB);
  float delay = aRand.z * 0.28 + 0.14 * clamp((b.y + 4.0) / 9.0, 0.0, 1.0);
  float p = smoothstep(delay, delay + 0.55, uProgress);
  float burst = sin(3.14159 * p);
  vec3 n = vec3(
    sin(aRand.x * 43.1 + uTime * 0.7),
    sin(aRand.y * 71.7 + uTime * 0.6),
    sin(aRand.z * 29.3 + uTime * 0.8)
  );
  vec3 pos = mix(a, b, p);
  pos += n * burst * 0.85;
  pos = rotY(pos, burst * 0.9 * (aRand.w - 0.5));
  pos += n * 0.012;
  pos += normalize(pos + vec3(0.001)) * uPulse * (0.35 + 0.65 * aRand.z) * (1.0 - 0.5 * p * (1.0 - p));
  float warm = mix(wA, wB, p);
  float fade = mix(fA, fB, p);
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  vec4 clip = projectionMatrix * mv;
  vec2 dd = (clip.xy / clip.w - uPointer) * vec2(uAspect, 1.0);
  float near = exp(-dot(dd, dd) / 0.02);
  mv.xy += normalize(dd + 1e-5) * uRepel * near * (-mv.z) * 0.045;
  gl_Position = projectionMatrix * mv;
  float sparkle = step(0.965, aRand.w);
  float size = uSize * (0.55 + 0.75 * aRand.w) * (1.0 + sparkle * 1.4);
  gl_PointSize = clamp(size * uPixelRatio * (uRef / -mv.z), 0.0, 48.0);
  vec3 blue = mix(vec3(0.17, 0.45, 1.0), vec3(0.6, 0.84, 1.0), aRand.y * aRand.y);
  vec3 amber = vec3(1.0, 0.6, 0.26);
  vec3 col = mix(blue, amber, warm);
  float robotW = (uFrom == 1 ? 1.0 - p : 0.0) + (uTo == 1 ? p : 0.0);
  float scanY = mod(uTime * 1.3, 9.0) - 4.0;
  float scan = exp(-pow((pos.y - scanY) / 0.14, 2.0)) * robotW;
  col += vec3(0.45, 0.75, 1.0) * scan * 0.7;
  col += vec3(0.35, 0.6, 1.0) * near * uRepel * 0.8;
  vColor = col;
  vAlpha = (0.3 + 0.45 * aRand.x) * fade * uIntensity * (1.0 + burst * 0.25 + sparkle * 0.6);
}
`;

export const fragmentShader = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  a *= a;
  gl_FragColor = vec4(vColor, a * vAlpha);
}
`;
