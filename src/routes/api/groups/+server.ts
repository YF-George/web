import { kv } from '@vercel/kv';
import Ably from 'ably';
import type { RequestHandler } from './$types';

interface ChangeLog {
	id: string;
	timestamp: string;
	gameId: string;
	action: string;
	details: string;
}

interface LocalGroup {
	id: string;
	members: Array<{
		profession: string;
		isDriver: boolean;
		isHelper: boolean;
		playerId: string;
		gearScore: string | number;
	}>;
	departureTime?: string;
	departureDate?: string;
	dungeonName?: string;
	level?: string;
	gearScoreReq?: string;
	contentType?: string;
	changeLog?: ChangeLog[];
}

const keyFor = (formId: string) => `teams:${formId}`;

async function loadGroups(formId: string): Promise<LocalGroup[]> {
	const hash = await kv.hgetall<Record<string, LocalGroup | string>>(keyFor(formId));
	if (!hash) return [];
	return Object.values(hash).map((val) => {
		if (typeof val === 'string') {
			try {
				return JSON.parse(val) as LocalGroup;
			} catch (err) {
				console.warn('parse group failed', err);
			}
		}
		return val as LocalGroup;
	});
}

export const GET: RequestHandler = async ({ url }) => {
	const formId = url.searchParams.get('formId');
	if (!formId) {
		return new Response(JSON.stringify({ error: 'missing formId' }), { status: 400 });
	}

	const groups = await loadGroups(formId);
	return new Response(JSON.stringify({ groups }), {
		status: 200,
		headers: { 'content-type': 'application/json' }
	});
};

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => ({}));
	const { formId, groups } = body as { formId?: string; groups?: LocalGroup[] };

	if (!formId || !Array.isArray(groups)) {
		return new Response(JSON.stringify({ error: 'missing formId or groups' }), { status: 400 });
	}

	// 以 Hash 方式存每一團，確保各團資料獨立
	const toSave = Object.fromEntries(groups.map((g) => [g.id, g]));
	await kv.hset(keyFor(formId), toSave);

	// 移除已刪除的團隊資料
	const existing = (await kv.hkeys(keyFor(formId))) || [];
	const incomingIds = new Set(groups.map((g) => g.id));
	const toDelete = existing.filter((id) => !incomingIds.has(id));
	if (toDelete.length) {
		await kv.hdel(keyFor(formId), ...toDelete);
	}

	// 發布即時更新到 Ably（若已設定 ABLY_API_KEY）
	const ablyKey = process.env.ABLY_API_KEY;
	if (ablyKey) {
		try {
			const rest = new Ably.Rest({ key: ablyKey });
			await rest.channels.get(keyFor(formId)).publish('groups', groups);
		} catch (err) {
			console.warn('Ably 發布失敗:', err);
		}
	}

	// 注意：Liveblocks 的 broadcastEvent 由前端處理（見 publishLiveblocks 函數）
	// 後端 Liveblocks SDK 不支援直接 broadcast，需透過前端客戶端

	return new Response(JSON.stringify({ ok: true }), {
		status: 200,
		headers: { 'content-type': 'application/json' }
	});
};
