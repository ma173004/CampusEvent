/**
 * =============================================================================
 * 03_Events.gs · 活动查询与管理
 * -----------------------------------------------------------------------------
 * 契约对应：3.2 getEvents / 3.3 getEvent / 3.4 getCalendarData / 3.7 manageEvent
 *           以及共享的 EventView 组装、资格校验、撞期检测、EventID 生成。
 * =============================================================================
 */

/* ============================== 3.2 getEvents (GET) ============================== */

/**
 * 请求：?action=getEvents&userID=S2201&sort=time
 *   sort = time（默认，EventStart 升序）/ latest（CreatedAt 降序）
 * data：{now, events:[EventView]}
 */
function getEvents_(params) {
  var userID = trimParam_(params, 'userID');
  var sort = trimParam_(params, 'sort').toLowerCase() || 'time';

  var users = readUsers_();
  var events = readEvents_();
  var registrations = readRegistrations_();
  var now = nowString_();

  events.sort(function (a, b) {
    if (sort === 'latest') {
      if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
      return a.eventID < b.eventID ? 1 : -1;
    }
    if (a.eventStart !== b.eventStart) return a.eventStart < b.eventStart ? -1 : 1;
    return a.eventID < b.eventID ? -1 : 1;
  });

  var list = [];
  for (var i = 0; i < events.length; i++) {
    list.push(buildEventView_(events[i], userID, users, events, registrations, now));
  }

  return okEnvelope_({ now: now, events: list });
}

/* ============================== 3.3 getEvent (GET) ============================== */

/**
 * 请求：?action=getEvent&eventID=20261020a&userID=S2201
 * data：{event: EventView}；不存在 → NOT_FOUND
 */
function getEvent_(params) {
  var eventID = trimParam_(params, 'eventID');
  if (!eventID) apiFail_('INVALID_PARAM', '缺少參數：eventID');

  var userID = trimParam_(params, 'userID');
  var users = readUsers_();
  var events = readEvents_();
  var registrations = readRegistrations_();
  var event = getEventById_(events, eventID);
  if (!event) apiFail_('NOT_FOUND', '活動不存在');

  return okEnvelope_({
    event: buildEventView_(event, userID, users, events, registrations, nowString_())
  });
}

/* ============================== 3.4 getCalendarData (GET) ============================== */

/**
 * 请求：?action=getCalendarData&userID=S2201
 * data：{holidays:[{date,name}], events:[{eventID,name,start,end,location,category,status,type}]}
 * type 优先级：host（我主持）> joined（已报名，含 Confirmed/Waitlist）> other
 */
function getCalendarData_(params) {
  var userID = trimParam_(params, 'userID');
  var users = readUsers_();
  var events = readEvents_();
  var registrations = readRegistrations_();
  var holidays = readHolidays_();
  var now = nowString_();

  holidays.sort(function (a, b) {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return 0;
  });

  var holidayList = [];
  for (var h = 0; h < holidays.length; h++) {
    holidayList.push({ date: holidays[h].date, name: holidays[h].name });
  }

  events.sort(function (a, b) {
    if (a.eventStart !== b.eventStart) return a.eventStart < b.eventStart ? -1 : 1;
    return a.eventID < b.eventID ? -1 : 1;
  });

  var eventList = [];
  for (var i = 0; i < events.length; i++) {
    var ev = events[i];
    var type = 'other';
    var mine = userID ? myStatusOf_(registrations, ev.eventID, userID) : null;
    if (userID && ev.hostID === userID) {
      type = 'host';
    } else if (mine === 'Confirmed' || mine === 'Waitlist') {
      type = 'joined';
    }
    eventList.push({
      eventID: ev.eventID,
      name: ev.name,
      start: ev.eventStart,
      end: ev.eventEnd,
      location: ev.location,
      category: ev.category,
      status: ev.status,
      // 契约 7.3：日历事件同样带 isMandatory / started
      isMandatory: !!ev.isMandatory,
      started: now >= ev.eventStart,
      type: type
    });
  }

  return okEnvelope_({ holidays: holidayList, events: eventList });
}

/* ============================== 3.7 manageEvent (POST) ============================== */

/**
 * 请求：{"action":"manageEvent","userID":"T001","mode":"create"|"update"|"cancel","event":{…}}
 * cancel 时只需 event 中带 eventID。
 * 权限：Teacher/Admin；Teacher 只能操作 HostID 为自己的活动。
 * 成功：data = { eventID }（create 由服务端生成 EventID）
 */
