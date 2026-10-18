/* eslint-disable react/no-unknown-property,react-hooks/immutability */
import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  ShaderMaterial,
  Sphere,
  Vector3,
} from "three";
import { buildBeacon, lattice } from "../home3d/forms";

export type AccentVariant = "core" | "beacon";
export type OrbitState = { az: number; el: number; dragging: boolean; releasedAt: number };

const vertexShader = /* glsl */ `
uniform float uTime;
uniform float uSize;
uniform float uPixelRatio;
uniform float uIntensity;
uniform int uVariant;
attribute vec3 aA;
attribute vec3 aB;
attribute vec4 aRand;
attribute float aType;
attribute float aWarm;
varying vec3 vColor;
varying float vAlpha;
vec3 rotY(vec3 p, float a) {
  float c = cos(a), s = sin(a);
  return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
}
void main() {
  vec3 p = aA;
  float fade = 1.0;
  float warm = aWarm;
  if (uVariant == 0) {
    p = rotY(mix(aA, aB, fract(aRand.x + uTime * (0.05 + 0.12 * aRand.y))), uTime * 0.06);
    warm = step(0.975, aRand.w);
  } else if (aType > 2.5) {
    float k = floor(aRand.x * 4.0);
    float r = mod(uTime * 0.75 + k * 1.1, 4.4);
    p = vec3(0.0, 2.25, 0.0) + aA * (0.45 + r);
    fade = smoothstep(4.4, 1.0, r) * smoothstep(0.0, 0.3, r);
  } else if (aType > 1.5) {
    p.y = mod(aA.y + 2.6 + uTime * (0.9 + aRand.y), 4.8) - 2.6;
    fade = 1.0 - smoothstep(1.8, 2.2, p.y);
  } else if (aType > 0.5) {
    float r = length(aA.xz);
    vec2 d = aA.xz / max(r, 1e-3);
    float r2 = 0.3 + mod(r - 0.3 + uTime * 0.6, 4.5);
    p.xz = d * r2;
    fade = smoothstep(4.8, 2.0, r2);
  }
  p += 0.012 * vec3(sin(aRand.x * 40.0 + uTime), sin(aRand.y * 50.0 + uTime), sin(aRand.z * 30.0 + uTime));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float sparkle = step(0.965, aRand.w);
  gl_PointSize = clamp(uSize * (0.55 + 0.75 * aRand.w) * (1.0 + sparkle * 1.4) * uPixelRatio * (11.0 / -mv.z), 0.0, 40.0);
  vec3 blue = mix(vec3(0.17, 0.45, 1.0), vec3(0.6, 0.84, 1.0), aRand.y * aRand.y);
  vColor = mix(blue, vec3(1.0, 0.6, 0.26), warm);
  vAlpha = (0.3 + 0.45 * aRand.x) * fade * uIntensity * (1.0 + sparkle * 0.6);
}
`;
const fragmentShader = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(vColor, a * a * vAlpha);
}
`;

const hash = (i: number) => {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

function Points({ variant, count, orbit }: { variant: AccentVariant; count: number; orbit: OrbitState }) {
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    if (variant === "core") {
      const a = new Float32Array(count * 3),
        b = new Float32Array(count * 3),
        rand = new Float32Array(count * 4);
      lattice(count, a, b);
      for (let i = 0; i < rand.length; i++) rand[i] = hash(i);
      g.setAttribute("aA", new BufferAttribute(a, 3));
      g.setAttribute("aB", new BufferAttribute(b, 3));
      g.setAttribute("aRand", new BufferAttribute(rand, 4));
      g.setAttribute("aType", new BufferAttribute(new Float32Array(count), 1));
      g.setAttribute("aWarm", new BufferAttribute(new Float32Array(count), 1));
      g.setAttribute("position", new BufferAttribute(a, 3));
    } else {
      const s = buildBeacon(count);
      g.setAttribute("aA", new BufferAttribute(s.a, 3));
      g.setAttribute("aB", new BufferAttribute(s.a, 3));
      g.setAttribute("aRand", new BufferAttribute(s.rand, 4));
      g.setAttribute("aType", new BufferAttribute(s.type, 1));
      g.setAttribute("aWarm", new BufferAttribute(s.warm, 1));
      g.setAttribute("position", new BufferAttribute(s.a, 3));
    }
    g.boundingSphere = new Sphere(new Vector3(), 20);
    return g;
  }, [variant, count]);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uSize: { value: count < 9000 ? 4.4 : 3.4 },
          uPixelRatio: { value: 1 },
          uIntensity: { value: 0 },
          uVariant: { value: variant === "core" ? 0 : 1 },
        },
      }),
    [variant, count],
  );
  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);
  const s = useRef({ time: 0, az: 0, el: 0 });
  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1);
    const st = s.current;
    st.time += dt;
    material.uniforms.uTime.value = st.time;
    material.uniforms.uIntensity.value = Math.min(1, st.time / 1.4);
    material.uniforms.uPixelRatio.value = state.gl.getPixelRatio();
    if (!orbit.dragging && performance.now() / 1000 - orbit.releasedAt > 1.8) {
      orbit.az *= Math.exp(-dt * 1.2);
      orbit.el *= Math.exp(-dt * 1.2);
    }
    const k = 1 - Math.exp(-dt * 6);
    st.az += (orbit.az + Math.sin(st.time * 0.15) * 0.25 - st.az) * k;
    st.el += (orbit.el - st.el) * k;
    const dist = variant === "core" ? 12.5 : 13,
      el = 0.12 + st.el,
      cy = variant === "core" ? 0 : 0.2;
    state.camera.position.set(
      dist * Math.cos(el) * Math.sin(st.az),
      cy + dist * Math.sin(el),
      dist * Math.cos(el) * Math.cos(st.az),
    );
    state.camera.lookAt(0, cy, 0);
  });
  return <points geometry={geometry} material={material} frustumCulled={false} />;
}

export default function Accent({ variant, count, orbit }: { variant: AccentVariant; count: number; orbit: OrbitState }) {
  return (
    <Canvas
      dpr={Math.min(1.5, window.devicePixelRatio || 1)}
      gl={{ antialias: false, alpha: true, powerPreference: "high-performance" }}
      camera={{ fov: 38, near: 0.1, far: 100, position: [0, 0, 13] }}
      aria-hidden="true"
    >
      <Points variant={variant} count={count} orbit={orbit} />
    </Canvas>
  );
}
