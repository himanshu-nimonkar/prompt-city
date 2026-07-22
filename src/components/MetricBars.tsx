import { Text } from '@react-three/drei';
import type { ModelMetrics } from '../types';

const METRICS: { key: keyof Pick<ModelMetrics, 'cost' | 'speed' | 'quality' | 'tokens'>; label: string; color: string; max: number }[] = [
  { key: 'cost', label: 'COST', color: '#f97316', max: 100 },
  { key: 'speed', label: 'SPD', color: '#22c55e', max: 100 },
  { key: 'quality', label: 'QLT', color: '#3b82f6', max: 100 },
  { key: 'tokens', label: 'TOK', color: '#a855f7', max: 8000 },
];

interface MetricBarsProps {
  metrics: ModelMetrics;
  position: [number, number, number];
  buildingWidth: number;
}

export default function MetricBars({ metrics, position, buildingWidth }: MetricBarsProps) {
  const barW = Math.max(buildingWidth * 0.18, 0.35);
  const gap = barW * 1.35;
  const startX = -((METRICS.length - 1) * gap) / 2;
  const maxH = 2.8;

  return (
    <group position={position}>
      {METRICS.map((m, i) => {
        const raw = metrics[m.key] as number;
        const t = Math.min(1, raw / m.max);
        const h = 0.25 + t * maxH;
        const x = startX + i * gap;
        return (
          <group key={m.key} position={[x, 0, 0]}>
            {/* track */}
            <mesh position={[0, maxH / 2 + 0.15, 0]}>
              <boxGeometry args={[barW * 0.9, maxH + 0.1, barW * 0.9]} />
              <meshStandardMaterial color="#e2e8f0" transparent opacity={0.35} />
            </mesh>
            {/* fill */}
            <mesh position={[0, h / 2 + 0.12, 0]}>
              <boxGeometry args={[barW, h, barW]} />
              <meshStandardMaterial
                color={m.color}
                emissive={m.color}
                emissiveIntensity={0.45}
                metalness={0.2}
                roughness={0.35}
              />
            </mesh>
            <Text
              position={[0, -0.15, barW * 0.6]}
              fontSize={0.18}
              color="#1e293b"
              anchorX="center"
              anchorY="top"
              outlineWidth={0.01}
              outlineColor="#ffffff"
            >
              {m.label}
            </Text>
          </group>
        );
      })}
    </group>
  );
}
