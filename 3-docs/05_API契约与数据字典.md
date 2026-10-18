# 05 · API 契约与数据字典（内部开发契约 / Single Source of Truth）

> 本文件是前后端**唯一**契约。任何人（人或 AI）改接口，必须先改本文件。
> 技术栈：原生 HTML/CSS/JS + Bootstrap 5 + FullCalendar 6 + Chart.js 4；后端 Google Apps Script + Google 试算表；另附本地 Node mock server 便于离线演示。

---

## 0. 目录与职责

```
CampusEventSystem/
├── 1-frontend/                 静态前端（可直接丢 GitHub Pages / Live Server）
│   ├── login.html dashboard.html events.html event_detail.html admin.html stats.html
│   └── assets/css/style.css
│       assets/js/api.js        ← Lead 提供：API 封装（全局 API）
│       assets/js/auth.js       ← Lead 提供：登录态 + 导航（全局 CES_AUTH / CES_UI）
│       assets/js/calendar.js   ← 首页日历
│       assets/js/event.js      ← 活动列表 / 详情
│       assets/js/admin.js      ← 后台 + 图表
│       assets/img/logo.png
├── 2-backend/                  01_Code.gs … 07_Utils.gs（贴进 GAS 项目）
├── 3-docs/                     交付文档
└── 4-local-demo/               Node 本地 mock 后端（无依赖，端口 8787）
```

**硬性不变量**
1. 时间统一字符串格式 `YYYY-MM-DD HH:mm`（24 小时制，本机时区 Asia/Hong_Kong，不带时区后缀）。前端 `<input type="datetime-local">` 得到的 `YYYY-MM-DDTHH:mm` 需转成空格格式再提交。
2. 所有 JSON 字段名大小写敏感，按本文件为准。
3. 页面路径为相对路径（如 `events.html`、`assets/css/style.css`），不得写绝对路径。
4. 仅使用 Bootstrap 5.3 与下文列出的 CSS 类；不引入 Vue/React/jQuery。
5. 所有用户可见文案使用**繁体中文**；代码注释可用简体。

---

## 1. 数据字典（Google 试算表 4 张 Sheet）

### 1.1 `Users`
| 列 | 字段 | 说明 |
|---|---|---|
| A | UserID | 主键。学生学号 S2201…，教师工号 T001…，管理员 U001 |
| B | Name | 姓名 |
| C | Role | `Student` / `Teacher` / `Admin`（存英文原值，显示中文） |
| D | Password | 明文（本项目按方案要求不做加密） |
| E | Email | 通知邮箱 |
| F | Class | 班级，如 `5A`；教师留空 |
| G | Club | 学会，逗号分隔，如 `美術學會,義工團` |
| H | Grade | 年级，如 `S5` |
| I | IsOfficer | `TRUE` / `FALSE`（学生干事） |

### 1.2 `Events`
| 列 | 字段 | 说明 |
|---|---|---|
| A | EventID | 主键，规则：`EventStart 的 yyyymmdd` + 小写字母序号，如 `20261020a` |
| B | Name | 活动名 |
| C | Category | 分类：`學術` / `藝術` / `體育` / `服務` / `講座` / `其他`（自由文本） |
| D | Location | 地点 |
| E | RegStart | 报名开始 `YYYY-MM-DD HH:mm` |
| F | RegEnd | 报名截止 |
| G | EventStart | 活动开始 |
| H | EventEnd | 活动结束 |
| I | EligibleClasses | 允许班级，逗号分隔；`ALL` = 不限 |
| J | EligibleClubs | 允许学会，逗号分隔；`ALL` = 不限 |
| K | EligibleGrades | 允许年级，逗号分隔；`ALL` = 不限 |
| L | RequireOfficer | `TRUE` = 仅干事可报 |
| M | MaxQuota | 名额上限，正整数；`0` = 不限 |
| N | HostID | 负责老师 UserID |
| O | Description | 简介 |
| P | Status | `Active` / `Cancelled`（软删除 = Cancelled） |
| Q | CreatedAt | 创建时间 `YYYY-MM-DD HH:mm` |

