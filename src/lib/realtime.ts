import Ably from 'ably';

let client: Ably.Realtime | null = null;

export function getRealtimeClient(): Ably.Realtime | null {
	// 使用公開環境變數以便前端可讀；若未設定則回傳 null 作為回退
	const key = import.meta.env.PUBLIC_ABLY_KEY as string | undefined;
	if (!key) return null;
	if (!client) {
		client = new Ably.Realtime({ key });
	}
	return client;
}

export function getChannel(name: string) {
	const rt = getRealtimeClient();
	if (!rt) return null;
	return rt.channels.get(name);
}
