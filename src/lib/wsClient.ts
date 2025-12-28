// Minimal WebSocket client wrapper for MVP
export type WSHandler = (msg: unknown) => void;

export function connectWS(options: { url?: string; room?: string; userId?: string }) {
	const url = options.url || import.meta.env?.VITE_WS_ENDPOINT || 'ws://localhost:6789';
	const room = options.room || 'my-room';
	const userId = options.userId || `u-${Math.random().toString(36).slice(2, 9)}`;
	// build ws url with query
	const wsUrl = `${url.replace(/\/$/, '')}/?room=${encodeURIComponent(room)}&userId=${encodeURIComponent(userId)}`;

	const ws = new WebSocket(wsUrl);
	const handlers: WSHandler[] = [];
	let state: unknown = null;

	ws.addEventListener('message', (ev: MessageEvent) => {
		try {
			const raw = ev.data as string;
			const data = JSON.parse(raw);
			if (data.type === 'init') {
				state = data.state;
				handlers.forEach((h) => h({ type: 'init', state: data.state, presence: data.presence }));
			} else if (data.type === 'update') {
				state = data.state;
				handlers.forEach((h) => h({ type: 'update', state: data.state }));
			} else if (data.type === 'presence') {
				handlers.forEach((h) => h({ type: 'presence', presence: data.presence }));
			} else {
				handlers.forEach((h) => h(data));
			}
		} catch (err) {
			console.error('ws client parse', err);
		}
	});

	ws.addEventListener('close', () => {
		handlers.forEach((h) => h({ type: 'close' }));
	});

	return {
		sendUpdate: (payload: unknown) => {
			if (ws.readyState === WebSocket.OPEN) {
				ws.send(JSON.stringify({ type: 'update', payload }));
			}
		},
		on: (h: WSHandler) => {
			handlers.push(h);
			return () => {
				const i = handlers.indexOf(h);
				if (i >= 0) handlers.splice(i, 1);
			};
		},
		getState: () => state,
		close: () => ws.close()
	};
}

export type WSClient = ReturnType<typeof connectWS>;
