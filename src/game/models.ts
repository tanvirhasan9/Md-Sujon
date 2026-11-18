import * as THREE from 'three';
import {
  createBarkTexture,
  createLeafClusterTexture,
  createPineNeedleTexture,
  createWaterNormalMap,
  groundHeightAt,
  ISLAND_RADIUS,
  PLAYABLE_RADIUS,
  WATER_LEVEL,
  type WorldColliders,
} from './terrain';
import type { WeaponId } from './types';

export interface OperatorRig {
  root: THREE.Group;
  bodyPivot: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  leftKnee: THREE.Group;
  rightKnee: THREE.Group;
  leftArm: THREE.Group;
  headGroup: THREE.Group;
  weaponPivot: THREE.Group;
  muzzlePoint: THREE.Object3D;
  visorMat: THREE.MeshStandardMaterial;
  armorMat: THREE.MeshStandardMaterial;
  weaponMeshGroup: THREE.Group;
  hitFlashTimer: number;
}

// Shared soft radial contact shadow texture
let cachedShadowTex: THREE.CanvasTexture | null = null;
function getContactShadowTexture(): THREE.CanvasTexture {
  if (cachedShadowTex) return cachedShadowTex;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 60);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.72)');
  grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.28)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  cachedShadowTex = tex;
  return tex;
}

// Shared procedural tactical ripstop fabric weave texture
let cachedFabricTex: THREE.CanvasTexture | null = null;
function getTacticalFabricTexture(): THREE.CanvasTexture {
  if (cachedFabricTex) return cachedFabricTex;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#313740';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 128; i += 8) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 128);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(128, i);
    ctx.stroke();
  }
  for (let i = 0; i < 420; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.04)';
    ctx.fillRect(Math.random() * 128, Math.random() * 128, 3, 3);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  cachedFabricTex = tex;
  return tex;
}

export function buildWeaponMesh(weaponId: WeaponId): THREE.Group {
  const g = new THREE.Group();
  const gunMetal = new THREE.MeshStandardMaterial({
    color: 0x20242b,
    roughness: 0.28,
    metalness: 0.86,
  });
  const polymer = new THREE.MeshStandardMaterial({
    color: 0x15171c,
    roughness: 0.72,
    metalness: 0.16,
  });
  const accentColor =
    weaponId === 'sniper' ? 0x38bdf8 : weaponId === 'shotgun' ? 0xf97316 : 0xfacc15;
  const accentMat = new THREE.MeshStandardMaterial({
    color: accentColor,
    emissive: accentColor,
    emissiveIntensity: 0.35,
    roughness: 0.25,
    metalness: 0.6,
  });

  if (weaponId === 'shotgun') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.11, 0.48), polymer);
    body.position.set(0, 0, 0.14);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.024, 0.5, 10), gunMetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.03, 0.44);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.42, 8), gunMetal);
    tube.rotation.x = Math.PI / 2;
    tube.position.set(0, -0.012, 0.4);
    const pump = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.2, 8), accentMat);
    pump.rotation.x = Math.PI / 2;
    pump.position.set(0, -0.015, 0.38);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.1, 0.24), polymer);
    stock.position.set(0, -0.025, -0.16);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.11, 0.055), polymer);
    grip.rotation.x = 0.28;
    grip.position.set(0, -0.08, -0.01);
    g.add(body, barrel, tube, pump, stock, grip);
  } else if (weaponId === 'sniper') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.62), polymer);
    body.position.set(0, 0, 0.16);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.021, 0.78, 10), gunMetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.025, 0.68);
    const suppressor = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.18, 10), polymer);
    suppressor.rotation.x = Math.PI / 2;
    suppressor.position.set(0, 0.025, 1.02);
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.28, 12), gunMetal);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.095, 0.18);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.02, 10), accentMat);
    lens.rotation.x = Math.PI / 2;
    lens.position.set(0, 0.095, 0.32);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.13, 0.08), accentMat);
    mag.position.set(0, -0.09, 0.18);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.11, 0.05), polymer);
    grip.rotation.x = 0.28;
    grip.position.set(0, -0.08, -0.02);
    g.add(body, barrel, suppressor, scope, lens, mag, grip);
  } else {
    // Tactical Assault Rifle
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.105, 0.46), polymer);
    receiver.position.set(0, 0, 0.14);
    const handguard = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.036, 0.26, 8), gunMetal);
    handguard.rotation.x = Math.PI / 2;
    handguard.position.set(0, 0.012, 0.42);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.4, 8), gunMetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, 0.54);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.16, 0.068), gunMetal);
    mag.rotation.x = 0.24;
    mag.position.set(0, -0.11, 0.22);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.11, 0.052), polymer);
    grip.rotation.x = 0.28;
    grip.position.set(0, -0.08, 0.01);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.1, 0.2), polymer);
    stock.position.set(0, -0.015, -0.16);
    const optic = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.045, 0.12), accentMat);
    optic.position.set(0, 0.072, 0.14);
    g.add(receiver, handguard, barrel, mag, grip, stock, optic);
  }

  g.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) {
      c.castShadow = true;
    }
  });
  return g;
}

