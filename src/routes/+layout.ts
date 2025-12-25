import { injectSpeedInsights } from '@vercel/speed-insights/sveltekit';

export const load = () => {
	injectSpeedInsights();
};
