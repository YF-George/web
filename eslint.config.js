import prettier from 'eslint-config-prettier';
import { fileURLToPath } from 'node:url';
import { includeIgnoreFile } from '@eslint/compat';
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';
import svelteConfig from './svelte.config.js';

// Path to .gitignore so ESLint can include its ignore entries
const gitignorePath = fileURLToPath(new URL('./.gitignore', import.meta.url));

// Compose base configs in a readable way. We intentionally keep the existing
// recommended configs for JS, TS and Svelte, plus Prettier to avoid conflicts.
const baseConfigs = [
	includeIgnoreFile(gitignorePath),
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs.recommended,
	prettier,
	...svelte.configs.prettier
];

export default defineConfig(
	...baseConfigs,
	{
		// Global environment globals available in all files
		languageOptions: { globals: { ...globals.browser, ...globals.node } },

		rules: {
			// TypeScript projects should not use `no-undef` as TS already handles this
			// See: https://typescript-eslint.io/troubleshooting/faqs/eslint/#i-get-errors-from-the-no-undef-rule
			'no-undef': 'off',
			// Disable resolve() requirement for SvelteKit 2 (resolve is deprecated in SvelteKit 2)
			'svelte/no-navigation-without-resolve': 'off'
		}
	},
	// Svelte-specific override: ensure parserOptions include the Svelte config
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser,
				svelteConfig
			}
		}
	}
);
