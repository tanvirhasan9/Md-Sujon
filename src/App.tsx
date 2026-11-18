import { useCallback, useEffect, useRef, useState } from 'react';
import { CommsPad } from './components/CommsPad';
import { ControlSettingsModal } from './components/ControlSettingsModal';
import { GameHUD } from './components/GameHUD';
import { MobileTouchControls } from './components/MobileTouchControls';
import { OfflineIndicator } from './components/OfflineIndicator';
import { TitleScreen } from './components/TitleScreen';
import { soundFX } from './game/audio';
import { BattleRoyaleEngine } from './game/BattleRoyaleEngine';
import {
  loadControlSettings,
  resolveTouchActive,
  saveControlSettings,
  type ControlSettings,
} from './game/controls';
import type { GamePhase, HudSnapshot, SquadMemberState, TacticalPing } from './game/types';
import { useCommsSocket } from './hooks/useCommsSocket';

const INITIAL_HUD: HudSnapshot = {
  hp: 100,
  maxHp: 100,
  shield: 50,
  maxShield: 100,
  medkits: 1,
  shieldCells: 2,
  aliveCount: 20,
  totalCount: 20,
  kills: 0,
  damageDealt: 0,
  activeSlot: 0,
  slots: [
    { id: 'rifle', unlocked: true, mag: 30, reserve: 120 },
    { id: 'shotgun', unlocked: false, mag: 8, reserve: 24 },
    { id: 'sniper', unlocked: false, mag: 5, reserve: 15 },
  ],
  reloading: false,
  reloadProgress: 0,
  ads: false,
  sprinting: false,
  inStorm: false,
  stormPhase: 1,
  stormTimer: 22,
  stormRadius: 114,
  stormCenterX: 0,
  stormCenterZ: 0,
  playerX: 0,
  playerZ: 14,
  playerYaw: Math.PI,
  nearbyPrompt: null,
  hitMarkerTimer: 0,
  hitMarkerKill: false,
  damageFlashTimer: 0,
  killFeed: [],
  minimapBlips: [],
  survivalSeconds: 0,
  placement: 20,
  eliminatedBy: null,
  pointerLocked: false,
};

