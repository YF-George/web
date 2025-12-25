import type { RequestHandler } from '@sveltejs/kit';
import { kv } from '@vercel/kv';

const MAX_EDITORS = 10;
const IDLE_MS = 3 * 60 * 1000; // 3 minutes

function safeString(v: unknown) {
	return typeof v === 'string' ? v : '';
}

type EditorEntry = { sessionId: string; gameId?: string; isAdmin?: boolean; lastActivity?: string };
type QueueEntry = { sessionId: string; gameId?: string; ts: string };

async function getEditors(room: string): Promise<EditorEntry[]> {
	const key = `room:${room}:editors`;
	const v = (await kv.get<EditorEntry[]>(key)) || [];
	return v;
}

async function setEditors(room: string, editors: EditorEntry[]) {
	const key = `room:${room}:editors`;
	await kv.set(key, editors);
}

async function getQueue(room: string): Promise<QueueEntry[]> {
	const key = `room:${room}:queue`;
	const v = (await kv.get<QueueEntry[]>(key)) || [];
	return v;
}

async function setQueue(room: string, q: QueueEntry[]) {
	const key = `room:${room}:queue`;
	await kv.set(key, q);
}

// Promote queued observers until editors length == MAX_EDITORS
async function tryPromote(room: string) {
	const editors = await getEditors(room);
	const queue = await getQueue(room);

	// only promote non-admins up to limit
	while (editors.filter((e) => !e.isAdmin).length < MAX_EDITORS && queue.length > 0) {
		const next = queue.shift()!;
		editors.push({
			sessionId: next.sessionId,
			gameId: next.gameId,
			isAdmin: false,
			lastActivity: new Date().toISOString()
		});
	}

	await setEditors(room, editors);
	await setQueue(room, queue);
}

