import React, { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Maximize2,
  Minimize2,
  Radio,
  Shield,
  SlidersHorizontal,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { formatKeyCode, type ControlSettings } from '../game/controls';
import { PWAInstallButton } from './PWAInstallButton';

interface TitleScreenProps {
  callsign: string;
  roomId: string;
  onlineCount: number;
  muted: boolean;
  touchActive: boolean;
  isFullscreen: boolean;
  controlSettings: ControlSettings;
  controlsOpen: boolean;
  onChangeCallsign: (name: string) => void;
  onChangeRoomId: (room: string) => void;
  onToggleMute: () => void;
  onToggleFullscreen: () => void;
  onOpenControls: () => void;
  onDeploy: () => void;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  callsign,
  roomId,
  onlineCount,
  muted,
  touchActive,
  isFullscreen,
  controlSettings,
  controlsOpen,
  onChangeCallsign,
  onChangeRoomId,
  onToggleMute,
  onToggleFullscreen,
  onOpenControls,
  onDeploy,
}) => {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (controlsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        onDeploy();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDeploy, controlsOpen]);

  const copyInvite = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('room', roomId);
    navigator.clipboard?.writeText(url.toString()).catch(() => {});
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const kb = controlSettings.keybinds;

  return (
    <div className="fixed inset-0 z-20 flex flex-col justify-between p-4 sm:p-6 md:p-10 overflow-y-auto pointer-events-none select-none">
      {/* Top-right PWA install, fullscreen, phone/controls & audio toggles */}
      <div className="flex flex-wrap justify-end items-center gap-2 pointer-events-auto">
        <PWAInstallButton />
        <button
          type="button"
          onClick={onToggleFullscreen}
          title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-[#0f1722]/90 border border-slate-700/80 text-slate-200 hover:border-emerald-400/80 transition-colors text-xs font-mono tracking-wider uppercase cursor-pointer"
        >
          {isFullscreen ? (
            <Minimize2 className="w-4 h-4 text-emerald-400" />
          ) : (
            <Maximize2 className="w-4 h-4 text-emerald-400" />
          )}
          <span className="hidden sm:inline">{isFullscreen ? 'Exit Full' : 'Fullscreen'}</span>
        </button>
        <button
          type="button"
          onClick={onOpenControls}
          className="flex items-center gap-2 px-3 py-2 rounded-md bg-[#0f1722]/90 border border-slate-700/80 text-slate-200 hover:border-sky-400/80 transition-colors text-xs font-mono tracking-wider uppercase cursor-pointer"
        >
          <SlidersHorizontal className="w-4 h-4 text-sky-400" />
          {touchActive ? 'Phone Settings' : 'Controls'}
        </button>
        <button
          type="button"
          onClick={onToggleMute}
          className="flex items-center gap-2 px-3 py-2 rounded-md bg-[#0f1722]/90 border border-slate-700/80 text-slate-200 hover:border-amber-400/70 transition-colors text-xs font-mono tracking-wider uppercase cursor-pointer"
        >
          {muted ? (
            <VolumeX className="w-4 h-4 text-rose-400" />
          ) : (
            <Volume2 className="w-4 h-4 text-amber-400" />
          )}
          <span className="hidden sm:inline">{muted ? 'Audio Muted' : 'Audio On'}</span>
        </button>
      </div>

      {/* Left-aligned Title Lockup leaving center & right 3D island vista open */}
      <div className="max-w-md my-3 pointer-events-auto">
        <div className="mb-3 sm:mb-5">
          <svg
            viewBox="0 0 380 108"
            className="w-full max-w-[280px] sm:max-w-[360px] h-auto drop-shadow-[0_6px_18px_rgba(0,0,0,0.65)]"
            aria-label="APEX DROP 3D Battle Royale"
          >
            <defs>
              <linearGradient id="apexAccent" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#f59e0b" />
                <stop offset="100%" stopColor="#38bdf8" />
              </linearGradient>
            </defs>
            {/* Tactical reticle emblem */}
            <circle cx="34" cy="48" r="24" fill="none" stroke="#f59e0b" strokeWidth="2.5" />
            <circle cx="34" cy="48" r="8" fill="none" stroke="#38bdf8" strokeWidth="2" />
            <line x1="34" y1="16" x2="34" y2="32" stroke="#f59e0b" strokeWidth="2.5" />
            <line x1="34" y1="64" x2="34" y2="80" stroke="#f59e0b" strokeWidth="2.5" />
            <line x1="2" y1="48" x2="18" y2="48" stroke="#f59e0b" strokeWidth="2.5" />
            <line x1="50" y1="48" x2="66" y2="48" stroke="#f59e0b" strokeWidth="2.5" />

            <text
              x="80"
              y="56"
              fill="#f8fafc"
              fontFamily="ui-sans-serif, system-ui, sans-serif"
              fontWeight="900"
              fontSize="42"
              letterSpacing="3"
            >
              APEX DROP
            </text>
            <rect x="80" y="68" width="268" height="3" fill="url(#apexAccent)" rx="1.5" />
            <text
              x="80"
              y="90"
              fill="#cbd5e1"
              fontFamily="ui-monospace, monospace"
              fontWeight="700"
              fontSize="12.5"
              letterSpacing="3.4"
            >
              3D BATTLE ROYALE · LIVE COMMS
            </text>
          </svg>
        </div>

        {/* Squad & Room Configuration Card */}
        <div className="rounded-lg bg-[#0d1520]/92 border border-slate-700/80 p-4 sm:p-5 shadow-2xl space-y-3.5 sm:space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-1">
                Operator Callsign
              </label>
              <input
                type="text"
                maxLength={16}
                value={callsign}
                onChange={(e) => onChangeCallsign(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 rounded bg-[#162130] border border-slate-600/80 text-slate-100 font-mono text-sm focus:outline-none focus:border-amber-400"
                placeholder="GHOST-01"
              />
            </div>

            <div>
              <label className="block text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-1">
                Squad Room Code
              </label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  maxLength={14}
                  value={roomId}
                  onChange={(e) =>
                    onChangeRoomId(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''))
                  }
                  className="w-full px-3 py-2 rounded bg-[#162130] border border-slate-600/80 text-sky-300 font-mono text-sm focus:outline-none focus:border-sky-400"
                  placeholder="ALPHA-1"
                />
                <button
                  type="button"
                  onClick={copyInvite}
                  title="Copy Squad Invite Link"
                  className="px-2.5 rounded bg-[#1b2838] border border-slate-600/80 text-slate-200 hover:border-sky-400 transition-colors cursor-pointer"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] sm:text-xs font-mono text-slate-300 bg-[#131d2b] px-3 py-2 rounded border border-slate-800">
            <span className="flex items-center gap-2">
              <Radio className="w-3.5 h-3.5 text-emerald-400" />
              ROOM {roomId || 'ALPHA-1'} · {onlineCount} ONLINE
            </span>
            <span className="flex items-center gap-1.5 text-amber-300">
              <Shield className="w-3.5 h-3.5" />
              20 COMBATANTS
            </span>
          </div>

          <button
            type="button"
            onClick={onDeploy}
            className="w-full py-3.5 rounded-md bg-amber-500 hover:bg-amber-400 active:translate-y-px text-slate-950 font-black tracking-widest uppercase text-sm transition-colors shadow-lg cursor-pointer"
          >
            DEPLOY TO ARENA
          </button>
        </div>
      </div>

      {/* Single flat control-hint line */}
      <div className="flex justify-center pb-10 sm:pb-0">
        <div className="px-3 sm:px-4 py-1.5 rounded bg-[#0d1520]/88 border border-slate-700/70 text-[10px] sm:text-[11px] font-mono tracking-wider text-slate-300 uppercase text-center">
          {touchActive
            ? 'Left Joystick Move · Right Swipe Aim · Fire / Zoom / Jump / Reload Touch Pad · Live SMS & Call'
            : `${formatKeyCode(kb.forward)}${formatKeyCode(kb.left)}${formatKeyCode(kb.backward)}${formatKeyCode(kb.right)} Move · Mouse Aim/Fire · ${formatKeyCode(kb.zoom)} / Right-Click Zoom · ${formatKeyCode(kb.sprint)} Run · ${formatKeyCode(kb.jump)} Jump · ${formatKeyCode(kb.loot)} Loot · ${formatKeyCode(kb.reload)} Reload · ${formatKeyCode(kb.ping)} Ping · ${formatKeyCode(kb.comms)} SMS/Call · Esc Pause`}
        </div>
      </div>
    </div>
  );
};
