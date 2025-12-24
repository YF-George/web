import type { RequestHandler } from './$types';
import { Liveblocks } from '@liveblocks/node';

const secret = process.env.LIVEBLOCKS_SECRET_KEY;
const liveblocks = secret ? new Liveblocks({ secret }) : null;

export const POST: RequestHandler = async ({ request }) => {
	if (!liveblocks) {
		return new Response(JSON.stringify({ error: 'LIVEBLOCKS_SECRET_KEY not set' }), {
			status: 500,
			headers: { 'content-type': 'application/json' }
		});
	}

	const body = await request.json().catch(() => ({}));
	const { roomId, userId, userInfo } = (body || {}) as {
		roomId?: string;
		userId?: string;
		userInfo?: Record<string, unknown>;
	};

	if (!roomId) {
		return new Response(JSON.stringify({ error: 'missing roomId' }), {
			status: 400,
			headers: { 'content-type': 'application/json' }
		});
	}

	// 準備 Session 並授權進入房間
	const session = liveblocks.prepareSession(userId || 'anonymous', {
		userInfo: (userInfo || {}) as Record<string, string | number | boolean>
	});
	session.allow(roomId, session.FULL_ACCESS);

	return new Response(JSON.stringify(await session.authorize()), {
		status: 200,
		headers: { 'content-type': 'application/json' }
	});
};
