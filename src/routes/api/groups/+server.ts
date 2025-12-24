import { kv } from '@vercel/kv';
import Ably from 'ably';
import { Liveblocks } from '@liveblocks/node';
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

export const GET: RequestHandler = async ({ url }) => {
	const formId = url.searchParams.get('formId');
	if (!formId) {
		return new Response(JSON.stringify({ error: 'missing formId' }), { status: 400 });
	}

	const groups = (await kv.get<LocalGroup[]>(keyFor(formId))) || [];
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

	await kv.set(keyFor(formId), groups);

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

	// 發布即時更新到 Liveblocks（若已設定 LIVEBLOCKS_SECRET_KEY）
	const lbKey = process.env.LIVEBLOCKS_SECRET_KEY;
	if (lbKey) {
		try {
			const liveblocks = new Liveblocks({ secret: lbKey });
			const room = liveblocks.getRoom(keyFor(formId));
			await room.broadcastEvent({ type: 'groups', data: groups });
		} catch (err) {
			console.warn('Liveblocks 發佈失敗:', err);
		}
	}

	return new Response(JSON.stringify({ ok: true }), {
		status: 200,
		headers: { 'content-type': 'application/json' }
	});
};
