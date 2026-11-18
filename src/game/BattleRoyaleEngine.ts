import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { soundFX } from './audio';
import {
  DEFAULT_CONTROL_SETTINGS,
  formatKeyCode,
  matchesControlKey,
  resolveTouchActive,
  type ControlAction,
  type ControlSettings,
} from './controls';
import {
  createBunkerStructure,
  createHouseStructure,
  createInstancedEnvironment,
  createLootCrateMesh,
  createOperatorRig,
  createStormWall,
  createWatchtowerStructure,
  swapOperatorWeapon,
  type OperatorRig,
} from './models';
import {
  createConcreteTexture,
  createHazardMetalTexture,
  createSkyDomeTexture,
  createTerrainNormalMap,
  createTerrainTexture,
  groundHeightAt,
  ISLAND_RADIUS,
  PLAYABLE_RADIUS,
  resolveCircleCollisions,
  surfaceHeightAt,
  type WorldColliders,
} from './terrain';
import type {
  GamePhase,
  HudSnapshot,
  KillFeedEntry,
  MinimapBlip,
  SquadMemberState,
  TacticalPing,
  WeaponId,
  WeaponSlotState,
  WeaponSpec,
} from './types';

export const WEAPON_SPECS: Record<WeaponId, WeaponSpec> = {
  rifle: {
    id: 'rifle',
    name: 'MK-47 CARBINE',
    shortName: 'CARBINE',
    damage: 22,
    fireRate: 8.5,
    magSize: 30,
    reloadTime: 1.55,
    range: 130,
    spread: 0.016,
    pellets: 1,
    auto: true,
    adsFov: 42,
    accentColor: '#facc15',
  },
  shotgun: {
    id: 'shotgun',
    name: 'BREACHER-12',
    shortName: 'SHOTGUN',
    damage: 14,
    fireRate: 1.45,
    magSize: 8,
    reloadTime: 1.9,
    range: 42,
    spread: 0.072,
    pellets: 7,
    auto: false,
    adsFov: 50,
    accentColor: '#f97316',
  },
  sniper: {
    id: 'sniper',
    name: 'LONGSHOT-9',
    shortName: 'SNIPER',
    damage: 82,
    fireRate: 0.9,
    magSize: 5,
    reloadTime: 2.2,
    range: 210,
    spread: 0.002,
    pellets: 1,
    auto: false,
    adsFov: 22,
    accentColor: '#38bdf8',
  },
};

const BOT_CALLSIGNS = [
  'VIPER-7',
  'KESTREL',
  'NOMAD-4',
  'SPECTRE',
  'TITAN-X',
  'RAVEN-9',
  'APEX-2',
  'COBRA-6',
  'WARDEN',
  'FALCON',
  'VECTOR',
  'ORION-3',
  'STRIKER',
  'DRIFTER',
  'JACKAL',
  'CIPHER',
  'BLITZ-8',
  'PHOENIX',
  'WRAITH',
];

const STORM_PHASES = [
  { wait: 22, shrink: 18, targetRadius: 82 },
  { wait: 18, shrink: 16, targetRadius: 52 },
  { wait: 15, shrink: 14, targetRadius: 28 },
  { wait: 12, shrink: 14, targetRadius: 10 },
];

// Pre-allocated math helpers (zero GC inside animation loop)
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _camTarget = new THREE.Vector3();
const _camDesired = new THREE.Vector3();
const _rayOrigin = new THREE.Vector3();
const _rayDir = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();

interface EnemyBot {
  id: string;
  name: string;
  alive: boolean;
  x: number;
  y: number;
  z: number;
  vy: number;
  yaw: number;
  hp: number;
  shield: number;
  weaponId: WeaponId;
  rig: OperatorRig;
  walkPhase: number;
  moveTargetX: number;
  moveTargetZ: number;
  retargetTimer: number;
  fireCooldown: number;
  windupTimer: number;
  telegraphLine: THREE.Line;
  targetEnemyId: string | null;
}

interface LootCrate {
  id: string;
  tier: 'weapon' | 'supply';
  weaponId?: WeaponId;
  x: number;
  y: number;
  z: number;
  opened: boolean;
  mesh: THREE.Group;
}

interface TracerBeam {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
}

interface SparkParticle {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
}

interface RemoteSquadAvatar {
  clientId: string;
  callsign: string;
  rig: OperatorRig;
  targetX: number;
  targetY: number;
  targetZ: number;
  targetYaw: number;
}

interface PingBeacon {
  id: string;
  mesh: THREE.Group;
  x: number;
  z: number;
  label: string;
  expiresAt: number;
}

export interface EngineCallbacks {
  onHudUpdate: (snapshot: HudSnapshot) => void;
  onPhaseChange: (phase: GamePhase) => void;
  onToggleComms: () => void;
  onDropPing: (x: number, y: number, z: number, label: string) => void;
  onPlayerStateEmit: (x: number, y: number, z: number, yaw: number, hp: number) => void;
}

export class BattleRoyaleEngine {
  private container: HTMLElement;
  private callbacks: EngineCallbacks;
  private isSoftwareGl: boolean;
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private waterNormalTex: THREE.DataTexture | null = null;
  private foliageTimeUniform: { value: number } | null = null;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();
  private frameId = 0;
  private disposed = false;

  private colliders: WorldColliders = { boxes: [], cylinders: [] };
  private phase: GamePhase = 'title';
  private pointerLocked = false;
  private draggingLook = false;

  // Input state
  private heldKeys = new Set<string>();
  private firingHeld = false;
  private adsHeld = false;
  private zoomToggle = false;
  private sprintToggle = false;
  private touchMoveX = 0;
  private touchMoveY = 0;
  private inputBlocked = false;
  private controlSettings: ControlSettings = structuredClone(DEFAULT_CONTROL_SETTINGS);
  private coyoteTimer = 0;
  private jumpBufferTimer = 0;

  // Player state
  private playerRig!: OperatorRig;
  private playerCallsign = 'GHOST-01';
  private px = 0;
  private py = 2;
  private pz = 14;
  private pvy = 0;
  private grounded = true;
  private yaw = 0;
  private pitch = -0.14;
  private walkPhase = 0;
  private hp = 100;
  private maxHp = 100;
  private shield = 50;
  private maxShield = 100;
  private medkits = 1;
  private shieldCells = 2;
  private kills = 0;
  private damageDealt = 0;
  private survivalSeconds = 0;
  private eliminatedBy: { killer: string; weapon: string } | null = null;
  private activeSlot = 0;
  private slots: WeaponSlotState[] = [];
  private fireCooldown = 0;
  private reloading = false;
  private reloadTimer = 0;

  // Camera & feel
  private camShake = 0;
  private recoilPitch = 0;
  private hitstopTimer = 0;
  private hitMarkerTimer = 0;
  private hitMarkerKill = false;
  private damageFlashTimer = 0;
  private titleOrbitAngle = 0.4;

  // World entities
  private bots: EnemyBot[] = [];
  private crates: LootCrate[] = [];
  private tracers: TracerBeam[] = [];
  private sparks: SparkParticle[] = [];
  private killFeed: KillFeedEntry[] = [];
  private remoteAvatars = new Map<string, RemoteSquadAvatar>();
  private pingBeacons: PingBeacon[] = [];
  private hazardTex!: THREE.CanvasTexture;

  // Storm & Volumetric Fog
  private stormWall!: THREE.Mesh;
  private stormTex!: THREE.CanvasTexture;
  private stormFogRing!: THREE.Mesh;
  private stormFogRingMat!: THREE.ShaderMaterial;
  private volumetricFogShells: {
    mesh: THREE.Mesh;
    mat: THREE.ShaderMaterial;
    weight: number;
    minProximity: number;
  }[] = [];
  private stormFogFactor = 0;
  private readonly baseFogColor = new THREE.Color(0x263547);
  private readonly stormFogColor = new THREE.Color(0x3a1424);
  private readonly workingFogColor = new THREE.Color(0x263547);
  private stormPhase = 1;
  private stormTimer = STORM_PHASES[0].wait;
  private stormShrinking = false;
  private stormRadius = 114;
  private stormStartRadius = 114;
  private stormTargetRadius = STORM_PHASES[0].targetRadius;
  private stormCenterX = 0;
  private stormCenterZ = 0;
  private stormDamageTick = 0;

  private hudEmitAccum = 0;
  private netEmitAccum = 0;
  private lastPointerUnlockTime = 0;

  // Bound event listeners
  private onKeyDownBound: (e: KeyboardEvent) => void;
  private onKeyUpBound: (e: KeyboardEvent) => void;
  private onMouseMoveBound: (e: MouseEvent) => void;
  private onMouseDownBound: (e: MouseEvent) => void;
  private onMouseUpBound: (e: MouseEvent) => void;
  private onPointerLockChangeBound: () => void;
  private onPointerLockErrorBound: () => void;
  private onResizeBound: () => void;
  private onBlurBound: () => void;
  private onContextMenuBound: (e: MouseEvent) => void;

