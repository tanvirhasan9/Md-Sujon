import React, { useEffect, useRef, useState } from 'react';
import {
  Clock,
  Crosshair,
  Flame,
  Heart,
  Maximize2,
  Minimize2,
  Pause,
  RotateCcw,
  Shield,
  Skull,
  SlidersHorizontal,
  Trophy,
  Users,
  Volume2,
  VolumeX,
  ZoomIn,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { WEAPON_SPECS } from '../game/BattleRoyaleEngine';
import { formatKeyCode, type ControlSettings } from '../game/controls';
import type { GamePhase, HudSnapshot } from '../game/types';

interface GameHUDProps {
  hud: HudSnapshot;
  phase: GamePhase;
  muted: boolean;
  touchActive: boolean;
  isFullscreen: boolean;
  controlSettings: ControlSettings;
  onToggleMute: () => void;
  onToggleFullscreen: () => void;
  onToggleZoom: () => void;
  onSelectSlot: (idx: number) => void;
  onPause: () => void;
  onOpenControls: () => void;
  onResume: () => void;
  onRedeploy: () => void;
  onReturnTitle: () => void;
}

export const GameHUD: React.FC<GameHUDProps> = ({
  hud,
  phase,
  muted,
  touchActive,
  isFullscreen,
  controlSettings,
  onToggleMute,
  onToggleFullscreen,
  onToggleZoom,
  onSelectSlot,
  onPause,
  onOpenControls,
  onResume,
  onRedeploy,
  onReturnTitle,
}) => {
  const minimapRef = useRef<HTMLCanvasElement | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const KILL_FEED_TTL_MS = 5000;

  useEffect(() => {
    if (hud.killFeed.length === 0) return;
    const current = Date.now();
    setNow(current);
    const earliestExpiry = Math.min(
      ...hud.killFeed.map((entry) => entry.timestamp + KILL_FEED_TTL_MS),
    );
    const delay = Math.max(16, earliestExpiry - current + 20);
    const timer = window.setTimeout(() => {
      setNow(Date.now());
    }, delay);
    return () => window.clearTimeout(timer);
  }, [hud.killFeed]);

  const visibleKillFeed = hud.killFeed.filter(
    (entry) => now - entry.timestamp < KILL_FEED_TTL_MS,
  );

  useEffect(() => {
    const canvas = minimapRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = 136;
    const half = size / 2;
    const scale = half / 128;

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#0c131d';
    ctx.fillRect(0, 0, size, size);

    // Subtle radar rings
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
    ctx.lineWidth = 1;
    [28, 52].forEach((r) => {
      ctx.beginPath();
      ctx.arc(half, half, r, 0, Math.PI * 2);
      ctx.stroke();
    });

    // Safe Zone circle
    const zx = half + hud.stormCenterX * scale;
    const zz = half + hud.stormCenterZ * scale;
    const zr = hud.stormRadius * scale;
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(zx, zz, Math.max(2, zr), 0, Math.PI * 2);
    ctx.stroke();

    // Blips (crates, pings, enemies, squadmates)
    for (const blip of hud.minimapBlips) {
      const bx = half + blip.x * scale;
      const bz = half + blip.z * scale;
      if (bx < 2 || bx > size - 2 || bz < 2 || bz > size - 2) continue;
      if (blip.kind === 'crate') {
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(bx - 1.5, bz - 1.5, 3, 3);
      } else if (blip.kind === 'enemy') {
        ctx.fillStyle = '#f87171';
        ctx.beginPath();
        ctx.arc(bx, bz, 2.3, 0, Math.PI * 2);
        ctx.fill();
      } else if (blip.kind === 'squad') {
        ctx.fillStyle = '#34d399';
        ctx.beginPath();
        ctx.arc(bx, bz, 3.2, 0, Math.PI * 2);
        ctx.fill();
      } else if (blip.kind === 'ping') {
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.moveTo(bx, bz - 4);
        ctx.lineTo(bx + 4, bz);
        ctx.lineTo(bx, bz + 4);
        ctx.lineTo(bx - 4, bz);
        ctx.closePath();
        ctx.fill();
      }
    }

    // Player chevron
    const px = half + hud.playerX * scale;
    const pz = half + hud.playerZ * scale;
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(-hud.playerYaw);
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.moveTo(0, -5);
    ctx.lineTo(4, 4);
    ctx.lineTo(0, 2);
    ctx.lineTo(-4, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }, [hud]);

  const activeSlot = hud.slots[hud.activeSlot] || hud.slots[0];
  const activeSpec = WEAPON_SPECS[activeSlot?.id || 'rifle'];
  const zoomKey = formatKeyCode(controlSettings.keybinds.zoom);
  const healKey = formatKeyCode(controlSettings.keybinds.heal);
  const pingKey = formatKeyCode(controlSettings.keybinds.ping);
  const commsKey = formatKeyCode(controlSettings.keybinds.comms);

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-10 pointer-events-none select-none overflow-hidden">
      {/* Damage / Storm Vignette Flash */}
      {(hud.damageFlashTimer > 0 || hud.inStorm) && phase === 'playing' && (
        <div
          className="absolute inset-0 transition-opacity duration-150"
          style={{
            boxShadow: hud.inStorm
              ? 'inset 0 0 90px rgba(239, 68, 68, 0.55)'
              : 'inset 0 0 70px rgba(239, 68, 68, 0.45)',
          }}
        />
      )}

      {/* TOP-LEFT: Match Counters + (On Touch: Compact Armor/HP) + Killfeed */}
      <div className="absolute top-3 left-3 sm:top-4 sm:left-4 flex flex-col gap-1.5 sm:gap-2">
        <div className="flex items-center gap-1.5 sm:gap-2 bg-[#0d1520]/90 border border-slate-700/80 rounded-md px-2.5 py-1 sm:px-3 sm:py-1.5 text-[10px] sm:text-xs font-mono tabular-nums text-slate-100">
          <span className="flex items-center gap-1 text-emerald-400 font-bold">
            <Users className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            {hud.aliveCount}/{hud.totalCount}
          </span>
          <span className="text-slate-600">|</span>
          <span className="flex items-center gap-1 text-amber-400 font-bold">
            <Skull className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            {hud.kills}
          </span>
          <span className="text-slate-600">|</span>
          <span className={hud.inStorm ? 'text-rose-400 font-bold' : 'text-sky-300'}>
            P{hud.stormPhase} · {formatTimer(hud.stormTimer)}
          </span>
        </div>

        {/* On Phone Touch Mode: keep Armor & Health bar cleanly at Top-Left above the Joystick */}
        {touchActive && (
          <div className="w-48 sm:w-56 bg-[#0d1520]/88 border border-slate-700/80 rounded-md px-2.5 py-1.5 space-y-1">
            <div className="flex items-center justify-between text-[10px] font-mono tabular-nums">
              <span className="text-sky-300 font-bold">ARMOR {hud.shield}</span>
              <span className="text-emerald-400 font-bold">HP {hud.hp}</span>
            </div>
            <div className="h-1.5 rounded-sm bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-sky-400 transition-all duration-100"
                style={{ width: `${(hud.shield / hud.maxShield) * 100}%` }}
              />
            </div>
            <div className="h-1.5 rounded-sm bg-slate-800 overflow-hidden">
              <div
                className={`h-full transition-all duration-100 ${
                  hud.hp > 35 ? 'bg-emerald-500' : 'bg-rose-500'
                }`}
                style={{ width: `${(hud.hp / hud.maxHp) * 100}%` }}
              />
            </div>
          </div>
        )}

        {hud.inStorm && phase === 'playing' && (
          <div className="bg-rose-950/90 border border-rose-500/70 text-rose-200 px-2.5 py-1 rounded text-[10px] sm:text-[11px] font-mono font-bold tracking-wider uppercase w-fit">
            OUTSIDE SAFE ZONE — MOVE INWARD
          </div>
        )}

        {/* Compact Animated Killfeed */}
        <div className="flex flex-col gap-1 mt-0.5">
          <AnimatePresence initial={false}>
            {visibleKillFeed.slice(0, touchActive ? 2 : 5).map((entry) => (
              <motion.div
                key={entry.id}
                layout
                initial={{ opacity: 0, y: -14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                transition={{ duration: 0.28, ease: 'easeOut' }}
                className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded text-[10px] sm:text-[11px] font-mono w-fit border ${
                  entry.isPlayerKill
                    ? 'bg-amber-950/90 border-amber-500/60 text-amber-200'
                    : 'bg-[#0d1520]/85 border-slate-700/60 text-slate-300'
                }`}
              >
                <span className="font-bold">{entry.killer}</span>{' '}
                <span className="text-slate-400">[{entry.weapon}]</span>{' '}
                <span className="text-rose-300">{entry.victim}</span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      {/* TOP-RIGHT: Tactical Minimap Radar + Controls / Pause / Mute */}
      <div className="absolute top-3 right-3 sm:top-4 sm:right-4 flex flex-col items-end gap-1.5 sm:gap-2">
        <div className="rounded-md overflow-hidden border border-slate-700/80 bg-[#0c131d] shadow-lg">
          <canvas
            ref={minimapRef}
            width={136}
            height={136}
            className="block w-[88px] h-[88px] sm:w-[136px] sm:h-[136px]"
          />
          <div className="px-1.5 sm:px-2 py-0.5 bg-[#121c2a] border-t border-slate-800 flex items-center justify-between text-[9px] sm:text-[10px] font-mono text-slate-400 tabular-nums">
            <span className="hidden sm:inline">RADAR 128M</span>
            <span>R={Math.round(hud.stormRadius)}M</span>
          </div>
        </div>
        <div className="flex flex-wrap justify-end items-center gap-1 sm:gap-1.5">
          {!touchActive && (
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onToggleZoom();
              }}
              className={`pointer-events-auto flex items-center gap-1.5 px-2.5 py-1 rounded border text-[11px] font-mono font-bold cursor-pointer transition-colors ${
                hud.ads
                  ? 'bg-sky-500 border-sky-300 text-slate-950 shadow-[0_0_12px_rgba(56,189,248,0.45)]'
                  : 'bg-[#0d1520]/90 border-slate-700/80 text-slate-200 hover:border-sky-400'
              }`}
            >
              <ZoomIn className={`w-3.5 h-3.5 ${hud.ads ? 'text-slate-950' : 'text-sky-400'}`} />
              {hud.ads ? 'ZOOMED' : 'ZOOM'}
              <span
                className={`px-1 rounded text-[10px] border ${
                  hud.ads
                    ? 'bg-slate-950/20 border-slate-950/40 text-slate-950'
                    : 'bg-[#162130] border-slate-600 text-sky-300'
                }`}
              >
                {zoomKey}
              </span>
            </button>
          )}

          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onToggleFullscreen();
            }}
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            className="pointer-events-auto flex items-center gap-1 px-2 py-1 rounded bg-[#0d1520]/90 border border-slate-700/80 text-slate-300 hover:border-emerald-400 text-[11px] font-mono cursor-pointer"
          >
            {isFullscreen ? (
              <Minimize2 className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5 text-emerald-400" />
            )}
          </button>

          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onOpenControls();
            }}
            title="Control & Phone Settings"
            className="pointer-events-auto flex items-center gap-1 px-2 py-1 rounded bg-[#0d1520]/90 border border-slate-700/80 text-slate-300 hover:border-sky-400 text-[11px] font-mono cursor-pointer"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-sky-400" />
            <span className="hidden sm:inline">CTRL</span>
          </button>

          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onPause();
            }}
            title="Pause Match"
            className="pointer-events-auto flex items-center gap-1 px-2 py-1 rounded bg-[#0d1520]/90 border border-slate-700/80 text-slate-300 hover:border-amber-400 text-[11px] font-mono cursor-pointer"
          >
            <Pause className="w-3.5 h-3.5 text-amber-400" />
          </button>

          <button
            type="button"
            onClick={onToggleMute}
            className="pointer-events-auto flex items-center gap-1.5 px-2 py-1 sm:px-2.5 rounded bg-[#0d1520]/90 border border-slate-700/80 text-slate-300 hover:border-amber-400 text-[11px] font-mono cursor-pointer"
          >
            {muted ? (
              <VolumeX className="w-3.5 h-3.5 text-rose-400" />
            ) : (
              <Volume2 className="w-3.5 h-3.5 text-amber-400" />
            )}
            <span className="hidden sm:inline">{muted ? 'MUTED' : 'SFX'}</span>
          </button>
        </div>
      </div>

      {/* CENTER: Tactical Crosshair + Hitmarker + Loot Prompt */}
      {phase === 'playing' && (
        <div className="absolute inset-0 flex items-center justify-center">
          {hud.ads && (
            <div className="absolute w-44 h-44 rounded-full border border-sky-400/35 shadow-[0_0_0_9999px_rgba(4,8,14,0.28)] pointer-events-none" />
          )}
          <div className="relative flex items-center justify-center">
            {/* Crosshair lines */}
            <div
              className={`relative transition-transform duration-75 ${
                hud.ads ? 'scale-75' : 'scale-100'
              }`}
            >
              <div className="w-1 h-1 rounded-full bg-white shadow-[0_0_4px_#000]" />
              <div className="absolute left-1/2 -top-3.5 -translate-x-1/2 w-[1.5px] h-2 bg-white/90" />
              <div className="absolute left-1/2 top-2 -translate-x-1/2 w-[1.5px] h-2 bg-white/90" />
              <div className="absolute top-1/2 -left-3.5 -translate-y-1/2 h-[1.5px] w-2 bg-white/90" />
              <div className="absolute top-1/2 left-2 -translate-y-1/2 h-[1.5px] w-2 bg-white/90" />
            </div>

            {/* Hitmarker X */}
            {hud.hitMarkerTimer > 0 && (
              <svg
                viewBox="0 0 28 28"
                className="absolute w-7 h-7"
              >
                <g stroke={hud.hitMarkerKill ? '#ef4444' : '#facc15'} strokeWidth="2.4" strokeLinecap="round">
                  <line x1="5" y1="5" x2="10" y2="10" />
                  <line x1="23" y1="5" x2="18" y2="10" />
                  <line x1="5" y1="23" x2="10" y2="18" />
                  <line x1="23" y1="23" x2="18" y2="18" />
                </g>
              </svg>
            )}

            {/* Reloading Pill */}
            {hud.reloading && (
              <div className="absolute top-8 px-2.5 py-0.5 rounded bg-[#0d1520]/90 border border-amber-400/70 text-[10px] font-mono text-amber-300 whitespace-nowrap tabular-nums">
                RELOADING {Math.round(hud.reloadProgress * 100)}%
              </div>
            )}

            {/* Nearby Crate Prompt */}
            {hud.nearbyPrompt && (
              <div className="absolute top-14 px-3 py-1 rounded bg-[#0d1520]/95 border border-amber-400 text-xs font-mono font-bold text-amber-300 whitespace-nowrap shadow">
                {hud.nearbyPrompt}
              </div>
            )}

            {/* Pointer lock hint if unlocked (Desktop only) */}
            {!touchActive && !hud.pointerLocked && (
              <div className="absolute -top-12 px-3 py-1 rounded bg-[#0d1520]/90 border border-sky-400/60 text-[11px] font-mono text-sky-200 whitespace-nowrap">
                CLICK ARENA TO LOCK AIM · [{commsKey}] FOR LIVE SMS & CALL
              </div>
            )}
          </div>
        </div>
      )}

      {/* BOTTOM-LEFT: Shield & HP Bars + Quick Meds (Desktop / non-touch layout) */}
      {!touchActive && (
        <div className="absolute bottom-4 left-4 w-64 bg-[#0d1520]/92 border border-slate-700/80 rounded-md p-3 space-y-2">
          <div className="flex items-center justify-between text-xs font-mono tabular-nums">
            <span className="flex items-center gap-1.5 text-sky-300 font-bold">
              <Shield className="w-3.5 h-3.5" />
              ARMOR {hud.shield}
            </span>
            <span className="text-slate-400">
              [{healKey}] MED:{hud.medkits} · CELL:{hud.shieldCells}
            </span>
          </div>
          <div className="h-2 rounded-sm bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-sky-400 transition-all duration-100"
              style={{ width: `${(hud.shield / hud.maxShield) * 100}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-xs font-mono tabular-nums pt-0.5">
            <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
              <Heart className="w-3.5 h-3.5" />
              HEALTH {hud.hp}
            </span>
            <span className="text-slate-400">[{pingKey}] PING</span>
          </div>
          <div className="h-2.5 rounded-sm bg-slate-800 overflow-hidden">
            <div
              className={`h-full transition-all duration-100 ${
                hud.hp > 35 ? 'bg-emerald-500' : 'bg-rose-500'
              }`}
              style={{ width: `${(hud.hp / hud.maxHp) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* BOTTOM-CENTER: Weapon Loadout Slots + Ammo (Clickable for Touch & Desktop) */}
      <div className="absolute bottom-2 sm:bottom-4 left-1/2 -translate-x-1/2 flex items-end gap-1.5 sm:gap-2 pointer-events-auto">
        <div className="flex items-center gap-1 sm:gap-1.5 bg-[#0d1520]/92 border border-slate-700/80 rounded-md p-1 sm:p-1.5">
          {hud.slots.map((slot, idx) => {
            const spec = WEAPON_SPECS[slot.id];
            const isActive = idx === hud.activeSlot;
            return (
              <button
                key={slot.id}
                type="button"
                disabled={!slot.unlocked}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  if (slot.unlocked) onSelectSlot(idx);
                }}
                className={`px-2 py-1 sm:px-2.5 sm:py-1.5 rounded text-[10px] sm:text-[11px] font-mono tabular-nums border text-left cursor-pointer disabled:cursor-default ${
                  !slot.unlocked
                    ? 'bg-slate-900/60 border-slate-800 text-slate-600'
                    : isActive
                      ? 'bg-[#172536] border-amber-400 text-slate-100'
                      : 'bg-[#111926] border-slate-700/70 text-slate-400 hover:border-slate-500'
                }`}
              >
                <div className="flex items-center gap-1">
                  {!touchActive && <span className="text-[10px] text-slate-400">[{idx + 1}]</span>}
                  <span className="font-bold">{spec.shortName}</span>
                </div>
                <div className="text-[9px] sm:text-[10px] text-slate-400 mt-0.5">
                  {slot.unlocked ? `${slot.mag}/${slot.reserve}` : 'CRATE'}
                </div>
              </button>
            );
          })}
        </div>

        {activeSlot && !touchActive && (
          <div className="bg-[#0d1520]/92 border border-slate-700/80 rounded-md px-3.5 py-2 font-mono tabular-nums">
            <div className="text-[10px] text-amber-400 font-bold tracking-wider">
              {activeSpec.name}
            </div>
            <div className="text-lg font-black text-slate-100 leading-tight">
              {activeSlot.mag}{' '}
              <span className="text-xs font-normal text-slate-400">/ {activeSlot.reserve}</span>
            </div>
          </div>
        )}
      </div>

      {/* PAUSE / VICTORY / POST-MATCH ELIMINATION SUMMARY MODAL */}
      {(phase === 'paused' || phase === 'victory' || phase === 'eliminated') && (
        <div className="absolute inset-0 bg-[#070b12]/82 flex items-center justify-center p-4 pointer-events-auto">
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.24, ease: 'easeOut' }}
            className="w-full max-w-lg rounded-lg bg-[#0f1722] border border-slate-700 p-6 shadow-2xl space-y-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                {phase === 'victory' ? (
                  <Trophy className="w-8 h-8 text-amber-400 shrink-0" />
                ) : phase === 'eliminated' ? (
                  <Skull className="w-8 h-8 text-rose-400 shrink-0" />
                ) : (
                  <Crosshair className="w-8 h-8 text-sky-400 shrink-0" />
                )}
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-widest text-slate-400">
                    {phase === 'paused' ? 'TACTICAL PAUSE' : 'POST-MATCH SUMMARY'}
                  </div>
                  <h2 className="text-2xl font-black tracking-wide text-slate-100 uppercase">
                    {phase === 'victory'
                      ? 'VICTORY ROYALE'
                      : phase === 'eliminated'
                        ? 'ELIMINATED'
                        : 'MATCH PAUSED'}
                  </h2>
                </div>
              </div>

              <div className="px-3 py-1.5 rounded bg-[#162130] border border-slate-700 text-right font-mono tabular-nums">
                <div className="text-[10px] text-slate-400">PLACEMENT</div>
                <div className="text-sm font-black text-slate-100">
                  #{hud.placement} <span className="text-slate-500 font-normal">/ {hud.totalCount}</span>
                </div>
              </div>
            </div>

            {phase === 'eliminated' && hud.eliminatedBy && (
              <div className="flex items-center justify-between px-3.5 py-2 rounded bg-rose-950/60 border border-rose-500/50 text-xs font-mono">
                <span className="text-rose-200">
                  ELIMINATED BY <span className="font-bold text-white">{hud.eliminatedBy.killer}</span>
                </span>
                <span className="px-2 py-0.5 rounded bg-rose-900/70 text-rose-200 text-[10px] font-bold">
                  {hud.eliminatedBy.weapon}
                </span>
              </div>
            )}

            {/* Primary Post-Match Telemetry Cards */}
            <div className="grid grid-cols-3 gap-3 text-center font-mono tabular-nums">
              <div className="rounded-md bg-[#162130] border border-slate-800 p-3.5 flex flex-col items-center gap-1">
                <Clock className="w-4 h-4 text-emerald-400" />
                <div className="text-[10px] text-slate-400 tracking-wider">SURVIVAL TIME</div>
                <div className="text-2xl font-black text-emerald-400">
                  {formatTimer(hud.survivalSeconds)}
                </div>
                <div className="text-[10px] text-slate-500">{hud.survivalSeconds}s TOTAL</div>
              </div>

              <div className="rounded-md bg-[#162130] border border-slate-800 p-3.5 flex flex-col items-center gap-1">
                <Skull className="w-4 h-4 text-amber-400" />
                <div className="text-[10px] text-slate-400 tracking-wider">TOTAL KILLS</div>
                <div className="text-2xl font-black text-amber-400">{hud.kills}</div>
                <div className="text-[10px] text-slate-500">ELIMINATIONS</div>
              </div>

              <div className="rounded-md bg-[#162130] border border-slate-800 p-3.5 flex flex-col items-center gap-1">
                <Flame className="w-4 h-4 text-sky-400" />
                <div className="text-[10px] text-slate-400 tracking-wider">DAMAGE DEALT</div>
                <div className="text-2xl font-black text-sky-400">{hud.damageDealt}</div>
                <div className="text-[10px] text-slate-500">
                  {hud.survivalSeconds > 0
                    ? `${Math.round((hud.damageDealt / Math.max(1, hud.survivalSeconds)) * 60)} DMG/MIN`
                    : '0 DMG/MIN'}
                </div>
              </div>
            </div>

            {phase !== 'paused' && (
              <div className="flex items-center justify-between px-3.5 py-2 rounded bg-[#121c29] border border-slate-800 text-[11px] font-mono text-slate-400 tabular-nums">
                <span>STORM PHASE REACHED: P{hud.stormPhase}</span>
                <span>SURVIVORS LEFT: {hud.aliveCount}</span>
              </div>
            )}

            <div className="flex flex-col gap-2.5">
              {phase === 'paused' && (
                <button
                  type="button"
                  onClick={onResume}
                  className="w-full py-3 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-black tracking-wider uppercase text-sm cursor-pointer"
                >
                  RESUME COMBAT
                </button>
              )}
              <button
                type="button"
                onClick={onOpenControls}
                className="w-full py-2.5 rounded bg-[#182334] hover:bg-[#1f2d42] border border-slate-700 text-sky-300 font-mono text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                CONTROL SETTINGS
              </button>
              <button
                type="button"
                onClick={onRedeploy}
                className="w-full py-3 rounded bg-sky-500 hover:bg-sky-400 text-slate-950 font-black tracking-wider uppercase text-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                REDEPLOY NEW MATCH
              </button>
              <button
                type="button"
                onClick={onReturnTitle}
                className="w-full py-2.5 rounded bg-[#182334] hover:bg-[#1f2d42] border border-slate-700 text-slate-300 font-mono text-xs uppercase tracking-wider cursor-pointer"
              >
                RETURN TO BRIEFING
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};
