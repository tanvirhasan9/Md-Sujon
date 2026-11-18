import * as THREE from 'three';

export const PLAYABLE_RADIUS = 115;
export const ISLAND_RADIUS = 148;
export const WATER_LEVEL = -2.2;

export interface BoxCollider {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  topY: number;
  baseY: number;
}

export interface CylinderCollider {
  x: number;
  z: number;
  radius: number;
  topY: number;
}

export interface ClearZone {
  x: number;
  z: number;
  radius: number;
}

export interface WalkableFloor {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  topY: number;
}

export interface WorldColliders {
  boxes: BoxCollider[];
  cylinders: CylinderCollider[];
  clearZones?: ClearZone[];
  walkableFloors?: WalkableFloor[];
}

export function groundHeightAt(x: number, z: number): number {
  const r = Math.hypot(x, z);

  // Rolling multi-octave terrain hills
  const hills =
    Math.sin(x * 0.032) * Math.cos(z * 0.028) * 3.1 +
    Math.sin(x * 0.075 + 1.2) * Math.sin(z * 0.068 - 0.6) * 1.15 +
    Math.cos((x + z) * 0.045) * 0.85;

  // Flatten central compound plateau around (0, 0)
  const centerBlend = THREE.MathUtils.smoothstep(r, 12, 34);
  let h = hills * centerBlend + 1.4 * (1 - centerBlend);

  // Natural perimeter cliff ridge and coastal dropoff outside playable zone
  if (r > PLAYABLE_RADIUS - 10) {
    const ridgeT = THREE.MathUtils.smoothstep(r, PLAYABLE_RADIUS - 10, PLAYABLE_RADIUS + 6);
    const cliffNoise = Math.sin(Math.atan2(z, x) * 9) * 1.4 + Math.cos(r * 0.18) * 0.6;
    h += ridgeT * (6.2 + cliffNoise);
  }
  if (r > PLAYABLE_RADIUS + 14) {
    const coastDrop = THREE.MathUtils.smoothstep(r, PLAYABLE_RADIUS + 14, ISLAND_RADIUS);
    h -= coastDrop * 13.5;
  }

  return h;
}

export function surfaceHeightAt(x: number, z: number, colliders?: WorldColliders): number {
  let h = groundHeightAt(x, z);
  if (colliders?.walkableFloors) {
    for (let i = 0; i < colliders.walkableFloors.length; i++) {
      const f = colliders.walkableFloors[i];
      if (x >= f.minX && x <= f.maxX && z >= f.minZ && z <= f.maxZ && f.topY > h) {
        h = f.topY;
      }
    }
  }
  return h;
}

export function createTerrainTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Rich loamy turf under-layer
  ctx.fillStyle = '#3b4a2b';
  ctx.fillRect(0, 0, size, size);

  // Seamless organic moss, soil, and meadow tone patches (wrapped across edges)
  for (let i = 0; i < 1400; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const rad = 6 + Math.random() * 26;
    const shade = Math.random();
    const color =
      shade < 0.34
        ? 'rgba(46, 62, 32, 0.28)'
        : shade < 0.68
          ? 'rgba(84, 104, 52, 0.24)'
          : 'rgba(72, 62, 42, 0.22)';
    ctx.fillStyle = color;
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        if (x + ox + rad < 0 || x + ox - rad > size || y + oy + rad < 0 || y + oy - rad > size) continue;
        ctx.beginPath();
        ctx.arc(x + ox, y + oy, rad, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Dense painted micro grass blades & clover/straw flecks on the ground texture
  ctx.lineCap = 'round';
  for (let i = 0; i < 18000; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const len = 3 + Math.random() * 8;
    const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.4;
    const tone = Math.random();
    ctx.strokeStyle =
      tone < 0.35
        ? 'rgba(65, 92, 42, 0.55)'
        : tone < 0.72
          ? 'rgba(98, 126, 58, 0.5)'
          : tone < 0.92
            ? 'rgba(128, 146, 72, 0.42)'
            : 'rgba(148, 130, 78, 0.38)';
    ctx.lineWidth = 0.8 + Math.random() * 1.1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(32, 32);
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createTerrainNormalMap(maxAnisotropy: number): THREE.DataTexture {
  const size = 256;
  const heights = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n =
        Math.sin(x * 0.24) * Math.cos(y * 0.24) * 0.35 +
        Math.sin(x * 0.72 + y * 0.43) * 0.28 +
        Math.random() * 0.48;
      heights[y * size + x] = n;
    }
  }

  const data = new Uint8Array(size * size * 4);
  const strength = 2.4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size;
      const xp = (x + 1) % size;
      const ym = (y - 1 + size) % size;
      const yp = (y + 1) % size;
      const dx = (heights[y * size + xp] - heights[y * size + xm]) * strength;
      const dy = (heights[yp * size + x] - heights[ym * size + x]) * strength;
      const nx = -dx;
      const ny = -dy;
      const nz = 1.0;
      const len = Math.hypot(nx, ny, nz);
      const idx = (y * size + x) * 4;
      data[idx] = Math.round(((nx / len) * 0.5 + 0.5) * 255);
      data[idx + 1] = Math.round(((ny / len) * 0.5 + 0.5) * 255);
      data[idx + 2] = Math.round(((nz / len) * 0.5 + 0.5) * 255);
      data[idx + 3] = 255;
    }
  }

  const tex = new THREE.DataTexture(data, size, size);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(36, 36);
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

