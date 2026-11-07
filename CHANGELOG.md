# 版本紀錄 CHANGELOG

> 校園活動管理系統 · 馬君霖 ICT SBA
> 這份檔案記錄「每個版本改了什麼、由哪個提交負責、當時測試幾項」。
> 想快速看懂專案，請先讀 [`README.md`](README.md) 與 [`3-docs/09_系统架构说明.md`](3-docs/09_系统架构说明.md)。

---

## 一眼看懂：六個版本

| 版本 | 主題 | 測試 | 對應提交 |
| --- | --- | --- | --- |
| **v1.0** | 從零建站：6 頁前端 + GAS 後端 + 4 張工作表 + 本機示範伺服器 | 26 / 26 | `9df7a23` `7e89e28` `7b6e584` `223405e` `055b537` |
| **v1.1** | 淡藍主題、必須參加活動、資格白名單點選、點名時序、統計口徑 | 45 / 45 | `acf0b34` `29adf3b` |
| **v1.2** | 報名只限學生、資格人數即時預覽、活動表單可滾動、圓餅圖只計已開始活動 | 65 / 65 | `49b77a6` `997119a` |
| **v1.2.1** | 老師視角統計／活動列表、手機後台免橫向滑動、詳情頁資格文案 | — | `1c16fa0` |
| **v1.3** | 署名與全站浮水印、手機月曆活動名稱走馬燈、GitHub 教學文件 | — | `9a94879` |
| **v1.4** | 修正彈窗灰屏（z-index）、報名成功改全寬橫幅、時間以後端為準 | 76 / 76 | `d4bcc4c` `2df4174` |
| **v1.5** | 活動列表多維篩選與雙向排序、點名頁活動篩選與狀態標識 | 91 / 91 | `3bc73f3` `8042c94` |

> 另有 12 個「GitHub 網頁介面」提交（`709c3ad`…`1409dca`），是在瀏覽器上直接改的：新增 `index.html` 自動跳轉、更新 GAS 網址、FullCalendar 中文化、移除登入頁測試帳號提示。

---

## v1.5（最新）— 活動篩選

**功能**
- 活動列表：類別、地點、活動日期（起／迄）四種篩選＋「清除篩選」
- 排序新增：時間（遠→近）、資格（大範圍→小範圍）、資格（小範圍→大範圍）
- 資格「範圍大小」＝覆蓋率近似：班級 n/24、年級 n/6、學會 n/10、僅幹事 ×0.25（同欄 OR、跨欄 AND）
- 點名頁：活動選擇器可依關鍵字（名稱／編號／地點／類別）與狀態（全部／進行中／未進行／已結束）篩選
- 活動選單以 `<optgroup>` 分組、選項加 `【進行中】/【未進行】/【已結束】` 前綴，旁邊有狀態徽章
- 「已結束」的活動仍可點名（補登出席）

**檔案**
- `1-frontend/events.html`、`1-frontend/assets/js/event.js`
- `1-frontend/admin.html`、`1-frontend/assets/js/admin.js`
- `1-frontend/assets/css/style.css`（第 17 節）
- `3-docs/05_API契约与数据字典.md`（第十節）

**注意**：純前端改動，**GAS 不需要重新部署**。

---

## v1.4 — 灰屏修正與報名橫幅

**修正**
- 「新增活動」彈窗整片灰色、點不到：v1.3 把 `.modal` 與 `.modal-backdrop` 都設成 `z-index:1050`，backdrop 又插在 modal 之後 → 蓋住彈窗。改為 navbar 1030 / banner 1045 / backdrop 1050 / modal 1055 / toast 1090。
- 報名成功提示從右上角小 toast 改為**導覽列下方的全寬橫幅**（`CES_UI.banner()`，5.2 秒自動消失、可手動關閉、附「查看我的活動」連結，手機滿版）。
- 月曆「今天」與初始月份改用 **後端回傳的 `now`**（`getCalendarData` 多回傳 `now`），避免瀏覽器時鐘與伺服器不一致。
- 本機示範伺服器支援 `CES_NOW` 固定時間，測試才穩定。

**檔案**：`assets/css/style.css`、`assets/js/auth.js`、`assets/js/calendar.js`、`assets/js/event.js`、`2-backend/03_Events.gs`、`4-local-demo/server.js`、`3-docs/09_系统架构说明.md`、`3-docs/10_系统架构图.html`

**注意**：v1.4 有改後端 → GAS 要**重新部署**（但不用重跑 `setupDatabase()`）。

---

## v1.0 → v1.3 摘要

