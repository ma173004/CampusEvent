/* =============================================================================
 * CampusEventSystem · 本地 Node mock server（零依赖，仅用 Node 内置模块）
 * -----------------------------------------------------------------------------
 * 作用：
 *   1. 在 http://127.0.0.1:8787/api 上完整实现 3-docs/05_API契约与数据字典.md 的
 *      API 语义（与 GAS 后端逻辑一一对应，错误码/业务顺序完全一致）；
 *   2. 静态托管 1-frontend 目录，直接打开 http://127.0.0.1:8787/ 即可演示；
 *   3. 内存种子数据 = 契约第 5 节；进程退出即重置，无需数据库。
 *
 * 启动：node 4-local-demo/server.js      （端口可用环境变量 PORT 覆盖）
 * 依赖：无（http / fs / path / url 内置模块）
 * 约定：所有 API 一律 HTTP 200，用 JSON 的 success 字段区分成功/失败。
 * =========================================================================== */

'use strict';

var http = require('http');
var fs = require('fs');
var path = require('path');
var urlLib = require('url');

var VERSION = '1.0';
var TZ = 'Asia/Hong_Kong';
var PORT = parseInt(process.env.PORT, 10) || 8787;
var API_PREFIX = '/api';
var FRONTEND_ROOT = path.resolve(__dirname, '..', '1-frontend');
var BODY_LIMIT = 1024 * 1024; // 1MB，防止异常大请求

/* =============================================================================
 * 一、通用工具（对应 GAS 07_Utils.gs）
 * =========================================================================== */

function pad2(n) {
  return (n < 10 ? '0' : '') + n;
}

function pad3(n) {
  var s = String(n);
  while (s.length < 3) s = '0' + s;
  return s;
}

/** 当前时间字符串 'YYYY-MM-DD HH:mm'（固定 Asia/Hong_Kong，与契约一致） */
function nowStr() {
  return formatDateTime(new Date());
}

/** Date -> 'YYYY-MM-DD HH:mm'（Asia/Hong_Kong） */
function formatDateTime(d) {
  var parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(d);
  var map = {};
  parts.forEach(function (p) { map[p.type] = p.value; });
  var hour = map.hour === '24' ? '00' : map.hour;
  return map.year + '-' + map.month + '-' + map.day + ' ' + hour + ':' + map.minute;
}

/** Date -> 'YYYY-MM-DD'（Asia/Hong_Kong） */
function formatDate(d) {
  return formatDateTime(d).substring(0, 10);
}

/** 从日期时间字符串取日期部分 */
function dateOnly(dt) {
  return String(dt || '').substring(0, 10);
}

/** 统一的日期时间合法性校验：'YYYY-MM-DD HH:mm' */
function isValidDateTime(s) {
  if (typeof s !== 'string') return false;
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/);
  if (!m) return false;
  var y = parseInt(m[1], 10), mo = parseInt(m[2], 10), da = parseInt(m[3], 10);
  var hh = parseInt(m[4], 10), mi = parseInt(m[5], 10);
  if (mo < 1 || mo > 12 || da < 1 || da > 31 || hh > 23 || mi > 59) return false;
  var d = new Date(Date.UTC(y, mo - 1, da, hh, mi));
  return d.getUTCFullYear() === y && d.getUTCMonth() === mo - 1 && d.getUTCDate() === da;
}

function isAll(v) {
  return String(v == null ? '' : v).trim().toUpperCase() === 'ALL';
}

/** '美術學會,義工團' / 'S5，S6' -> ['美術學會','義工團'] */
function splitList(v) {
  return String(v == null ? '' : v)
    .split(/[,，]/)
    .map(function (s) { return s.trim(); })
    .filter(function (s) { return s.length > 0; });
}

function toBool(v) {
  return v === true || String(v == null ? '' : v).toUpperCase() === 'TRUE';
}

function toInt(v, def) {
  if (v === undefined || v === null || v === '') return def;
  var n = parseInt(v, 10);
  return isNaN(n) ? def : n;
}

/* =============================================================================
 * 二、种子数据（契约第 5 节，GAS setupDatabase() 与 mock 共用同一份）
 * =========================================================================== */

