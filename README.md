# SvelteKit 網站專案

本專案使用 SvelteKit v2、Svelte v5（runes）、Vite v7、Tailwind CSS v4，以及 TypeScript（strict）。

## 技術棧與關鍵檔案

- **SvelteKit v2 + Svelte v5：** runes 寫法元件
- **Vite v7：** 開發/建置工具鏈（`vite.config.ts`）
- **Tailwind v4：** 透過 CSS `@import` 載入（`src/routes/layout.css`）
- **TypeScript（strict）：** 以 `.svelte-kit/tsconfig.json` 為基底延伸
- **路由：** `src/routes/`（`+layout.svelte`、`+page.svelte`）
- **HTML 外殼：** `src/app.html`，包含 `%sveltekit.head%` / `%sveltekit.body%`
- **`$lib` 別名：** `src/lib/` 放共用程式/資產（例如 `src/lib/assets/favicon.svg`）

## 安裝與開發

```powershell
pnpm install
pnpm run prepare   # 產生/同步 .svelte-kit 型別
pnpm run dev       # 可加 "-- --open" 自動開瀏覽器
```

## 建置與預覽

```powershell
pnpm run build
pnpm run preview
```

## Lint / 格式化 / 型別檢查

```powershell
pnpm run lint      # Prettier + ESLint（flat config）
pnpm run format    # Prettier 寫回檔案
pnpm run check     # svelte-check（使用專案 tsconfig）
pnpm run check:watch
```

## 專案慣例

- **Svelte 5 runes：** 使用 `$props()`，並在 `+layout.svelte` 用 `{@render children()}` 渲染子內容。
- **Head 設定：** 在 page/layout 用 `<svelte:head>` 設定 meta；favicon 從 `$lib/assets` 匯入。
- **樣式：** Tailwind v4 透過 `src/routes/layout.css` 全域啟用：
  ```css
  @import 'tailwindcss';
  @plugin '@tailwindcss/typography';
  ```
- **別名與資產：** 打包型資產用 `$lib/assets` 匯入；公開檔案放 `static/`（例如 `static/robots.txt`）。

## 設定重點

- `svelte.config.js`：`vitePreprocess()` + `@sveltejs/adapter-auto`。
- `vite.config.ts`：啟用 `@tailwindcss/vite` 與 `@sveltejs/kit/vite`。
- `tsconfig.json`：`moduleResolution: 'bundler'`、`rewriteRelativeImportExtensions: true`、strict TS。
- `eslint.config.js`：ESLint flat config，整合 `typescript-eslint` 與 `eslint-plugin-svelte`；TS 專案停用 `no-undef`。

## 範例

- **新增頁面：** 建立 `src/routes/about/+page.svelte` 並使用 Tailwind 類別。
- **新增 meta：** 在頁面/版型內：
  ```svelte
  <svelte:head><title>About</title></svelte:head>
  ```
- **匯入資產：**

  ```svelte
  <script>
  	import logo from '$lib/assets/logo.svg';
  </script>

  <img src={logo} alt="" />
  ```

## 注意事項

- TS/Svelte 設定有異動後，請跑 `pnpm run prepare` 更新 `.svelte-kit` 型別。
- 部署時依目標平台改用對應 adapter（不要一直用 `adapter-auto`）：https://svelte.dev/docs/kit/adapters

## 貢獻指南

- 請先閱讀 `CONTRIBUTING.md`（專案規範、分支/Commit/PR 檢查清單、Svelte 5/Tailwind 慣例）。