function getInitialRoomFromUrl(): string {
  const params = new URLSearchParams(window.location.search);
  const room = params.get('room')?.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
  return room || 'ALPHA-1';
}

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<BattleRoyaleEngine | null>(null);

  const [phase, setPhase] = useState<GamePhase>('title');
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [muted, setMuted] = useState(false);
  const [commsOpen, setCommsOpen] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(
    () => typeof document !== 'undefined' && Boolean(document.fullscreenElement),
  );
  const [controlSettings, setControlSettings] = useState<ControlSettings>(loadControlSettings);

  const [callsign, setCallsign] = useState(
    () => `GHOST-${Math.floor(10 + Math.random() * 89)}`,
  );
  const [roomId, setRoomId] = useState(getInitialRoomFromUrl);
  const touchActive = resolveTouchActive(controlSettings);

  const handleSquadSync = useCallback((members: SquadMemberState[], selfId: string) => {
    engineRef.current?.syncSquadMembers(members, selfId);
  }, []);

  const handlePingReceived = useCallback((ping: TacticalPing) => {
    engineRef.current?.addPingBeacon(ping);
  }, []);

  const comms = useCommsSocket({
    roomId,
    callsign,
    onSquadSync: handleSquadSync,
    onPingReceived: handlePingReceived,
  });

  const emitPlayerStateRef = useRef(comms.emitPlayerState);
  const emitPingRef = useRef(comms.emitPing);
  emitPlayerStateRef.current = comms.emitPlayerState;
  emitPingRef.current = comms.emitPing;

  const toggleComms = useCallback(() => {
    setCommsOpen((prev) => {
      const next = !prev;
      comms.setCommsOpenFlag(next);
      if (next) {
        engineRef.current?.exitPointerLock();
      }
      return next;
    });
  }, [comms]);

  const toggleCommsRef = useRef(toggleComms);
  toggleCommsRef.current = toggleComms;

  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const engine = new BattleRoyaleEngine(mount, {
      onHudUpdate: (snapshot) => setHud(snapshot),
      onPhaseChange: (nextPhase) => setPhase(nextPhase),
      onToggleComms: () => toggleCommsRef.current(),
      onDropPing: (x, y, z, label) => emitPingRef.current(x, y, z, label),
      onPlayerStateEmit: (x, y, z, yaw, hp) => emitPlayerStateRef.current(x, y, z, yaw, hp),
    });
    engine.setControlSettings(controlSettings);
    engineRef.current = engine;

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    engineRef.current?.setControlSettings(controlSettings);
  }, [controlSettings]);

  useEffect(() => {
    engineRef.current?.setInputBlocked(controlsOpen);
    if (controlsOpen) {
      engineRef.current?.exitPointerLock();
    }
  }, [controlsOpen]);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const handleToggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    } else {
      document.documentElement.requestFullscreen?.().catch(() => {});
    }
  }, []);

  const handleDeploy = useCallback(() => {
    engineRef.current?.startNewMatch(callsign);
  }, [callsign]);

  const handleResume = useCallback(() => {
    engineRef.current?.setPhase('playing');
    engineRef.current?.requestPointerLock();
  }, []);

  const handlePause = useCallback(() => {
    engineRef.current?.setPhase('paused');
  }, []);

  const handleReturnTitle = useCallback(() => {
    engineRef.current?.resetMatchState('title');
  }, []);

  const handleToggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      soundFX.setMuted(next);
      return next;
    });
  }, []);

  const handleToggleZoom = useCallback(() => {
    engineRef.current?.toggleZoom();
  }, []);

  const handleToggleSprint = useCallback(() => {
    engineRef.current?.toggleSprint();
  }, []);

  const handleSelectSlot = useCallback((idx: number) => {
    engineRef.current?.selectWeaponSlot(idx);
  }, []);

  const handleTouchMove = useCallback((x: number, y: number) => {
    engineRef.current?.setTouchMove(x, y);
  }, []);

  const handleTouchLook = useCallback((dx: number, dy: number) => {
    engineRef.current?.addTouchLookDelta(dx, dy);
  }, []);

  const handleTouchFire = useCallback((held: boolean) => {
    engineRef.current?.setTouchFireHeld(held);
  }, []);

  const handleTouchJump = useCallback(() => {
    engineRef.current?.triggerJump();
  }, []);

  const handleTouchReload = useCallback(() => {
    engineRef.current?.triggerReload();
  }, []);

  const handleTouchLoot = useCallback(() => {
    engineRef.current?.triggerLoot();
  }, []);

  const handleTouchHeal = useCallback(() => {
    engineRef.current?.triggerHeal();
  }, []);

  const handleTouchPing = useCallback(() => {
    engineRef.current?.triggerPing();
  }, []);

  const handleControlSettingsChange = useCallback((next: ControlSettings) => {
    setControlSettings(next);
    saveControlSettings(next);
  }, []);

  const handleOpenControls = useCallback(() => {
    setControlsOpen(true);
  }, []);

  const handleCallsignChange = useCallback((name: string) => {
    setCallsign(name);
    engineRef.current?.setCallsign(name);
  }, []);

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#0d1520]">
      <OfflineIndicator />

      {/* Isolated WebGL Canvas Mount */}
      <div ref={canvasMountRef} className="w-full h-full" />

      {phase === 'title' ? (
        <TitleScreen
          callsign={callsign}
          roomId={roomId}
          onlineCount={comms.members.length}
          muted={muted}
          touchActive={touchActive}
          isFullscreen={isFullscreen}
          controlSettings={controlSettings}
          controlsOpen={controlsOpen}
          onChangeCallsign={handleCallsignChange}
          onChangeRoomId={(r) => setRoomId(r || 'ALPHA-1')}
          onToggleMute={handleToggleMute}
          onToggleFullscreen={handleToggleFullscreen}
          onOpenControls={handleOpenControls}
          onDeploy={handleDeploy}
        />
      ) : (
        <>
          {phase === 'playing' && touchActive && !controlsOpen && !commsOpen && (
            <MobileTouchControls
              hud={hud}
              buttonScale={controlSettings.touchButtonScale}
              onMoveStick={handleTouchMove}
              onLookDelta={handleTouchLook}
              onFireChange={handleTouchFire}
              onToggleZoom={handleToggleZoom}
              onToggleSprint={handleToggleSprint}
              onJump={handleTouchJump}
              onReload={handleTouchReload}
              onLoot={handleTouchLoot}
              onHeal={handleTouchHeal}
              onPing={handleTouchPing}
            />
          )}

          <GameHUD
            hud={hud}
            phase={phase}
            muted={muted}
            touchActive={touchActive}
            isFullscreen={isFullscreen}
            controlSettings={controlSettings}
            onToggleMute={handleToggleMute}
            onToggleFullscreen={handleToggleFullscreen}
            onToggleZoom={handleToggleZoom}
            onSelectSlot={handleSelectSlot}
            onPause={handlePause}
            onOpenControls={handleOpenControls}
            onResume={handleResume}
            onRedeploy={handleDeploy}
            onReturnTitle={handleReturnTitle}
          />
        </>
      )}

      {/* Control Settings Modal */}
      <ControlSettingsModal
        open={controlsOpen}
        settings={controlSettings}
        onChange={handleControlSettingsChange}
        onClose={() => setControlsOpen(false)}
      />

      {/* Collapsible Live SMS & WebRTC Voice Call Radio Handset */}
      <CommsPad
        open={commsOpen}
        onToggleOpen={toggleComms}
        roomId={roomId}
        clientId={comms.clientId}
        connected={comms.connected}
        messages={comms.messages}
        unreadCount={comms.unreadCount}
        members={comms.members}
        inCall={comms.inCall}
        muted={comms.muted}
        micLevel={comms.micLevel}
        callError={comms.callError}
        incomingCall={comms.incomingCall}
        onSendSms={comms.sendSms}
        onJoinCall={comms.joinCall}
        onLeaveCall={comms.leaveCall}
        onToggleMute={comms.toggleMute}
        onDeclineCall={comms.declineIncomingCall}
        compactTopDock={touchActive && phase === 'playing'}
      />
    </div>
  );
}
