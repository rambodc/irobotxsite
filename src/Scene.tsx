import { Component, Suspense, useState, type ReactNode } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, OrbitControls } from "@react-three/drei";
import { useRef } from "react";
import type { Group } from "three";
function Facility({
  interactive,
  playing,
}: {
  interactive: boolean;
  playing: boolean;
}) {
  const group = useRef<Group>(null);
  useFrame((_, delta) => {
    if (group.current && playing && !interactive)
      group.current.rotation.y += delta * 0.045;
  });
  return (
    <group ref={group} rotation={[0, -0.4, 0]}>
      <mesh position={[0, -0.55, 0]}>
        <boxGeometry args={[7, 0.18, 4.6]} />
        <meshStandardMaterial
          color="#112d53"
          metalness={0.6}
          roughness={0.35}
        />
      </mesh>
      {[
        [-2, 0, -0.7],
        [-0.5, 0, -0.7],
        [1, 0, -0.7],
      ].map((p, i) => (
        <group key={i} position={p as [number, number, number]}>
          <mesh position={[0, 0.65, 0]}>
            <cylinderGeometry args={[0.48, 0.48, 2.2, 32]} />
            <meshStandardMaterial
              color={i === 1 ? "#3289ed" : "#7598b9"}
              metalness={0.8}
              roughness={0.25}
            />
          </mesh>
          <mesh position={[0, 1.76, 0]}>
            <sphereGeometry
              args={[0.48, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]}
            />
            <meshStandardMaterial
              color="#83b5e4"
              metalness={0.8}
              roughness={0.25}
            />
          </mesh>
          {[0.1, 0.9, 1.5].map((y) => (
            <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.49, 0.026, 8, 32]} />
              <meshStandardMaterial color="#c1e0ff" />
            </mesh>
          ))}
        </group>
      ))}
      <mesh position={[0, -0.08, 1]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.13, 0.13, 5.8, 16]} />
        <meshStandardMaterial color="#3a97ff" metalness={0.7} roughness={0.3} />
      </mesh>
      {[-2, -0.5, 1].map((x) => (
        <mesh key={x} position={[x, -0.08, 0.3]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.12, 0.12, 1.4, 16]} />
          <meshStandardMaterial
            color="#73b7ff"
            metalness={0.8}
            roughness={0.3}
          />
        </mesh>
      ))}
      <group position={[2.5, 0.55, -0.7]}>
        <mesh>
          <boxGeometry args={[0.75, 2.2, 0.75]} />
          <meshStandardMaterial color="#204a76" wireframe />
        </mesh>
        <mesh position={[0, 1.3, 0]}>
          <cylinderGeometry args={[0.09, 0.13, 0.6, 12]} />
          <meshStandardMaterial color="#79bbfa" />
        </mesh>
      </group>
      <gridHelper
        args={[7, 14, "#2b69ac", "#15345b"]}
        position={[0, -0.445, 0]}
      />
    </group>
  );
}
export function SceneFallback() {
  return (
    <div
      className="scene-fallback"
      aria-label="Conceptual connected industrial system"
    >
      <div className="fallback-tanks">
        <i />
        <i />
        <i />
      </div>
      <span>CONNECTED SYSTEMS / iRX</span>
    </div>
  );
}
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <SceneFallback /> : this.props.children;
  }
}
export default function Scene({
  interactive = false,
  playing = true,
}: {
  interactive?: boolean;
  playing?: boolean;
}) {
  const [supported] = useState(() => {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    const available = Boolean(gl);
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return available;
  });
  if (!supported) return <SceneFallback />;
  return (
    <Boundary>
      <Suspense fallback={<SceneFallback />}>
        <Canvas
          camera={{ position: [7, 5, 8], fov: 38 }}
          dpr={[1, 1.5]}
          frameloop={playing || interactive ? "always" : "demand"}
          aria-label="3D concept of an industrial processing facility"
        >
          <ambientLight intensity={1.5} />
          <directionalLight position={[4, 8, 4]} intensity={3} />
          <pointLight position={[-4, 2, 2]} intensity={30} color="#2588ff" />
          <Float
            speed={playing ? 0.8 : 0}
            rotationIntensity={0.05}
            floatIntensity={0.2}
          >
            <Facility interactive={interactive} playing={playing} />
          </Float>
          {interactive && (
            <OrbitControls
              enablePan={false}
              minDistance={6}
              maxDistance={16}
              maxPolarAngle={Math.PI / 2.1}
            />
          )}
        </Canvas>
      </Suspense>
    </Boundary>
  );
}