function createSeedData() {
  var users = [
    { userID: 'U001', name: '陳主任', role: 'Admin', password: 'admin123', email: 'admin@school.edu.hk', class: '', club: '', grade: '', isOfficer: false },
    { userID: 'T001', name: '李老師', role: 'Teacher', password: 'teacher123', email: 't001@school.edu.hk', class: '', club: '美術學會,義工團', grade: '', isOfficer: false },
    { userID: 'T002', name: '黃老師', role: 'Teacher', password: 'teacher123', email: 't002@school.edu.hk', class: '', club: '體育學會', grade: '', isOfficer: false },
    { userID: 'S2201', name: '王小明', role: 'Student', password: 'student123', email: 's2201@school.edu.hk', class: '5A', club: '美術學會,義工團', grade: 'S5', isOfficer: true },
    { userID: 'S2202', name: '李小花', role: 'Student', password: 'student123', email: 's2202@school.edu.hk', class: '5B', club: '美術學會', grade: 'S5', isOfficer: false },
    { userID: 'S2203', name: '張大文', role: 'Student', password: 'student123', email: 's2203@school.edu.hk', class: '4A', club: '體育學會', grade: 'S4', isOfficer: false },
    { userID: 'S2204', name: '陳小美', role: 'Student', password: 'student123', email: 's2204@school.edu.hk', class: '6A', club: '義工團', grade: 'S6', isOfficer: false },
    { userID: 'S2205', name: '林小強', role: 'Student', password: 'student123', email: 's2205@school.edu.hk', class: '4B', club: '無', grade: 'S4', isOfficer: false }
  ];

  var events = [
    seedEvent('20260925a', '中秋節慶祝會', '其他', '禮堂', '2026-09-10 08:00', '2026-09-20 18:00', '2026-09-25 15:00', '2026-09-25 17:00', 'ALL', 'ALL', 'ALL', false, 100, 'T002'),
    seedEvent('20261020a', '旅行日介紹工作坊', '學術', '禮堂', '2026-10-10 08:00', '2026-10-19 18:00', '2026-10-20 09:00', '2026-10-20 12:00', 'ALL', 'ALL', 'ALL', false, 60, 'T001'),
    seedEvent('20261020b', '圖書館導賞', '學術', '圖書館', '2026-10-10 08:00', '2026-10-19 18:00', '2026-10-20 14:00', '2026-10-20 15:30', 'ALL', 'ALL', 'ALL', false, 30, 'T002'),
    seedEvent('20261021a', '園藝工作坊（候補示範）', '其他', '校園花園', '2026-10-10 08:00', '2026-10-20 18:00', '2026-10-21 15:00', '2026-10-21 17:00', 'ALL', 'ALL', 'ALL', false, 2, 'T001'),
    seedEvent('20261022a', '美術學會寫生比賽', '藝術', '校園花園', '2026-10-12 08:00', '2026-10-21 23:59', '2026-10-22 14:00', '2026-10-22 17:00', 'ALL', '美術學會', 'ALL', false, 20, 'T001'),
    seedEvent('20261024a', '義工團老人院探訪', '服務', '安老院（校外）', '2026-10-12 08:00', '2026-10-22 18:00', '2026-10-24 09:00', '2026-10-24 12:00', 'ALL', '義工團', 'ALL', false, 15, 'T001'),
    seedEvent('20261028a', '籃球友誼賽', '體育', '籃球場', '2026-10-15 08:00', '2026-10-26 18:00', '2026-10-28 15:30', '2026-10-28 17:30', 'ALL', '體育學會', 'ALL', false, 30, 'T002'),
    seedEvent('20261031a', '萬聖節派對', '其他', '學生活動中心', '2026-10-15 08:00', '2026-10-29 18:00', '2026-10-31 18:00', '2026-10-31 21:00', 'ALL', 'ALL', 'ALL', true, 30, 'T001'),
    seedEvent('20261103a', '升學講座', '講座', '禮堂', '2026-10-15 08:00', '2026-11-01 18:00', '2026-11-03 14:00', '2026-11-03 16:00', 'ALL', 'ALL', 'S5,S6', false, 200, 'T002')
  ];

  var registrations = [
    seedReg('R20260911090000001', '20260925a', 'S2201', 'Confirmed', 'Yes', '2026-09-11 09:00'),
    seedReg('R20260911090000002', '20260925a', 'S2202', 'Confirmed', 'Yes', '2026-09-11 10:00'),
    seedReg('R20260911090000003', '20260925a', 'S2204', 'Confirmed', 'No', '2026-09-12 09:00'),
    seedReg('R20261011090000004', '20261020a', 'S2201', 'Confirmed', 'No', '2026-10-11 09:00'),
    seedReg('R20261011090000005', '20261020a', 'S2202', 'Confirmed', 'No', '2026-10-11 10:00'),
    seedReg('R20261011090000006', '20261021a', 'S2201', 'Confirmed', 'No', '2026-10-11 11:00'),
    seedReg('R20261011090000007', '20261021a', 'S2202', 'Confirmed', 'No', '2026-10-11 12:00'),
    seedReg('R20261011090000008', '20261021a', 'S2203', 'Waitlist', 'No', '2026-10-11 13:00'),
    seedReg('R20261013090000009', '20261022a', 'S2201', 'Confirmed', 'No', '2026-10-13 09:00'),
    seedReg('R20261016090000010', '20261028a', 'S2203', 'Confirmed', 'No', '2026-10-16 09:00')
  ];

  var holidays = [
    { date: '2026-10-01', name: '國慶日' },
    { date: '2026-10-18', name: '重陽節' },
    { date: '2026-12-25', name: '聖誕節' },
    { date: '2027-01-01', name: '元旦' }
  ];

  return { users: users, events: events, registrations: registrations, holidays: holidays };
}

function seedEvent(eventID, name, category, location, regStart, regEnd, eventStart, eventEnd,
                   eligibleClasses, eligibleClubs, eligibleGrades, requireOfficer, maxQuota, hostID) {
  return {
    eventID: eventID, name: name, category: category, location: location,
    regStart: regStart, regEnd: regEnd, eventStart: eventStart, eventEnd: eventEnd,
    eligibleClasses: eligibleClasses, eligibleClubs: eligibleClubs, eligibleGrades: eligibleGrades,
    requireOfficer: requireOfficer, maxQuota: maxQuota, hostID: hostID,
    description: '', status: 'Active', createdAt: '2026-10-01 09:00'
  };
}

function seedReg(regID, eventID, userID, status, attended, regTime) {
  return { regID: regID, eventID: eventID, userID: userID, status: status, attended: attended, regTime: regTime };
}

/** 内存数据库：进程启动时 seed 一次，重启即重置 */
var DATA = createSeedData();

function resetData() {
  DATA = createSeedData();
}

/* =============================================================================
 * 三、错误与统一响应
 * =========================================================================== */

function ApiError(code, message, data) {
  this.code = code;
  this.message = message;
  this.data = data === undefined ? null : data;
}
ApiError.prototype = Object.create(Error.prototype);
ApiError.prototype.constructor = ApiError;

function fail(code, message, data) {
  throw new ApiError(code, message, data);
}

function ok(data, extra) {
  var res = { success: true, data: data };
  if (extra) {
    Object.keys(extra).forEach(function (k) { res[k] = extra[k]; });
  }
  return res;
}

/* =============================================================================
 * 四、数据读取 / 通用逻辑（对应 GAS 07_Utils.gs + 各业务文件）
 * =========================================================================== */

function getUser(userID) {
  var id = String(userID == null ? '' : userID);
  for (var i = 0; i < DATA.users.length; i++) {
    if (DATA.users[i].userID === id) return DATA.users[i];
  }
  return null;
}

