// 共用型別定義，供元件與主頁面使用

export interface GroupMember {
	id: string;
	order?: number;
	pinned?: boolean;
	checked?: boolean;
	profession: string;
	playerId: string;
	gearScore: string | number;
	role?: '' | 'leader' | 'helper';
}

export interface ChangeLog {
	id: string;
	timestamp: Date;
	gameId: string;
	actorId?: string;
	action: string;
	details: string;
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
