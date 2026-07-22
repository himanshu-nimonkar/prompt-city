import { useMemo } from 'react';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import { Instances, Instance } from '@react-three/drei';
import * as THREE from 'three';

const PLAY_HALF = 82;
const SKYLINE_HALF = 100;
const FAR_HALF = 140;
const WALL_H = 16;

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function BoundaryWalls() {
  const t = 2.5;
  const h = WALL_H;
  const half = PLAY_HALF + t / 2;
  const len = PLAY_HALF * 2 + t * 2;

  const walls: { pos: [number, number, number]; size: [number, number, number] }[] = [
    { pos: [0, h / 2, half], size: [len, h, t] },
    { pos: [0, h / 2, -half], size: [len, h, t] },
    { pos: [half, h / 2, 0], size: [t, h, len] },
    { pos: [-half, h / 2, 0], size: [t, h, len] },
  ];

  return (
    <group>
      {walls.map((w, i) => (
        <RigidBody key={i} type="fixed" colliders={false} position={w.pos}>
          <CuboidCollider args={[w.size[0] / 2, w.size[1] / 2, w.size[2] / 2]} />
          <mesh>
            <boxGeometry args={w.size} />
            <meshStandardMaterial
              color="#475569"
              transparent
              opacity={0.28}
              metalness={0.45}
              roughness={0.45}
              side={THREE.DoubleSide}
            />
          </mesh>
          <mesh position={[0, h / 2 + 0.15, 0]}>
            <boxGeometry args={[w.size[0] * 1.01, 0.28, w.size[2] * 1.01]} />
            <meshStandardMaterial color="#ea580c" emissive="#f6821f" emissiveIntensity={0.45} metalness={0.5} />
          </mesh>
        </RigidBody>
      ))}
      {(
        [
          [PLAY_HALF, PLAY_HALF],
          [PLAY_HALF, -PLAY_HALF],
          [-PLAY_HALF, PLAY_HALF],
          [-PLAY_HALF, -PLAY_HALF],
        ] as const
      ).map(([x, z], i) => (
        <mesh key={`p-${i}`} position={[x, WALL_H / 2 + 0.5, z]}>
          <boxGeometry args={[3.2, WALL_H + 1, 3.2]} />
          <meshStandardMaterial color="#334155" metalness={0.5} roughness={0.4} />
        </mesh>
      ))}
    </group>
  );
}

function DistantSkyline() {
  const buildings = useMemo(() => {
    const rng = seeded(777);
    const list: { pos: [number, number, number]; scale: [number, number, number]; color: string }[] = [];
    const colors = ['#64748b', '#475569', '#78879a', '#5b6b7c', '#8b9aab'];

    const placeRing = (half: number, count: number, minH: number, maxH: number) => {
      for (let i = 0; i < count; i++) {
        const side = i % 4;
        const t = (Math.floor(i / 4) + rng()) / Math.max(count / 4, 1);
        let x = 0;
        let z = 0;
        if (side === 0) {
          x = -half + t * half * 2;
          z = half + 6 + rng() * 16;
        } else if (side === 1) {
          x = -half + t * half * 2;
          z = -half - 6 - rng() * 16;
        } else if (side === 2) {
          x = half + 6 + rng() * 16;
          z = -half + t * half * 2;
        } else {
          x = -half - 6 - rng() * 16;
          z = -half + t * half * 2;
        }
        const h = minH + rng() * (maxH - minH);
        const w = 3 + rng() * 5;
        list.push({
          pos: [x, h / 2, z],
          scale: [w, h, w * (0.7 + rng() * 0.4)],
          color: colors[Math.floor(rng() * colors.length)],
        });
      }
    };

    placeRing(SKYLINE_HALF, 48, 20, 50);
    placeRing(FAR_HALF, 56, 24, 60);
    return list;
  }, []);

  return (
    <Instances limit={buildings.length} range={buildings.length}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial roughness={0.7} metalness={0.2} />
      {buildings.map((b, i) => (
        <Instance key={i} position={b.pos} scale={b.scale} color={b.color} />
      ))}
    </Instances>
  );
}

function EndlessGround() {
  return (
    <group>
      {/* Well below city slabs so orbit view never z-fights with streets/grass */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.35, 0]} receiveShadow>
        <circleGeometry args={[260, 48]} />
        <meshStandardMaterial color="#3d7a36" roughness={0.96} depthWrite />
      </mesh>
      <mesh position={[0, 8, 0]}>
        <cylinderGeometry args={[248, 248, 14, 32, 1, true]} />
        <meshBasicMaterial color="#a9cce6" transparent opacity={0.1} side={THREE.BackSide} depthWrite={false} />
      </mesh>
    </group>
  );
}

export default function CityBoundary() {
  return (
    <group>
      <EndlessGround />
      <DistantSkyline />
      <BoundaryWalls />
    </group>
  );
}

export { PLAY_HALF };
