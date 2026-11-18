import { useCallback, useEffect, useRef, useState } from 'react';
import { soundFX } from '../game/audio';
import type {
  IncomingCallOffer,
  SmsMessage,
  SquadMemberState,
  TacticalPing,
} from '../game/types';

interface UseCommsOptions {
  roomId: string;
  callsign: string;
  onSquadSync: (members: SquadMemberState[], selfId: string) => void;
  onPingReceived: (ping: TacticalPing) => void;
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

export function useCommsSocket({
  roomId,
  callsign,
  onSquadSync,
  onPingReceived,
}: UseCommsOptions) {
  const [clientId] = useState(
    () => `op-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
  );
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<SmsMessage[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [members, setMembers] = useState<SquadMemberState[]>([]);
  const [inCall, setInCall] = useState(false);
  const [muted, setMuted] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [callError, setCallError] = useState<string | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCallOffer | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const roomRef = useRef(roomId);
  const callsignRef = useRef(callsign);
  const inCallRef = useRef(false);
  const mutedRef = useRef(false);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const remoteAudiosRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const audioMeterRafRef = useRef<number>(0);
  const audioMeterCtxRef = useRef<AudioContext | null>(null);
  const onSquadSyncRef = useRef(onSquadSync);
  const onPingReceivedRef = useRef(onPingReceived);
  const commsOpenRef = useRef(false);

  roomRef.current = roomId;
  callsignRef.current = callsign;
  inCallRef.current = inCall;
  mutedRef.current = muted;
  onSquadSyncRef.current = onSquadSync;
  onPingReceivedRef.current = onPingReceived;

  const setCommsOpenFlag = useCallback((open: boolean) => {
    commsOpenRef.current = open;
    if (open) setUnreadCount(0);
  }, []);

  const sendRaw = useCallback((payload: unknown) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }, []);

  const closePeer = useCallback((peerId: string) => {
    const pc = peersRef.current.get(peerId);
    if (pc) {
      pc.close();
      peersRef.current.delete(peerId);
    }
    const audioEl = remoteAudiosRef.current.get(peerId);
    if (audioEl) {
      audioEl.srcObject = null;
      audioEl.remove();
      remoteAudiosRef.current.delete(peerId);
    }
  }, []);

  const createPeerConnection = useCallback(
    (peerId: string, initiator: boolean) => {
      closePeer(peerId);
      const pc = new RTCPeerConnection(RTC_CONFIG);
      peersRef.current.set(peerId, pc);

      if (localStreamRef.current) {
        for (const track of localStreamRef.current.getTracks()) {
          pc.addTrack(track, localStreamRef.current);
        }
      }

      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          sendRaw({
            type: 'rtc:ice',
            targetId: peerId,
            candidate: ev.candidate,
          });
        }
      };

      pc.ontrack = (ev) => {
        let audio = remoteAudiosRef.current.get(peerId);
        if (!audio) {
          audio = document.createElement('audio');
          audio.autoplay = true;
          audio.setAttribute('playsinline', 'true');
          document.body.appendChild(audio);
          remoteAudiosRef.current.set(peerId, audio);
        }
        audio.srcObject = ev.streams[0];
      };

      if (initiator) {
        pc.createOffer()
          .then((offer) => pc.setLocalDescription(offer).then(() => offer))
          .then((offer) => {
            sendRaw({
              type: 'rtc:offer',
              targetId: peerId,
              sdp: offer,
            });
          })
          .catch(() => {});
      }

      return pc;
    },
    [closePeer, sendRaw],
  );

  const stopMicMeter = useCallback(() => {
    cancelAnimationFrame(audioMeterRafRef.current);
    if (audioMeterCtxRef.current) {
      audioMeterCtxRef.current.close().catch(() => {});
      audioMeterCtxRef.current = null;
    }
    setMicLevel(0);
  }, []);

  const startMicMeter = useCallback((stream: MediaStream) => {
    stopMicMeter();
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    audioMeterCtxRef.current = ctx;
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 64;
    src.connect(analyser);
    const buf = new Uint8Array(analyser.frequencyBinCount);

    const sample = () => {
      if (!inCallRef.current) return;
      analyser.getByteFrequencyData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i];
      const avg = sum / buf.length / 255;
      setMicLevel(mutedRef.current ? 0 : Math.min(1, avg * 2.4));
      audioMeterRafRef.current = requestAnimationFrame(sample);
    };
    audioMeterRafRef.current = requestAnimationFrame(sample);
  }, [stopMicMeter]);

  const leaveCall = useCallback(() => {
    setInCall(false);
    setMuted(false);
    setIncomingCall(null);
    stopMicMeter();
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    for (const peerId of Array.from(peersRef.current.keys())) {
      closePeer(peerId);
    }
    sendRaw({ type: 'call:leave' });
  }, [closePeer, sendRaw, stopMicMeter]);

  const joinCall = useCallback(async () => {
    setCallError(null);
    setIncomingCall(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      localStreamRef.current = stream;
      startMicMeter(stream);
    } catch {
      setCallError('Microphone access unavailable — joined in listen-only mode');
    }

    setInCall(true);
    setMuted(false);
    sendRaw({ type: 'call:join', muted: false });

    // Initiate WebRTC offers to all peers already in call
    setMembers((curr) => {
      for (const m of curr) {
        if (m.clientId !== clientId && m.inCall) {
          createPeerConnection(m.clientId, true);
        }
      }
      return curr;
    });
  }, [clientId, createPeerConnection, sendRaw, startMicMeter]);

  const toggleMute = useCallback(() => {
    const next = !mutedRef.current;
    setMuted(next);
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((t) => {
        t.enabled = !next;
      });
    }
    sendRaw({ type: 'call:mute', muted: next });
  }, [sendRaw]);

  const declineIncomingCall = useCallback(() => {
    if (incomingCall) {
      sendRaw({ type: 'call:decline', targetId: incomingCall.fromId });
    }
    setIncomingCall(null);
  }, [incomingCall, sendRaw]);

  const sendSms = useCallback(
    (text: string, tag: SmsMessage['tag'] = 'CHAT') => {
      const clean = text.trim();
      if (!clean) return;
      const id = `${clientId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      sendRaw({
        type: 'sms:send',
        id,
        text: clean,
        tag,
      });
    },
    [clientId, sendRaw],
  );

  const emitPlayerState = useCallback(
    (x: number, y: number, z: number, yaw: number, hp: number) => {
      sendRaw({ type: 'player:state', x, y, z, yaw, hp });
    },
    [sendRaw],
  );

  const emitPing = useCallback(
    (x: number, y: number, z: number, label: string) => {
      const id = `${clientId}-${Date.now()}`;
      sendRaw({ type: 'ping:drop', id, x, y, z, label });
    },
    [clientId, sendRaw],
  );

  // Connect & Reconnect WebSocket
  useEffect(() => {
    let active = true;

    const connect = () => {
      if (!active) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!active) return;
        setConnected(true);
        ws.send(
          JSON.stringify({
            type: 'room:join',
            roomId: roomRef.current,
            clientId,
            callsign: callsignRef.current,
          }),
        );
      };

      ws.onmessage = async (event) => {
        if (!active) return;
        let data: Record<string, unknown>;
        try {
          data = JSON.parse(String(event.data)) as Record<string, unknown>;
        } catch {
          return;
        }

        const type = String(data.type || '');

        if (type === 'room:init') {
          const hist = (data.smsHistory as SmsMessage[]) || [];
          setMessages(hist);
          const list = (data.members as SquadMemberState[]) || [];
          setMembers(list);
          onSquadSyncRef.current(list, clientId);
          return;
        }

        if (type === 'room:presence') {
          const list = (data.members as SquadMemberState[]) || [];
          setMembers(list);
          onSquadSyncRef.current(list, clientId);
          return;
        }

        if (type === 'sms:receive') {
          const msg = data.message as SmsMessage;
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev.slice(-90), msg];
          });
          if (msg.senderId !== clientId) {
            soundFX.playSmsChirp();
            if (!commsOpenRef.current) {
              setUnreadCount((c) => c + 1);
            }
          }
          return;
        }

