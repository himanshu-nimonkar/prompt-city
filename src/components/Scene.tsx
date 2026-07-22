import { Physics } from '@react-three/rapier';
import { ContactShadows, OrbitControls } from '@react-three/drei';
import { Suspense, useEffect, useRef } from 'react';
import * as THREE from 'three';
import City from './City';
import CharacterController from './CharacterController';
import TrafficParticles from './TrafficParticles';
import MovingTraffic from './MovingTraffic';
import StaticStreetProps from './StaticStreetProps';
import CloudflareClouds from './CloudflareClouds';
import CameraFocus from './CameraFocus';
import { useSound } from '../hooks/useSound';
import type { BuildingData } from '../types';

interface SceneProps {
  viewMode: 'thirdPerson' | 'orbit';
  buildings: BuildingData[];
  growKey?: number;
  animateGrowth?: boolean;
  focusBuilding?: BuildingData | null;
  onInspect: (building: BuildingData | null) => void;
  onNearby: (building: BuildingData | null) => void;
  onToggleView: () => void;
}

// Softer daylight — higher, cooler fill, less harsh sun
const SUN_POS: [number, number, number] = [18, 70, -12];

export default function Scene({
  viewMode,
  buildings,
  growKey = 0,
  animateGrowth = false,
  focusBuilding = null,
  onInspect,
  onNearby,
  onToggleView,
}: SceneProps) {
  const nearbyRef = useRef<BuildingData | null>(null);
  const sunRef = useRef<THREE.DirectionalLight>(null);
  const { playFootstep, unlock } = useSound();

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      void unlock();
      if (e.key === 'e' || e.key === 'E') {
        if (nearbyRef.current) onInspect(nearbyRef.current);
      }
      if (e.key === 'f' || e.key === 'F') {
        onToggleView();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onInspect, onToggleView, unlock]);

  const handleNearby = (building: BuildingData | null) => {
    nearbyRef.current = building;
    onNearby(building);
  };

  return (
    <>
      <color attach="background" args={['#8ec8e8']} />
      <fog attach="fog" args={['#b7d6ea', 150, 340]} />

      <ambientLight intensity={0.72} color="#eef6ff" />
      <hemisphereLight args={['#d7ebff', '#7a9e62', 0.95]} />
      <directionalLight
        ref={sunRef}
        position={SUN_POS}
        intensity={1.35}
        color="#fff6e8"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0002}
        shadow-normalBias={0.05}
        shadow-camera-far={180}
        shadow-camera-left={-70}
        shadow-camera-right={70}
        shadow-camera-top={70}
        shadow-camera-bottom={-70}
      />
      <directionalLight position={[-40, 30, 20]} intensity={0.42} color="#b8d4f0" />
      <directionalLight position={[10, 20, 40]} intensity={0.18} color="#ffe8c8" />

      <Suspense fallback={null}>
        <CloudflareClouds />
      </Suspense>

      <Suspense fallback={null}>
        <Physics gravity={[0, -20, 0]} colliders={false} timeStep="vary">
          <City
            buildings={buildings}
            growKey={growKey}
            animateGrowth={animateGrowth}
            onInspect={onInspect}
            onNearby={handleNearby}
          />
          {viewMode === 'thirdPerson' && <CharacterController playFootstep={playFootstep} />}
        </Physics>
        <StaticStreetProps />
        <MovingTraffic />
        <TrafficParticles />
        {/* Soft contact shadows under the city (towers read planted) */}
        <ContactShadows
          position={[0, 0.12, 0]}
          opacity={0.35}
          scale={200}
          blur={2.8}
          far={50}
          resolution={512}
          color="#1e293b"
          frames={1}
        />
      </Suspense>

      {viewMode === 'orbit' && (
        <>
          <OrbitControls
            makeDefault
            enableDamping
            dampingFactor={0.08}
            maxPolarAngle={Math.PI / 2.2}
            minPolarAngle={0.12}
            minDistance={14}
            maxDistance={130}
            target={[0, 8, 0]}
            enablePan
            screenSpacePanning={false}
          />
          <CameraFocus building={focusBuilding ?? null} enabled />
        </>
      )}
    </>
  );
}
