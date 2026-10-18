# 4-local-demo · 本地 mock 後端（Node，零依賴）

本目錄提供一個**與 GAS 後端語義完全一致**的本地 mock server，方便在沒有 Google 帳號 / 未部署 Apps Script 時直接跑整個系統做演示與驗收。

- 純 Node 內建模組（`http` / `fs` / `path` / `url`），**不需要 `npm install`**。
- API 根路徑：`http://127.0.0.1:8787/api`，行為定義見 `3-docs/05_API契约与数据字典.md`。
- 同時靜態託管 `1-frontend/`，瀏覽器打開 `http://127.0.0.1:8787/` 即進入 `login.html`。
- 資料存**記憶體**（契約第 5 節種子資料），重啟即重置；不寫任何檔案。

---

## 1. 啟動

需要 Node.js（建議 18+，本專案以 Node 24 測試）。

```powershell
# 在 CampusEventSystem 目錄下
node 4-local-demo/server.js

# 或指定其他埠（預設 8787）
$env:PORT=8788; node 4-local-demo/server.js
```

啟動後 console 會印出：

```
  API      ：http://127.0.0.1:8787/api
  前端頁面 ：http://127.0.0.1:8787/
```

瀏覽器打開 <http://127.0.0.1:8787/> 即可（前端 `assets/js/api.js` 在 `localhost/127.0.0.1` 時會自動指向這個 mock server）。

停止：`Ctrl + C`，或關閉該視窗。

## 2. 測試帳號（密碼明文，與契約 5.1 一致）

| UserID | 密碼 | 角色 | 姓名 |
|---|---|---|---|
| U001 | admin123 | Admin | 陳主任 |
| T001 | teacher123 | Teacher | 李老師 |
| T002 | teacher123 | Teacher | 黃老師 |
| S2201 | student123 | Student | 王小明（5A，幹事，美術學會/義工團） |
| S2202 | student123 | Student | 李小花（5B，美術學會） |
| S2203 | student123 | Student | 張大文（4A，體育學會） |
| S2204 | student123 | Student | 陳小美（6A，義工團） |
| S2205 | student123 | Student | 林小強（4B，無學會） |

## 3. 種子資料（契約第 5 節，重啟即重置）

- 8 個帳號、9 個活動（`20260925a` … `20261103a`，全部 `Active`）、10 條報名、4 個紅日。
- **撞期演示**：S2201 已報 `20261020a`，再報同一天的 `20261020b` → `CONFLICT`，帶 `confirm:true` 重送即可成功。
- **候補演示**：`20261021a` 名額 2 已滿（S2201、S2202），S2203 在候補；S2201 取消後 S2203 自動升為 `Confirmed`。
- **資格演示**：`20261022a` 限美術學會；`20261103a` 限 S5/S6；`20261031a` 僅限幹事。

## 4. 測試什麼 / 怎麼測

### 4.1 瀏覽器

1. 開 <http://127.0.0.1:8787/> → 用 `S2201/student123` 登入。
2. 首頁日曆應見到紅日、活動；活動列表演示報名、撞期二次確認、候補。
3. 用 `T001/teacher123` 登入 → 後台可管理活動、看報名名單、點名；統計頁有圖表。
4. 用 `U001/admin123` 登入 → 可改使用者角色。

### 4.2 curl / PowerShell（API 直測）

> Windows PowerShell 的 `curl` 是 `Invoke-WebRequest` 別名，建議直接寫 `curl.exe`。POST body 用 `--data`，`--data-raw` 較穩。

