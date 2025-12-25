import { createClient } from '@liveblocks/client';

// 使用後端驗證端點，避免在前端暴露 Secret
export const client = createClient({
	authEndpoint: '/api/liveblocks/auth'
});

export const { room, leave } = client.enterRoom('my-room');

// 若需動態房間，可改為：
// export const enterRoom = (name: string) => client.enterRoom(name);
