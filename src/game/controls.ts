export type ControlAction =
  | 'forward'
  | 'backward'
  | 'left'
  | 'right'
  | 'sprint'
  | 'zoom'
  | 'jump'
  | 'reload'
  | 'loot'
  | 'heal'
  | 'ping'
  | 'comms';

export type TouchMode = 'auto' | 'on' | 'off';

export interface ControlSettings {
  lookSensitivity: number;
  adsSensitivity: number;
  invertY: boolean;
  sprintMode: 'toggle' | 'hold';
  zoomMode: 'toggle' | 'hold';
  touchMode: TouchMode;
  touchLookSensitivity: number;
  touchButtonScale: number;
  hapticsEnabled: boolean;
  keybinds: Record<ControlAction, string>;
}

export const CONTROL_ACTION_LABELS: { action: ControlAction; label: string; hint?: string }[] = [
  { action: 'forward', label: 'Move Forward' },
  { action: 'backward', label: 'Move Backward' },
  { action: 'left', label: 'Strafe Left' },
  { action: 'right', label: 'Strafe Right' },
  { action: 'sprint', label: 'Sprint / Auto-Run', hint: 'Runs forward automatically' },
  { action: 'zoom', label: 'Zoom / Scope (ADS)' },
  { action: 'jump', label: 'Jump' },
  { action: 'reload', label: 'Reload Weapon' },
  { action: 'loot', label: 'Open Crate / Loot' },
  { action: 'heal', label: 'Use Shield / Medkit' },
  { action: 'ping', label: 'Tactical Squad Ping' },
  { action: 'comms', label: 'Open Live SMS & Call' },
];

export const DEFAULT_CONTROL_SETTINGS: ControlSettings = {
  lookSensitivity: 1.0,
  adsSensitivity: 0.6,
  invertY: false,
  sprintMode: 'toggle',
  zoomMode: 'toggle',
  touchMode: 'auto',
  touchLookSensitivity: 1.1,
  touchButtonScale: 1.0,
  hapticsEnabled: true,
  keybinds: {
    forward: 'KeyW',
    backward: 'KeyS',
    left: 'KeyA',
    right: 'KeyD',
    sprint: 'ShiftLeft',
    zoom: 'KeyG',
    jump: 'Space',
    reload: 'KeyR',
    loot: 'KeyF',
    heal: 'KeyE',
    ping: 'KeyT',
    comms: 'KeyC',
  },
};

const STORAGE_KEY = 'apex_drop_controls_v1';

export function isTouchCapableDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(pointer: coarse)').matches ||
    navigator.maxTouchPoints > 0 ||
    'ontouchstart' in window
  );
}

export function resolveTouchActive(settings: ControlSettings): boolean {
  if (settings.touchMode === 'on') return true;
  if (settings.touchMode === 'off') return false;
  return isTouchCapableDevice();
}

export function loadControlSettings(): ControlSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_CONTROL_SETTINGS);
    const parsed = JSON.parse(raw) as Partial<ControlSettings>;
    return {
      lookSensitivity:
        typeof parsed.lookSensitivity === 'number'
          ? Math.min(2.5, Math.max(0.3, parsed.lookSensitivity))
          : DEFAULT_CONTROL_SETTINGS.lookSensitivity,
      adsSensitivity:
        typeof parsed.adsSensitivity === 'number'
          ? Math.min(1.5, Math.max(0.2, parsed.adsSensitivity))
          : DEFAULT_CONTROL_SETTINGS.adsSensitivity,
      invertY: Boolean(parsed.invertY),
      sprintMode: parsed.sprintMode === 'hold' ? 'hold' : 'toggle',
      zoomMode: parsed.zoomMode === 'hold' ? 'hold' : 'toggle',
      touchMode:
        parsed.touchMode === 'on' || parsed.touchMode === 'off' ? parsed.touchMode : 'auto',
      touchLookSensitivity:
        typeof parsed.touchLookSensitivity === 'number'
          ? Math.min(2.5, Math.max(0.4, parsed.touchLookSensitivity))
          : DEFAULT_CONTROL_SETTINGS.touchLookSensitivity,
      touchButtonScale:
        typeof parsed.touchButtonScale === 'number'
          ? Math.min(1.4, Math.max(0.8, parsed.touchButtonScale))
          : DEFAULT_CONTROL_SETTINGS.touchButtonScale,
      hapticsEnabled:
        typeof parsed.hapticsEnabled === 'boolean'
          ? parsed.hapticsEnabled
          : DEFAULT_CONTROL_SETTINGS.hapticsEnabled,
      keybinds: {
        ...DEFAULT_CONTROL_SETTINGS.keybinds,
        ...(parsed.keybinds || {}),
      },
    };
  } catch {
    return structuredClone(DEFAULT_CONTROL_SETTINGS);
  }
}

export function saveControlSettings(settings: ControlSettings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota / privacy mode errors
  }
}

export function formatKeyCode(code: string): string {
  if (!code) return '?';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'SHIFT';
  if (code === 'ControlLeft' || code === 'ControlRight') return 'CTRL';
  if (code === 'AltLeft' || code === 'AltRight') return 'ALT';
  if (code === 'Space') return 'SPACE';
  if (code === 'ArrowUp') return 'UP';
  if (code === 'ArrowDown') return 'DOWN';
  if (code === 'ArrowLeft') return 'LEFT';
  if (code === 'ArrowRight') return 'RIGHT';
  return code.toUpperCase();
}

export function matchesControlKey(code: string, boundCode: string, key?: string): boolean {
  if (code === boundCode) return true;
  if (
    (boundCode === 'ShiftLeft' || boundCode === 'ShiftRight') &&
    (code === 'ShiftLeft' || code === 'ShiftRight' || key === 'Shift')
  ) {
    return true;
  }
  return false;
}
