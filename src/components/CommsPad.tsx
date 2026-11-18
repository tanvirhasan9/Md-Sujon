import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  MessageSquare,
  Mic,
  MicOff,
  Phone,
  PhoneCall,
  PhoneOff,
  Radio,
  Send,
  Users,
} from 'lucide-react';
import type { IncomingCallOffer, SmsMessage, SquadMemberState } from '../game/types';

interface CommsPadProps {
  open: boolean;
  onToggleOpen: () => void;
  roomId: string;
  clientId: string;
  connected: boolean;
  messages: SmsMessage[];
  unreadCount: number;
  members: SquadMemberState[];
  inCall: boolean;
  muted: boolean;
  micLevel: number;
  callError: string | null;
  incomingCall: IncomingCallOffer | null;
  onSendSms: (text: string, tag?: SmsMessage['tag']) => void;
  onJoinCall: () => void;
  onLeaveCall: () => void;
  onToggleMute: () => void;
  onDeclineCall: () => void;
  compactTopDock?: boolean;
}

const QUICK_SMS: { label: string; text: string; tag: SmsMessage['tag'] }[] = [
  { label: 'ENEMY', text: 'Enemy spotted near my position!', tag: 'ALERT' },
  { label: 'ZONE', text: 'Rotating into safe zone now.', tag: 'ZONE' },
  { label: 'MEDS', text: 'Need armor cells / medkit!', tag: 'MEDIC' },
  { label: 'LOOT', text: 'Weapon crate marked here.', tag: 'LOOT' },
];