function userPublic(u) {
  return {
    userID: u.userID, name: u.name, role: u.role, email: u.email,
    class: u.class, club: u.club, grade: u.grade, isOfficer: !!u.isOfficer
  };
}

function getEvent(eventID) {
  var id = String(eventID == null ? '' : eventID);
  for (var i = 0; i < DATA.events.length; i++) {
    if (DATA.events[i].eventID === id) return DATA.events[i];
  }
  return null;
}

function getRegistrations() {
  return DATA.registrations;
}

function regsOfEvent(eventID) {
  return DATA.registrations.filter(function (r) { return r.eventID === eventID; });
}

function regsOfUser(userID) {
  return DATA.registrations.filter(function (r) { return r.userID === userID; });
}

function countByStatus(eventID, status) {
  return DATA.registrations.filter(function (r) {
    return r.eventID === eventID && r.status === status;
  }).length;
}

/** 当前用户对该活动的报名状态：Confirmed > Waitlist > Cancelled > null */
function myStatusOf(eventID, userID) {
  if (!userID) return null;
  var rows = DATA.registrations.filter(function (r) {
    return r.eventID === eventID && r.userID === userID;
  });
  if (rows.length === 0) return null;
  var has = function (s) {
    return rows.some(function (r) { return r.status === s; });
  };
  if (has('Confirmed')) return 'Confirmed';
  if (has('Waitlist')) return 'Waitlist';
  if (has('Cancelled')) return 'Cancelled';
  return null;
}

/** 该用户某活动的有效报名（非 Cancelled） */
function activeRegOf(userID, eventID) {
  var rows = DATA.registrations.filter(function (r) {
    return r.eventID === eventID && r.userID === userID && r.status !== 'Cancelled';
  });
  return rows.length > 0 ? rows[0] : null;
}

function sortByRegTime(a, b) {
  if (a.regTime !== b.regTime) return a.regTime < b.regTime ? -1 : 1;
  return a.regID < b.regID ? -1 : (a.regID > b.regID ? 1 : 0);
}

/* ---------------------- 资格校验（契约 3.5 第 2 步） ---------------------- */

function checkEligibility(user, ev) {
  var reasons = [];

  if (!isAll(ev.eligibleClasses)) {
    var classes = splitList(ev.eligibleClasses);
    if (classes.length > 0 && classes.indexOf(user.class) === -1) {
      reasons.push('限 ' + classes.join(','));
    }
  }
  if (!isAll(ev.eligibleClubs)) {
    var clubs = splitList(ev.eligibleClubs);
    var mineClubs = splitList(user.club);
    var hit = false;
    for (var i = 0; i < clubs.length; i++) {
      if (mineClubs.indexOf(clubs[i]) !== -1) { hit = true; break; }
    }
    if (clubs.length > 0 && !hit) {
      reasons.push('限 ' + clubs.join(','));
    }
  }
  if (!isAll(ev.eligibleGrades)) {
    var grades = splitList(ev.eligibleGrades);
    if (grades.length > 0 && grades.indexOf(user.grade) === -1) {
      reasons.push('限 ' + grades.join(','));
    }
  }
  if (toBool(ev.requireOfficer) && !toBool(user.isOfficer)) {
    reasons.push('僅限幹事');
  }

  return { eligible: reasons.length === 0, reason: reasons.join('；') };
}

/* ------------------- 撞期（契约 3.5 第 6 步 / EventView.hasConflict） ------------------- */

function getConflicts(userID, targetEvent) {
  if (!userID || !targetEvent) return [];
  var targetDay = dateOnly(targetEvent.eventStart);
  var out = [];
  var seen = {};

  DATA.registrations.forEach(function (r) {
    if (r.userID !== userID || r.status !== 'Confirmed') return;
    if (r.eventID === targetEvent.eventID) return;
    if (seen[r.eventID]) return;
    var other = getEvent(r.eventID);
    if (!other) return;
    if (other.status === 'Cancelled') return;
    if (dateOnly(other.eventStart) !== targetDay) return;
    seen[r.eventID] = true;
    out.push({
      eventID: other.eventID, name: other.name,
      eventStart: other.eventStart, eventEnd: other.eventEnd
    });
  });

  out.sort(function (a, b) {
    if (a.eventStart !== b.eventStart) return a.eventStart < b.eventStart ? -1 : 1;
    return a.eventID < b.eventID ? -1 : 1;
  });
  return out;
}

/* ------------------------------ EventView ------------------------------ */

function buildEventView(ev, userID) {
  var regs = regsOfEvent(ev.eventID);
  var registeredCount = 0;
  var waitlistCount = 0;
  regs.forEach(function (r) {
    if (r.status === 'Confirmed') registeredCount++;
    else if (r.status === 'Waitlist') waitlistCount++;
  });

  var user = userID ? getUser(userID) : null;
  var elig = user ? checkEligibility(user, ev) : { eligible: true, reason: '' };
  var conflicts = user ? getConflicts(userID, ev) : [];
  var host = getUser(ev.hostID);
  var now = nowStr();
  var remaining = (Number(ev.maxQuota) === 0) ? null : Math.max(0, Number(ev.maxQuota) - registeredCount);

  return {
    eventID: ev.eventID,
    name: ev.name,
    category: ev.category,
    location: ev.location,
    regStart: ev.regStart,
    regEnd: ev.regEnd,
    eventStart: ev.eventStart,
    eventEnd: ev.eventEnd,
    eligibleClasses: ev.eligibleClasses,
    eligibleClubs: ev.eligibleClubs,
    eligibleGrades: ev.eligibleGrades,
    requireOfficer: toBool(ev.requireOfficer),
    maxQuota: Number(ev.maxQuota),
    hostID: ev.hostID,
    hostName: host ? host.name : '',
    description: ev.description || '',
    status: ev.status,
    createdAt: ev.createdAt,
    registeredCount: registeredCount,
    waitlistCount: waitlistCount,
    remaining: remaining,
    myStatus: user ? myStatusOf(ev.eventID, userID) : null,
    isEligible: elig.eligible,
    eligibleReason: elig.reason,
    hasConflict: conflicts.length > 0,
    isFull: remaining === 0,
    isRegOpen: now >= ev.regStart && now <= ev.regEnd
  };
}