### 1.3 `Registrations`
| 列 | 字段 | 说明 |
|---|---|---|
| A | RegID | 主键 `R` + 时间戳 + 3 位随机数，如 `R20261018093000123` |
| B | EventID | 关联活动 |
| C | UserID | 关联用户 |
| D | Status | `Confirmed` / `Waitlist` / `Cancelled` |
| E | Attended | `Yes` / `No` |
| F | RegTime | 报名时间 `YYYY-MM-DD HH:mm`（候补先来后到排序依据） |

### 1.4 `Holidays`
| 列 | 字段 | 说明 |
|---|---|---|
| A | Date | `YYYY-MM-DD` |
| B | Name | 假日名称 |

---

## 2. 统一返回格式

后端（GAS）与 mock server 均以 **HTTP 200** 返回，靠 `success` 字段判断。响应头需 `Content-Type: application/json; charset=utf-8`。

```jsonc
// 成功
{ "success": true, "data": { /* 各接口自定义 */ } }

// 失败
{ "success": false, "code": "NOT_ELIGIBLE", "message": "不符合報名資格（限美術學會）", "data": null }
```

错误码：`INVALID_ACTION` `INVALID_PARAM` `AUTH_FAILED` `NOT_AUTHORIZED` `NOT_ELIGIBLE` `ALREADY_REGISTERED` `REG_CLOSED` `EVENT_STARTED` `NOT_FOUND` `CONFLICT` `NOT_REGISTERED` `VALIDATION_ERROR` `SERVER_ERROR`

**请求方式**
- 读接口：`GET {BASE}?action=xxx&其他参数=…`（参数需 URL 编码）
- 写接口：`POST {BASE}`，body 为 JSON 字符串，`Content-Type: text/plain;charset=utf-8`（绕过 GAS 的 CORS 预检），body 内必须含 `action`。
- GAS 的 Web App URL 形如 `https://script.google.com/macros/s/AKfy…/exec`（前端直接用，不做重定向）。
- mock server 地址 `http://127.0.0.1:8787/api`。

---

## 3. API 契约

### 3.1 `login` (POST)
请求 `{"action":"login","userID":"S2201","password":"student123"}`
成功 data：`{"user": {userID,name,role,email,class,club,grade,isOfficer}, "now":"2026-10-18 13:40"}`
失败：`AUTH_FAILED`「帳號或密碼錯誤」。

### 3.2 `getEvents` (GET)
`?action=getEvents&userID=S2201&sort=time`（`sort`: `time`=按活动开始升序，默认；`latest`=按 CreatedAt 降序）
data：`{"now":"…","events":[EventView…]}`，`EventView` = Events 全部字段 + 计算字段：
```jsonc
{
  "eventID":"20261020a","name":"旅行日介紹工作坊","category":"學術","location":"禮堂",
  "regStart":"2026-10-10 08:00","regEnd":"2026-10-19 18:00",
  "eventStart":"2026-10-20 09:00","eventEnd":"2026-10-20 12:00",
  "eligibleClasses":"ALL","eligibleClubs":"ALL","eligibleGrades":"ALL",
  "requireOfficer":false,"maxQuota":60,"hostID":"T001","hostName":"李老師",
  "description":"…","status":"Active","createdAt":"2026-10-01 09:00",
  "registeredCount":3,        // Confirmed 人数
  "waitlistCount":0,          // Waitlist 人数
  "remaining":57,             // maxQuota=0 时为 null（不限）
  "myStatus":"Confirmed",     // null | Confirmed | Waitlist | Cancelled
  "isEligible":true,          // 当前 userID 是否符合资格
  "eligibleReason":"",        // 不符合原因，如「限 S5,S6」「限美術學會」「僅限幹事」
  "hasConflict":false,        // 与当前用户已 Confirmed 的其他活动是否撞期
  "isFull":false,             // remaining===0
  "isRegOpen":true            // 当前时间在报名窗口内
}
```
> 无 userID 时 `myStatus=null`、`isEligible=true`、`hasConflict=false`。

### 3.3 `getEvent` (GET)
`?action=getEvent&eventID=20261020a&userID=S2201` → data `{"event": EventView}`；不存在 → `NOT_FOUND`。

### 3.4 `getCalendarData` (GET)
`?action=getCalendarData&userID=S2201`
data：
```jsonc
{
  "holidays":[{"date":"2026-10-01","name":"國慶日"}],
  "events":[{"eventID":"20261020a","name":"…","start":"2026-10-20 09:00","end":"2026-10-20 12:00","location":"禮堂","category":"學術","status":"Active",
             "type":"host"}]   // host=我主持(老师蓝) joined=我已报名(绿) other=其他(灰)
}
```
`type` 优先级：`host` > `joined` > `other`；`joined` 含 Confirmed 与 Waitlist。

