/**
 * =============================================================================
 * 07_Utils.gs · 基础设施层
 * -----------------------------------------------------------------------------
 * 职责：
 *   1. 配置（Spreadsheet / 时区 / 版本）与 4 张 Sheet 的读写封装；
 *   2. 统一 JSON 响应、错误对象；
 *   3. 日期/时间工具（统一 Asia/Hong_Kong、'YYYY-MM-DD HH:mm' 字符串比较）；
 *   4. EventID / RegID 生成；
 *   5. setupDatabase()：建 4 张 Sheet 表头 + 写入契约第 5 节全部种子数据（可重复执行）。
 *
 * 编码约定：为兼容 GAS 的 JS 运行时（Rhino 历史版本 / V8），本目录所有 .gs
 * 统一使用 ES5 风格（var / function / 字符串拼接），不使用箭头函数、let/const、
 * 模板字符串、Object.assign、Promise 等。V8 运行时其实支持，但统一 ES5 最稳。
 *
 * 契约来源：3-docs/05_API契约与数据字典.md（唯一真相来源，不得擅自修改）。
 * =============================================================================
 */

/* ============================== 一、配置 ============================== */

var CONFIG = {
  // 绑定方式（二选一）：
  //  A. 用容器绑定脚本（从试算表「扩展程序 > Apps Script」创建）→ 留空即可，
  //     运行时自动使用 SpreadsheetApp.getActiveSpreadsheet()。
  //  B. 独立脚本 → 把试算表 ID 填进来（URL 中 /d/ 与 /edit 之间那一串）。
  SPREADSHEET_ID: '',
  TIMEZONE: 'Asia/Hong_Kong',
  VERSION: '1.0',
  SHEET_USERS: 'Users',
  SHEET_EVENTS: 'Events',
  SHEET_REGISTRATIONS: 'Registrations',
  SHEET_HOLIDAYS: 'Holidays'
};

/** 4 张 Sheet 的列顺序（契约第 1 节，行 1 为表头，顺序不可改） */
var SHEET_HEADERS = {
  Users: ['UserID', 'Name', 'Role', 'Password', 'Email', 'Class', 'Club', 'Grade', 'IsOfficer'],
  Events: ['EventID', 'Name', 'Category', 'Location', 'RegStart', 'RegEnd', 'EventStart',
    'EventEnd', 'EligibleClasses', 'EligibleClubs', 'EligibleGrades', 'RequireOfficer',
    'MaxQuota', 'HostID', 'Description', 'Status', 'CreatedAt'],
  Registrations: ['RegID', 'EventID', 'UserID', 'Status', 'Attended', 'RegTime'],
  Holidays: ['Date', 'Name']
};

/* ============================== 二、Sheet 读写 ============================== */

/** 取试算表对象 */
function getSpreadsheet_() {
  if (CONFIG.SPREADSHEET_ID) {
    return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error('找不到試算表：請在 CONFIG.SPREADSHEET_ID 填入試算表 ID，或改用容器綁定腳本。');
  }
  return ss;
}

/** 取 Sheet；不存在则按契约表头创建 */
function getSheet_(name) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    var headers = SHEET_HEADERS[name];
    if (headers) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
    }
  }
  return sheet;
}

/**
 * 读取整张 Sheet 为对象数组（每行一个对象，_row 为真实行号用于回写）。
 * 单元格统一转成字符串（日期单元格按 CONFIG.TIMEZONE 格式化），布尔/数字保持原始值由上层解释。
 */
function readSheetObjects_(name) {
  var sheet = getSheet_(name);
  var headers = SHEET_HEADERS[name];
  var values = sheet.getDataRange().getValues();
  var out = [];

  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var obj = { _row: i + 1 };
    var empty = true;
    for (var j = 0; j < headers.length; j++) {
      var v = row[j];
      if (v !== '' && v !== null && v !== undefined) empty = false;
      obj[headers[j]] = v;
    }
    if (!empty) out.push(obj);
  }
  return out;
}

