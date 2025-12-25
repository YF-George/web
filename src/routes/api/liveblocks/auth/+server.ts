import type { RequestHandler } from './$types';
import { Liveblocks } from '@liveblocks/node';

// 建議改為使用環境變數 LIVEBLOCKS_SECRET_KEY（Vercel/本機 .env）
const LIVEBLOCKS_SECRET =
	process.env.LIVEBLOCKS_SECRET_KEY ??
	'sk_dev_DfCw9ji7J_ERdxWcEv1cDBgVHllRKv9_G4eZw80jRdDGd9Sk5rvgzprLNQ_VRFlU';

const liveblocks = new Liveblocks({ secret: LIVEBLOCKS_SECRET });

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

		// 客戶端可能傳遞 `room` 或 `roomId`
		const room =
			typeof body.room === 'string'
				? body.room
				: typeof body.roomId === 'string'
					? (body.roomId as string)
					: 'my-room';

		// 使用 `gameId` 或 `userId` 作為用戶識別
		const gameId = typeof body.gameId === 'string' ? (body.gameId as string).trim() : '';
		const userId =
			gameId || (typeof body.userId === 'string' ? (body.userId as string) : 'anonymous');

		const session = liveblocks.prepareSession(userId, {
			userInfo: { name: userId }
		});

		// 允許用戶存取該房間；可依需求改為細粒度權限
		session.allow(room, session.FULL_ACCESS);

		const auth = await session.authorize();
		return new Response(auth.body, { status: auth.status });
	} catch (err) {
		console.error('[liveblocks auth] error', err);
		return new Response('Internal Server Error', { status: 500 });
	}
};
