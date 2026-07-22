import { useMemo } from 'react';
import { Instances, Instance } from '@react-three/drei';
import * as THREE from 'three';

const CITY = 160;
const BLOCK = 18;
const ROAD_W = 4.2;
const SIDEWALK = 1.1;

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * Static street furniture as instanced meshes (few draw calls).
 * No point lights, no per-frame work.
 */
export default function StaticStreetProps() {
  const data = useMemo(() => {
    const rng = seeded(55);
    const half = CITY / 2;
    const curb = ROAD_W / 2 + SIDEWALK / 2;

    const streetlights: [number, number, number][] = [];
    const signals: { pos: [number, number, number]; rot: number }[] = [];
    const poles: [number, number, number][] = [];
    const peds: { pos: [number, number, number]; color: string; rot: number }[] = [];
    const cableCurves: THREE.QuadraticBezierCurve3[] = [];

    for (let x = -half; x <= half; x += BLOCK * 2) {
      for (let z = -half; z <= half; z += BLOCK * 2) {
        streetlights.push([x + curb, 0, z + curb]);
        if (((x + z) / BLOCK) % 4 === 0) {
          streetlights.push([x - curb, 0, z - curb]);
        }
      }
    }

    for (let x = -half; x <= half; x += BLOCK * 2) {
      for (let z = -half; z <= half; z += BLOCK * 2) {
        signals.push({ pos: [x + ROAD_W / 2 + 0.45, 0, z + ROAD_W / 2 + 0.45], rot: 0 });
        signals.push({ pos: [x - ROAD_W / 2 - 0.45, 0, z - ROAD_W / 2 - 0.45], rot: Math.PI });
      }
    }

    for (let z = -half; z <= half; z += BLOCK * 3) {
      const row: [number, number, number][] = [];
      for (let x = -half + 10; x <= half - 10; x += BLOCK) {
        const p: [number, number, number] = [x, 0, z + curb + 0.4];
        poles.push(p);
        row.push(p);
      }
      for (let i = 0; i < row.length - 1; i++) {
        const a = new THREE.Vector3(row[i][0], 5.1, row[i][2]);
        const b = new THREE.Vector3(row[i + 1][0], 5.1, row[i + 1][2]);
        const c = a.clone().lerp(b, 0.5);
        c.y -= 0.9;
        cableCurves.push(new THREE.QuadraticBezierCurve3(a, c, b));
      }
    }
    for (let x = -half; x <= half; x += BLOCK * 3) {
      const col: [number, number, number][] = [];
      for (let z = -half + 10; z <= half - 10; z += BLOCK) {
        const p: [number, number, number] = [x + curb + 0.4, 0, z];
        poles.push(p);
        col.push(p);
      }
      for (let i = 0; i < col.length - 1; i++) {
        const a = new THREE.Vector3(col[i][0], 5.1, col[i][2]);
        const b = new THREE.Vector3(col[i + 1][0], 5.1, col[i + 1][2]);
        const c = a.clone().lerp(b, 0.5);
        c.y -= 0.9;
        cableCurves.push(new THREE.QuadraticBezierCurve3(a, c, b));
      }
    }

    const pedColors = ['#1e3a5f', '#7f1d1d', '#14532d', '#4c1d95', '#713f12', '#334155'];
    let pi = 0;
    for (let x = -half; x <= half; x += BLOCK * 2) {
      for (let z = -half + 8; z < half; z += 12) {
        if (rng() < 0.3) continue;
        peds.push({
          pos: [x + curb + 0.2, 0, z],
          color: pedColors[pi++ % pedColors.length],
          rot: rng() * Math.PI * 2,
        });
      }
    }

    const cableGeos = cableCurves.map((curve) => new THREE.TubeGeometry(curve, 5, 0.02, 3, false));

    return { streetlights, signals, poles, peds, cableGeos };
  }, []);

  return (
    <group>
      <Instances limit={Math.max(data.streetlights.length, 1)} range={data.streetlights.length}>
        <cylinderGeometry args={[0.08, 0.11, 4.6, 6]} />
        <meshStandardMaterial color="#475569" metalness={0.7} roughness={0.4} />
        {data.streetlights.map((p, i) => (
          <Instance key={`sl-${i}`} position={[p[0], 2.3, p[2]]} />
        ))}
      </Instances>
      <Instances limit={Math.max(data.streetlights.length, 1)} range={data.streetlights.length}>
        <sphereGeometry args={[0.18, 8, 8]} />
        <meshStandardMaterial color="#fde68a" emissive="#fbbf24" emissiveIntensity={1.8} />
        {data.streetlights.map((p, i) => (
          <Instance key={`sh-${i}`} position={[p[0] + 0.55, 4.15, p[2]]} />
        ))}
      </Instances>

      <Instances limit={Math.max(data.signals.length, 1)} range={data.signals.length}>
        <cylinderGeometry args={[0.07, 0.09, 3.8, 6]} />
        <meshStandardMaterial color="#1f2937" metalness={0.65} roughness={0.4} />
        {data.signals.map((s, i) => (
          <Instance key={`tp-${i}`} position={[s.pos[0], 1.9, s.pos[2]]} />
        ))}
      </Instances>
      <Instances limit={Math.max(data.signals.length, 1)} range={data.signals.length}>
        <boxGeometry args={[0.36, 1.0, 0.28]} />
        <meshStandardMaterial color="#111827" metalness={0.5} roughness={0.35} />
        {data.signals.map((s, i) => {
          const ox = Math.sin(s.rot) * 0.12;
          const oz = Math.cos(s.rot) * 0.12;
          return (
            <Instance
              key={`th-${i}`}
              position={[s.pos[0] + ox, 3.7, s.pos[2] + oz]}
              rotation={[0, s.rot, 0]}
            />
          );
        })}
      </Instances>
      <Instances limit={Math.max(data.signals.length, 1)} range={data.signals.length}>
        <sphereGeometry args={[0.09, 8, 8]} />
        <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={2.2} />
        {data.signals.map((s, i) => {
          const ox = Math.sin(s.rot) * 0.28;
          const oz = Math.cos(s.rot) * 0.28;
          return <Instance key={`tr-${i}`} position={[s.pos[0] + ox, 3.95, s.pos[2] + oz]} />;
        })}
      </Instances>
      <Instances limit={Math.max(data.signals.length, 1)} range={data.signals.length}>
        <sphereGeometry args={[0.09, 8, 8]} />
        <meshStandardMaterial color="#14532d" emissive="#166534" emissiveIntensity={0.25} />
        {data.signals.map((s, i) => {
          const ox = Math.sin(s.rot) * 0.28;
          const oz = Math.cos(s.rot) * 0.28;
          return <Instance key={`tg-${i}`} position={[s.pos[0] + ox, 3.45, s.pos[2] + oz]} />;
        })}
      </Instances>

      <Instances limit={Math.max(data.poles.length, 1)} range={data.poles.length}>
        <cylinderGeometry args={[0.1, 0.13, 5.2, 6]} />
        <meshStandardMaterial color="#5c4033" roughness={0.85} />
        {data.poles.map((p, i) => (
          <Instance key={`up-${i}`} position={[p[0], 2.6, p[2]]} />
        ))}
      </Instances>
      <Instances limit={Math.max(data.poles.length, 1)} range={data.poles.length}>
        <boxGeometry args={[1.15, 0.1, 0.12]} />
        <meshStandardMaterial color="#3f3f46" metalness={0.5} />
        {data.poles.map((p, i) => (
          <Instance key={`ua-${i}`} position={[p[0], 5.15, p[2]]} />
        ))}
      </Instances>

      {data.cableGeos.map((g, i) => (
        <mesh key={`cab-${i}`} geometry={g}>
          <meshStandardMaterial color="#1f2937" metalness={0.55} roughness={0.45} />
        </mesh>
      ))}

      <Instances limit={Math.max(data.peds.length, 1)} range={data.peds.length}>
        <capsuleGeometry args={[0.13, 0.48, 3, 5]} />
        <meshStandardMaterial roughness={0.65} />
        {data.peds.map((p, i) => (
          <Instance
            key={`pb-${i}`}
            position={[p.pos[0], 0.95, p.pos[2]]}
            rotation={[0, p.rot, 0]}
            color={p.color}
          />
        ))}
      </Instances>
      <Instances limit={Math.max(data.peds.length, 1)} range={data.peds.length}>
        <sphereGeometry args={[0.14, 8, 8]} />
        <meshStandardMaterial color="#d4a574" roughness={0.7} />
        {data.peds.map((p, i) => (
          <Instance key={`ph-${i}`} position={[p.pos[0], 1.38, p.pos[2]]} />
        ))}
      </Instances>
    </group>
  );
}
