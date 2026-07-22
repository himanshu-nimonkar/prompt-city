import { useMemo, useCallback, useRef, useEffect } from 'react';
import { Instances, Instance, Text, Billboard as FaceCamera } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import * as THREE from 'three';
import BuildingLabel from './BuildingLabel';
import CityBoundary from './CityBoundary';
import type { BuildingData, ModelMetrics } from '../types';

interface CityProps {
  buildings: BuildingData[];
  growKey?: number;
  animateGrowth?: boolean;
  onInspect: (building: BuildingData | null) => void;
  onNearby: (building: BuildingData | null) => void;
}

const CITY_SIZE = 160;
const BLOCK = 18;
const ROAD_W = 4.2;
const SIDEWALK_W = 1.1;

function seededRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** Ground Y layers — generous separation to avoid z-fighting in orbit view. */
const Y_GRASS = -0.04;
const Y_PLAZA = 0.04;
const Y_ROAD = 0.09;
const Y_SIDEWALK = 0.13;
const Y_MARK = 0.17;
const Y_CROSS = 0.19;
const Y_DECAL = 0.21;

/** Unit-plane instance: scale.x/z = size, position includes Y. */
function InstancedGroundPlanes({
  items,
  color,
  y,
  polygonUnits = -2,
  roughness = 0.88,
}: {
  items: { position: [number, number, number]; size: [number, number] }[];
  color: string;
  y: number;
  polygonUnits?: number;
  roughness?: number;
}) {
  const n = Math.max(items.length, 1);
  return (
    <Instances limit={n} range={items.length} frustumCulled={false}>
      <planeGeometry args={[1, 1]} />
      <meshStandardMaterial
        color={color}
        roughness={roughness}
        metalness={0.06}
        polygonOffset
        polygonOffsetFactor={1}
        polygonOffsetUnits={polygonUnits}
      />
      {items.map((it, i) => (
        <Instance
          key={i}
          position={[it.position[0], y, it.position[2]]}
          rotation={[-Math.PI / 2, 0, 0]}
          scale={[it.size[0], it.size[1], 1]}
        />
      ))}
    </Instances>
  );
}

function LaneMarkings({
  position,
  length,
  horizontal,
}: {
  position: [number, number, number];
  length: number;
  horizontal: boolean;
}) {
  // Fewer dashes, thicker — less flicker, still reads as lane paint
  const step = 5.5;
  const dashes = Math.max(1, Math.floor(length / step));
  return (
    <group position={[position[0], Y_MARK, position[2]]}>
      {Array.from({ length: dashes }).map((_, i) => {
        const offset = -length / 2 + step * 0.45 + i * step;
        return (
          <mesh
            key={i}
            position={horizontal ? [offset, 0, 0] : [0, 0, offset]}
            rotation={[-Math.PI / 2, 0, 0]}
            renderOrder={3}
          >
            <planeGeometry args={horizontal ? [1.8, 0.16] : [0.16, 1.8]} />
            <meshStandardMaterial
              color="#c8c85a"
              emissive="#665500"
              emissiveIntensity={0.35}
              roughness={0.6}
              depthWrite={false}
              polygonOffset
              polygonOffsetFactor={-1}
              polygonOffsetUnits={-4}
            />
          </mesh>
        );
      })}
    </group>
  );
}

function Crosswalk({
  position,
  horizontal,
}: {
  position: [number, number, number];
  horizontal: boolean;
}) {
  return (
    <group position={[position[0], Y_CROSS, position[2]]}>
      {Array.from({ length: 5 }).map((_, i) => {
        const offset = -1.2 + i * 0.6;
        return (
          <mesh
            key={i}
            position={horizontal ? [0, 0, offset] : [offset, 0, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            renderOrder={4}
          >
            <planeGeometry args={horizontal ? [ROAD_W * 0.85, 0.28] : [0.28, ROAD_W * 0.85]} />
            <meshStandardMaterial
              color="#d0d0e0"
              roughness={0.8}
              depthWrite={false}
              polygonOffset
              polygonOffsetFactor={-1}
              polygonOffsetUnits={-6}
            />
          </mesh>
        );
      })}
    </group>
  );
}

function Tree({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 1.15, 0]}>
        <icosahedronGeometry args={[0.55, 0]} />
        <meshStandardMaterial color="#166534" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.35, 0]}>
        <cylinderGeometry args={[0.08, 0.12, 0.7, 6]} />
        <meshStandardMaterial color="#5c4033" roughness={0.9} />
      </mesh>
    </group>
  );
}

function Bench({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.35, 0]} castShadow>
        <boxGeometry args={[1.2, 0.08, 0.4]} />
        <meshStandardMaterial color="#2a2030" roughness={0.7} />
      </mesh>
      <mesh position={[-0.45, 0.15, 0]} castShadow>
        <boxGeometry args={[0.08, 0.3, 0.35]} />
        <meshStandardMaterial color="#1a1520" />
      </mesh>
      <mesh position={[0.45, 0.15, 0]} castShadow>
        <boxGeometry args={[0.08, 0.3, 0.35]} />
        <meshStandardMaterial color="#1a1520" />
      </mesh>
    </group>
  );
}

function TrafficCone({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.35, 0]} castShadow>
        <coneGeometry args={[0.18, 0.7, 8]} />
        <meshStandardMaterial color="#ff6622" emissive="#441100" emissiveIntensity={0.4} />
      </mesh>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.22, 12]} />
        <meshStandardMaterial color="#222" />
      </mesh>
    </group>
  );
}