export function createOperatorRig(
  teamColor: number,
  visorColor: number,
  initialWeapon: WeaponId = 'rifle',
): OperatorRig {
  const root = new THREE.Group();

  // Soft contact shadow disc grounded slightly above y=0
  const shadowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(1.32, 1.32),
    new THREE.MeshBasicMaterial({
      map: getContactShadowTexture(),
      transparent: true,
      depthWrite: false,
      opacity: 0.48,
    }),
  );
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = 0.03;
  root.add(shadowPlane);

  const bodyPivot = new THREE.Group();
  root.add(bodyPivot);

  // Realistic material palette with distinct roughness/metalness contrast
  const skinMat = new THREE.MeshStandardMaterial({
    color: 0xd9a886,
    roughness: 0.62,
    metalness: 0.02,
  });
  const hairMat = new THREE.MeshStandardMaterial({
    color: 0x1e1916,
    roughness: 0.88,
    metalness: 0.04,
  });
  const clothMat = new THREE.MeshStandardMaterial({
    color: 0x38414d,
    map: getTacticalFabricTexture(),
    roughness: 0.86,
    metalness: 0.05,
  });
  const pantsMat = new THREE.MeshStandardMaterial({
    color: 0x2c333d,
    map: getTacticalFabricTexture(),
    roughness: 0.88,
    metalness: 0.04,
  });
  const armorMat = new THREE.MeshStandardMaterial({
    color: teamColor,
    roughness: 0.42,
    metalness: 0.38,
  });
  const leatherBootMat = new THREE.MeshStandardMaterial({
    color: 0x17181c,
    roughness: 0.68,
    metalness: 0.08,
  });
  const gloveMat = new THREE.MeshStandardMaterial({
    color: 0x1e2229,
    roughness: 0.78,
    metalness: 0.06,
  });
  const visorMat = new THREE.MeshStandardMaterial({
    color: visorColor,
    emissive: visorColor,
    emissiveIntensity: 1.15,
    roughness: 0.14,
    metalness: 0.85,
  });
  const metalMat = new THREE.MeshStandardMaterial({
    color: 0x4b5563,
    roughness: 0.28,
    metalness: 0.88,
  });

  // 1. ARTICULATED HUMAN LEGS (Hip pivot at y = 0.92, knee at -0.43, ankle at -0.84)
  const makeLeg = (xOffset: number, hasHolster: boolean) => {
    const legGroup = new THREE.Group();
    legGroup.position.set(xOffset, 0.92, 0);

    // Rounded organic thigh muscle
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.086, 0.25, 6, 12), pantsMat);
    thigh.position.y = -0.21;
    thigh.scale.set(0.96, 1, 1.06);
    thigh.castShadow = true;
    legGroup.add(thigh);

    if (hasHolster) {
      const strap = new THREE.Mesh(new THREE.CylinderGeometry(0.094, 0.09, 0.045, 12), leatherBootMat);
      strap.position.y = -0.22;
      const holster = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.14, 0.095), leatherBootMat);
      holster.position.set(0.095, -0.22, 0.01);
      legGroup.add(strap, holster);
    }

    // Articulated Knee Joint
    const kneeGroup = new THREE.Group();
    kneeGroup.position.set(0, -0.43, 0);
    legGroup.add(kneeGroup);

    const kneePad = new THREE.Mesh(new THREE.SphereGeometry(0.072, 12, 10), armorMat);
    kneePad.scale.set(0.95, 1.05, 0.85);
    kneePad.position.set(0, 0, 0.035);
    kneePad.castShadow = true;
    kneeGroup.add(kneePad);

    // Tapered calf muscle -> ankle
    const calf = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.052, 0.35, 12), pantsMat);
    calf.position.set(0, -0.19, -0.008);
    calf.castShadow = true;
    kneeGroup.add(calf);

    // Tactical combat boot (ankle cuff, sculpted vamp, toe cap, tread sole)
    const bootCuff = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.062, 0.11, 12), leatherBootMat);
    bootCuff.position.set(0, -0.37, 0);
    bootCuff.castShadow = true;

    const bootBody = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.09, 0.22), leatherBootMat);
    bootBody.position.set(0, -0.445, 0.04);
    bootBody.castShadow = true;

    const bootToe = new THREE.Mesh(new THREE.SphereGeometry(0.056, 10, 8), leatherBootMat);
    bootToe.scale.set(1.0, 0.72, 1.15);
    bootToe.position.set(0, -0.452, 0.135);
    bootToe.castShadow = true;

    kneeGroup.add(bootCuff, bootBody, bootToe);
    return { legGroup, kneeGroup };
  };

  const left = makeLeg(-0.12, false);
  const right = makeLeg(0.12, true);
  const leftLeg = left.legGroup;
  const rightLeg = right.legGroup;
  const leftKnee = left.kneeGroup;
  const rightKnee = right.kneeGroup;
  bodyPivot.add(leftLeg, rightLeg);

  // 2. ANATOMICAL HUMAN PELVIS, WAIST & SCULPTED LATHE TORSO
  const pelvis = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 12), pantsMat);
  pelvis.scale.set(1.16, 0.72, 0.76);
  pelvis.position.y = 0.95;
  pelvis.castShadow = true;

  // Duty Belt + Buckle + Side Pouches
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.185, 0.19, 0.065, 16), leatherBootMat);
  belt.scale.set(1.12, 1, 0.76);
  belt.position.y = 1.03;
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.055, 0.03), metalMat);
  buckle.position.set(0, 1.03, 0.148);

  // Sculpted Anatomical Torso (narrow waist -> ribcage -> broad human shoulders)
  const torsoProfile = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.155, 0.02),
    new THREE.Vector2(0.148, 0.12),
    new THREE.Vector2(0.175, 0.26),
    new THREE.Vector2(0.205, 0.42),
    new THREE.Vector2(0.185, 0.52),
    new THREE.Vector2(0.085, 0.56),
    new THREE.Vector2(0.0, 0.57),
  ];
  const torsoGeo = new THREE.LatheGeometry(torsoProfile, 18);
  const torsoMesh = new THREE.Mesh(torsoGeo, clothMat);
  torsoMesh.scale.set(1.12, 1.0, 0.72);
  torsoMesh.position.y = 1.01;
  torsoMesh.castShadow = true;
  torsoMesh.receiveShadow = true;

  // Layered Tactical Plate Carrier Armor Vest (Front & Back plates + shoulder straps + mag pouches)
  const chestPlate = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.34, 0.075), armorMat);
  chestPlate.position.set(0, 1.33, 0.125);
  chestPlate.rotation.x = -0.06;
  chestPlate.castShadow = true;

  const backPlate = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.34, 0.07), armorMat);
  backPlate.position.set(0, 1.33, -0.125);
  backPlate.castShadow = true;

  const strapL = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.25), armorMat);
  strapL.position.set(-0.115, 1.52, 0);
  const strapR = strapL.clone();
  strapR.position.set(0.115, 1.52, 0);

  // 3 Front Magazine Pouches
  for (let i = -1; i <= 1; i++) {
    const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.115, 0.048), pantsMat);
    pouch.position.set(i * 0.088, 1.22, 0.17);
    pouch.castShadow = true;
    bodyPivot.add(pouch);
  }

  // Compact Tactical Field Pack + Comms Whip Antenna
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.32, 0.13), pantsMat);
  pack.position.set(0, 1.32, -0.21);
  pack.castShadow = true;
  const packTrim = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 0.14), armorMat);
  packTrim.position.set(0, 1.42, -0.21);
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.42, 6), metalMat);
  antenna.position.set(0.095, 1.66, -0.24);

  bodyPivot.add(pelvis, belt, buckle, torsoMesh, chestPlate, backPlate, strapL, strapR, pack, packTrim, antenna);

  // 3. HUMAN NECK, SCULPTED HEAD, FACIAL FEATURES & SPEC-OPS HELMET
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.57, 0);
  bodyPivot.add(headGroup);

  // Muscular human neck
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.076, 0.14, 14), skinMat);
  neck.position.set(0, 0.04, -0.005);
  neck.castShadow = true;
  headGroup.add(neck);

  // Cranium (human skull proportions)
  const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.112, 20, 16), skinMat);
  cranium.scale.set(0.9, 1.05, 1.02);
  cranium.position.set(0, 0.19, 0.005);
  cranium.castShadow = true;
  headGroup.add(cranium);

  // Sculpted Jawline & Chin
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.086, 16, 12), skinMat);
  jaw.scale.set(0.92, 0.88, 1.02);
  jaw.position.set(0, 0.132, 0.032);
  jaw.castShadow = true;
  headGroup.add(jaw);

  // Human Ears (left & right)
  const earGeo = new THREE.SphereGeometry(0.026, 8, 8);
  const leftEar = new THREE.Mesh(earGeo, skinMat);
  leftEar.scale.set(0.45, 1.25, 0.85);
  leftEar.position.set(-0.102, 0.185, -0.005);
  const rightEar = leftEar.clone();
  rightEar.position.x = 0.102;
  headGroup.add(leftEar, rightEar);

  // Nose Bridge & Tip
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.055, 6), skinMat);
  nose.rotation.x = Math.PI * 0.36;
  nose.position.set(0, 0.175, 0.118);
  headGroup.add(nose);

  // Facial Brow, Eyes & Mouth
  const brow = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.014, 0.022), hairMat);
  brow.position.set(0, 0.214, 0.102);
  headGroup.add(brow);

  const eyeWhiteMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.3 });
  const irisMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.2 });
  [-0.034, 0.034].forEach((ex) => {
    const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 8), eyeWhiteMat);
    sclera.scale.set(1.1, 0.78, 0.65);
    sclera.position.set(ex, 0.195, 0.099);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 8), irisMat);
    pupil.position.set(ex, 0.195, 0.106);
    headGroup.add(sclera, pupil);
  });

  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.008, 0.012), new THREE.MeshStandardMaterial({ color: 0x8f5648, roughness: 0.7 }));
  mouth.position.set(0, 0.132, 0.108);
  headGroup.add(mouth);

  // Short hair back/sides under open-face FAST tactical helmet
  const hairBack = new THREE.Mesh(new THREE.SphereGeometry(0.113, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), hairMat);
  hairBack.rotation.x = -0.35;
  hairBack.position.set(0, 0.192, -0.01);
  headGroup.add(hairBack);

  // Spec-Ops Ballistic Helmet (open face so human face & eyes show clearly)
  const helmetShell = new THREE.Mesh(
    new THREE.SphereGeometry(0.128, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.56),
    armorMat,
  );
  helmetShell.scale.set(0.96, 1.0, 1.08);
  helmetShell.rotation.x = -0.18;
  helmetShell.position.set(0, 0.205, -0.006);
  helmetShell.castShadow = true;
  headGroup.add(helmetShell);

  // NVG Mount + Tactical Goggle Visor Band (team/enemy glowing read)
  const nvgMount = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.036, 0.032), metalMat);
  nvgMount.position.set(0, 0.258, 0.112);
  const tacticalGoggles = new THREE.Mesh(new THREE.BoxGeometry(0.165, 0.042, 0.038), visorMat);
  tacticalGoggles.position.set(0, 0.235, 0.102);
  headGroup.add(nvgMount, tacticalGoggles);

  // Tactical Comms Headset Cups & Boom Mic
  const cupGeo = new THREE.CylinderGeometry(0.038, 0.038, 0.03, 12);
  cupGeo.rotateZ(Math.PI / 2);
  const leftCup = new THREE.Mesh(cupGeo, gloveMat);
  leftCup.position.set(-0.122, 0.19, -0.005);
  const rightCup = leftCup.clone();
  rightCup.position.x = 0.122;
  const micBoom = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.11, 6), metalMat);
  micBoom.rotation.x = Math.PI / 2.3;
  micBoom.rotation.z = -0.4;
  micBoom.position.set(-0.08, 0.145, 0.075);
  headGroup.add(leftCup, rightCup, micBoom);

  // 4. ARTICULATED HUMAN ARMS & GLOVED HANDS
  // Left Support Arm (reaching forward across chest to cradle rifle handguard)
  const leftArm = new THREE.Group();
  leftArm.position.set(-0.24, 1.48, 0.02);
  const lShoulder = new THREE.Mesh(new THREE.SphereGeometry(0.068, 12, 10), clothMat);
  lShoulder.castShadow = true;
  const lUpperArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.052, 0.19, 6, 10), clothMat);
  lUpperArm.position.set(0.03, -0.13, 0.08);
  lUpperArm.rotation.set(-0.55, 0, 0.25);
  lUpperArm.castShadow = true;
  const lForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.036, 0.23, 10), clothMat);
  lForearm.position.set(0.22, -0.14, 0.28);
  lForearm.rotation.set(Math.PI / 2.2, 0, -0.82);
  lForearm.castShadow = true;
  const lGlove = new THREE.Mesh(new THREE.SphereGeometry(0.042, 10, 8), gloveMat);
  lGlove.scale.set(0.95, 0.85, 1.2);
  lGlove.position.set(0.35, -0.12, 0.42);
  leftArm.add(lShoulder, lUpperArm, lForearm, lGlove);
  bodyPivot.add(leftArm);

  // Right Trigger Arm + Multi-part Weapon Pivot
  const weaponPivot = new THREE.Group();
  weaponPivot.position.set(0.24, 1.48, 0.02);

  const rShoulder = new THREE.Mesh(new THREE.SphereGeometry(0.068, 12, 10), clothMat);
  rShoulder.castShadow = true;
  const rUpperArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.052, 0.18, 6, 10), clothMat);
  rUpperArm.position.set(0.02, -0.12, 0.05);
  rUpperArm.rotation.set(-0.35, 0, -0.12);
  rUpperArm.castShadow = true;
  const rForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.036, 0.22, 10), clothMat);
  rForearm.position.set(-0.04, -0.14, 0.19);
  rForearm.rotation.set(Math.PI / 2.15, 0, 0.28);
  rForearm.castShadow = true;
  const rGlove = new THREE.Mesh(new THREE.SphereGeometry(0.042, 10, 8), gloveMat);
  rGlove.scale.set(0.9, 0.9, 1.15);
  rGlove.position.set(-0.08, -0.14, 0.3);
  weaponPivot.add(rShoulder, rUpperArm, rForearm, rGlove);

  const weaponMeshGroup = buildWeaponMesh(initialWeapon);
  weaponMeshGroup.position.set(-0.08, -0.07, 0.29);
  weaponPivot.add(weaponMeshGroup);

  const muzzlePoint = new THREE.Object3D();
  muzzlePoint.position.set(-0.08, -0.045, 0.92);
  weaponPivot.add(muzzlePoint);

  bodyPivot.add(weaponPivot);

  return {
    root,
    bodyPivot,
    leftLeg,
    rightLeg,
    leftKnee,
    rightKnee,
    leftArm,
    headGroup,
    weaponPivot,
    muzzlePoint,
    visorMat,
    armorMat,
    weaponMeshGroup,
    hitFlashTimer: 0,
  };
}

