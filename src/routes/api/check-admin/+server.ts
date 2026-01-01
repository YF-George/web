import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const adminWhitelistEnv = process.env.ADMIN_WHITELIST;
const ADMIN_WHITELIST: Record<string, string> = adminWhitelistEnv
	? (() => {
			try {
				return JSON.parse(adminWhitelistEnv) as Record<string, string>;
			} catch {
				console.warn('[check-admin] ADMIN_WHITELIST JSON 解析失敗，改用預設');
				return {};
			}
		})()
	: {
			千羽夜: 'a22756403',
			花豆豆: 'jerry1012',
			樂奈: '3034520835',
			花瑚離: '3033069718'
		};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const parsed = (await request.json().catch(() => ({}))) as {
			gameId?: unknown;
		};

		const gameId = typeof parsed.gameId === 'string' ? parsed.gameId.trim() : '';

		if (!gameId) {
			return json({ isAdmin: false });
		}

		// Check if gameId exists in whitelist
		const isAdmin = gameId in ADMIN_WHITELIST;
		return json({ isAdmin });
	} catch (error) {
		console.error('[check-admin] error', error);
		return json({ isAdmin: false });
	}
};
