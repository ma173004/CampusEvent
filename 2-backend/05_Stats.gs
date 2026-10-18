/**
 * =============================================================================
 * 05_Stats.gs · 仪表盘统计
 * -----------------------------------------------------------------------------
 * 契约对应：3.10 getDashboardStats
 * data：{totals, byClass, byCategory, byEvent}
 *
 * 统计口径（与 4-local-demo/server.js 完全一致）：
 *  - totals.events        = Events 表全部行数（含已取消）
 *  - totals.activeEvents  = Status=Active 的活动数
 *  - totals.registrations = Registrations 表全部行数（含 Cancelled）
 *  - totals.confirmed     = Status=Confirmed 的报名数
 *  - totals.attended      = Status=Confirmed 且 Attended=Yes 的人数
 *  - attendanceRate       = attended / confirmed * 100，保留 1 位小数
 *  - byClass              = 按学生班级统计「参与人次」（非 Cancelled 报名数）
 *  - byCategory           = 该分类活动数 count + 该分类非 Cancelled 报名数 registrations
 *  - byEvent              = 每个活动的 confirmed / waitlist / attended 数
 * =============================================================================
 */

function getDashboardStats_(params) {
  var users = readUsers_();
  var events = readEvents_();
  var registrations = readRegistrations_();

  /* ---------------- totals ---------------- */
  var activeEvents = 0;
  for (var i = 0; i < events.length; i++) {
    if (events[i].status === 'Active') activeEvents++;
  }

  var confirmed = 0;
  var attended = 0;
  for (var r = 0; r < registrations.length; r++) {
    var reg = registrations[r];
    if (reg.status === 'Confirmed') {
      confirmed++;
      if (reg.attended === 'Yes') attended++;
    }
  }

  var studentCount = 0;
  for (var u = 0; u < users.length; u++) {
    if (users[u].role === 'Student') studentCount++;
  }

  var attendanceRate = 0;
  if (confirmed > 0) {
    attendanceRate = Math.round((attended / confirmed) * 1000) / 10;
  }

  var totals = {
    events: events.length,
    activeEvents: activeEvents,
    registrations: registrations.length,
    confirmed: confirmed,
    attended: attended,
    attendanceRate: attendanceRate,
    users: users.length,
    students: studentCount
  };

  /* ---------------- byClass ---------------- */
  var classMap = {};
  var classKeys = [];
  for (var c = 0; c < registrations.length; c++) {
    var creg = registrations[c];
    if (creg.status === 'Cancelled') continue;
    var cu = getUser_(users, creg.userID);
    if (!cu || cu.role !== 'Student' || !cu.class) continue;
    if (!classMap[cu.class]) {
      classMap[cu.class] = 0;
      classKeys.push(cu.class);
    }
    classMap[cu.class]++;
  }
  classKeys.sort();
  var byClass = [];
  for (var ck = 0; ck < classKeys.length; ck++) {
    byClass.push({ 'class': classKeys[ck], count: classMap[classKeys[ck]] });
  }

  /* ---------------- byCategory ---------------- */
  var catMap = {};
  var catKeys = [];
  for (var e = 0; e < events.length; e++) {
    var cat = events[e].category || '其他';
    if (!catMap[cat]) {
      catMap[cat] = { count: 0, registrations: 0 };
      catKeys.push(cat);
    }
    catMap[cat].count++;
  }
  for (var cr = 0; cr < registrations.length; cr++) {
    var catReg = registrations[cr];
    if (catReg.status === 'Cancelled') continue;
    var catEvent = getEventById_(events, catReg.eventID);
    if (!catEvent) continue;
    var catName = catEvent.category || '其他';
    if (!catMap[catName]) {
      catMap[catName] = { count: 0, registrations: 0 };
      catKeys.push(catName);
    }
    catMap[catName].registrations++;
  }
  var byCategory = [];
  for (var ck2 = 0; ck2 < catKeys.length; ck2++) {
    byCategory.push({
      category: catKeys[ck2],
      count: catMap[catKeys[ck2]].count,
      registrations: catMap[catKeys[ck2]].registrations
    });
  }
  // count 降序，同 count 按分类名（与 mock server 一致）
  byCategory.sort(function (a, b) {
    if (a.count !== b.count) return b.count - a.count;
    return a.category < b.category ? -1 : 1;
  });

  /* ---------------- byEvent ---------------- */
  events.sort(function (a, b) {
    if (a.eventStart !== b.eventStart) return a.eventStart < b.eventStart ? -1 : 1;
    return a.eventID < b.eventID ? -1 : 1;
  });
  var byEvent = [];
  for (var ev = 0; ev < events.length; ev++) {
    var event = events[ev];
    byEvent.push({
      eventID: event.eventID,
      name: event.name,
      confirmed: countStatus_(registrations, event.eventID, 'Confirmed'),
      waitlist: countStatus_(registrations, event.eventID, 'Waitlist'),
      attended: countAttended_(registrations, event.eventID)
    });
  }

  return okEnvelope_({
    totals: totals,
    byClass: byClass,
    byCategory: byCategory,
    byEvent: byEvent
  });
}

/** 某活动「Confirmed 且 Attended=Yes」人数 */
function countAttended_(registrations, eventID) {
  var n = 0;
  for (var i = 0; i < registrations.length; i++) {
    if (registrations[i].eventID === eventID &&
        registrations[i].status === 'Confirmed' &&
        registrations[i].attended === 'Yes') {
      n++;
    }
  }
  return n;
}