export function createBarkTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#4a3525';
  ctx.fillRect(0, 0, size, size);

  // Vertical bark ridges & dark fissures
  for (let i = 0; i < 420; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const w = 1.5 + Math.random() * 4.5;
    const h = 18 + Math.random() * 58;
    const r = Math.random();
    ctx.fillStyle =
      r < 0.42
        ? 'rgba(32, 21, 14, 0.55)'
        : r < 0.8
          ? 'rgba(92, 68, 48, 0.45)'
          : 'rgba(72, 82, 54, 0.25)'; // subtle moss lichen on bark
    ctx.fillRect(x, y, w, h);
    if (y + h > size) {
      ctx.fillRect(x, y - size, w, h);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 3);
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createLeafClusterTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);

  // Small dark twigs from center
  ctx.strokeStyle = '#3b2b1d';
  ctx.lineWidth = 3;
  for (let i = 0; i < 7; i++) {
    const ang = (i / 7) * Math.PI * 2 + 0.2;
    ctx.beginPath();
    ctx.moveTo(size * 0.5, size * 0.55);
    ctx.lineTo(size * 0.5 + Math.cos(ang) * 76, size * 0.5 + Math.sin(ang) * 76);
    ctx.stroke();
  }

  // Overlapping organic broadleaf cluster
  for (let i = 0; i < 95; i++) {
    const r = Math.pow(Math.random(), 0.6) * 96;
    const ang = Math.random() * Math.PI * 2;
    const lx = size * 0.5 + Math.cos(ang) * r;
    const ly = size * 0.5 + Math.sin(ang) * r;
    const leafAng = ang + (Math.random() - 0.5) * 1.1;
    const lw = 11 + Math.random() * 14;
    const lh = 6 + Math.random() * 8;

    ctx.save();
    ctx.translate(lx, ly);
    ctx.rotate(leafAng);
    const shade = Math.random();
    ctx.fillStyle =
      shade < 0.3
        ? '#2d4d24'
        : shade < 0.65
          ? '#436e2e'
          : shade < 0.9
            ? '#5c8c3a'
            : '#75a344';
    ctx.beginPath();
    ctx.ellipse(0, 0, lw, lh, 0, 0, Math.PI * 2);
    ctx.fill();
    // Midrib vein
    ctx.strokeStyle = 'rgba(180, 215, 110, 0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-lw * 0.7, 0);
    ctx.lineTo(lw * 0.7, 0);
    ctx.stroke();
    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createPineNeedleTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);

  // Branch stem from bottom center upward and fan branches
  const drawBranch = (x0: number, y0: number, x1: number, y1: number, width: number, needles: number) => {
    ctx.strokeStyle = '#402c1c';
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();

    const dx = x1 - x0;
    const dy = y1 - y0;
    const baseAng = Math.atan2(dy, dx);
    for (let i = 0; i < needles; i++) {
      const t = i / needles;
      const bx = x0 + dx * t;
      const by = y0 + dy * t;
      for (const side of [-1, 1]) {
        const na = baseAng + side * (0.45 + Math.random() * 0.55);
        const nl = (12 + Math.random() * 14) * (1 - t * 0.35);
        const shade = Math.random();
        ctx.strokeStyle =
          shade < 0.35 ? '#1f3d24' : shade < 0.75 ? '#2e5730' : '#42733c';
        ctx.lineWidth = 1.7;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + Math.cos(na) * nl, by + Math.sin(na) * nl);
        ctx.stroke();
      }
    }
  };

  drawBranch(128, 246, 128, 26, 4.5, 42);
  drawBranch(128, 210, 44, 145, 3, 28);
  drawBranch(128, 210, 212, 145, 3, 28);
  drawBranch(128, 160, 36, 90, 2.5, 26);
  drawBranch(128, 160, 220, 90, 2.5, 26);
  drawBranch(128, 110, 62, 48, 2, 20);
  drawBranch(128, 110, 194, 48, 2, 20);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createWaterNormalMap(maxAnisotropy: number): THREE.DataTexture {
  const size = 256;
  const heights = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * Math.PI * 2;
      const v = (y / size) * Math.PI * 2;
      heights[y * size + x] =
        Math.sin(u * 3 + v * 2) * 0.45 +
        Math.cos(u * 5 - v * 4) * 0.3 +
        Math.sin(u * 9 + v * 7) * 0.15;
    }
  }
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size;
      const xp = (x + 1) % size;
      const ym = (y - 1 + size) % size;
      const yp = (y + 1) % size;
      const dx = (heights[y * size + xp] - heights[y * size + xm]) * 1.8;
      const dy = (heights[yp * size + x] - heights[ym * size + x]) * 1.8;
      const len = Math.hypot(-dx, -dy, 1);
      const idx = (y * size + x) * 4;
      data[idx] = Math.round(((-dx / len) * 0.5 + 0.5) * 255);
      data[idx + 1] = Math.round(((-dy / len) * 0.5 + 0.5) * 255);
      data[idx + 2] = Math.round(((1 / len) * 0.5 + 0.5) * 255);
      data[idx + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(22, 22);
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

export function createSkyDomeTexture(): THREE.CanvasTexture {
  const w = 1024;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0.0, '#0a1628');
  grad.addColorStop(0.32, '#162c49');
  grad.addColorStop(0.47, '#344c6a');
  grad.addColorStop(0.515, '#c97a49'); // warm sunset horizon band
  grad.addColorStop(0.55, '#263547'); // matches scene fog
  grad.addColorStop(1.0, '#121b26');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Subtle high-altitude sunset clouds
  for (let i = 0; i < 65; i++) {
    const cx = Math.random() * w;
    const cy = h * (0.28 + Math.random() * 0.19);
    const rw = 40 + Math.random() * 140;
    const rh = 6 + Math.random() * 16;
    const cGrad = ctx.createRadialGradient(cx, cy, 2, cx, cy, rw);
    cGrad.addColorStop(0, 'rgba(255, 204, 153, 0.22)');
    cGrad.addColorStop(1, 'rgba(255, 204, 153, 0)');
    ctx.fillStyle = cGrad;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rw, rh, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Solar disc glow aligned with key light direction
  const sunX = w * 0.39;
  const sunY = h * 0.44;
  const sunGlow = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 95);
  sunGlow.addColorStop(0, 'rgba(255, 245, 215, 0.95)');
  sunGlow.addColorStop(0.18, 'rgba(255, 198, 120, 0.55)');
  sunGlow.addColorStop(0.55, 'rgba(245, 130, 65, 0.18)');
  sunGlow.addColorStop(1, 'rgba(245, 130, 65, 0)');
  ctx.fillStyle = sunGlow;
  ctx.beginPath();
  ctx.arc(sunX, sunY, 95, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createConcreteTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#73787d';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 900; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const s = 1 + Math.random() * 4;
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';
    ctx.fillRect(x, y, s, s);
  }

  // Panel seams
  ctx.strokeStyle = 'rgba(30, 34, 38, 0.4)';
  ctx.lineWidth = 2;
  ctx.strokeRect(2, 2, size - 4, size - 4);
  ctx.beginPath();
  ctx.moveTo(0, size / 2);
  ctx.lineTo(size, size / 2);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createHazardMetalTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#252a32';
  ctx.fillRect(0, 0, size, size);

  // Diagonal hazard stripe band along bottom
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, size * 0.72, size, size * 0.22);
  ctx.clip();
  ctx.fillStyle = '#d98a16';
  ctx.fillRect(0, size * 0.72, size, size * 0.22);
  ctx.fillStyle = '#181b20';
  for (let x = -size; x < size * 2; x += 36) {
    ctx.beginPath();
    ctx.moveTo(x, size);
    ctx.lineTo(x + 18, size);
    ctx.lineTo(x + 48, size * 0.7);
    ctx.lineTo(x + 30, size * 0.7);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Rivets
  ctx.fillStyle = '#4e5766';
  for (let x = 16; x < size; x += 32) {
    ctx.beginPath();
    ctx.arc(x, 18, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function resolveCircleCollisions(
  x: number,
  z: number,
  y: number,
  radius: number,
  colliders: WorldColliders,
): { x: number; z: number } {
  let nx = x;
  let nz = z;

  // Box colliders
  for (let i = 0; i < colliders.boxes.length; i++) {
    const b = colliders.boxes[i];
    if (y >= b.topY - 0.15) continue;
    const closestX = Math.max(b.minX, Math.min(nx, b.maxX));
    const closestZ = Math.max(b.minZ, Math.min(nz, b.maxZ));
    const dx = nx - closestX;
    const dz = nz - closestZ;
    const distSq = dx * dx + dz * dz;
    if (distSq < radius * radius) {
      if (distSq > 1e-6) {
        const dist = Math.sqrt(distSq);
        const push = radius - dist;
        nx += (dx / dist) * push;
        nz += (dz / dist) * push;
      } else {
        nx += radius;
      }
    }
  }

  // Cylinder colliders (rocks, tree trunks)
  for (let i = 0; i < colliders.cylinders.length; i++) {
    const c = colliders.cylinders[i];
    if (y >= c.topY - 0.15) continue;
    const dx = nx - c.x;
    const dz = nz - c.z;
    const minDist = radius + c.radius;
    const distSq = dx * dx + dz * dz;
    if (distSq < minDist * minDist && distSq > 1e-6) {
      const dist = Math.sqrt(distSq);
      const push = minDist - dist;
      nx += (dx / dist) * push;
      nz += (dz / dist) * push;
    }
  }

  // Keep inside playable cliff basin
  const r = Math.hypot(nx, nz);
  const maxR = PLAYABLE_RADIUS - 1.5;
  if (r > maxR) {
    const scale = maxR / r;
    nx *= scale;
    nz *= scale;
  }

  return { x: nx, z: nz };
}