### 3.5 `registerEvent` (POST)
请求 `{"action":"registerEvent","eventID":"20261020a","userID":"S2201","confirm":false}`
逻辑顺序（严格按序，命中即返回）：
1. 活动存在且 `Status=Active`，否则 `NOT_FOUND`。
2. 资格校验：`EligibleClasses/Clubs/Grades`（`ALL` 跳过）、`RequireOfficer` → 不符 `NOT_ELIGIBLE`。
3. 已报名且状态非 Cancelled → `ALREADY_REGISTERED`。
4. 当前时间 < RegStart → `REG_CLOSED`「報名尚未開始」；> RegEnd → `REG_CLOSED`「報名已截止」。
5. 活动已开始（now > EventStart）→ `EVENT_STARTED`。
6. 撞期检查：该用户在同一天（`EventStart` 日期相同）已有 Confirmed 且 EventID 不同的活动，且 `confirm !== true` → `CONFLICT`，`data:{"conflicts":[{"eventID","name","eventStart","eventEnd"}]}`。
7. 名额：`Confirmed` 数 < `MaxQuota`（或 MaxQuota=0）→ `Confirmed`；否则 → `Waitlist`。
8. 写表（若存在该用户该活动的 Cancelled 旧记录，则复用该行更新 Status/RegTime）。
成功 data：`{"status":"Confirmed","registration":{"regID","eventID","userID","status","regTime"}}`（候补时 status=`Waitlist`，message 提示「名額已滿，已加入候補名單」）。

### 3.6 `cancelRegistration` (POST)
请求 `{"action":"cancelRegistration","eventID":"…","userID":"…"}`
逻辑：把自己 Confirmed/Waitlist 记录改 `Cancelled`；若原为 Confirmed，取该活动 Waitlist 中 `RegTime` 最早者改为 `Confirmed` 并（GAS 环境）发邮件通知。
成功 data：`{"promoted":{"userID":"S2203","name":"張大文"} | null}`
未报名 → `NOT_REGISTERED`。

### 3.7 `manageEvent` (POST)
请求：`{"action":"manageEvent","userID":"T001","mode":"create"|"update"|"cancel","event":{…}}`；`cancel` 时只需 `{"eventID":"…"}`。
权限：`Teacher`/`Admin`；Teacher 只能操作 `HostID` 为自己的活动（Admin 不限），否则 `NOT_AUTHORIZED`。
校验（不通过 → `VALIDATION_ERROR`，message 指明字段）：
- Name/Location/EventStart/EventEnd 必填；RegStart<RegEnd<EventStart<EventEnd；MaxQuota 为 ≥0 整数；HostID 默认 = 操作者（Admin 可指定）。
成功 data：`{"eventID":"20261020a"}`（create 时由服务端生成，规则见 1.2）。

### 3.8 `getParticipantList` (GET)
`?action=getParticipantList&eventID=…&userID=T001` → data：
```jsonc
{"event":EventView,
 "confirmed":[{"regID","userID","name","class","grade","regTime","attended"}],
 "waitlist":[{"regID","userID","name","class","grade","regTime"}]}
```
权限同 3.7（Teacher/Admin）。

### 3.9 `markAttendance` (POST)
请求 `{"action":"markAttendance","eventID":"…","userID":"T001","targetUserID":"S2201","attended":"Yes"}`（`attended` 可 `Yes`/`No`，缺省 `Yes`）
成功 data：`{"eventID","targetUserID","attended":"Yes"}`。权限同 3.7；目标无 Confirmed 记录 → `NOT_REGISTERED`。

### 3.10 `getDashboardStats` (GET)
`?action=getDashboardStats&userID=T001` → data：
```jsonc
{"totals":{"events":10,"activeEvents":9,"registrations":24,"confirmed":20,"attended":6,
           "attendanceRate":30.0,"          // attended/confirmed*100，保留1位小数
           "users":8,"students":5},
 "byClass":[{"class":"5A","count":3}],      // 按学生班级统计参与人次
 "byCategory":[{"category":"學術","count":4,"registrations":9}],
 "byEvent":[{"eventID","name","confirmed","waitlist","attended"}]}
```