function manageEvent_(params) {
  var operator = requireOperator_(params.userID, ['Teacher', 'Admin'],
    '未授權的操作（只限老師或管理員）');

  var mode = trimParam_(params, 'mode').toLowerCase();
  var payload = (params.event && typeof params.event === 'object') ? params.event : {};

  if (mode === 'create' || mode === 'update' || mode === 'cancel') {
    // ok
  } else {
    apiFail_('INVALID_PARAM', 'mode 必須為 create / update / cancel');
  }

  var users = readUsers_();
  var events = readEvents_();

  /* ---------- cancel：软删除（Status=Cancelled） ---------- */
  if (mode === 'cancel') {
    var cancelID = payload.eventID ? String(payload.eventID) : trimParam_(params, 'eventID');
    if (!cancelID) apiFail_('INVALID_PARAM', '缺少參數：eventID');
    var cancelEvent = getEventById_(events, cancelID);
    if (!cancelEvent) apiFail_('NOT_FOUND', '活動不存在');
    requireHostOrAdmin_(operator, cancelEvent);

    cancelEvent.status = 'Cancelled';
    saveEventRow_(cancelEvent);
    return okEnvelope_({ eventID: cancelEvent.eventID });
  }

  /* ---------- create / update 共用的字段校验 ---------- */
  var normalized = validateEventPayload_(payload);
  var hostID;

  /* ---------- create ---------- */
  if (mode === 'create') {
    if (payload.hostID) {
      hostID = String(payload.hostID).trim();
      if (!getUser_(users, hostID)) apiFail_('VALIDATION_ERROR', 'HostID 不存在');
      // 契约 3.7：Admin 可指定主持人；Teacher 只能把自己设为主持人
      if (operator.role !== 'Admin' && hostID !== operator.userID) {
        apiFail_('NOT_AUTHORIZED', '未授權的操作（老師只能將自己設為主持人）');
      }
    } else {
      // HostID 默认 = 操作者
      hostID = operator.userID;
    }

    var newEvent = {
      _row: 0,
      eventID: generateEventID_(normalized.eventStart, events),
      name: normalized.name,
      category: normalized.category,
      location: normalized.location,
      regStart: normalized.regStart,
      regEnd: normalized.regEnd,
      eventStart: normalized.eventStart,
      eventEnd: normalized.eventEnd,
      eligibleClasses: normalized.eligibleClasses,
      eligibleClubs: normalized.eligibleClubs,
      eligibleGrades: normalized.eligibleGrades,
      requireOfficer: normalized.requireOfficer,
      maxQuota: normalized.maxQuota,
      hostID: hostID,
      description: normalized.description,
      status: 'Active',
      createdAt: nowString_(),
      isMandatory: normalized.isMandatory
    };
    saveEventRow_(newEvent);

    // 契约 7.4：必须参加的活动 → 为所有符合资格且尚无有效报名的学生自动建 Confirmed 报名
    var autoEnrolled = 0;
    if (newEvent.isMandatory) {
      autoEnrolled = autoEnrollMandatory_(newEvent, users, readRegistrations_());
    }
    return okEnvelope_({ eventID: newEvent.eventID, autoEnrolled: autoEnrolled });
  }

  /* ---------- update ---------- */
  var updateID = payload.eventID ? String(payload.eventID) : trimParam_(params, 'eventID');
  if (!updateID) apiFail_('INVALID_PARAM', '缺少參數：eventID');
  var oldEvent = getEventById_(events, updateID);
  if (!oldEvent) apiFail_('NOT_FOUND', '活動不存在');
  requireHostOrAdmin_(operator, oldEvent);

  if (payload.hostID) {
    hostID = String(payload.hostID).trim();
    if (!getUser_(users, hostID)) apiFail_('VALIDATION_ERROR', 'HostID 不存在');
    if (operator.role !== 'Admin' && hostID !== operator.userID) {
      apiFail_('NOT_AUTHORIZED', '未授權的操作（老師只能將自己設為主持人）');
    }
  } else {
    hostID = oldEvent.hostID;
  }

  oldEvent.name = normalized.name;
  oldEvent.category = normalized.category;
  oldEvent.location = normalized.location;
  oldEvent.regStart = normalized.regStart;
  oldEvent.regEnd = normalized.regEnd;
  oldEvent.eventStart = normalized.eventStart;
  oldEvent.eventEnd = normalized.eventEnd;
  oldEvent.eligibleClasses = normalized.eligibleClasses;
  oldEvent.eligibleClubs = normalized.eligibleClubs;
  oldEvent.eligibleGrades = normalized.eligibleGrades;
  oldEvent.requireOfficer = normalized.requireOfficer;
  oldEvent.maxQuota = normalized.maxQuota;
  oldEvent.hostID = hostID;
  if (payload.description !== undefined && payload.description !== null) {
    oldEvent.description = String(payload.description);
  }
  // v1.1：必须参加属性（契约 7.4）
  oldEvent.isMandatory = normalized.isMandatory;
  // 更新不改变 Status / CreatedAt / EventID（取消请用 mode=cancel）
  saveEventRow_(oldEvent);

  // 契约 7.4：更新为必须参加时也补齐自动报名（已报名的不会重复）
  var autoEnrolled = 0;
  if (oldEvent.isMandatory) {
    autoEnrolled = autoEnrollMandatory_(oldEvent, users, readRegistrations_());
  }
  return okEnvelope_({ eventID: oldEvent.eventID, autoEnrolled: autoEnrolled });
}

