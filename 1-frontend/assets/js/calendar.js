/* =============================================================
 * calendar.js — 主頁（dashboard.html）
 * 職責：歡迎區、統計卡、FullCalendar 月曆、「即將舉行的活動」列表
 * 依賴：api.js（window.API）、auth.js（window.CES_AUTH / window.CES_UI）、FullCalendar 6
 * ============================================================= */
(function () {
  'use strict';

  var BACKEND_MSG = '無法連接後端，請先啟動本地 mock server 或部署 GAS';

  /* ---------- 小工具 ---------- */
  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  function esc(v) { return CES_UI.escapeHtml(v); }

  /* v1.1：「必須參加」活動徽章 */
  function mandatoryBadge(e) {
    if (!e || e.isMandatory !== true) return '';
    return '<span class="badge-mandatory"><i class="bi bi-exclamation-circle-fill"></i>必須參加</span>';
  }

  /* v1.2：只有學生參與報名；教師／管理員不渲染任何報名按鈕 */
  function isStudentUser(u) { return !!u && u.role === 'Student'; }

  function hasStarted(e, now) {
    if (e && typeof e.started === 'boolean') return e.started;
    return !!(e && e.eventStart && e.eventStart <= now);
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function ymd(date) {
    return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
  }

  function dateLabel(date) {
    var wd = ['日', '一', '二', '三', '四', '五', '六'][date.getDay()];
    return date.getFullYear() + '/' + pad2(date.getMonth() + 1) + '/' + pad2(date.getDate()) +
      '（星期' + wd + '）';
  }

  function parseDT(str) {
    if (!str) return null;
    var d = new Date(String(str).replace(' ', 'T'));
    return isNaN(d.getTime()) ? null : d;
  }

  function timeLabel(str) {
    var d = parseDT(str);
    if (!d) return '';
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  function isNetworkError(code) {
    return code === 'NETWORK_ERROR' || code === 'TIMEOUT' || code === 'BAD_RESPONSE' ||
      String(code || '').indexOf('HTTP_') === 0;
  }

  function roleClass(role) {
    var map = { Student: 'role-student', Teacher: 'role-teacher', Admin: 'role-admin' };
    return map[role] || 'role-student';
  }

  /* ---------- 狀態 ---------- */
  var user = null;
  var calendarInstance = null;
  var holidayDates = {};
  var loading = false;

  /* ---------- 初始化 ---------- */
  function init() {
    var host = document.getElementById('dashboardCalendar');
    var isDashboard = (document.body && document.body.dataset.page === 'dashboard') || !!host;
    if (!isDashboard || !host) return;

    user = CES_AUTH.requireLogin();
    if (!user) return; // 未登入已被 requireLogin 導向登入頁

    CES_UI.renderNav('dashboard');
    renderHero();
    loadDashboard();
  }

  function renderHero() {
    var greeting = document.getElementById('heroGreeting');
    var sub = document.getElementById('heroSub');
    var dateEl = document.getElementById('heroDate');
    var roleEl = document.getElementById('heroRole');

    if (greeting) {
      greeting.innerHTML = '你好，' + esc(user.name) +
        ' <span class="role-badge ' + roleClass(user.role) + '">' +
        esc(CES_UI.roleLabel(user.role)) + '</span>';
    }
    if (sub) sub.textContent = '以下是你的校園活動概況，點擊月曆上的活動可查看詳情。';
    if (dateEl) dateEl.textContent = '今日：' + dateLabel(new Date());
    if (roleEl) roleEl.textContent = (user.userID || '') + (user.grade ? ' · ' + user.grade : '') +
      (user['class'] ? ' · ' + user['class'] : '');
  }

  /* ---------- 資料載入 ---------- */
  function loadDashboard() {
    if (loading) return;
    loading = true;

    var calEl = document.getElementById('dashboardCalendar');
    var listEl = document.getElementById('upcomingList');
    CES_UI.loading(calEl, true);
    CES_UI.loading(listEl, true);

    Promise.all([
      API.getCalendarData(user.userID),
      API.getEvents({ userID: user.userID, sort: 'time' })
    ]).then(function (res) {
      var calData = res[0] || {};
      var evData = res[1] || {};
      CES_UI.loading(calEl, false);
      CES_UI.loading(listEl, false);
      buildCalendar(calEl, calData);
      renderStats(evData);
      renderUpcoming(listEl, evData);
    }).catch(function (err) {
      CES_UI.loading(calEl, false);
      CES_UI.loading(listEl, false);
      var msg = isNetworkError(err && err.code) ? BACKEND_MSG : ((err && err.message) || BACKEND_MSG);
      if (calEl) calEl.innerHTML = emptyHtml(msg);
      if (listEl) listEl.innerHTML = emptyHtml(msg);
    }).then(function () {
      loading = false;
    });
  }

  function emptyHtml(msg) {
    return '<div class="ces-empty w-100"><i class="bi bi-cloud-slash"></i>' + esc(msg) + '</div>';
  }

  /* ---------- 月曆 ---------- */
  function buildCalendar(el, data) {
    if (!el) return;

    if (calendarInstance) {
      try { calendarInstance.destroy(); } catch (e) { /* ignore */ }
      calendarInstance = null;
    }

    if (typeof FullCalendar === 'undefined') {
      el.innerHTML = emptyHtml('月曆元件（FullCalendar）載入失敗，請檢查 CDN 網絡連線');
      return;
    }

    el.innerHTML = '';
    holidayDates = {};

    var holidays = Array.isArray(data.holidays) ? data.holidays : [];
    var events = Array.isArray(data.events) ? data.events : [];
    var fcEvents = [];

    holidays.forEach(function (h) {
      if (!h || !h.date) return;
      var name = h.name || '公眾假期';
      holidayDates[h.date] = name;
      fcEvents.push({
        id: 'holiday_' + h.date,
        title: name,
        start: h.date,
        allDay: true,
        classNames: ['fc-event-holiday'],
        extendedProps: { kind: 'holiday' }
      });
    });

    events.forEach(function (e) {
      if (!e || !e.start) return;
      var type = e.type === 'host' ? 'host' : (e.type === 'joined' ? 'joined' : 'other');
      /* v1.1：必須參加優先於主持/參加配色（假期為獨立事件，不受影響） */
      var cls = e.isMandatory === true ? 'fc-event-mandatory' :
        (type === 'host' ? 'fc-event-host' :
          (type === 'joined' ? 'fc-event-joined' : 'fc-event-other'));
      fcEvents.push({
        id: 'fc_' + (e.eventID || e.name),
        title: e.name || '活動',
        start: e.start,
        end: e.end || undefined,
        classNames: [cls],
        extendedProps: {
          kind: type,
          mandatory: e.isMandatory === true,
          eventID: e.eventID || '',
          location: e.location || '',
          category: e.category || '',
          status: e.status || ''
        }
      });
    });

    calendarInstance = new FullCalendar.Calendar(el, {
      locale: 'zh-tw',
      initialView: 'dayGridMonth',
      firstDay: 1,
      height: 'auto',
      fixedWeekCount: false,
      dayMaxEvents: 3,
      eventDisplay: 'block',
      headerToolbar: {
        left: 'prev,next today',
        center: 'title',
        right: 'dayGridMonth,listMonth'
      },
      buttonText: { today: '今天', month: '月', list: '清單' },
      noEventsText: '本月暫無活動',
      events: fcEvents,
      dayCellDidMount: function (info) {
        var key = ymd(info.date);
        if (holidayDates[key]) {
          info.el.classList.add('fc-day-holiday');
          info.el.setAttribute('title', holidayDates[key]);
        }
      },
      eventClick: function (info) {
        var props = info.event.extendedProps || {};
        if (!props.eventID) return; // 假期事件不跳轉
        location.href = 'event_detail.html?id=' + encodeURIComponent(props.eventID);
      },
      eventDidMount: function (info) {
        var props = info.event.extendedProps || {};
        var tip = [info.event.title + (props.mandatory ? '（必須參加）' : '')];
        if (props.category) tip.push('類別：' + props.category);
        if (props.location) tip.push('地點：' + props.location);
        if (info.event.start) tip.push('開始：' + fmtDateTime(info.event.start));
        if (info.event.end) tip.push('結束：' + fmtDateTime(info.event.end));
        info.el.setAttribute('title', tip.join('\n'));
      }
    });

    calendarInstance.render();
  }

  function fmtDateTime(d) {
    if (!d || isNaN(d.getTime())) return '';
    return d.getFullYear() + '/' + pad2(d.getMonth() + 1) + '/' + pad2(d.getDate()) +
      ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  /* ---------- 統計卡 ---------- */
  function renderStats(data) {
    var events = Array.isArray(data.events) ? data.events : [];
    var now = data.now || nowText();

    var joined = events.filter(function (e) {
      return e && (e.myStatus === 'Confirmed' || e.myStatus === 'Waitlist');
    });
    var confirmed = events.filter(function (e) {
      return e && e.myStatus === 'Confirmed';
    });
    var upcoming = events.filter(function (e) {
      return e && e.status === 'Active' && e.eventStart && e.eventStart > now && !hasStarted(e, now);
    });
    var todo = events.filter(function (e) {
      return e && e.status === 'Active' && (!e.myStatus || e.myStatus === 'Cancelled') &&
        e.isEligible !== false && e.isRegOpen === true && e.eventStart && e.eventStart > now &&
        !hasStarted(e, now);
    });

    setText('statJoined', joined.length);
    setText('statUpcoming', upcoming.length);
    setText('statConfirmed', confirmed.length);
    setText('statTodo', todo.length);
  }

  function setText(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = String(value);
  }

  function nowText() {
    var d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
      ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  /* ---------- 即將舉行的活動 ---------- */
  function renderUpcoming(container, data) {
    if (!container) return;
    var events = Array.isArray(data.events) ? data.events : [];
    var now = data.now || nowText();

    var list = events.filter(function (e) {
      return e && e.status === 'Active' && e.eventStart && e.eventStart > now && !hasStarted(e, now);
    }).sort(function (a, b) {
      return a.eventStart < b.eventStart ? -1 : (a.eventStart > b.eventStart ? 1 : 0);
    }).slice(0, 5);

    if (!list.length) {
      container.innerHTML = '<div class="ces-empty"><i class="bi bi-calendar-x"></i>暫時沒有即將舉行的活動</div>';
      return;
    }

    container.innerHTML = list.map(function (e) {
      var id = encodeURIComponent(e.eventID);
      var detail = 'event_detail.html?id=' + id;
      var status = e.myStatus && e.myStatus !== 'Cancelled' ? CES_UI.statusBadge(e.myStatus) : '';
      var quota = !e.maxQuota || e.maxQuota === 0 ? '名額不限'
        : ('名額 ' + (e.registeredCount || 0) + ' / ' + e.maxQuota);

      var action;
      if (!isStudentUser(user)) {
        /* v1.2：非學生帳號只顯示「詳情」，不渲染報名按鈕 */
        action = '<a class="btn btn-sm btn-ces-ghost" href="' + detail + '">詳情</a>';
      } else if (e.myStatus === 'Confirmed' || e.myStatus === 'Waitlist') {
        action = '<a class="btn btn-sm btn-ces-ghost" href="' + detail + '">詳情</a>';
      } else if (e.isEligible !== false && e.isRegOpen === true) {
        action = '<button type="button" class="btn btn-sm btn-ces-primary" data-register="' +
          esc(e.eventID) + '">' + (e.isFull ? '報名候補' : '報名') + '</button>';
      } else {
        action = '<a class="btn btn-sm btn-ces-ghost" href="' + detail + '">詳情</a>';
      }

      return '<div class="py-2 border-top">' +
        '<div class="d-flex justify-content-between align-items-start gap-2">' +
        '<div class="min-w-0">' +
        '<a class="fw-semibold" href="' + detail + '">' + esc(e.name) + '</a>' +
        '<div class="small muted mt-1">' +
        '<i class="bi bi-clock me-1"></i>' + esc(CES_UI.fmtDT(e.eventStart)) +
        ' · <i class="bi bi-geo-alt me-1"></i>' + esc(e.location) +
        '</div>' +
        '<div class="small mt-1 d-flex flex-wrap align-items-center gap-1">' +
        (e.category ? '<span class="tag">' + esc(e.category) + '</span>' : '') +
        mandatoryBadge(e) +
        status +
        '<span class="tag tag-soft">' + esc(quota) + '</span>' +
        '</div>' +
        '</div>' +
        '<div class="flex-shrink-0">' + action + '</div>' +
        '</div></div>';
    }).join('');

    container.querySelectorAll('[data-register]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        btn.disabled = true;
        registerEvent(btn.getAttribute('data-register'), btn);
      });
    });
  }

  /* ---------- 快速報名（含撞期二次確認） ---------- */
  function registerEvent(eventID, btn) {
    if (!eventID) return;
    if (!isStudentUser(user)) {
      /* v1.2：非學生帳號不參與報名（正常情況不會有按鈕可觸發） */
      CES_UI.toast('教師／管理員帳號不參與學生報名', 'info');
      if (btn) btn.disabled = false;
      return;
    }
    API.registerEvent(eventID, user.userID, false).then(onRegisterSuccess).catch(function (err) {
      if (err && err.code === 'CONFLICT') {
        var conflicts = (err.data && err.data.conflicts) || [];
        var items = conflicts.map(function (c) {
          return '<li>' + esc(c.name) +
            '<span class="muted">（' + esc(CES_UI.fmtDT(c.eventStart)) +
            ' 至 ' + esc(CES_UI.fmtTime(c.eventEnd)) + '）</span></li>';
        }).join('');

        CES_UI.confirmDialog({
          title: '活動時間衝突',
          body: '<p class="mb-2">系統檢測到你當天已有以下活動，仍要報名嗎？</p>' +
            '<ul class="mb-0">' + items + '</ul>',
          okText: '仍要報名',
          cancelText: '取消'
        }).then(function (ok) {
          if (!ok) {
            if (btn) btn.disabled = false;
            return;
          }
          API.registerEvent(eventID, user.userID, true)
            .then(onRegisterSuccess)
            .catch(function (e2) {
              handleRegisterError(e2);
              if (btn) btn.disabled = false;
            });
        });
        return;
      }
      handleRegisterError(err);
      if (btn) btn.disabled = false;
    });
  }

  function onRegisterSuccess(data) {
    var waitlist = data && data.status === 'Waitlist';
    CES_UI.toast(waitlist ? '名額已滿，已加入候補名單' : '報名成功', waitlist ? 'warning' : 'success');
    loadDashboard();
  }

  function handleRegisterError(err) {
    var code = err && err.code;
    var msg = (err && err.message) || '';
    if (code === 'ALREADY_REGISTERED') CES_UI.toast('你已報名此活動', 'info');
    else if (code === 'REG_CLOSED') CES_UI.toast(msg || '報名已截止', 'warning');
    else if (code === 'NOT_ELIGIBLE') CES_UI.toast(msg || '不符合報名資格', 'warning');
    else if (code === 'EVENT_STARTED') CES_UI.toast('活動已開始，無法報名', 'warning');
    else if (code === 'MANDATORY_EVENT') {
      CES_UI.toast(msg || '必須參加的活動不可取消報名，請聯絡負責老師', 'warning');
    } else if (code === 'EVENT_NOT_STARTED') CES_UI.toast(msg || '活動尚未開始', 'warning');
    else if (code === 'NOT_FOUND') CES_UI.toast('找不到此活動', 'danger');
    else if (isNetworkError(code)) CES_UI.toast(BACKEND_MSG, 'danger');
    else CES_UI.toast(msg || '報名失敗，請稍後再試', 'danger');
  }

  ready(init);
})();
