import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { BUILDINGS } from '../data/mockBuildings';

/** Lightweight floating dust / data motes (kept small for FPS). */
export default function TrafficParticles() {
  const pointsRef = useRef<THREE.Points>(null);
  const progressRef = useRef<Float32Array | null>(null);

  const { positions, colors, paths, speeds } = useMemo(() => {
    const count = 280;
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    const p: { from: THREE.Vector3; to: THREE.Vector3 }[] = [];
    const progress = new Float32Array(count);

    const buildings = BUILDINGS;
    for (let i = 0; i < count; i++) {
      const from = buildings[Math.floor(Math.random() * buildings.length)];
      let to = buildings[Math.floor(Math.random() * buildings.length)];
      while (to === from && buildings.length > 1) {
        to = buildings[Math.floor(Math.random() * buildings.length)];
      }

      const fromPos = new THREE.Vector3(
        from.position[0],
        Math.min(from.height, 24) * (0.4 + Math.random() * 0.5),
        from.position[2],
      );
      const toPos = new THREE.Vector3(
        to.position[0],
        Math.min(to.height, 24) * (0.4 + Math.random() * 0.5),
        to.position[2],
      );

      const t = Math.random();
      progress[i] = t;
      speeds[i] = 0.08 + Math.random() * 0.12;
      const point = new THREE.Vector3().lerpVectors(fromPos, toPos, t);
      pos[i * 3] = point.x;
      pos[i * 3 + 1] = point.y;
      pos[i * 3 + 2] = point.z;

      col[i * 3] = 1.0;
      col[i * 3 + 1] = 0.75 + Math.random() * 0.2;
      col[i * 3 + 2] = 0.35 + Math.random() * 0.2;

      p.push({ from: fromPos, to: toPos });
    }

    progressRef.current = progress;
    return { positions: pos, colors: col, paths: p, speeds };
  }, []);

  useFrame((_, delta) => {
    if (!pointsRef.current || !progressRef.current) return;
    const arr = pointsRef.current.geometry.attributes.position.array as Float32Array;
    const prog = progressRef.current;

    for (let i = 0; i < paths.length; i++) {
      prog[i] += speeds[i] * delta;
      if (prog[i] > 1) prog[i] -= 1;
      const { from, to } = paths[i];
      const t = prog[i];
      const idx = i * 3;
      arr[idx] = from.x + (to.x - from.x) * t;
      arr[idx + 1] = from.y + (to.y - from.y) * t + Math.sin(t * Math.PI) * 1.5;
      arr[idx + 2] = from.z + (to.z - from.z) * t;
    }
    pointsRef.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={pointsRef} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.12}
        vertexColors
        transparent
        opacity={0.55}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}
