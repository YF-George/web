// Dynamically import speed-insights to avoid build-time resolution errors
export const load = async () => {
	// Use a non-literal specifier so bundlers won't try to resolve it at build-time
	const spec = '@vercel/speed-insights/sveltekit';
	try {
		const mod = await import(spec as any);
		if (mod && typeof (mod as any).injectSpeedInsights === 'function') {
			(mod as any).injectSpeedInsights();
		}
	} catch (e) {
		// Module not available or failed to initialize in this environment — ignore
		// This keeps builds resilient when the package isn't installed or supported.
	}
};