/** 追加一行（obj 使用 Sheet 表头字段名） */
function appendSheetObject_(name, obj) {
  var sheet = getSheet_(name);
  var headers = SHEET_HEADERS[name];
  var row = [];
  for (var i = 0; i < headers.length; i++) {
    var v = obj[headers[i]];
    row.push(v === undefined || v === null ? '' : v);
  }
  sheet.appendRow(row);
  return sheet.getLastRow();
}

/** 更新一行（obj 必须含 _row；用 Sheet 表头字段名取值） */
function updateSheetObject_(name, obj) {
  var sheet = getSheet_(name);
  var headers = SHEET_HEADERS[name];
  var row = [];
  for (var i = 0; i < headers.length; i++) {
    var v = obj[headers[i]];
    row.push(v === undefined || v === null ? '' : v);
  }
  sheet.getRange(obj._row, 1, 1, headers.length).setValues([row]);
}

/** 清空 Sheet 数据区（保留表头由 setupDatabase 重写） */
function clearSheet_(name) {
  var sheet = getSheet_(name);
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow > 0 && lastCol > 0) {
    sheet.getRange(1, 1, lastRow, lastCol).clearContent();
  }
}

/* ============================== 三、统一响应 / 错误 ============================== */

/**
 * 构造 ContentService JSON 响应（所有 API 一律 HTTP 200，靠 success 字段判断）。
 * 注意：GAS 的 ContentService 只能指定 MIME，无法自定义 HTTP 头；
 *  - Content-Type 会返回 application/json；
 *  - Web App 部署本身允许跨域 GET（简单请求）；
 *  - 写接口用 POST + Content-Type: text/plain 可绕过 CORS 预检。
 */
function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function okEnvelope_(data, message) {
  var res = { success: true, data: data === undefined ? null : data };
  if (message) res.message = message;
  return res;
}

function errorEnvelope_(code, message, data) {
  return {
    success: false,
    code: code,
    message: message || '請求失敗',
    data: data === undefined ? null : data
  };
}

/** 抛出业务错误；由 01_Code.gs 的 handleRequest_ 统一转成 JSON（ES5 无 class，用属性标记） */
function apiFail_(code, message, data) {
  var err = new Error(message);
  err.cesCode = code;
  err.cesData = (data === undefined ? null : data);
  throw err;
}

/* ============================== 四、日期 / 字符串工具 ============================== */

/** 当前时间 'YYYY-MM-DD HH:mm'（Asia/Hong_Kong） */
function nowString_() {
  return Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm');
}

/** 今天 'YYYY-MM-DD' */
function todayString_() {
  return Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd');
}

/** Date -> 'YYYY-MM-DD HH:mm' */
function formatDateTime_(d) {
  return Utilities.formatDate(d, CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm');
}

/** Date -> 'YYYY-MM-DD' */
function formatDateOnly_(d) {
  return Utilities.formatDate(d, CONFIG.TIMEZONE, 'yyyy-MM-dd');
}

/** 取日期时间字符串的日期部分 */
function dateOnly_(dt) {
  return String(dt === null || dt === undefined ? '' : dt).substring(0, 10);
}

/** 单元格转文本（日期单元格按 HKT 格式化，避免 Sheets 自动转 Date 后读出 [object]） */
function cellText_(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return formatDateTime_(v);
  return String(v).trim();
}

/** 单元格转日期文本 'YYYY-MM-DD' */
function cellDateText_(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return formatDateOnly_(v);
  return String(v).trim();
}

/** 任意单元格转布尔（兼容 true / 'TRUE' / 'true'） */
function cellBool_(v) {
  return v === true || String(v === null || v === undefined ? '' : v).toUpperCase() === 'TRUE';
}

/** 任意单元格转数字（失败返回 def） */
function cellNumber_(v, def) {
  if (v === undefined || v === null || v === '') return def;
  var n = parseInt(v, 10);
  return isNaN(n) ? def : n;
}

/** 'YYYY-MM-DD HH:mm' 合法性校验 */
function isValidDateTime_(s) {
  if (typeof s !== 'string') return false;
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/);
  if (!m) return false;
  var y = parseInt(m[1], 10), mo = parseInt(m[2], 10), da = parseInt(m[3], 10);
  var hh = parseInt(m[4], 10), mi = parseInt(m[5], 10);
  if (mo < 1 || mo > 12 || da < 1 || da > 31 || hh > 23 || mi > 59) return false;
  var d = new Date(Date.UTC(y, mo - 1, da, hh, mi));
  return d.getUTCFullYear() === y && d.getUTCMonth() === mo - 1 && d.getUTCDate() === da;
}

