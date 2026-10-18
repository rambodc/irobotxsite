/* eslint-disable react/no-unknown-property,react-hooks/immutability,react-hooks/purity */
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  PerspectiveCamera,
  ShaderMaterial,
  Sphere,
  Vector3,
} from "three";
import { buildForms } from "./forms";
import { fragmentShader, vertexShader } from "./shaders";
import type { Director } from "./director";

type Pose = { c: [number, number, number]; h: number; w: number; az: [number, number]; el: number };
// Camera framing per form: centre, visible half-height/half-width, azimuth sweep, elevation.
const POSES: Pose[] = [
  { c: [0, 0, 0], h: 4.3, w: 4.3, az: [-0.4, 0.4], el: 0.16 },
  { c: [0, 0.15, 0], h: 4.3, w: 2.4, az: [-0.55, 0.35], el: 0.07 },
  { c: [0.5, 0.6, -0.3], h: 3.3, w: 6.1, az: [0.6, -0.1], el: 0.42 },
  { c: [0.5, 0.15, 0], h: 5.3, w: 5.5, az: [-0.6, 0.12], el: 0.15 },
  { c: [0, 0.6, 0], h: 3.8, w: 6.0, az: [0.5, -0.3], el: 0.3 },
];
const FOV = 38;
const tanV = Math.tan(((FOV / 2) * Math.PI) / 180);
const smooth = (x: number) => x * x * (3 - 2 * x);

export type SceneProps = {
  director: Director;
  count: number;
  pointSize: number;
  stage: RefObject<HTMLDivElement | null>;
};

