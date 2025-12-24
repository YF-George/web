import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	// Vercel 不支援 WebSocket，需使用 Pusher 或 Ably 等第三方服務
	// 這裡返回 501 Not Implemented
	return new Response('WebSocket not supported on Vercel. Use polling instead.', {
		status: 501
	});
};