/* ------------------------- 权限辅助（契约 3.7/3.8/3.9/3.11/3.12） ------------------------- */

function requireOperator(userID, roles, errMessage) {
  var u = getUser(userID);
  if (!u) fail('NOT_AUTHORIZED', errMessage || '未授權的操作（使用者不存在）');
  if (roles && roles.indexOf(u.role) === -1) {
    fail('NOT_AUTHORIZED', errMessage || '未授權的操作（權限不足）');
  }
  return u;
}

/** Teacher 只能操作 HostID 为自己的活动；Admin 不限 */
function requireHostOrAdmin(operator, ev) {
  if (operator.role === 'Admin') return;
  if (operator.role === 'Teacher' && ev.hostID === operator.userID) return;
  fail('NOT_AUTHORIZED', '未授權的操作（只可管理自己主持的活動）');
}

function requireEvent(eventID) {
  if (!eventID) fail('INVALID_PARAM', '缺少參數：eventID');
  var ev = getEvent(eventID);
  if (!ev) fail('NOT_FOUND', '活動不存在');
  return ev;
}

/* --------------------------- EventID 生成（契约 1.2） --------------------------- */
/* 规则：EventStart 的 yyyymmdd + 小写字母序号：20261020a、20261020b … 26 个用完则 aa、ab … */

