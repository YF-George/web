# AI Coding Agent 指引 — SvelteKit 網站專案

本專案為 SvelteKit v2（Svelte v5 runes）、Vite v7、Tailwind CSS v4、TypeScript strict。請優先遵循現有結構與慣例，避免自行引入不必要的工具鏈或設定檔。

## 專案結構（先看這些）

- 路由：`src/routes/`（依 SvelteKit 慣例）
  - 全域 layout：`src/routes/+layout.svelte`（`$props()` + `{@render children()}`；匯入 `./layout.css`；用 `<svelte:head>` 設定 favicon）
  - 範例首頁：`src/routes/+page.svelte`
- HTML 外殼：`src/app.html`（`%sveltekit.head%` / `%sveltekit.body%`）
- 共用程式/資產：`src/lib/`（`$lib` 別名；例：`src/lib/assets/favicon.svg` 以匯入方式打包）
- 公開靜態檔：`static/`（例：`static/robots.txt`）

## 慣例（本專案特有）

- Svelte 5：使用 runes 風格，不要回退到舊式 API；layout children 走 `$props()`。
- Head：頁面/版型需要 meta 就用 `<svelte:head>`；favicon 參考 `+layout.svelte` 的 `$lib/assets` 匯入方式。
- Tailwind v4：全域由 `src/routes/layout.css` 啟用（`@import 'tailwindcss'` + `@plugin '@tailwindcss/typography'`）。
- TS：`tsconfig.json` 延伸 `.svelte-kit/tsconfig.json`，並使用 `moduleResolution: 'bundler'`。

## 開發指令（以 pnpm 為主）

- 安裝：`pnpm install`（自動安裝 Husky 鉤子）
- 產生型別：`pnpm run prepare`（`svelte-kit sync` + Husky 初始化；改 TS/Svelte 設定後要跑）
- 開發：`pnpm run dev`（需要自動開瀏覽器可加 `-- --open`）
- 建置/預覽：`pnpm run build`、`pnpm run preview`
- 檢查：`pnpm run lint`、`pnpm run format`、`pnpm run check`（svelte-check）
- **本地 pre-commit 檢驗：** 執行 `git commit` 時，Husky 自動執行 lint-staged（格式化 + ESLint 修復），失敗則阻止 commit

## 設定與整合點

- Adapter：`svelte.config.js` 目前用 `@sveltejs/adapter-auto`；要部署到特定平台再改成對應 adapter。
- Vite：`vite.config.ts` 啟用 `@tailwindcss/vite` 與 `@sveltejs/kit/vite`。
- ESLint：`eslint.config.js` 為 flat config；TS 專案已停用 `no-undef`。

## 實用範例

- **新增頁面：** 建立 `src/routes/about/+page.svelte`，並加入標記與 Tailwind 類別。
- **新增 meta：** 在任何頁面/版型中使用 `<svelte:head>`；例如：`<title>About</title>`。
- **匯入資產：** `import logo from '$lib/assets/logo.svg'; <img src={logo} alt="" />`。
- **共享程式碼：** 將工具/元件放在 `src/lib/` 下，並從 `src/lib/index.ts` 匯出。

## 陷阱與注意事項

- 在更改 TS/Svelte 設定後，執行 `svelte-kit sync`（透過 `pnpm run prepare`）以更新型別。
- Tailwind v4 依賴 `@tailwindcss/vite` + CSS `@import`；除非必要，否則不要添加舊式的 `tailwind.config.cjs`。
- 型別使用 `.svelte-kit` 生成的設定；啟用嚴格的 TS 設定。
- 如果這裡的任何內容似乎不完整或不清楚（例如，部署 adapter 選擇、測試策略），請告訴我缺少什麼，我會完善這份文件。