function Billboard({ position, color }: { position: [number, number, number]; color: string }) {
  return (
    <group position={position}>
      <mesh position={[0, 2.5, 0]} castShadow>
        <boxGeometry args={[0.08, 5, 0.08]} />
        <meshStandardMaterial color="#333" metalness={0.6} />
      </mesh>
      <mesh position={[0, 5.2, 0]}>
        <boxGeometry args={[2.4, 1.2, 0.1]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.8} />
      </mesh>
    </group>
  );
}

function ParkedCar({
  position,
  color,
  rotation = 0,
}: {
  position: [number, number, number];
  color: string;
  rotation?: number;
}) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.35, 0]} castShadow>
        <boxGeometry args={[1.1, 0.35, 2.2]} />
        <meshStandardMaterial color={color} metalness={0.55} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.65, -0.15]} castShadow>
        <boxGeometry args={[0.95, 0.35, 1.1]} />
        <meshStandardMaterial color={color} metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.7, -0.15]}>
        <boxGeometry args={[0.85, 0.22, 0.9]} />
        <meshStandardMaterial
          color="#88ccff"
          emissive="#224466"
          emissiveIntensity={0.4}
          transparent
          opacity={0.7}
        />
      </mesh>
      {/* Headlights */}
      <mesh position={[-0.3, 0.35, 1.05]}>
        <boxGeometry args={[0.18, 0.1, 0.06]} />
        <meshStandardMaterial color="#ffffcc" emissive="#ffee88" emissiveIntensity={1.2} />
      </mesh>
      <mesh position={[0.3, 0.35, 1.05]}>
        <boxGeometry args={[0.18, 0.1, 0.06]} />
        <meshStandardMaterial color="#ffffcc" emissive="#ffee88" emissiveIntensity={1.2} />
      </mesh>
    </group>
  );
}

function FireHydrant({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.28, 0]} castShadow>
        <cylinderGeometry args={[0.14, 0.16, 0.55, 8]} />
        <meshStandardMaterial color="#cc2222" roughness={0.45} metalness={0.35} />
      </mesh>
      <mesh position={[0, 0.58, 0]}>
        <cylinderGeometry args={[0.1, 0.12, 0.12, 8]} />
        <meshStandardMaterial color="#aa1111" metalness={0.4} />
      </mesh>
      <mesh position={[0.16, 0.38, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.05, 0.05, 0.12, 6]} />
        <meshStandardMaterial color="#991111" />
      </mesh>
    </group>
  );
}

function Dumpster({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.55, 0]} castShadow>
        <boxGeometry args={[1.4, 1.1, 0.9]} />
        <meshStandardMaterial color="#2a4a2a" roughness={0.7} metalness={0.4} />
      </mesh>
      <mesh position={[0, 1.12, 0]} castShadow>
        <boxGeometry args={[1.45, 0.08, 0.95]} />
        <meshStandardMaterial color="#1a331a" metalness={0.5} />
      </mesh>
      <mesh position={[-0.5, 0.7, 0.48]}>
        <boxGeometry args={[0.12, 0.25, 0.06]} />
        <meshStandardMaterial color="#111" />
      </mesh>
    </group>
  );
}

function BusStop({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[-0.9, 1.2, 0]} castShadow>
        <boxGeometry args={[0.08, 2.4, 0.08]} />
        <meshStandardMaterial color="#555" metalness={0.7} />
      </mesh>
      <mesh position={[0.9, 1.2, 0]} castShadow>
        <boxGeometry args={[0.08, 2.4, 0.08]} />
        <meshStandardMaterial color="#555" metalness={0.7} />
      </mesh>
      <mesh position={[0, 2.45, 0]} castShadow>
        <boxGeometry args={[2.0, 0.08, 0.9]} />
        <meshStandardMaterial color="#334455" metalness={0.5} />
      </mesh>
      <mesh position={[0, 1.5, -0.35]}>
        <boxGeometry args={[1.8, 1.4, 0.04]} />
        <meshStandardMaterial color="#88aacc" transparent opacity={0.25} metalness={0.8} roughness={0.1} />
      </mesh>
      <mesh position={[0, 0.45, 0.15]} castShadow>
        <boxGeometry args={[1.6, 0.08, 0.45]} />
        <meshStandardMaterial color="#2a3040" />
      </mesh>
      <mesh position={[0, 2.7, 0]}>
        <boxGeometry args={[0.7, 0.25, 0.08]} />
        <meshStandardMaterial color="#00aaff" emissive="#0066aa" emissiveIntensity={1.2} />
      </mesh>
    </group>
  );
}

function Manhole({ position }: { position: [number, number, number] }) {
  return (
    <mesh position={[position[0], Y_DECAL, position[2]]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={5}>
      <circleGeometry args={[0.35, 16]} />
      <meshStandardMaterial color="#2a2a30" metalness={0.6} roughness={0.55} />
    </mesh>
  );
}

function RoadSign({ position, rotation = 0, labelColor = '#ffcc00' }: { position: [number, number, number]; rotation?: number; labelColor?: string }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 1.1, 0]} castShadow>
        <cylinderGeometry args={[0.04, 0.05, 2.2, 6]} />
        <meshStandardMaterial color="#666" metalness={0.7} />
      </mesh>
      <mesh position={[0, 2.3, 0.05]}>
        <boxGeometry args={[0.7, 0.5, 0.06]} />
        <meshStandardMaterial color={labelColor} emissive={labelColor} emissiveIntensity={0.35} />
      </mesh>
    </group>
  );
}