export function swapOperatorWeapon(rig: OperatorRig, weaponId: WeaponId): void {
  rig.weaponPivot.remove(rig.weaponMeshGroup);
  rig.weaponMeshGroup.traverse((child) => {
    const m = child as THREE.Mesh;
    if (m.isMesh) {
      m.geometry.dispose();
    }
  });
  const next = buildWeaponMesh(weaponId);
  next.position.set(-0.08, -0.07, 0.29);
  rig.weaponPivot.add(next);
  rig.weaponMeshGroup = next;
}

export function createBunkerStructure(
  x: number,
  z: number,
  rotY: number,
  concreteMat: THREE.Material,
  steelMat: THREE.Material,
  accentMat: THREE.Material,
  colliders: WorldColliders,
): THREE.Group {
  const group = new THREE.Group();
  const baseY = groundHeightAt(x, z);
  group.position.set(x, baseY - 0.35, z);
  group.rotation.y = rotY;

  // 1. Concrete foundation plinth
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(9.2, 0.9, 7.2), concreteMat);
  plinth.position.y = 0.45;
  plinth.receiveShadow = true;
  plinth.castShadow = true;

  // 2. Main side walls (leaving front/back doorway openings)
  const leftWall = new THREE.Mesh(new THREE.BoxGeometry(1.1, 3.2, 6.4), concreteMat);
  leftWall.position.set(-3.7, 2.3, 0);
  leftWall.castShadow = true;
  leftWall.receiveShadow = true;

  const rightWall = new THREE.Mesh(new THREE.BoxGeometry(1.1, 3.2, 6.4), concreteMat);
  rightWall.position.set(3.7, 2.3, 0);
  rightWall.castShadow = true;
  rightWall.receiveShadow = true;

  // 3. Beveled ExtrudeGeometry cantilevered bunker roof
  const roofShape = new THREE.Shape();
  roofShape.moveTo(-4.9, -3.7);
  roofShape.lineTo(4.9, -3.7);
  roofShape.lineTo(4.9, 3.7);
  roofShape.lineTo(-4.9, 3.7);
  roofShape.closePath();
  const roofGeo = new THREE.ExtrudeGeometry(roofShape, {
    depth: 0.65,
    bevelEnabled: true,
    bevelThickness: 0.22,
    bevelSize: 0.25,
    bevelSegments: 2,
  });
  roofGeo.rotateX(Math.PI / 2);
  const roof = new THREE.Mesh(roofGeo, steelMat);
  roof.position.y = 4.65;
  roof.castShadow = true;
  roof.receiveShadow = true;

  // 4. Rooftop parapet rim & radar mast
  const radarBase = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 0.8, 10), steelMat);
  radarBase.position.set(2.2, 5.1, -1.6);
  radarBase.castShadow = true;

  const radarDish = new THREE.Mesh(new THREE.ConeGeometry(1.1, 0.55, 12, 1, true), accentMat);
  radarDish.rotation.x = Math.PI * 0.65;
  radarDish.position.set(2.2, 5.7, -1.35);

  // 5. Steel blast pillars & emissive doorway tactical strips
  const pillarGeo = new THREE.BoxGeometry(0.65, 3.2, 0.65);
  const p1 = new THREE.Mesh(pillarGeo, steelMat);
  p1.position.set(-2.1, 2.3, 3.0);
  const p2 = new THREE.Mesh(pillarGeo, steelMat);
  p2.position.set(2.1, 2.3, 3.0);
  p1.castShadow = true;
  p2.castShadow = true;

  const stripMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    emissive: 0xf59e0b,
    emissiveIntensity: 1.5,
    roughness: 0.25,
  });
  const frontStrip = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.12, 0.14), stripMat);
  frontStrip.position.set(0, 4.18, 3.62);
  const rearStrip = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.12, 0.14), stripMat);
  rearStrip.position.set(0, 4.18, -3.62);
  const radarTip = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), stripMat);
  radarTip.position.set(2.2, 6.02, -1.15);

  group.add(plinth, leftWall, rightWall, roof, radarBase, radarDish, p1, p2, frontStrip, rearStrip, radarTip);

  // Register wall colliders in world space
  const cos = Math.cos(rotY);
  const sin = Math.sin(rotY);
  const addLocalBox = (lx: number, lz: number, hx: number, hz: number, topOffset: number) => {
    const wx = x + lx * cos + lz * sin;
    const wz = z - lx * sin + lz * cos;
    const rX = Math.abs(hx * cos) + Math.abs(hz * sin);
    const rZ = Math.abs(hx * sin) + Math.abs(hz * cos);
    colliders.boxes.push({
      minX: wx - rX,
      maxX: wx + rX,
      minZ: wz - rZ,
      maxZ: wz + rZ,
      baseY: baseY - 0.35,
      topY: baseY - 0.35 + topOffset,
    });
  };
  addLocalBox(-3.7, 0, 0.6, 3.2, 4.0);
  addLocalBox(3.7, 0, 0.6, 3.2, 4.0);

  return group;
}

export function createWatchtowerStructure(
  x: number,
  z: number,
  concreteMat: THREE.Material,
  steelMat: THREE.Material,
  accentMat: THREE.Material,
  colliders: WorldColliders,
): THREE.Group {
  const group = new THREE.Group();
  const baseY = groundHeightAt(x, z);
  group.position.set(x, baseY - 0.3, z);

  // 1. Foundation pad
  const pad = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.6, 5.6), concreteMat);
  pad.position.y = 0.3;
  pad.receiveShadow = true;

  // 2. Four steel truss legs
  const legGeo = new THREE.BoxGeometry(0.45, 6.2, 0.45);
  const offsets: [number, number][] = [
    [-2.0, -2.0],
    [2.0, -2.0],
    [-2.0, 2.0],
    [2.0, 2.0],
  ];
  for (const [ox, oz] of offsets) {
    const leg = new THREE.Mesh(legGeo, steelMat);
    leg.position.set(ox, 3.4, oz);
    leg.castShadow = true;
    group.add(leg);

    colliders.boxes.push({
      minX: x + ox - 0.28,
      maxX: x + ox + 0.28,
      minZ: z + oz - 0.28,
      maxZ: z + oz + 0.28,
      baseY: baseY - 0.3,
      topY: baseY + 6.5,
    });
  }

  // 3. Observation deck + parapet
  const deck = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.45, 5.4), steelMat);
  deck.position.y = 6.5;
  deck.castShadow = true;
  deck.receiveShadow = true;

  const parapet = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.85, 0.25), concreteMat);
  parapet.position.set(0, 7.1, 2.6);
  const parapetBack = parapet.clone();
  parapetBack.position.set(0, 7.1, -2.6);

  // 4. Canopy roof + beacon light bar
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.35, 5.8), steelMat);
  canopy.position.y = 9.4;
  canopy.castShadow = true;

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 2.6, 8), accentMat);
  mast.position.y = 10.7;

  const beaconMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    emissive: 0xef4444,
    emissiveIntensity: 1.9,
    roughness: 0.2,
  });
  const mastBeacon = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 10), beaconMat);
  mastBeacon.position.y = 12.05;

  group.add(pad, deck, parapet, parapetBack, canopy, mast, mastBeacon);
  return group;
}

const HOUSE_PALETTES = [
  { wall: 0xd8cdb8, trim: 0x4b382a, roof: 0x9c422c, floor: 0x7c5838, lantern: 0xfbbf24 }, // Terracotta Villa
  { wall: 0xb68a5c, trim: 0x2e251e, roof: 0x2f3b49, floor: 0x6b4b32, lantern: 0xfde047 }, // Cedar Timber Cabin
  { wall: 0xaab4a2, trim: 0x3b4238, roof: 0x6b3a2e, floor: 0x6e5a44, lantern: 0xf59e0b }, // Woodland Cottage
  { wall: 0xc2c9d1, trim: 0x2a3441, roof: 0x1e293b, floor: 0x5c4b3c, lantern: 0x7dd3fc }, // Slate Coastal House
];

