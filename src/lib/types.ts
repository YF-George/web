// 共用型別與從遠端（Liveblocks immutable）資料解析的 helpers
export interface GroupMember {
	profession: string;
	isDriver: boolean;
	isHelper: boolean;
	playerId: string;
	gearScore: string | number;
}

export interface ChangeLog {
	id: string;
	timestamp: Date;
	gameId: string;
	action: string;
	details: string;
}

export interface LocalGroup {
	id: string;
	members: GroupMember[];
	departureTime?: string;
	departureDate?: string;
	status?: string;
	dungeonName?: string;
	level?: string;
	gearScoreReq?: string;
	contentType?: string;
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
		gameId: safeString(c.gameId),
		action: safeString(c.action),
		details: safeString(c.details)
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
		members,
		status: safeString(r.status) || '招募中',
		departureDate: safeString(r.departureDate),
		departureTime: safeString(r.departureTime),
		dungeonName: safeString(r.dungeonName),
		level: safeString(r.level),
		gearScoreReq: safeString(r.gearScoreReq),
		contentType: safeString(r.contentType),
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
