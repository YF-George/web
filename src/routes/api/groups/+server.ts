import { kv } from '@vercel/kv';
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

	return new Response(JSON.stringify({ ok: true }), {
		status: 200,
		headers: { 'content-type': 'application/json' }
	});
};