function Scaffolding({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {[0, 1.2, 2.4].map((y) => (
        <group key={y}>
          <mesh position={[-0.8, y, -0.8]}>
            <boxGeometry args={[0.06, 1.2, 0.06]} />
            <meshStandardMaterial color="#888" metalness={0.7} />
          </mesh>
          <mesh position={[0.8, y, -0.8]}>
            <boxGeometry args={[0.06, 1.2, 0.06]} />
            <meshStandardMaterial color="#888" metalness={0.7} />
          </mesh>
          <mesh position={[-0.8, y, 0.8]}>
            <boxGeometry args={[0.06, 1.2, 0.06]} />
            <meshStandardMaterial color="#888" metalness={0.7} />
          </mesh>
          <mesh position={[0.8, y, 0.8]}>
            <boxGeometry args={[0.06, 1.2, 0.06]} />
            <meshStandardMaterial color="#888" metalness={0.7} />
          </mesh>
          <mesh position={[0, y + 0.55, 0]}>
            <boxGeometry args={[1.7, 0.05, 1.7]} />
            <meshStandardMaterial color="#666" metalness={0.5} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 1.8, 0.9]}>
        <boxGeometry args={[1.8, 2.2, 0.04]} />
        <meshStandardMaterial color="#2255aa" transparent opacity={0.35} />
      </mesh>
    </group>
  );
}

/** Shared curtain-wall texture (1 draw call per face instead of hundreds of window meshes). */
const facadeTextureCache = new Map<string, THREE.CanvasTexture>();

function getFacadeTexture(seed: number, color: string) {
  const key = `${seed}|${color}`;
  const hit = facadeTextureCache.get(key);
  if (hit) return hit;

  const size = 128;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);

  // darker structural grid
  ctx.strokeStyle = 'rgba(15,23,42,0.55)';
  ctx.lineWidth = 2;
  const cols = 5;
  const rows = 8;
  const cellW = size / cols;
  const cellH = size / rows;
  for (let x = 0; x <= cols; x++) {
    ctx.beginPath();
    ctx.moveTo(x * cellW, 0);
    ctx.lineTo(x * cellW, size);
    ctx.stroke();
  }
  for (let y = 0; y <= rows; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * cellH);
    ctx.lineTo(size, y * cellH);
    ctx.stroke();
  }

  // windows
  const rng = seededRng(seed + 40);
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const lit = rng() > 0.4;
      const padX = 3;
      const padY = 4;
      ctx.fillStyle = lit ? 'rgba(255, 236, 170, 0.95)' : 'rgba(120, 180, 230, 0.75)';
      ctx.fillRect(col * cellW + padX, r * cellH + padY, cellW - padX * 2, cellH - padY * 2);
      if (lit) {
        ctx.fillStyle = 'rgba(255, 220, 120, 0.35)';
        ctx.fillRect(col * cellW + padX, r * cellH + padY, cellW - padX * 2, (cellH - padY * 2) * 0.45);
      }
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  facadeTextureCache.set(key, tex);
  return tex;
}

