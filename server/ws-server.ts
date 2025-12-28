import WebSocket, { WebSocketServer } from 'ws';
import http from 'http';

// Simple in-memory room store
type Client = {
	id: string;
	ws: WebSocket;
	userId: string;
};

type Room = {
	name: string;
	clients: Map<string, Client>;
	// simple room state: groups (serialized) - for MVP we'll store minimal
	state: unknown;
};

const PORT = process.env.WS_PORT ? Number(process.env.WS_PORT) : 6789;

const rooms = new Map<string, Room>();

function getOrCreateRoom(name: string) {
	let r = rooms.get(name);
	if (!r) {
		r = { name, clients: new Map(), state: { groups: [] } };
		rooms.set(name, r);
	}
	return r;
}

function broadcast(room: Room, data: unknown, exceptId?: string) {
	const str = JSON.stringify(data);
	for (const [id, client] of room.clients) {
		if (id === exceptId) continue;
		try {
			client.ws.send(str);
		} catch {
			// ignore send errors
		}
	}
}

const server = http.createServer();
const wss = new WebSocketServer({ server });

wss.on('connection', (ws: WebSocket, req) => {
	// expect query ?room=ROOM&userId=USER
	const url = req.url || '';
	const params = new URLSearchParams(url.replace(/^.*\?/, ''));
	const roomName = params.get('room') || 'my-room';
	const userId = params.get('userId') || `u-${Math.random().toString(36).slice(2, 9)}`;
	const clientId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

	const room = getOrCreateRoom(roomName);
	room.clients.set(clientId, { id: clientId, ws, userId });

	// send initial state and presence
	const presence = Array.from(room.clients.values()).map((c) => ({ id: c.id, userId: c.userId }));
	ws.send(JSON.stringify({ type: 'init', state: room.state, presence }));
	broadcast(room, { type: 'presence', presence }, clientId);

	ws.on('message', (raw: WebSocket.Data) => {
		try {
			const msg = JSON.parse(typeof raw === 'string' ? raw : raw.toString());
			if (msg.type === 'update') {
				// apply update to room.state (MVP: replace or merge)
				// expect payload: { path: string[], value }
				if (msg.payload && msg.payload.path && msg.payload.value !== undefined) {
					// naive set: supports top-level keys
					const key = msg.payload.path[0];
					room.state[key] = msg.payload.value;
				} else if (msg.payload && msg.payload.state) {
					room.state = msg.payload.state;
				}
				broadcast(room, { type: 'update', state: room.state }, /*except*/ clientId);
			} else if (msg.type === 'presence') {
				// update presence info
				// no-op for now; broadcast
				broadcast(room, {
					type: 'presence',
					presence: Array.from(room.clients.values()).map((c) => ({ id: c.id, userId: c.userId }))
				});
			}
		} catch (err) {
			console.error('ws parse error', err);
		}
	});

	ws.on('close', () => {
		room.clients.delete(clientId);
		broadcast(room, {
			type: 'presence',
			presence: Array.from(room.clients.values()).map((c) => ({ id: c.id, userId: c.userId }))
		});
	});
});

server.listen(PORT, () => {
	 
	console.log(`WS server listening on ws://localhost:${PORT}`);
});