function Field({ director, count, pointSize, stage }: SceneProps) {
  const forms = useMemo(() => buildForms(count), [count]);
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(forms.edgeA, 3));
    const attrs: [string, Float32Array, number][] = [
      ["aEdgeA", forms.edgeA, 3],
      ["aEdgeB", forms.edgeB, 3],
      ["aRobot", forms.robot, 3],
      ["aFin", forms.fin, 3],
      ["aOil", forms.oil, 3],
      ["aEnt", forms.ent, 3],
      ["aRand", forms.rand, 4],
      ["aAnim", forms.anim, 4],
      ["aWarm", forms.warm, 4],
    ];
    for (const [name, data, size] of attrs)
      g.setAttribute(name, new BufferAttribute(data, size));
    g.boundingSphere = new Sphere(new Vector3(), 30);
    return g;
  }, [forms]);
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
          uProgress: { value: 1 },
          uSize: { value: pointSize },
          uPixelRatio: { value: 1 },
          uRef: { value: 12 },
          uIntensity: { value: 0 },
          uFrom: { value: 0 },
          uTo: { value: 0 },
        },
      }),
    [pointSize],
  );
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  const rig = useRef({ init: false, cx: 0, cy: 0, cz: 0, dist: 30, az: 0, el: 0, px: 0, py: 0, time: 0 });
  const pointer = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      pointer.current.x = (e.clientX / innerWidth) * 2 - 1;
      pointer.current.y = (e.clientY / innerHeight) * 2 - 1;
    };
    const tilt = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return;
      pointer.current.x = Math.max(-1, Math.min(1, e.gamma / 30));
      pointer.current.y = Math.max(-1, Math.min(1, (e.beta - 50) / 30));
    };
    addEventListener("pointermove", move);
    addEventListener("deviceorientation", tilt);
    return () => {
      removeEventListener("pointermove", move);
      removeEventListener("deviceorientation", tilt);
    };
  }, []);
  const { camera, size } = useThree();
  const portrait = size.width / size.height < 0.85;
  useEffect(() => {
    const cam = camera as PerspectiveCamera;
    if (portrait)
      cam.setViewOffset(size.width, size.height, 0, size.height * 0.17, size.width, size.height);
    else
      cam.setViewOffset(size.width, size.height, -size.width * 0.19, 0, size.width, size.height);
    cam.updateProjectionMatrix();
  }, [camera, size, portrait]);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1);
    director.update(dt);
    const s = rig.current;
    s.time += dt;
    const u = material.uniforms;
    u.uTime.value = s.time;
    u.uFrom.value = director.from;
    u.uTo.value = director.to;
    u.uProgress.value = director.progress;
    u.uIntensity.value = Math.min(1, s.time / 1.6);
    u.uPixelRatio.value = state.gl.getPixelRatio();

    const aspect = size.width / size.height;
    const hf = portrait ? 0.62 : 1,
      wf = portrait ? 1 : 0.6;
    const pose = (k: number) => {
      const p = POSES[k];
      const sweep = k === director.chapter ? smooth(director.fraction) : 0.5;
      const dist =
        Math.max(p.h / (tanV * hf), (p.w * (portrait ? 0.86 : 1)) / (tanV * aspect * wf)) * 1.06;
      return { c: p.c, dist, az: p.az[0] + (p.az[1] - p.az[0]) * sweep, el: p.el };
    };
    const a = pose(director.from),
      b = pose(director.to);
    const m = smooth(Math.min(1, Math.max(0, director.progress)));
    const burst = director.from === director.to ? 0 : Math.sin(Math.PI * m);
    const k = 1 - Math.exp(-dt * 1.5);
    s.px += (pointer.current.x - s.px) * (1 - Math.exp(-dt * 3));
    s.py += (pointer.current.y - s.py) * (1 - Math.exp(-dt * 3));
    const target = {
      cx: a.c[0] + (b.c[0] - a.c[0]) * m,
      cy: a.c[1] + (b.c[1] - a.c[1]) * m,
      cz: a.c[2] + (b.c[2] - a.c[2]) * m,
      dist: (a.dist + (b.dist - a.dist) * m) * (1 + 0.14 * burst),
      az: a.az + (b.az - a.az) * m + s.px * 0.12,
      el: a.el + (b.el - a.el) * m + s.py * 0.06,
    };
    if (!s.init) {
      Object.assign(s, target, { init: true, dist: target.dist * 1.9, el: target.el + 0.25 });
    } else
      for (const key of ["cx", "cy", "cz", "dist", "az", "el"] as const)
        s[key] += (target[key] - s[key]) * k;
    const cam = state.camera;
    cam.position.set(
      s.cx + s.dist * Math.cos(s.el) * Math.sin(s.az),
      s.cy + s.dist * Math.sin(s.el),
      s.cz + s.dist * Math.cos(s.el) * Math.cos(s.az),
    );
    cam.lookAt(s.cx, s.cy, s.cz);
    u.uRef.value = s.dist * 0.85;

    const el = stage.current;
    if (el) {
      el.style.setProperty("--x-progress", director.fraction.toFixed(4));
      const phase = director.settled ? "hold" : "morph";
      if (el.dataset.phase !== phase) el.dataset.phase = phase;
    }
  });
  return <points geometry={geometry} material={material} frustumCulled={false} />;
}

function Dust() {
  const geometry = useMemo(() => {
    const n = 1400,
      pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1,
        t = Math.random() * Math.PI * 2,
        r = 14 + Math.random() * 26,
        s = Math.sqrt(1 - u * u);
      pos.set([Math.cos(t) * s * r, u * r * 0.6, Math.sin(t) * s * r], i * 3);
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(pos, 3));
    return g;
  }, []);
  const ref = useRef<{ rotation: { y: number } }>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.01;
  });
  return (
    <points ref={ref as never} geometry={geometry} frustumCulled={false}>
      <pointsMaterial
        size={0.07}
        color="#3d6fb8"
        transparent
        opacity={0.55}
        depthWrite={false}
        blending={AdditiveBlending}
      />
    </points>
  );
}

export default function Scene(props: SceneProps & { maxDpr: number }) {
  const { maxDpr, ...rest } = props;
  const [dpr, setDpr] = useState(Math.min(maxDpr, window.devicePixelRatio || 1));
  return (
    <Canvas
      dpr={dpr}
      gl={{ antialias: false, alpha: true, powerPreference: "high-performance" }}
      camera={{ fov: FOV, near: 0.1, far: 200, position: [0, 0, 30] }}
      aria-hidden="true"
    >
      <PerformanceMonitor flipflops={2} onDecline={() => setDpr(1)}>
        <Dust />
        <Field {...rest} />
      </PerformanceMonitor>
    </Canvas>
  );
}