export const POST: RequestHandler = async ({ request }) => {
	// dispatch by action
	const body = await request.json().catch(() => ({}));
	const action = safeString(body.action || '');
	const room = safeString(body.room || 'my-room');
	const sessionId = safeString(body.sessionId || '');
	const gameId = safeString(body.gameId || '');
	const isAdmin = Boolean(body.isAdmin);
	const roleRequest = safeString(body.roleRequest || '');

	if (!sessionId) {
		return new Response(JSON.stringify({ error: 'missing sessionId' }), { status: 400 });
	}

	try {
		if (action === 'register') {
			// register and try to assign editor slot
			const editors = await getEditors(room);
			const queue = await getQueue(room);

			// if already editor, refresh lastActivity
			const exists = editors.find((e) => e.sessionId === sessionId);
			if (exists) {
				exists.lastActivity = new Date().toISOString();
				await setEditors(room, editors);
				return new Response(JSON.stringify({ role: 'editor', editorsCount: editors.length }), {
					status: 200
				});
			}

			// admins always allowed as editor
			if (isAdmin) {
				editors.push({ sessionId, gameId, isAdmin: true, lastActivity: new Date().toISOString() });
				// remove from queue if present
				const q2 = queue.filter((q) => q.sessionId !== sessionId);
				await setQueue(room, q2);
				await setEditors(room, editors);
				return new Response(JSON.stringify({ role: 'editor', editorsCount: editors.length }), {
					status: 200
				});
			}

			// count non-admin editors
			const nonAdminCount = editors.filter((e) => !e.isAdmin).length;
			// If client requested editor and capacity exists, grant it (same as default behaviour)
			if (roleRequest === 'editor' && nonAdminCount < MAX_EDITORS) {
				editors.push({ sessionId, gameId, isAdmin: false, lastActivity: new Date().toISOString() });
				const q2 = queue.filter((q) => q.sessionId !== sessionId);
				await setQueue(room, q2);
				await setEditors(room, editors);
				return new Response(JSON.stringify({ role: 'editor', editorsCount: editors.length }), {
					status: 200
				});
			}
			if (nonAdminCount < MAX_EDITORS) {
				editors.push({ sessionId, gameId, isAdmin: false, lastActivity: new Date().toISOString() });
				const q2 = queue.filter((q) => q.sessionId !== sessionId);
				await setQueue(room, q2);
				await setEditors(room, editors);
				return new Response(JSON.stringify({ role: 'editor', editorsCount: editors.length }), {
					status: 200
				});
			}

			// otherwise add to queue if not present
			if (!queue.find((q) => q.sessionId === sessionId)) {
				queue.push({ sessionId, gameId, ts: new Date().toISOString() });
				await setQueue(room, queue);
			}
			return new Response(
				JSON.stringify({
					role: 'observer',
					queuePos: queue.findIndex((q) => q.sessionId === sessionId)
				}),
				{ status: 200 }
			);
		}

		if (action === 'ping') {
			// update lastActivity for editors; perform idle demotion & promotions on every ping
			let editors = await getEditors(room);
			const queue = await getQueue(room);

			const now = Date.now();

			// refresh pinging session if editor
			const ed = editors.find((e) => e.sessionId === sessionId);
			if (ed) {
				ed.lastActivity = new Date().toISOString();
			}

			// demote idle non-admin editors
			const remainingEditors: EditorEntry[] = [];
			for (const e of editors) {
				const last = e.lastActivity ? Date.parse(e.lastActivity) : 0;
				if (e.isAdmin || now - last <= IDLE_MS) {
					remainingEditors.push(e);
				} else {
					// demote to queue
					queue.push({ sessionId: e.sessionId, gameId: e.gameId, ts: new Date().toISOString() });
				}
			}

			editors = remainingEditors;

			// refresh queue timestamp if present for this session
			const qidx = queue.findIndex((q) => q.sessionId === sessionId);
			if (qidx >= 0) {
				queue[qidx].ts = new Date().toISOString();
			}

			// persist changes then try promote waiting observers
			await setEditors(room, editors);
			await setQueue(room, queue);
			await tryPromote(room);

			// load updated editors and queue to determine role
			const updatedEditors = await getEditors(room);
			const updatedQueue = await getQueue(room);
			if (updatedEditors.find((e) => e.sessionId === sessionId)) {
				return new Response(JSON.stringify({ role: 'editor' }), { status: 200 });
			}
			const pos = updatedQueue.findIndex((q) => q.sessionId === sessionId);
			if (pos >= 0) {
				return new Response(JSON.stringify({ role: 'observer', queuePos: pos }), { status: 200 });
			}
			return new Response(JSON.stringify({ role: 'unknown' }), { status: 200 });
		}

		if (action === 'leave') {
			const editors = await getEditors(room);
			const queue = await getQueue(room);
			const beforeEd = editors.length;
			const newEditors = editors.filter((e) => e.sessionId !== sessionId);
			const newQueue = queue.filter((q) => q.sessionId !== sessionId);
			await setEditors(room, newEditors);
			await setQueue(room, newQueue);

			// if we removed an editor, try promote
			if (newEditors.length < beforeEd) {
				await tryPromote(room);
			}

			return new Response(JSON.stringify({ ok: true }), { status: 200 });
		}

		// periodic housekeeping endpoint (optional)
		if (action === 'housekeeping') {
			// demote idle editors (except admins)
			const editors = await getEditors(room);
			const queue = await getQueue(room);
			const now = Date.now();

			const remainingEditors: EditorEntry[] = [];
			for (const e of editors) {
				const last = e.lastActivity ? Date.parse(e.lastActivity) : 0;
				if (e.isAdmin || now - last <= IDLE_MS) {
					remainingEditors.push(e);
				} else {
					// demote to queue
					queue.push({ sessionId: e.sessionId, gameId: e.gameId, ts: new Date().toISOString() });
				}
			}
			await setEditors(room, remainingEditors);
			await setQueue(room, queue);
			// promote
			await tryPromote(room);

			return new Response(
				JSON.stringify({ ok: true, editors: remainingEditors.length, queue: queue.length }),
				{ status: 200 }
			);
		}

		return new Response(JSON.stringify({ error: 'unknown action' }), { status: 400 });
	} catch (e: unknown) {
		// Prefer unknown in catch and narrow to Error when logging
		if (e instanceof Error) {
			console.error('room api error', e);
		} else {
			console.error('room api error', String(e));
		}
		return new Response(JSON.stringify({ error: 'server error' }), { status: 500 });
	}
};