function letterSeq(n) {
  var s = '';
  n = n + 1;
  while (n > 0) {
    var r = (n - 1) % 26;
    s = String.fromCharCode(97 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function generateEventID(eventStart) {
  var base = String(eventStart || '').substring(0, 10).replace(/-/g, '');
  var used = {};
  DATA.events.forEach(function (ev) {
    if (ev.eventID.indexOf(base) === 0) {
      var suffix = ev.eventID.substring(base.length);
      if (/^[a-z]+$/.test(suffix)) used[suffix] = true;
    }
  });
  var i = 0;
  while (used[letterSeq(i)]) i++;
  return base + letterSeq(i);
}

/* --------------------------- RegID 生成（契约 1.3） --------------------------- */
/* 'R' + yyyymmddHHmmss + 3 位随机数字 */

function generateRegID() {
  var ts = nowStamp();
  var rand = Math.floor(Math.random() * 1000);
  return 'R' + ts + pad3(rand);
}

/** 当前 'YYYYMMDDHHmmss'（契约 1.3 RegID 用，秒级） */
function nowStamp() {
  var parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).formatToParts(new Date());
  var map = {};
  parts.forEach(function (p) { map[p.type] = p.value; });
  var hour = map.hour === '24' ? '00' : map.hour;
  return map.year + map.month + map.day + hour + map.minute + map.second;
}

function newRegID() {
  var id;
  var guard = 0;
  do {
    id = generateRegID();
    guard++;
  } while (DATA.registrations.some(function (r) { return r.regID === id; }) && guard < 50);
  return id;
}

/* =============================================================================
 * 五、API 实现（契约 3.1 – 3.13）
 * =========================================================================== */

var ACTIONS = {};

/* 3.1 login (POST) */
ACTIONS.login = function (p) {
  var userID = String(p.userID == null ? '' : p.userID).trim();
  var password = String(p.password == null ? '' : p.password);
  if (!userID) fail('INVALID_PARAM', '缺少參數：userID');
  if (!password) fail('INVALID_PARAM', '缺少參數：password');
  var u = getUser(userID);
  if (!u || u.password !== password) fail('AUTH_FAILED', '帳號或密碼錯誤');
  return ok({ user: userPublic(u), now: nowStr() });
};

/* 3.2 getEvents (GET) */
ACTIONS.getEvents = function (p) {
  var userID = p.userID ? String(p.userID) : '';
  var sort = String(p.sort == null ? '' : p.sort).toLowerCase() || 'time';
  var now = nowStr();

  var list = DATA.events.slice();
  if (sort === 'latest') {
    list.sort(function (a, b) {
      if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
      return a.eventID < b.eventID ? 1 : -1;
    });
  } else {
    list.sort(function (a, b) {
      if (a.eventStart !== b.eventStart) return a.eventStart < b.eventStart ? -1 : 1;
      return a.eventID < b.eventID ? -1 : 1;
    });
  }

  var events = list.map(function (ev) { return buildEventView(ev, userID); });
  return ok({ now: now, events: events });
};

/* 3.3 getEvent (GET) */
ACTIONS.getEvent = function (p) {
  var ev = requireEvent(p.eventID);
  return ok({ event: buildEventView(ev, p.userID ? String(p.userID) : '') });
};

/* 3.4 getCalendarData (GET) */
ACTIONS.getCalendarData = function (p) {
  var userID = p.userID ? String(p.userID) : '';

  var holidays = DATA.holidays.slice().sort(function (a, b) {
    return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0);
  }).map(function (h) { return { date: h.date, name: h.name }; });

  var events = DATA.events.slice().sort(function (a, b) {
    if (a.eventStart !== b.eventStart) return a.eventStart < b.eventStart ? -1 : 1;
    return a.eventID < b.eventID ? -1 : 1;
  }).map(function (ev) {
    var type = 'other';
    var mine = userID ? myStatusOf(ev.eventID, userID) : null;
    if (userID && ev.hostID === userID) type = 'host';
    else if (mine === 'Confirmed' || mine === 'Waitlist') type = 'joined';
    return {
      eventID: ev.eventID, name: ev.name, start: ev.eventStart, end: ev.eventEnd,
      location: ev.location, category: ev.category, status: ev.status, type: type
    };
  });

  return ok({ holidays: holidays, events: events });
};

/* 3.5 registerEvent (POST) —— 严格按契约顺序，命中即返回 */
ACTIONS.registerEvent = function (p) {
  var eventID = p.eventID ? String(p.eventID) : '';
  var userID = p.userID ? String(p.userID) : '';
  var confirm = p.confirm === true || String(p.confirm) === 'true';

  if (!eventID) fail('INVALID_PARAM', '缺少參數：eventID');
  if (!userID) fail('INVALID_PARAM', '缺少參數：userID');

  // 1. 活动存在且 Status=Active
  var ev = getEvent(eventID);
  if (!ev || ev.status !== 'Active') fail('NOT_FOUND', '活動不存在或已取消');

  // 用户必须存在（后续资格/写表都需要）
  var user = getUser(userID);
  if (!user) fail('NOT_AUTHORIZED', '未授權的操作（使用者不存在）');

  // 2. 资格校验
  var elig = checkEligibility(user, ev);
  if (!elig.eligible) fail('NOT_ELIGIBLE', '不符合報名資格（' + elig.reason + '）');

  // 3. 已报名且状态非 Cancelled
  if (activeRegOf(userID, eventID)) fail('ALREADY_REGISTERED', '已報名此活動');

  // 4. 报名窗口
  var now = nowStr();
  if (now < ev.regStart) fail('REG_CLOSED', '報名尚未開始');
  if (now > ev.regEnd) fail('REG_CLOSED', '報名已截止');

  // 5. 活动已开始
  if (now > ev.eventStart) fail('EVENT_STARTED', '活動已開始，無法報名');

  // 6. 撞期检查
  var conflicts = getConflicts(userID, ev);
  if (conflicts.length > 0 && confirm !== true) {
    fail('CONFLICT', '與已報名的活動撞期，請確認是否繼續報名', { conflicts: conflicts });
  }

  // 7. 名额：Confirmed 数 < MaxQuota（或 MaxQuota=0）→ Confirmed，否则 Waitlist
  var confirmedCount = countByStatus(eventID, 'Confirmed');
  var maxQuota = Number(ev.maxQuota);
  var status = (maxQuota === 0 || confirmedCount < maxQuota) ? 'Confirmed' : 'Waitlist';

  // 8. 写表（存在 Cancelled 旧记录则复用该行）
  var regTime = now;
  var reg = null;
  var cancelled = DATA.registrations.filter(function (r) {
    return r.eventID === eventID && r.userID === userID && r.status === 'Cancelled';
  })[0];

  if (cancelled) {
    cancelled.status = status;
    cancelled.regTime = regTime;
    cancelled.attended = 'No';
    reg = cancelled;
  } else {
    reg = {
      regID: newRegID(), eventID: eventID, userID: userID,
      status: status, attended: 'No', regTime: regTime
    };
    DATA.registrations.push(reg);
  }

  var data = {
    status: status,
    registration: {
      regID: reg.regID, eventID: reg.eventID, userID: reg.userID,
      status: reg.status, regTime: reg.regTime
    }
  };
  if (status === 'Waitlist') {
    return ok(data, { message: '名額已滿，已加入候補名單' });
  }
  return ok(data);
};

/* 3.6 cancelRegistration (POST) */
ACTIONS.cancelRegistration = function (p) {
  var eventID = p.eventID ? String(p.eventID) : '';
  var userID = p.userID ? String(p.userID) : '';
  if (!eventID) fail('INVALID_PARAM', '缺少參數：eventID');
  if (!userID) fail('INVALID_PARAM', '缺少參數：userID');

  var user = getUser(userID);
  if (!user) fail('NOT_AUTHORIZED', '未授權的操作（使用者不存在）');
  var ev = getEvent(eventID);
  if (!ev) fail('NOT_FOUND', '活動不存在');

  var reg = activeRegOf(userID, eventID);
  if (!reg) fail('NOT_REGISTERED', '未報名此活動');

  var wasConfirmed = reg.status === 'Confirmed';
  reg.status = 'Cancelled';

  var promoted = null;
  if (wasConfirmed) {
    var waitlist = DATA.registrations.filter(function (r) {
      return r.eventID === eventID && r.status === 'Waitlist';
    }).sort(sortByRegTime);

    if (waitlist.length > 0) {
      var w = waitlist[0];
      w.status = 'Confirmed';
      var wu = getUser(w.userID);
      promoted = { userID: w.userID, name: wu ? wu.name : '' };
      // mock server 不發郵件，僅記錄日誌；GAS 端會用 MailApp.sendEmail 通知
      console.log('[cancel->promote] ' + eventID + ' 候補遞補：' + w.userID + ' (' + (wu ? wu.name : '') + ')');
    }
  }

  return ok({ promoted: promoted });
};

/* 3.7 manageEvent (POST) */
ACTIONS.manageEvent = function (p) {
  var operator = requireOperator(p.userID, ['Teacher', 'Admin'], '未授權的操作（只限老師或管理員）');
  var mode = String(p.mode == null ? '' : p.mode).toLowerCase();
  var payload = (p.event && typeof p.event === 'object') ? p.event : {};

  if (['create', 'update', 'cancel'].indexOf(mode) === -1) {
    fail('INVALID_PARAM', 'mode 必須為 create / update / cancel');
  }

  /* ---- cancel ---- */
  if (mode === 'cancel') {
    var eventID = payload.eventID || p.eventID;
    var ev = requireEvent(eventID);
    requireHostOrAdmin(operator, ev);
    ev.status = 'Cancelled';
    return ok({ eventID: ev.eventID });
  }

  /* ---- create / update 共用字段校验 ---- */
  var normalized = validateEventPayload(payload);
  var hostID;

  if (mode === 'create') {
    if (payload.hostID) {
      hostID = String(payload.hostID).trim();
      if (!getUser(hostID)) fail('VALIDATION_ERROR', 'HostID 不存在');
      // 契约 3.7：Admin 可指定主持人；Teacher 只能把自己设为主持人
      if (operator.role !== 'Admin' && hostID !== operator.userID) {
        fail('NOT_AUTHORIZED', '未授權的操作（老師只能將自己設為主持人）');
      }
    } else {
      // HostID 默认 = 操作者
      hostID = operator.userID;
    }
    normalized.hostID = hostID;
    normalized.eventID = generateEventID(normalized.eventStart);
    normalized.status = 'Active';
    normalized.createdAt = nowStr();
    normalized.description = payload.description == null ? '' : String(payload.description);
    DATA.events.push(normalized);
    return ok({ eventID: normalized.eventID });
  }

  /* ---- update ---- */
  var updateID = payload.eventID || p.eventID;
  var old = requireEvent(updateID);
  requireHostOrAdmin(operator, old);

  if (payload.hostID) {
    hostID = String(payload.hostID).trim();
    if (!getUser(hostID)) fail('VALIDATION_ERROR', 'HostID 不存在');
    if (operator.role !== 'Admin' && hostID !== operator.userID) {
      fail('NOT_AUTHORIZED', '未授權的操作（老師只能將自己設為主持人）');
    }
  } else {
    hostID = old.hostID;
  }

  normalized.hostID = hostID;
  normalized.eventID = old.eventID;
  normalized.status = old.status;          // 更新不改变状态（取消用 cancel 模式）
  normalized.createdAt = old.createdAt;
  normalized.description = payload.description == null
    ? (old.description || '')
    : String(payload.description);

  Object.keys(normalized).forEach(function (k) { old[k] = normalized[k]; });
  return ok({ eventID: old.eventID });
};

/** manageEvent 字段校验（契约 3.7） */
function validateEventPayload(payload) {
  function str(v) { return v == null ? '' : String(v).trim(); }

  var name = str(payload.name);
  if (!name) fail('VALIDATION_ERROR', 'Name 必填');
  var location = str(payload.location);
  if (!location) fail('VALIDATION_ERROR', 'Location 必填');

  var regStart = str(payload.regStart);
  if (!regStart) fail('VALIDATION_ERROR', 'RegStart 必填');
  if (!isValidDateTime(regStart)) fail('VALIDATION_ERROR', 'RegStart 格式錯誤（需 YYYY-MM-DD HH:mm）');
  var regEnd = str(payload.regEnd);
  if (!regEnd) fail('VALIDATION_ERROR', 'RegEnd 必填');
  if (!isValidDateTime(regEnd)) fail('VALIDATION_ERROR', 'RegEnd 格式錯誤（需 YYYY-MM-DD HH:mm）');
  var eventStart = str(payload.eventStart);
  if (!eventStart) fail('VALIDATION_ERROR', 'EventStart 必填');
  if (!isValidDateTime(eventStart)) fail('VALIDATION_ERROR', 'EventStart 格式錯誤（需 YYYY-MM-DD HH:mm）');
  var eventEnd = str(payload.eventEnd);
  if (!eventEnd) fail('VALIDATION_ERROR', 'EventEnd 必填');
  if (!isValidDateTime(eventEnd)) fail('VALIDATION_ERROR', 'EventEnd 格式錯誤（需 YYYY-MM-DD HH:mm）');

  if (!(regStart < regEnd)) fail('VALIDATION_ERROR', 'RegEnd 必須晚於 RegStart');
  if (!(regEnd < eventStart)) fail('VALIDATION_ERROR', 'EventStart 必須晚於 RegEnd');
  if (!(eventStart < eventEnd)) fail('VALIDATION_ERROR', 'EventEnd 必須晚於 EventStart');

  var maxQuotaRaw = payload.maxQuota;
  var maxQuota = 0;
  if (maxQuotaRaw !== undefined && maxQuotaRaw !== null && str(maxQuotaRaw) !== '') {
    var s = str(maxQuotaRaw);
    if (!/^\d+$/.test(s)) fail('VALIDATION_ERROR', 'MaxQuota 必須為 ≥0 的整數');
    maxQuota = parseInt(s, 10);
  }

  return {
    name: name,
    category: str(payload.category) || '其他',
    location: location,
    regStart: regStart,
    regEnd: regEnd,
    eventStart: eventStart,
    eventEnd: eventEnd,
    eligibleClasses: str(payload.eligibleClasses) || 'ALL',
    eligibleClubs: str(payload.eligibleClubs) || 'ALL',
    eligibleGrades: str(payload.eligibleGrades) || 'ALL',
    requireOfficer: payload.requireOfficer === true || String(payload.requireOfficer) === 'true' || String(payload.requireOfficer).toUpperCase() === 'TRUE',
    maxQuota: maxQuota,
    description: str(payload.description)
  };
}

/* 3.8 getParticipantList (GET) */
ACTIONS.getParticipantList = function (p) {
  var operator = requireOperator(p.userID, ['Teacher', 'Admin'], '未授權的操作（只限老師或管理員）');
  var ev = requireEvent(p.eventID);
  requireHostOrAdmin(operator, ev);

  function info(r) {
    var u = getUser(r.userID);
    return {
      regID: r.regID, userID: r.userID,
      name: u ? u.name : '', class: u ? u.class : '', grade: u ? u.grade : '',
      regTime: r.regTime
    };
  }

  var confirmed = DATA.registrations.filter(function (r) {
    return r.eventID === ev.eventID && r.status === 'Confirmed';
  }).sort(sortByRegTime).map(function (r) {
    var item = info(r);
    item.attended = r.attended || 'No';
    return item;
  });

  var waitlist = DATA.registrations.filter(function (r) {
    return r.eventID === ev.eventID && r.status === 'Waitlist';
  }).sort(sortByRegTime).map(info);

  return ok({ event: buildEventView(ev, operator.userID), confirmed: confirmed, waitlist: waitlist });
};

/* 3.9 markAttendance (POST) */
ACTIONS.markAttendance = function (p) {
  var operator = requireOperator(p.userID, ['Teacher', 'Admin'], '未授權的操作（只限老師或管理員）');
  var ev = requireEvent(p.eventID);
  requireHostOrAdmin(operator, ev);

  var targetUserID = p.targetUserID ? String(p.targetUserID) : '';
  if (!targetUserID) fail('INVALID_PARAM', '缺少參數：targetUserID');

  var attended = p.attended == null || p.attended === '' ? 'Yes' : String(p.attended);
  if (attended !== 'Yes' && attended !== 'No') {
    fail('VALIDATION_ERROR', 'attended 只能為 Yes 或 No');
  }

  var reg = DATA.registrations.filter(function (r) {
    return r.eventID === ev.eventID && r.userID === targetUserID && r.status === 'Confirmed';
  })[0];
  if (!reg) fail('NOT_REGISTERED', '該用戶未報名此活動（或非 Confirmed）');

  reg.attended = attended;
  return ok({ eventID: ev.eventID, targetUserID: targetUserID, attended: attended });
};

/* 3.10 getDashboardStats (GET) */
ACTIONS.getDashboardStats = function (p) {
  var events = DATA.events;
  var regs = DATA.registrations;

  var confirmed = regs.filter(function (r) { return r.status === 'Confirmed'; });
  var attendedCount = regs.filter(function (r) { return r.status === 'Confirmed' && r.attended === 'Yes'; }).length;

  var totals = {
    events: events.length,
    activeEvents: events.filter(function (e) { return e.status === 'Active'; }).length,
    registrations: regs.length,
    confirmed: confirmed.length,
    attended: attendedCount,
    attendanceRate: confirmed.length > 0 ? Math.round((attendedCount / confirmed.length) * 1000) / 10 : 0,
    users: DATA.users.length,
    students: DATA.users.filter(function (u) { return u.role === 'Student'; }).length
  };

  // byClass：按学生班级统计参与人次（非 Cancelled 报名）
  var classMap = {};
  regs.forEach(function (r) {
    if (r.status === 'Cancelled') return;
    var u = getUser(r.userID);
    if (!u || u.role !== 'Student' || !u.class) return;
    classMap[u.class] = (classMap[u.class] || 0) + 1;
  });
  var byClass = Object.keys(classMap).sort().map(function (c) {
    return { class: c, count: classMap[c] };
  });

  // byCategory：count=活动数，registrations=非 Cancelled 报名数
  var catMap = {};
  events.forEach(function (e) {
    var c = e.category || '其他';
    if (!catMap[c]) catMap[c] = { count: 0, registrations: 0 };
    catMap[c].count++;
  });
  regs.forEach(function (r) {
    if (r.status === 'Cancelled') return;
    var e = getEvent(r.eventID);
    if (!e) return;
    var c = e.category || '其他';
    if (!catMap[c]) catMap[c] = { count: 0, registrations: 0 };
    catMap[c].registrations++;
  });
  var byCategory = Object.keys(catMap).map(function (c) {
    return { category: c, count: catMap[c].count, registrations: catMap[c].registrations };
  }).sort(function (a, b) {
    if (a.count !== b.count) return b.count - a.count;
    return a.category < b.category ? -1 : 1;
  });

  // byEvent
  var byEvent = events.slice().sort(function (a, b) {
    if (a.eventStart !== b.eventStart) return a.eventStart < b.eventStart ? -1 : 1;
    return a.eventID < b.eventID ? -1 : 1;
  }).map(function (e) {
    var er = regsOfEvent(e.eventID);
    return {
      eventID: e.eventID,
      name: e.name,
      confirmed: er.filter(function (r) { return r.status === 'Confirmed'; }).length,
      waitlist: er.filter(function (r) { return r.status === 'Waitlist'; }).length,
      attended: er.filter(function (r) { return r.status === 'Confirmed' && r.attended === 'Yes'; }).length
    };
  });

  return ok({
    totals: totals,
    byClass: byClass,
    byCategory: byCategory,
    byEvent: byEvent
  });
};

/* 3.11 getUsers (GET) —— 仅 Admin */
ACTIONS.getUsers = function (p) {
  requireOperator(p.userID, ['Admin'], '未授權的操作（只限管理員）');
  var users = DATA.users.map(userPublic);
  return ok({ users: users });
};

/* 3.12 updateUserRole (POST) —— 仅 Admin */
ACTIONS.updateUserRole = function (p) {
  requireOperator(p.userID, ['Admin'], '未授權的操作（只限管理員）');

  var targetUserID = p.targetUserID ? String(p.targetUserID) : '';
  if (!targetUserID) fail('INVALID_PARAM', '缺少參數：targetUserID');
  var role = String(p.role == null ? '' : p.role).trim();
  if (['Student', 'Teacher', 'Admin'].indexOf(role) === -1) {
    fail('VALIDATION_ERROR', 'role 必須為 Student / Teacher / Admin');
  }
  var target = getUser(targetUserID);
  if (!target) fail('NOT_FOUND', '使用者不存在');

  target.role = role;
  return ok({ userID: target.userID, role: target.role });
};

/* 3.13 health (GET) */
ACTIONS.health = function () {
  return ok({ ok: true, time: nowStr(), version: VERSION });
};

/* 测试辅助（仅 mock）：重置种子数据，不属于契约 API */
ACTIONS.__reset = function () {
  resetData();
  return ok({ reset: true, now: nowStr() });
};

/* =============================================================================
 * 六、请求分发
 * =========================================================================== */

function dispatch(action, params) {
  if (!action) fail('INVALID_ACTION', '缺少 action 參數');
  var fn = Object.prototype.hasOwnProperty.call(ACTIONS, action) ? ACTIONS[action] : null;
  if (!fn) fail('INVALID_ACTION', '無效的操作：' + action);
  return fn(params || {});
}

function envelopeForError(err) {
  if (err instanceof ApiError) {
    return { success: false, code: err.code, message: err.message, data: err.data };
  }
  console.error('[SERVER_ERROR]', err && err.stack ? err.stack : err);
  return { success: false, code: 'SERVER_ERROR', message: '伺服器錯誤：' + (err && err.message ? err.message : String(err)), data: null };
}

/* --------------------------- 静态文件 MIME --------------------------- */

var MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8'
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Requested-With',
    'Access-Control-Max-Age': '86400'
  };
}

