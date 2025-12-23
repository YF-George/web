import type { RequestHandler } from './$types';
import crypto from 'crypto';
import { sanitizeDisplayName, validateDisplayName } from '$lib/utils/name';
import { kv } from '@vercel/kv';

interface EditAction {
	type: string;
	row?: number;
	col?: number;
	value?: string;
	cellAddress?: string;
	timestamp?: number;
	content?: string;
	formatting?: {
		textColor?: string;
		bgColor?: string;
		fontWeight?: string;
		fontStyle?: string;
		textDecoration?: string;
		fontSize?: string;
		textAlign?: string;
	};
}

interface Edit {
	id: string;
	formId: string;
	displayName: string;
	pseudonym_hash: string;
	action: EditAction;
	created_at: string;
}

// Get all edits for a form from KV store
async function getEdits(formId: string): Promise<Edit[]> {
	const key = `form:${formId}:edits`;
	const edits = await kv.get<Edit[]>(key);
	return edits || [];
}

// Add edit to KV store
async function addEdit(edit: Edit): Promise<void> {
	const key = `form:${edit.formId}:edits`;
	const edits = await getEdits(edit.formId);
	edits.push(edit);
	await kv.set(key, edits);
}

function serverPseudonymHash(pseudonym: string) {
	const salt = process.env.PSEUDONYM_SALT || 'dev-fallback-salt';
	return crypto.createHmac('sha256', salt).update(pseudonym).digest('hex');
}

// Simple in-memory rate limit (production: use Redis)
const rateLimitMap = new Map<string, number[]>();
function checkRateLimit(key: string, maxPerMinute = 10): boolean {
	const now = Date.now();
	const timestamps = rateLimitMap.get(key) || [];
	const recent = timestamps.filter((t) => now - t < 60000);
	if (recent.length >= maxPerMinute) return false;
	recent.push(now);
	rateLimitMap.set(key, recent);
	return true;
}

export const GET: RequestHandler = async ({ url }) => {
	const formId = url.searchParams.get('formId');
	if (!formId) {
		return new Response(JSON.stringify({ error: 'missing formId' }), { status: 400 });
	}

	const all = await getEdits(formId);

	// Return without pseudonym_hash (privacy)
	const safe = all.map(({ id, formId, displayName, action, created_at }) => ({
		id,
		formId,
		displayName,
		action,
		created_at
	}));

	return new Response(JSON.stringify({ edits: safe }), {
		status: 200,
		headers: { 'content-type': 'application/json' }
	});
};

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	const clientIp = getClientAddress();

	// Rate limit check
	if (!checkRateLimit(clientIp, 20)) {
		return new Response(JSON.stringify({ error: 'rate limit exceeded' }), { status: 429 });
	}

	const body = await request.json().catch(() => ({}));
	const { formId, displayName, pseudonym, action } = body as {
		formId?: string;
		displayName?: string;
		pseudonym?: string;
		action?: EditAction;
	};

	if (!formId || !pseudonym || !action) {
		return new Response(JSON.stringify({ error: 'missing fields' }), { status: 400 });
	}

	// Validate formId format
	if (!/^[a-zA-Z0-9_-]{1,100}$/.test(String(formId))) {
		return new Response(JSON.stringify({ error: 'invalid formId' }), { status: 400 });
	}

	const cleanName = sanitizeDisplayName(displayName ?? 'Anonymous');
	// Allow empty displayName to default to Anonymous, but validate if provided
	if (cleanName && cleanName !== 'Anonymous' && !validateDisplayName(cleanName)) {
		return new Response(JSON.stringify({ error: 'invalid displayName' }), { status: 400 });
	}

	// Validate action format - support both cell-edit and edit types
	if (!action.type) {
		return new Response(JSON.stringify({ error: 'invalid action format' }), { status: 400 });
	}

	if (action.type === 'cell-edit') {
		// For spreadsheet cell edits
		if (
			typeof action.row !== 'number' ||
			typeof action.col !== 'number' ||
			typeof action.value !== 'string'
		) {
			return new Response(JSON.stringify({ error: 'invalid action format' }), { status: 400 });
		}
		if (action.value.length > 10000) {
			return new Response(JSON.stringify({ error: 'content too long' }), { status: 400 });
		}
	} else if (action.type === 'edit') {
		// For regular text edits
		if (typeof action.content !== 'string') {
			return new Response(JSON.stringify({ error: 'invalid action format' }), { status: 400 });
		}
		if (action.content.length > 10000) {
			return new Response(JSON.stringify({ error: 'content too long' }), { status: 400 });
		}
	} else {
		return new Response(JSON.stringify({ error: 'invalid action type' }), { status: 400 });
	}

	const pseudonym_hash = serverPseudonymHash(String(pseudonym));

	const entry: Edit = {
		id: Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9),
		formId: String(formId),
		displayName: cleanName,
		pseudonym_hash,
		action,
		created_at: new Date().toISOString()
	};

	await addEdit(entry);

	return new Response(JSON.stringify({ ok: true, id: entry.id }), {
		status: 201,
		headers: { 'content-type': 'application/json' }
	});
};