```powershell
# health
curl.exe "http://127.0.0.1:8787/api?action=health"

# login（成功 / 失敗）
curl.exe -X POST "http://127.0.0.1:8787/api" -H "Content-Type: text/plain" --data-raw '{\"action\":\"login\",\"userID\":\"S2201\",\"password\":\"student123\"}'
curl.exe -X POST "http://127.0.0.1:8787/api" -H "Content-Type: text/plain" --data-raw '{\"action\":\"login\",\"userID\":\"S2201\",\"password\":\"wrong\"}'

# 活動列表 / 詳情 / 日曆
curl.exe "http://127.0.0.1:8787/api?action=getEvents&userID=S2201&sort=time"
curl.exe "http://127.0.0.1:8787/api?action=getEvent&eventID=20261020a&userID=S2201"
curl.exe "http://127.0.0.1:8787/api?action=getCalendarData&userID=S2201"

# 報名：撞期 → 確認 → 成功
curl.exe -X POST "http://127.0.0.1:8787/api" -H "Content-Type: text/plain" --data-raw '{\"action\":\"registerEvent\",\"eventID\":\"20261020b\",\"userID\":\"S2201\",\"confirm\":false}'
curl.exe -X POST "http://127.0.0.1:8787/api" -H "Content-Type: text/plain" --data-raw '{\"action\":\"registerEvent\",\"eventID\":\"20261020b\",\"userID\":\"S2201\",\"confirm\":true}'

# 滿額候補 → 取消 → 候補遞補
curl.exe -X POST "http://127.0.0.1:8787/api" -H "Content-Type: text/plain" --data-raw '{\"action\":\"registerEvent\",\"eventID\":\"20261021a\",\"userID\":\"S2204\"}'
curl.exe -X POST "http://127.0.0.1:8787/api" -H "Content-Type: text/plain" --data-raw '{\"action\":\"cancelRegistration\",\"eventID\":\"20261021a\",\"userID\":\"S2201\"}'

# 教師 / 管理員接口
curl.exe "http://127.0.0.1:8787/api?action=getParticipantList&eventID=20261020a&userID=T001"
curl.exe -X POST "http://127.0.0.1:8787/api" -H "Content-Type: text/plain" --data-raw '{\"action\":\"markAttendance\",\"eventID\":\"20261020a\",\"userID\":\"T001\",\"targetUserID\":\"S2201\",\"attended\":\"Yes\"}'
curl.exe "http://127.0.0.1:8787/api?action=getDashboardStats&userID=T001"
curl.exe "http://127.0.0.1:8787/api?action=getUsers&userID=U001"
curl.exe -X POST "http://127.0.0.1:8787/api" -H "Content-Type: text/plain" --data-raw '{\"action\":\"updateUserRole\",\"userID\":\"U001\",\"targetUserID\":\"S2203\",\"role\":\"Teacher\"}'
```

> 也可用 `Invoke-RestMethod`：`Invoke-RestMethod "http://127.0.0.1:8787/api?action=health"`；POST 見 `Invoke-RestMethod -Method Post -ContentType 'text/plain' -Body '{"action":"login",...}'`。
>
> 所有 API 一律回 HTTP 200，以 JSON 的 `success` 欄位判斷成敗；失敗時 `code` 為契約錯誤碼（`AUTH_FAILED` / `CONFLICT` / `NOT_ELIGIBLE` …），`message` 為繁體中文提示。

## 5. 如何重置資料

- **最簡單**：`Ctrl + C` 停掉再 `node 4-local-demo/server.js` —— 記憶體資料重新 seed，回到契約第 5 節初始狀態。
- 測試腳本也可呼叫非契約的輔助接口（僅 mock 有）：`GET /api?action=__reset`，回 `{"success":true,"data":{"reset":true}}`，立即回復種子資料而不用重啟。

## 6. 與 GAS 後端的差異

| 項目 | GAS | 本地 mock |
|---|---|---|
| 資料儲存 | Google 試算表 4 張 Sheet | Node 進程記憶體（重啟重置） |
| 提醒 / 遞補邮件 | `MailApp.sendEmail` | 不發信，只在 console 記錄 |
| 定時觸發器 | `installDailyTrigger()` 每天 08:00 | 無（本機演示不需要） |
| CORS | GAS Web App 自動處理 | 明確回 `Access-Control-Allow-Origin: *` 並處理 `OPTIONS` |
| 其餘 API 語義 | **完全相同**（錯誤碼、業務順序、統計口徑、`EventView` 計算欄位） | 同左 |

## 7. 常見問題

- **埠 8787 被占用**：`netstat -ano | findstr :8787` 找到 PID 後 `taskkill /PID <pid> /F`，或設定 `$env:PORT=8788` 啟動（前端 `api.js` 會跟隨 `localhost` 但固定 8787，故正式演示建議用 8787）。
- **打開 `/` 顯示 404**：代表 `1-frontend/login.html` 尚未建立（前端由另一部分交付）；API 本身可用 `curl` 直測。
- **POST 回 `INVALID_PARAM`**：body 必須是合法 JSON 且包含 `action`；`Content-Type` 用 `text/plain` 或 `application/json` 均可。
