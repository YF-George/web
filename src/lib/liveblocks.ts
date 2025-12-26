import { LiveList, LiveObject } from '@liveblocks/client';
import type { LocalGroup } from '$lib/types';

// Clean single implementation. Return LiveObject<any> to avoid tight LSON constraints
export function toLiveGroup(g: LocalGroup) {
	return new LiveObject({
		id: g.id,
		order: typeof g.order === 'number' ? g.order : 0,
		members: new LiveList(
			(g.members || []).map(
				(m) =>
					new LiveObject({
						order: typeof m.order === 'number' ? m.order : 0,
						id: m.id,
						pinned: !!m.pinned,
						profession: m.profession,
						isDriver: !!m.isDriver,
						isHelper: !!m.isHelper,
						playerId: m.playerId || '',
						gearScore: m.gearScore || ''
					})
			)
		),
		departureDate: g.departureDate || '',
		departureTime: g.departureTime || '',
		status: g.status || '招募中',
		dungeonName: g.dungeonName || '',
		level: g.level || '',
		gearScoreReq: g.gearScoreReq || '',
		contentType: g.contentType || '',
		notes: g.notes || '',
		changeLog: new LiveList(
			(g.changeLog || []).map(
				(c) =>
					new LiveObject({
						id: c.id,
						timestamp: new Date(c.timestamp).toISOString(),
						gameId: c.gameId,
						actorId: c.actorId ?? c.gameId,
						action: c.action,
						details: c.details,
						targetType: c.targetType ?? undefined,
						targetId: c.targetId ?? undefined,
						field: c.field ?? undefined,
						oldValue: c.oldValue ?? undefined,
						newValue: c.newValue ?? undefined
					})
			)
		)
	});
}
