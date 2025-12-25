import { createClient } from '@liveblocks/client';

// ---- Room helper (簡潔封裝) ----
// 說明：
// - 建立 Liveblocks client 時使用後端驗證端點，避免在前端暴露 Secret。
// - `enterRoom` 提供簡單的輸入驗證與預設值，避免傳入空字串或 undefined。

// 可由環境覆寫（Vite）：`VITE_LIVEBLOCKS_AUTH_ENDPOINT`，否則使用內建路由。
// 避免使用 `any`，以符合 lint 規範：先將 import.meta.env 當作 unknown，並逐步檢查型別。
const _metaEnv =
	typeof import.meta !== 'undefined'
		? (import.meta as { env?: Record<string, unknown> }).env
		: undefined;
let AUTH_ENDPOINT = '/api/liveblocks/auth';
if (_metaEnv) {
	const raw = _metaEnv.VITE_LIVEBLOCKS_AUTH_ENDPOINT;
	if (typeof raw === 'string' && raw.trim() !== '') {
		AUTH_ENDPOINT = raw.trim();
	}
}

// 建立 client（僅執行於匯入時，createClient 自身不會建立網路連線）
export const client = createClient({ authEndpoint: AUTH_ENDPOINT });

// 將傳入房名淨化，若為空字串或非字串則回退到 'my-room'
function normalizeRoomName(name?: unknown): string {
	if (typeof name !== 'string') return 'my-room';
	const trimmed = name.trim();
	return trimmed === '' ? 'my-room' : trimmed;
}

// 入口：動態進入房間。避免在 SSR 階段直接呼叫進房（請在 onMount 或 client-side handler 使用）。
export const enterRoom = (name = 'my-room') => {
	const roomName = normalizeRoomName(name);
	return client.enterRoom(roomName);
};

// 進房但檢查人數上限：
// - 如果當前房內其他人數 >= maxClients，會自動 leave 並回傳 { ok: false, reason: 'full' }
// - 否則回傳原本的 connection 物件並標記 ok: true
export const enterRoomWithCapacity = async (
	name = 'my-room',
	maxClients = 100,
	allowObserver = true
) => {
	const roomName = normalizeRoomName(name);
	const connection = client.enterRoom(roomName);
	const room = connection.room;

	return new Promise((resolve) => {
		let resolved = false;

		// 訂閱一次 others 並立即檢查人數
		const unsub = room.subscribe('others', (others) => {
			if (resolved) return;
			resolved = true;
			try {
				const count = Array.isArray(others) ? others.length : 0;
				if (count >= maxClients) {
					// 房間已滿：若允許觀察者則回傳 observer 標記，否則離開並回報
					if (allowObserver) {
						resolve({ ok: true, connection, observer: true });
					} else {
						try {
							connection.leave();
						} catch {
							// 忽略離開錯誤
						}
						resolve({ ok: false, reason: 'full' });
					}
				} else {
					resolve({ ok: true, connection, observer: false });
				}
			} finally {
				try {
					unsub();
				} catch {
					// 忽略 unsubscribe 錯誤
				}
			}
		});

		// 若在短時間內沒有觸發訂閱（極端情況），以保守策略允許進入
		setTimeout(() => {
			if (resolved) return;
			resolved = true;
			try {
				resolve({ ok: true, connection });
			} finally {
				try {
					unsub();
				} catch {
					// 忽略 unsubscribe 錯誤
				}
			}
		}, 600);
	});
};