        if (type === 'player:state') {
          const updated: SquadMemberState = {
            clientId: String(data.clientId),
            callsign: String(data.callsign),
            x: Number(data.x) || 0,
            y: Number(data.y) || 0,
            z: Number(data.z) || 0,
            yaw: Number(data.yaw) || 0,
            hp: Number(data.hp) ?? 100,
            inCall: false,
            muted: false,
          };
          setMembers((prev) => {
            const next = prev.map((m) =>
              m.clientId === updated.clientId ? { ...m, ...updated, inCall: m.inCall, muted: m.muted } : m,
            );
            onSquadSyncRef.current(next, clientId);
            return next;
          });
          return;
        }

        if (type === 'ping:drop') {
          const ping = data.ping as TacticalPing;
          onPingReceivedRef.current(ping);
          return;
        }

        if (type === 'call:ring') {
          if (!inCallRef.current) {
            soundFX.playRingtone();
            setIncomingCall({
              fromId: String(data.fromId),
              fromName: String(data.fromName),
              roomId: String(data.roomId),
              timestamp: Number(data.timestamp) || Date.now(),
            });
          }
          return;
        }

        if (type === 'call:peer_left') {
          closePeer(String(data.clientId));
          return;
        }

        if (type === 'rtc:offer') {
          if (!inCallRef.current) return;
          const fromId = String(data.fromId);
          const pc = createPeerConnection(fromId, false);
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp as RTCSessionDescriptionInit));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendRaw({ type: 'rtc:answer', targetId: fromId, sdp: answer });
          return;
        }

        if (type === 'rtc:answer') {
          const fromId = String(data.fromId);
          const pc = peersRef.current.get(fromId);
          if (pc && pc.signalingState !== 'stable') {
            await pc.setRemoteDescription(new RTCSessionDescription(data.sdp as RTCSessionDescriptionInit));
          }
          return;
        }

        if (type === 'rtc:ice') {
          const fromId = String(data.fromId);
          const pc = peersRef.current.get(fromId);
          if (pc && data.candidate) {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate as RTCIceCandidateInit)).catch(() => {});
          }
        }
      };

      ws.onclose = () => {
        if (!active) return;
        setConnected(false);
        reconnectTimerRef.current = window.setTimeout(connect, 1800);
      };
    };

    connect();

    return () => {
      active = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
      stopMicMeter();
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      for (const peerId of Array.from(peersRef.current.keys())) {
        closePeer(peerId);
      }
    };
  }, [clientId, closePeer, createPeerConnection, sendRaw, stopMicMeter]);

  // Re-join room when roomId or callsign changes
  useEffect(() => {
    if (connected) {
      sendRaw({
        type: 'room:join',
        roomId,
        clientId,
        callsign,
      });
    }
  }, [roomId, callsign, clientId, connected, sendRaw]);

  return {
    clientId,
    connected,
    messages,
    unreadCount,
    members,
    inCall,
    muted,
    micLevel,
    callError,
    incomingCall,
    setCommsOpenFlag,
    sendSms,
    joinCall,
    leaveCall,
    toggleMute,
    declineIncomingCall,
    emitPlayerState,
    emitPing,
  };
}
