import { useMemo } from 'react';
import { useTexture, Cloud, Clouds } from '@react-three/drei';
import * as THREE from 'three';
import TexturedSky from './TexturedSky';

/** Static CF logo billboards. */
function LogoCloud({
  position,
  scale,
  rotY = 0,
  rotX = 0,
  opacity = 0.92,
}: {
  position: [number, number, number];
  scale: number;
  rotY?: number;
  rotX?: number;
  opacity?: number;
}) {
  const texture = useTexture('/cloudflare-logo.png');
  return (
    <mesh position={position} rotation={[rotX, rotY, 0]} renderOrder={3}>
      <planeGeometry args={[scale, scale * 0.55]} />
      <meshBasicMaterial
        map={texture}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
        opacity={opacity}
        toneMapped={false}
        fog={false}
      />
    </mesh>
  );
}

/** Sun high in the upper sky. */
export function Sun() {
  return (
    <group position={[25, 90, -15]}>
      <mesh>
        <sphereGeometry args={[4.5, 32, 32]} />
        <meshBasicMaterial color="#fffef5" toneMapped={false} fog={false} />
      </mesh>
      <mesh>
        <sphereGeometry args={[6.5, 32, 32]} />
        <meshBasicMaterial
          color="#ffe566"
          transparent
          opacity={0.5}
          depthWrite={false}
          toneMapped={false}
          fog={false}
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[10, 32, 32]} />
        <meshBasicMaterial
          color="#ffb020"
          transparent
          opacity={0.2}
          depthWrite={false}
          toneMapped={false}
          fog={false}
        />
      </mesh>
      <pointLight intensity={0.8} distance={250} color="#fff2cc" decay={1.2} />
    </group>
  );
}

function seeded(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** Scatter CF logos across the full sky dome (all directions). */
function buildLogoField() {
  const rng = seeded(77);
  const logos: {
    pos: [number, number, number];
    scale: number;
    rot: number;
    rotX: number;
    opacity: number;
  }[] = [];

  // Ring layers around the city so logos fill every direction
  const rings = [
    { y: 42, radius: 58, count: 10, scale: [14, 18] },
    { y: 50, radius: 72, count: 12, scale: [15, 20] },
    { y: 58, radius: 64, count: 10, scale: [13, 18] },
    { y: 66, radius: 80, count: 12, scale: [16, 22] },
    { y: 48, radius: 95, count: 10, scale: [18, 24] },
    { y: 72, radius: 55, count: 8, scale: [12, 17] },
  ];

  for (const ring of rings) {
    for (let i = 0; i < ring.count; i++) {
      const angle = (i / ring.count) * Math.PI * 2 + rng() * 0.35;
      const r = ring.radius * (0.88 + rng() * 0.22);
      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r;
      const y = ring.y + (rng() - 0.5) * 10;
      const scale = ring.scale[0] + rng() * (ring.scale[1] - ring.scale[0]);
      // Face roughly toward city center
      const rotY = Math.atan2(x, z) + Math.PI + (rng() - 0.5) * 0.4;
      const rotX = -0.08 + (rng() - 0.5) * 0.2;
      const opacity = 0.78 + rng() * 0.2;
      logos.push({
        pos: [x, y, z],
        scale,
        rot: rotY,
        rotX,
        opacity,
      });
    }
  }

  // A few overhead / high-center logos
  const overhead: [number, number, number][] = [
    [0, 78, -20],
    [18, 74, 12],
    [-22, 76, 8],
    [8, 70, -40],
    [-12, 72, 35],
    [35, 68, -8],
    [-40, 70, -18],
  ];
  for (const pos of overhead) {
    logos.push({
      pos,
      scale: 16 + rng() * 8,
      rot: rng() * Math.PI * 2,
      rotX: -0.35 + rng() * 0.15,
      opacity: 0.85 + rng() * 0.12,
    });
  }

  return logos;
}

export default function CloudflareClouds() {
  const logos = useMemo(() => buildLogoField(), []);

  return (
    <group>
      <TexturedSky />
      <Sun />

      {/* Soft volumetric cloud puffs for depth */}
      <Clouds material={THREE.MeshLambertMaterial} limit={16} frustumCulled={false}>
        <Cloud
          seed={1}
          segments={12}
          bounds={[55, 9, 45]}
          position={[30, 45, -35]}
          volume={16}
          color="#ffffff"
          opacity={0.5}
          fade={70}
        />
        <Cloud
          seed={2}
          segments={12}
          bounds={[50, 8, 40]}
          position={[-35, 50, 25]}
          volume={14}
          color="#f8fbff"
          opacity={0.48}
          fade={65}
        />
        <Cloud
          seed={3}
          segments={10}
          bounds={[45, 7, 35]}
          position={[5, 55, 40]}
          volume={12}
          color="#ffffff"
          opacity={0.45}
          fade={60}
        />
        <Cloud
          seed={4}
          segments={10}
          bounds={[40, 7, 32]}
          position={[-20, 48, -50]}
          volume={11}
          color="#fffaf5"
          opacity={0.44}
          fade={58}
        />
        <Cloud
          seed={5}
          segments={8}
          bounds={[38, 6, 30]}
          position={[40, 52, 15]}
          volume={10}
          color="#ffffff"
          opacity={0.4}
          fade={55}
        />
        <Cloud
          seed={6}
          segments={8}
          bounds={[36, 6, 28]}
          position={[-45, 46, -10]}
          volume={9}
          color="#f5f8ff"
          opacity={0.4}
          fade={52}
        />
        <Cloud
          seed={7}
          segments={8}
          bounds={[42, 7, 34]}
          position={[15, 60, -55]}
          volume={11}
          color="#ffffff"
          opacity={0.42}
          fade={55}
        />
        <Cloud
          seed={8}
          segments={8}
          bounds={[40, 6, 30]}
          position={[-30, 56, 45]}
          volume={10}
          color="#f8fbff"
          opacity={0.4}
          fade={54}
        />
      </Clouds>

      {logos.map((l, i) => (
        <LogoCloud
          key={i}
          position={l.pos}
          scale={l.scale}
          rotY={l.rot}
          rotX={l.rotX}
          opacity={l.opacity}
        />
      ))}
    </group>
  );
}
