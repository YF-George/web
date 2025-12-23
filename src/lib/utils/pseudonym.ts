// Client-side deterministic pseudonym derivation using Web Crypto
// Returns a base64url string
export async function derivePseudonym(passphrase: string, salt = 'forms.v1') {
	const enc = new TextEncoder();
	const pass = enc.encode(passphrase);
	const saltBytes = enc.encode(salt);
	const key = await crypto.subtle.importKey('raw', pass, { name: 'PBKDF2' }, false, ['deriveBits']);
	const derived = await crypto.subtle.deriveBits(
		{ name: 'PBKDF2', hash: 'SHA-256', iterations: 150000, salt: saltBytes },
		key,
		256
	);
	const view = new Uint8Array(derived);
	// base64url
	const b64 = btoa(String.fromCharCode(...view));
	return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