/** Token usage → tall purple beacon + stacked neon rings on the roof */
function TokenRings({ metrics, height, roofW }: { metrics: ModelMetrics; height: number; roofW: number }) {
  const tokT = Math.min(1, metrics.tokens / 6000);
  const count = Math.max(1, Math.min(7, Math.round(1 + tokT * 6)));
  const r0 = Math.max(0.55, roofW * 0.42);
  const beamH = 2 + tokT * 10;
  return (
    <group position={[0, height + 0.15, 0]}>
      {/* vertical token beam */}
      <mesh position={[0, beamH / 2, 0]}>
        <cylinderGeometry args={[0.12 + tokT * 0.18, 0.22 + tokT * 0.25, beamH, 10]} />
        <meshStandardMaterial
          color="#c084fc"
          emissive="#a855f7"
          emissiveIntensity={2.2}
          transparent
          opacity={0.85}
        />
      </mesh>
      {Array.from({ length: count }).map((_, i) => (
        <mesh key={i} position={[0, 0.2 + i * 0.32, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <torusGeometry args={[r0 + i * 0.22, 0.09, 8, 32]} />
          <meshStandardMaterial
            color="#a855f7"
            emissive="#a855f7"
            emissiveIntensity={2.2}
            metalness={0.35}
            roughness={0.2}
          />
        </mesh>
      ))}
    </group>
  );
}

/** Huge facade metric bars + numeric labels (quality / speed / tokens). */
function InteriorMetricCore({
  metrics,
  height,
  width,
  depth,
}: {
  metrics: ModelMetrics;
  height: number;
  width: number;
  depth: number;
}) {
  const maxH = Math.max(6, height * 0.78);
  const baseY = 1.4;
  const barW = Math.max(0.45, width * 0.18);
  const barD = 0.35;
  const gap = Math.max(barW * 1.35, width * 0.28);
  const z = depth / 2 + 0.2;
  const specs = [
    { t: metrics.quality / 100, color: '#3b82f6', label: 'Q', value: metrics.qualityLabel },
    { t: metrics.speed / 100, color: '#22c55e', label: 'S', value: metrics.speedLabel },
    { t: Math.min(1, metrics.tokens / 6000), color: '#a855f7', label: 'T', value: metrics.tokensLabel },
  ];
  return (
    <group>
      <mesh position={[0, baseY + maxH / 2, z - 0.06]}>
        <boxGeometry args={[gap * 3.6, maxH + 1.4, 0.1]} />
        <meshStandardMaterial
          color="#020617"
          emissive="#0f172a"
          emissiveIntensity={0.6}
          metalness={0.45}
          roughness={0.3}
        />
      </mesh>
      {specs.map((s, i) => {
        const h = 0.8 + s.t * maxH;
        const x = (i - 1) * gap;
        return (
          <group key={i}>
            <mesh position={[x, baseY + maxH / 2, z]}>
              <boxGeometry args={[barW * 0.92, maxH, barD * 0.55]} />
              <meshStandardMaterial color="#1e293b" transparent opacity={0.7} />
            </mesh>
            <mesh position={[x, baseY + h / 2, z + 0.04]}>
              <boxGeometry args={[barW, h, barD]} />
              <meshStandardMaterial
                color={s.color}
                emissive={s.color}
                emissiveIntensity={1.8}
                metalness={0.15}
                roughness={0.22}
              />
            </mesh>
            {/* glow halo */}
            <mesh position={[x, baseY + h / 2, z + 0.08]}>
              <boxGeometry args={[barW * 1.25, h * 1.02, 0.08]} />
              <meshBasicMaterial color={s.color} transparent opacity={0.35} depthWrite={false} />
            </mesh>
            <FaceCamera position={[x, baseY + maxH + 0.55, z + 0.15]}>
              <Text
                fontSize={0.42}
                color={s.color}
                anchorX="center"
                anchorY="middle"
                outlineWidth={0.03}
                outlineColor="#0f172a"
                fontWeight={800}
              >
                {s.label} {s.value}
              </Text>
            </FaceCamera>
          </group>
        );
      })}
    </group>
  );
}

/** Floating cost badge so height meaning is obvious. */
function CostBadge({ metrics, height }: { metrics: ModelMetrics; height: number }) {
  return (
    <FaceCamera position={[0, height * 0.55, 0]}>
      <Text
        fontSize={0.85}
        color="#fb923c"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.06}
        outlineColor="#0f172a"
        fontWeight={800}
      >
        {metrics.costLabel}
      </Text>
      <Text
        position={[0, -0.7, 0]}
        fontSize={0.38}
        color="#fdba74"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.03}
        outlineColor="#0f172a"
      >
        COST
      </Text>
    </FaceCamera>
  );
}

