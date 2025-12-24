import { createClient } from '@liveblocks/client';
import type { Room } from '@liveblocks/client';

let client: ReturnType<typeof createClient> | null = null;
let currentRoom: Room | null = null;
let currentLeave: (() => void) | null = null;

export function getLiveblocksClient() {
	if (!client) {
		client = createClient({
			authEndpoint: '/api/liveblocks/auth'
		});
	}
	return client;
}

export function enterRoom(roomId: string) {
	const c = getLiveblocksClient();
	if (currentRoom && currentRoom.id === roomId) return currentRoom;
	currentLeave?.();
	const { room, leave } = c.enterRoom(roomId, {
		initialPresence: { cursor: null }
	});
	currentRoom = room;
	currentLeave = leave;
	return currentRoom;
}

export function leaveRoom() {
	currentLeave?.();
	currentRoom = null;
	currentLeave = null;
}
