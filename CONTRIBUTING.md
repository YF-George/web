# 貢獻規範（Guidelines）

本專案為 SvelteKit v2（Svelte v5 runes）、Vite v7、Tailwind CSS v4、TypeScript strict。以下規範協助維持一致性與可維護性。

## 開發環境與基本流程

- 套件管理：建議使用 `pnpm`。
- 常用指令：`pnpm run prepare`（型別同步）、`pnpm run dev`、`pnpm run build`、`pnpm run preview`、`pnpm run lint`、`pnpm run format`、`pnpm run check`。
- 變更 TS/Svelte 設定後，請執行 `pnpm run prepare` 更新 `.svelte-kit` 型別。

## 分支與 Commit 規範

- 分支命名：`feature/<短描述>`、`fix/<短描述>`、`chore/<短描述>`、`docs/<短描述>`。
- Commit 規範（Conventional Commits）：
  - `feat: 新增首頁 hero 區塊`、`fix: 修正 favicon 載入路徑`、`chore: 調整 eslint 規則`、`docs: 更新 README 範例`。

## Svelte 5（runes）慣例

- 在 `+layout.svelte` 使用 `$props()` 取得 children，並以 `{@render children()}` 渲染。
- Page/Layout 需要 meta 請用 `<svelte:head>`；favicon 以匯入 `$lib/assets/favicon.svg` 的方式設定。
- 元件與工具程式置於 `src/lib/`，並透過 `$lib` 別名匯入；避免深層相對路徑。

## 樣式與 Tailwind

- 全域由 `src/routes/layout.css` 啟用：
  ```css
  @import 'tailwindcss';
  @plugin '@tailwindcss/typography';
  ```
- 優先使用 Tailwind 工具類別於 `.svelte` 檔；必要時於 `layout.css` 補充全域樣式。
- 避免加入舊式 `tailwind.config.cjs`；如需擴充請先討論。

## 檔案命名與結構

- 路由依 SvelteKit 慣例（`src/routes/`）命名；頁面以 `+page.svelte`、全域版型以 `+layout.svelte` 為主。
- 自訂元件建議使用 `PascalCase.svelte` 命名（例如 `src/lib/components/Button.svelte`）。
- 資產：公開檔案放 `static/`；需經由打包的檔案放在 `src/lib/assets/` 並以匯入方式使用。

## TypeScript 與型別

- 啟用 strict，避免使用 `any`；為公共 API/元件 props 補齊型別。
- 使用 `moduleResolution: 'bundler'`；維持 `rewriteRelativeImportExtensions: true` 設定。

## 程式碼註解規範

- **語言與風格：** 全部使用繁體中文（台灣用詞）；簡潔直述邏輯或目的，避免冗長說明。
- **何時註解：** 複雜演算法、非顯而易見的邏輯、API 設計決策、已知的侷限或待辦項目（TODO/FIXME）。
- **避免註解：** 自解釋的程式碼、簡單迴圈/條件無需逐行註解。
- **格式：**
  - 單行註解（JSDoc）：`/** @param name - 使用者名稱 */`
  - 段落或複雜邏輯：
    ```typescript
    // 避免重複計算：快取轉換結果
    const cached = new Map<string, Result>();
    ```
  - TODO/FIXME：`// TODO: 效能最佳化 - 改用虛擬滾動`、`// FIXME: 處理邊界情況`

## 可存取性與語意化

- 影像請提供適當 `alt`；表單與互動元素需具備語意化標籤與可鍵盤操作。

## 效能與相依

- 優先使用 SvelteKit/Svelte 原生能力，避免不必要的大型相依。
- 需要第三方套件時，說明用途與取捨，並維持一致的用法。

## 測試規範

- 暫未強制測試框架；若新增複雜商業邏輯，建議補充單元測試（Vitest/Jest）。
- 重點驗證：關鍵路徑、邊界情況、元件互動行為。
- 測試檔案置於 `src/` 同層或 `__tests__/`；命名 `*.test.ts` 或 `*.spec.ts`。
- 執行：待測試框架設定完成，預期指令為 `pnpm run test`。

## 文件規範

- **README.md：** 專案概述、安裝、開發指令、核心慣例、部署提示。
- **CONTRIBUTING.md：** 本文件；新人上手與貢獻流程。
- **.github/copilot-instructions.md：** AI 編碼代理參考；架構、慣例、工作流。
- **程式碼文件：** 複雜元件/函式請於頂端補充 JSDoc；描述用途、參數、回傳值。
- **重大變更日誌：** 若新增破壞性變更，請於 PR 說明遷移步驟；未來考慮維護 `CHANGELOG.md`。

## 安全與依賴管理