/**
 * 契约 7.4：为「必须参加」的活动自动报名。
 * 条件：role === 'Student'、符合资格、尚无有效报名（非 Cancelled）。
 * 已存在 Cancelled 旧记录时复用该行，否则新增；RegTime = 当前时间、Attended = No。
 * @param {Object} event 活动对象
 * @param {Array} users 用户表
 * @param {Array} registrations 报名表（会被就地追加）
 * @return {number} 新建/复用的报名数
 */
function autoEnrollMandatory_(event, users, registrations) {
  var now = nowString_();
  var existingIDs = [];
  for (var i = 0; i < registrations.length; i++) existingIDs.push(registrations[i].regID);

  var count = 0;
  for (var u = 0; u < users.length; u++) {
    var user = users[u];
    if (user.role !== 'Student') continue;
    var eligibility = checkEligibility_(user, event);
    if (!eligibility.eligible) continue;
    if (activeRegOf_(registrations, user.userID, event.eventID)) continue;

    var target = null;
    for (var r = 0; r < registrations.length; r++) {
      var reg = registrations[r];
      if (reg.eventID === event.eventID && reg.userID === user.userID && reg.status === 'Cancelled') {
        target = reg;
        break;
      }
    }

    if (target) {
      target.status = 'Confirmed';
      target.attended = 'No';
      target.regTime = now;
      saveRegistrationRow_(target);
    } else {
      target = {
        _row: 0,
        regID: generateRegID_(existingIDs),
        eventID: event.eventID,
        userID: user.userID,
        status: 'Confirmed',
        attended: 'No',
        regTime: now
      };
      saveRegistrationRow_(target);
      registrations.push(target);
    }
    existingIDs.push(target.regID);
    count++;
  }
  return count;
}

/**
 * manageEvent 字段校验（契约 3.7）。
 * 校验不通过 → VALIDATION_ERROR，message 指明字段。
 * @return 规范化后的字段对象
 */