### 3.11 `getUsers` (GET) —— 仅 Admin
`?action=getUsers&userID=U001` → data `{"users":[{"userID","name","role","email","class","club","grade","isOfficer"}]}`（不返回 Password）。

### 3.12 `updateUserRole` (POST) —— 仅 Admin
`{"action":"updateUserRole","userID":"U001","targetUserID":"S2203","role":"Teacher"}` → data `{"userID":"S2203","role":"Teacher"}`；role 非法 → `VALIDATION_ERROR`。

### 3.13 `health` (GET)
`?action=health` → `{"success":true,"data":{"ok":true,"time":"…","version":"1.0"}}`

### 3.14 邮件（GAS 定时触发器，非 HTTP）
每天 08:00：查当天有活动的 Events（Status=Active），遍历其 Confirmed 且 `Attended != Yes` 的报名者，`MailApp.sendEmail` 发提醒（含活动名/时间/地点）。同时把 `EventEnd` 已过且 `Status=Active` 的活动改为 `Archived`（或保持 Active，二选一实现，注释说明）。另：`setupDatabase()` 一次性函数用于建表 + 写种子数据。

---

## 4. 前端共享层（Lead 提供，勿改）

### 4.1 `assets/js/api.js`
```js
window.API = {
  baseURL,                              // 自动：localhost→http://127.0.0.1:8787/api，否则 GAS_URL；可被 localStorage.ces_api_base 覆盖
  request(action, params, method),      // Promise<data>；失败 reject(Error{code,data,message})
  // 语义封装（全部返回 Promise<data>）：
  health(), login(userID,password),
  getEvents({userID, sort}), getEvent(eventID, userID), getCalendarData(userID),
  registerEvent(eventID, userID, confirm), cancelRegistration(eventID, userID),
  manageEvent(userID, mode, event), getParticipantList(eventID, userID),
  markAttendance(eventID, userID, targetUserID, attended),
  getDashboardStats(userID), getUsers(userID), updateUserRole(userID, targetUserID, role)
};
```
错误用法：`API.registerEvent(...).catch(err => { if (err.code === 'CONFLICT') { err.data.conflicts ... } })`。

### 4.2 `assets/js/auth.js`
```js
window.CES_AUTH = {
  getUser(),                 // 读 localStorage.ces_user，无则 null
  requireLogin(roles),       // 未登录跳 login.html?next=…；角色不符跳 dashboard.html；返回 user
  login(userID, password),   // 调 API.login，写 localStorage.ces_user，返回 user
  logout(),                  // 清 localStorage，跳 login.html
  isRole(...roles)
};
window.CES_UI = {
  renderNav(activePage),     // 注入到 <div id="ces-nav"></div>；activePage: 'dashboard'|'events'|'admin'|'stats'
  toast(message, type),      // type: 'success'|'danger'|'warning'|'info'，Bootstrap toast 右上角
  confirmDialog({title, body, okText, cancelText}),  // Promise<boolean>，Bootstrap modal
  fmtDT(str),                // '2026-10-20 09:00' → '2026/10/20 09:00'
  fmtDate(str), fmtTime(str),
  escapeHtml(str),
  roleLabel(role),           // Student→學生 Teacher→老師 Admin→管理員
  statusBadge(status),       // 返回 <span class="badge-status is-xxx">…</span> HTML
  qs(name),                  // 读 query 参数
  loading(el, on)            // 显示/隐藏加载态
};
```

### 4.3 页面骨架（所有页面统一）
```html
<!DOCTYPE html><html lang="zh-Hant"><head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>… · 校園活動管理系統</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
  <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" rel="stylesheet">
  <link href="assets/css/style.css" rel="stylesheet">
  <!-- 页面需要的 CDN：FullCalendar6 / Chart.js4 -->
</head>
<body data-page="dashboard" class="bg-body-tertiary">
  <div id="ces-nav"></div>
  <main class="ces-page container-xxl">…</main>
  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
  <script src="assets/js/api.js"></script>
  <script src="assets/js/auth.js"></script>
  <script src="assets/js/calendar.js"></script>
</body></html>
```
CDN：
- FullCalendar 6：`https://cdn.jsdelivr.net/npm/fullcalendar@6.1.15/index.global.min.js`（全局 `FullCalendar`），中文 locale：`.../locales-all.global.min.js`，`locale:'zh-tw'`。
- Chart.js 4：`https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js`。

