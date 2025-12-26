import prettier from 'eslint-config-prettier';
import { fileURLToPath } from 'node:url';
import { includeIgnoreFile } from '@eslint/compat';
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';
import svelteConfig from './svelte.config.js';

// 指向 .gitignore 的路徑，讓 ESLint 可以把 .gitignore 的忽略條目納入考量
const gitignorePath = fileURLToPath(new URL('./.gitignore', import.meta.url));

// 以易讀方式組合基底設定。我們保留 JS、TS 與 Svelte 的推薦設定，
// 並加入 Prettier 以避免格式化衝突。
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
		// 全域語言選項：在所有檔案中預設可用的 global 變數（瀏覽器與 Node）
		languageOptions: { globals: { ...globals.browser, ...globals.node } },

		rules: {
			// 因為 TypeScript 自身會處理未定義變數的檢查，建議在 TypeScript 專案中關閉 `no-undef`
			// 參考：https://typescript-eslint.io/troubleshooting/faqs/eslint/#i-get-errors-from-the-no-undef-rule
			'no-undef': 'off',
			// 關閉 SvelteKit 2 中對 resolve() 的要求（在 SvelteKit 2 中 resolve 已為非推薦用法）
			'svelte/no-navigation-without-resolve': 'off'
		}
	},
	// Svelte-specific override: ensure parserOptions include the Svelte config
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				// 針對 Svelte 檔案的 parser 選項，包含專案服務、額外副檔名與 TypeScript parser
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser,
				svelteConfig
			}
		}
	}
);