function sendJson(res, obj, status) {
  var body = Buffer.from(JSON.stringify(obj), 'utf8');
  var headers = corsHeaders();
  headers['Content-Type'] = 'application/json; charset=utf-8';
  headers['Content-Length'] = body.length;
  res.writeHead(status || 200, headers);
  res.end(body);
}

function sendText(res, status, text) {
  var body = Buffer.from(String(text), 'utf8');
  var headers = corsHeaders();
  headers['Content-Type'] = 'text/plain; charset=utf-8';
  headers['Content-Length'] = body.length;
  res.writeHead(status, headers);
  res.end(body);
}

/* --------------------------- 读取 POST body --------------------------- */

function readBody(req, callback) {
  var chunks = [];
  var size = 0;
  var done = false;

  req.on('data', function (chunk) {
    if (done) return;
    size += chunk.length;
    if (size > BODY_LIMIT) {
      done = true;
      callback(new Error('請求 body 過大'));
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });
  req.on('end', function () {
    if (done) return;
    done = true;
    callback(null, Buffer.concat(chunks).toString('utf8'));
  });
  req.on('error', function (err) {
    if (done) return;
    done = true;
    callback(err);
  });
}

/** 解析 body（JSON），失败时返回 null */
function parseJsonBody(text) {
  var s = String(text || '').trim();
  if (!s) return null;
  try {
    var obj = JSON.parse(s);
    return (obj && typeof obj === 'object' && !Array.isArray(obj)) ? obj : null;
  } catch (e) {
    return null;
  }
}

/* --------------------------- 静态文件 --------------------------- */

function serveStatic(req, res, pathname) {
  var rel = pathname === '/' ? '/login.html' : pathname;
  var decoded;
  try {
    decoded = decodeURIComponent(rel);
  } catch (e) {
    sendText(res, 400, '400 Bad Request');
    return;
  }

  var filePath = path.resolve(FRONTEND_ROOT, '.' + path.posix.normalize(decoded.split('\\').join('/')));
  var rootWithSep = FRONTEND_ROOT + path.sep;

  // 防目录穿越
  if (filePath !== FRONTEND_ROOT && filePath.indexOf(rootWithSep) !== 0) {
    sendText(res, 403, '403 Forbidden');
    return;
  }

  fs.stat(filePath, function (err, stat) {
    if (err || !stat.isFile()) {
      sendText(res, 404, '404 Not Found：' + decoded + '（前端檔案尚未建立？請確認 1-frontend/ 目錄）');
      return;
    }
    var ext = path.extname(filePath).toLowerCase();
    var type = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': stat.size,
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*'
    });
    if (req.method === 'HEAD') { res.end(); return; }
    var stream = fs.createReadStream(filePath);
    stream.on('error', function () { res.destroy(); });
    stream.pipe(res);
  });
}

