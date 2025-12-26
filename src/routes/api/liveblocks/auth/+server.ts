import type { RequestHandler } from './$types';
import { Liveblocks } from '@liveblocks/node';

// 開發時的備援：嘗試從專案根目錄載入 .env（若 dotenv 已安裝）
// 在開發環境使用動態 import 載入 dotenv（已安裝時會讀取 .env）
// 支援多個 Liveblocks secret 的分流設計：
// - 可透過環境變數 `LIVEBLOCKS_SECRET_KEYS` 提供以逗號分隔的多個 secret
// - 或保留單一 `LIVEBLOCKS_SECRET_KEY`/`LIVEBLOCKS_SECRET` 作為向後相容
// 分流演算法：對 room 名稱做 hash，依 hash % n 選擇對應 secret
const _liveblocksInstances: Map<string, Liveblocks> = new Map();

async function getLiveblocksInstanceForRoom(roomName: string): Promise<Liveblocks | null> {
	// 在開發環境且尚未從系統 env 取得金鑰時，嘗試動態載入 dotenv（失敗則忽略）
	if (
		process.env.NODE_ENV === 'development' &&
		!process.env.LIVEBLOCKS_SECRET_KEY &&
		!process.env.LIVEBLOCKS_SECRET &&
		!process.env.LIVEBLOCKS_SECRET_KEYS
	) {
		try {
			await import('dotenv').then((mod) => mod.config()).catch(() => {});
		} catch {
			// ignore
		}
	}

	// 讀取多組金鑰（逗號分隔），若無則 fallback 到原本的單一環境變數
	const rawKeys = (process.env.LIVEBLOCKS_SECRET_KEYS ?? '')
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);

	const fallback = process.env.LIVEBLOCKS_SECRET_KEY || process.env.LIVEBLOCKS_SECRET;
	const keys = rawKeys.length > 0 ? rawKeys : fallback ? [fallback] : [];

	if (keys.length === 0) {
		console.warn('[liveblocks auth] LIVEBLOCKS secret key(s) 未設定或格式不正確（需以 sk_ 開頭）');
		return null;
	}

	// 選擇 index（簡單且可預測的分流）：hash(roomName) % keys.length
	const idx = Math.abs(hashString(roomName)) % keys.length;
	const secret = keys[idx];
	if (!secret || typeof secret !== 'string' || !secret.startsWith('sk_')) {
		console.warn('[liveblocks auth] 選中的 LIVEBLOCKS secret 格式不正確');
		return null;
	}

	// 快取相同 secret 的 Liveblocks 實例
	if (_liveblocksInstances.has(secret)) return _liveblocksInstances.get(secret)!;

	const instance = new Liveblocks({ secret });
	_liveblocksInstances.set(secret, instance);
	return instance;
}

// 字串 hash（簡單 djb2），回傳 32-bit 整數，可作為分流用）
function hashString(str: string): number {
	let h = 5381;
	for (let i = 0; i < str.length; i++) {
		h = (h * 33) ^ str.charCodeAt(i);
	}
	return h | 0;
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

		const liveblocks = await getLiveblocksInstanceForRoom(room);
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
