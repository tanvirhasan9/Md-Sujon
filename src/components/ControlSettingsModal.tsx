import React, { useEffect, useState } from 'react';
import { Keyboard, Mouse, RotateCcw, SlidersHorizontal, Smartphone, X } from 'lucide-react';
import {
  CONTROL_ACTION_LABELS,
  DEFAULT_CONTROL_SETTINGS,
  formatKeyCode,
  type ControlAction,
  type ControlSettings,
  type TouchMode,
} from '../game/controls';

interface ControlSettingsModalProps {
  open: boolean;
  settings: ControlSettings;
  onChange: (next: ControlSettings) => void;
  onClose: () => void;
}

export const ControlSettingsModal: React.FC<ControlSettingsModalProps> = ({
  open,
  settings,
  onChange,
  onClose,
}) => {
  const [listeningAction, setListeningAction] = useState<ControlAction | null>(null);

  useEffect(() => {
    if (!open) {
      setListeningAction(null);
      return;
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (listeningAction) {
        e.preventDefault();
        e.stopPropagation();
        if (e.code === 'Escape') {
          setListeningAction(null);
          return;
        }
        const newCode = e.code || e.key;
        if (!newCode) return;

        const prevCode = settings.keybinds[listeningAction];
        const nextBinds = { ...settings.keybinds };
        // Swap if another action already uses this key so bindings never silently collide
        (Object.keys(nextBinds) as ControlAction[]).forEach((act) => {
          if (act !== listeningAction && nextBinds[act] === newCode) {
            nextBinds[act] = prevCode;
          }
        });
        nextBinds[listeningAction] = newCode;

        onChange({
          ...settings,
          keybinds: nextBinds,
        });
        setListeningAction(null);
        return;
      }

      if (e.code === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, listeningAction, settings, onChange, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 bg-[#070b12]/86 flex items-center justify-center p-4 pointer-events-auto"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="w-full max-w-2xl max-h-[88vh] flex flex-col rounded-lg bg-[#0f1722] border border-slate-700 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-[#121c29]">
          <div className="flex items-center gap-2.5">
            <SlidersHorizontal className="w-5 h-5 text-amber-400" />
            <div>
              <h2 className="text-base font-black tracking-wider uppercase text-slate-100">
                Control Settings
              </h2>
              <p className="text-[11px] font-mono text-slate-400">
                Customize sensitivity, sprint/zoom behavior & keybindings
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded bg-[#182334] border border-slate-700 text-slate-300 hover:border-amber-400 hover:text-white cursor-pointer"
            aria-label="Close Control Settings"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Mouse & Camera Section */}
          <section className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-mono font-bold tracking-wider uppercase text-sky-300">
              <Mouse className="w-4 h-4" />
              Aim & Movement Behavior
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-md bg-[#141f2e] border border-slate-800 p-3 space-y-2">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-300">Look Sensitivity</span>
                  <span className="font-bold text-amber-400 tabular-nums">
                    {settings.lookSensitivity.toFixed(2)}x
                  </span>
                </div>
                <input
                  type="range"
                  min={0.3}
                  max={2.5}
                  step={0.05}
                  value={settings.lookSensitivity}
                  onChange={(e) =>
                    onChange({ ...settings, lookSensitivity: parseFloat(e.target.value) })
                  }
                  className="w-full accent-amber-400 cursor-pointer"
                />
              </div>

              <div className="rounded-md bg-[#141f2e] border border-slate-800 p-3 space-y-2">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-300">Zoom / ADS Sensitivity</span>
                  <span className="font-bold text-sky-400 tabular-nums">
                    {settings.adsSensitivity.toFixed(2)}x
                  </span>
                </div>
                <input
                  type="range"
                  min={0.2}
                  max={1.5}
                  step={0.05}
                  value={settings.adsSensitivity}
                  onChange={(e) =>
                    onChange({ ...settings, adsSensitivity: parseFloat(e.target.value) })
                  }
                  className="w-full accent-sky-400 cursor-pointer"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Invert Y-Axis */}
              <div className="rounded-md bg-[#141f2e] border border-slate-800 p-3 flex items-center justify-between">
                <span className="text-xs font-mono text-slate-300">Invert Y-Axis</span>
                <button
                  type="button"
                  onClick={() => onChange({ ...settings, invertY: !settings.invertY })}
                  className={`px-2.5 py-1 rounded text-[11px] font-mono font-bold border cursor-pointer ${
                    settings.invertY
                      ? 'bg-amber-500 border-amber-300 text-slate-950'
                      : 'bg-[#1a2638] border-slate-700 text-slate-300'
                  }`}
                >
                  {settings.invertY ? 'ON' : 'OFF'}
                </button>
              </div>

              {/* Sprint Mode */}
              <div className="rounded-md bg-[#141f2e] border border-slate-800 p-3 flex items-center justify-between">
                <span className="text-xs font-mono text-slate-300">Sprint Mode</span>
                <div className="flex rounded overflow-hidden border border-slate-700 text-[10px] font-mono font-bold">
                  {(['toggle', 'hold'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => onChange({ ...settings, sprintMode: mode })}
                      className={`px-2 py-1 uppercase cursor-pointer ${
                        settings.sprintMode === mode
                          ? 'bg-amber-500 text-slate-950'
                          : 'bg-[#1a2638] text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              {/* Zoom Mode */}
              <div className="rounded-md bg-[#141f2e] border border-slate-800 p-3 flex items-center justify-between">
                <span className="text-xs font-mono text-slate-300">Zoom Key Mode</span>
                <div className="flex rounded overflow-hidden border border-slate-700 text-[10px] font-mono font-bold">
                  {(['toggle', 'hold'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => onChange({ ...settings, zoomMode: mode })}
                      className={`px-2 py-1 uppercase cursor-pointer ${
                        settings.zoomMode === mode
                          ? 'bg-sky-500 text-slate-950'
                          : 'bg-[#1a2638] text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Phone & Android Touch Settings Section */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-mono font-bold tracking-wider uppercase text-emerald-400">
                <Smartphone className="w-4 h-4" />
                Phone &amp; Android Touch Settings
              </div>
              <span className="text-[11px] font-mono text-slate-500">
                Virtual Joystick · Touch Aim · Haptics
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Touch Controls Mode */}
              <div className="rounded-md bg-[#141f2e] border border-slate-800 p-3 flex items-center justify-between">
                <div>
                  <div className="text-xs font-mono text-slate-200">On-Screen Touch Pad</div>
                  <div className="text-[10px] font-mono text-slate-500">
                    Auto enables on Android phones
                  </div>
                </div>
                <div className="flex rounded overflow-hidden border border-slate-700 text-[10px] font-mono font-bold">
                  {(['auto', 'on', 'off'] as TouchMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => onChange({ ...settings, touchMode: mode })}
                      className={`px-2 py-1 uppercase cursor-pointer ${
                        settings.touchMode === mode
                          ? 'bg-emerald-500 text-slate-950'
                          : 'bg-[#1a2638] text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              {/* Vibration / Haptics */}
              <div className="rounded-md bg-[#141f2e] border border-slate-800 p-3 flex items-center justify-between">
                <div>
                  <div className="text-xs font-mono text-slate-200">Phone Vibration</div>
                  <div className="text-[10px] font-mono text-slate-500">
                    Tactile feedback on shoot &amp; hit
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onChange({ ...settings, hapticsEnabled: !settings.hapticsEnabled })
                  }
                  className={`px-2.5 py-1 rounded text-[11px] font-mono font-bold border cursor-pointer ${
                    settings.hapticsEnabled
                      ? 'bg-emerald-500 border-emerald-300 text-slate-950'
                      : 'bg-[#1a2638] border-slate-700 text-slate-300'
                  }`}
                >
                  {settings.hapticsEnabled ? 'ON' : 'OFF'}
                </button>
              </div>

              {/* Touch Look Sensitivity */}
              <div className="rounded-md bg-[#141f2e] border border-slate-800 p-3 space-y-2">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-300">Touch Aim Sensitivity</span>
                  <span className="font-bold text-emerald-400 tabular-nums">
                    {settings.touchLookSensitivity.toFixed(2)}x
                  </span>
                </div>
                <input
                  type="range"
                  min={0.4}
                  max={2.5}
                  step={0.05}
                  value={settings.touchLookSensitivity}
                  onChange={(e) =>
                    onChange({ ...settings, touchLookSensitivity: parseFloat(e.target.value) })
                  }
                  className="w-full accent-emerald-400 cursor-pointer"
                />
              </div>

              {/* Touch Button Scale */}
              <div className="rounded-md bg-[#141f2e] border border-slate-800 p-3 space-y-2">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-300">Touch Button Size</span>
                  <span className="font-bold text-amber-400 tabular-nums">
                    {Math.round(settings.touchButtonScale * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0.8}
                  max={1.4}
                  step={0.05}
                  value={settings.touchButtonScale}
                  onChange={(e) =>
                    onChange({ ...settings, touchButtonScale: parseFloat(e.target.value) })
                  }
                  className="w-full accent-amber-400 cursor-pointer"
                />
              </div>
            </div>
          </section>

          {/* Keybindings Section */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-mono font-bold tracking-wider uppercase text-amber-400">
                <Keyboard className="w-4 h-4" />
                Keybindings
              </div>
              <span className="text-[11px] font-mono text-slate-500">
                Click any key badge to rebind · Right-Click also zooms
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {CONTROL_ACTION_LABELS.map(({ action, label, hint }) => {
                const isListening = listeningAction === action;
                const keyLabel = formatKeyCode(settings.keybinds[action]);
                return (
                  <div
                    key={action}
                    className="flex items-center justify-between px-3 py-2 rounded-md bg-[#141f2e] border border-slate-800"
                  >
                    <div>
                      <div className="text-xs font-mono text-slate-200">{label}</div>
                      {hint && <div className="text-[10px] font-mono text-slate-500">{hint}</div>}
                    </div>
                    <button
                      type="button"
                      onClick={() => setListeningAction(isListening ? null : action)}
                      className={`min-w-[74px] px-2.5 py-1 rounded text-xs font-mono font-black border text-center cursor-pointer transition-colors ${
                        isListening
                          ? 'bg-amber-500 border-amber-300 text-slate-950 animate-pulse'
                          : 'bg-[#1a2638] border-slate-600 text-sky-300 hover:border-amber-400'
                      }`}
                    >
                      {isListening ? 'PRESS...' : keyLabel}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-800 bg-[#121c29]">
          <button
            type="button"
            onClick={() => onChange(structuredClone(DEFAULT_CONTROL_SETTINGS))}
            className="flex items-center gap-1.5 px-3 py-2 rounded bg-[#182334] hover:bg-[#1f2d42] border border-slate-700 text-slate-300 text-xs font-mono font-bold uppercase cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Defaults
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black tracking-wider uppercase cursor-pointer"
          >
            Save & Close
          </button>
        </div>
      </div>
    </div>
  );
};
