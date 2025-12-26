import { LiveList, LiveObject } from '@liveblocks/client';
import type { LocalGroup } from '$lib/types';

export function toLiveGroup(g: LocalGroup): LiveObject<Record<string, unknown>> {
  return new LiveObject({
    id: g.id,
    members: new LiveList(
      (g.members || []).map((m) =>
        new LiveObject({
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
    changeLog: new LiveList(
      (g.changeLog || []).map((c) =>
        new LiveObject({
          id: c.id,
          timestamp: new Date(c.timestamp).toISOString(),
          gameId: c.gameId,
          action: c.action,
          details: c.details
        })
      )
    )
  });
}
import { LiveList, LiveObject } from '@liveblocks/client';
import type { LocalGroup } from '$lib/types';

export function toLiveGroup(g: LocalGroup): LiveObject<Record<string, unknown>> {
  return new LiveObject({
    id: g.id,
    members: new LiveList(
      (g.members || []).map((m) =>
        new LiveObject({
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
    changeLog: new LiveList(
      (g.changeLog || []).map((c) =>
        new LiveObject({
          id: c.id,
          timestamp: new Date(c.timestamp).toISOString(),
          gameId: c.gameId,
          action: c.action,
          details: c.details
        })
      )
    )
  });
}
import { LiveList, LiveObject } from '@liveblocks/client';
import type { LocalGroup, ChangeLog, GroupMember } from '$lib/types';

type LiveGroupMember = {
	profession: string;
	isDriver: boolean;
	isHelper: boolean;
tplayerId: string; // kept for alignment if needed
};

type LiveChangeLog = {
tid: string;
ttimestamp: string;
tgameId: string;
taction: string;
tdetails: string;
};

export function toLiveGroup(g: LocalGroup): LiveObject<Record<string, unknown>> {
	return new LiveObject({
		id: g.id,
		members: new LiveList(
 			(g.members || []).map((m) =>
 				new LiveObject({
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
 		changeLog: new LiveList(
 			(g.changeLog || []).map((c) =>
 				new LiveObject({
 					id: c.id,
 					timestamp: new Date(c.timestamp).toISOString(),
 					gameId: c.gameId,
 					action: c.action,
 					details: c.details
 				})
 			)
 		)
 	});
}
