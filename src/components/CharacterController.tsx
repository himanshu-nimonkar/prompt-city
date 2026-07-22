import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useKeyboardControls } from '@react-three/drei';
import { RigidBody, CapsuleCollider } from '@react-three/rapier';
import * as THREE from 'three';

interface CharacterControllerProps {
  playFootstep: () => void;
}

export default function CharacterController({ playFootstep }: CharacterControllerProps) {
  const rigidBodyRef = useRef<any>(null);
  const characterRef = useRef<THREE.Group>(null);
  const { camera, gl } = useThree();
  const [, getKeys] = useKeyboardControls();

  const moveSpeed = 14;
  const jumpForce = 8;
  const footstepTimer = useRef(0);
  const ready = useRef(false);
  // Soft clamp so players stay inside the walled city even if physics glitches
  const PLAY_LIMIT = 78;

  // Orbit-style camera around the player (mouse drag)
  const yaw = useRef(0.4);
  const pitch = useRef(0.45);
  const distance = useRef(14);
  const dragging = useRef(false);
  const lastPointer = useRef({ x: 0, y: 0 });
  const lookTarget = useRef(new THREE.Vector3());

  useEffect(() => {
    const el = gl.domElement;

    const onDown = (e: PointerEvent) => {
      // Left or right drag to look (same feel as orbit)
      if (e.button === 0 || e.button === 2) {
        dragging.current = true;
        lastPointer.current = { x: e.clientX, y: e.clientY };
        el.setPointerCapture(e.pointerId);
      }
    };

    const onUp = (e: PointerEvent) => {
      dragging.current = false;
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* ok */
      }
    };

    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      const dx = e.clientX - lastPointer.current.x;
      const dy = e.clientY - lastPointer.current.y;
      lastPointer.current = { x: e.clientX, y: e.clientY };

      yaw.current -= dx * 0.005;
      pitch.current = THREE.MathUtils.clamp(pitch.current + dy * 0.004, 0.12, 1.35);
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      distance.current = THREE.MathUtils.clamp(
        distance.current + e.deltaY * 0.015,
        6,
        40,
      );
    };

    const onContext = (e: Event) => e.preventDefault();

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('contextmenu', onContext);

    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('contextmenu', onContext);
    };
  }, [gl]);

  useFrame((_state, delta) => {
    const keys = getKeys();
    const rb = rigidBodyRef.current;
    if (!rb) return;

    const pos = rb.translation();
    const vel = rb.linvel();

    if (!ready.current) {
      ready.current = true;
    }

    if (pos.y < -2) {
      rb.setTranslation({ x: 0, y: 4, z: 8 }, true);
      rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
      return;
    }

    // Hard XY clamp to playable city bounds
    if (Math.abs(pos.x) > PLAY_LIMIT || Math.abs(pos.z) > PLAY_LIMIT) {
      const cx = THREE.MathUtils.clamp(pos.x, -PLAY_LIMIT, PLAY_LIMIT);
      const cz = THREE.MathUtils.clamp(pos.z, -PLAY_LIMIT, PLAY_LIMIT);
      rb.setTranslation({ x: cx, y: Math.max(pos.y, 1), z: cz }, true);
      rb.setLinvel({ x: 0, y: vel.y, z: 0 }, true);
    }

    // Movement relative to camera yaw (orbit-style facing)
    const forward = new THREE.Vector3(-Math.sin(yaw.current), 0, -Math.cos(yaw.current));
    const right = new THREE.Vector3(Math.cos(yaw.current), 0, -Math.sin(yaw.current));

    let mx = 0;
    let mz = 0;
    if (keys.forward) {
      mx += forward.x;
      mz += forward.z;
    }
    if (keys.backward) {
      mx -= forward.x;
      mz -= forward.z;
    }
    if (keys.leftward) {
      mx -= right.x;
      mz -= right.z;
    }
    if (keys.rightward) {
      mx += right.x;
      mz += right.z;
    }

    const move = new THREE.Vector3(mx, 0, mz);
    const isMoving = move.lengthSq() > 0;

    if (isMoving) {
      move.normalize();
      rb.setLinvel({ x: move.x * moveSpeed, y: vel.y, z: move.z * moveSpeed }, true);
      if (characterRef.current) {
        const targetAngle = Math.atan2(move.x, move.z);
        characterRef.current.rotation.y = THREE.MathUtils.lerp(
          characterRef.current.rotation.y,
          targetAngle,
          0.2,
        );
      }
      footstepTimer.current += delta;
      if (footstepTimer.current > 0.34) {
        footstepTimer.current = 0;
        playFootstep();
      }
    } else {
      rb.setLinvel({ x: 0, y: vel.y, z: 0 }, true);
      footstepTimer.current = 0;
    }

    if (keys.jump && Math.abs(vel.y) < 0.2) {
      rb.setLinvel({ x: vel.x, y: jumpForce, z: vel.z }, true);
    }

    // Spherical orbit camera around player (mouse-controlled)
    const d = distance.current;
    const cp = pitch.current;
    const cy = yaw.current;
    const offset = new THREE.Vector3(
      d * Math.sin(cy) * Math.cos(cp),
      d * Math.sin(cp),
      d * Math.cos(cy) * Math.cos(cp),
    );

    const desired = new THREE.Vector3(pos.x, pos.y, pos.z).add(offset);
    // Keep camera above ground
    desired.y = Math.max(desired.y, pos.y + 2.5);

    camera.position.lerp(desired, 1 - Math.pow(0.0004, delta));
    lookTarget.current.set(pos.x, pos.y + 1.4, pos.z);
    camera.lookAt(lookTarget.current);
  });

  return (
    <RigidBody
      ref={rigidBodyRef}
      type="dynamic"
      position={[0, 4, 10]}
      enabledRotations={[false, false, false]}
      colliders={false}
      lockRotations
      linearDamping={0.35}
      angularDamping={0.9}
      canSleep={false}
    >
      <CapsuleCollider args={[0.55, 0.32]} position={[0, 0.9, 0]} />
      <group ref={characterRef}>
        <mesh position={[0, 1.05, 0]} castShadow>
          <capsuleGeometry args={[0.32, 0.65, 4, 8]} />
          <meshStandardMaterial color="#3b5b8c" roughness={0.35} metalness={0.55} />
        </mesh>
        <mesh position={[0, 1.75, 0]} castShadow>
          <sphereGeometry args={[0.28, 16, 16]} />
          <meshStandardMaterial color="#4a6fa5" roughness={0.3} metalness={0.6} />
        </mesh>
        <mesh position={[0, 1.78, 0.2]} rotation={[0.1, 0, 0]}>
          <planeGeometry args={[0.28, 0.12]} />
          <meshStandardMaterial
            color="#38bdf8"
            emissive="#0ea5e9"
            emissiveIntensity={1.2}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>
    </RigidBody>
  );
}
