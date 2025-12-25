import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// ---- 設定與工具 ----
// 可改用環境變數序列化 JSON：ADMIN_WHITELIST='{"user":"pwd"}'
const adminWhitelistEnv = process.env.ADMIN_WHITELIST;
const ADMIN_WHITELIST: Record<string, string> = adminWhitelistEnv
	? (() => {
			try {
				return JSON.parse(adminWhitelistEnv) as Record<string, string>;
			} catch {
				console.warn('[auth] ADMIN_WHITELIST JSON 解析失敗，改用預設');
				return {};
			}
		})()
	: {
			千羽夜: '3025782247',
			花豆豆: 'jerry1012',
			樂奈: '3034520835',
			花瑚離: '3033069718'
		};

const safeString = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const errorResponse = (message: string, status = 400) =>
	json({ success: false, error: message }, { status });

export const POST: RequestHandler = async ({ request }) => {
	try {
		const parsed = (await request.json().catch(() => ({}))) as {
			gameId?: unknown;
			uid?: unknown;
		};

		const gameId = safeString(parsed.gameId);
		const uid = safeString(parsed.uid);

		if (!gameId) {
			return errorResponse('請輸入遊戲暱稱', 400);
		}

		if (uid) {
			const isValidAdmin = ADMIN_WHITELIST[gameId] === uid;
			if (!isValidAdmin) {
				return errorResponse('管理員驗證失敗：帳號或密碼錯誤', 401);
			}
			return json({ success: true, isAdmin: true, gameId });
		}

		return json({ success: true, isAdmin: false, gameId });
	} catch (error) {
		console.error('[auth] error', error);
		return errorResponse('登入失敗，請稍後再試', 500);
	}
};
