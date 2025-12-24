# 匿名協作表單系統

這是一個以隱私為優先的匿名協作編輯系統，讓多人能在不洩露真實身份的情況下共同編輯內容。

## 🌟 特色功能

- **完全匿名**：無需註冊或登入，支援自動暱稱或自訂名稱
- **智能暱稱系統**：自動生成隨機暱稱（如 Explorer_42），或自訂你的名稱
- **本地儲存**：暱稱和偏好設定自動保存到 localStorage，下次進入自動載入
- **即時協作**：類 Excel 試算表介面，雙擊編輯，實時同步
- **豐富格式**：支援文字顏色、背景顏色、粗體、斜體、字體大小等
- **鍵盤快捷**：Ctrl+C/X/V 複製剪貼、Ctrl+Z/Y 復原重做、方向鍵導航
- **速率限制**：防止濫用（每分鐘 20 次請求）
- **內容驗證**：防止 email 格式的顯示名稱、XSS 攻擊

## 🚀 快速開始

### 1. 啟動開發伺服器

```powershell
# 設定密語鹽值（務必使用強隨機值）
$env:PSEUDONYM_SALT = 'your-secure-random-salt-here'

# 安裝相依套件
pnpm install

# 啟動開發伺服器
pnpm run dev
```

### 2. 訪問試算表

開啟瀏覽器到：

```
http://localhost:5173/forms/main
```

### 3. 編輯和協作

1. **選擇身份**：
   - 🎭 **自動暱稱**（預設）：系統自動生成隨機暱稱，每次進入自動載入
   - ✏️ **自訂名稱**：點擊 ✏️ 按鈕切換為自訂名稱模式，輸入你的名稱

2. **編輯儲存格**：
   - 雙擊儲存格進入編輯模式
   - 按 Enter 儲存，按 Esc 取消
   - 或點擊其他儲存格自動儲存

3. **格式化**：
   - 選取儲存格後，使用工具列調整顏色、字體大小等
   - 點擊 📋 按鈕載入儲存格的現有格式到工具列
   - 格式會在編輯內容時一起儲存

4. **進階操作**：
   - Ctrl+C：複製
   - Ctrl+X：剪下
   - Ctrl+V：貼上
   - Ctrl+Z：復原
   - Ctrl+Y：重做
   - Delete：刪除內容
   - 方向鍵：上下左右移動
   - Tab：移到下一格

5. **查看記錄**：
   - 點擊 📜 編輯記錄查看所有編輯歷史
   - 可過濾和搜尋編輯

## 📁 檔案結構

```
src/
├── lib/
│   └── utils/
│       ├── name.ts           # 顯示名稱驗證與清洗
│       └── pseudonym.ts      # Client-side 密語導出 (PBKDF2)
└── routes/
    ├── forms/[id]/
    │   └── +page.svelte      # 表單頁面 UI
    └── api/
        └── edits/
            └── +server.ts    # GET/POST API 端點

data/
└── edits.json                # 編輯紀錄儲存（示範用）
```

## 🔒 隱私與安全

### 密語處理流程

1. **Client-side**：使用者輸入的密語透過 PBKDF2（150,000 輪迭代）+ SHA-256 導出一個 pseudonym（256-bit → base64url）
2. **傳輸**：pseudonym 透過 HTTPS 傳送到伺服器
3. **Server-side**：伺服器使用 HMAC-SHA256 + 環境變數 `PSEUDONYM_SALT` 計算 `pseudonym_hash`
4. **儲存**：只有 `pseudonym_hash` 被儲存，無法逆向推導出原始密語或 pseudonym

### 資料儲存

目前使用 `data/edits.json` 作為示範儲存。生產環境建議：

- 使用資料庫（PostgreSQL、MySQL、SQLite 等）
- 建立適當的索引（`formId`, `pseudonym_hash`）
- 定期備份
- 實作資料保留政策

### 速率限制

- **目前實作**：記憶體內速率限制（每 IP 每分鐘 20 次請求）
- **生產建議**：使用 Redis 或類似的分散式快取
- **額外保護**：加入 CAPTCHA（hCaptcha、reCAPTCHA）

### 驗證規則

**顯示名稱：**

- 長度：2-40 字元
- 不可包含 email 格式（禁止 `@` + domain）
- 不可以 `.com`、`.net`、`.org`、`.io`、`.app`、`.dev` 結尾
- 允許：字母、數字、空格、底線、破折號

**表單 ID：**

- 格式：`[a-zA-Z0-9_-]{1,100}`

**編輯內容：**

- 最大長度：10,000 字元
- 必須包含 `type` 與 `content` 欄位

## 📡 API 端點

### GET `/api/edits?formId={id}`

取得指定表單的所有編輯紀錄。

**回應範例：**

```json
{
	"edits": [
		{
			"id": "lm3x9k-a7b2c3d",
			"formId": "project-alpha",
			"displayName": "路人A",
			"action": {
				"type": "edit",
				"content": "更新了第三段內容"
			},
			"created_at": "2025-12-23T13:47:00.000Z"
		}
	]
}
```

**注意**：回應不包含 `pseudonym_hash`（隱私保護）。

### POST `/api/edits`

提交新的編輯紀錄。

