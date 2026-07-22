import { useMemo } from 'react';
import * as THREE from 'three';

/** Procedural sky + cloud-layer canvas textures (no network assets, cheap). */
function makeSkyGradientTexture() {
  const w = 4;
  const h = 512;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  // top → horizon (canvas v increases downward; we flip on sphere with offset)
  g.addColorStop(0, '#1a4f8a'); // deep upper blue
  g.addColorStop(0.25, '#3d7ec4');
  g.addColorStop(0.5, '#6aaee0');
  g.addColorStop(0.72, '#9fd0f0');
  g.addColorStop(0.88, '#c8e4f7');
  g.addColorStop(1, '#e8f2fa'); // bright horizon
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

function makeCloudLayerTexture(seed: number, soft = true) {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);

  let s = seed;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };

  // Soft cloud blotches
  for (let i = 0; i < (soft ? 48 : 28); i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const r = (soft ? 40 : 55) + rnd() * (soft ? 90 : 120);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const a = soft ? 0.08 + rnd() * 0.12 : 0.12 + rnd() * 0.18;
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(0.55, `rgba(255,255,255,${a * 0.45})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Finer haze noise
  const img = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rnd() - 0.5) * (soft ? 10 : 16);
    img.data[i] = Math.min(255, img.data[i] + n);
    img.data[i + 1] = Math.min(255, img.data[i + 1] + n);
    img.data[i + 2] = Math.min(255, img.data[i + 2] + n);
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(soft ? 3 : 2, soft ? 1.5 : 1.2);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Textured sky dome: gradient sky + 2 scrolling-looking cloud shells.
 * Static textures only (no animation) so FPS stays high.
 */
export default function TexturedSky() {
  const { skyMap, cloudA, cloudB } = useMemo(
    () => ({
      skyMap: makeSkyGradientTexture(),
      cloudA: makeCloudLayerTexture(11, true),
      cloudB: makeCloudLayerTexture(29, false),
    }),
    [],
  );

  return (
    <group>
      {/* Inner gradient sky sphere */}
      <mesh renderOrder={-3} frustumCulled={false}>
        <sphereGeometry args={[420, 48, 32]} />
        <meshBasicMaterial map={skyMap} side={THREE.BackSide} depthWrite={false} fog={false} />
      </mesh>

      {/* Soft high cloud sheet */}
      <mesh rotation={[0.12, 0.4, 0]} renderOrder={-2} frustumCulled={false}>
        <sphereGeometry args={[390, 40, 24]} />
        <meshBasicMaterial
          map={cloudA}
          transparent
          opacity={0.55}
          side={THREE.BackSide}
          depthWrite={false}
          fog={false}
        />
      </mesh>

      {/* Lower broken cloud layer */}
      <mesh rotation={[-0.08, -0.7, 0.05]} renderOrder={-1} frustumCulled={false}>
        <sphereGeometry args={[360, 40, 24]} />
        <meshBasicMaterial
          map={cloudB}
          transparent
          opacity={0.4}
          side={THREE.BackSide}
          depthWrite={false}
          fog={false}
        />
      </mesh>
    </group>
  );
}