export function createHouseStructure(
  x: number,
  z: number,
  rotY: number,
  variant: number,
  twoStory: boolean,
  concreteMat: THREE.Material,
  colliders: WorldColliders,
): THREE.Group {
  const palette = HOUSE_PALETTES[variant % HOUSE_PALETTES.length];
  const group = new THREE.Group();
  const baseY = groundHeightAt(x, z);
  group.position.set(x, baseY - 0.3, z);
  group.rotation.y = rotY;

  const wallMat = new THREE.MeshStandardMaterial({
    color: palette.wall,
    roughness: 0.86,
    metalness: 0.04,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: palette.trim,
    roughness: 0.72,
    metalness: 0.08,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    color: palette.roof,
    roughness: 0.68,
    metalness: 0.14,
  });
  const floorMat = new THREE.MeshStandardMaterial({
    color: palette.floor,
    roughness: 0.82,
    metalness: 0.05,
  });
  const lanternMat = new THREE.MeshStandardMaterial({
    color: palette.lantern,
    emissive: palette.lantern,
    emissiveIntensity: 1.6,
    roughness: 0.2,
  });

  // House footprint: width 9.2 (X: -4.6..4.6), depth 7.6 (Z: -3.8..3.8)
  // 1. Concrete Foundation Plinth + Front Porch + Entry Step
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.72, 8.0), concreteMat);
  plinth.position.set(0, 0.36, 0);
  plinth.receiveShadow = true;
  plinth.castShadow = true;

  const interiorFloor = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.08, 7.0), floorMat);
  interiorFloor.position.set(0, 0.74, 0);
  interiorFloor.receiveShadow = true;

  const porch = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.52, 2.0), concreteMat);
  porch.position.set(0, 0.26, 4.75);
  porch.receiveShadow = true;
  porch.castShadow = true;

  const step = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.26, 0.75), concreteMat);
  step.position.set(0, 0.13, 6.0);
  step.receiveShadow = true;

  group.add(plinth, interiorFloor, porch, step);

  // Wall height & ground story (0.72 to 3.82 = 3.1m tall ceiling)
  const floorTop = 0.72;
  const wallH = 3.1;
  const wallY = floorTop + wallH * 0.5;
  const wallThick = 0.38;

  // Front Wall (z = +3.65) with centered 2.3m doorway (x = -1.15..1.15)
  const frontLeft = new THREE.Mesh(new THREE.BoxGeometry(3.45, wallH, wallThick), wallMat);
  frontLeft.position.set(-2.875, wallY, 3.65);
  frontLeft.castShadow = true;
  frontLeft.receiveShadow = true;

  const frontRight = new THREE.Mesh(new THREE.BoxGeometry(3.45, wallH, wallThick), wallMat);
  frontRight.position.set(2.875, wallY, 3.65);
  frontRight.castShadow = true;
  frontRight.receiveShadow = true;

  const frontLintel = new THREE.Mesh(new THREE.BoxGeometry(2.34, 0.76, wallThick), wallMat);
  frontLintel.position.set(0, floorTop + wallH - 0.38, 3.65);
  frontLintel.castShadow = true;

  // Door frame & Porch Pillars + Canopy + Lantern
  const doorHeader = new THREE.Mesh(new THREE.BoxGeometry(2.45, 0.14, 0.46), trimMat);
  doorHeader.position.set(0, floorTop + 2.34, 3.65);

  const porchPostGeo = new THREE.BoxGeometry(0.2, 2.55, 0.2);
  const postL = new THREE.Mesh(porchPostGeo, trimMat);
  postL.position.set(-1.95, 1.78, 5.5);
  postL.castShadow = true;
  const postR = new THREE.Mesh(porchPostGeo, trimMat);
  postR.position.set(1.95, 1.78, 5.5);
  postR.castShadow = true;

  const porchAwning = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.16, 2.15), roofMat);
  porchAwning.position.set(0, 3.12, 4.78);
  porchAwning.rotation.x = 0.14;
  porchAwning.castShadow = true;

  const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.26, 0.18), lanternMat);
  lantern.position.set(1.42, 2.52, 3.92);

  group.add(frontLeft, frontRight, frontLintel, doorHeader, postL, postR, porchAwning, lantern);

  // Back Wall (z = -3.65) with centered tactical window opening (x = -1.2..1.2)
  const backLeft = new THREE.Mesh(new THREE.BoxGeometry(3.4, wallH, wallThick), wallMat);
  backLeft.position.set(-2.9, wallY, -3.65);
  backLeft.castShadow = true;
  backLeft.receiveShadow = true;

  const backRight = new THREE.Mesh(new THREE.BoxGeometry(3.4, wallH, wallThick), wallMat);
  backRight.position.set(2.9, wallY, -3.65);
  backRight.castShadow = true;
  backRight.receiveShadow = true;

  const backSillWall = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.05, wallThick), wallMat);
  backSillWall.position.set(0, floorTop + 0.525, -3.65);
  backSillWall.castShadow = true;

  const backTopWall = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.72, wallThick), wallMat);
  backTopWall.position.set(0, floorTop + wallH - 0.36, -3.65);
  backTopWall.castShadow = true;

  const backSillTrim = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.1, 0.48), trimMat);
  backSillTrim.position.set(0, floorTop + 1.06, -3.65);

  group.add(backLeft, backRight, backSillWall, backTopWall, backSillTrim);

  // Helper to build Side Walls (x = -4.42 and x = +4.42) with window cutout
  const buildSideWall = (wx: number) => {
    const frontSeg = new THREE.Mesh(new THREE.BoxGeometry(wallThick, wallH, 2.65), wallMat);
    frontSeg.position.set(wx, wallY, 2.32);
    frontSeg.castShadow = true;
    frontSeg.receiveShadow = true;

    const backSeg = new THREE.Mesh(new THREE.BoxGeometry(wallThick, wallH, 2.65), wallMat);
    backSeg.position.set(wx, wallY, -2.32);
    backSeg.castShadow = true;
    backSeg.receiveShadow = true;

    const winLow = new THREE.Mesh(new THREE.BoxGeometry(wallThick, 1.05, 2.05), wallMat);
    winLow.position.set(wx, floorTop + 0.525, 0);
    winLow.castShadow = true;

    const winTop = new THREE.Mesh(new THREE.BoxGeometry(wallThick, 0.72, 2.05), wallMat);
    winTop.position.set(wx, floorTop + wallH - 0.36, 0);
    winTop.castShadow = true;

    const sill = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.1, 2.15), trimMat);
    sill.position.set(wx, floorTop + 1.06, 0);

    const shutterGeo = new THREE.BoxGeometry(0.1, 1.25, 0.45);
    const sh1 = new THREE.Mesh(shutterGeo, trimMat);
    sh1.position.set(wx + (wx > 0 ? 0.22 : -0.22), floorTop + 1.72, 1.28);
    const sh2 = new THREE.Mesh(shutterGeo, trimMat);
    sh2.position.set(wx + (wx > 0 ? 0.22 : -0.22), floorTop + 1.72, -1.28);

    group.add(frontSeg, backSeg, winLow, winTop, sill, sh1, sh2);
  };
  buildSideWall(-4.42);
  buildSideWall(4.42);

  // Interior Tactical Cover Table / Counter inside room
  const tableTop = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.14, 0.95), trimMat);
  tableTop.position.set(-1.95, floorTop + 0.92, -1.2);
  tableTop.castShadow = true;
  const tableBase = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.85, 0.8), concreteMat);
  tableBase.position.set(-1.95, floorTop + 0.425, -1.2);
  tableBase.castShadow = true;
  group.add(tableTop, tableBase);

  // Corner timber pilasters for silhouette crispness
  const pilasterGeo = new THREE.BoxGeometry(0.46, wallH, 0.46);
  const corners: [number, number][] = [
    [-4.45, -3.68],
    [4.45, -3.68],
    [-4.45, 3.68],
    [4.45, 3.68],
  ];
  for (const [cx, cz] of corners) {
    const pilaster = new THREE.Mesh(pilasterGeo, trimMat);
    pilaster.position.set(cx, wallY, cz);
    pilaster.castShadow = true;
    group.add(pilaster);
  }

  // Optional Upper Story (adds distinct 2-story skyline buildings!)
  let roofBaseY = floorTop + wallH;
  if (twoStory) {
    const upperFloor = new THREE.Mesh(new THREE.BoxGeometry(9.1, 0.28, 7.8), concreteMat);
    upperFloor.position.set(0, roofBaseY + 0.14, 0);
    upperFloor.castShadow = true;
    upperFloor.receiveShadow = true;

    const upperBody = new THREE.Mesh(new THREE.BoxGeometry(8.5, 2.65, 7.1), wallMat);
    upperBody.position.set(0, roofBaseY + 1.6, 0);
    upperBody.castShadow = true;
    upperBody.receiveShadow = true;

    // Warm lit upper windows
    const winFrameMat = trimMat;
    const winGlowMat = lanternMat;
    [-2.1, 2.1].forEach((wx) => {
      const fFrame = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.15, 0.16), winFrameMat);
      fFrame.position.set(wx, roofBaseY + 1.65, 3.55);
      const fGlass = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.9, 0.18), winGlowMat);
      fGlass.position.set(wx, roofBaseY + 1.65, 3.56);

      const bFrame = fFrame.clone();
      bFrame.position.z = -3.55;
      const bGlass = fGlass.clone();
      bGlass.position.z = -3.56;
      group.add(fFrame, fGlass, bFrame, bGlass);
    });

    group.add(upperFloor, upperBody);
    roofBaseY += 2.92;
  }

  // Pitched Gable Roof + Overhang Eaves + Chimney
  const gableShape = new THREE.Shape();
  gableShape.moveTo(-5.25, 0);
  gableShape.lineTo(5.25, 0);
  gableShape.lineTo(0, 2.35);
  gableShape.closePath();

  const gableWallGeo = new THREE.ExtrudeGeometry(gableShape, {
    depth: 7.75,
    bevelEnabled: false,
  });
  gableWallGeo.translate(0, 0, -3.875);
  const gableBody = new THREE.Mesh(gableWallGeo, wallMat);
  gableBody.position.set(0, roofBaseY, 0);
  gableBody.scale.set(0.89, 0.94, 0.96);
  gableBody.castShadow = true;
  group.add(gableBody);

  // Twin sloped roof overhang slabs (clean sharp silhouette)
  const slopeLen = Math.hypot(5.35, 2.42);
  const slopeAngle = Math.atan2(2.42, 5.35);
  const slopeGeo = new THREE.BoxGeometry(slopeLen, 0.22, 8.65);

  const leftRoof = new THREE.Mesh(slopeGeo, roofMat);
  leftRoof.position.set(-2.62, roofBaseY + 1.18, 0);
  leftRoof.rotation.z = slopeAngle;
  leftRoof.castShadow = true;
  leftRoof.receiveShadow = true;

  const rightRoof = new THREE.Mesh(slopeGeo, roofMat);
  rightRoof.position.set(2.62, roofBaseY + 1.18, 0);
  rightRoof.rotation.z = -slopeAngle;
  rightRoof.castShadow = true;
  rightRoof.receiveShadow = true;

  const ridgeBeam = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.28, 8.75), trimMat);
  ridgeBeam.position.set(0, roofBaseY + 2.38, 0);
  ridgeBeam.castShadow = true;

  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.9, 0.85), concreteMat);
  chimney.position.set(2.45, roofBaseY + 1.85, -1.75);
  chimney.castShadow = true;
  const chimneyCap = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.16, 1.02), trimMat);
  chimneyCap.position.set(2.45, roofBaseY + 2.84, -1.75);

  group.add(leftRoof, rightRoof, ridgeBeam, chimney, chimneyCap);

  // Register rotated world-space wall & furniture colliders (leaving front doorway clear!)
  const cos = Math.cos(rotY);
  const sin = Math.sin(rotY);
  const addLocalBox = (lx: number, lz: number, hx: number, hz: number, topOffset: number) => {
    const wx = x + lx * cos + lz * sin;
    const wz = z - lx * sin + lz * cos;
    const rX = Math.abs(hx * cos) + Math.abs(hz * sin);
    const rZ = Math.abs(hx * sin) + Math.abs(hz * cos);
    colliders.boxes.push({
      minX: wx - rX,
      maxX: wx + rX,
      minZ: wz - rZ,
      maxZ: wz + rZ,
      baseY: baseY - 0.3,
      topY: baseY - 0.3 + topOffset,
    });
  };

  // Front wall left & right halves (centered 2.3m doorway remains passable!)
  addLocalBox(-2.875, 3.65, 1.72, 0.24, 3.85);
  addLocalBox(2.875, 3.65, 1.72, 0.24, 3.85);
  // Rear wall piers + low windowsill (bullets pass over sill through open window!)
  addLocalBox(-2.9, -3.65, 1.7, 0.24, 3.85);
  addLocalBox(2.9, -3.65, 1.7, 0.24, 3.85);
  addLocalBox(0, -3.65, 1.2, 0.24, 1.05);
  // Left & Right side wall piers + low windowsills
  addLocalBox(-4.42, 2.32, 0.24, 1.35, 3.85);
  addLocalBox(-4.42, -2.32, 0.24, 1.35, 3.85);
  addLocalBox(-4.42, 0, 0.24, 1.05, 1.05);
  addLocalBox(4.42, 2.32, 0.24, 1.35, 3.85);
  addLocalBox(4.42, -2.32, 0.24, 1.35, 3.85);
  addLocalBox(4.42, 0, 0.24, 1.05, 1.05);
  // Interior table cover collider
  addLocalBox(-1.95, -1.2, 1.05, 0.5, 1.65);

  // Register walkable timber floor & porch surface so players/bots step smoothly inside
  const addWalkableFloor = (lx: number, lz: number, hx: number, hz: number, topOffset: number) => {
    const wx = x + lx * cos + lz * sin;
    const wz = z - lx * sin + lz * cos;
    const rX = Math.abs(hx * cos) + Math.abs(hz * sin);
    const rZ = Math.abs(hx * sin) + Math.abs(hz * cos);
    colliders.walkableFloors = colliders.walkableFloors || [];
    colliders.walkableFloors.push({
      minX: wx - rX,
      maxX: wx + rX,
      minZ: wz - rZ,
      maxZ: wz + rZ,
      topY: baseY - 0.3 + topOffset,
    });
  };
  addWalkableFloor(0, 0, 4.7, 3.9, 0.78);
  addWalkableFloor(0, 4.85, 2.2, 1.15, 0.52);

  // Register clear zone so trees/bushes/rocks/grass never spawn inside the house or porch
  colliders.clearZones = colliders.clearZones || [];
  colliders.clearZones.push({ x, z, radius: 7.4 });

  return group;
}