### 4.4 CSS 类（style.css 已实现，直接用）
`ces-page` `ces-hero` `ces-toolbar` `ces-card` `ces-card-title` `ces-grid` `ces-stat-grid` `ces-stat` `ces-stat-value` `ces-stat-label` `ces-empty` `ces-loading` `.table-ces` `.badge-status.is-confirmed/.is-waitlist/.is-cancelled` `.tag` `.tag-soft` `.role-badge.role-student/.role-teacher/.role-admin` `.calendar-legend` `.legend-dot.is-holiday/.is-host/.is-joined` `.btn-ces-primary` `.section-title` `.muted` `.fc-event-host/.fc-event-joined/.fc-day-holiday` `.filter-bar` `.card-cover`。
> 不新增 `<style>` 块；确需微调时用 Bootstrap utilities（mt-3, d-flex…）。

---

## 5. 种子数据（GAS `setupDatabase()` 与 mock server 共用）

### 5.1 账号（密码均为明文）
| UserID | Name | Role | Password | Email | Class | Club | Grade | IsOfficer |
|---|---|---|---|---|---|---|---|---|
| U001 | 陳主任 | Admin | admin123 | admin@school.edu.hk | | | | FALSE |
| T001 | 李老師 | Teacher | teacher123 | t001@school.edu.hk | | 美術學會,義工團 | | FALSE |
| T002 | 黃老師 | Teacher | teacher123 | t002@school.edu.hk | | 體育學會 | | FALSE |
| S2201 | 王小明 | Student | student123 | s2201@school.edu.hk | 5A | 美術學會,義工團 | S5 | TRUE |
| S2202 | 李小花 | Student | student123 | s2202@school.edu.hk | 5B | 美術學會 | S5 | FALSE |
| S2203 | 張大文 | Student | student123 | s2203@school.edu.hk | 4A | 體育學會 | S4 | FALSE |
| S2204 | 陳小美 | Student | student123 | s2204@school.edu.hk | 6A | 義工團 | S6 | FALSE |
| S2205 | 林小強 | Student | student123 | s2205@school.edu.hk | 4B | 無 | S4 | FALSE |

### 5.2 红日
2026-10-01 國慶日；2026-10-18 重陽節；2026-12-25 聖誕節；2027-01-01 元旦。

### 5.3 活动（CreatedAt 均 2026-10-01 09:00，Status=Active）
| EventID | Name | Category | Location | RegStart | RegEnd | EventStart | EventEnd | Classes | Clubs | Grades | Officer | Quota | HostID |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 20260925a | 中秋節慶祝會 | 其他 | 禮堂 | 2026-09-10 08:00 | 2026-09-20 18:00 | 2026-09-25 15:00 | 2026-09-25 17:00 | ALL | ALL | ALL | FALSE | 100 | T002 |
| 20261020a | 旅行日介紹工作坊 | 學術 | 禮堂 | 2026-10-10 08:00 | 2026-10-19 18:00 | 2026-10-20 09:00 | 2026-10-20 12:00 | ALL | ALL | ALL | FALSE | 60 | T001 |
| 20261020b | 圖書館導賞 | 學術 | 圖書館 | 2026-10-10 08:00 | 2026-10-19 18:00 | 2026-10-20 14:00 | 2026-10-20 15:30 | ALL | ALL | ALL | FALSE | 30 | T002 |
| 20261021a | 園藝工作坊（候補示範） | 其他 | 校園花園 | 2026-10-10 08:00 | 2026-10-20 18:00 | 2026-10-21 15:00 | 2026-10-21 17:00 | ALL | ALL | ALL | FALSE | 2 | T001 |
| 20261022a | 美術學會寫生比賽 | 藝術 | 校園花園 | 2026-10-12 08:00 | 2026-10-21 23:59 | 2026-10-22 14:00 | 2026-10-22 17:00 | ALL | 美術學會 | ALL | FALSE | 20 | T001 |
| 20261024a | 義工團老人院探訪 | 服務 | 安老院（校外） | 2026-10-12 08:00 | 2026-10-22 18:00 | 2026-10-24 09:00 | 2026-10-24 12:00 | ALL | 義工團 | ALL | FALSE | 15 | T001 |
| 20261028a | 籃球友誼賽 | 體育 | 籃球場 | 2026-10-15 08:00 | 2026-10-26 18:00 | 2026-10-28 15:30 | 2026-10-28 17:30 | ALL | 體育學會 | ALL | FALSE | 30 | T002 |
| 20261031a | 萬聖節派對 | 其他 | 學生活動中心 | 2026-10-15 08:00 | 2026-10-29 18:00 | 2026-10-31 18:00 | 2026-10-31 21:00 | ALL | ALL | ALL | TRUE | 30 | T001 |
| 20261103a | 升學講座 | 講座 | 禮堂 | 2026-10-15 08:00 | 2026-11-01 18:00 | 2026-11-03 14:00 | 2026-11-03 16:00 | ALL | ALL | S5,S6 | FALSE | 200 | T002 |

