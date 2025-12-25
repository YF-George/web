import type { RequestHandler } from './$types';
import { Liveblocks } from '@liveblocks/node';

// 開發時的備援：嘗試從專案根目錄載入 .env（若 dotenv 已安裝）
// 在開發環境使用動態 import 載入 dotenv（已安裝時會讀取 .env）
import('dotenv')
	.then((mod) => mod.config())
	.catch(() => {
		/* 忽略無 dotenv 的情況，依賴系統 env */
	});

let _liveblocksInstance: Liveblocks | null = null;
function getLiveblocksInstance(): Liveblocks | null {
	if (_liveblocksInstance) return _liveblocksInstance;

	// 每次呼叫時動態讀取環境變數，避免模組載入時快照固定導致變數不同步
	const secret: string | undefined =
		process.env.LIVEBLOCKS_SECRET_KEY || process.env.LIVEBLOCKS_SECRET || undefined;

	if (!secret || typeof secret !== 'string' || !secret.startsWith('sk_')) {
		console.warn('[liveblocks auth] LIVEBLOCKS_SECRET_KEY 未設定或格式不正確（需以 sk_ 開頭）');
		return null;
	}

	_liveblocksInstance = new Liveblocks({ secret });
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

		const liveblocks = getLiveblocksInstance();
		if (!liveblocks) {
			return new Response('Liveblocks secret 未設定或格式不正確，請設定 LIVEBLOCKS_SECRET_KEY', {
				status: 503
			});
		}

		const session = liveblocks.prepareSession(userId, {
			userInfo: { name: userId || 'anonymous' }
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
