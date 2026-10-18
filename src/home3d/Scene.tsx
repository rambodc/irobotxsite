/* eslint-disable react/no-unknown-property,react-hooks/immutability,react-hooks/purity */
import { useEffect, useMemo, useRef, type RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Matrix4,
  PerspectiveCamera,
  ShaderMaterial,
  Sphere,
  Vector3,
} from "three";
import { buildForms } from "./forms";
import { fragmentShader, vertexShader } from "./shaders";
import { armTarget, ARM_CYCLE, solveArm } from "./arm";
import type { Director } from "./director";

type Pose = { c: [number, number, number]; h: number; w: number; az: [number, number]; el: number };
// Camera framing per form: centre, visible half-height/half-width, azimuth sweep, elevation.
const POSES: Pose[] = [
  { c: [0, 0, 0], h: 4.3, w: 4.3, az: [-0.4, 0.4], el: 0.16 },
  { c: [1.0, -0.7, 0.2], h: 3.1, w: 4.2, az: [-0.3, 0.3], el: 0.24 },
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
          uSeg: { value: Array.from({ length: 5 }, () => new Matrix4()) },
          uTip: { value: new Vector3() },
          uWeld: { value: 0 },
          uPointer: { value: [0, 0] },
          uRepel: { value: 0 },
          uAspect: { value: 1 },
          uPulse: { value: 0 },
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
  const rig = useRef({
    init: false, cx: 0, cy: 0, cz: 0, dist: 30, az: 0, el: 0, px: 0, py: 0, time: 0,
    arm: 0, boost: 0, weld: 0, kicks: 0, pulse: 0, repel: 0, frames: 0, acc: 0,
  });
  const tilt = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const onTilt = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return;
      tilt.current.x = Math.max(-1, Math.min(1, e.gamma / 30));
      tilt.current.y = Math.max(-1, Math.min(1, (e.beta - 50) / 30));
    };
    addEventListener("deviceorientation", onTilt);
    return () => removeEventListener("deviceorientation", onTilt);
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
    u.uAspect.value = size.width / size.height;

    // Clicks: speed up / restart the arm on the Robotics chapter, otherwise a particle pulse.
    if (director.kicks !== s.kicks) {
      s.kicks = director.kicks;
      if (director.chapter === 1) {
        const t = s.arm - 1;
        if (t < 0 || t % ARM_CYCLE > 6.9)
          s.arm = 1 + Math.ceil(Math.max(t, 0) / ARM_CYCLE) * ARM_CYCLE;
        s.boost = 1.4;
      } else s.pulse = 1;
    }
    s.boost *= Math.exp(-dt * 0.8);
    s.pulse *= Math.exp(-dt * 2.4);
    u.uPulse.value = Math.sin(Math.min(1, s.pulse) * Math.PI) * 0.6;

    // Arm kinematics.
    s.arm = director.chapter === 1 ? s.arm + dt * (1 + s.boost) : 0;
    const armT = s.arm - 1;
    const target = armTarget(armT < 0 ? ARM_CYCLE : armT % ARM_CYCLE, s.time);
    solveArm(target.tip, target.roll, u.uSeg.value, u.uTip.value);
    s.weld += ((director.chapter === 1 ? target.weld : 0) - s.weld) * Math.min(1, dt * 12);
    u.uWeld.value = s.weld;

    // Cursor / finger repel.
    const pt = director.pointer;
    const live = pt.active && performance.now() / 1000 - pt.movedAt < 1.6 ? 1 : 0;
    s.repel += (live - s.repel) * (1 - Math.exp(-dt * 4));
    u.uRepel.value = s.repel;
    u.uPointer.value = [pt.x, pt.y];

    // Orbit offsets ease back to the tour path ~2 s after release.
    const ob = director.orbit;
    if (!ob.dragging && performance.now() / 1000 - ob.releasedAt > 1.8) {
      const back = 1 - Math.exp(-dt * 1.4);
      ob.az -= ob.az * back;
      ob.el -= ob.el * back;
    }

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
    const px = pt.active && !portrait ? pt.x : tilt.current.x,
      py = pt.active && !portrait ? -pt.y : tilt.current.y;
    s.px += (px - s.px) * (1 - Math.exp(-dt * 3));
    s.py += (py - s.py) * (1 - Math.exp(-dt * 3));
    const goal = {
      cx: a.c[0] + (b.c[0] - a.c[0]) * m,
      cy: a.c[1] + (b.c[1] - a.c[1]) * m,
      cz: a.c[2] + (b.c[2] - a.c[2]) * m,
      dist: (a.dist + (b.dist - a.dist) * m) * (1 + 0.14 * burst),
      az: a.az + (b.az - a.az) * m + s.px * 0.08,
      el: a.el + (b.el - a.el) * m + s.py * 0.04,
    };
    if (!s.init) {
      Object.assign(s, goal, { init: true, dist: goal.dist * 1.9, el: goal.el + 0.25 });
    } else
      for (const key of ["cx", "cy", "cz", "dist", "az", "el"] as const)
        s[key] += (goal[key] - s[key]) * k;
    // Orbit sits on top of the damped path so dragging feels direct.
    const az = s.az + ob.az,
      el = Math.max(-0.05, Math.min(1.1, s.el + ob.el));
    const cam = state.camera;
    cam.position.set(
      s.cx + s.dist * Math.cos(el) * Math.sin(az),
      s.cy + s.dist * Math.sin(el),
      s.cz + s.dist * Math.cos(el) * Math.cos(az),
    );
    cam.lookAt(s.cx, s.cy, s.cz);
    u.uRef.value = s.dist * 0.85;

    // Drop to 1x pixel ratio if frames run slow for two seconds.
    s.acc += delta;
    s.frames++;
    if (s.acc > 2) {
      if (s.frames / s.acc < 45 && state.gl.getPixelRatio() > 1) state.setDpr(1);
      s.acc = 0;
      s.frames = 0;
    }

    const node = stage.current;
    if (node) {
      node.style.setProperty("--x-progress", director.fraction.toFixed(4));
      const phase = director.settled ? "hold" : "morph";
      if (node.dataset.phase !== phase) node.dataset.phase = phase;
    }
  });
  return <points geometry={geometry} material={material} frustumCulled={false} />;
}

export function Dust({ count = 1400 }: { count?: number }) {
  const geometry = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const u = Math.random() * 2 - 1,
        t = Math.random() * Math.PI * 2,
        r = 14 + Math.random() * 26,
        s = Math.sqrt(1 - u * u);
      pos.set([Math.cos(t) * s * r, u * r * 0.6, Math.sin(t) * s * r], i * 3);
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(pos, 3));
    return g;
  }, [count]);
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
  return (
    <Canvas
      dpr={Math.min(maxDpr, window.devicePixelRatio || 1)}
      gl={{ antialias: false, alpha: true, powerPreference: "high-performance" }}
      camera={{ fov: FOV, near: 0.1, far: 200, position: [0, 0, 30] }}
      aria-hidden="true"
    >
      <Dust />
      <Field {...rest} />
    </Canvas>
  );
}
