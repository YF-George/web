import type { Handle } from '@sveltejs/kit';

// 嘗試動態載入 Speed Insights，避免 build 時解析失敗
(async () => {
	const spec = '@vercel/speed-insights/sveltekit';
	try {
		const mod = await import(spec as any);
		if (mod && typeof (mod as any).injectSpeedInsights === 'function') {
			(mod as any).injectSpeedInsights();
		}
	} catch (e) {
		// 模組不可用或不支援當前環境，忽略
		// 這樣可以讓部署在不支援 Speed Insights 的環境時仍然通過 build
	}
})();

export const handle: Handle = async ({ event, resolve }) => {
	return resolve(event);
};