function validateEventPayload_(payload) {
  function str(v) {
    return (v === undefined || v === null) ? '' : String(v).trim();
  }

  var name = str(payload.name);
  if (!name) apiFail_('VALIDATION_ERROR', 'Name 必填');
  var location = str(payload.location);
  if (!location) apiFail_('VALIDATION_ERROR', 'Location 必填');

  var regStart = str(payload.regStart);
  if (!regStart) apiFail_('VALIDATION_ERROR', 'RegStart 必填');
  if (!isValidDateTime_(regStart)) apiFail_('VALIDATION_ERROR', 'RegStart 格式錯誤（需 YYYY-MM-DD HH:mm）');

  var regEnd = str(payload.regEnd);
  if (!regEnd) apiFail_('VALIDATION_ERROR', 'RegEnd 必填');
  if (!isValidDateTime_(regEnd)) apiFail_('VALIDATION_ERROR', 'RegEnd 格式錯誤（需 YYYY-MM-DD HH:mm）');

  var eventStart = str(payload.eventStart);
  if (!eventStart) apiFail_('VALIDATION_ERROR', 'EventStart 必填');
  if (!isValidDateTime_(eventStart)) apiFail_('VALIDATION_ERROR', 'EventStart 格式錯誤（需 YYYY-MM-DD HH:mm）');

  var eventEnd = str(payload.eventEnd);
  if (!eventEnd) apiFail_('VALIDATION_ERROR', 'EventEnd 必填');
  if (!isValidDateTime_(eventEnd)) apiFail_('VALIDATION_ERROR', 'EventEnd 格式錯誤（需 YYYY-MM-DD HH:mm）');

  // 时间链：RegStart < RegEnd < EventStart < EventEnd（统一 'YYYY-MM-DD HH:mm' 字符串可直接比较）
  if (!(regStart < regEnd)) apiFail_('VALIDATION_ERROR', 'RegEnd 必須晚於 RegStart');
  if (!(regEnd < eventStart)) apiFail_('VALIDATION_ERROR', 'EventStart 必須晚於 RegEnd');
  if (!(eventStart < eventEnd)) apiFail_('VALIDATION_ERROR', 'EventEnd 必須晚於 EventStart');

  // MaxQuota：≥0 整数，缺省 0（不限）
  var maxQuota = 0;
  var quotaRaw = str(payload.maxQuota);
  if (quotaRaw !== '') {
    if (!/^\d+$/.test(quotaRaw)) apiFail_('VALIDATION_ERROR', 'MaxQuota 必須為 ≥0 的整數');
    maxQuota = parseInt(quotaRaw, 10);
  }

  var requireOfficer = payload.requireOfficer === true ||
    String(payload.requireOfficer === undefined || payload.requireOfficer === null ? '' : payload.requireOfficer).toUpperCase() === 'TRUE';

  // 契约 7.2：三个资格字段必须落在白名单内（空 / ALL / 逗号分隔白名单值）
  var eligibleClasses = validateOptionList_(payload.eligibleClasses, CLASS_OPTIONS, '允許班級');
  var eligibleClubs = validateOptionList_(payload.eligibleClubs, CLUB_OPTIONS, '允許學會');
  var eligibleGrades = validateOptionList_(payload.eligibleGrades, GRADE_OPTIONS, '允許年級');

  return {
    name: name,
    category: str(payload.category) || '其他',
    location: location,
    regStart: regStart,
    regEnd: regEnd,
    eventStart: eventStart,
    eventEnd: eventEnd,
    eligibleClasses: eligibleClasses,
    eligibleClubs: eligibleClubs,
    eligibleGrades: eligibleGrades,
    requireOfficer: requireOfficer,
    maxQuota: maxQuota,
    description: str(payload.description),
    // 契约 7.4：必须参加属性（缺省 false）
    isMandatory: boolParam_(payload.isMandatory)
  };
}

/* ============================== EventView 组装 ============================== */

/**
 * 契约 3.2：Events 全部字段 + 计算字段。
 * @param {Object} event 活动对象
 * @param {string} userID 当前用户（可为空）
 * @param {Array} users 用户表
 * @param {Array} events 活动表
 * @param {Array} registrations 报名表
 * @param {string} now 'YYYY-MM-DD HH:mm'
 */
function buildEventView_(event, userID, users, events, registrations, now) {
  var regs = [];
  for (var i = 0; i < registrations.length; i++) {
    if (registrations[i].eventID === event.eventID) regs.push(registrations[i]);
  }

  var registeredCount = 0;
  var waitlistCount = 0;
  for (var r = 0; r < regs.length; r++) {
    if (regs[r].status === 'Confirmed') registeredCount++;
    else if (regs[r].status === 'Waitlist') waitlistCount++;
  }

  var user = userID ? getUser_(users, userID) : null;
  var eligibility = user
    ? checkEligibility_(user, event)
    : { eligible: true, reason: '' };
  var conflicts = user ? getConflicts_(registrations, events, userID, event) : [];
  var host = getUser_(users, event.hostID);
  var maxQuota = cellNumber_(event.maxQuota, 0);
  var remaining = (maxQuota === 0) ? null : Math.max(0, maxQuota - registeredCount);

  return {
    eventID: event.eventID,
    name: event.name,
    category: event.category,
    location: event.location,
    regStart: event.regStart,
    regEnd: event.regEnd,
    eventStart: event.eventStart,
    eventEnd: event.eventEnd,
    eligibleClasses: event.eligibleClasses,
    eligibleClubs: event.eligibleClubs,
    eligibleGrades: event.eligibleGrades,
    requireOfficer: !!event.requireOfficer,
    maxQuota: maxQuota,
    hostID: event.hostID,
    hostName: host ? host.name : '',
    description: event.description || '',
    status: event.status,
    createdAt: event.createdAt,
    registeredCount: registeredCount,
    waitlistCount: waitlistCount,
    remaining: remaining,
    myStatus: user ? myStatusOf_(registrations, event.eventID, userID) : null,
    isEligible: eligibility.eligible,
    eligibleReason: eligibility.reason,
    hasConflict: conflicts.length > 0,
    isFull: remaining === 0,
    isRegOpen: now >= event.regStart && now <= event.regEnd,
    // 契约 7.3：必须参加 / 是否已开始
    isMandatory: !!event.isMandatory,
    started: now >= event.eventStart
  };
}