### 5.4 报名（RegTime 递增，Attended 用于统计）
| EventID | UserID | Status | Attended | RegTime |
|---|---|---|---|---|
| 20260925a | S2201 | Confirmed | Yes | 2026-09-11 09:00 |
| 20260925a | S2202 | Confirmed | Yes | 2026-09-11 10:00 |
| 20260925a | S2204 | Confirmed | No | 2026-09-12 09:00 |
| 20261020a | S2201 | Confirmed | No | 2026-10-11 09:00 |
| 20261020a | S2202 | Confirmed | No | 2026-10-11 10:00 |
| 20261021a | S2201 | Confirmed | No | 2026-10-11 11:00 |
| 20261021a | S2202 | Confirmed | No | 2026-10-11 12:00 |
| 20261021a | S2203 | Waitlist | No | 2026-10-11 13:00 |
| 20261022a | S2201 | Confirmed | No | 2026-10-13 09:00 |
| 20261028a | S2203 | Confirmed | No | 2026-10-16 09:00 |
> 冲突演示：S2201 已报名 20261020a（09:00-12:00），再报 20261020b（14:00-15:30）应触发 `CONFLICT`。
> 候补演示：20261021a 名额 2 已满，S2203 在 Waitlist；S2201 取消后 S2203 自动升为 Confirmed。

---

## 6. 各页面验收要点（详细需求见 `方案.txt` 与 SBA PPT）

- **login.html**：账号密码 → `CES_AUTH.login` → 跳 `dashboard.html`（或 `?next=`）；错误提示；回车提交；显示测试账号提示卡。
- **dashboard.html**：`requireLogin()`；FullCalendar 月视图（`locale:'zh-tw'`，红日 `fc-day-holiday`、主持蓝、参加绿），下方「即將舉行的活動」列表；点击事件跳 `event_detail.html?id=…`。
- **events.html**：三个 Tab（全部 / 符合資格 / 已參加）+ 搜索 + 排序 + 卡片列表（名称、时间、地点、分类、名额进度、报名状态）+ 快速报名（撞期弹确认）。
- **event_detail.html**：`?id=` 取详情；信息表；报名/取消/候补按钮按状态渲染；撞期二次确认；名额与资格提示；返回列表。
- **admin.html**：`requireLogin(['Teacher','Admin'])`；活动管理（新增/修改/取消，modal 表单 + 前端校验）、报名管理（选活动 → 两表 + 点名）、权限管理（仅 Admin）。
- **stats.html**：`requireLogin(['Teacher','Admin'])`；4 张统计卡 + 饼图（出席/缺席）+ 柱状图（各班级参与人次）+ 活动明细表。

---

## 7. v1.1 變更（必須參加 / 資格選項化 / 點名時序）

> 本節優先於前文；未提及部分維持不變。修改範圍：`2-backend/01~07*.gs`、`4-local-demo/server.js`、`1-frontend/admin.html`、`assets/js/admin.js`、`assets/js/{event,calendar}.js`、`assets/css/style.css`、`3-docs/*`。

### 7.1 `Events` 新增列（追加在 Q 之後，不影響既有 A–Q 欄位）
| 列 | 字段 | 说明 |
|---|---|---|
| R | IsMandatory | `TRUE` = 必須參加（老師點名、自動報名）；`FALSE` = 自願報名。舊資料缺列一律視為 `FALSE`。 |