export const CommsPad: React.FC<CommsPadProps> = ({
  open,
  onToggleOpen,
  roomId,
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
  onSendSms,
  onJoinCall,
  onLeaveCall,
  onToggleMute,
  onDeclineCall,
  compactTopDock = false,
}) => {
  const [tab, setTab] = useState<'sms' | 'call'>('sms');
  const [draft, setDraft] = useState('');
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open, tab]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    onSendSms(draft, 'CHAT');
    setDraft('');
  };

  const copyRoomLink = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('room', roomId);
    navigator.clipboard?.writeText(url.toString()).catch(() => {});
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const activeCallPeers = members.filter((m) => m.inCall);

  return (
    <div
      className={`fixed z-30 pointer-events-auto select-none flex flex-col gap-2 ${
        compactTopDock
          ? open
            ? 'top-3 left-1/2 -translate-x-1/2 w-[320px] max-w-[calc(100vw-1.5rem)]'
            : 'top-3 left-1/2 -translate-x-1/2 w-auto max-w-[calc(100vw-1.5rem)]'
          : 'bottom-4 right-4 w-[336px] max-w-[92vw]'
      }`}
    >
      {/* Incoming Live Voice Call Banner */}
      {incomingCall && !inCall && (
        <div className="rounded-md bg-[#0f1f2e] border border-emerald-400 p-3 shadow-xl flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded bg-emerald-500/20 text-emerald-300">
              <PhoneCall className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-mono uppercase tracking-wider text-emerald-300">
                INCOMING SQUAD CALL
              </div>
              <div className="text-xs font-bold text-slate-100 truncate">
                {incomingCall.fromName} · {incomingCall.roomId}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setTab('call');
                onJoinCall();
              }}
              className="px-2.5 py-1.5 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-[11px] font-mono cursor-pointer"
            >
              ANSWER
            </button>
            <button
              type="button"
              onClick={onDeclineCall}
              className="px-2 py-1.5 rounded bg-rose-600/80 hover:bg-rose-500 text-white font-bold text-[11px] font-mono cursor-pointer"
            >
              DECLINE
            </button>
          </div>
        </div>
      )}

      {/* Main Collapsible Radio Handset */}
      <div className="rounded-lg bg-[#0d1520]/95 border border-slate-700/90 shadow-2xl overflow-hidden">
        {/* Header Bar */}
        <button
          type="button"
          onClick={onToggleOpen}
          className="w-full px-3.5 py-2.5 bg-[#121d2c] hover:bg-[#162436] flex items-center justify-between border-b border-slate-800 cursor-pointer transition-colors"
        >
          <div className="flex items-center gap-2 text-xs font-mono">
            <Radio className={`w-3.5 h-3.5 ${connected ? 'text-emerald-400' : 'text-rose-400'}`} />
            <span className="font-bold text-slate-100 tracking-wider">LIVE COMMS</span>
            <span className="px-1.5 py-0.5 rounded bg-[#1b293d] text-sky-300 text-[10px]">
              {roomId}
            </span>
          </div>

          <div className="flex items-center gap-2 text-[11px] font-mono">
            {inCall && (
              <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 text-[10px]">
                VOICE LIVE
              </span>
            )}
            {unreadCount > 0 && !open && (
              <span className="px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 font-bold text-[10px] tabular-nums">
                {unreadCount} SMS
              </span>
            )}
            <span className="text-slate-400 text-[10px]">[C]</span>
            {open ? (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronUp className="w-4 h-4 text-slate-400" />
            )}
          </div>
        </button>

        {open && (
          <div className="flex flex-col">
            {/* Tabs + Invite Link */}
            <div className="flex items-center justify-between px-2.5 pt-2 pb-1.5 bg-[#0f1825] border-b border-slate-800/80 gap-2">
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setTab('sms')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono font-bold cursor-pointer ${
                    tab === 'sms'
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-[#172334] text-slate-300 hover:text-white'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  LIVE SMS
                </button>
                <button
                  type="button"
                  onClick={() => setTab('call')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono font-bold cursor-pointer ${
                    tab === 'call'
                      ? 'bg-emerald-500 text-slate-950'
                      : 'bg-[#172334] text-slate-300 hover:text-white'
                  }`}
                >
                  <Phone className="w-3.5 h-3.5" />
                  LIVE CALL {activeCallPeers.length > 0 ? `(${activeCallPeers.length})` : ''}
                </button>
              </div>

              <button
                type="button"
                onClick={copyRoomLink}
                title="Copy Squad Room Link for Second Player / Tab"
                className="flex items-center gap-1 px-2 py-1 rounded bg-[#172334] hover:bg-[#1f2f46] text-slate-300 text-[10px] font-mono cursor-pointer"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                {copied ? 'COPIED' : 'INVITE'}
              </button>
            </div>

            {tab === 'sms' ? (
              <div className="flex flex-col">
                {/* Message Feed */}
                <div
                  ref={scrollRef}
                  className="h-48 overflow-y-auto p-2.5 space-y-2 bg-[#0a1019] text-xs"
                >
                  {messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 font-mono text-[11px] px-4">
                      <span>Channel {roomId} ready.</span>
                      <span className="mt-1 text-slate-600">
                        Send live SMS or copy INVITE link to open a second squadmate tab.
                      </span>
                    </div>
                  ) : (
                    messages.map((msg) => {
                      const isSelf = msg.senderId === clientId;
                      const timeStr = new Date(msg.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      });
                      return (
                        <div
                          key={msg.id}
                          className={`rounded px-2.5 py-1.5 border ${
                            isSelf
                              ? 'bg-[#162638] border-sky-500/40 ml-5'
                              : 'bg-[#121a26] border-slate-700/70 mr-5'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 text-[10px] font-mono mb-0.5">
                            <span className={isSelf ? 'text-sky-300 font-bold' : 'text-amber-300 font-bold'}>
                              {msg.senderName}
                              {msg.tag && msg.tag !== 'CHAT' ? ` · [${msg.tag}]` : ''}
                            </span>
                            <span className="text-slate-500 tabular-nums">{timeStr}</span>
                          </div>
                          <div className="text-slate-100 leading-snug break-words">{msg.text}</div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Quick Tactical SMS Chips */}
                <div className="flex flex-wrap gap-1 px-2.5 py-1.5 bg-[#0f1825] border-t border-slate-800/80">
                  {QUICK_SMS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => onSendSms(preset.text, preset.tag)}
                      className="px-2 py-0.5 rounded bg-[#182536] hover:bg-[#22344d] border border-slate-700 text-[10px] font-mono text-slate-200 cursor-pointer"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                {/* SMS Compose Input */}
                <form
                  onSubmit={handleSubmit}
                  className="flex items-center gap-1.5 p-2 bg-[#101926] border-t border-slate-800"
                >
                  <input
                    type="text"
                    value={draft}
                    maxLength={240}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Type live SMS to squad..."
                    className="flex-1 px-2.5 py-1.5 rounded bg-[#0a1019] border border-slate-700 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
                  />
                  <button
                    type="submit"
                    className="p-2 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 cursor-pointer"
                    aria-label="Send SMS"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </form>
              </div>
            ) : (
              /* LIVE VOICE CALL PANEL */
              <div className="p-3 bg-[#0a1019] space-y-3">
                <div className="flex items-center justify-between text-xs font-mono text-slate-300">
                  <span className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-sky-400" />
                    SQUAD ONLINE ({members.length})
                  </span>
                  <span className="text-[10px] text-slate-400">WEBRTC P2P AUDIO</span>
                </div>

                {/* Participants List */}
                <div className="max-h-28 overflow-y-auto space-y-1.5">
                  {members.map((m) => (
                    <div
                      key={m.clientId}
                      className="flex items-center justify-between px-2.5 py-1.5 rounded bg-[#121c2a] border border-slate-800 text-xs font-mono"
                    >
                      <span className="text-slate-100 truncate">
                        {m.callsign} {m.clientId === clientId ? '(YOU)' : ''}
                      </span>
                      <span
                        className={`text-[10px] ${
                          m.inCall
                            ? m.muted
                              ? 'text-amber-400'
                              : 'text-emerald-400'
                            : 'text-slate-500'
                        }`}
                      >
                        {m.inCall ? (m.muted ? 'MUTED' : 'IN CALL') : 'STANDBY'}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Live Mic Input Meter */}
                {inCall && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] font-mono text-slate-400">
                      <span>MICROPHONE SIGNAL</span>
                      <span>{muted ? 'MUTED' : `${Math.round(micLevel * 100)}%`}</span>
                    </div>
                    <div className="h-2 rounded bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-emerald-400 transition-all duration-75"
                        style={{ width: `${Math.round(micLevel * 100)}%` }}
                      />
                    </div>
                  </div>
                )}

                {callError && (
                  <div className="text-[11px] font-mono text-amber-300 bg-amber-950/50 border border-amber-700/60 rounded px-2.5 py-1.5">
                    {callError}
                  </div>
                )}

                {/* Call Action Controls */}
                <div className="flex gap-2">
                  {!inCall ? (
                    <button
                      type="button"
                      onClick={onJoinCall}
                      className="flex-1 py-2.5 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black font-mono text-xs tracking-wider uppercase flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Phone className="w-4 h-4" />
                      START / JOIN VOICE CALL
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={onToggleMute}
                        className={`flex-1 py-2 rounded font-mono font-bold text-xs flex items-center justify-center gap-1.5 border cursor-pointer ${
                          muted
                            ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                            : 'bg-[#172334] border-slate-600 text-slate-100'
                        }`}
                      >
                        {muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                        {muted ? 'UNMUTE' : 'MUTE'}
                      </button>
                      <button
                        type="button"
                        onClick={onLeaveCall}
                        className="flex-1 py-2 rounded bg-rose-600 hover:bg-rose-500 text-white font-mono font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <PhoneOff className="w-4 h-4" />
                        END CALL
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
