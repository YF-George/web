import type { RequestHandler } from './$types';
import { Liveblocks } from '@liveblocks/node';

// This endpoint is a development/admin-only helper that returns admin auth
// tokens for each configured Liveblocks secret (shard). It does NOT perform
// the actual write; the client or an admin process can use the returned
// auth tokens to connect to each shard and apply a snapshot.

function readKeys(): string[] {
	const rawKeys = (process.env.LIVEBLOCKS_SECRET_KEYS ?? '')
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
	const fallback = process.env.LIVEBLOCKS_SECRET_KEY || process.env.LIVEBLOCKS_SECRET;
	return rawKeys.length > 0 ? rawKeys : fallback ? [fallback] : [];
}

const isDev = process.env.NODE_ENV === 'development';

export const POST: RequestHandler = async ({ request }) => {
	// Authorization: allow in dev mode or require REPLICATE_ADMIN_TOKEN header
	const adminToken = process.env.REPLICATE_ADMIN_TOKEN;
	const headers = request.headers;
	if (!isDev) {
		if (!adminToken) {
			return new Response('Replication disabled (no admin token configured)', { status: 403 });
		}
		const provided = headers.get('x-admin-token') || headers.get('authorization') || '';
		if (!provided || provided !== adminToken) {
			return new Response('Unauthorized', { status: 401 });
		}
	}

	const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
	const room = typeof body.room === 'string' && body.room.trim() ? body.room.trim() : '';
	const snapshot = body.snapshot;

	if (!room) return new Response('Missing room', { status: 400 });
	if (!snapshot) return new Response('Missing snapshot payload', { status: 400 });

	const keys = readKeys();
	if (keys.length === 0) {
		return new Response('No Liveblocks secret keys configured', { status: 503 });
	}

	try {
		const results: Array<{ shardIndex: number; authBody: string }> = [];

		// For each configured secret, prepare an admin session token and return it
		for (let i = 0; i < keys.length; i++) {
			const secret = keys[i];
			if (!secret || typeof secret !== 'string' || !secret.startsWith('sk_')) continue;

			const inst = new Liveblocks({ secret });
			const session = inst.prepareSession('replicator-' + Date.now());
			// allow full access to the room
			session.allow(room, session.FULL_ACCESS);
			const auth = await session.authorize();
			results.push({ shardIndex: i, authBody: auth.body });
		}

		return new Response(
			JSON.stringify({
				room,
				snapshotMeta: { length: JSON.stringify(snapshot).length },
				tokens: results
			}),
			{
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			}
		);
	} catch (err) {
		console.error('[replicate] error', err);
		return new Response('Internal Server Error', { status: 500 });
	}
};