/* --------------------------- HTTP server --------------------------- */

var server = http.createServer(function (req, res) {
  var parsed = urlLib.parse(req.url, true);
  var pathname = parsed.pathname || '/';
  var query = parsed.query || {};

  // CORS 预检
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }

  // API 路由：/api 或 /api/
  if (pathname === API_PREFIX || pathname === API_PREFIX + '/') {
    if (req.method === 'POST') {
      readBody(req, function (err, text) {
        if (err) {
          sendJson(res, { success: false, code: 'INVALID_PARAM', message: err.message, data: null });
          return;
        }
        var params = {};
        var k;
        for (k in query) { if (Object.prototype.hasOwnProperty.call(query, k)) params[k] = query[k]; }
        var body = parseJsonBody(text);
        if (body) {
          for (k in body) { if (Object.prototype.hasOwnProperty.call(body, k)) params[k] = body[k]; }
        } else if (String(text || '').trim() && !body) {
          sendJson(res, { success: false, code: 'INVALID_PARAM', message: 'POST body 必須為合法 JSON', data: null });
          return;
        }
        var result;
        try {
          result = dispatch(params.action, params);
        } catch (e) {
          result = envelopeForError(e);
        }
        sendJson(res, result);
      });
      return;
    }

    // GET
    var resultGet;
    try {
      resultGet = dispatch(query.action, query);
    } catch (e) {
      resultGet = envelopeForError(e);
    }
    sendJson(res, resultGet);
    return;
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    serveStatic(req, res, pathname);
    return;
  }

  sendText(res, 405, '405 Method Not Allowed');
});

server.on('error', function (err) {
  if (err && err.code === 'EADDRINUSE') {
    console.error('[錯誤] 連接埠 ' + PORT + ' 已被占用，請先關閉舊的 server 或設定環境變數 PORT。');
    process.exit(1);
  }
  console.error('[錯誤]', err && err.message ? err.message : err);
  process.exit(1);
});

server.listen(PORT, '127.0.0.1', function () {
  console.log('============================================================');
  console.log(' CampusEventSystem · 本地 mock 後端已啟動');
  console.log('   API      ：http://127.0.0.1:' + PORT + API_PREFIX);
  console.log('   前端頁面 ：http://127.0.0.1:' + PORT + '/');
  console.log('   Health   ：http://127.0.0.1:' + PORT + API_PREFIX + '?action=health');
  console.log('   測試帳號 ：U001 / admin123      （管理員）');
  console.log('              T001 / teacher123    （老師·李老師）');
  console.log('              T002 / teacher123    （老師·黃老師）');
  console.log('              S2201~S2205 / student123（學生）');
  console.log('   種子資料 ：8 用戶 / 9 活動 / 10 報名 / 4 紅日（記憶體，重啟即重置）');
  console.log('   停止服務 ：Ctrl + C');
  console.log('============================================================');
});