**請求範例：**

```json
{
	"formId": "project-alpha",
	"displayName": "路人A",
	"pseudonym": "base64url-encoded-pseudonym",
	"action": {
		"type": "edit",
		"content": "這是我的編輯內容"
	}
}
```

**成功回應（201）：**

```json
{
	"ok": true,
	"id": "lm3x9k-a7b2c3d"
}
```

**錯誤回應範例：**

- `400`：缺少必要欄位、格式錯誤、內容過長
- `429`：超過速率限制

## 🎨 UI 功能

### 提交表單區塊

- 顯示名稱輸入（帶驗證提示）
- 密語輸入（type=password）
- 編輯內容 textarea（顯示字元計數）
- 提交與重置按鈕
- 即時狀態回饋（loading、success、error）

### 編輯歷史區塊

- 自動載入與每 30 秒自動重新整理
- 最新編輯在上方（`.toReversed()`）
- 顯示作者名稱與相對時間（「剛剛」、「5 分鐘前」等）
- 手動重新整理按鈕
- 可捲動的歷史列表（最大高度 600px）

### 響應式設計

- 桌面版：左右分欄（編輯器 + 歷史）
- 行動版：單欄堆疊佈局

## 🔧 環境變數

### 必要變數

```bash
PSEUDONYM_SALT=your-secure-random-salt-here
```

**產生安全的鹽值：**

```powershell
# PowerShell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object {[char]$_})
```

```bash
# Linux/Mac
openssl rand -base64 32
```

## 🚢 部署建議

### 生產環境檢查清單

- [ ] 更換 `data/edits.json` 為正式資料庫
- [ ] 設定強隨機的 `PSEUDONYM_SALT` 環境變數
- [ ] 啟用 HTTPS（必要）
- [ ] 加入分散式速率限制（Redis）
- [ ] 整合 CAPTCHA
- [ ] 設定 CORS 規則
- [ ] 啟用日誌監控（audit log）
- [ ] 建立資料備份策略
- [ ] 加入 CSP（Content Security Policy）header
- [ ] 設定適當的 `Cache-Control` header

### 建議的 Adapter

根據部署平台選擇適當的 SvelteKit adapter：

- **Vercel**：`@sveltejs/adapter-vercel`
- **Netlify**：`@sveltejs/adapter-netlify`
- **Cloudflare Pages**：`@sveltejs/adapter-cloudflare`
- **Node.js**：`@sveltejs/adapter-node`

## 🧪 測試

### 手動測試流程

1. 啟動 dev server
2. 開啟兩個不同瀏覽器（或無痕視窗）
3. 在第一個瀏覽器：
   - 設定顯示名稱「測試者A」
   - 設定密語「test-passphrase-1」
   - 提交內容「第一則訊息」
4. 在第二個瀏覽器：
   - 設定顯示名稱「測試者B」
   - 設定密語「test-passphrase-2」
   - 提交內容「第二則訊息」
5. 確認兩個瀏覽器都能看到對方的編輯
6. 在第一個瀏覽器重新提交，確認名稱顯示一致（同一密語）

### 驗證檢查

```powershell
# 檢查 edits.json
Get-Content data\edits.json | ConvertFrom-Json | Format-List

# 驗證 pseudonym_hash 是否相同（同一密語應該產生相同 hash）
```

## 📚 延伸功能建議

### 即時同步

- WebSocket 或 Server-Sent Events (SSE)
- 當有新編輯時自動推送到所有連線的客戶端

### 衝突處理

- Operational Transformation (OT) 或 CRDT
- 視覺化衝突標記

### 富文本編輯器

- 整合 Tiptap、ProseMirror、或 Quill
- Markdown 預覽

### 版本控制

- 追蹤編輯歷史差異（diff）
- 回復到特定版本

### 權限管理

- 表單建立者可設定「唯讀」或「可編輯」
- Magic link 升級機制（保留匿名性但獲得管理權）

### 匯出功能

- 匯出為 JSON、CSV、Markdown
- 產生編輯時間軸報告

## 🐛 疑難排解

### 問題：提交後看不到自己的編輯

**可能原因：**

- 自動重新整理尚未觸發
- API 請求失敗

**解決方法：**

- 點擊手動重新整理按鈕
- 檢查瀏覽器 Console 是否有錯誤
- 確認 `data/edits.json` 檔案權限

### 問題：「rate limit exceeded」錯誤

**可能原因：**

- 短時間內提交過多次

**解決方法：**

- 等待 1 分鐘後再試
- 開發模式可調整 `checkRateLimit` 的 `maxPerMinute` 參數

### 問題：密語相同但顯示為不同人

**可能原因：**

- `PSEUDONYM_SALT` 環境變數改變
- 瀏覽器快取問題

**解決方法：**

- 確認 `PSEUDONYM_SALT` 一致
- 清除瀏覽器快取後重試

## 📄 授權

本專案遵循 MIT 授權條款。

## 🙏 貢獻

歡迎提交 Issue 或 Pull Request！

---

**注意**：這是示範專案，生產環境使用前請務必：

1. 完整的安全性審查
2. 效能測試與壓力測試
3. 隱私政策與使用條款
4. 定期安全更新
