import { createClient } from '@liveblocks/client';

// 使用後端驗證端點，避免在前端暴露 Secret
export const client = createClient({
	authEndpoint: '/api/liveblocks/auth'
});

// 動態建立房間
export const enterRoom = (name: string) => client.enterRoom(name);
