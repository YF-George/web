import type { RequestHandler } from './$types';
import { Liveblocks } from '@liveblocks/node';

// ---- 環境設定 ----
const LIVEBLOCKS_SECRET = process.env.LIVEBLOCKS_SECRET_KEY;

if (!LIVEBLOCKS_SECRET) {
	console.warn('[liveblocks auth] LIVEBLOCKS_SECRET_KEY 未設定，請在環境變數或 .env 中提供');
}

// 避免在模組匯入階段建立 Liveblocks 實例（會在 SSR 時評估並拋錯）
let _liveblocksInstance: Liveblocks | null = null;
function getLiveblocksInstance(): Liveblocks {
	if (_liveblocksInstance) return _liveblocksInstance;
	if (
		!LIVEBLOCKS_SECRET ||
		typeof LIVEBLOCKS_SECRET !== 'string' ||
		!LIVEBLOCKS_SECRET.startsWith('sk_')
	) {
		throw new Error('LIVEBLOCKS_SECRET_KEY 未設定或格式不正確（需以 sk_ 開頭）');
	}
	_liveblocksInstance = new Liveblocks({ secret: LIVEBLOCKS_SECRET });
	return _liveblocksInstance;
}

// 將未知值安全轉成字串
const asString = (value: unknown) => (typeof value === 'string' ? value : '');

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

		// 客戶端可能傳遞 `room` 或 `roomId`
		const roomInput = asString(body.room) || asString(body.roomId);
		const room = roomInput.trim() || 'my-room';

		// 使用 `gameId` 或 `userId` 作為用戶識別
		const gameId = asString(body.gameId).trim();
		const userId = gameId || asString(body.userId).trim() || 'anonymous';

		try {
			const liveblocks = getLiveblocksInstance();
			const session = liveblocks.prepareSession(userId, {
				userInfo: { name: userId || 'anonymous' }
			});

			// 允許用戶存取該房間；可依需求改為細粒度權限
			session.allow(room, session.FULL_ACCESS);

			const auth = await session.authorize();
			return new Response(auth.body, { status: auth.status });
		} catch (e) {
			console.error('[liveblocks auth] initialization error', e);
			return new Response('Liveblocks secret 未設定或不正確', { status: 500 });
		}
	} catch (err) {
		console.error('[liveblocks auth] error', err);
		return new Response('Internal Server Error', { status: 500 });
	}
};
