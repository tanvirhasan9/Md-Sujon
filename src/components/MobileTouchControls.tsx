import React, { useEffect, useRef, useState } from 'react';
import {
  Crosshair,
  Footprints,
  HeartPulse,
  MapPin,
  PackageOpen,
  RotateCw,
  ZoomIn,
} from 'lucide-react';
import type { HudSnapshot } from '../game/types';

interface MobileTouchControlsProps {
  hud: HudSnapshot;
  buttonScale: number;
  onMoveStick: (x: number, y: number) => void;
  onLookDelta: (dx: number, dy: number) => void;
  onFireChange: (held: boolean) => void;
  onToggleZoom: () => void;
  onToggleSprint: () => void;
  onJump: () => void;
  onReload: () => void;
  onLoot: () => void;
  onHeal: () => void;
  onPing: () => void;
}

export const MobileTouchControls: React.FC<MobileTouchControlsProps> = ({
  hud,
  buttonScale,
  onMoveStick,
  onLookDelta,
  onFireChange,
  onToggleZoom,
  onToggleSprint,
  onJump,
  onReload,
  onLoot,
  onHeal,
  onPing,
}) => {
  const [knobOffset, setKnobOffset] = useState({ x: 0, y: 0 });
  const [stickActive, setStickActive] = useState(false);
  const [fireActive, setFireActive] = useState(false);

  const stickPointerId = useRef<number | null>(null);
  const stickCenter = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const stickBaseRef = useRef<HTMLDivElement | null>(null);

  const lookPointerId = useRef<number | null>(null);
  const lookLastPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const firePointerId = useRef<number | null>(null);

  const maxRadius = Math.round(46 * buttonScale);
  const baseDiameter = Math.round(118 * buttonScale);
  const knobDiameter = Math.round(48 * buttonScale);

  useEffect(() => {
    return () => {
      onMoveStick(0, 0);
      onFireChange(false);
    };
  }, [onMoveStick, onFireChange]);

  const updateStickFromPoint = (clientX: number, clientY: number) => {
    const dx = clientX - stickCenter.current.x;
    const dy = clientY - stickCenter.current.y;
    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(dist, maxRadius);
    const angle = Math.atan2(dy, dx);
    const ox = dist > 0.001 ? Math.cos(angle) * clamped : 0;
    const oy = dist > 0.001 ? Math.sin(angle) * clamped : 0;

    setKnobOffset({ x: ox, y: oy });
    // Screen Y is inverted relative to forward (+Y forward = drag up)
    onMoveStick(ox / maxRadius, -oy / maxRadius);
  };

  const handleStickDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (stickPointerId.current !== null) return;
    stickPointerId.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);

    const rect = stickBaseRef.current?.getBoundingClientRect();
    if (rect) {
      stickCenter.current = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    } else {
      stickCenter.current = { x: e.clientX, y: e.clientY };
    }
    setStickActive(true);
    updateStickFromPoint(e.clientX, e.clientY);
  };

  const handleStickMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== stickPointerId.current) return;
    e.preventDefault();
    updateStickFromPoint(e.clientX, e.clientY);
  };

  const handleStickUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== stickPointerId.current) return;
    stickPointerId.current = null;
    setStickActive(false);
    setKnobOffset({ x: 0, y: 0 });
    onMoveStick(0, 0);
  };

  const handleLookDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (lookPointerId.current !== null) return;
    lookPointerId.current = e.pointerId;
    lookLastPos.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleLookMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== lookPointerId.current) return;
    e.preventDefault();
    const dx = e.clientX - lookLastPos.current.x;
    const dy = e.clientY - lookLastPos.current.y;
    lookLastPos.current = { x: e.clientX, y: e.clientY };
    onLookDelta(dx, dy);
  };

  const handleLookUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== lookPointerId.current) return;
    lookPointerId.current = null;
  };

  const handleFireDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (firePointerId.current !== null) return;
    firePointerId.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    setFireActive(true);
    onFireChange(true);
  };

  const handleFireUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerId !== firePointerId.current) return;
    e.stopPropagation();
    firePointerId.current = null;
    setFireActive(false);
    onFireChange(false);
  };

  const btnSize = Math.round(48 * buttonScale);
  const fireSize = Math.round(74 * buttonScale);

  return (
    <div className="fixed inset-0 z-10 pointer-events-none select-none touch-none">
      {/* Right-Half Touch Camera Look Zone (above/behind action buttons) */}
      <div
        onPointerDown={handleLookDown}
        onPointerMove={handleLookMove}
        onPointerUp={handleLookUp}
        onPointerCancel={handleLookUp}
        className="absolute top-16 bottom-4 left-[38%] right-0 pointer-events-auto touch-none"
        aria-label="Touch Camera Aim Pad"
      />

      {/* Contextual Loot Button (Center-Bottom above weapon bar) */}
      {hud.nearbyPrompt && (
        <button
          type="button"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onLoot();
          }}
          className="pointer-events-auto touch-none absolute bottom-24 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-md bg-amber-500 active:bg-amber-400 text-slate-950 font-mono font-black text-xs tracking-wider uppercase shadow-xl border border-amber-200"
        >
          <PackageOpen className="w-4 h-4" />
          TAP TO LOOT
        </button>
      )}

      {/* LEFT SIDE: Auto-Run Toggle + Virtual Movement Joystick */}
      <div className="absolute bottom-6 left-4 sm:left-6 flex flex-col items-start gap-2.5 pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleSprint();
            }}
            className={`touch-none flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-[11px] font-mono font-bold uppercase tracking-wider shadow-lg ${
              hud.sprinting
                ? 'bg-amber-500 border-amber-300 text-slate-950'
                : 'bg-[#0d1520]/85 border-slate-700/80 text-slate-200'
            }`}
          >
            <Footprints className="w-3.5 h-3.5" />
            {hud.sprinting ? 'RUNNING' : 'AUTO RUN'}
          </button>

          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onHeal();
            }}
            className="touch-none flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-[#0d1520]/85 active:bg-emerald-500 active:text-slate-950 border border-slate-700/80 text-emerald-300 text-[11px] font-mono font-bold uppercase shadow-lg"
          >
            <HeartPulse className="w-3.5 h-3.5" />
            HEAL ({hud.medkits + hud.shieldCells})
          </button>
        </div>

        {/* Virtual Analog Joystick */}
        <div
          ref={stickBaseRef}
          onPointerDown={handleStickDown}
          onPointerMove={handleStickMove}
          onPointerUp={handleStickUp}
          onPointerCancel={handleStickUp}
          style={{ width: baseDiameter, height: baseDiameter }}
          className={`pointer-events-auto touch-none relative rounded-full border-2 flex items-center justify-center transition-colors ${
            stickActive
              ? 'bg-[#101c2c]/70 border-sky-400/80'
              : 'bg-[#0d1520]/55 border-slate-600/70'
          }`}
        >
          {/* Crosshair guide lines inside joystick base */}
          <div className="absolute inset-3 rounded-full border border-slate-600/35 pointer-events-none" />
          <div className="absolute top-1.5 text-[9px] font-mono text-slate-400/80 pointer-events-none">
            ▲
          </div>
          {/* Movable thumb puck */}
          <div
            style={{
              width: knobDiameter,
              height: knobDiameter,
              transform: `translate(${knobOffset.x}px, ${knobOffset.y}px)`,
            }}
            className={`rounded-full border-2 shadow-lg pointer-events-none transition-colors ${
              hud.sprinting
                ? 'bg-amber-400/90 border-amber-100'
                : stickActive
                  ? 'bg-sky-400/90 border-white'
                  : 'bg-slate-300/65 border-slate-100/80'
            }`}
          />
        </div>
      </div>

      {/* RIGHT SIDE: Ergonomic Action & Fire Cluster */}
      <div className="absolute bottom-14 right-4 sm:right-6 flex flex-col items-end gap-2.5 pointer-events-none">
        {/* Top Row: Ping + Reload + Zoom */}
        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onPing();
            }}
            style={{ width: btnSize, height: btnSize }}
            aria-label="Tactical Ping"
            className="touch-none rounded-full bg-[#0d1520]/85 active:bg-sky-500 active:text-slate-950 border border-slate-600/80 text-sky-300 flex flex-col items-center justify-center shadow-lg"
          >
            <MapPin className="w-4 h-4" />
            <span className="text-[8px] font-mono font-bold mt-0.5">PING</span>
          </button>

          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onReload();
            }}
            style={{ width: btnSize, height: btnSize }}
            aria-label="Reload Weapon"
            className={`touch-none rounded-full border flex flex-col items-center justify-center shadow-lg ${
              hud.reloading
                ? 'bg-amber-500/30 border-amber-400 text-amber-300'
                : 'bg-[#0d1520]/85 active:bg-amber-500 active:text-slate-950 border-slate-600/80 text-slate-200'
            }`}
          >
            <RotateCw className={`w-4 h-4 ${hud.reloading ? 'animate-spin' : ''}`} />
            <span className="text-[8px] font-mono font-bold mt-0.5">RELOAD</span>
          </button>

          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleZoom();
            }}
            style={{ width: btnSize, height: btnSize }}
            aria-label="Zoom Scope"
            className={`touch-none rounded-full border flex flex-col items-center justify-center shadow-lg ${
              hud.ads
                ? 'bg-sky-500 border-sky-200 text-slate-950'
                : 'bg-[#0d1520]/85 border-slate-600/80 text-sky-300'
            }`}
          >
            <ZoomIn className="w-4 h-4" />
            <span className="text-[8px] font-mono font-bold mt-0.5">ZOOM</span>
          </button>
        </div>

        {/* Bottom Row: Jump + Large Fire Trigger */}
        <div className="flex items-end gap-3 pointer-events-auto">
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onJump();
            }}
            style={{ width: Math.round(54 * buttonScale), height: Math.round(54 * buttonScale) }}
            aria-label="Jump"
            className="touch-none rounded-full bg-[#0d1520]/85 active:bg-slate-200 active:text-slate-950 border border-slate-500/80 text-slate-100 font-mono font-black text-[10px] tracking-wider shadow-lg flex items-center justify-center"
          >
            JUMP
          </button>

          <button
            type="button"
            onPointerDown={handleFireDown}
            onPointerUp={handleFireUp}
            onPointerCancel={handleFireUp}
            style={{ width: fireSize, height: fireSize }}
            aria-label="Fire Weapon"
            className={`touch-none rounded-full border-2 flex flex-col items-center justify-center shadow-2xl transition-transform ${
              fireActive
                ? 'bg-rose-500 border-amber-200 text-white scale-95'
                : 'bg-amber-500/90 border-amber-200 text-slate-950'
            }`}
          >
            <Crosshair className="w-6 h-6" />
            <span className="text-[10px] font-mono font-black tracking-wider mt-0.5">FIRE</span>
          </button>
        </div>
      </div>
    </div>
  );
};