/** 是否 'ALL'（不区分大小写） */
function isAll_(v) {
  return String(v === null || v === undefined ? '' : v).trim().toUpperCase() === 'ALL';
}

/** '美術學會,義工團' / 'S5，S6' -> 去空白数组 */
function splitList_(v) {
  var s = String(v === null || v === undefined ? '' : v);
  var parts = s.split(/[,，]/);
  var out = [];
  for (var i = 0; i < parts.length; i++) {
    var t = parts[i].trim();
    if (t) out.push(t);
  }
  return out;
}

/** 字符串数组是否包含某值 */
function contains_(arr, v) {
  for (var i = 0; i < arr.length; i++) {
    if (arr[i] === v) return true;
  }
  return false;
}

/* ============================== 五、ID 生成（契约 1.2 / 1.3） ============================== */

/** 0->a, 25->z, 26->aa …（EventID 小写字母序号） */
function letterSeq_(n) {
  var s = '';
  n = n + 1;
  while (n > 0) {
    var r = (n - 1) % 26;
    s = String.fromCharCode(97 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** EventID = EventStart 的 yyyymmdd + 未占用的小写字母序号（20261020a、20261020b …） */
function generateEventID_(eventStart, events) {
  var base = String(eventStart || '').substring(0, 10).replace(/-/g, '');
  var used = {};
  var list = events || readEvents_();
  for (var i = 0; i < list.length; i++) {
    var id = list[i].eventID;
    if (id.indexOf(base) === 0) {
      var suffix = id.substring(base.length);
      if (/^[a-z]+$/.test(suffix)) used[suffix] = true;
    }
  }
  var n = 0;
  while (used[letterSeq_(n)]) n++;
  return base + letterSeq_(n);
}

/** 补零 */
function pad2_(n) {
  return (n < 10 ? '0' : '') + n;
}

function pad3_(n) {
  var s = String(n);
  while (s.length < 3) s = '0' + s;
  return s;
}

/** RegID = 'R' + yyyymmddHHmmss + 3 位随机数字（契约 1.3；秒级时间戳共 14 位） */
function generateRegID_(existingIDs) {
  var ts = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyyMMddHHmmss');
  var guard = 0;
  var id;
  do {
    id = 'R' + ts + pad3_(Math.floor(Math.random() * 1000));
    guard++;
  } while (existingIDs && contains_(existingIDs, id) && guard < 50);
  return id;
}

/* ============================== 六、数据映射（Sheet 行 -> 业务对象） ============================== */

function readUsers_() {
  var objs = readSheetObjects_('Users');
  var out = [];
  for (var i = 0; i < objs.length; i++) {
    var o = objs[i];
    out.push({
      _row: o._row,
      userID: cellText_(o.UserID),
      name: cellText_(o.Name),
      role: cellText_(o.Role),
      password: cellText_(o.Password),
      email: cellText_(o.Email),
      class: cellText_(o.Class),
      club: cellText_(o.Club),
      grade: cellText_(o.Grade),
      isOfficer: cellBool_(o.IsOfficer)
    });
  }
  return out;
}

function readEvents_() {
  var objs = readSheetObjects_('Events');
  var out = [];
  for (var i = 0; i < objs.length; i++) {
    var o = objs[i];
    out.push({
      _row: o._row,
      eventID: cellText_(o.EventID),
      name: cellText_(o.Name),
      category: cellText_(o.Category),
      location: cellText_(o.Location),
      regStart: cellText_(o.RegStart),
      regEnd: cellText_(o.RegEnd),
      eventStart: cellText_(o.EventStart),
      eventEnd: cellText_(o.EventEnd),
      eligibleClasses: cellText_(o.EligibleClasses),
      eligibleClubs: cellText_(o.EligibleClubs),
      eligibleGrades: cellText_(o.EligibleGrades),
      requireOfficer: cellBool_(o.RequireOfficer),
      maxQuota: cellNumber_(o.MaxQuota, 0),
      hostID: cellText_(o.HostID),
      description: cellText_(o.Description),
      status: cellText_(o.Status) || 'Active',
      createdAt: cellText_(o.CreatedAt)
    });
  }
  return out;
}

function readRegistrations_() {
  var objs = readSheetObjects_('Registrations');
  var out = [];
  for (var i = 0; i < objs.length; i++) {
    var o = objs[i];
    out.push({
      _row: o._row,
      regID: cellText_(o.RegID),
      eventID: cellText_(o.EventID),
      userID: cellText_(o.UserID),
      status: cellText_(o.Status),
      attended: cellText_(o.Attended) || 'No',
      regTime: cellText_(o.RegTime)
    });
  }
  return out;
}

function readHolidays_() {
  var objs = readSheetObjects_('Holidays');
  var out = [];
  for (var i = 0; i < objs.length; i++) {
    out.push({ _row: objs[i]._row, date: cellDateText_(objs[i].Date), name: cellText_(objs[i].Name) });
  }
  return out;
}

/** 业务对象 -> Sheet 行对象（表头字段名） */
function userRow_(u) {
  return {
    UserID: u.userID, Name: u.name, Role: u.role, Password: u.password, Email: u.email,
    Class: u.class, Club: u.club, Grade: u.grade, IsOfficer: u.isOfficer ? 'TRUE' : 'FALSE'
  };
}

function eventRow_(e) {
  return {
    EventID: e.eventID, Name: e.name, Category: e.category, Location: e.location,
    RegStart: e.regStart, RegEnd: e.regEnd, EventStart: e.eventStart, EventEnd: e.eventEnd,
    EligibleClasses: e.eligibleClasses, EligibleClubs: e.eligibleClubs, EligibleGrades: e.eligibleGrades,
    RequireOfficer: e.requireOfficer ? 'TRUE' : 'FALSE', MaxQuota: e.maxQuota, HostID: e.hostID,
    Description: e.description, Status: e.status, CreatedAt: e.createdAt
  };
}

function registrationRow_(r) {
  return {
    RegID: r.regID, EventID: r.eventID, UserID: r.userID,
    Status: r.status, Attended: r.attended, RegTime: r.regTime
  };
}

function holidayRow_(h) {
  return { Date: h.date, Name: h.name };
}

function saveEventRow_(e) {
  var rowObj = eventRow_(e);
  if (e._row) {
    rowObj._row = e._row;
    updateSheetObject_('Events', rowObj);
  } else {
    e._row = appendSheetObject_('Events', rowObj);
  }
}

function saveRegistrationRow_(r) {
  var rowObj = registrationRow_(r);
  if (r._row) {
    rowObj._row = r._row;
    updateSheetObject_('Registrations', rowObj);
  } else {
    r._row = appendSheetObject_('Registrations', rowObj);
  }
}

/* ============================== 七、查询辅助 ============================== */

function getUser_(users, userID) {
  var id = String(userID === null || userID === undefined ? '' : userID);
  for (var i = 0; i < users.length; i++) {
    if (users[i].userID === id) return users[i];
  }
  return null;
}

function getEventById_(events, eventID) {
  var id = String(eventID === null || eventID === undefined ? '' : eventID);
  for (var i = 0; i < events.length; i++) {
    if (events[i].eventID === id) return events[i];
  }
  return null;
}

function userPublic_(u) {
  return {
    userID: u.userID, name: u.name, role: u.role, email: u.email,
    class: u.class, club: u.club, grade: u.grade, isOfficer: !!u.isOfficer
  };
}

/* ============================== 八、邮件（GAS 定时 / 递补通知） ============================== */

/**
 * 安全发邮件：任何异常只记日志，绝不阻断业务（MailApp 配额/权限问题在评测环境很常见）。
 * @param {string} to 收件人
 * @param {string} subject 主题
 * @param {string} body 纯文本正文
 * @return {boolean} 是否发送成功
 */
function sendMailSafe_(to, subject, body) {
  try {
    if (!to) return false;
    MailApp.sendEmail(to, subject, body);
    return true;
  } catch (err) {
    Logger.log('sendMailSafe_ 發信失敗（已忽略，不影響業務）：' + (err && err.message ? err.message : err));
    return false;
  }
}

/* ============================== 九、setupDatabase() ============================== */

/**
 * 一次性初始化：建 4 张 Sheet + 表头 + 写入契约第 5 节全部种子数据。
 * 可重复执行：每次先清空再重建，保证回到初始状态。
 * 用法：GAS 编辑器选择 setupDatabase → 运行（首次需授权）。
 */
function setupDatabase() {
  var ss = getSpreadsheet_();

  // 1. 建 Sheet（已存在则沿用），写入表头
  var names = ['Users', 'Events', 'Registrations', 'Holidays'];
  for (var i = 0; i < names.length; i++) {
    var sheet = ss.getSheetByName(names[i]);
    if (!sheet) sheet = ss.insertSheet(names[i]);
    clearSheet_(names[i]);
    var headers = SHEET_HEADERS[names[i]];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }

  // 2. 写入种子数据（契约 5.1 – 5.4）
  writeRows_('Users', seedUsers_());
  writeRows_('Events', seedEvents_());
  writeRows_('Registrations', seedRegistrations_());
  writeRows_('Holidays', seedHolidays_());

  Logger.log('setupDatabase 完成：Users=%s, Events=%s, Registrations=%s, Holidays=%s',
    seedUsers_().length, seedEvents_().length, seedRegistrations_().length, seedHolidays_().length);
  return 'setupDatabase OK';
}

/** 批量写数据（从第 2 行开始，rows 为二维数组） */
function writeRows_(sheetName, rows) {
  if (!rows || rows.length === 0) return;
  var sheet = getSheet_(sheetName);
  sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
}

/** 契约 5.1 账号（列序：UserID, Name, Role, Password, Email, Class, Club, Grade, IsOfficer） */
function seedUsers_() {
  return [
    ['U001', '陳主任', 'Admin', 'admin123', 'admin@school.edu.hk', '', '', '', 'FALSE'],
    ['T001', '李老師', 'Teacher', 'teacher123', 't001@school.edu.hk', '', '美術學會,義工團', '', 'FALSE'],
    ['T002', '黃老師', 'Teacher', 'teacher123', 't002@school.edu.hk', '', '體育學會', '', 'FALSE'],
    ['S2201', '王小明', 'Student', 'student123', 's2201@school.edu.hk', '5A', '美術學會,義工團', 'S5', 'TRUE'],
    ['S2202', '李小花', 'Student', 'student123', 's2202@school.edu.hk', '5B', '美術學會', 'S5', 'FALSE'],
    ['S2203', '張大文', 'Student', 'student123', 's2203@school.edu.hk', '4A', '體育學會', 'S4', 'FALSE'],
    ['S2204', '陳小美', 'Student', 'student123', 's2204@school.edu.hk', '6A', '義工團', 'S6', 'FALSE'],
    ['S2205', '林小強', 'Student', 'student123', 's2205@school.edu.hk', '4B', '無', 'S4', 'FALSE']
  ];
}

/** 契约 5.3 活动（CreatedAt 均 2026-10-01 09:00、Status=Active，Description 契约未给定故留空） */
function seedEvents_() {
  return [
    ['20260925a', '中秋節慶祝會', '其他', '禮堂', '2026-09-10 08:00', '2026-09-20 18:00', '2026-09-25 15:00', '2026-09-25 17:00', 'ALL', 'ALL', 'ALL', 'FALSE', 100, 'T002', '', 'Active', '2026-10-01 09:00'],
    ['20261020a', '旅行日介紹工作坊', '學術', '禮堂', '2026-10-10 08:00', '2026-10-19 18:00', '2026-10-20 09:00', '2026-10-20 12:00', 'ALL', 'ALL', 'ALL', 'FALSE', 60, 'T001', '', 'Active', '2026-10-01 09:00'],
    ['20261020b', '圖書館導賞', '學術', '圖書館', '2026-10-10 08:00', '2026-10-19 18:00', '2026-10-20 14:00', '2026-10-20 15:30', 'ALL', 'ALL', 'ALL', 'FALSE', 30, 'T002', '', 'Active', '2026-10-01 09:00'],
    ['20261021a', '園藝工作坊（候補示範）', '其他', '校園花園', '2026-10-10 08:00', '2026-10-20 18:00', '2026-10-21 15:00', '2026-10-21 17:00', 'ALL', 'ALL', 'ALL', 'FALSE', 2, 'T001', '', 'Active', '2026-10-01 09:00'],
    ['20261022a', '美術學會寫生比賽', '藝術', '校園花園', '2026-10-12 08:00', '2026-10-21 23:59', '2026-10-22 14:00', '2026-10-22 17:00', 'ALL', '美術學會', 'ALL', 'FALSE', 20, 'T001', '', 'Active', '2026-10-01 09:00'],
    ['20261024a', '義工團老人院探訪', '服務', '安老院（校外）', '2026-10-12 08:00', '2026-10-22 18:00', '2026-10-24 09:00', '2026-10-24 12:00', 'ALL', '義工團', 'ALL', 'FALSE', 15, 'T001', '', 'Active', '2026-10-01 09:00'],
    ['20261028a', '籃球友誼賽', '體育', '籃球場', '2026-10-15 08:00', '2026-10-26 18:00', '2026-10-28 15:30', '2026-10-28 17:30', 'ALL', '體育學會', 'ALL', 'FALSE', 30, 'T002', '', 'Active', '2026-10-01 09:00'],
    ['20261031a', '萬聖節派對', '其他', '學生活動中心', '2026-10-15 08:00', '2026-10-29 18:00', '2026-10-31 18:00', '2026-10-31 21:00', 'ALL', 'ALL', 'ALL', 'TRUE', 30, 'T001', '', 'Active', '2026-10-01 09:00'],
    ['20261103a', '升學講座', '講座', '禮堂', '2026-10-15 08:00', '2026-11-01 18:00', '2026-11-03 14:00', '2026-11-03 16:00', 'ALL', 'ALL', 'S5,S6', 'FALSE', 200, 'T002', '', 'Active', '2026-10-01 09:00']
  ];
}

/** 契约 5.4 报名（列序：RegID, EventID, UserID, Status, Attended, RegTime） */
function seedRegistrations_() {
  return [
    ['R20260911090000001', '20260925a', 'S2201', 'Confirmed', 'Yes', '2026-09-11 09:00'],
    ['R20260911090000002', '20260925a', 'S2202', 'Confirmed', 'Yes', '2026-09-11 10:00'],
    ['R20260911090000003', '20260925a', 'S2204', 'Confirmed', 'No', '2026-09-12 09:00'],
    ['R20261011090000004', '20261020a', 'S2201', 'Confirmed', 'No', '2026-10-11 09:00'],
    ['R20261011090000005', '20261020a', 'S2202', 'Confirmed', 'No', '2026-10-11 10:00'],
    ['R20261011090000006', '20261021a', 'S2201', 'Confirmed', 'No', '2026-10-11 11:00'],
    ['R20261011090000007', '20261021a', 'S2202', 'Confirmed', 'No', '2026-10-11 12:00'],
    ['R20261011090000008', '20261021a', 'S2203', 'Waitlist', 'No', '2026-10-11 13:00'],
    ['R20261013090000009', '20261022a', 'S2201', 'Confirmed', 'No', '2026-10-13 09:00'],
    ['R20261016090000010', '20261028a', 'S2203', 'Confirmed', 'No', '2026-10-16 09:00']
  ];
}

/** 契约 5.2 红日 */
function seedHolidays_() {
  return [
    ['2026-10-01', '國慶日'],
    ['2026-10-18', '重陽節'],
    ['2026-12-25', '聖誕節'],
    ['2027-01-01', '元旦']
  ];
}
