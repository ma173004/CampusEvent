/**
 * =============================================================================
 * 04_Registrations.gs · 报名核心 / 取消递补 / 名单 / 点名
 * -----------------------------------------------------------------------------
 * 契约对应：3.5 registerEvent / 3.6 cancelRegistration
 *           3.8 getParticipantList / 3.9 markAttendance
 *
 * registerEvent 的业务顺序严格按契约 3.5（命中即返回，不得调换）：
 *   1 活动存在且 Active → 2 资格 → 3 重复报名 → 4 报名窗口
 *   → 5 已开始 → 6 撞期（confirm 可跳过）→ 7 名额/候补 → 8 写表。
 * =============================================================================
 */

/* ============================== 3.5 registerEvent (POST) ============================== */

/**
 * 请求：{"action":"registerEvent","eventID":"20261020a","userID":"S2201","confirm":false}
 * 成功：data = {status, registration:{regID,eventID,userID,status,regTime}}
 *       候补时 status=Waitlist，并附 message「名額已滿，已加入候補名單」
 */
function registerEvent_(params) {
  var eventID = trimParam_(params, 'eventID');
  var userID = trimParam_(params, 'userID');
  var confirm = params.confirm === true || String(params.confirm) === 'true';

  if (!eventID) apiFail_('INVALID_PARAM', '缺少參數：eventID');
  if (!userID) apiFail_('INVALID_PARAM', '缺少參數：userID');

  var users = readUsers_();
  var events = readEvents_();
  var registrations = readRegistrations_();

  // 1. 活动存在且 Status=Active，否则 NOT_FOUND
  var event = getEventById_(events, eventID);
  if (!event || event.status !== 'Active') {
    apiFail_('NOT_FOUND', '活動不存在或已取消');
  }

  // 用户必须存在（后续资格/写表都需要）
  var user = getUser_(users, userID);
  if (!user) apiFail_('NOT_AUTHORIZED', '未授權的操作（使用者不存在）');

  // 2. 资格校验
  var eligibility = checkEligibility_(user, event);
  if (!eligibility.eligible) {
    apiFail_('NOT_ELIGIBLE', '不符合報名資格（' + eligibility.reason + '）');
  }

  // 3. 已报名且状态非 Cancelled
  if (activeRegOf_(registrations, userID, eventID)) {
    apiFail_('ALREADY_REGISTERED', '已報名此活動');
  }

  // 4. 报名窗口
  var now = nowString_();
  if (now < event.regStart) apiFail_('REG_CLOSED', '報名尚未開始');
  if (now > event.regEnd) apiFail_('REG_CLOSED', '報名已截止');

  // 5. 活动已开始
  if (now > event.eventStart) apiFail_('EVENT_STARTED', '活動已開始，無法報名');

  // 6. 撞期检查（confirm=true 时跳过）
  var conflicts = getConflicts_(registrations, events, userID, event);
  if (conflicts.length > 0 && confirm !== true) {
    apiFail_('CONFLICT', '與已報名的活動撞期，請確認是否繼續報名', { conflicts: conflicts });
  }

  // 7. 名额：Confirmed 数 < MaxQuota（或 MaxQuota=0 不限）→ Confirmed，否则 Waitlist
  var confirmedCount = countStatus_(registrations, eventID, 'Confirmed');
  var maxQuota = cellNumber_(event.maxQuota, 0);
  var status = (maxQuota === 0 || confirmedCount < maxQuota) ? 'Confirmed' : 'Waitlist';

  // 8. 写表：存在该用户该活动的 Cancelled 旧记录则复用该行（更新 Status / RegTime）
  var reg = null;
  for (var i = 0; i < registrations.length; i++) {
    var old = registrations[i];
    if (old.eventID === eventID && old.userID === userID && old.status === 'Cancelled') {
      reg = old;
      break;
    }
  }

  if (reg) {
    reg.status = status;
    reg.attended = 'No';
    reg.regTime = now;
    saveRegistrationRow_(reg);
  } else {
    var existingIDs = [];
    for (var k = 0; k < registrations.length; k++) existingIDs.push(registrations[k].regID);

    reg = {
      _row: 0,
      regID: generateRegID_(existingIDs),
      eventID: eventID,
      userID: userID,
      status: status,
      attended: 'No',
      regTime: now
    };
    saveRegistrationRow_(reg);
  }

  var data = {
    status: reg.status,
    registration: {
      regID: reg.regID,
      eventID: reg.eventID,
      userID: reg.userID,
      status: reg.status,
      regTime: reg.regTime
    }
  };

  if (status === 'Waitlist') {
    return okEnvelope_(data, '名額已滿，已加入候補名單');
  }
  return okEnvelope_(data);
}

