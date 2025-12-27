// 共用型別與從遠端（Liveblocks immutable）資料解析的 helpers
export interface GroupMember {
	id: string; // member 永久唯一識別（避免使用陣列 index）
	order?: number; // 用於 UI 排序，可重排
	pinned?: boolean;
	checked?: boolean;
	profession: string;
	isDriver: boolean;
	isHelper: boolean;
	playerId: string;
	gearScore: string | number;
}

export interface ChangeLog {
	id: string;
	timestamp: Date;
	gameId: string; // actor
	actorId?: string; // alias
	action: string;
	details: string;
	// structured fields to point precisely to target
	targetType?: 'group' | 'member';
	targetId?: string;
	field?: string;
	oldValue?: string | number | boolean;
	newValue?: string | number | boolean;
}

export interface LocalGroup {
	id: string;
	order?: number;
	members: GroupMember[];
	departureTime?: string;
	departureDate?: string;
	status?: string;
	dungeonName?: string;
	level?: string;
	gearScoreReq?: string;
	contentType?: string;
	notes?: string;
	changeLog?: ChangeLog[];
}

function isObject(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null;
}

function safeString(v: unknown) {
	return typeof v === 'string' ? v : '';
}

function parseMember(m: unknown): GroupMember {
	const r = (isObject(m) ? m : {}) as Record<string, unknown>;
	return {
		id:
			safeString(r.id) ||
			((
				globalThis as unknown as { crypto?: { randomUUID?: () => string } }
			).crypto?.randomUUID?.() ??
				`m-${Date.now()}-${Math.floor(Math.random() * 1e6)}`),
		order: typeof r.order === 'number' ? (r.order as number) : undefined,
		pinned: !!r.pinned,
		checked: !!r.checked,
		profession: safeString(r.profession) || '輸出',
		isDriver: !!r.isDriver,
		isHelper: !!r.isHelper,
		playerId: safeString(r.playerId),
		gearScore: (r.gearScore as string | number | undefined) ?? ''
	};
}

function parseChangeLogEntry(c: unknown): ChangeLog | null {
	if (!isObject(c)) return null;
	const id = safeString(c.id);
	const ts = c.timestamp ? new Date(String(c.timestamp)) : new Date();
	if (!id) return null;
	return {
		id,
		timestamp: ts,
		gameId: safeString((c as Record<string, unknown>).gameId),
		actorId:
			safeString((c as Record<string, unknown>).actorId) ||
			safeString((c as Record<string, unknown>).gameId),
		action: safeString((c as Record<string, unknown>).action),
		details: safeString((c as Record<string, unknown>).details),
		targetType: (c as Record<string, unknown>).targetType as 'group' | 'member' | undefined,
		targetId: safeString((c as Record<string, unknown>).targetId),
		field: safeString((c as Record<string, unknown>).field),
		oldValue: (c as Record<string, unknown>).oldValue as string | number | boolean | undefined,
		newValue: (c as Record<string, unknown>).newValue as string | number | boolean | undefined
	};
}

export function parseRemoteGroup(raw: unknown): LocalGroup | null {
	if (!isObject(raw)) return null;
	const r = raw as Record<string, unknown>;
	const membersRaw = (r.members ?? []) as unknown[];
	const changeLogRaw = (r.changeLog ?? []) as unknown[];
	const members = membersRaw.map(parseMember);
	const changeLog: ChangeLog[] = [];
	for (const c of changeLogRaw) {
		const ce = parseChangeLogEntry(c);
		if (ce) changeLog.push(ce);
	}
	return {
		id: safeString(r.id) || '',
		order: typeof r.order === 'number' ? (r.order as number) : undefined,
		members,
		status: safeString(r.status) || '招募中',
		departureDate: safeString(r.departureDate),
		departureTime: safeString(r.departureTime),
		dungeonName: safeString(r.dungeonName),
		level: safeString(r.level),
		gearScoreReq: safeString(r.gearScoreReq),
		contentType: safeString(r.contentType),
		notes: safeString(r.notes),
		changeLog
	};
}

export function parseRemoteGroups(raw: unknown): LocalGroup[] {
	if (!Array.isArray(raw)) return [];
	const out: LocalGroup[] = [];
	for (const r of raw) {
		const g = parseRemoteGroup(r);
		if (g && g.id) out.push(g);
	}
	return out;
}