- **套件審查：** 新增相依前確認維護狀態、月下載量、已知漏洞。
- **版本策略：** 通常遵循 npm 預設（適度升級安全補丁）；主版本升級需討論。
- **敏感資料：** 不得提交密鑰、API Token、密碼；使用環境變數（`.env.local` 已忽略）。
- **鎖定檔：** `pnpm-lock.yaml` 務必提交，確保重現性；勿手動編輯。

## 環境變數與設定管理

- **位置與範例：** 參考 `.env.example`（勿含敏感值）；本地使用 `.env.local`（已忽略）。
- **公開 vs 私密：**
  - `PUBLIC_*` 前綴：在 client 端可見，用於 API 端點、分析 ID 等非敏感設定。
  - 無前綴：僅 server 端可見，用於資料庫密碼、API 密鑰、簽署密鑰等。
- **例子：**
  ```env
  # .env.local（勿提交）
  PUBLIC_API_URL=https://api.example.com
  DATABASE_PASSWORD=secret123
  JWT_SECRET=mysecretkey
  ```
- **載入方式：** SvelteKit 自動於啟動時載入 `.env.local` 與 `.env`；不需手動 dotenv。
- **部署：** 生產環境於平台（Vercel、Cloudflare 等）設定環境變數，勿提交。

## 效能優化指南

- **初次載入：** 頻繁檢查 bundle 大小（`pnpm run build` 打印信息）；合理分割路由與元件。
- **運行時效能：** 避免緊密迴圈中反覆計算；使用 SvelteKit 快取與預加載（`data-sveltekit-preload-data`）。
- **樣式效能：** Tailwind v4 內建 purge；勿加載未使用 plugin。
- **影像最佳化：** 使用 WebP/AVIF；必要時考慮圖片懶載入。

## Git 工作流

1. 從 `main` 建立特性分支：`git checkout -b feature/xxx main`。
2. 提交清晰的 Commit（Conventional Commits）；一次一個邏輯變更。
3. 推送分支並開立 PR，說明目的與變更內容。
4. 通過 Lint/型別檢查、程式碼審核後合併。
5. PR 合併後自動刪除遠端分支；本地 `git branch -D feature/xxx`。

## 命名慣例細則

- **變數與函式：** `camelCase`（例 `getUserInfo`、`isActive`）。
- **常數：** `UPPER_SNAKE_CASE`（例 `MAX_RETRY_COUNT`、`DEFAULT_TIMEOUT`）；環境變數同。
- **型別/介面：** `PascalCase`（例 `UserProfile`、`ApiResponse`）。
- **CSS Class：** Tailwind 優先；自訂 class 用 `kebab-case`（例 `hero-banner`、`nav-highlight`）。
- **路由與檔案：** 依 SvelteKit 慣例；page 用 `+page.svelte`，API 路由用 `+server.ts`。

## 重構與舊程式碼清理

- 移除未使用的匯入、變數、函式。
- 涉及多檔案重構時，先開議題討論方案；分多個小 PR 逐步實施。
- 更新相關文件與測試；不得遺漏。

## 錯誤處理與日誌

- **用戶錯誤：** 呈現友善訊息，避免技術細節洩露。
- **伺服器錯誤：** 記錄完整堆疊；區分開發（詳細）與生產（通用訊息）模式。
- **日誌等級：** info（關鍵事件）、warn（潛在問題）、error（失敗）；避免過度 debug 輸出。

## 程式碼審核清單（Reviewer）

- 邏輯正確性與邊界情況。
- 效能影響、相依新增。
- 型別完整性、註解充分。
- 一致性：命名、結構、慣例。
- 測試覆蓋或說明為何未測試。
- 文件更新。

## 常見問題與解決

- **型別錯誤：** 執行 `pnpm run prepare && pnpm run check` 重新同步 `.svelte-kit` 型別。
- **Prettier/ESLint 衝突：** 預計由 `eslint-config-prettier` 排解；若仍衝突，須討論。
- **相依版本衝突：** 檢查 `pnpm-lock.yaml` 或執行 `pnpm install --no-frozen-lockfile` 後重審。
- **建置失敗：** 清除 `.svelte-kit` 與 `node_modules/.vite`，重新 `pnpm install` 與 `pnpm run build`。

## 聯繫與發問

- 大型功能或架構變更，請先開議題或與維護者討論。
- 遇到卡點，歡迎於 PR 或議題提問；提供背景與期望結果。

## CI/CD 與自動化檢驗

- **GitHub Actions 工作流：** `.github/workflows/ci.yml` 自動於每個 PR 執行下列檢查：
  - 安裝相依：`pnpm install`
  - 格式檢查：`pnpm run format --check`（或 `pnpm run lint`）
  - 型別檢查：`pnpm run check`（svelte-check）
  - 建置驗證：`pnpm run build`
- **本地檢驗：** 推送前自行執行上述命令，確保不會阻擋 CI。
- **分支保護：** `main` 分支需 CI 通過始可合併；避免繞過檢查。
