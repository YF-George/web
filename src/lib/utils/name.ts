export function sanitizeDisplayName(raw: unknown): string {
	const s = String(raw ?? '').trim();
	// basic XSS strip
	return s.replace(/[<>]/g, '');
}

export function validateDisplayName(name: string): boolean {
	const s = String(name ?? '').trim();
	if (s.length < 1 || s.length > 40) return false;
	// prohibit email-like and common domains
	const emailLike = /[^\x20-\x7F]*[\w.+-]+@[\w-]+\.[\w.-]+/;
	if (emailLike.test(s)) return false;
	const domainLike = /.(?:com|net|org|io|app|dev)$/i;
	if (domainLike.test(s)) return false;
	// allow letters, numbers, spaces, underscores, dashes
	return /^[\p{L}\p{N} _-]+$/u.test(s);
}
