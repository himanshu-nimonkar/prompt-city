import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { BuildingData } from '../types';

interface CameraFocusProps {
  building: BuildingData | null;
  enabled: boolean;
}

/** Ease orbit camera toward a selected building. */
export default function CameraFocus({ building, enabled }: CameraFocusProps) {
  const { camera, controls } = useThree();
  const goalPos = useRef(new THREE.Vector3());
  const goalTarget = useRef(new THREE.Vector3());
  const active = useRef(false);
  const lastId = useRef<string | null>(null);

  if (building && building.id !== lastId.current) {
    lastId.current = building.id;
    active.current = enabled;
    const [x, , z] = building.position;
    const h = building.height;
    goalTarget.current.set(x, h * 0.45, z);
    // Place camera on a diagonal, scaled by height
    const dist = Math.max(18, Math.min(42, h * 1.15 + 14));
    goalPos.current.set(x + dist * 0.72, h * 0.55 + 10, z + dist * 0.72);
  }
  if (!building) {
    lastId.current = null;
    active.current = false;
  }

  useFrame((_, dt) => {
    if (!enabled || !active.current || !building) return;
    const t = 1 - Math.exp(-3.2 * dt);
    camera.position.lerp(goalPos.current, t);
    const ctrl = controls as unknown as {
      target: THREE.Vector3;
      update: () => void;
    } | null;
    if (ctrl?.target) {
      ctrl.target.lerp(goalTarget.current, t);
      ctrl.update();
    }
    if (camera.position.distanceTo(goalPos.current) < 0.35) {
      active.current = false;
    }
  });

  return null;
}
