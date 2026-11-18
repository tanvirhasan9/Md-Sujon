import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface SmsRecord {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  text: string;
  tag: string;
  timestamp: number;
}

interface ClientSession {
  ws: WebSocket;
  clientId: string;
  callsign: string;
  roomId: string;
  inCall: boolean;
  muted: boolean;
  x: number;
  y: number;
  z: number;
  yaw: number;
  hp: number;
}

interface RoomState {
  id: string;
  clients: Map<string, ClientSession>;
  smsHistory: SmsRecord[];
}

const rooms = new Map<string, RoomState>();

function getOrCreateRoom(rawRoomId: string): RoomState {
  const roomId = rawRoomId.trim().toUpperCase().slice(0, 24) || 'ALPHA-1';
  let room = rooms.get(roomId);
  if (!room) {
    room = {
      id: roomId,
      clients: new Map(),
      smsHistory: [],
    };
    rooms.set(roomId, room);
  }
  return room;
}

function sendJson(ws: WebSocket, payload: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcastRoom(room: RoomState, payload: unknown, excludeClientId?: string): void {
  const serialized = JSON.stringify(payload);
  for (const [id, client] of room.clients) {
    if (excludeClientId && id === excludeClientId) continue;
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(serialized);
    }
  }
}

function serializePresence(room: RoomState) {
  return Array.from(room.clients.values()).map((c) => ({
    clientId: c.clientId,
    callsign: c.callsign,
    inCall: c.inCall,
    muted: c.muted,
    x: c.x,
    y: c.y,
    z: c.z,
    yaw: c.yaw,
    hp: c.hp,
  }));
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const port = Number(process.env.PORT) || 3000;

  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, rooms: rooms.size });
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    let pathname = '/';
    try {
      pathname = new URL(
        request.url || '/',
        `http://${request.headers.host || 'localhost'}`,
      ).pathname;
    } catch {
      socket.destroy();
      return;
    }
    if (pathname === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  wss.on('connection', (ws: WebSocket) => {
    let session: ClientSession | null = null;

    ws.on('message', (raw: Buffer) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(raw.toString('utf8')) as Record<string, unknown>;
      } catch {
        return;
      }

      const type = String(msg.type || '');

      if (type === 'room:join') {
        const prevRoomId = session?.roomId;
        if (session && prevRoomId) {
          const prevRoom = rooms.get(prevRoomId);
          if (prevRoom) {
            prevRoom.clients.delete(session.clientId);
            broadcastRoom(prevRoom, {
              type: 'room:presence',
              members: serializePresence(prevRoom),
            });
            if (prevRoom.clients.size === 0 && prevRoom.smsHistory.length === 0) {
              rooms.delete(prevRoomId);
            }
          }
        }

        const clientId = String(msg.clientId || '').slice(0, 48) || `op-${Math.random().toString(36).slice(2, 10)}`;
        const callsign = String(msg.callsign || 'GHOST-01').trim().slice(0, 18) || 'GHOST-01';
        const room = getOrCreateRoom(String(msg.roomId || 'ALPHA-1'));

        session = {
          ws,
          clientId,
          callsign,
          roomId: room.id,
          inCall: false,
          muted: false,
          x: 0,
          y: 0,
          z: 0,
          yaw: 0,
          hp: 100,
        };
        room.clients.set(clientId, session);

        sendJson(ws, {
          type: 'room:init',
          roomId: room.id,
          clientId,
          smsHistory: room.smsHistory.slice(-60),
          members: serializePresence(room),
        });

        broadcastRoom(
          room,
          {
            type: 'room:presence',
            members: serializePresence(room),
          },
          clientId,
        );
        return;
      }

      if (!session) return;
      const room = rooms.get(session.roomId);
      if (!room) return;

      if (type === 'sms:send') {
        const text = String(msg.text || '').trim().slice(0, 280);
        if (!text) return;
        const id = String(msg.id || '').slice(0, 64) || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        // Idempotency check
        if (room.smsHistory.some((m) => m.id === id)) {
          return;
        }
        const tag = String(msg.tag || 'CHAT').slice(0, 12);
        const record: SmsRecord = {
          id,
          roomId: room.id,
          senderId: session.clientId,
          senderName: session.callsign,
          text,
          tag,
          timestamp: Date.now(),
        };
        room.smsHistory.push(record);
        if (room.smsHistory.length > 100) {
          room.smsHistory.shift();
        }
        broadcastRoom(room, { type: 'sms:receive', message: record });
        return;
      }

      if (type === 'player:state') {
        session.x = Number(msg.x) || 0;
        session.y = Number(msg.y) || 0;
        session.z = Number(msg.z) || 0;
        session.yaw = Number(msg.yaw) || 0;
        session.hp = Number(msg.hp) ?? 100;
        broadcastRoom(
          room,
          {
            type: 'player:state',
            clientId: session.clientId,
            callsign: session.callsign,
            x: session.x,
            y: session.y,
            z: session.z,
            yaw: session.yaw,
            hp: session.hp,
          },
          session.clientId,
        );
        return;
      }

      if (type === 'ping:drop') {
        const ping = {
          id: String(msg.id || `${Date.now()}`),
          senderId: session.clientId,
          senderName: session.callsign,
          x: Number(msg.x) || 0,
          y: Number(msg.y) || 0,
          z: Number(msg.z) || 0,
          label: String(msg.label || 'CONTACT').slice(0, 24),
          createdAt: Date.now(),
        };
        broadcastRoom(room, { type: 'ping:drop', ping });
        return;
      }

      if (type === 'call:join') {
        session.inCall = true;
        session.muted = Boolean(msg.muted);
        broadcastRoom(room, {
          type: 'room:presence',
          members: serializePresence(room),
        });
        broadcastRoom(
          room,
          {
            type: 'call:ring',
            fromId: session.clientId,
            fromName: session.callsign,
            roomId: room.id,
            timestamp: Date.now(),
          },
          session.clientId,
        );
        return;
      }

      if (type === 'call:leave') {
        session.inCall = false;
        session.muted = false;
        broadcastRoom(room, {
          type: 'call:peer_left',
          clientId: session.clientId,
        });
        broadcastRoom(room, {
          type: 'room:presence',
          members: serializePresence(room),
        });
        return;
      }

      if (type === 'call:mute') {
        session.muted = Boolean(msg.muted);
        broadcastRoom(room, {
          type: 'room:presence',
          members: serializePresence(room),
        });
        return;
      }

      if (type === 'call:decline') {
        const targetId = String(msg.targetId || '');
        const target = room.clients.get(targetId);
        if (target) {
          sendJson(target.ws, {
            type: 'call:declined',
            fromId: session.clientId,
            fromName: session.callsign,
          });
        }
        return;
      }

      if (type === 'rtc:offer' || type === 'rtc:answer' || type === 'rtc:ice') {
        const targetId = String(msg.targetId || '');
        const target = room.clients.get(targetId);
        if (target) {
          sendJson(target.ws, {
            type,
            fromId: session.clientId,
            fromName: session.callsign,
            sdp: msg.sdp,
            candidate: msg.candidate,
          });
        }
        return;
      }
    });

    ws.on('close', () => {
      if (!session) return;
      const room = rooms.get(session.roomId);
      if (!room) return;
      const wasInCall = session.inCall;
      room.clients.delete(session.clientId);
      if (wasInCall) {
        broadcastRoom(room, {
          type: 'call:peer_left',
          clientId: session.clientId,
        });
      }
      broadcastRoom(room, {
        type: 'room:presence',
        members: serializePresence(room),
      });
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: { server },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(port, '0.0.0.0', () => {
    console.log(`APEX DROP server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