/** Tall skyscraper — textured facade (fast) + setbacks + spire. */
function ModelBuilding({
  building,
  seed,
  growKey,
  animateGrowth,
  onInspect,
  onNearby,
}: {
  building: BuildingData;
  seed: number;
  growKey: number;
  animateGrowth: boolean;
  onInspect: (b: BuildingData) => void;
  onNearby: (b: BuildingData | null) => void;
}) {
  const m = building.metrics;
  // Glow tracks quality (brighter = higher quality)
  const qualityGlow = m ? 0.35 + (m.quality / 100) * 1.4 : 0.22;
  const speedAccent = m ? m.speed / 100 : 0.5;
  const targetH = building.height;
  const W = building.width;
  const D = building.depth;

  const groupRef = useRef<THREE.Group>(null);
  const scaleY = useRef(animateGrowth ? 0.08 : 1);
  const startRef = useRef(0);
  const delay = (seed % 13) * 0.04;

  useEffect(() => {
    if (!animateGrowth) {
      scaleY.current = 1;
      if (groupRef.current) groupRef.current.scale.y = 1;
      return;
    }
    scaleY.current = 0.08;
    startRef.current = performance.now() / 1000;
    if (groupRef.current) groupRef.current.scale.y = 0.08;
  }, [growKey, animateGrowth, targetH]);

  useFrame(() => {
    if (!animateGrowth || !groupRef.current) return;
    if (scaleY.current >= 0.999) {
      groupRef.current.scale.y = 1;
      return;
    }
    const t = performance.now() / 1000 - startRef.current - delay;
    if (t < 0) return;
    // ease-out cubic grow ~1.1s
    const p = Math.min(1, t / 1.15);
    const eased = 1 - (1 - p) ** 3;
    scaleY.current = 0.08 + eased * 0.92;
    groupRef.current.scale.y = scaleY.current;
  });

  const H = targetH;
  const podiumH = Math.min(3.0, H * 0.09);
  const midH = H * 0.58;
  const upperH = H * 0.22;
  const crownH = Math.max(1.4, H - podiumH - midH - upperH);
  const midY = podiumH + midH / 2;
  const upperY = podiumH + midH + upperH / 2;
  const crownY = podiumH + midH + upperH + crownH / 2;
  const upperW = W * 0.84;
  const upperD = D * 0.84;
  const crownW = W * 0.64;
  const crownD = D * 0.64;
  const spireH = 2.8 + H * 0.07;

  const facadeMap = useMemo(() => getFacadeTexture(seed, building.color), [seed, building.color]);

  const handlers = {
    onClick: (e: any) => {
      e.stopPropagation();
      onInspect(building);
    },
    onPointerEnter: (e: any) => {
      e.stopPropagation();
      onNearby(building);
      document.body.style.cursor = 'pointer';
    },
    onPointerLeave: () => {
      onNearby(null);
      document.body.style.cursor = 'default';
    },
  };

  return (
    <group position={building.position}>
      <RigidBody type="fixed" colliders={false} position={[0, H / 2, 0]}>
        <CuboidCollider args={[W / 2, H / 2, D / 2]} />
      </RigidBody>

      <group ref={groupRef} scale={[1, animateGrowth ? 0.08 : 1, 1]}>
        {/* Podium */}
        <mesh position={[0, podiumH / 2, 0]} castShadow receiveShadow {...handlers}>
          <boxGeometry args={[W * 1.14, podiumH, D * 1.14]} />
          <meshStandardMaterial color="#1e293b" metalness={0.4} roughness={0.4} />
        </mesh>
        <mesh position={[0, podiumH * 0.55, D * 0.58]}>
          <boxGeometry args={[W * 0.92, podiumH * 0.65, 0.1]} />
          <meshStandardMaterial
            color="#7dd3fc"
            emissive="#38bdf8"
            emissiveIntensity={0.5}
            metalness={0.75}
            roughness={0.12}
            transparent
            opacity={0.9}
          />
        </mesh>

        {/* Main shaft with window texture */}
        <mesh position={[0, midY, 0]} castShadow receiveShadow {...handlers}>
          <boxGeometry args={[W, midH, D]} />
          <meshStandardMaterial
            map={facadeMap}
            color={building.color}
            emissive={building.color}
            emissiveIntensity={qualityGlow * 0.55}
            roughness={0.32}
            metalness={0.4}
          />
        </mesh>

        {/* Metric core bay on the facade (quality / speed / tokens) */}
        {m && <InteriorMetricCore metrics={m} height={H} width={W} depth={D} />}
        {m && <CostBadge metrics={m} height={H} />}

        {/* Setback */}
        <mesh position={[0, upperY, 0]} castShadow receiveShadow {...handlers}>
          <boxGeometry args={[upperW, upperH, upperD]} />
          <meshStandardMaterial
            map={facadeMap}
            color={building.color}
            emissive={building.color}
            emissiveIntensity={qualityGlow * 0.65}
            roughness={0.3}
            metalness={0.45}
          />
        </mesh>

        {/* Crown */}
        <mesh position={[0, crownY, 0]} castShadow receiveShadow {...handlers}>
          <boxGeometry args={[crownW, crownH, crownD]} />
          <meshStandardMaterial
            color={building.color}
            emissive={building.color}
            emissiveIntensity={qualityGlow * 0.9}
            roughness={0.25}
            metalness={0.55}
          />
        </mesh>

        {/* Floor ledges (few only) */}
        {[0.28, 0.55, 0.82].map((t, i) => (
          <mesh key={i} position={[0, podiumH + midH * t, 0]}>
            <boxGeometry args={[W * 1.05, 0.14, D * 1.05]} />
            <meshStandardMaterial color="#0f172a" metalness={0.55} roughness={0.35} />
          </mesh>
        ))}

        {/* Speed stripe — thick full-height neon edge */}
        <mesh position={[W / 2 + 0.08, H * 0.5, 0]}>
          <boxGeometry args={[0.28, H * 0.92, D * 0.22]} />
          <meshStandardMaterial
            color={speedAccent > 0.55 ? '#16a34a' : speedAccent > 0.35 ? '#ca8a04' : '#dc2626'}
            emissive={speedAccent > 0.55 ? '#22c55e' : speedAccent > 0.35 ? '#eab308' : '#ef4444'}
            emissiveIntensity={1.6}
          />
        </mesh>
        <mesh position={[-W / 2 - 0.08, H * 0.5, 0]}>
          <boxGeometry args={[0.28, H * 0.92, D * 0.22]} />
          <meshStandardMaterial
            color={speedAccent > 0.55 ? '#16a34a' : speedAccent > 0.35 ? '#ca8a04' : '#dc2626'}
            emissive={speedAccent > 0.55 ? '#22c55e' : speedAccent > 0.35 ? '#eab308' : '#ef4444'}
            emissiveIntensity={1.6}
          />
        </mesh>
        {/* front speed ribbon */}
        <mesh position={[0, H * 0.52, D / 2 + 0.08]}>
          <boxGeometry args={[W * 0.22, H * 0.88, 0.12]} />
          <meshStandardMaterial
            color={speedAccent > 0.55 ? '#16a34a' : speedAccent > 0.35 ? '#ca8a04' : '#dc2626'}
            emissive={speedAccent > 0.55 ? '#22c55e' : speedAccent > 0.35 ? '#eab308' : '#ef4444'}
            emissiveIntensity={1.8}
          />
        </mesh>

        {/* Spire */}
        <mesh position={[0, H + spireH / 2, 0]} castShadow>
          <cylinderGeometry args={[0.07, 0.2, spireH, 6]} />
          <meshStandardMaterial color="#64748b" metalness={0.85} roughness={0.25} />
        </mesh>
        <mesh position={[0, H + spireH + 0.22, 0]}>
          <sphereGeometry args={[0.16, 10, 10]} />
          <meshStandardMaterial
            color={building.color}
            emissive={building.color}
            emissiveIntensity={2 + qualityGlow}
          />
        </mesh>

        <mesh position={[crownW * 0.18, H + 0.32, 0]} castShadow>
          <boxGeometry args={[0.65, 0.5, 0.55]} />
          <meshStandardMaterial color="#334155" metalness={0.5} roughness={0.4} />
        </mesh>

        {m && <TokenRings metrics={m} height={H} roofW={crownW} />}

        <BuildingLabel
          text={building.shortName}
          rank={m?.rank}
          position={[0, H + spireH + 0.65 + (m ? Math.min(4, Math.ceil(m.tokens / 1200)) * 0.12 : 0), 0]}
        />
      </group>
    </group>
  );
}