  constructor(container: HTMLElement, callbacks: EngineCallbacks) {
    this.container = container;
    this.callbacks = callbacks;

    this.isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2),
    );
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    const skyColor = new THREE.Color(0x263547);
    this.scene.background = skyColor;
    this.scene.fog = new THREE.FogExp2(0x263547, 0.0046);

    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    const aspect = w / h;
    this.camera = new THREE.PerspectiveCamera(65, aspect, 0.2, 540);

    // Mandatory Studio IBL Environment Map
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    this.setupLighting();
    this.buildArenaWorld();
    this.setupPlayerAndPools();
    this.resetMatchState('title');

    if (!this.isSoftwareGl) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.34, 0.35, 0.88);
      this.composer.addPass(this.bloomPass);
      this.composer.addPass(new OutputPass());
      this.renderer.compile(this.scene, this.camera);
    }

    // Bind events
    this.onKeyDownBound = (e) => this.handleKeyDown(e);
    this.onKeyUpBound = (e) => this.handleKeyUp(e);
    this.onMouseMoveBound = (e) => this.handleMouseMove(e);
    this.onMouseDownBound = (e) => this.handleMouseDown(e);
    this.onMouseUpBound = (e) => this.handleMouseUp(e);
    this.onPointerLockChangeBound = () => {
      const locked = document.pointerLockElement === this.renderer.domElement;
      if (this.pointerLocked && !locked) {
        this.lastPointerUnlockTime = performance.now();
      }
      this.pointerLocked = locked;
      this.emitHud();
    };
    this.onPointerLockErrorBound = () => {
      // Browser declined pointer lock (e.g. during unlock cooldown); drag-aim fallback stays active
    };
    this.onResizeBound = () => this.handleResize();
    this.onBlurBound = () => {
      this.heldKeys.clear();
      this.firingHeld = false;
      this.adsHeld = false;
      this.draggingLook = false;
    };
    this.onContextMenuBound = (e) => e.preventDefault();

    window.addEventListener('keydown', this.onKeyDownBound);
    window.addEventListener('keyup', this.onKeyUpBound);
    window.addEventListener('mousemove', this.onMouseMoveBound);
    this.renderer.domElement.addEventListener('mousedown', this.onMouseDownBound);
    window.addEventListener('mouseup', this.onMouseUpBound);
    this.renderer.domElement.addEventListener('contextmenu', this.onContextMenuBound);
    document.addEventListener('pointerlockchange', this.onPointerLockChangeBound);
    document.addEventListener('pointerlockerror', this.onPointerLockErrorBound);
    window.addEventListener('resize', this.onResizeBound);
    window.addEventListener('blur', this.onBlurBound);

    this.clock.start();
    this.tick();
  }

  private setupLighting(): void {
    // Cool sky / warm earth hemisphere fill
    const hemi = new THREE.HemisphereLight(0x88b4e6, 0x3b352a, 0.85);
    hemi.position.set(0, 60, 0);
    this.scene.add(hemi);

    // Warm golden-dusk directional sun key light
    const sun = new THREE.DirectionalLight(0xffe1b5, 1.9);
    sun.position.set(70, 95, 55);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 260;
    const d = 95;
    sun.shadow.camera.left = -d;
    sun.shadow.camera.right = d;
    sun.shadow.camera.top = d;
    sun.shadow.camera.bottom = -d;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;
    this.scene.add(sun);

    // Cool rim backlight for silhouette separation
    const rim = new THREE.DirectionalLight(0x60a5fa, 0.55);
    rim.position.set(-60, 45, -75);
    this.scene.add(rim);
  }

  private buildArenaWorld(): void {
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    const terrainTex = createTerrainTexture(maxAniso);
    const terrainNormalTex = createTerrainNormalMap(maxAniso);
    const concreteTex = createConcreteTexture(maxAniso);
    this.hazardTex = createHazardMetalTexture(maxAniso);

    // Procedural Golden-Dusk Sky Dome
    const skyGeo = new THREE.SphereGeometry(460, 32, 20);
    const skyMat = new THREE.MeshBasicMaterial({
      map: createSkyDomeTexture(),
      side: THREE.BackSide,
      fog: false,
      depthWrite: false,
    });
    const skyDome = new THREE.Mesh(skyGeo, skyMat);
    skyDome.renderOrder = -1;
    this.scene.add(skyDome);

    // Displaced Terrain Mesh with Biome Vertex Shading & Normal Mapping
    const segs = 128;
    const terrainGeo = new THREE.PlaneGeometry(ISLAND_RADIUS * 2, ISLAND_RADIUS * 2, segs, segs);
    terrainGeo.rotateX(-Math.PI / 2);
    const posAttr = terrainGeo.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const z = posAttr.getZ(i);
      posAttr.setY(i, groundHeightAt(x, z));
    }
    terrainGeo.computeVertexNormals();

    const normAttr = terrainGeo.attributes.normal;
    const colors = new Float32Array(posAttr.count * 3);
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const y = posAttr.getY(i);
      const z = posAttr.getZ(i);
      const ny = normAttr.getY(i);
      const r = Math.hypot(x, z);

      // Base lush olive turf multiplier
      let cr = 0.94;
      let cg = 1.0;
      let cb = 0.88;

      // Compound plateau tarmac slate blend
      const tarmacT = 1 - THREE.MathUtils.smoothstep(r, 14, 22);
      if (tarmacT > 0) {
        cr = THREE.MathUtils.lerp(cr, 0.72, tarmacT);
        cg = THREE.MathUtils.lerp(cg, 0.76, tarmacT);
        cb = THREE.MathUtils.lerp(cb, 0.82, tarmacT);
      }

      // Steep rocky cliff slate blend
      const slopeT = THREE.MathUtils.smoothstep(ny, 0.86, 0.72);
      const cliffEdgeT = r > PLAYABLE_RADIUS - 8 ? THREE.MathUtils.smoothstep(r, PLAYABLE_RADIUS - 8, PLAYABLE_RADIUS + 4) : 0;
      const rockT = Math.max(slopeT, cliffEdgeT * 0.75);
      if (rockT > 0) {
        cr = THREE.MathUtils.lerp(cr, 0.7, rockT);
        cg = THREE.MathUtils.lerp(cg, 0.69, rockT);
        cb = THREE.MathUtils.lerp(cb, 0.72, rockT);
      }

      // Coastal beach sand blend near water level
      const sandT = 1 - THREE.MathUtils.smoothstep(y, -0.8, 0.9);
      if (sandT > 0) {
        cr = THREE.MathUtils.lerp(cr, 1.0, sandT);
        cg = THREE.MathUtils.lerp(cg, 0.88, sandT);
        cb = THREE.MathUtils.lerp(cb, 0.66, sandT);
      }

      colors[i * 3] = cr;
      colors[i * 3 + 1] = cg;
      colors[i * 3 + 2] = cb;
    }
    terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    terrainGeo.computeBoundingSphere();

    const terrainMat = new THREE.MeshStandardMaterial({
      map: terrainTex,
      normalMap: terrainNormalTex,
      normalScale: new THREE.Vector2(0.85, 0.85),
      vertexColors: true,
      roughness: 0.88,
      metalness: 0.04,
    });
    const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    terrainMesh.receiveShadow = true;
    this.scene.add(terrainMesh);

    // Shared building materials
    const concreteMat = new THREE.MeshStandardMaterial({
      map: concreteTex,
      roughness: 0.85,
      metalness: 0.08,
    });
    const steelMat = new THREE.MeshStandardMaterial({
      color: 0x333b48,
      roughness: 0.34,
      metalness: 0.78,
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      roughness: 0.3,
      metalness: 0.6,
    });

    // Central Compound + Flanking Outpost Bunkers
    const bunkerSpecs: [number, number, number][] = [
      [0, -14, 0],
      [-26, 20, Math.PI * 0.25],
      [32, -28, -Math.PI * 0.35],
      [-48, -42, Math.PI * 0.6],
      [54, 34, Math.PI * 0.85],
    ];
    for (const [bx, bz, rot] of bunkerSpecs) {
      this.scene.add(
        createBunkerStructure(bx, bz, rot, concreteMat, steelMat, accentMat, this.colliders),
      );
    }

    // Tactical Watchtowers
    const towerSpecs: [number, number][] = [
      [18, 16],
      [-38, 48],
      [48, -60],
    ];
    for (const [tx, tz] of towerSpecs) {
      this.scene.add(
        createWatchtowerStructure(tx, tz, concreteMat, steelMat, accentMat, this.colliders),
      );
    }

    // Residential & Tactical Battle Royale Houses across island neighborhoods
    // [x, z, rotY, variant (0-3), twoStory]
    const houseSpecs: [number, number, number, number, boolean][] = [
      // North Village
      [-14, -46, 0.25, 0, true],
      [14, -48, -0.35, 1, false],
      [0, -68, 0.1, 2, true],
      // East Coastal Hamlet
      [46, -6, -Math.PI * 0.45, 3, true],
      [68, 8, Math.PI * 0.72, 0, false],
      [36, 46, -Math.PI * 0.75, 1, true],
      // South Ridge Compound
      [-18, 44, Math.PI * 0.92, 2, true],
      [8, 56, Math.PI, 0, false],
      [28, 30, -Math.PI * 0.6, 3, false],
      // West Woodland Settlement
      [-54, -14, Math.PI * 0.42, 1, true],
      [-68, 12, Math.PI * 0.58, 3, false],
      [-46, 28, Math.PI * 0.75, 0, false],
      // Outskirts Cabins
      [-76, -34, Math.PI * 0.2, 2, false],
      [72, -40, -Math.PI * 0.3, 1, true],
    ];
    for (const [hx, hz, rot, variant, twoStory] of houseSpecs) {
      this.scene.add(
        createHouseStructure(hx, hz, rot, variant, twoStory, concreteMat, this.colliders),
      );
    }

    // Instanced trees, undergrowth bushes, dense swaying grass, boulders, compound cover, and coastal ocean
    const env = createInstancedEnvironment(this.scene, this.colliders, maxAniso);
    this.waterNormalTex = env.waterNormalTex;
    this.foliageTimeUniform = env.foliageTimeUniform;

    // Shrinking Storm Wall
    const storm = createStormWall();
    this.stormWall = storm.mesh;
    this.stormTex = storm.texture;
    this.scene.add(this.stormWall);

    // Volumetric Storm Fog Curtain & Proximity Fog Shells
    this.setupVolumetricStormFog();
  }

  private setupVolumetricStormFog(): void {
    const noiseGlsl = /* glsl */ `
      float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      float valueNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        float a = hash21(i);
        float b = hash21(i + vec2(1.0, 0.0));
        float c = hash21(i + vec2(0.0, 1.0));
        float d = hash21(i + vec2(1.0, 1.0));
        return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
      }

      float fbm(vec2 p) {
        float val = 0.0;
        float amp = 0.5;
        mat2 rot = mat2(0.8, -0.6, 0.6, 0.8);
        for (int i = 0; i < 3; i++) {
          val += amp * valueNoise(p);
          p = rot * p * 2.03 + vec2(17.1, 31.7);
          amp *= 0.5;
        }
        return val;
      }
    `;

    // 1) Perimeter Volumetric Fog Curtain hugging the Storm Boundary
    const ringGeo = new THREE.CylinderGeometry(1, 1, 52, 64, 1, true);
    this.stormFogRingMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0.28 },
        uDeepColor: { value: new THREE.Color(0x2a0f1c) },
        uGlowColor: { value: new THREE.Color(0xc23438) },
      },
      vertexShader: /* glsl */ `
        varying vec3 vLocalPos;
        varying vec3 vWorldPos;
        void main() {
          vLocalPos = position;
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPos = worldPosition.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uOpacity;
        uniform vec3 uDeepColor;
        uniform vec3 uGlowColor;
        varying vec3 vLocalPos;
        varying vec3 vWorldPos;
        ${noiseGlsl}
        void main() {
          vec2 dir = normalize(vLocalPos.xz + vec2(1e-5));
          float n1 = fbm(dir * 4.5 + vec2(uTime * 0.09, vWorldPos.y * 0.08 - uTime * 0.14));
          float n2 = fbm(dir.yx * 7.2 + vec2(-uTime * 0.06, vWorldPos.y * 0.13 + uTime * 0.09));
          float wisps = smoothstep(0.22, 0.84, n1 * 0.62 + n2 * 0.38);

          float heightFade = smoothstep(-6.0, 3.0, vWorldPos.y) * (1.0 - smoothstep(10.0, 44.0, vWorldPos.y));
          float alpha = clamp((0.25 + 0.75 * wisps) * heightFade * uOpacity, 0.0, 0.88);
          if (alpha < 0.01) discard;

          vec3 col = mix(uDeepColor, uGlowColor, wisps * 0.68);
          gl_FragColor = vec4(col, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
    });
    this.stormFogRing = new THREE.Mesh(ringGeo, this.stormFogRingMat);
    this.stormFogRing.position.y = 20;
    this.stormFogRing.renderOrder = 4;
    this.stormFogRing.frustumCulled = false;
    this.scene.add(this.stormFogRing);

    // 2) Concentric World-Anchored Volumetric Fog Shells around the Camera
    // Drawn back-to-front (outermost -> innermost) with depthTest=true so closer world geometry
    // occludes distant fog slices naturally, producing true depth-layered volumetric thickness.
    const shellGeo = new THREE.SphereGeometry(1, 24, 16);
    const shellSpecs = [
      { radius: 30.0, weight: 0.38, minProximity: 0.0, renderOrder: 6, seed: 1.3 },
      { radius: 20.5, weight: 0.34, minProximity: 0.05, renderOrder: 7, seed: 3.7 },
      { radius: 13.0, weight: 0.30, minProximity: 0.12, renderOrder: 8, seed: 6.1 },
      { radius: 6.8, weight: 0.25, minProximity: 0.24, renderOrder: 9, seed: 9.4 },
      { radius: 2.8, weight: 0.20, minProximity: 0.52, renderOrder: 10, seed: 12.8 },
    ];

    const shellVert = /* glsl */ `
      varying vec3 vWorldPos;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `;

    const shellFrag = /* glsl */ `
      uniform float uTime;
      uniform float uIntensity;
      uniform float uShellOpacity;
      uniform float uShellSeed;
      uniform vec2 uStormCenter;
      uniform float uStormRadius;
      uniform vec3 uDeepColor;
      uniform vec3 uMidColor;
      uniform vec3 uEmberColor;
      varying vec3 vWorldPos;
      ${noiseGlsl}
      void main() {
        vec2 p1 = vWorldPos.xz * 0.072 + vec2(uTime * 0.16 + uShellSeed, -uTime * 0.11) + vWorldPos.y * 0.045;
        vec2 p2 = vWorldPos.zx * 0.138 + vec2(-uTime * 0.21, uTime * 0.14 - uShellSeed) - vWorldPos.y * 0.06;
        float cloud = fbm(p1) * 0.6 + fbm(p2) * 0.4;
        float density = smoothstep(0.16, 0.84, cloud);

        float heightFactor = mix(0.45, 1.0, 1.0 - smoothstep(1.5, 22.0, vWorldPos.y));
        float distFromCenter = length(vWorldPos.xz - uStormCenter);
        float boundaryBias = smoothstep(uStormRadius - 24.0, uStormRadius + 6.0, distFromCenter);
        float directionalDensity = mix(0.32 + 0.68 * uIntensity, 1.0, boundaryBias);

        float alpha = clamp((0.28 + 0.72 * density) * heightFactor * directionalDensity * uShellOpacity, 0.0, 0.85);
        if (alpha < 0.004) discard;

        vec3 col = mix(uDeepColor, uMidColor, density);
        col = mix(col, uEmberColor, boundaryBias * density * 0.52);

        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `;

    for (const spec of shellSpecs) {
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uIntensity: { value: 0 },
          uShellOpacity: { value: 0 },
          uShellSeed: { value: spec.seed },
          uStormCenter: { value: new THREE.Vector2(0, 0) },
          uStormRadius: { value: 114 },
          uDeepColor: { value: new THREE.Color(0x28101c) },
          uMidColor: { value: new THREE.Color(0x4c1d32) },
          uEmberColor: { value: new THREE.Color(0xa62e34) },
        },
        vertexShader: shellVert,
        fragmentShader: shellFrag,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        side: THREE.BackSide,
        blending: THREE.NormalBlending,
      });

      const mesh = new THREE.Mesh(shellGeo, mat);
      mesh.scale.setScalar(spec.radius);
      mesh.renderOrder = spec.renderOrder;
      mesh.frustumCulled = false;
      mesh.visible = false;
      this.scene.add(mesh);

      this.volumetricFogShells.push({
        mesh,
        mat,
        weight: spec.weight,
        minProximity: spec.minProximity,
      });
    }
  }

  private setupPlayerAndPools(): void {
    this.playerRig = createOperatorRig(0x0ea5e9, 0x67e8f9, 'rifle');
    this.scene.add(this.playerRig.root);

    // Pre-allocate tracer pool
    const tracerGeo = new THREE.CylinderGeometry(0.024, 0.024, 1, 5);
    tracerGeo.rotateX(Math.PI / 2);
    for (let i = 0; i < 24; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xfde047,
        transparent: true,
        opacity: 0.9,
      });
      const mesh = new THREE.Mesh(tracerGeo, mat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.tracers.push({ mesh, life: 0, maxLife: 0.08 });
    }

    // Pre-allocate particle spark pool
    const sparkGeo = new THREE.BoxGeometry(0.11, 0.11, 0.11);
    for (let i = 0; i < 48; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xfbbf24 });
      const mesh = new THREE.Mesh(sparkGeo, mat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.sparks.push({ mesh, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 0.3 });
    }
  }

  private clearDynamicEntities(): void {
    for (const bot of this.bots) {
      this.scene.remove(bot.rig.root);
      this.scene.remove(bot.telegraphLine);
      bot.telegraphLine.geometry.dispose();
    }
    this.bots = [];

    for (const crate of this.crates) {
      this.scene.remove(crate.mesh);
    }
    this.crates = [];
  }

  public startNewMatch(callsign: string): void {
    this.playerCallsign = callsign || 'GHOST-01';
    this.resetMatchState('playing');
    this.requestPointerLock();
  }

  public setPhase(next: GamePhase): void {
    this.phase = next;
    if (next !== 'playing') {
      this.sprintToggle = false;
      this.zoomToggle = false;
      this.touchMoveX = 0;
      this.touchMoveY = 0;
      this.firingHeld = false;
      if (document.pointerLockElement === this.renderer.domElement) {
        document.exitPointerLock();
      }
    }
    this.callbacks.onPhaseChange(next);
    this.emitHud();
  }

  private isTouchActive(): boolean {
    return resolveTouchActive(this.controlSettings);
  }

  private triggerHaptic(ms: number): void {
    if (!this.controlSettings.hapticsEnabled) return;
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(ms);
      } catch {
        // Ignore blocked vibration calls
      }
    }
  }

  public requestPointerLock(): void {
    if (this.disposed || this.phase !== 'playing' || this.isTouchActive()) return;
    if (document.pointerLockElement === this.renderer.domElement) return;

    const elapsedSinceUnlock = performance.now() - this.lastPointerUnlockTime;
    if (this.lastPointerUnlockTime > 0 && elapsedSinceUnlock < 1300) {
      return;
    }

    try {
      const maybePromise = this.renderer.domElement.requestPointerLock?.() as unknown as Promise<void> | undefined;
      if (maybePromise && typeof maybePromise.catch === 'function') {
        maybePromise.catch(() => {});
      }
    } catch {
      // Fallback drag-aim works seamlessly if pointer lock is blocked
    }
  }

  public exitPointerLock(): void {
    if (document.pointerLockElement === this.renderer.domElement) {
      document.exitPointerLock();
    }
  }

  public setCallsign(name: string): void {
    this.playerCallsign = name || 'GHOST-01';
  }

  public setControlSettings(next: ControlSettings): void {
    this.controlSettings = next;
    this.sprintToggle = false;
    this.zoomToggle = false;
    this.emitHud();
  }

  public setInputBlocked(blocked: boolean): void {
    this.inputBlocked = blocked;
    if (blocked) {
      this.heldKeys.clear();
      this.firingHeld = false;
      this.adsHeld = false;
      this.draggingLook = false;
      this.touchMoveX = 0;
      this.touchMoveY = 0;
    }
  }

  public toggleSprint(): void {
    if (this.phase !== 'playing') return;
    this.sprintToggle = !this.sprintToggle;
    this.emitHud();
  }

  public toggleZoom(): void {
    if (this.phase !== 'playing') return;
    this.zoomToggle = !this.zoomToggle;
    this.emitHud();
  }

  public setTouchMove(x: number, y: number): void {
    if (this.phase !== 'playing' || this.inputBlocked) {
      this.touchMoveX = 0;
      this.touchMoveY = 0;
      return;
    }
    this.touchMoveX = THREE.MathUtils.clamp(x, -1, 1);
    this.touchMoveY = THREE.MathUtils.clamp(y, -1, 1);
  }

  public addTouchLookDelta(dx: number, dy: number): void {
    if (this.inputBlocked || this.phase !== 'playing') return;
    const baseSens = this.isZoomActive()
      ? 0.0044 * this.controlSettings.touchLookSensitivity * this.controlSettings.adsSensitivity
      : 0.0044 * this.controlSettings.touchLookSensitivity;
    const ySign = this.controlSettings.invertY ? 1 : -1;
    this.yaw -= dx * baseSens;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy * baseSens * ySign, -0.72, 0.62);
  }

  public setTouchFireHeld(held: boolean): void {
    if (this.inputBlocked || this.phase !== 'playing') {
      this.firingHeld = false;
      return;
    }
    this.firingHeld = held;
    if (held) {
      this.tryPlayerFire();
    }
  }

  public triggerJump(): void {
    if (this.inputBlocked || this.phase !== 'playing') return;
    this.jumpBufferTimer = 0.14;
  }

  public triggerReload(): void {
    if (this.inputBlocked || this.phase !== 'playing') return;
    this.startReload();
  }

  public triggerLoot(): void {
    if (this.inputBlocked || this.phase !== 'playing') return;
    this.tryOpenNearbyCrate();
  }

  public triggerHeal(): void {
    if (this.inputBlocked || this.phase !== 'playing') return;
    this.tryUseConsumable();
  }

  public triggerPing(): void {
    if (this.inputBlocked || this.phase !== 'playing') return;
    this.dropTacticalPing();
  }

  public selectWeaponSlot(index: number): void {
    if (this.inputBlocked || this.phase !== 'playing') return;
    this.switchSlot(index);
  }

  private isActionHeld(action: ControlAction): boolean {
    const bound = this.controlSettings.keybinds[action];
    if (this.heldKeys.has(bound)) return true;
    if (bound === 'ShiftLeft' || bound === 'ShiftRight') {
      return this.heldKeys.has('ShiftLeft') || this.heldKeys.has('ShiftRight');
    }
    return false;
  }

  private isZoomActive(): boolean {
    const keyZoom =
      this.controlSettings.zoomMode === 'toggle'
        ? this.zoomToggle
        : this.isActionHeld('zoom');
    return this.adsHeld || keyZoom;
  }

  private isSprintActive(): boolean {
    const keySprint =
      this.controlSettings.sprintMode === 'toggle'
        ? this.sprintToggle
        : this.isActionHeld('sprint');
    return keySprint && !this.isZoomActive();
  }

  public resetMatchState(targetPhase: GamePhase): void {
    this.clearDynamicEntities();
    this.sprintToggle = false;
    this.zoomToggle = false;
    this.touchMoveX = 0;
    this.touchMoveY = 0;

    // Reset player near central tactical compound
    this.px = 0;
    this.pz = 14;
    this.py = groundHeightAt(this.px, this.pz);
    this.pvy = 0;
    this.grounded = true;
    this.yaw = Math.PI;
    this.pitch = -0.1;
    this.hp = 100;
    this.shield = 50;
    this.medkits = 1;
    this.shieldCells = 2;
    this.kills = 0;
    this.damageDealt = 0;
    this.survivalSeconds = 0;
    this.eliminatedBy = null;
    this.reloading = false;
    this.reloadTimer = 0;
    this.fireCooldown = 0;
    this.hitMarkerTimer = 0;
    this.damageFlashTimer = 0;
    this.camShake = 0;
    this.recoilPitch = 0;
    this.killFeed = [];

    this.slots = [
      { id: 'rifle', unlocked: true, mag: 30, reserve: 120 },
      { id: 'shotgun', unlocked: false, mag: 8, reserve: 24 },
      { id: 'sniper', unlocked: false, mag: 5, reserve: 15 },
    ];
    this.activeSlot = 0;
    swapOperatorWeapon(this.playerRig, 'rifle');
    this.playerRig.root.position.set(this.px, this.py, this.pz);
    this.playerRig.root.visible = true;

    // Reset Storm
    this.stormPhase = 1;
    this.stormShrinking = false;
    this.stormTimer = STORM_PHASES[0].wait;
    this.stormRadius = 114;
    this.stormStartRadius = 114;
    this.stormTargetRadius = STORM_PHASES[0].targetRadius;
    this.stormCenterX = (Math.random() - 0.5) * 18;
    this.stormCenterZ = (Math.random() - 0.5) * 18;
    this.stormWall.scale.set(this.stormRadius, 1, this.stormRadius);
    this.stormWall.position.set(this.stormCenterX, 26, this.stormCenterZ);
    this.stormFogRing.scale.set(this.stormRadius * 1.015, 1, this.stormRadius * 1.015);
    this.stormFogRing.position.set(this.stormCenterX, 20, this.stormCenterZ);
    this.stormFogFactor = 0;
    this.updateVolumetricFog(1, 0);

    // Spawn Tactical Loot Crates around arena + inside Houses ([x, z, tier, weaponId, floorLift])
    const crateCoords: [number, number, 'weapon' | 'supply', WeaponId?, number?][] = [
      [0, -14, 'weapon', 'shotgun'],
      [16, 12, 'weapon', 'sniper'],
      [-24, 18, 'weapon', 'shotgun'],
      [30, -26, 'weapon', 'sniper'],
      [-46, -40, 'weapon', 'shotgun'],
      [52, 32, 'weapon', 'sniper'],
      [-14, -22, 'supply'],
      [22, -4, 'supply'],
      [-34, -8, 'supply'],
      [8, 36, 'supply'],
      [-55, 22, 'weapon', 'shotgun'],
      [44, 54, 'supply'],
      [-20, -64, 'weapon', 'sniper'],
      [68, -12, 'supply'],
      [-72, -16, 'supply'],
      [12, -52, 'supply'],
      [-12, 62, 'weapon', 'shotgun'],
      [38, 12, 'supply'],
      // House interior loot crates (lifted onto house timber floor)
      [-13, -45, 'weapon', 'sniper', 0.48],
      [14, -47, 'supply', undefined, 0.48],
      [46, -5, 'weapon', 'shotgun', 0.48],
      [-17, 44, 'supply', undefined, 0.48],
      [-53, -13, 'weapon', 'sniper', 0.48],
      [72, -39, 'supply', undefined, 0.48],
    ];

    crateCoords.forEach(([cx, cz, tier, weaponId, floorLift = 0], idx) => {
      const cy = groundHeightAt(cx, cz) + floorLift;
      const mesh = createLootCrateMesh(tier, this.hazardTex);
      mesh.position.set(cx, cy, cz);
      this.scene.add(mesh);
      this.crates.push({
        id: `crate-${idx}`,
        tier,
        weaponId,
        x: cx,
        y: cy,
        z: cz,
        opened: false,
        mesh,
      });
    });

    // Spawn 19 AI Rivals distributed in outer ring (safely clear of house walls)
    for (let i = 0; i < 19; i++) {
      const angle = (i / 19) * Math.PI * 2 + (Math.random() - 0.5) * 0.25;
      const dist = 34 + Math.random() * 68;
      const rawX = Math.cos(angle) * dist;
      const rawZ = Math.sin(angle) * dist;
      const rawY = groundHeightAt(rawX, rawZ);
      const safePos = resolveCircleCollisions(rawX, rawZ, rawY, 1.2, this.colliders);
      const bx = safePos.x;
      const bz = safePos.z;
      const by = groundHeightAt(bx, bz);
      const weaponChoices: WeaponId[] = ['rifle', 'rifle', 'shotgun', 'sniper'];
      const weaponId = weaponChoices[i % weaponChoices.length];
      const armorPalette = [0xdc2626, 0xea580c, 0x9333ea, 0xb91c1c, 0xbe123c];
      const rig = createOperatorRig(armorPalette[i % armorPalette.length], 0xfb7185, weaponId);
      rig.root.position.set(bx, by, bz);
      this.scene.add(rig.root);

      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, 1),
      ]);
      const lineMat = new THREE.LineBasicMaterial({
        color: 0xef4444,
        transparent: true,
        opacity: 0.75,
      });
      const telegraphLine = new THREE.Line(lineGeo, lineMat);
      telegraphLine.visible = false;
      this.scene.add(telegraphLine);

      this.bots.push({
        id: `bot-${i}`,
        name: BOT_CALLSIGNS[i % BOT_CALLSIGNS.length],
        alive: true,
        x: bx,
        y: by,
        z: bz,
        vy: 0,
        yaw: Math.random() * Math.PI * 2,
        hp: 100,
        shield: i % 3 === 0 ? 50 : 25,
        weaponId,
        rig,
        walkPhase: Math.random() * 6,
        moveTargetX: bx,
        moveTargetZ: bz,
        retargetTimer: Math.random() * 2,
        fireCooldown: 1 + Math.random() * 2,
        windupTimer: 0,
        telegraphLine,
        targetEnemyId: null,
      });
    }

    this.phase = targetPhase;
    this.callbacks.onPhaseChange(targetPhase);
    this.emitHud();
  }

  public syncSquadMembers(members: SquadMemberState[], selfId: string): void {
    const activeIds = new Set<string>();
    for (const m of members) {
      if (m.clientId === selfId) continue;
      activeIds.add(m.clientId);
      let avatar = this.remoteAvatars.get(m.clientId);
      if (!avatar) {
        const rig = createOperatorRig(0x10b981, 0x6ee7b7, 'rifle');
        this.scene.add(rig.root);
        avatar = {
          clientId: m.clientId,
          callsign: m.callsign,
          rig,
          targetX: m.x,
          targetY: m.y,
          targetZ: m.z,
          targetYaw: m.yaw,
        };
        this.remoteAvatars.set(m.clientId, avatar);
      }
      avatar.callsign = m.callsign;
      avatar.targetX = m.x;
      avatar.targetY = m.y;
      avatar.targetZ = m.z;
      avatar.targetYaw = m.yaw;
      avatar.rig.root.visible = m.hp > 0;
    }

    for (const [id, avatar] of this.remoteAvatars) {
      if (!activeIds.has(id)) {
        this.scene.remove(avatar.rig.root);
        this.remoteAvatars.delete(id);
      }
    }
  }

  public addPingBeacon(ping: TacticalPing): void {
    if (this.pingBeacons.some((b) => b.id === ping.id)) return;
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.32, 18, 8), mat);
    beam.position.y = 9;
    const diamond = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.45, 0),
      new THREE.MeshBasicMaterial({ color: 0x7dd3fc }),
    );
    diamond.position.y = 2.6;
    g.add(beam, diamond);
    g.position.set(ping.x, groundHeightAt(ping.x, ping.z), ping.z);
    this.scene.add(g);
    this.pingBeacons.push({
      id: ping.id,
      mesh: g,
      x: ping.x,
      z: ping.z,
      label: ping.label,
      expiresAt: performance.now() + 14000,
    });
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (this.inputBlocked) return;
    // Skip game hotkeys when typing in SMS or input fields
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    const kb = this.controlSettings.keybinds;

    if (matchesControlKey(e.code, kb.comms, e.key)) {
      e.preventDefault();
      this.callbacks.onToggleComms();
      return;
    }

    if (e.code === 'Escape') {
      if (this.phase === 'playing') {
        this.setPhase('paused');
      } else if (this.phase === 'paused') {
        this.setPhase('playing');
        this.requestPointerLock();
      }
      return;
    }

    if (this.phase !== 'playing') return;

    if (matchesControlKey(e.code, kb.sprint, e.key)) {
      if (this.controlSettings.sprintMode === 'toggle') {
        if (!e.repeat) {
          this.sprintToggle = !this.sprintToggle;
          this.emitHud();
        }
        return;
      }
      this.heldKeys.add(e.code || 'ShiftLeft');
      if (!e.repeat) this.emitHud();
      return;
    }

    if (matchesControlKey(e.code, kb.zoom, e.key)) {
      if (this.controlSettings.zoomMode === 'toggle') {
        if (!e.repeat) {
          this.toggleZoom();
        }
        return;
      }
      this.heldKeys.add(e.code);
      if (!e.repeat) this.emitHud();
      return;
    }

    if (!e.repeat) {
      if (matchesControlKey(e.code, kb.jump, e.key)) this.jumpBufferTimer = 0.14;
      if (e.code === 'Digit1') this.switchSlot(0);
      if (e.code === 'Digit2') this.switchSlot(1);
      if (e.code === 'Digit3') this.switchSlot(2);
      if (matchesControlKey(e.code, kb.reload, e.key)) this.startReload();
      if (matchesControlKey(e.code, kb.loot, e.key)) this.tryOpenNearbyCrate();
      if (matchesControlKey(e.code, kb.heal, e.key)) this.tryUseConsumable();
      if (matchesControlKey(e.code, kb.ping, e.key)) this.dropTacticalPing();
    }

    this.heldKeys.add(e.code);
  }

  private handleKeyUp(e: KeyboardEvent): void {
    this.heldKeys.delete(e.code);
    if (e.key === 'Shift') {
      this.heldKeys.delete('ShiftLeft');
      this.heldKeys.delete('ShiftRight');
    }
    const kb = this.controlSettings.keybinds;
    if (
      this.phase === 'playing' &&
      ((this.controlSettings.sprintMode === 'hold' && matchesControlKey(e.code, kb.sprint, e.key)) ||
        (this.controlSettings.zoomMode === 'hold' && matchesControlKey(e.code, kb.zoom, e.key)))
    ) {
      this.emitHud();
    }
  }

  private handleMouseDown(e: MouseEvent): void {
    if (this.inputBlocked || this.phase !== 'playing') return;
    if (this.isTouchActive()) return;
    if (!this.pointerLocked) {
      this.requestPointerLock();
      this.draggingLook = true;
    }
    if (e.button === 0) {
      this.firingHeld = true;
      this.tryPlayerFire();
    } else if (e.button === 2) {
      this.adsHeld = true;
    }
  }

  private handleMouseUp(e: MouseEvent): void {
    if (e.button === 0) this.firingHeld = false;
    if (e.button === 2) this.adsHeld = false;
    this.draggingLook = false;
  }

  private handleMouseMove(e: MouseEvent): void {
    if (this.inputBlocked || this.phase !== 'playing') return;
    if (!this.pointerLocked && !this.draggingLook) return;
    const baseSens = this.isZoomActive()
      ? 0.0024 * this.controlSettings.lookSensitivity * this.controlSettings.adsSensitivity
      : 0.0024 * this.controlSettings.lookSensitivity;
    const ySign = this.controlSettings.invertY ? 1 : -1;
    this.yaw -= e.movementX * baseSens;
    this.pitch = THREE.MathUtils.clamp(this.pitch + e.movementY * baseSens * ySign, -0.72, 0.62);
  }

  private handleResize(): void {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer?.setSize(w, h);
    this.bloomPass?.resolution.set(w, h);
  }

  private switchSlot(index: number): void {
    const slot = this.slots[index];
    if (!slot || !slot.unlocked || index === this.activeSlot) return;
    this.activeSlot = index;
    this.reloading = false;
    this.reloadTimer = 0;
    swapOperatorWeapon(this.playerRig, slot.id);
    soundFX.playReload();
  }

  private startReload(): void {
    const slot = this.slots[this.activeSlot];
    const spec = WEAPON_SPECS[slot.id];
    if (this.reloading || slot.mag >= spec.magSize || slot.reserve <= 0) return;
    this.reloading = true;
    this.reloadTimer = spec.reloadTime;
    soundFX.playReload();
  }

  private tryUseConsumable(): void {
    if (this.shield < this.maxShield && this.shieldCells > 0) {
      this.shieldCells -= 1;
      this.shield = Math.min(this.maxShield, this.shield + 40);
      soundFX.playLoot();
      return;
    }
    if (this.hp < this.maxHp && this.medkits > 0) {
      this.medkits -= 1;
      this.hp = Math.min(this.maxHp, this.hp + 55);
      soundFX.playLoot();
    }
  }

  private tryOpenNearbyCrate(): void {
    for (const crate of this.crates) {
      if (crate.opened) continue;
      const dist = Math.hypot(crate.x - this.px, crate.z - this.pz);
      if (dist < 3.4) {
        crate.opened = true;
        crate.mesh.visible = false;
        soundFX.playLoot();
        this.triggerHaptic(18);
        this.spawnSparkBurst(crate.x, crate.y + 0.8, crate.z, 0xfbbf24, 10);

        if (crate.tier === 'weapon' && crate.weaponId) {
          const slotIdx = crate.weaponId === 'rifle' ? 0 : crate.weaponId === 'shotgun' ? 1 : 2;
          const slot = this.slots[slotIdx];
          slot.unlocked = true;
          slot.reserve += WEAPON_SPECS[crate.weaponId].magSize * 2;
          this.switchSlot(slotIdx);
        } else {
          this.medkits += 1;
          this.shieldCells += 1;
          this.slots[0].reserve += 45;
        }
        return;
      }
    }
  }

  private dropTacticalPing(): void {
    _rayOrigin.copy(this.camera.position);
    this.camera.getWorldDirection(_rayDir);
    // March ray against terrain up to 110m
    let hitX = this.px + _rayDir.x * 35;
    let hitZ = this.pz + _rayDir.z * 35;
    for (let d = 4; d <= 110; d += 2) {
      const tx = _rayOrigin.x + _rayDir.x * d;
      const ty = _rayOrigin.y + _rayDir.y * d;
      const tz = _rayOrigin.z + _rayDir.z * d;
      if (ty <= groundHeightAt(tx, tz)) {
        hitX = tx;
        hitZ = tz;
        break;
      }
    }
    const hy = groundHeightAt(hitX, hitZ);
    this.callbacks.onDropPing(hitX, hy, hitZ, 'ENEMY / OBJECTIVE');
    soundFX.playSmsChirp();
  }

  private tryPlayerFire(): void {
    if (this.phase !== 'playing' || this.reloading || this.fireCooldown > 0) return;
    const slot = this.slots[this.activeSlot];
    const spec = WEAPON_SPECS[slot.id];

    if (slot.mag <= 0) {
      this.startReload();
      return;
    }

    slot.mag -= 1;
    this.fireCooldown = 1 / spec.fireRate;
    soundFX.playShot(spec.id, 1);
    this.triggerHaptic(spec.id === 'sniper' ? 24 : spec.id === 'shotgun' ? 20 : 9);

    this.camShake = Math.min(0.28, this.camShake + (spec.id === 'sniper' ? 0.16 : spec.id === 'shotgun' ? 0.13 : 0.045));
    this.recoilPitch += spec.id === 'sniper' ? 0.045 : spec.id === 'shotgun' ? 0.032 : 0.011;

    this.playerRig.muzzlePoint.getWorldPosition(_v1);
    this.spawnSparkBurst(_v1.x, _v1.y, _v1.z, 0xfef08a, 3);

    // Aim ray from camera center
    _rayOrigin.copy(this.camera.position);
    this.camera.getWorldDirection(_v2);

    for (let p = 0; p < spec.pellets; p++) {
      const spreadScale = this.isZoomActive() ? spec.spread * 0.42 : spec.spread;
      _rayDir.copy(_v2);
      _rayDir.x += (Math.random() - 0.5) * spreadScale;
      _rayDir.y += (Math.random() - 0.5) * spreadScale;
      _rayDir.z += (Math.random() - 0.5) * spreadScale;
      _rayDir.normalize();

      let bestDist = spec.range;
      let hitBot: EnemyBot | null = null;

      // Test bots along ray
      for (const bot of this.bots) {
        if (!bot.alive) continue;
        // Ray-capsule/sphere test centered on bot torso
        const cx = bot.x;
        const cy = bot.y + 1.15;
        const cz = bot.z;
        const ocX = cx - _rayOrigin.x;
        const ocY = cy - _rayOrigin.y;
        const ocZ = cz - _rayOrigin.z;
        const proj = ocX * _rayDir.x + ocY * _rayDir.y + ocZ * _rayDir.z;
        if (proj < 1.5 || proj > bestDist) continue;
        const closestX = _rayOrigin.x + _rayDir.x * proj;
        const closestY = _rayOrigin.y + _rayDir.y * proj;
        const closestZ = _rayOrigin.z + _rayDir.z * proj;
        const horizSq = (closestX - cx) ** 2 + (closestZ - cz) ** 2;
        const vertDist = Math.abs(closestY - cy);
        if (horizSq <= 0.42 && vertDist <= 1.05) {
          bestDist = proj;
          hitBot = bot;
        }
      }

      // Check terrain & solid building wall occlusion up to bestDist
      const startDist = this.isZoomActive() ? 2.4 : 4.2;
      for (let d = startDist; d < bestDist; d += 1.4) {
        const tx = _rayOrigin.x + _rayDir.x * d;
        const ty = _rayOrigin.y + _rayDir.y * d;
        const tz = _rayOrigin.z + _rayDir.z * d;
        if (ty <= groundHeightAt(tx, tz)) {
          bestDist = d;
          hitBot = null;
          this.spawnSparkBurst(tx, ty + 0.1, tz, 0xd6d3d1, 3);
          break;
        }
        let hitWall = false;
        for (let bIdx = 0; bIdx < this.colliders.boxes.length; bIdx++) {
          const b = this.colliders.boxes[bIdx];
          if (
            tx >= b.minX &&
            tx <= b.maxX &&
            tz >= b.minZ &&
            tz <= b.maxZ &&
            ty >= b.baseY &&
            ty <= b.topY
          ) {
            bestDist = d;
            hitBot = null;
            this.spawnSparkBurst(tx, ty, tz, 0xfbbf24, 3);
            hitWall = true;
            break;
          }
        }
        if (hitWall) break;
      }

      _v3.copy(_rayOrigin).addScaledVector(_rayDir, bestDist);
      this.spawnTracer(_v1, _v3, spec.id === 'sniper' ? 0x38bdf8 : 0xfde047);

      if (hitBot) {
        this.applyDamageToBot(hitBot, spec.damage, this.playerCallsign, spec.shortName, true);
      }
    }

    if (slot.mag === 0 && slot.reserve > 0) {
      this.startReload();
    }
  }

  private applyDamageToBot(
    bot: EnemyBot,
    dmg: number,
    attackerName: string,
    weaponName: string,
    isPlayerAttacker: boolean,
  ): void {
    if (!bot.alive) return;
    bot.rig.hitFlashTimer = 0.09;

    let remaining = dmg;
    if (bot.shield > 0) {
      const absorbed = Math.min(bot.shield, remaining);
      bot.shield -= absorbed;
      remaining -= absorbed;
    }
    bot.hp -= remaining;

    if (isPlayerAttacker) {
      this.damageDealt += dmg;
      this.hitMarkerTimer = 0.16;
      this.hitMarkerKill = bot.hp <= 0;
      soundFX.playHitmarker(bot.hp <= 0);
      this.triggerHaptic(bot.hp <= 0 ? 35 : 14);
      this.spawnSparkBurst(bot.x, bot.y + 1.25, bot.z, bot.shield > 0 ? 0x38bdf8 : 0xef4444, 5);
    }

    if (bot.hp <= 0) {
      bot.alive = false;
      bot.rig.root.visible = false;
      bot.telegraphLine.visible = false;
      this.spawnSparkBurst(bot.x, bot.y + 1.0, bot.z, 0xf97316, 12);

      if (isPlayerAttacker) {
        this.kills += 1;
        this.hitstopTimer = 0.045; // Crisp 45ms tactical hitstop
      }

      this.pushKillFeed(attackerName, bot.name, weaponName, isPlayerAttacker, weaponName === 'STORM');

      // Check Victory!
      const aliveBots = this.bots.filter((b) => b.alive).length;
      if (aliveBots === 0 && this.phase === 'playing') {
        this.setPhase('victory');
      }
    }
  }

  private applyDamageToPlayer(
    dmg: number,
    attackerName: string,
    isStorm = false,
    weaponName = 'CARBINE',
  ): void {
    if (this.phase !== 'playing') return;
    let remaining = dmg;
    if (this.shield > 0) {
      const absorbed = Math.min(this.shield, remaining);
      this.shield -= absorbed;
      remaining -= absorbed;
    }
    this.hp -= remaining;
    this.damageFlashTimer = 0.22;
    if (!isStorm) {
      soundFX.playDamageTaken();
      this.triggerHaptic(22);
      this.camShake = Math.min(0.24, this.camShake + 0.09);
    }

    if (this.hp <= 0) {
      this.hp = 0;
      this.playerRig.root.visible = false;
      const usedWeapon = isStorm ? 'STORM' : weaponName;
      this.eliminatedBy = { killer: attackerName, weapon: usedWeapon };
      this.pushKillFeed(attackerName, this.playerCallsign, usedWeapon, false, isStorm);
      this.setPhase('eliminated');
    }
  }

  private pushKillFeed(
    killer: string,
    victim: string,
    weapon: string,
    isPlayerKill: boolean,
    isZoneElim = false,
  ): void {
    this.killFeed.unshift({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      killer,
      victim,
      weapon,
      isPlayerKill,
      isZoneElim,
      timestamp: Date.now(),
    });
    if (this.killFeed.length > 5) this.killFeed.pop();
  }

  private spawnTracer(from: THREE.Vector3, to: THREE.Vector3, colorHex: number): void {
    for (const t of this.tracers) {
      if (t.life <= 0) {
        const dist = from.distanceTo(to);
        if (dist < 0.2) return;
        t.mesh.position.copy(from).lerp(to, 0.5);
        t.mesh.lookAt(to);
        t.mesh.scale.set(1, 1, dist);
        (t.mesh.material as THREE.MeshBasicMaterial).color.setHex(colorHex);
        t.mesh.visible = true;
        t.life = t.maxLife;
        return;
      }
    }
  }

  private spawnSparkBurst(x: number, y: number, z: number, colorHex: number, count: number): void {
    let spawned = 0;
    for (const s of this.sparks) {
      if (s.life <= 0) {
        s.mesh.position.set(x, y, z);
        s.vx = (Math.random() - 0.5) * 9;
        s.vy = 2 + Math.random() * 5;
        s.vz = (Math.random() - 0.5) * 9;
        (s.mesh.material as THREE.MeshBasicMaterial).color.setHex(colorHex);
        s.mesh.visible = true;
        s.life = s.maxLife;
        spawned++;
        if (spawned >= count) return;
      }
    }
  }

  private updatePlayer(dt: number): void {
    this.survivalSeconds += dt;
    if (this.fireCooldown > 0) this.fireCooldown -= dt;
    if (this.hitMarkerTimer > 0) this.hitMarkerTimer -= dt;
    if (this.damageFlashTimer > 0) this.damageFlashTimer -= dt;
    if (this.coyoteTimer > 0) this.coyoteTimer -= dt;
    if (this.jumpBufferTimer > 0) this.jumpBufferTimer -= dt;

    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        const slot = this.slots[this.activeSlot];
        const spec = WEAPON_SPECS[slot.id];
        const needed = spec.magSize - slot.mag;
        const take = Math.min(needed, slot.reserve);
        slot.mag += take;
        slot.reserve -= take;
        this.reloading = false;
      }
    }

    if (this.firingHeld) {
      const slot = this.slots[this.activeSlot];
      if (WEAPON_SPECS[slot.id].auto) {
        this.tryPlayerFire();
      }
    }

    // Movement vector relative to camera yaw
    _forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    let moveX = 0;
    let moveZ = 0;
    if (this.isActionHeld('forward') || this.heldKeys.has('ArrowUp')) {
      moveX += _forward.x;
      moveZ += _forward.z;
    }
    if (this.isActionHeld('backward') || this.heldKeys.has('ArrowDown')) {
      moveX -= _forward.x;
      moveZ -= _forward.z;
    }
    if (this.isActionHeld('right') || this.heldKeys.has('ArrowRight')) {
      moveX += _right.x;
      moveZ += _right.z;
    }
    if (this.isActionHeld('left') || this.heldKeys.has('ArrowLeft')) {
      moveX -= _right.x;
      moveZ -= _right.z;
    }

    const hasTouchMove = Math.abs(this.touchMoveX) > 0.02 || Math.abs(this.touchMoveY) > 0.02;
    if (hasTouchMove) {
      moveX += _right.x * this.touchMoveX + _forward.x * this.touchMoveY;
      moveZ += _right.z * this.touchMoveX + _forward.z * this.touchMoveY;
    }

    let len = Math.hypot(moveX, moveZ);
    const sprinting = this.isSprintActive();
    if (sprinting && len < 0.001) {
      moveX = _forward.x;
      moveZ = _forward.z;
      len = Math.hypot(moveX, moveZ);
    }
    const zoomed = this.isZoomActive();
    const baseSpeed = zoomed ? 5.2 : sprinting ? 12.6 : 8.6;

    if (len > 0.001) {
      const speedFactor = len < 1 && !sprinting ? len : 1;
      moveX = (moveX / len) * baseSpeed * speedFactor;
      moveZ = (moveZ / len) * baseSpeed * speedFactor;
      this.walkPhase += dt * (sprinting ? 13 : 9) * speedFactor;
    }

    const nextX = this.px + moveX * dt;
    const nextZ = this.pz + moveZ * dt;
    const resolved = resolveCircleCollisions(nextX, nextZ, this.py, 0.55, this.colliders);
    this.px = resolved.x;
    this.pz = resolved.z;

    // Jump & Gravity with coyote time
    const groundY = surfaceHeightAt(this.px, this.pz, this.colliders);
    if (this.grounded) {
      this.coyoteTimer = 0.12;
    }
    if (this.jumpBufferTimer > 0 && this.coyoteTimer > 0) {
      this.pvy = 8.4;
      this.grounded = false;
      this.coyoteTimer = 0;
      this.jumpBufferTimer = 0;
    }

    this.pvy -= 21.5 * dt;
    this.py += this.pvy * dt;
    if (this.py <= groundY) {
      this.py = groundY;
      this.pvy = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
    }

    // Animate realistic human gait, knee bend, stride bob & aim pitch
    this.playerRig.root.position.set(this.px, this.py, this.pz);
    this.playerRig.root.rotation.y = this.yaw + Math.PI;
    const isMoving = len > 0.001;
    const strideAmp = sprinting ? 0.62 : 0.48;
    const swing = isMoving ? Math.sin(this.walkPhase) * strideAmp : 0;
    this.playerRig.leftLeg.rotation.x = swing;
    this.playerRig.rightLeg.rotation.x = -swing;
    // Natural human knee flexion on leg lift/backswing
    this.playerRig.leftKnee.rotation.x = isMoving ? Math.max(0, -Math.cos(this.walkPhase)) * 0.72 : 0.04;
    this.playerRig.rightKnee.rotation.x = isMoving ? Math.max(0, Math.cos(this.walkPhase)) * 0.72 : 0.04;
    // Subtle vertical stride bob or idle breathing
    this.playerRig.bodyPivot.position.y = isMoving
      ? Math.abs(Math.sin(this.walkPhase)) * 0.045
      : Math.sin(this.survivalSeconds * 2.2) * 0.012;
    this.playerRig.bodyPivot.rotation.x = isMoving && sprinting ? 0.08 : 0.02;
    this.playerRig.headGroup.rotation.x = THREE.MathUtils.clamp(-this.pitch * 0.55, -0.35, 0.35);
    this.playerRig.weaponPivot.rotation.x = THREE.MathUtils.clamp(-this.pitch * 0.75, -0.5, 0.45);
    this.playerRig.leftArm.rotation.x = THREE.MathUtils.clamp(-this.pitch * 0.5, -0.35, 0.35);

    // Smoothly decay recoil & camera shake
    this.recoilPitch = THREE.MathUtils.damp(this.recoilPitch, 0, 12, dt);
    this.camShake = THREE.MathUtils.damp(this.camShake, 0, 14, dt);

    // Over-the-shoulder tactical camera
    const activeSpec = WEAPON_SPECS[this.slots[this.activeSlot].id];
    const targetFov = zoomed ? activeSpec.adsFov : sprinting ? 70 : 64;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 12, dt);
      this.camera.updateProjectionMatrix();
    }

    const camDist = zoomed ? 2.15 : 4.2;
    const sideOffset = zoomed ? 0.72 : 0.85;
    const pitchEff = THREE.MathUtils.clamp(this.pitch + this.recoilPitch, -0.78, 0.65);

    _camTarget.set(
      this.px + _right.x * sideOffset,
      this.py + 1.72,
      this.pz + _right.z * sideOffset,
    );

    const cosP = Math.cos(pitchEff);
    const sinP = Math.sin(pitchEff);
    _camDesired.set(
      _camTarget.x - _forward.x * camDist * cosP,
      _camTarget.y - sinP * camDist + 0.35,
      _camTarget.z - _forward.z * camDist * cosP,
    );

    // Prevent camera from dipping below terrain
    const camGround = groundHeightAt(_camDesired.x, _camDesired.z) + 0.65;
    if (_camDesired.y < camGround) _camDesired.y = camGround;

    if (this.camShake > 0.002) {
      _camDesired.x += (Math.random() - 0.5) * this.camShake;
      _camDesired.y += (Math.random() - 0.5) * this.camShake;
    }

    this.camera.position.lerp(_camDesired, 1 - Math.exp(-22 * dt));
    _v1.set(
      _camTarget.x + _forward.x * 16 * cosP,
      _camTarget.y + sinP * 16,
      _camTarget.z + _forward.z * 16 * cosP,
    );
    this.camera.lookAt(_v1);
  }

  private updateBots(dt: number): void {
    for (const bot of this.bots) {
      if (!bot.alive) continue;

      // Hit flash decay
      if (bot.rig.hitFlashTimer > 0) {
        bot.rig.hitFlashTimer -= dt;
        bot.rig.armorMat.emissive.setHex(bot.rig.hitFlashTimer > 0 ? 0xffffff : 0x000000);
        bot.rig.armorMat.emissiveIntensity = bot.rig.hitFlashTimer > 0 ? 0.85 : 0;
      }

      // Storm damage to bots
      const distFromZone = Math.hypot(bot.x - this.stormCenterX, bot.z - this.stormCenterZ);
      if (distFromZone > this.stormRadius) {
        this.applyDamageToBot(bot, (4 + this.stormPhase * 2) * dt, 'STORM', 'STORM', false);
        if (!bot.alive) continue;
      }

      // Find nearest visible target (player or another bot)
      let nearestDist = 48;
      let targetX = 0;
      let targetY = 0;
      let targetZ = 0;
      let targetKind: 'player' | 'bot' | null = null;
      let targetBot: EnemyBot | null = null;

      if (this.phase === 'playing') {
        const dp = Math.hypot(this.px - bot.x, this.pz - bot.z);
        if (dp < nearestDist) {
          nearestDist = dp;
          targetX = this.px;
          targetY = this.py;
          targetZ = this.pz;
          targetKind = 'player';
        }
      }

      for (const other of this.bots) {
        if (!other.alive || other.id === bot.id) continue;
        const db = Math.hypot(other.x - bot.x, other.z - bot.z);
        if (db < nearestDist) {
          nearestDist = db;
          targetX = other.x;
          targetY = other.y;
          targetZ = other.z;
          targetKind = 'bot';
          targetBot = other;
        }
      }

      // AI Movement: rotate inside storm or strafe around combat target
      bot.retargetTimer -= dt;
      if (distFromZone > this.stormRadius - 8) {
        bot.moveTargetX = this.stormCenterX + (Math.random() - 0.5) * 14;
        bot.moveTargetZ = this.stormCenterZ + (Math.random() - 0.5) * 14;
        bot.retargetTimer = 2.0;
      } else if (bot.retargetTimer <= 0) {
        bot.retargetTimer = 1.8 + Math.random() * 2.2;
        if (targetKind) {
          const ang = Math.atan2(targetZ - bot.z, targetX - bot.x) + (Math.random() > 0.5 ? 1.1 : -1.1);
          bot.moveTargetX = bot.x + Math.cos(ang) * 9;
          bot.moveTargetZ = bot.z + Math.sin(ang) * 9;
        } else {
          const rAngle = Math.random() * Math.PI * 2;
          const rDist = Math.random() * Math.max(10, this.stormRadius * 0.72);
          bot.moveTargetX = this.stormCenterX + Math.cos(rAngle) * rDist;
          bot.moveTargetZ = this.stormCenterZ + Math.sin(rAngle) * rDist;
        }
      }

      const dxM = bot.moveTargetX - bot.x;
      const dzM = bot.moveTargetZ - bot.z;
      const distM = Math.hypot(dxM, dzM);
      if (distM > 0.8) {
        const speed = 5.4;
        const resolved = resolveCircleCollisions(
          bot.x + (dxM / distM) * speed * dt,
          bot.z + (dzM / distM) * speed * dt,
          bot.y,
          0.55,
          this.colliders,
        );
        bot.x = resolved.x;
        bot.z = resolved.z;
        bot.walkPhase += dt * 8.5;
        const swing = Math.sin(bot.walkPhase) * 0.46;
        bot.rig.leftLeg.rotation.x = swing;
        bot.rig.rightLeg.rotation.x = -swing;
        bot.rig.leftKnee.rotation.x = Math.max(0, -Math.cos(bot.walkPhase)) * 0.65;
        bot.rig.rightKnee.rotation.x = Math.max(0, Math.cos(bot.walkPhase)) * 0.65;
        bot.rig.bodyPivot.position.y = Math.abs(Math.sin(bot.walkPhase)) * 0.038;
      } else {
        bot.rig.leftLeg.rotation.x = 0;
        bot.rig.rightLeg.rotation.x = 0;
        bot.rig.leftKnee.rotation.x = 0.04;
        bot.rig.rightKnee.rotation.x = 0.04;
        bot.rig.bodyPivot.position.y = 0;
      }

      bot.y = surfaceHeightAt(bot.x, bot.z, this.colliders);
      bot.rig.root.position.set(bot.x, bot.y, bot.z);

      // Face target or movement direction
      if (targetKind) {
        const desiredYaw = Math.atan2(targetX - bot.x, targetZ - bot.z);
        bot.yaw = desiredYaw;
      } else if (distM > 0.8) {
        bot.yaw = Math.atan2(dxM, dzM);
      }
      bot.rig.root.rotation.y = bot.yaw;

      // Combat telegraph + fire
      if (bot.fireCooldown > 0) bot.fireCooldown -= dt;

      if (targetKind && nearestDist < 42 && this.phase === 'playing') {
        if (bot.windupTimer > 0) {
          bot.windupTimer -= dt;
          bot.telegraphLine.visible = true;
          bot.rig.visorMat.emissiveIntensity = 3.2;
          bot.rig.muzzlePoint.getWorldPosition(_v1);
          const posAttr = bot.telegraphLine.geometry.attributes.position as THREE.BufferAttribute;
          posAttr.setXYZ(0, _v1.x, _v1.y, _v1.z);
          posAttr.setXYZ(1, targetX, targetY + 1.25, targetZ);
          posAttr.needsUpdate = true;

          if (bot.windupTimer <= 0) {
            bot.telegraphLine.visible = false;
            bot.rig.visorMat.emissiveIntensity = 1.4;
            bot.fireCooldown = 1.1 + Math.random() * 1.1;

            // Fire shot with fair accuracy curve
            const hitChance = Math.max(0.22, 0.72 - nearestDist / 65);
            _v2.set(targetX, targetY + 1.2, targetZ);
            if (Math.random() > hitChance) {
              _v2.x += (Math.random() - 0.5) * 2.8;
              _v2.y += (Math.random() - 0.5) * 1.6;
              _v2.z += (Math.random() - 0.5) * 2.8;
            }
            this.spawnTracer(_v1, _v2, 0xf87171);

            const distToPlayer = Math.hypot(bot.x - this.px, bot.z - this.pz);
            if (distToPlayer < 45) {
              soundFX.playShot(bot.weaponId, Math.max(0.1, 1 - distToPlayer / 55));
            }

            if (Math.random() <= hitChance) {
              const dmg = bot.weaponId === 'sniper' ? 24 : bot.weaponId === 'shotgun' ? 16 : 11;
              if (targetKind === 'player') {
                this.applyDamageToPlayer(dmg, bot.name, false, WEAPON_SPECS[bot.weaponId].shortName);
              } else if (targetBot && targetBot.alive) {
                this.applyDamageToBot(targetBot, dmg, bot.name, WEAPON_SPECS[bot.weaponId].shortName, false);
              }
            }
          }
        } else if (bot.fireCooldown <= 0) {
          bot.windupTimer = 0.38; // Clear 380ms telegraph before shot!
        }
      } else {
        bot.windupTimer = 0;
        bot.telegraphLine.visible = false;
        bot.rig.visorMat.emissiveIntensity = 1.4;
      }
    }
  }

  private updateStorm(dt: number): void {
    this.stormTex.offset.y -= dt * 0.28;
    const phaseIdx = Math.min(this.stormPhase - 1, STORM_PHASES.length - 1);
    const phaseCfg = STORM_PHASES[phaseIdx];

    if (this.phase === 'playing') {
      this.stormTimer -= dt;
      if (this.stormTimer <= 0) {
        if (!this.stormShrinking) {
          this.stormShrinking = true;
          this.stormTimer = phaseCfg.shrink;
          this.stormStartRadius = this.stormRadius;
          this.stormTargetRadius = phaseCfg.targetRadius;
        } else if (this.stormPhase < STORM_PHASES.length) {
          this.stormPhase += 1;
          this.stormShrinking = false;
          this.stormTimer = STORM_PHASES[this.stormPhase - 1].wait;
        } else {
          this.stormTimer = 0;
        }
      }

      if (this.stormShrinking && phaseCfg.shrink > 0) {
        const progress = 1 - Math.max(0, this.stormTimer) / phaseCfg.shrink;
        this.stormRadius = THREE.MathUtils.lerp(this.stormStartRadius, this.stormTargetRadius, progress);
        this.stormWall.scale.set(this.stormRadius, 1, this.stormRadius);
        this.stormFogRing.scale.set(this.stormRadius * 1.015, 1, this.stormRadius * 1.015);
      }

      // Check player in storm
      const distPlayer = Math.hypot(this.px - this.stormCenterX, this.pz - this.stormCenterZ);
      if (distPlayer > this.stormRadius) {
        this.stormDamageTick += dt;
        if (this.stormDamageTick >= 1.0) {
          this.stormDamageTick = 0;
          this.applyDamageToPlayer(3 + this.stormPhase * 2, 'STORM', true);
        }
      } else {
        this.stormDamageTick = 0;
      }
    }
  }

  private updateVolumetricFog(dt: number, elapsed: number): void {
    let targetFactor = 0;
    if (this.phase !== 'title') {
      const distFromCenter = Math.hypot(this.px - this.stormCenterX, this.pz - this.stormCenterZ);
      const distToBoundary = this.stormRadius - distFromCenter;
      const approach = THREE.MathUtils.smoothstep(40 - distToBoundary, 0, 40) * 0.68;
      const inside = distToBoundary < 0 ? THREE.MathUtils.smoothstep(-distToBoundary, 0, 16) * 0.32 : 0;
      targetFactor = THREE.MathUtils.clamp(approach + inside, 0, 1);
    }

    this.stormFogFactor = dt >= 1 ? targetFactor : THREE.MathUtils.damp(this.stormFogFactor, targetFactor, 4.5, dt);
    const f = this.stormFogFactor;

    if (this.scene.fog instanceof THREE.FogExp2) {
      this.workingFogColor.copy(this.baseFogColor).lerp(this.stormFogColor, Math.pow(f, 0.85));
      this.scene.fog.color.copy(this.workingFogColor);
      this.scene.fog.density = THREE.MathUtils.lerp(0.0046, 0.042, Math.pow(f, 1.35));
    }

    this.stormFogRingMat.uniforms.uTime.value = elapsed;
    this.stormFogRingMat.uniforms.uOpacity.value = THREE.MathUtils.lerp(0.24, 0.78, f);

    for (const shell of this.volumetricFogShells) {
      const activeT =
        f <= shell.minProximity
          ? 0
          : THREE.MathUtils.clamp((f - shell.minProximity) / Math.max(0.01, 1 - shell.minProximity), 0, 1);
      const opacity = activeT * shell.weight;
      shell.mesh.visible = opacity > 0.004;
      if (!shell.mesh.visible) continue;

      shell.mesh.position.copy(this.camera.position);
      shell.mat.uniforms.uTime.value = elapsed;
      shell.mat.uniforms.uIntensity.value = f;
      shell.mat.uniforms.uShellOpacity.value = opacity;
      shell.mat.uniforms.uStormCenter.value.set(this.stormCenterX, this.stormCenterZ);
      shell.mat.uniforms.uStormRadius.value = this.stormRadius;
    }
  }

  private updateEffects(dt: number, elapsed: number): void {
    // Animate ocean wave normals, foliage wind sway & storm barrier shimmer
    if (this.foliageTimeUniform) {
      this.foliageTimeUniform.value = elapsed;
    }
    if (this.waterNormalTex) {
      this.waterNormalTex.offset.x = (elapsed * 0.025) % 1;
      this.waterNormalTex.offset.y = (elapsed * 0.018) % 1;
    }
    this.stormTex.offset.x = (elapsed * 0.03) % 1;
    this.stormTex.offset.y = -(elapsed * 0.14) % 1;
    this.updateVolumetricFog(dt, elapsed);

    // Animate crate beacons
    for (const crate of this.crates) {
      if (crate.opened) continue;
      const beacon = crate.mesh.getObjectByName('beacon');
      if (beacon) {
        beacon.rotation.y = elapsed * 2.1;
        beacon.position.y = 1.42 + Math.sin(elapsed * 3.2) * 0.14;
      }
    }

    // Update tracer beams
    for (const t of this.tracers) {
      if (t.life > 0) {
        t.life -= dt;
        if (t.life <= 0) {
          t.mesh.visible = false;
        } else {
          (t.mesh.material as THREE.MeshBasicMaterial).opacity = (t.life / t.maxLife) * 0.9;
        }
      }
    }

    // Update impact sparks
    for (const s of this.sparks) {
      if (s.life > 0) {
        s.life -= dt;
        if (s.life <= 0) {
          s.mesh.visible = false;
        } else {
          s.vy -= 14 * dt;
          s.mesh.position.x += s.vx * dt;
          s.mesh.position.y += s.vy * dt;
          s.mesh.position.z += s.vz * dt;
          const scale = s.life / s.maxLife;
          s.mesh.scale.setScalar(scale);
        }
      }
    }

    // Smooth remote squadmate positions
    for (const [, avatar] of this.remoteAvatars) {
      avatar.rig.root.position.x = THREE.MathUtils.damp(avatar.rig.root.position.x, avatar.targetX, 10, dt);
      avatar.rig.root.position.y = THREE.MathUtils.damp(avatar.rig.root.position.y, avatar.targetY, 10, dt);
      avatar.rig.root.position.z = THREE.MathUtils.damp(avatar.rig.root.position.z, avatar.targetZ, 10, dt);
      avatar.rig.root.rotation.y = avatar.targetYaw + Math.PI;
    }

    // Expire old 3D ping beacons
    const now = performance.now();
    for (let i = this.pingBeacons.length - 1; i >= 0; i--) {
      if (now > this.pingBeacons[i].expiresAt) {
        this.scene.remove(this.pingBeacons[i].mesh);
        this.pingBeacons.splice(i, 1);
      } else {
        this.pingBeacons[i].mesh.children[1].rotation.y = elapsed * 2.5;
      }
    }
  }

  private emitHud(): void {
    const lootKey = formatKeyCode(this.controlSettings.keybinds.loot);
    let nearbyPrompt: string | null = null;
    for (const crate of this.crates) {
      if (crate.opened) continue;
      if (Math.hypot(crate.x - this.px, crate.z - this.pz) < 3.4) {
        nearbyPrompt =
          crate.tier === 'weapon' && crate.weaponId
            ? `[${lootKey}] EQUIP ${WEAPON_SPECS[crate.weaponId].name}`
            : `[${lootKey}] LOOT SUPPLY CRATE`;
        break;
      }
    }

    const blips: MinimapBlip[] = [];
    for (const bot of this.bots) {
      if (!bot.alive) continue;
      if (Math.hypot(bot.x - this.px, bot.z - this.pz) < 88) {
        blips.push({ x: bot.x, z: bot.z, kind: 'enemy' });
      }
    }
    for (const [, avatar] of this.remoteAvatars) {
      blips.push({
        x: avatar.rig.root.position.x,
        z: avatar.rig.root.position.z,
        kind: 'squad',
        label: avatar.callsign,
      });
    }
    for (const crate of this.crates) {
      if (!crate.opened) blips.push({ x: crate.x, z: crate.z, kind: 'crate' });
    }
    for (const ping of this.pingBeacons) {
      blips.push({ x: ping.x, z: ping.z, kind: 'ping', label: ping.label });
    }

    const aliveBots = this.bots.filter((b) => b.alive).length;
    const aliveCount = aliveBots + (this.hp > 0 ? 1 : 0);
    const activeSpec = WEAPON_SPECS[this.slots[this.activeSlot]?.id || 'rifle'];

    const nowMs = Date.now();
    this.killFeed = this.killFeed.filter((entry) => nowMs - entry.timestamp < 5500);

    this.callbacks.onHudUpdate({
      hp: Math.ceil(this.hp),
      maxHp: this.maxHp,
      shield: Math.ceil(this.shield),
      maxShield: this.maxShield,
      medkits: this.medkits,
      shieldCells: this.shieldCells,
      aliveCount,
      totalCount: this.bots.length + 1,
      kills: this.kills,
      damageDealt: Math.round(this.damageDealt),
      activeSlot: this.activeSlot,
      slots: this.slots.map((s) => ({ ...s })),
      reloading: this.reloading,
      reloadProgress: this.reloading ? 1 - this.reloadTimer / activeSpec.reloadTime : 0,
      ads: this.isZoomActive(),
      sprinting: this.isSprintActive(),
      inStorm: Math.hypot(this.px - this.stormCenterX, this.pz - this.stormCenterZ) > this.stormRadius,
      stormPhase: this.stormPhase,
      stormTimer: Math.max(0, Math.ceil(this.stormTimer)),
      stormRadius: this.stormRadius,
      stormCenterX: this.stormCenterX,
      stormCenterZ: this.stormCenterZ,
      playerX: this.px,
      playerZ: this.pz,
      playerYaw: this.yaw,
      nearbyPrompt,
      hitMarkerTimer: this.hitMarkerTimer,
      hitMarkerKill: this.hitMarkerKill,
      damageFlashTimer: this.damageFlashTimer,
      killFeed: [...this.killFeed],
      minimapBlips: blips,
      survivalSeconds: Math.floor(this.survivalSeconds),
      placement: this.hp > 0 ? aliveCount : aliveBots + 1,
      eliminatedBy: this.eliminatedBy,
      pointerLocked: this.pointerLocked,
    });
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private tick = (): void => {
    if (this.disposed) return;
    const rawDt = this.clock.getDelta();
    const dt = Math.min(rawDt, 0.05);
    const elapsed = this.clock.elapsedTime;

    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= dt;
    } else if (this.phase === 'title') {
      // Atmospheric Title Screen Orbit Pan over the live 3D island arena
      this.titleOrbitAngle += dt * 0.14;
      const orbitR = 38;
      this.camera.position.set(
        Math.cos(this.titleOrbitAngle) * orbitR,
        14.5 + Math.sin(elapsed * 0.4) * 1.4,
        Math.sin(this.titleOrbitAngle) * orbitR,
      );
      this.camera.lookAt(0, 3.2, 0);
      this.updateEffects(dt, elapsed);
    } else if (this.phase === 'playing') {
      this.updatePlayer(dt);
      this.updateBots(dt);
      this.updateStorm(dt);
      this.updateEffects(dt, elapsed);

      this.hudEmitAccum += dt;
      if (this.hudEmitAccum >= 0.05) {
        this.hudEmitAccum = 0;
        this.emitHud();
      }

      this.netEmitAccum += dt;
      if (this.netEmitAccum >= 0.1) {
        this.netEmitAccum = 0;
        this.callbacks.onPlayerStateEmit(this.px, this.py, this.pz, this.yaw, this.hp);
      }
    } else {
      // Paused / Victory / Eliminated subtle idle camera drift
      this.updateEffects(dt, elapsed);
    }

    if (!this.isSoftwareGl && this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);

    window.removeEventListener('keydown', this.onKeyDownBound);
    window.removeEventListener('keyup', this.onKeyUpBound);
    window.removeEventListener('mousemove', this.onMouseMoveBound);
    this.renderer.domElement.removeEventListener('mousedown', this.onMouseDownBound);
    window.removeEventListener('mouseup', this.onMouseUpBound);
    this.renderer.domElement.removeEventListener('contextmenu', this.onContextMenuBound);
    document.removeEventListener('pointerlockchange', this.onPointerLockChangeBound);
    document.removeEventListener('pointerlockerror', this.onPointerLockErrorBound);
    window.removeEventListener('resize', this.onResizeBound);
    window.removeEventListener('blur', this.onBlurBound);

    this.scene.traverse((obj) => {
      const m = obj as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      if (m.material) {
        if (Array.isArray(m.material)) {
          m.material.forEach((mat) => mat.dispose());
        } else {
          m.material.dispose();
        }
      }
    });
    this.composer?.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
