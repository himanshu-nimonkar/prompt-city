import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const CITY = 160;
const BLOCK = 18;
const CAR_COLORS = ['#1e3a5f', '#9f1239', '#166534', '#1e40af', '#92400e', '#0f766e', '#6b21a8', '#334155'];

type Car = {
  axis: 'x' | 'z';
  lane: number;
  offset: number;
  speed: number;
  color: THREE.Color;
  dir: 1 | -1;
};

/**
 * Real-looking cars: body + cabin + wheels as separate instanced meshes
 * updated from one simulation loop (still very cheap).
 */
export default function MovingTraffic() {
  const bodyRef = useRef<THREE.InstancedMesh>(null);
  const cabinRef = useRef<THREE.InstancedMesh>(null);
  const wheelRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const cabinOffset = useMemo(() => new THREE.Matrix4().makeTranslation(0, 0.62, -0.15), []);
  const wheelLocals = useMemo(() => {
    const offsets: [number, number, number][] = [
      [-0.42, 0.16, 0.62],
      [0.42, 0.16, 0.62],
      [-0.42, 0.16, -0.62],
      [0.42, 0.16, -0.62],
    ];
    return offsets.map(([lx, ly, lz]) => {
      const m = new THREE.Matrix4();
      m.makeRotationZ(Math.PI / 2);
      m.premultiply(new THREE.Matrix4().makeTranslation(lx, ly, lz));
      return m;
    });
  }, []);
  const tmp = useMemo(() => new THREE.Matrix4(), []);
  const colored = useRef(false);

  const cars = useMemo(() => {
    const list: Car[] = [];
    const half = CITY / 2;
    let ci = 0;

    for (let z = -half; z <= half; z += BLOCK) {
      for (let n = 0; n < 2; n++) {
        list.push({
          axis: 'x',
          lane: z + (n % 2 === 0 ? -0.8 : 0.8),
          offset: Math.random() * CITY - half,
          speed: 7 + Math.random() * 4,
          color: new THREE.Color(CAR_COLORS[ci++ % CAR_COLORS.length]),
          dir: n % 2 === 0 ? 1 : -1,
        });
      }
    }
    for (let x = -half; x <= half; x += BLOCK) {
      for (let n = 0; n < 2; n++) {
        list.push({
          axis: 'z',
          lane: x + (n % 2 === 0 ? -0.8 : 0.8),
          offset: Math.random() * CITY - half,
          speed: 6.5 + Math.random() * 4,
          color: new THREE.Color(CAR_COLORS[ci++ % CAR_COLORS.length]),
          dir: n % 2 === 0 ? 1 : -1,
        });
      }
    }
    return list;
  }, []);

  useFrame((state) => {
    const body = bodyRef.current;
    const cabin = cabinRef.current;
    const wheels = wheelRef.current;
    if (!body || !cabin || !wheels) return;

    if (!colored.current) {
      cars.forEach((c, i) => body.setColorAt(i, c.color));
      if (body.instanceColor) body.instanceColor.needsUpdate = true;
      cars.forEach((c, i) => {
        cabin.setColorAt(i, c.color.clone().multiplyScalar(0.72));
      });
      if (cabin.instanceColor) cabin.instanceColor.needsUpdate = true;
      colored.current = true;
    }

    const t = state.clock.elapsedTime;
    const half = CITY / 2;
    const span = CITY;

    for (let i = 0; i < cars.length; i++) {
      const c = cars[i];
      let travel = c.offset + c.dir * c.speed * t;
      travel = ((((travel + half) % span) + span) % span) - half;

      let x = 0;
      let z = 0;
      let rotY = 0;
      if (c.axis === 'x') {
        x = travel;
        z = c.lane;
        rotY = c.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      } else {
        x = c.lane;
        z = travel;
        rotY = c.dir > 0 ? 0 : Math.PI;
      }

      // Body sits on the road
      dummy.position.set(x, 0.28, z);
      dummy.rotation.set(0, rotY, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      body.setMatrixAt(i, dummy.matrix);

      // Cabin on top of body
      tmp.copy(dummy.matrix).multiply(cabinOffset);
      cabin.setMatrixAt(i, tmp);

      for (let w = 0; w < 4; w++) {
        tmp.copy(dummy.matrix).multiply(wheelLocals[w]);
        wheels.setMatrixAt(i * 4 + w, tmp);
      }
    }

    body.instanceMatrix.needsUpdate = true;
    cabin.instanceMatrix.needsUpdate = true;
    wheels.instanceMatrix.needsUpdate = true;
  });

  const n = cars.length;

  return (
    <group>
      {/* Lower chassis */}
      <instancedMesh ref={bodyRef} args={[undefined, undefined, n]} frustumCulled={false}>
        <boxGeometry args={[1.2, 0.4, 2.2]} />
        <meshStandardMaterial roughness={0.35} metalness={0.55} />
      </instancedMesh>
      {/* Cabin / roof */}
      <instancedMesh ref={cabinRef} args={[undefined, undefined, n]} frustumCulled={false}>
        <boxGeometry args={[1.0, 0.38, 1.2]} />
        <meshStandardMaterial roughness={0.3} metalness={0.45} />
      </instancedMesh>
      {/* Wheels */}
      <instancedMesh ref={wheelRef} args={[undefined, undefined, n * 4]} frustumCulled={false}>
        <cylinderGeometry args={[0.18, 0.18, 0.14, 10]} />
        <meshStandardMaterial color="#111827" roughness={0.9} metalness={0.2} />
      </instancedMesh>
    </group>
  );
}