/* ============================== 资格 / 状态 / 撞期辅助 ============================== */

/**
 * 契约 3.5 第 2 步：资格校验。
 * @return {eligible:boolean, reason:string} reason 例「限 S5,S6」「限美術學會」「僅限幹事」
 */
function checkEligibility_(user, event) {
  var reasons = [];

  if (!isAll_(event.eligibleClasses)) {
    var classes = splitList_(event.eligibleClasses);
    if (classes.length > 0 && !contains_(classes, user.class)) {
      reasons.push('限 ' + classes.join(','));
    }
  }
  if (!isAll_(event.eligibleClubs)) {
    var clubs = splitList_(event.eligibleClubs);
    var mineClubs = splitList_(user.club);
    var hit = false;
    for (var i = 0; i < clubs.length; i++) {
      if (contains_(mineClubs, clubs[i])) { hit = true; break; }
    }
    if (clubs.length > 0 && !hit) reasons.push('限 ' + clubs.join(','));
  }
  if (!isAll_(event.eligibleGrades)) {
    var grades = splitList_(event.eligibleGrades);
    if (grades.length > 0 && !contains_(grades, user.grade)) {
      reasons.push('限 ' + grades.join(','));
    }
  }
  if (event.requireOfficer && !user.isOfficer) {
    reasons.push('僅限幹事');
  }

  return { eligible: reasons.length === 0, reason: reasons.join('；') };
}

/** 当前用户对某活动的报名状态：Confirmed > Waitlist > Cancelled > null */
function myStatusOf_(registrations, eventID, userID) {
  if (!userID) return null;
  var hasConfirmed = false;
  var hasWaitlist = false;
  var hasCancelled = false;
  for (var i = 0; i < registrations.length; i++) {
    var reg = registrations[i];
    if (reg.eventID !== eventID || reg.userID !== userID) continue;
    if (reg.status === 'Confirmed') hasConfirmed = true;
    else if (reg.status === 'Waitlist') hasWaitlist = true;
    else if (reg.status === 'Cancelled') hasCancelled = true;
  }
  if (hasConfirmed) return 'Confirmed';
  if (hasWaitlist) return 'Waitlist';
  if (hasCancelled) return 'Cancelled';
  return null;
}

/** 该用户该活动的有效报名（非 Cancelled），无则 null */
function activeRegOf_(registrations, userID, eventID) {
  for (var i = 0; i < registrations.length; i++) {
    var reg = registrations[i];
    if (reg.eventID === eventID && reg.userID === userID && reg.status !== 'Cancelled') return reg;
  }
  return null;
}

/** 某活动某状态的报名数 */
function countStatus_(registrations, eventID, status) {
  var n = 0;
  for (var i = 0; i < registrations.length; i++) {
    if (registrations[i].eventID === eventID && registrations[i].status === status) n++;
  }
  return n;
}

/**
 * 契约 3.5 第 6 步 / EventView.hasConflict：
 * 当前用户在同一天（EventStart 日期相同）已有 Confirmed 且 EventID 不同的（未取消）活动。
 * @return [{eventID,name,eventStart,eventEnd}]
 */
function getConflicts_(registrations, events, userID, targetEvent) {
  if (!userID || !targetEvent) return [];
  var targetDay = dateOnly_(targetEvent.eventStart);
  var seen = {};
  var out = [];

  for (var i = 0; i < registrations.length; i++) {
    var reg = registrations[i];
    if (reg.userID !== userID || reg.status !== 'Confirmed') continue;
    if (reg.eventID === targetEvent.eventID) continue;
    if (seen[reg.eventID]) continue;

    var other = getEventById_(events, reg.eventID);
    if (!other) continue;
    if (other.status === 'Cancelled') continue;
    if (dateOnly_(other.eventStart) !== targetDay) continue;

    seen[reg.eventID] = true;
    out.push({
      eventID: other.eventID,
      name: other.name,
      eventStart: other.eventStart,
      eventEnd: other.eventEnd
    });
  }

  out.sort(function (a, b) {
    if (a.eventStart !== b.eventStart) return a.eventStart < b.eventStart ? -1 : 1;
    return a.eventID < b.eventID ? -1 : 1;
  });
  return out;
}