/* ============================== 3.6 cancelRegistration (POST) ============================== */

/**
 * 请求：{"action":"cancelRegistration","eventID":"…","userID":"…"}
 * 逻辑：自己的 Confirmed/Waitlist → Cancelled；若原为 Confirmed，
 *       取该活动 Waitlist 中 RegTime 最早者升为 Confirmed 并发邮件（GAS）。
 * data：{promoted:{userID,name} | null}；未报名 → NOT_REGISTERED
 */
function cancelRegistration_(params) {
  var eventID = trimParam_(params, 'eventID');
  var userID = trimParam_(params, 'userID');
  if (!eventID) apiFail_('INVALID_PARAM', '缺少參數：eventID');
  if (!userID) apiFail_('INVALID_PARAM', '缺少參數：userID');

  var users = readUsers_();
  var events = readEvents_();
  var registrations = readRegistrations_();

  var user = getUser_(users, userID);
  if (!user) apiFail_('NOT_AUTHORIZED', '未授權的操作（使用者不存在）');

  var event = getEventById_(events, eventID);
  if (!event) apiFail_('NOT_FOUND', '活動不存在');

  // 契约 7.5：必须参加的活动不可取消（在未报名检查之前拦截）
  if (event.isMandatory) {
    apiFail_('MANDATORY_EVENT', '必須參加的活動不可取消報名，請聯絡負責老師');
  }

  var reg = activeRegOf_(registrations, userID, eventID);
  if (!reg) apiFail_('NOT_REGISTERED', '未報名此活動');

  var wasConfirmed = (reg.status === 'Confirmed');

  reg.status = 'Cancelled';
  saveRegistrationRow_(reg);

  // 若原为 Confirmed，递补 Waitlist 中 RegTime 最早者（同时间按 RegID）
  var promoted = null;
  if (wasConfirmed) {
    var waitRegs = [];
    for (var i = 0; i < registrations.length; i++) {
      if (registrations[i].eventID === eventID && registrations[i].status === 'Waitlist') {
        waitRegs.push(registrations[i]);
      }
    }
    waitRegs.sort(function (a, b) {
      if (a.regTime !== b.regTime) return a.regTime < b.regTime ? -1 : 1;
      return a.regID < b.regID ? -1 : (a.regID > b.regID ? 1 : 0);
    });

    if (waitRegs.length > 0) {
      var promotedReg = waitRegs[0];
      promotedReg.status = 'Confirmed';
      saveRegistrationRow_(promotedReg);

      var promotedUser = getUser_(users, promotedReg.userID);
      promoted = {
        userID: promotedReg.userID,
        name: promotedUser ? promotedUser.name : ''
      };

      // GAS 环境发邮件通知（try/catch 包裹，失败不阻断业务）
      if (promotedUser && promotedUser.email) {
        sendMailSafe_(
          promotedUser.email,
          '【校園活動管理系統】候補遞補通知：' + event.name,
          promotedUser.name + ' 同學／老師您好：\n\n' +
          '您報名的活動「' + event.name + '」原有正取者取消報名，\n' +
          '您已由候補名單自動遞補為【正取】。\n\n' +
          '活動時間：' + event.eventStart + ' 至 ' + event.eventEnd + '\n' +
          '活動地點：' + event.location + '\n\n' +
          '如無法出席，請盡早於系統取消報名，以便通知其他候補者。\n' +
          '—— 校園活動管理系統'
        );
      }
    }
  }

  return okEnvelope_({ promoted: promoted });
}

/* ============================== 3.8 getParticipantList (GET) ============================== */

/**
 * 请求：?action=getParticipantList&eventID=…&userID=T001
 * data：{event:EventView, confirmed:[…], waitlist:[…]}（按 RegTime 升序）
 * 权限同 3.7：Teacher/Admin；Teacher 只能看自己主持的活动。
 */