- **v1.0**：`login/dashboard/events/event_detail/admin/stats` 六頁；`api.js` 統一封裝、`auth.js` 登入與導覽；GAS `doGet/doPost` 單入口 + 7 個 `.gs`；4 張工作表（Users / Events / Registrations / Holidays）；本機 `4-local-demo/server.js` 用同一份契約；GitHub Actions 部署 Pages。
- **v1.1**：淡藍主題（參考麗澤中學官網配色）；`Events` 第 R 欄 `IsMandatory` 與自動報名；資格改白名單點選（班級 24／年級 6／學會 10）；點名鎖到活動開始；出席率只計已開始活動。
- **v1.2**：報名／取消只限學生（`ROLE_NOT_ALLOWED`）；新增 `previewEligibility` 即時顯示「符合條件的學生 N 人」；活動表單可滾動；圓餅圖改用 `totals.attendance`。
- **v1.2.1**：老師看得到統計與活動列表；手機後台免橫向滑動。
- **v1.3**：全站浮水印與署名、手機月曆活動名稱走馬燈。

---

## 怎麼對比「這次改了什麼」

### 方法 1：VSCode（最直覺，推薦給你）

1. `Ctrl + Shift + G` 開 **Source Control**
2. 點任何一個有改動的檔案 → 右邊會出現 **左右並排的紅綠 diff**
3. 想看歷史：檔案上按右鍵 → **Open Timeline**（或檔案總管下方 TIMELINE），可看到每一次改了什麼
4. 想比對任兩個提交：命令面板（`Ctrl+Shift+P`）→ `Git: Compare...`（需要 GitLens 擴充，可選）

### 方法 2：GitHub 網頁

- 單次提交：`Commits` → 點提交（紅＝刪除、綠＝新增）
- 兩個版本之間：`https://github.com/ma173004/CampusEvent/compare/<舊提交>...<新提交>`
  例：`compare/9a94879...main` = v1.3 到最新
- 某個檔案的历史：`Code` → 點檔案 → 右上 **History**

### 方法 3：GitHub Desktop

`History` 分頁 → 左邊點提交 → 右邊看該次所有檔案的紅綠差異。

### 方法 4：命令列（想學 Git 的話）

```powershell
git log --oneline --graph -15            # 提交圖
git show <提交>                          # 某次提交的完整改動
git show <提交> --stat                   # 只看改了哪些檔、幾行
git diff <舊提交> <新提交> -- <路徑>      # 只比某個檔案
git diff origin/main..main               # 本機比雲端多了什麼
git diff --stat origin/main..main        # 上面那行只看統計
```

### 建議先做：把版本打上標籤（Tag）

打了 Tag 之後，比對就變成 `v1.3...v1.5.0`，不用記 SHA：

```powershell
git tag v1.3 9a94879        # 舊版本補標籤
git tag v1.5.0              # 目前 HEAD
git push origin --tags      # 把標籤推上 GitHub
```

之後在 GitHub 的 `Compare` 頁面可以直接選 `v1.3` 和 `v1.5.0`。

---

## 檔案地圖（搞不清楚哪個檔在做什麼時看這裡）

| 路徑 | 職責 |
| --- | --- |
| `1-frontend/*.html` | 六個頁面（含 `index.html` 自動跳轉到登入頁） |
| `1-frontend/assets/js/api.js` | **唯一**呼叫後端的地方（改 GAS 網址只改這裡） |
| `1-frontend/assets/js/auth.js` | 登入狀態、導覽列、toast、**橫幅 banner**、確認框 |
| `1-frontend/assets/js/calendar.js` | 儀表板月曆（紅日／我主持／已報名／必須參加） |
| `1-frontend/assets/js/event.js` | 活動列表（四 Tab＋多維篩選＋排序）、報名／取消、詳情頁 |
| `1-frontend/assets/js/admin.js` | 後台：活動增刪改、資格預覽、點名、統計圖表 |
| `1-frontend/assets/css/style.css` | 全站樣式（主題色、卡片、日曆、橫幅、響應式） |
| `2-backend/01_Code.gs` | GAS 入口：`doGet/doPost` → action 分派 |
| `2-backend/02_Auth.gs` … `07_Utils.gs` | 權限、活動、報名、統計、觸發器、工具與資料表初始化 |
| `4-local-demo/server.js` | 本機示範後端（同一份 API 契約、記憶體種子資料） |
| `3-docs/*` | 資料庫說明、API 契約、測試報告、架構說明／架構圖、GitHub 教學 |
| `.github/workflows/deploy-pages.yml` | push 到 `main` → 自動把 `1-frontend` 部署到 Pages |
