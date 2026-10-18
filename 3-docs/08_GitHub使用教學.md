# 08 GitHub 使用教學（給馬君霖）

> 目標：把這個 ICT SBA 專題放上 GitHub，讓老師／評審可以上網看到你的程式碼與網站，
> 同時你以後改東西也有版本紀錄（改壞了可以還原）。

本文件分三部分：

1. **一次性設定**（做一次，之後不用再做）
2. **每次改完程式碼要做的三步**（add → commit → push）
3. **把網站變成可以上網看的網址**（GitHub Pages）

---

## 0. 名詞先看懂

| 名詞 | 白話解釋 |
| --- | --- |
| Git | 裝在電腦上的版本控制工具，幫你記錄「每次改了什麼」 |
| GitHub | 網站，把 Git 的紀錄（倉庫 repository）放上去給人看、備份 |
| repository（倉庫） | 一個專案的資料夾，含所有檔案與歷史紀錄 |
| commit | 一次「存檔點」，附一句說明（例如：新增候補功能） |
| push | 把本機的 commit 上傳到 GitHub |
| branch | 分支，可以開一條線做實驗，不影響主線 |
| GitHub Pages | GitHub 免費送你一個網址，直接顯示你的靜態網站 |

你電腦上已安裝 Git（本專案建立時用 `git --version` 確認過 2.56），
專案也已經有 **7 次 commit 的完整歷史**，所以不用從零開始，只要接上 GitHub 再推上去。

---

## 1. 一次性設定

### 1.1 註冊 GitHub 帳號

1. 打開 <https://github.com/signup>
2. 用學校或私人 email 註冊，記住 **username**（例如 `majunlam`）與密碼
3. 到 email 收信，點擊驗證連結

### 1.2 設定 Git 的作者身分（只需一次）

在 PowerShell 執行（把名字與 email 換成你自己的）：

```powershell
git config --global user.name "馬君霖"
git config --global user.email "你的email@example.com"
git config --global core.quotepath false      # 讓中文檔名正常顯示
git config --global init.defaultBranch main
```

### 1.3 建立遠端倉庫（在 GitHub 網頁上）

1. 右上角 `+` → **New repository**
2. Repository name：`campus-event-system`
3. 選 **Public**（評審才看得到；你的 `.gitignore` 已排除不需上傳的東西）
4. **不要**勾「Add a README file」「Add .gitignore」「Choose a license」（本機已經有）
5. 按 **Create repository**

完成後你會看到一頁指令，重點是這一行：

```powershell
git remote add origin https://github.com/你的username/campus-event-system.git
```

### 1.4 把本機專案接上遠端並推上去（只需一次）

```powershell
cd C:\Users\ma173\Desktop\ictsba\CampusEventSystem
git remote add origin https://github.com/你的username/campus-event-system.git
git branch -M main          # 確保分支叫 main
git push -u origin main
```

第一次 push 會彈出瀏覽器要你登入 GitHub（或要求 Personal Access Token）：
輸入帳號密碼／授權即可。之後再 push 就不用再登入。

> 之後看成果：<https://github.com/你的username/campus-event-system>
> 應該看到 7 次 commit、README、1-frontend／2-backend／3-docs／4-local-demo。

---

## 2. 每次改完程式碼的三步（最常用！）

```powershell
cd C:\Users\ma173\Desktop\ictsba\CampusEventSystem

git status                 # ① 看哪些檔案改了（紅色 = 還沒記錄）
git add -A                 # ② 把全部改動加入這次存檔
git commit -m "feat: 新增什麼功能"   # ③ 存檔並寫說明
git push                   # ④ 上傳到 GitHub
```

### commit 說明怎麼寫（老師最看這個）

| 前綴 | 用在 | 例子 |
| --- | --- | --- |
| `feat:` | 新功能 | `feat: 新增活動候補自動遞補` |
| `fix:` | 修 bug | `fix: 修正手機版日曆文字被截斷` |
| `docs:` | 只改文件 | `docs: 更新測試報告與截圖` |
| `refactor:` | 改寫程式但不改功能 | `refactor: 抽出共用日期格式化` |
| `style:` | 只改樣式 | `style: 統一按鈕圓角` |

一句話講清楚「改了什麼、為什麼」，不要寫 `update` 或 `123`。

### 想先看看自己改了什麼

```powershell
git diff                       # 尚未 add 的差異
git diff --staged              # 已 add 的差異
git log --oneline -10          # 最近 10 次存檔
git show HEAD                  # 最近一次改了什麼
```

### 不小心改壞了，想還原

```powershell
git restore 檔案路徑              # 丟掉某個檔案未存檔的修改
git restore .                    # 丟掉全部未存檔的修改
git revert HEAD                  # 撤銷最近一次 commit（會產生新的 commit）
git reset --soft HEAD~1          # 取消最近一次 commit，但保留檔案內容
```

