import type { Handle } from '@sveltejs/kit';
import { injectSpeedInsights } from '@vercel/speed-insights/sveltekit';

// 在 SvelteKit 的 server hook 中注入 Vercel Speed Insights
// 這會讓 Speed Insights 能夠在 edge / server 環境攔截請求並收集性能指標。
// 如需更多設定，可參考 @vercel/speed-insights 的文件。
injectSpeedInsights();

export const handle: Handle = async ({ event, resolve }) => {
	// 目前不對請求進行額外處理，直接交由 SvelteKit 處理。
	return resolve(event);
};
