/**
 * =============================================================================
 * 06_Triggers.gs · 定时触发器：每日提醒邮件 + 过期活动处理
 * -----------------------------------------------------------------------------
 * 契约对应：3.14 邮件（GAS 定时触发器，非 HTTP）
 *
 * 每天 08:00：
 *   1. 查当天有活动的 Events（Status=Active）；
 *   2. 遍历这些活动的 Confirmed 且 Attended != Yes 的报名者，MailApp.sendEmail 提醒；
 *   3. 把 EventEnd 已过的活动「关闭」（见 closeExpiredEvents 的说明）。
 *
 * 部署：运行 installDailyTrigger() 一次（需授权）。
 * =============================================================================
 */

/**
 * 安装（或重装）每日 08:00 触发器。
 * 先删除同名旧触发器，避免重复执行导致重复发信。
 */
function installDailyTrigger() {
  var handlerName = 'sendDailyReminders';
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === handlerName) {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  ScriptApp.newTrigger(handlerName)
    .timeBased()
    .atHour(8)
    .nearMinute(0)
    .everyDays(1)
    .inTimezone(CONFIG.TIMEZONE)
    .create();

  Logger.log('已安裝每日 08:00 提醒觸發器（時區：%s）。', CONFIG.TIMEZONE);
  return 'installDailyTrigger OK';
}

/**
 * 每日提醒（触发器入口，也可手动运行测试）。
 * 若当天没有活动则不发信，仅记日志。
 */
function sendDailyReminders() {
  var today = todayString_();          // 'YYYY-MM-DD'
  var users = readUsers_();
  var events = readEvents_();
  var registrations = readRegistrations_();

  var sent = 0;
  var skipped = 0;

  for (var i = 0; i < events.length; i++) {
    var event = events[i];
    if (event.status !== 'Active') continue;
    if (dateOnly_(event.eventStart) !== today) continue;

    for (var r = 0; r < registrations.length; r++) {
      var reg = registrations[r];
      if (reg.eventID !== event.eventID) continue;
      if (reg.status !== 'Confirmed') continue;
      if (reg.attended === 'Yes') continue;     // 已出席者不再提醒

      var user = getUser_(users, reg.userID);
      if (!user || !user.email) { skipped++; continue; }

      var subject = '【校園活動管理系統】今日活動提醒：' + event.name;
      var body = user.name + ' 您好：\n\n' +
        '提醒您今天有一場已報名的活動：\n\n' +
        '活動名稱：' + event.name + '\n' +
        '活動時間：' + event.eventStart + ' 至 ' + event.eventEnd + '\n' +
        '活動地點：' + event.location + '\n\n' +
        '請準時出席；如無法出席，請於系統中取消報名。\n' +
        '—— 校園活動管理系統';

      // try/catch 包裹：MailApp 配额/权限失败不影响其他邮件的发送
      if (sendMailSafe_(user.email, subject, body)) sent++;
      else skipped++;
    }
  }

  closeExpiredEvents();

  Logger.log('sendDailyReminders 完成：今日活動提醒已發送 %s 封，跳過 %s 封。', sent, skipped);
  return 'sendDailyReminders OK（sent=' + sent + ', skipped=' + skipped + '）';
}

/**
 * 过期活动处理（契约 3.14「把 EventEnd 已过且 Status=Active 的活动改为 Archived
 * 或保持 Active，二选一实现，注释说明」）。
 *
 * 本实现选择【保持 Active】：
 *   数据字典 1.2 规定 Events.Status 只有 Active / Cancelled 两个取值，
 *   「Archived」不在契约枚举内；若写入 Archived 会让前端徽章/筛选与契约不符。
 *   因此这里只做「识别 + 日志」，不修改 Status，避免破坏契约。
 *   如需真正归档，应先升级契约（Status 增加 Archived）再启用下行注释代码。
 */
function closeExpiredEvents() {
  var now = nowString_();
  var events = readEvents_();
  var expired = 0;

  for (var i = 0; i < events.length; i++) {
    var event = events[i];
    if (event.status !== 'Active') continue;
    if (!event.eventEnd) continue;
    if (event.eventEnd >= now) continue;

    expired++;
    Logger.log('過期活動（保持 Active，未改 Status）：%s %s（EventEnd=%s）',
      event.eventID, event.name, event.eventEnd);

    // 若未来契约允许 Archived，可改为：
    // event.status = 'Archived';
    // saveEventRow_(event);
  }

  Logger.log('closeExpiredEvents 完成：過期仍 Active 的活動 %s 個（依契約保持 Active）。', expired);
  return 'closeExpiredEvents OK（expired=' + expired + '）';
}
