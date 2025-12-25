import type { RequestHandler } from './$types';
import crypto from 'crypto';
import { kv } from '@vercel/kv';

interface GroupMember {
	name: string;
	profession: string;
	weapon: string;
	gearScore: number;
}

interface GroupEntry {
	id: string;
	formId: string;
	displayName?: string;
	pseudonym_hash?: string;
	members: GroupMember[];
	created_at: string;
}

function sanitizeDisplayName(name: string): string {
	return name.trim().slice(0, 50);
}

function validateDisplayName(name: string): boolean {
	return name.trim().length > 0 && name.trim().length <= 50;
}

function serverPseudonymHash(pseudonym: string) {
	const salt = process.env.PSEUDONYM_SALT || 'dev-fallback-salt';
	return crypto.createHmac('sha256', salt).update(pseudonym).digest('hex');
}

function safeString(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}

async function getGroups(formId: string): Promise<GroupEntry[]> {
	const key = `form:${formId}:groups`;
	const groups = await kv.get<GroupEntry[]>(key);
	return groups || [];
}

async function addGroup(formId: string, entry: GroupEntry): Promise<void> {
	const key = `form:${formId}:groups`;
	const groups = await getGroups(formId);
	groups.push(entry);
	await kv.set(key, groups);
}

export const GET: RequestHandler = async ({ url }) => {
	const formId = safeString(url.searchParams.get('formId'));
	if (!formId) {
		return new Response(JSON.stringify({ error: 'missing formId' }), { status: 400 });
	}

	const groups = await getGroups(formId);
	return new Response(JSON.stringify({ groups }), {
		status: 200,
		headers: { 'content-type': 'application/json' }
	});
};

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => ({}));
	const { formId, displayName, pseudonym, members } = body as {
		formId?: string;
		displayName?: string;
		pseudonym?: string;
		members?: GroupMember[];
	};

	const cleanFormId = safeString(formId);
	if (!cleanFormId || !Array.isArray(members)) {
		return new Response(JSON.stringify({ error: 'missing formId or members' }), { status: 400 });
	}

	if (members.length !== 10) {
		return new Response(JSON.stringify({ error: 'members must be exactly 10 entries' }), {
			status: 400
		});
	}

	// Basic validation for each member
	for (const m of members) {
		if (!m) {
			return new Response(JSON.stringify({ error: 'member fields cannot be empty' }), {
				status: 400
			});
		}

		const name = safeString(m.name);
		const profession = safeString(m.profession);
		const weapon = safeString(m.weapon);
		const gearScore = Number(m.gearScore);

		if (!name || !profession || !weapon) {
			return new Response(JSON.stringify({ error: 'member fields cannot be empty' }), {
				status: 400
			});
		}
		if (Number.isNaN(gearScore)) {
			return new Response(JSON.stringify({ error: 'gearScore must be a number' }), { status: 400 });
		}
	}

	let cleanName = safeString(displayName);
	if (cleanName) {
		if (!validateDisplayName(cleanName)) {
			return new Response(JSON.stringify({ error: 'invalid displayName' }), { status: 400 });
		}
		cleanName = sanitizeDisplayName(cleanName);
	}

	const chosenName = cleanName || 'Anonymous';
	const pseudonym_hash = serverPseudonymHash(safeString(pseudonym) || chosenName);

	const entry: GroupEntry = {
		id: Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9),
		formId: cleanFormId,
		displayName: cleanName || undefined,
		pseudonym_hash,
		members: members.map((m) => ({
			name: safeString(m.name),
			profession: safeString(m.profession),
			weapon: safeString(m.weapon),
			gearScore: Number(m.gearScore)
		})),
		created_at: new Date().toISOString()
	};

	await addGroup(cleanFormId, entry);

	return new Response(JSON.stringify({ ok: true, id: entry.id }), {
		status: 201,
		headers: { 'content-type': 'application/json' }
	});
};
