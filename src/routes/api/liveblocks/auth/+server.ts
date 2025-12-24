import type { RequestHandler } from './$types';
import { createClient } from '@liveblocks/node';

const secret = process.env.LIVEBLOCKS_SECRET_KEY;
const liveblocks = secret ? createClient({ secret }) : null;

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

	// 建立 Session 並授權進入房間（預設 writer 權限）
	const session = await liveblocks.createSession({
		userId: userId || 'anonymous',
		userInfo: userInfo || {}
	});
	const authResponse = await session.authorize([{ roomId, role: 'writer' }]);

	return new Response(JSON.stringify(authResponse), {
		status: 200,
		headers: { 'content-type': 'application/json' }
	});
};