### 7.2 資格選項白名單（前後端共用，禁止自由輸入）
```js
CLASS_OPTIONS = ['1A','1B','1C','1D','2A','2B','2C','2D','3A','3B','3C','3D',
                 '4A','4B','4C','4D','5A','5B','5C','5D','6A','6B','6C','6D'];
GRADE_OPTIONS = ['S1','S2','S3','S4','S5','S6'];
CLUB_OPTIONS  = ['學生會','美術學會','體育學會','音樂學會','戲劇學會',
                 '義工團','圖書館學會','科學學會','環保學會','攝影學會'];
```
- `EligibleClasses` / `EligibleGrades` / `EligibleClubs` 只接受 `ALL`、空字串（=ALL）或白名單值逗號串。
- `manageEvent` 校驗：含非法值 → `VALIDATION_ERROR`，message 指出非法值（例：「允許班級含無效值：12」）。

### 7.3 EventView 增量
`getEvents`、`getEvent`、`getCalendarData`、`getParticipantList` 回傳的活動物件全部追加：
- `isMandatory: boolean`
- `started: boolean`（`now >= EventStart`）

### 7.4 `manageEvent` 增量
- 請求 `event` 物件追加 `isMandatory: boolean`。
- create/update 保存成功後：若 `isMandatory === true`，為「所有符合資格、且尚無有效報名（非 Cancelled）」的學生自動建立 `Confirmed` 報名（RegTime = 當前時間，Attended = `No`）；成功 data 追加 `"autoEnrolled": <number>`。

### 7.5 `cancelRegistration` 增量
活動 `IsMandatory = TRUE` → 錯誤碼 `MANDATORY_EVENT`，message「必須參加的活動不可取消報名，請聯絡負責老師」。

### 7.6 `markAttendance` 增量
校驗順序：權限 → 活動存在且 Active → **`now < EventStart` → `EVENT_NOT_STARTED`（「活動尚未開始，不能點名」）** → 目標 Confirmed 報名存在。
錯誤碼表追加：`MANDATORY_EVENT`、`EVENT_NOT_STARTED`。

### 7.7 `getDashboardStats` 增量
- `totals` 追加 `startedEvents`（EventStart ≤ now 的 Active 活動數）、`pendingEvents`（未開始數）。
- `totals.attendanceRate` 只統計「已開始活動」的 Confirmed：`attended / confirmedInStartedEvents * 100`，1 位小數，分母 0 → `0`。
- `byEvent[]` 追加 `started: boolean`、`isMandatory: boolean`、`attendanceRate: number|null`（未開始 → `null`）。

### 7.8 種子資料增量
- `20260925a 中秋節慶祝會`：`IsMandatory = TRUE`；補齊全部 5 位學生自動報名（新增 `20260925a S2203 Confirmed No 2026-09-12 10:00`、`20260925a S2205 Confirmed No 2026-09-12 11:00`）。
- 新增第 10 個活動 `20261019a 升旗禮（必須參加示範）`：類別 `其他`、地點 `操場`、RegStart `2026-10-15 08:00`、RegEnd `2026-10-18 18:00`、EventStart `2026-10-19 08:00`、EventEnd `2026-10-19 08:30`、Classes/Clubs/Grades 全 `ALL`、RequireOfficer `FALSE`、MaxQuota `0`、HostID `T001`、IsMandatory `TRUE`、CreatedAt `2026-10-01 09:00`。
- 為 `20261019a` 寫入 5 筆自動報名：`S2201` 09:00、`S2202` 09:01、`S2203` 09:02、`S2204` 09:03、`S2205` 09:04（皆 Confirmed / No，日期 2026-10-16）。
- 其餘 8 個活動 `IsMandatory = FALSE`；活動總數 10 個。
- `setupDatabase()` 寫入 Events 時 R 欄填 `TRUE`/`FALSE`；既有表若缺 R 欄標題則自動補上。

### 7.9 共享 CSS 類（Lead 在 `style.css` 提供，直接使用）
| 類 | 用途 |
|---|---|
| `.badge-mandatory` | 紅色「必須參加」徽章（表格、卡片、詳情頁） |
| `.chip-group` + `.chip-option`（內含 `<input type="checkbox">`） | 後台資格多選（班級/年級/學會） |
| `.fc-event-mandatory` | 日曆「必須參加」事件配色 |
| `.text-pending` | 灰字「活動尚未開始」提示 |