export function createLootCrateMesh(tier: 'weapon' | 'supply', hazardTex: THREE.CanvasTexture): THREE.Group {
  const g = new THREE.Group();
  const isWeapon = tier === 'weapon';
  const glowColor = isWeapon ? 0xf59e0b : 0x22d3ee;

  const bodyMat = new THREE.MeshStandardMaterial({
    map: hazardTex,
    roughness: 0.45,
    metalness: 0.65,
  });
  const lidMat = new THREE.MeshStandardMaterial({
    color: isWeapon ? 0x3b4252 : 0x1e3a5f,
    roughness: 0.35,
    metalness: 0.72,
  });
  const glowMat = new THREE.MeshStandardMaterial({
    color: glowColor,
    emissive: glowColor,
    emissiveIntensity: 1.5,
    roughness: 0.2,
    metalness: 0.3,
  });

  // 1. Crate base
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.68, 0.92), bodyMat);
  base.position.y = 0.34;
  base.castShadow = true;
  base.receiveShadow = true;

  // 2. Beveled top lid
  const lid = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.2, 0.98), lidMat);
  lid.position.y = 0.76;
  lid.castShadow = true;

  // 3. Latch trim
  const latch = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.24, 1.02), glowMat);
  latch.position.y = 0.66;

  // 4. Floating beacon ring above crate
  const beacon = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), glowMat);
  beacon.position.y = 1.45;
  beacon.name = 'beacon';

  g.add(base, lid, latch, beacon);
  return g;
}

function mergeGeometriesWithColors(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const nonIndexed = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  let totalVerts = 0;
  for (const g of nonIndexed) {
    totalVerts += g.attributes.position.count;
  }

  const pos = new Float32Array(totalVerts * 3);
  const norm = new Float32Array(totalVerts * 3);
  const uv = new Float32Array(totalVerts * 2);
  const col = new Float32Array(totalVerts * 3);

  let offset = 0;
  for (const g of nonIndexed) {
    const count = g.attributes.position.count;
    pos.set(g.attributes.position.array as Float32Array, offset * 3);
    if (g.attributes.normal) {
      norm.set(g.attributes.normal.array as Float32Array, offset * 3);
    }
    if (g.attributes.uv) {
      uv.set(g.attributes.uv.array as Float32Array, offset * 2);
    }
    if (g.attributes.color) {
      col.set(g.attributes.color.array as Float32Array, offset * 3);
    } else {
      for (let i = 0; i < count * 3; i++) {
        col[offset * 3 + i] = 1.0;
      }
    }
    offset += count;
    g.dispose();
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
  merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  merged.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return merged;
}

function createPineTrunkGeometry(): THREE.BufferGeometry {
  const trunk = new THREE.CylinderGeometry(0.08, 0.34, 6.2, 8, 7);
  trunk.translate(0, 3.1, 0);
  const pos = trunk.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const ang = Math.atan2(z, x);
    // Natural organic trunk bend + root flare
    const flare = y < 0.8 ? 1 + (0.8 - y) * 0.45 * (0.7 + 0.3 * Math.cos(ang * 4)) : 1;
    const bendX = Math.sin(y * 0.65) * 0.08;
    const bendZ = Math.cos(y * 0.52) * 0.06;
    pos.setXYZ(i, x * flare + bendX, y, z * flare + bendZ);

    const shade = THREE.MathUtils.lerp(0.65, 1.0, THREE.MathUtils.clamp(y / 3.0, 0, 1));
    col[i * 3] = shade;
    col[i * 3 + 1] = shade;
    col[i * 3 + 2] = shade;
  }
  trunk.setAttribute('color', new THREE.BufferAttribute(col, 3));
  trunk.computeVertexNormals();
  return trunk;
}

function createPineCanopyGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const tiers = [
    { y: 2.1, count: 7, len: 2.35, width: 1.45, droop: 0.38, tilt: 0.42 },
    { y: 3.1, count: 7, len: 2.05, width: 1.32, droop: 0.32, tilt: 0.38 },
    { y: 4.05, count: 6, len: 1.72, width: 1.15, droop: 0.26, tilt: 0.34 },
    { y: 4.95, count: 5, len: 1.35, width: 0.95, droop: 0.2, tilt: 0.28 },
    { y: 5.75, count: 4, len: 0.95, width: 0.72, droop: 0.14, tilt: 0.2 },
  ];

  for (let t = 0; t < tiers.length; t++) {
    const tier = tiers[t];
    for (let b = 0; b < tier.count; b++) {
      const yaw = (b / tier.count) * Math.PI * 2 + t * 0.52;
      const card = new THREE.PlaneGeometry(tier.width, tier.len, 2, 3);
      // Shift so v=0 (bottom of canvas stem) sits at origin and card extends along +Y then rotates outward
      card.translate(0, tier.len * 0.5, 0);
      const pos = card.attributes.position;
      const col = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        const lx = pos.getX(i);
        const ly = pos.getY(i); // 0..len
        const uRatio = ly / tier.len;
        // V-crease across branch width + natural downward bough droop
        const vFold = -Math.abs(lx) * 0.16;
        const bend = -uRatio * uRatio * tier.droop;
        pos.setZ(i, vFold + bend);

        const ao = THREE.MathUtils.lerp(0.54, 1.06, uRatio) * THREE.MathUtils.lerp(0.84, 1.05, t / 4);
        col[i * 3] = ao * 0.94;
        col[i * 3 + 1] = ao;
        col[i * 3 + 2] = ao * 0.92;
      }
      card.setAttribute('color', new THREE.BufferAttribute(col, 3));
      card.rotateX(Math.PI / 2 - tier.tilt);
      card.rotateZ(((b % 2 === 0 ? 1 : -1) * 0.18));
      card.rotateY(yaw);
      card.translate(0, tier.y, 0);
      card.computeVertexNormals();
      parts.push(card);
    }
  }

  // Crown top leader sprays
  for (let k = 0; k < 2; k++) {
    const topCard = new THREE.PlaneGeometry(0.85, 1.15, 1, 2);
    topCard.translate(0, 6.45, 0);
    topCard.rotateY(k * (Math.PI / 2));
    parts.push(topCard);
  }

  return mergeGeometriesWithColors(parts);
}

function createBroadleafTrunkGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const main = new THREE.CylinderGeometry(0.18, 0.36, 2.75, 8, 5);
  main.translate(0, 1.37, 0);
  const pos = main.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const ang = Math.atan2(z, x);
    const flare = y < 0.7 ? 1 + (0.7 - y) * 0.5 * (0.7 + 0.3 * Math.cos(ang * 4)) : 1;
    pos.setXYZ(i, x * flare + Math.sin(y * 0.9) * 0.06, y, z * flare);
  }
  main.computeVertexNormals();
  parts.push(main);

  // Four diverging primary limbs
  const limbSpecs = [
    { yaw: 0.2, tilt: 0.55, len: 2.35, r0: 0.14, r1: 0.055 },
    { yaw: 1.85, tilt: 0.62, len: 2.15, r0: 0.13, r1: 0.05 },
    { yaw: 3.4, tilt: 0.52, len: 2.25, r0: 0.135, r1: 0.05 },
    { yaw: 5.05, tilt: 0.58, len: 2.05, r0: 0.12, r1: 0.048 },
  ];
  for (const limb of limbSpecs) {
    const g = new THREE.CylinderGeometry(limb.r1, limb.r0, limb.len, 6, 2);
    g.translate(0, limb.len * 0.5, 0);
    g.rotateZ(limb.tilt);
    g.rotateY(limb.yaw);
    g.translate(0, 2.35, 0);
    parts.push(g);
  }

  return mergeGeometriesWithColors(parts);
}

function createBroadleafCanopyGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const seeded = (n: number) => {
    const s = Math.sin(n * 91.7 + 17.3) * 43758.5453;
    return s - Math.floor(s);
  };

  // Sub-crowns centered around the 4 limb tips + central upper dome
  const centers: [number, number, number, number][] = [
    [0, 5.25, 0, 1.45],
    [-1.15, 4.45, 0.3, 1.25],
    [0.35, 4.35, -1.15, 1.25],
    [1.1, 4.5, 0.4, 1.2],
    [-0.25, 4.2, 1.15, 1.2],
  ];

  let idx = 0;
  for (const [cx, cy, cz, spread] of centers) {
    for (let k = 0; k < 5; k++) {
      idx++;
      const card = new THREE.PlaneGeometry(2.1, 2.1, 2, 2);
      const pos = card.attributes.position;
      const col = new Float32Array(pos.count * 3);
      for (let v = 0; v < pos.count; v++) {
        const vx = pos.getX(v);
        const vy = pos.getY(v);
        const dist = Math.hypot(vx, vy);
        // Gentle cupped dome on leaf spray card
        pos.setZ(v, (1.0 - dist * 0.6) * 0.24);
        const heightShade = THREE.MathUtils.clamp((cy + vy * 0.4 - 3.0) / 3.4, 0.45, 1.12);
        col[v * 3] = heightShade * 0.94;
        col[v * 3 + 1] = heightShade;
        col[v * 3 + 2] = heightShade * 0.88;
      }
      card.setAttribute('color', new THREE.BufferAttribute(col, 3));
      card.rotateX((seeded(idx * 3) - 0.5) * 1.4);
      card.rotateY(seeded(idx * 5) * Math.PI * 2);
      card.rotateZ((seeded(idx * 7) - 0.5) * 0.8);
      card.translate(
        cx + (seeded(idx * 11) - 0.5) * spread,
        cy + (seeded(idx * 13) - 0.5) * 0.9,
        cz + (seeded(idx * 17) - 0.5) * spread,
      );
      card.computeVertexNormals();
      parts.push(card);
    }
  }

  return mergeGeometriesWithColors(parts);
}

function createBushClusterGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const fronds = 6;
  for (let i = 0; i < fronds; i++) {
    const ang = (i / fronds) * Math.PI * 2;
    const card = new THREE.PlaneGeometry(1.15, 1.05, 2, 2);
    card.translate(0, 0.48, 0);
    const pos = card.attributes.position;
    const col = new Float32Array(pos.count * 3);
    for (let v = 0; v < pos.count; v++) {
      const py = pos.getY(v);
      const t = THREE.MathUtils.clamp(py / 1.05, 0, 1);
      pos.setZ(v, t * t * 0.28);
      const ao = THREE.MathUtils.lerp(0.52, 1.02, t);
      col[v * 3] = ao * 0.92;
      col[v * 3 + 1] = ao;
      col[v * 3 + 2] = ao * 0.88;
    }
    card.setAttribute('color', new THREE.BufferAttribute(col, 3));
    card.rotateX(0.45);
    card.rotateY(ang);
    card.computeVertexNormals();
    parts.push(card);
  }
  return mergeGeometriesWithColors(parts);
}

function createDenseGrassClumpGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];

  // 7 curved 3-segment grass blades per clump (root AO -> sunlit blade tip)
  const bladeSpecs = [
    { ox: 0.0, oz: 0.0, yaw: 0.15, h: 0.62, lean: 0.18, w: 0.072 },
    { ox: 0.14, oz: 0.09, yaw: 1.05, h: 0.52, lean: 0.24, w: 0.065 },
    { ox: -0.13, oz: 0.11, yaw: 2.1, h: 0.58, lean: 0.22, w: 0.068 },
    { ox: -0.15, oz: -0.12, yaw: 3.25, h: 0.48, lean: 0.26, w: 0.062 },
    { ox: 0.12, oz: -0.14, yaw: 4.35, h: 0.55, lean: 0.21, w: 0.065 },
    { ox: 0.22, oz: -0.02, yaw: 5.2, h: 0.44, lean: 0.27, w: 0.058 },
    { ox: -0.04, oz: -0.22, yaw: 2.75, h: 0.5, lean: 0.23, w: 0.06 },
  ];

  const rootCol = [0.34, 0.46, 0.24];
  const midCol = [0.68, 0.84, 0.42];
  const tipCol = [0.98, 1.08, 0.64];

  for (const b of bladeSpecs) {
    const cosY = Math.cos(b.yaw);
    const sinY = Math.sin(b.yaw);
    // Tangent across blade width & outward curve direction
    const tx = cosY;
    const tz = sinY;
    const dx = -sinY;
    const dz = cosY;

    const pushVert = (x: number, y: number, z: number, c: number[]) => {
      positions.push(x, y, z);
      normals.push(dx * 0.25, 0.94, dz * 0.25);
      colors.push(c[0], c[1], c[2]);
    };

    const y0 = 0;
    const y1 = b.h * 0.45;
    const y2 = b.h * 0.8;
    const y3 = b.h;

    const d1 = b.lean * 0.28;
    const d2 = b.lean * 0.68;
    const d3 = b.lean;

    const w0 = b.w * 0.5;
    const w1 = b.w * 0.38;
    const w2 = b.w * 0.18;

    const lx0 = b.ox - tx * w0, lz0 = b.oz - tz * w0;
    const rx0 = b.ox + tx * w0, rz0 = b.oz + tz * w0;

    const lx1 = b.ox + dx * d1 - tx * w1, lz1 = b.oz + dz * d1 - tz * w1;
    const rx1 = b.ox + dx * d1 + tx * w1, rz1 = b.oz + dz * d1 + tz * w1;

    const lx2 = b.ox + dx * d2 - tx * w2, lz2 = b.oz + dz * d2 - tz * w2;
    const rx2 = b.ox + dx * d2 + tx * w2, rz2 = b.oz + dz * d2 + tz * w2;

    const tipX = b.ox + dx * d3, tipZ = b.oz + dz * d3;

    // Lower segment (y0 -> y1)
    pushVert(lx0, y0, lz0, rootCol);
    pushVert(rx0, y0, rz0, rootCol);
    pushVert(rx1, y1, rz1, midCol);

    pushVert(lx0, y0, lz0, rootCol);
    pushVert(rx1, y1, rz1, midCol);
    pushVert(lx1, y1, lz1, midCol);

    // Mid segment (y1 -> y2)
    pushVert(lx1, y1, lz1, midCol);
    pushVert(rx1, y1, rz1, midCol);
    pushVert(rx2, y2, rz2, tipCol);

    pushVert(lx1, y1, lz1, midCol);
    pushVert(rx2, y2, rz2, tipCol);
    pushVert(lx2, y2, lz2, tipCol);

    // Tapered tip triangle (y2 -> y3)
    pushVert(lx2, y2, lz2, tipCol);
    pushVert(rx2, y2, rz2, tipCol);
    pushVert(tipX, y3, tipZ, tipCol);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geo;
}

function attachWindSway(
  mat: THREE.MeshStandardMaterial,
  uTime: { value: number },
  amp: number,
  minHeight: number,
  heightScale: number,
): void {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.vertexShader = `uniform float uTime;\n` + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
        float windPhase = instanceMatrix[3].x * 0.16 + instanceMatrix[3].z * 0.13 + uTime * 2.0;
        float swayWeight = clamp((transformed.y - ${minHeight.toFixed(2)}) * ${heightScale.toFixed(2)}, 0.0, 1.0);
        transformed.x += sin(windPhase) * ${amp.toFixed(3)} * swayWeight;
        transformed.z += cos(windPhase * 0.82) * ${(amp * 0.78).toFixed(3)} * swayWeight;
      #endif`,
    );
  };
}