export default function City({
  buildings,
  growKey = 0,
  animateGrowth = false,
  onInspect,
  onNearby,
}: CityProps) {

  const grid = useMemo(() => {
    const half = CITY_SIZE / 2;
    const roads: { key: string; position: [number, number, number]; size: [number, number] }[] = [];
    const sidewalks: { key: string; position: [number, number, number]; size: [number, number] }[] = [];
    const crosswalks: { key: string; position: [number, number, number]; horizontal: boolean }[] = [];
    const markings: {
      key: string;
      position: [number, number, number];
      length: number;
      horizontal: boolean;
    }[] = [];

    for (let z = -half; z <= half; z += BLOCK) {
      roads.push({
        key: `h-road-${z}`,
        position: [0, 0, z],
        size: [CITY_SIZE + ROAD_W, ROAD_W],
      });
      sidewalks.push({
        key: `h-sw-n-${z}`,
        position: [0, 0, z - ROAD_W / 2 - SIDEWALK_W / 2],
        size: [CITY_SIZE + ROAD_W, SIDEWALK_W],
      });
      sidewalks.push({
        key: `h-sw-s-${z}`,
        position: [0, 0, z + ROAD_W / 2 + SIDEWALK_W / 2],
        size: [CITY_SIZE + ROAD_W, SIDEWALK_W],
      });
      markings.push({
        key: `h-mark-${z}`,
        position: [0, 0, z],
        length: CITY_SIZE,
        horizontal: true,
      });
    }

    for (let x = -half; x <= half; x += BLOCK) {
      // Slightly lower vertical roads so intersections don't double-fight
      roads.push({
        key: `v-road-${x}`,
        position: [x, 0, 0],
        size: [ROAD_W, CITY_SIZE + ROAD_W],
      });
      sidewalks.push({
        key: `v-sw-w-${x}`,
        position: [x - ROAD_W / 2 - SIDEWALK_W / 2, 0, 0],
        size: [SIDEWALK_W, CITY_SIZE + ROAD_W],
      });
      sidewalks.push({
        key: `v-sw-e-${x}`,
        position: [x + ROAD_W / 2 + SIDEWALK_W / 2, 0, 0],
        size: [SIDEWALK_W, CITY_SIZE + ROAD_W],
      });
      markings.push({
        key: `v-mark-${x}`,
        position: [x, 0, 0],
        length: CITY_SIZE,
        horizontal: false,
      });
    }

    // Fewer crosswalks (every other intersection) — big win vs flicker + draw calls
    for (let x = -half; x <= half; x += BLOCK * 2) {
      for (let z = -half; z <= half; z += BLOCK * 2) {
        crosswalks.push({
          key: `cw-h-${x}-${z}`,
          position: [x, 0, z + ROAD_W * 0.32],
          horizontal: true,
        });
        crosswalks.push({
          key: `cw-v-${x}-${z}`,
          position: [x + ROAD_W * 0.32, 0, z],
          horizontal: false,
        });
      }
    }

    return { roads, sidewalks, crosswalks, markings };
  }, []);

  const props = useMemo(() => {
    const rng = seededRng(123);
    const trees: [number, number, number][] = [];
    const benches: { pos: [number, number, number]; rot: number }[] = [];
    const cones: [number, number, number][] = [];
    const billboards: { pos: [number, number, number]; color: string }[] = [];
    const cars: { pos: [number, number, number]; color: string; rot: number }[] = [];
    const plazas: { key: string; position: [number, number, number]; size: [number, number] }[] = [];
    const hydrants: [number, number, number][] = [];
    const dumpsters: { pos: [number, number, number]; rot: number }[] = [];
    const busStops: { pos: [number, number, number]; rot: number }[] = [];
    const manholes: [number, number, number][] = [];
    const signs: { pos: [number, number, number]; rot: number; color: string }[] = [];
    const scaffolds: [number, number, number][] = [];
    const fillers: {
      pos: [number, number, number];
      scale: [number, number, number];
      color: string;
    }[] = [];
    const parks: { pos: [number, number, number]; size: number }[] = [];
    const half = CITY_SIZE / 2;
    const neon = ['#00ccff', '#ff44aa', '#ffaa00', '#44ff88', '#aa66ff'];
    const carColors = ['#224466', '#662244', '#335533', '#444466', '#553322', '#113344'];
    const curb = ROAD_W / 2 + SIDEWALK_W / 2;

    for (let x = -half; x < half; x += BLOCK) {
      for (let z = -half; z < half; z += BLOCK) {
        plazas.push({
          key: `plaza-${x}-${z}`,
          position: [x + BLOCK / 2, 0.002, z + BLOCK / 2],
          size: [BLOCK - ROAD_W - 0.5, BLOCK - ROAD_W - 0.5],
        });
      }
    }

    // Manholes only (streetlights / signals / power lines / peds live in StaticStreetProps)
    for (let x = -half; x <= half; x += BLOCK * 2) {
      for (let z = -half; z <= half; z += BLOCK * 2) {
        manholes.push([x + 1.2, 0, z + 0.8]);
      }
    }

    for (let x = -half; x <= half; x += BLOCK) {
      for (let z = -half + BLOCK / 2; z < half; z += BLOCK) {
        const candidates: [number, number, number][] = [
          [x + curb + 0.55, 0, z],
          [x - curb - 0.55, 0, z],
        ];
        for (const p of candidates) {
          const tooClose = buildings.some((b) => Math.hypot(b.position[0] - p[0], b.position[2] - p[2]) < 3.2);
          if (!tooClose) trees.push(p);
        }
      }
    }

    for (let x = -half; x <= half; x += BLOCK * 2) {
      for (let z = -half + BLOCK / 2; z < half; z += BLOCK) {
        benches.push({ pos: [x + curb + 0.15, 0, z - 2], rot: Math.PI / 2 });
        hydrants.push([x + curb + 0.35, 0, z + 3]);
      }
    }

    for (let x = -half; x <= half; x += BLOCK * 2) {
      for (let z = -half; z <= half; z += BLOCK * 2) {
        cones.push([x + ROAD_W / 2 + 0.35, 0, z + 1.1]);
        signs.push({
          pos: [x + ROAD_W / 2 + 0.55, 0, z - 2.5],
          rot: -Math.PI / 2,
          color: rng() > 0.5 ? '#ffcc00' : '#ff3333',
        });
      }
    }

    let bi = 0;
    for (let x = -half + BLOCK; x < half; x += BLOCK * 2) {
      for (let z = -half + BLOCK; z < half; z += BLOCK * 2) {
        billboards.push({ pos: [x + 5, 0, z + 5], color: neon[bi++ % neon.length] });
        dumpsters.push({ pos: [x - 4, 0, z - 4], rot: rng() * Math.PI });
      }
    }

    // Bus stops along major corridors
    for (let x = -half + BLOCK; x < half; x += BLOCK * 3) {
      busStops.push({ pos: [x + curb + 0.3, 0, -half / 2], rot: Math.PI / 2 });
      busStops.push({ pos: [x - curb - 0.3, 0, half / 2], rot: -Math.PI / 2 });
    }

    let ci = 0;
    for (let x = -half; x <= half; x += BLOCK) {
      for (let z = -half + 5; z < half - 5; z += 8) {
        if (Math.abs(z) % BLOCK < ROAD_W + 1) continue;
        cars.push({
          pos: [x + ROAD_W / 2 - 0.95, 0, z],
          color: carColors[ci++ % carColors.length],
          rot: 0,
        });
      }
    }

    // Scaffolding near a few buildings
    buildings.slice(0, 4).forEach((b) => {
      scaffolds.push([b.position[0] + b.width / 2 + 1.2, 0, b.position[2]]);
    });

    for (let i = 0; i < 30; i++) {
      const x = (rng() - 0.5) * CITY_SIZE * 0.8;
      const z = (rng() - 0.5) * CITY_SIZE * 0.8;
      const tooClose = buildings.some((b) => Math.hypot(b.position[0] - x, b.position[2] - z) < 4);
      const nearRoad =
        Math.min(
          Math.abs((((x % BLOCK) + BLOCK) % BLOCK) - 0),
          Math.abs((((z % BLOCK) + BLOCK) % BLOCK) - 0),
        ) < ROAD_W;
      if (!tooClose && !nearRoad) trees.push([x, 0, z]);
    }

    // Fill empty plaza lots with low filler buildings, parks, extra trees
    const fillerColors = ['#94a3b8', '#7c8ea3', '#a8b4c4', '#8b9aab', '#6b7c8f', '#c4b5a5'];
    for (let x = -half + BLOCK / 2; x < half; x += BLOCK) {
      for (let z = -half + BLOCK / 2; z < half; z += BLOCK) {
        const cx = x;
        const cz = z;
        const occupied = buildings.some((b) => Math.hypot(b.position[0] - cx, b.position[2] - cz) < 7);
        if (occupied) continue;

        const roll = rng();
        if (roll < 0.35) {
          // small park
          parks.push({ pos: [cx, Y_PLAZA + 0.03, cz], size: 4 + rng() * 3 });
          for (let t = 0; t < 4; t++) {
            trees.push([cx + (rng() - 0.5) * 4, 0, cz + (rng() - 0.5) * 4]);
          }
          benches.push({ pos: [cx + 1.2, 0, cz - 1], rot: rng() * Math.PI });
        } else if (roll < 0.85) {
          // filler mid/high-rise (not a scored model building)
          const h = 8 + rng() * 18;
          const w = 2.4 + rng() * 2.2;
          const d = 2.4 + rng() * 2.2;
          fillers.push({
            pos: [cx + (rng() - 0.5) * 2, h / 2, cz + (rng() - 0.5) * 2],
            scale: [w, h, d],
            color: fillerColors[Math.floor(rng() * fillerColors.length)],
          });
          if (rng() > 0.5) {
            trees.push([cx + w * 0.7, 0, cz + d * 0.5]);
          }
        } else {
          // parking cluster
          for (let c = 0; c < 3; c++) {
            cars.push({
              pos: [cx - 2 + c * 2.1, 0, cz],
              color: carColors[Math.floor(rng() * carColors.length)],
              rot: Math.PI / 2,
            });
          }
        }
      }
    }

    return {
      trees,
      benches,
      cones,
      billboards,
      plazas,
      cars,
      fillers,
      parks,
      hydrants,
      dumpsters,
      busStops,
      manholes,
      signs,
      scaffolds,
    };
  }, [buildings]);

  const handleClick = useCallback(
    (building: BuildingData) => {
      onInspect(building);
    },
    [onInspect],
  );

  return (
    <group>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[120, 0.1, 120]} position={[0, -0.1, 0]} />
      </RigidBody>

      {/* Endless horizon skyline + physical walls around playable city */}
      <CityBoundary />

      {/* City base grass as a thin box (solid volume = no plane z-fight) */}
      <mesh position={[0, Y_GRASS, 0]} receiveShadow>
        <boxGeometry args={[CITY_SIZE + 36, 0.06, CITY_SIZE + 36]} />
        <meshStandardMaterial color="#3f7a38" roughness={0.94} />
      </mesh>

      {/* Lot plazas — also thin boxes so they don't shimmer against base grass */}
      <Instances
        limit={Math.max(props.plazas.length, 1)}
        range={props.plazas.length}
        frustumCulled={false}
      >
        <boxGeometry args={[1, 0.05, 1]} />
        <meshStandardMaterial color="#4d8f44" roughness={0.92} />
        {props.plazas.map((p, i) => (
          <Instance
            key={p.key ?? i}
            position={[p.position[0], Y_PLAZA, p.position[2]]}
            scale={[p.size[0], 1, p.size[1]]}
          />
        ))}
      </Instances>

      {/* Instanced roads (H slightly above V to reduce intersection fight) */}
      <InstancedGroundPlanes
        items={grid.roads.filter((r) => r.key.startsWith('h-')).map((r) => ({ position: r.position, size: r.size }))}
        color="#5b6470"
        y={Y_ROAD}
        polygonUnits={-2}
      />
      <InstancedGroundPlanes
        items={grid.roads.filter((r) => r.key.startsWith('v-')).map((r) => ({ position: r.position, size: r.size }))}
        color="#5b6470"
        y={Y_ROAD - 0.008}
        polygonUnits={-1}
      />

      <InstancedGroundPlanes
        items={grid.sidewalks.map((s) => ({ position: s.position, size: s.size }))}
        color="#c5c0b6"
        y={Y_SIDEWALK}
        polygonUnits={-3}
        roughness={0.85}
      />

      {grid.markings.map((m) => (
        <LaneMarkings key={m.key} position={m.position} length={m.length} horizontal={m.horizontal} />
      ))}

      {grid.crosswalks.map((c) => (
        <Crosswalk key={c.key} position={c.position} horizontal={c.horizontal} />
      ))}

      {/* Trees / benches / cones / parked cars stay here (moderate count).
          Streetlights, traffic signals, power lines, pedestrians → StaticStreetProps (instanced). */}
      {props.trees.map((pos, i) => (
        <Tree key={`tree-${i}`} position={pos} />
      ))}

      {props.benches.map((b, i) => (
        <Bench key={`bench-${i}`} position={b.pos} rotation={b.rot} />
      ))}

      {props.cones.map((pos, i) => (
        <TrafficCone key={`cone-${i}`} position={pos} />
      ))}

      {props.billboards.map((b, i) => (
        <Billboard key={`bb-${i}`} position={b.pos} color={b.color} />
      ))}

      {props.cars.map((c, i) => (
        <ParkedCar key={`car-${i}`} position={c.pos} color={c.color} rotation={c.rot} />
      ))}

      {props.hydrants.map((pos, i) => (
        <FireHydrant key={`hy-${i}`} position={pos} />
      ))}

      {props.dumpsters.map((d, i) => (
        <Dumpster key={`du-${i}`} position={d.pos} rotation={d.rot} />
      ))}

      {props.busStops.map((b, i) => (
        <BusStop key={`bs-${i}`} position={b.pos} rotation={b.rot} />
      ))}

      {props.manholes.map((pos, i) => (
        <Manhole key={`mh-${i}`} position={pos} />
      ))}

      {props.signs.map((s, i) => (
        <RoadSign key={`sg-${i}`} position={s.pos} rotation={s.rot} labelColor={s.color} />
      ))}

      {props.scaffolds.map((pos, i) => (
        <Scaffolding key={`sc-${i}`} position={pos} />
      ))}

      {/* Small parks in empty lots */}
      {props.parks.map((p, i) => (
        <group key={`park-${i}`} position={p.pos}>
          <mesh position={[0, 0, 0]} receiveShadow>
            <cylinderGeometry args={[p.size, p.size, 0.06, 20]} />
            <meshStandardMaterial color="#3f7a38" roughness={0.92} />
          </mesh>
          <mesh position={[0, 0.35, 0]}>
            <cylinderGeometry args={[0.35, 0.5, 0.3, 12]} />
            <meshStandardMaterial color="#64748b" metalness={0.4} />
          </mesh>
          <mesh position={[0, 0.7, 0]}>
            <sphereGeometry args={[0.45, 12, 12]} />
            <meshStandardMaterial color="#38bdf8" emissive="#0ea5e9" emissiveIntensity={0.35} metalness={0.3} transparent opacity={0.75} />
          </mesh>
        </group>
      ))}

      {/* Filler low-rises in empty blocks (not model buildings) */}
      <Instances limit={Math.max(props.fillers.length, 1)} range={props.fillers.length}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.55} metalness={0.2} />
        {props.fillers.map((f, i) => (
          <Instance key={`fill-${i}`} position={f.pos} scale={f.scale} color={f.color} />
        ))}
      </Instances>

      {/* Each scored model is its own colorful building mesh */}
      {buildings.map((b, idx) => (
        <ModelBuilding
          key={b.id}
          building={b}
          seed={idx * 17 + 3}
          growKey={growKey}
          animateGrowth={animateGrowth}
          onInspect={handleClick}
          onNearby={onNearby}
        />
      ))}
    </group>
  );
}