---

## 3. 讓網站有公開網址（GitHub Pages）

專案裡已經準備好 `.github/workflows/deploy-pages.yml`：**只要 push 到 `main`，
GitHub 就會自動把 `1-frontend/` 部署成網站**。

### 3.1 第一次啟用

1. 進入 repo → **Settings** → 左邊 **Pages**
2. **Build and deployment → Source** 選 **GitHub Actions**（不是 Deploy from a branch）
3. 回到 **Actions** 分頁，應該看到 `Deploy frontend to GitHub Pages` 正在跑
4. 等它變綠色勾勾，網址會是：

```
https://你的username.github.io/campus-event-system/
```

> 常見狀況：
> - **404**：Actions 還沒跑完，或 Pages 的 Source 沒選 GitHub Actions。
> - **頁面沒樣式**：確認設定在本專案根目錄部署（workflow 已處理，會把 `1-frontend` 當網站根目錄）。

### 3.2 讓線上版本連到你的 Google 試算表

目前 `1-frontend/assets/js/api.js` 裡的 `GAS_API` 是空字串（= 用本機 mock）。
部署好 Apps Script 後，把那一行改成你的 Web App 網址：

```js
var GAS_API = 'https://script.google.com/macros/s/AKfycb..../exec';
```

改完照第 2 節三步驟 commit + push，Pages 會自動重新部署。

---

## 4. 進階但很實用

### 4.1 用分支做實驗（不怕改壞主線）

```powershell
git switch -c feature/candidate     # 開一條新分支
# ...改東西、commit...
git push -u origin feature/candidate
```

之後在 GitHub 網頁按 **Compare & pull request** → **Create pull request**，
可以看到「這條分支跟 main 差在哪」，確認沒問題再 **Merge**。

### 4.2 Issues：把待辦與 bug 記在 GitHub 上

repo → **Issues** → **New issue**，例如：
「手機版統計圖太矮」「新增活動後要自動整理名單」。
每次 commit 可以寫 `fix: ... (closes #3)`，合併後 issue 會自動關閉。

### 4.3 README 就是你的門面

GitHub 會把 `README.md` 直接渲染在專案首頁。
本專案 README 已包含：系統功能、目錄結構、快速開始、測試帳號、部署步驟、實際畫面截圖。
老師點進來 30 秒就能看懂你做什麼。

### 4.4 交作業給老師的三種方式

1. **直接給 repo 網址**：`https://github.com/你的username/campus-event-system`
2. **給 Pages 網址**：`https://你的username.github.io/campus-event-system/`
3. **打包**：repo → **Code** → **Download ZIP**

### 4.5 保護你的作品（本專案已做）

- 全站**浮水印**（畫面與截圖都有 `馬君霖 · ICT SBA`），別人截圖也帶著你的名字
- 頁面標題與導覽列都有署名
- commit 歷史有時間戳，可證明是你逐步完成的
- 若要更嚴謹：GitHub repo 首頁 → **Add file → Create new file** → 命名 `LICENSE`，
  內容可寫「All rights reserved」或選 CC BY-NC 4.0（禁止商業使用）

---

## 5. 常見錯誤對照表

| 訊息／狀況 | 原因 | 解法 |
| --- | --- | --- |
| `remote origin already exists` | 已經加過 remote | `git remote set-url origin 新網址` |
| `Updates were rejected because the remote contains work...` | GitHub 上有你本機沒有的 commit | `git pull --rebase origin main` 再 `git push` |
| `Authentication failed` | 密碼／Token 錯誤 | 用 Personal Access Token 當密碼，或改用 GitHub Desktop |
| `fatal: not a git repository` | 不在專案資料夾 | `cd C:\Users\ma173\Desktop\ictsba\CampusEventSystem` |
| `src refspec main does not match any` | 還沒有 commit 或分支名不同 | `git log` 確認有 commit；`git branch -M main` |
| Pages 網址 404 | Pages 未啟用／Actions 未完成 | Settings → Pages → Source = GitHub Actions，等 Actions 綠燈 |
| 網站樣式全跑掉 | 用相對路徑但部署到子目錄 | 本專案全用相對路徑，請確認部署的是 `1-frontend/` 內容 |

---

## 6. 你的每日檢查清單

```text
□ git status                     看有沒有忘記 commit 的檔案
□ git add -A && git commit -m "..."   存檔並寫清楚
□ git push                       上傳
□ GitHub Actions 綠燈？          網站有沒有更新
□ 改過 api.js 的 GAS_API？        有改就記得 push
```

> 小提醒：`4-local-demo/` 是本機示範用的 Node 伺服器，**不要**上傳 `node_modules`；
> 本專案的 `.gitignore` 已經處理。`_e2e/` 測試腳本放在專案外，不會被推上去。