function getParticipantList_(params) {
  var operator = requireOperator_(params.userID, ['Teacher', 'Admin'],
    '未授權的操作（只限老師或管理員）');

  var eventID = trimParam_(params, 'eventID');
  if (!eventID) apiFail_('INVALID_PARAM', '缺少參數：eventID');

  var users = readUsers_();
  var events = readEvents_();
  var registrations = readRegistrations_();

  var event = getEventById_(events, eventID);
  if (!event) apiFail_('NOT_FOUND', '活動不存在');
  requireHostOrAdmin_(operator, event);

  var eventRegs = [];
  for (var i = 0; i < registrations.length; i++) {
    if (registrations[i].eventID === eventID) eventRegs.push(registrations[i]);
  }
  eventRegs.sort(function (a, b) {
    if (a.regTime !== b.regTime) return a.regTime < b.regTime ? -1 : 1;
    return a.regID < b.regID ? -1 : (a.regID > b.regID ? 1 : 0);
  });

  var confirmed = [];
  var waitlist = [];
  for (var j = 0; j < eventRegs.length; j++) {
    var reg = eventRegs[j];
    var u = getUser_(users, reg.userID);
    var item = {
      regID: reg.regID,
      userID: reg.userID,
      name: u ? u.name : '',
      class: u ? u.class : '',
      grade: u ? u.grade : '',
      regTime: reg.regTime
    };
    if (reg.status === 'Confirmed') {
      item.attended = reg.attended || 'No';
      confirmed.push(item);
    } else if (reg.status === 'Waitlist') {
      waitlist.push(item);
    }
  }

  return okEnvelope_({
    event: buildEventView_(event, operator.userID, users, events, registrations, nowString_()),
    confirmed: confirmed,
    waitlist: waitlist
  });
}

/* ============================== 3.9 markAttendance (POST) ============================== */

/**
 * 请求：{"action":"markAttendance","eventID":"…","userID":"T001","targetUserID":"S2201","attended":"Yes"}
 * attended 可 Yes/No，缺省 Yes；权限同 3.7；目标无 Confirmed 记录 → NOT_REGISTERED
 * data：{eventID, targetUserID, attended}
 */
function markAttendance_(params) {
  var operator = requireOperator_(params.userID, ['Teacher', 'Admin'],
    '未授權的操作（只限老師或管理員）');

  var eventID = trimParam_(params, 'eventID');
  if (!eventID) apiFail_('INVALID_PARAM', '缺少參數：eventID');
  var targetUserID = trimParam_(params, 'targetUserID');
  if (!targetUserID) apiFail_('INVALID_PARAM', '缺少參數：targetUserID');

  var users = readUsers_();
  var events = readEvents_();
  var registrations = readRegistrations_();

  var event = getEventById_(events, eventID);
  // 契约 7.6：活動必須存在且為 Active（已取消的活動不能點名）
  if (!event || event.status !== 'Active') apiFail_('NOT_FOUND', '活動不存在或已取消');
  requireHostOrAdmin_(operator, event);

  // 契约 7.6：活動尚未開始不能點名
  if (nowString_() < event.eventStart) {
    apiFail_('EVENT_NOT_STARTED', '活動尚未開始，不能點名');
  }

  var attended = (params.attended === undefined || params.attended === null || params.attended === '')
    ? 'Yes' : String(params.attended);
  if (attended !== 'Yes' && attended !== 'No') {
    apiFail_('VALIDATION_ERROR', 'attended 只能為 Yes 或 No');
  }

  var targetReg = null;
  for (var i = 0; i < registrations.length; i++) {
    var reg = registrations[i];
    if (reg.eventID === eventID && reg.userID === targetUserID && reg.status === 'Confirmed') {
      targetReg = reg;
      break;
    }
  }
  if (!targetReg) apiFail_('NOT_REGISTERED', '該用戶未報名此活動（或非 Confirmed）');

  targetReg.attended = attended;
  saveRegistrationRow_(targetReg);

  return okEnvelope_({
    eventID: eventID,
    targetUserID: targetUserID,
    attended: attended
  });
}
