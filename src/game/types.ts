export type GamePhase = 'title' | 'playing' | 'paused' | 'victory' | 'eliminated';

export type WeaponId = 'rifle' | 'shotgun' | 'sniper';

export interface WeaponSpec {
  id: WeaponId;
  name: string;
  shortName: string;
  damage: number;
  fireRate: number; // shots per second
  magSize: number;
  reloadTime: number; // seconds
  range: number;
  spread: number;
  pellets: number;
  auto: boolean;
  adsFov: number;
  accentColor: string;
}

export interface WeaponSlotState {
  id: WeaponId;
  unlocked: boolean;
  mag: number;
  reserve: number;
}

export interface KillFeedEntry {
  id: string;
  killer: string;
  victim: string;
  weapon: string;
  isPlayerKill: boolean;
  isZoneElim?: boolean;
  timestamp: number;
}

export interface MinimapBlip {
  x: number;
  z: number;
  kind: 'enemy' | 'squad' | 'crate' | 'ping';
  label?: string;
}

export interface TacticalPing {
  id: string;
  senderId: string;
  senderName: string;
  x: number;
  y: number;
  z: number;
  label: string;
  createdAt: number;
}

export interface SquadMemberState {
  clientId: string;
  callsign: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  hp: number;
  inCall: boolean;
  muted: boolean;
}

export interface HudSnapshot {
  hp: number;
  maxHp: number;
  shield: number;
  maxShield: number;
  medkits: number;
  shieldCells: number;
  aliveCount: number;
  totalCount: number;
  kills: number;
  damageDealt: number;
  activeSlot: number;
  slots: WeaponSlotState[];
  reloading: boolean;
  reloadProgress: number;
  ads: boolean;
  sprinting: boolean;
  inStorm: boolean;
  stormPhase: number;
  stormTimer: number;
  stormRadius: number;
  stormCenterX: number;
  stormCenterZ: number;
  playerX: number;
  playerZ: number;
  playerYaw: number;
  nearbyPrompt: string | null;
  hitMarkerTimer: number;
  hitMarkerKill: boolean;
  damageFlashTimer: number;
  killFeed: KillFeedEntry[];
  minimapBlips: MinimapBlip[];
  survivalSeconds: number;
  placement: number;
  eliminatedBy: { killer: string; weapon: string } | null;
  pointerLocked: boolean;
}

export interface SmsMessage {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  text: string;
  tag?: 'ALERT' | 'LOOT' | 'ZONE' | 'MEDIC' | 'CHAT';
  timestamp: number;
}

export interface CallParticipant {
  clientId: string;
  callsign: string;
  muted: boolean;
  speaking: boolean;
}

export interface IncomingCallOffer {
  fromId: string;
  fromName: string;
  roomId: string;
  timestamp: number;
}