export function createInstancedEnvironment(
  scene: THREE.Scene,
  colliders: WorldColliders,
  maxAnisotropy: number,
): { waterNormalTex: THREE.DataTexture; foliageTimeUniform: { value: number } } {
  const foliageTimeUniform = { value: 0 };
  const barkTex = createBarkTexture(maxAnisotropy);
  const leafTex = createLeafClusterTexture(maxAnisotropy);
  const pineTex = createPineNeedleTexture(maxAnisotropy);

  const seeded = (n: number) => {
    const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
    return s - Math.floor(s);
  };

  const isInsideClearZone = (px: number, pz: number, extraPad = 0): boolean => {
    if (!colliders.clearZones) return false;
    for (let k = 0; k < colliders.clearZones.length; k++) {
      const cz = colliders.clearZones[k];
      if (Math.hypot(px - cz.x, pz - cz.z) < cz.radius + extraPad) {
        return true;
      }
    }
    return false;
  };

  // 1. Realistic Pines & Broadleaf Woodland Trees
  const pinePositions: { x: number; z: number; scale: number }[] = [];
  const broadleafPositions: { x: number; z: number; scale: number }[] = [];

  for (let i = 0; i < 165; i++) {
    const angle = seeded(i * 3 + 1) * Math.PI * 2;
    const isPerimeter = i >= 72;
    const radius = isPerimeter
      ? PLAYABLE_RADIUS - 4 + seeded(i * 3 + 2) * 16
      : 22 + seeded(i * 3 + 2) * (PLAYABLE_RADIUS - 32);

    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (Math.hypot(x, z) < 21) continue;
    if (isInsideClearZone(x, z, 2.2)) continue;
    const gy = groundHeightAt(x, z);
    if (gy < 0.25) continue;

    const scale = 0.88 + seeded(i * 3 + 3) * 0.42;
    const isBroadleaf = !isPerimeter && seeded(i * 7 + 5) > 0.46;
    if (isBroadleaf) {
      broadleafPositions.push({ x, z, scale });
    } else {
      pinePositions.push({ x, z, scale });
    }

    if (radius < PLAYABLE_RADIUS) {
      colliders.cylinders.push({
        x,
        z,
        radius: 0.44 * scale,
        topY: gy + 5 * scale,
      });
    }
  }

  const barkMat = new THREE.MeshStandardMaterial({
    map: barkTex,
    roughness: 0.94,
    metalness: 0.02,
    vertexColors: true,
  });

  const pineCanopyMat = new THREE.MeshStandardMaterial({
    map: pineTex,
    alphaTest: 0.36,
    side: THREE.DoubleSide,
    roughness: 0.8,
    metalness: 0.03,
    vertexColors: true,
  });
  attachWindSway(pineCanopyMat, foliageTimeUniform, 0.075, 1.8, 0.22);

  const broadleafCanopyMat = new THREE.MeshStandardMaterial({
    map: leafTex,
    alphaTest: 0.4,
    side: THREE.DoubleSide,
    roughness: 0.78,
    metalness: 0.02,
    vertexColors: true,
  });
  attachWindSway(broadleafCanopyMat, foliageTimeUniform, 0.085, 2.2, 0.24);

  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();

  // Build Pine InstancedMeshes
  if (pinePositions.length > 0) {
    const pCount = pinePositions.length;
    const pTrunkGeo = createPineTrunkGeometry();
    const pCanopyGeo = createPineCanopyGeometry();
    const pTrunkInst = new THREE.InstancedMesh(pTrunkGeo, barkMat, pCount);
    const pCanopyInst = new THREE.InstancedMesh(pCanopyGeo, pineCanopyMat, pCount);
    pTrunkInst.castShadow = true;
    pTrunkInst.receiveShadow = true;
    pCanopyInst.castShadow = true;
    pCanopyInst.receiveShadow = true;
    pCanopyInst.customDepthMaterial = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
      map: pineTex,
      alphaTest: 0.36,
    });

    for (let i = 0; i < pCount; i++) {
      const p = pinePositions[i];
      const y = groundHeightAt(p.x, p.z) - 0.16;
      dummy.position.set(p.x, y, p.z);
      dummy.rotation.set(
        (seeded(i * 19) - 0.5) * 0.05,
        seeded(i * 11) * Math.PI * 2,
        (seeded(i * 23) - 0.5) * 0.05,
      );
      dummy.scale.set(p.scale, p.scale * (0.9 + seeded(i * 7) * 0.25), p.scale);
      dummy.updateMatrix();
      pTrunkInst.setMatrixAt(i, dummy.matrix);
      pCanopyInst.setMatrixAt(i, dummy.matrix);

      const gVar = 0.82 + seeded(i * 17) * 0.28;
      tint.setRGB(0.82 + seeded(i * 13) * 0.18, gVar, 0.8 + seeded(i * 29) * 0.14);
      pCanopyInst.setColorAt(i, tint);
    }

    pTrunkInst.instanceMatrix.needsUpdate = true;
    pCanopyInst.instanceMatrix.needsUpdate = true;
    if (pCanopyInst.instanceColor) pCanopyInst.instanceColor.needsUpdate = true;
    pTrunkInst.computeBoundingSphere();
    pCanopyInst.computeBoundingSphere();
    scene.add(pTrunkInst, pCanopyInst);
  }

  // Build Broadleaf InstancedMeshes
  if (broadleafPositions.length > 0) {
    const bCount = broadleafPositions.length;
    const bTrunkGeo = createBroadleafTrunkGeometry();
    const bCanopyGeo = createBroadleafCanopyGeometry();
    const bTrunkInst = new THREE.InstancedMesh(bTrunkGeo, barkMat, bCount);
    const bCanopyInst = new THREE.InstancedMesh(bCanopyGeo, broadleafCanopyMat, bCount);
    bTrunkInst.castShadow = true;
    bTrunkInst.receiveShadow = true;
    bCanopyInst.castShadow = true;
    bCanopyInst.receiveShadow = true;
    bCanopyInst.customDepthMaterial = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
      map: leafTex,
      alphaTest: 0.4,
    });

    for (let i = 0; i < bCount; i++) {
      const p = broadleafPositions[i];
      const y = groundHeightAt(p.x, p.z) - 0.16;
      dummy.position.set(p.x, y, p.z);
      dummy.rotation.set(
        (seeded(i * 31 + 3) - 0.5) * 0.06,
        seeded(i * 13 + 7) * Math.PI * 2,
        (seeded(i * 37 + 5) - 0.5) * 0.06,
      );
      dummy.scale.set(p.scale, p.scale * (0.88 + seeded(i * 41) * 0.24), p.scale);
      dummy.updateMatrix();
      bTrunkInst.setMatrixAt(i, dummy.matrix);
      bCanopyInst.setMatrixAt(i, dummy.matrix);

      // Rich woodland leaf tones (lush green to subtle olive-gold)
      const warm = seeded(i * 43);
      tint.setRGB(0.84 + warm * 0.24, 0.88 + seeded(i * 47) * 0.18, 0.72 + (1 - warm) * 0.18);
      bCanopyInst.setColorAt(i, tint);
    }

    bTrunkInst.instanceMatrix.needsUpdate = true;
    bCanopyInst.instanceMatrix.needsUpdate = true;
    if (bCanopyInst.instanceColor) bCanopyInst.instanceColor.needsUpdate = true;
    bTrunkInst.computeBoundingSphere();
    bCanopyInst.computeBoundingSphere();
    scene.add(bTrunkInst, bCanopyInst);
  }

  // 2. Understory Woodland Bushes & Ferns around trees and meadow edges
  const bushGeo = createBushClusterGeometry();
  const bushMat = new THREE.MeshStandardMaterial({
    map: leafTex,
    alphaTest: 0.4,
    side: THREE.DoubleSide,
    roughness: 0.84,
    metalness: 0.02,
    vertexColors: true,
  });
  attachWindSway(bushMat, foliageTimeUniform, 0.045, 0.1, 0.9);

  const bushMax = 260;
  const bushInst = new THREE.InstancedMesh(bushGeo, bushMat, bushMax);
  bushInst.receiveShadow = true;
  let bushCount = 0;

  const allTrees = [...pinePositions, ...broadleafPositions];
  for (let i = 0; i < 360 && bushCount < bushMax; i++) {
    let bx: number;
    let bz: number;
    if (i < allTrees.length * 1.3 && allTrees.length > 0) {
      const host = allTrees[i % allTrees.length];
      const ang = seeded(i * 9 + 11) * Math.PI * 2;
      const dist = 1.1 + seeded(i * 9 + 12) * 2.4;
      bx = host.x + Math.cos(ang) * dist;
      bz = host.z + Math.sin(ang) * dist;
    } else {
      const ang = seeded(i * 9 + 11) * Math.PI * 2;
      const rad = 20 + seeded(i * 9 + 12) * (PLAYABLE_RADIUS - 26);
      bx = Math.cos(ang) * rad;
      bz = Math.sin(ang) * rad;
    }
    if (Math.hypot(bx, bz) < 18) continue;
    if (isInsideClearZone(bx, bz, 0.8)) continue;
    const by = groundHeightAt(bx, bz);
    if (by < 0.3 || by > 5.0) continue;

    const s = 0.72 + seeded(i * 9 + 13) * 0.72;
    dummy.position.set(bx, by - 0.08, bz);
    dummy.rotation.set(0, seeded(i * 15) * Math.PI * 2, 0);
    dummy.scale.set(s, s * (0.8 + seeded(i * 21) * 0.4), s);
    dummy.updateMatrix();
    bushInst.setMatrixAt(bushCount, dummy.matrix);

    tint.setRGB(0.78 + seeded(i * 25) * 0.24, 0.85 + seeded(i * 27) * 0.2, 0.72 + seeded(i * 29) * 0.18);
    bushInst.setColorAt(bushCount, tint);
    bushCount++;
  }
  bushInst.count = bushCount;
  bushInst.instanceMatrix.needsUpdate = true;
  if (bushInst.instanceColor) bushInst.instanceColor.needsUpdate = true;
  bushInst.computeBoundingSphere();
  scene.add(bushInst);

  // 3. Instanced Tactical Cover Boulders & Perimeter Cliff Rocks
  const rockGeo = new THREE.DodecahedronGeometry(1.3, 1);
  const rockMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.88,
    metalness: 0.08,
    flatShading: true,
  });

  const rockCount = 95;
  const rockInst = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
  rockInst.castShadow = true;
  rockInst.receiveShadow = true;
  let placedRocks = 0;

  for (let i = 0; i < rockCount; i++) {
    const angle = seeded(i * 5 + 91) * Math.PI * 2;
    const isRim = i >= 45;
    const r = isRim
      ? PLAYABLE_RADIUS + 2 + seeded(i * 5 + 92) * 14
      : 18 + seeded(i * 5 + 92) * (PLAYABLE_RADIUS - 26);
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    const s = isRim ? 2.1 + seeded(i * 5 + 93) * 2.2 : 0.85 + seeded(i * 5 + 93) * 0.9;
    if (!isRim && isInsideClearZone(x, z, 1.5)) continue;
    const y = groundHeightAt(x, z) - 0.25 * s;

    dummy.position.set(x, y, z);
    dummy.rotation.set(seeded(i * 2) * 1.2, seeded(i * 3) * Math.PI * 2, seeded(i * 4) * 0.8);
    dummy.scale.set(s * 1.15, s * 0.78, s);
    dummy.updateMatrix();

    rockInst.setMatrixAt(placedRocks, dummy.matrix);
    const tone = 0.34 + seeded(i * 19) * 0.14;
    tint.setRGB(tone, tone * 0.97, tone * 0.92);
    rockInst.setColorAt(placedRocks, tint);
    placedRocks++;

    if (!isRim) {
      colliders.cylinders.push({
        x,
        z,
        radius: 1.25 * s,
        topY: y + 1.2 * s,
      });
    }
  }

  rockInst.count = placedRocks;
  rockInst.instanceMatrix.needsUpdate = true;
  if (rockInst.instanceColor) rockInst.instanceColor.needsUpdate = true;
  rockInst.computeBoundingSphere();
  scene.add(rockInst);

  // 4. Compound Cargo Containers & Tactical Jersey Barriers (registered with colliders)
  const containerSpecs: { x: number; z: number; rotY: number; color: number }[] = [
    { x: -14, z: 4, rotY: 0.18, color: 0x2b4c65 },
    { x: 13, z: -12, rotY: -0.35, color: 0x7a3428 },
  ];
  const containerGeo = new THREE.BoxGeometry(5.8, 2.55, 2.45);
  for (const c of containerSpecs) {
    const cy = groundHeightAt(c.x, c.z);
    const mat = new THREE.MeshStandardMaterial({
      color: c.color,
      roughness: 0.48,
      metalness: 0.55,
    });
    const mesh = new THREE.Mesh(containerGeo, mat);
    mesh.position.set(c.x, cy + 1.24, c.z);
    mesh.rotation.y = c.rotY;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    const cos = Math.cos(c.rotY);
    const sin = Math.sin(c.rotY);
    const rX = Math.abs(2.9 * cos) + Math.abs(1.23 * sin);
    const rZ = Math.abs(2.9 * sin) + Math.abs(1.23 * cos);
    colliders.boxes.push({
      minX: c.x - rX,
      maxX: c.x + rX,
      minZ: c.z - rZ,
      maxZ: c.z + rZ,
      baseY: cy,
      topY: cy + 2.55,
    });
  }

  const barrierGeo = new THREE.BoxGeometry(3.2, 1.05, 0.72);
  const barrierMat = new THREE.MeshStandardMaterial({
    color: 0x6c7279,
    roughness: 0.85,
    metalness: 0.12,
  });
  const barrierSpecs: [number, number, number][] = [
    [-7, 21, 0.08],
    [8, 21, -0.12],
    [-20, -4, Math.PI * 0.45],
    [22, 6, Math.PI * 0.52],
    [-9, -6, -0.25],
    [9, -5, 0.25],
  ];
  for (const [bx, bz, brot] of barrierSpecs) {
    const by = groundHeightAt(bx, bz);
    const bMesh = new THREE.Mesh(barrierGeo, barrierMat);
    bMesh.position.set(bx, by + 0.5, bz);
    bMesh.rotation.y = brot;
    bMesh.castShadow = true;
    bMesh.receiveShadow = true;
    scene.add(bMesh);

    const cos = Math.cos(brot);
    const sin = Math.sin(brot);
    const rX = Math.abs(1.6 * cos) + Math.abs(0.36 * sin);
    const rZ = Math.abs(1.6 * sin) + Math.abs(0.36 * cos);
    colliders.boxes.push({
      minX: bx - rX,
      maxX: bx + rX,
      minZ: bz - rZ,
      maxZ: bz + rZ,
      baseY: by,
      topY: by + 1.05,
    });
  }

  // 5. Dense Wind-Swaying Curved Ground Grass (4,800 multi-blade clumps)
  const grassGeo = createDenseGrassClumpGeometry();
  const grassMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.86,
    metalness: 0.02,
    side: THREE.DoubleSide,
    vertexColors: true,
  });
  attachWindSway(grassMat, foliageTimeUniform, 0.09, 0.02, 1.5);

  const grassMax = 4800;
  const grassInst = new THREE.InstancedMesh(grassGeo, grassMat, grassMax);
  grassInst.receiveShadow = true;
  let grassCount = 0;

  const isBlockedForGrass = (gx: number, gz: number): boolean => {
    if (isInsideClearZone(gx, gz, 0.2)) return true;
    for (let k = 0; k < colliders.boxes.length; k++) {
      const b = colliders.boxes[k];
      if (gx >= b.minX - 3.4 && gx <= b.maxX + 3.4 && gz >= b.minZ - 3.4 && gz <= b.maxZ + 3.4) {
        return true;
      }
    }
    return false;
  };

  for (let i = 0; i < 8200 && grassCount < grassMax; i++) {
    const angle = seeded(i * 7 + 401) * Math.PI * 2;
    // Uniform area distribution across grassy terrain outside central compound
    const r = 16.2 + Math.sqrt(seeded(i * 7 + 402)) * (PLAYABLE_RADIUS - 22);
    const gx = Math.cos(angle) * r;
    const gz = Math.sin(angle) * r;
    const gy = groundHeightAt(gx, gz);
    if (gy < 0.25 || gy > 5.0) continue;

    // Slope check so grass grows on soil/meadow slopes, not sheer vertical rock walls
    const hDx = groundHeightAt(gx + 0.6, gz) - gy;
    const hDz = groundHeightAt(gx, gz + 0.6) - gy;
    if (Math.hypot(hDx, hDz) > 0.34) continue;
    if (isBlockedForGrass(gx, gz)) continue;

    const s = 0.85 + seeded(i * 7 + 403) * 0.75;
    dummy.position.set(gx, gy - 0.03, gz);
    dummy.rotation.set(
      (seeded(i * 11 + 3) - 0.5) * 0.14,
      seeded(i * 19) * Math.PI * 2,
      (seeded(i * 13 + 5) - 0.5) * 0.14,
    );
    dummy.scale.set(s * 1.15, s * (0.78 + seeded(i * 23) * 0.55), s * 1.15);
    dummy.updateMatrix();
    grassInst.setMatrixAt(grassCount, dummy.matrix);

    const gTone = seeded(i * 29);
    tint.setRGB(
      0.42 + gTone * 0.22,
      0.56 + seeded(i * 31) * 0.24,
      0.24 + (1 - gTone) * 0.14,
    );
    grassInst.setColorAt(grassCount, tint);
    grassCount++;
  }
  grassInst.count = grassCount;
  grassInst.instanceMatrix.needsUpdate = true;
  if (grassInst.instanceColor) grassInst.instanceColor.needsUpdate = true;
  grassInst.computeBoundingSphere();
  scene.add(grassInst);

  // 6. Surrounding Coastal Ocean Plane with Specular Clearcoat & Animated Wave Normals
  const waterNormalTex = createWaterNormalMap(maxAnisotropy);
  const oceanGeo = new THREE.RingGeometry(ISLAND_RADIUS - 26, 680, 72);
  oceanGeo.rotateX(-Math.PI / 2);
  const oceanMat = new THREE.MeshPhysicalMaterial({
    color: 0x0b2d40,
    roughness: 0.14,
    metalness: 0.35,
    clearcoat: 0.85,
    clearcoatRoughness: 0.15,
    normalMap: waterNormalTex,
    normalScale: new THREE.Vector2(0.85, 0.85),
  });
  const ocean = new THREE.Mesh(oceanGeo, oceanMat);
  ocean.position.y = WATER_LEVEL;
  ocean.receiveShadow = true;
  scene.add(ocean);

  return { waterNormalTex, foliageTimeUniform };
}

export function createStormWall(): { mesh: THREE.Mesh; texture: THREE.CanvasTexture } {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, 'rgba(220, 38, 38, 0.05)');
  grad.addColorStop(0.55, 'rgba(239, 68, 68, 0.24)');
  grad.addColorStop(1, 'rgba(249, 115, 22, 0.58)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  ctx.strokeStyle = 'rgba(254, 202, 202, 0.38)';
  ctx.lineWidth = 2;
  for (let y = 0; y < 256; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(256, y);
    ctx.stroke();
  }
  for (let x = 0; x < 256; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 256);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(24, 4);

  const geo = new THREE.CylinderGeometry(1, 1, 70, 64, 1, true);
  const mat = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 26;
  mesh.renderOrder = 5;
  return { mesh, texture };
}
