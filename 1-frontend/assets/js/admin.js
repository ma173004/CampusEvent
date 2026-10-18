/* =============================================================
 * admin.js — 後台（admin.html）與數據報表（stats.html）
 * 依 page 分流：body[data-page="admin"] / body[data-page="stats"]
 * 依賴：api.js（window.API）、auth.js（window.CES_AUTH / CES_UI）
 *        admin.html：Bootstrap bundle
 *        stats.html：Bootstrap bundle + Chart.js 4（window.Chart）
 * 約定見 3-docs/05_API契约与数据字典.md
 * ============================================================= */
(function () {
  'use strict';

  /* ---------- 0. 登入檢查與頁面分流 ---------- */
  // 老師 / 管理員可見；未登入會由 auth.js 跳轉登入頁，此處立即 return
  var user = CES_AUTH.requireLogin(['Teacher', 'Admin']);
  if (!user) return;

  var PAGE = document.body.dataset.page || '';
  var isAdmin = user.role === 'Admin';
  CES_UI.renderNav(PAGE === 'stats' ? 'stats' : PAGE === 'admin' ? 'admin' : '');

  /* ---------- 1. 共用工具 ---------- */
  function $(id) { return document.getElementById(id); }

  function esc(v) { return CES_UI.escapeHtml(v); }

  /** 後端錯誤統一 toast；NETWORK_ERROR 補上本機 mock server 提示 */
  function showError(err) {
    var msg = (err && err.message) ? err.message : '操作失敗，請稍後再試';
    if (err && err.code === 'NETWORK_ERROR' && msg.indexOf('server.js') === -1) {
      msg += '（本機演示請先執行：node 4-local-demo/server.js）';
    }
    CES_UI.toast(msg, 'danger');
  }

  /** 按鈕處理中狀態（防重複提交） */
  function setBusy(btn, busy, busyText) {
    if (!btn) return;
    if (busy) {
      if (!btn.dataset.originalHtml) btn.dataset.originalHtml = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>' +
        esc(busyText || '處理中…');
    } else {
      btn.disabled = false;
      if (btn.dataset.originalHtml) {
        btn.innerHTML = btn.dataset.originalHtml;
        delete btn.dataset.originalHtml;
      }
    }
  }

  /** datetime-local 的 'YYYY-MM-DDTHH:mm' → API 的 'YYYY-MM-DD HH:mm' */
  function dtLocalToApi(v) {
    if (!v) return '';
    return String(v).replace('T', ' ').slice(0, 16);
  }

  /** API 的 'YYYY-MM-DD HH:mm' → datetime-local 的 'YYYY-MM-DDTHH:mm' */
  function dtApiToLocal(v) {
    if (!v) return '';
    return String(v).replace(' ', 'T').slice(0, 16);
  }

  function emptyRow(colspan, text, icon) {
    return '<tr><td colspan="' + colspan + '">' +
      '<div class="ces-empty"><i class="bi ' + (icon || 'bi-inbox') + '"></i>' +
      esc(text) + '</div></td></tr>';
  }

  function loadingRow(colspan) {
    return '<tr><td colspan="' + colspan + '" class="text-center text-muted py-4">載入中…</td></tr>';
  }

  function num(v) {
    var n = Number(v);
    return isFinite(n) ? n : 0;
  }

  /* ---------- 1b. v1.1 資格白名單與多選 chips（契約 7.2 / 7.9） ---------- */
  var CLASS_OPTIONS = ['1A', '1B', '1C', '1D', '2A', '2B', '2C', '2D', '3A', '3B', '3C', '3D',
    '4A', '4B', '4C', '4D', '5A', '5B', '5C', '5D', '6A', '6B', '6C', '6D'];
  var GRADE_OPTIONS = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'];
  var CLUB_OPTIONS = ['學生會', '美術學會', '體育學會', '音樂學會', '戲劇學會',
    '義工團', '圖書館學會', '科學學會', '環保學會', '攝影學會'];

  var CHIP_GROUPS = {
    classes: { id: 'evClassesGroup', options: CLASS_OPTIONS },
    grades: { id: 'evGradesGroup', options: GRADE_OPTIONS },
    clubs: { id: 'evClubsGroup', options: CLUB_OPTIONS }
  };

  function chipInputs(groupKey) {
    var g = CHIP_GROUPS[groupKey];
    var host = g ? $(g.id) : null;
    return host ? host.querySelectorAll('input[type="checkbox"]') : [];
  }

  /** 以白名單建立 checkbox chips（值只來自常數，不從使用者輸入） */
  function buildChipGroup(groupKey) {
    var g = CHIP_GROUPS[groupKey];
    var host = g ? $(g.id) : null;
    if (!host || host.dataset.built === '1') return;

    host.innerHTML = '';
    g.options.forEach(function (val) {
      var label = document.createElement('label');
      label.className = 'chip-option';

      var input = document.createElement('input');
      input.type = 'checkbox';
      input.value = val;
      input.name = groupKey + 'Chip';

      var span = document.createElement('span');
      span.textContent = val;

      label.appendChild(input);
      label.appendChild(span);
      host.appendChild(label);
    });
    host.dataset.built = '1';
  }

  function buildAllChipGroups() {
    Object.keys(CHIP_GROUPS).forEach(buildChipGroup);
  }

  function chipSetAll(groupKey, checked) {
    var inputs = chipInputs(groupKey);
    for (var i = 0; i < inputs.length; i++) inputs[i].checked = checked;
  }

  /** 'ALL' / 空 / 白名單全部 → 全部勾選；否則只勾白名單內的值（非法值忽略） */
  function chipSetValue(groupKey, value) {
    var g = CHIP_GROUPS[groupKey];
    if (!g) return;

    var raw = String(value === null || value === undefined ? '' : value).trim();
    var isAll = (raw === '' || raw.toUpperCase() === 'ALL');
    var picked = {};

    if (!isAll) {
      raw.split(/[,，]/).forEach(function (s) {
        s = s.trim();
        if (s) picked[s.toUpperCase()] = true;
      });
      var covered = g.options.every(function (o) { return picked[o.toUpperCase()] === true; });
      if (covered) isAll = true;
    }

    var inputs = chipInputs(groupKey);
    for (var i = 0; i < inputs.length; i++) {
      inputs[i].checked = isAll || picked[g.options[i].toUpperCase()] === true;
    }
  }

  /** 勾選結果 → 'ALL'（全勾或全不勾）或逗號串 */
  function chipGetValue(groupKey) {
    var g = CHIP_GROUPS[groupKey];
    if (!g) return 'ALL';

    var inputs = chipInputs(groupKey);
    var picked = [];
    for (var i = 0; i < inputs.length; i++) {
      if (inputs[i].checked) picked.push(g.options[i]);
    }
    if (!picked.length || picked.length === g.options.length) return 'ALL';
    return picked.join(',');
  }

  /* ---------- 2. 頁面分派 ---------- */
  if (PAGE === 'admin') {
    initAdmin();
  } else if (PAGE === 'stats') {
    initStats();
  }

  /* =========================================================
   * 3. admin.html —— 活動管理 / 報名與點名 / 權限管理
   * =======================================================*/
  function initAdmin() {
    if (!$('adminTabs')) return;

    var allEvents = [];          // getEvents 原始資料
    var eventModal = null;       // Bootstrap Modal 實例
    var editingEventID = null;   // null=新增，否則=修改
    var hostOptionsLoaded = false;
    var participantsEventID = null; // 目前載入的活動（避免切換競態）
    var participantsEvent = null;   // 目前活動的 EventView（判斷 started / isMandatory）

    /* ---- 3.1 角色提示 / Tab 可見性 ---- */
    var hint = $('adminRoleHint');
    if (hint) {
      hint.textContent = isAdmin
        ? '您目前以「管理員」身份登入：可管理全部活動，並可在「權限管理」調整使用者角色。'
        : '您目前以「老師」身份登入：只能管理自己負責的活動，新增活動時負責老師預設為您。';
    }
    if (!isAdmin) {
      var navUsers = $('tabNavUsers');
      if (navUsers) navUsers.classList.add('d-none');
    }

    /* ---- 3.2 事件綁定（全部 addEventListener，無內聯 onclick） ---- */
    var btnCreate = $('btnCreateEvent');
    if (btnCreate) {
      btnCreate.addEventListener('click', function () { openEventModal(null); });
    }

    var eventTableBody = $('eventTableBody');
    if (eventTableBody) {
      eventTableBody.addEventListener('click', onEventTableClick);
    }

    var eventForm = $('eventForm');
    if (eventForm) {
      eventForm.addEventListener('submit', onEventSubmit);
    }

    // v1.1：資格多選 chips（班級 / 年級 / 學會）
    buildAllChipGroups();
    var eventModalBody = $('eventModal');
    if (eventModalBody) {
      eventModalBody.addEventListener('click', onChipActionClick);
      // v1.2：chips / requireOfficer 變更 → 防抖預覽資格人數（契約 8.5）
      eventModalBody.addEventListener('change', onEligibilityFieldChange);
    }

    if ($('eventModal') && typeof bootstrap !== 'undefined') {
      eventModal = new bootstrap.Modal($('eventModal'));
      $('eventModal').addEventListener('hidden.bs.modal', function () {
        clearFormInvalid($('eventForm'));
        // v1.2：關閉時取消未完成的預覽請求
        if (eligPreviewTimer) { clearTimeout(eligPreviewTimer); eligPreviewTimer = null; }
        eligPreviewSeq++;
      });
    } else if ($('eventModal')) {
      CES_UI.toast('Bootstrap 載入失敗，新增／修改活動視窗無法使用', 'warning');
    }

    var participantSelect = $('participantSelect');
    if (participantSelect) {
      participantSelect.addEventListener('change', function () { loadParticipants(); });
    }

    var confirmedBody = $('confirmedTableBody');
    if (confirmedBody) {
      confirmedBody.addEventListener('click', onAttendanceClick);
    }

    var userTableBody = $('userTableBody');
    if (userTableBody) {
      if (isAdmin) {
        userTableBody.addEventListener('change', onRoleChange);
      }
    }

    /* ---- 3.3 載入資料 ---- */
    loadEvents();
    if (isAdmin) loadUsers();

    /* ============ 活動管理 ============ */

    function findEvent(eventID) {
      for (var i = 0; i < allEvents.length; i++) {
        if (allEvents[i].eventID === eventID) return allEvents[i];
      }
      return null;
    }

    function canManage(ev) {
      return isAdmin || (ev && ev.hostID === user.userID);
    }

    function loadEvents() {
      var tbody = $('eventTableBody');
      if (tbody) tbody.innerHTML = loadingRow(8);
      return API.getEvents({ userID: user.userID }).then(function (data) {
        allEvents = (data && data.events) || [];
        renderEventTable();
        fillParticipantSelect();
      }).catch(function (err) {
        showError(err);
        if (tbody) tbody.innerHTML = emptyRow(8, '活動載入失敗，請稍後重新整理頁面', 'bi-exclamation-triangle');
        // 活動清單失敗時，報名分頁也不可用
        var sel = $('participantSelect');
        if (sel) {
          sel.innerHTML = '<option value="">（活動載入失敗）</option>';
          sel.disabled = true;
        }
        var hintEl = $('participantHint');
        if (hintEl) hintEl.textContent = '';
        renderQuota(null);
        clearParticipantTables('活動載入失敗，請稍後重試');
      });
    }

    function renderEventTable() {
      var tbody = $('eventTableBody');
      if (!tbody) return;

      if (!allEvents.length) {
        tbody.innerHTML = emptyRow(8, '暫無活動，點擊右上方「新增活動」建立第一個活動。');
        return;
      }

      tbody.innerHTML = allEvents.map(function (ev) {
        var manage = canManage(ev);
        var active = ev.status === 'Active';
        var quotaText = num(ev.maxQuota) > 0
          ? num(ev.registeredCount) + ' / ' + num(ev.maxQuota)
          : num(ev.registeredCount) + ' / 不限';
        var statusHtml = active
          ? '<span class="badge-status is-confirmed">開放中</span>'
          : '<span class="badge-status is-cancelled">已取消</span>';
        var editDisabled = !manage || !active;
        var cancelDisabled = !manage || !active;
        var disabledTitle = !manage ? '僅可管理自己負責的活動' : (!active ? '已取消的活動不可再操作' : '');
        var mandatoryBadge = ev.isMandatory === true
          ? ' <span class="badge-mandatory"><i class="bi bi-exclamation-circle"></i>必須參加</span>'
          : '';

        return '<tr>' +
          '<td class="col-id"><span class="tag tag-soft">' + esc(ev.eventID) + '</span></td>' +
          '<td>' +
            '<div class="fw-semibold">' + esc(ev.name) + mandatoryBadge + '</div>' +
            '<div class="muted small">' + esc(ev.location || '—') +
              (ev.hostName ? ' · 負責：' + esc(ev.hostName) : '') + '</div>' +
            '<div class="d-sm-none muted small mt-1">名額 ' + esc(quotaText) + ' · ' +
              (active ? '開放中' : '已取消') + '</div>' +
          '</td>' +
          '<td class="col-category"><span class="tag">' + esc(ev.category || '其他') + '</span></td>' +
          '<td class="text-nowrap col-time">' + esc(CES_UI.fmtDT(ev.eventStart)) +
            '<div class="muted small">至 ' + esc(CES_UI.fmtDT(ev.eventEnd)) + '</div></td>' +
          '<td class="text-nowrap col-regtime">' + esc(CES_UI.fmtDT(ev.regStart)) +
            '<div class="muted small">至 ' + esc(CES_UI.fmtDT(ev.regEnd)) + '</div></td>' +
          '<td class="text-nowrap">' + esc(quotaText) + '</td>' +
          '<td>' + statusHtml + '</td>' +
          '<td class="text-nowrap">' +
            '<button type="button" class="btn btn-sm btn-ces-ghost me-1" data-act="edit" data-id="' +
              esc(ev.eventID) + '"' + (editDisabled ? ' disabled' : '') +
              (disabledTitle ? ' title="' + esc(disabledTitle) + '"' : ' title="修改活動"') + '>' +
              '<i class="bi bi-pencil"></i> 修改</button>' +
            '<button type="button" class="btn btn-sm btn-outline-danger" data-act="cancel" data-id="' +
              esc(ev.eventID) + '"' + (cancelDisabled ? ' disabled' : '') +
              (disabledTitle ? ' title="' + esc(disabledTitle) + '"' : ' title="取消活動（軟刪除）"') + '>' +
              '<i class="bi bi-x-circle"></i> 取消活動</button>' +
          '</td>' +
        '</tr>';
      }).join('');
    }

    function onEventTableClick(e) {
      var btn = e.target.closest('button[data-act]');
      if (!btn || btn.disabled) return;
      var ev = findEvent(btn.dataset.id);
      if (!ev) return;

      if (!canManage(ev)) {
        CES_UI.toast('僅可管理自己負責的活動', 'warning');
        return;
      }
      if (btn.dataset.act === 'edit') {
        openEventModal(ev);
      } else if (btn.dataset.act === 'cancel') {
        confirmCancelEvent(ev, btn);
      }
    }

    function confirmCancelEvent(ev, btn) {
      CES_UI.confirmDialog({
        title: '取消活動',
        body: '<p class="mb-1">確定要取消活動「<strong>' + esc(ev.name) + '</strong>」嗎？</p>' +
          '<p class="muted small mb-0">取消後活動會標記為「已取消」（軟刪除），不再顯示於前台列表與日曆。</p>',
        okText: '確定取消',
        cancelText: '返回'
      }).then(function (ok) {
        if (!ok) return;
        setBusy(btn, true, '處理中…');
        API.manageEvent(user.userID, 'cancel', { eventID: ev.eventID }).then(function () {
          CES_UI.toast('活動已取消', 'success');
          return loadEvents();
        }).catch(showError).then(function () {
          setBusy(btn, false);
        });
      });
    }

    /* ---- 3.4 新增 / 修改 Modal ---- */

    function ensureCategoryOption(cat) {
      var sel = $('evCategory');
      if (!sel || !cat) return;
      var exists = false;
      for (var i = 0; i < sel.options.length; i++) {
        if (sel.options[i].value === cat) { exists = true; break; }
      }
      if (!exists) {
        var opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        sel.appendChild(opt);
      }
    }

    /** chips 的「全選 / 清除」按鈕（事件委派，無內聯 onclick） */
    function onChipActionClick(e) {
      var allBtn = e.target.closest('button[data-chip-all]');
      if (allBtn) {
        chipSetAll(allBtn.dataset.chipAll, true);
        scheduleEligibilityPreview(false); // v1.2：按鈕不會觸發 change，手動更新預覽
        return;
      }
      var noneBtn = e.target.closest('button[data-chip-none]');
      if (noneBtn) {
        chipSetAll(noneBtn.dataset.chipNone, false);
        scheduleEligibilityPreview(false);
      }
    }

    /* ---- v1.2：資格人數即時預覽（契約 8.2 / 8.5） ---- */
    var eligPreviewTimer = null;
    var eligPreviewSeq = 0;
    var ELIG_PREVIEW_DEBOUNCE_MS = 400;

    /** chips / 僅限學生幹事 變更 → 防抖 400ms 查詢 */
    function onEligibilityFieldChange(e) {
      var t = e.target;
      if (!t) return;
      var isChip = t.matches && t.matches('.chip-group input[type="checkbox"]');
      var isOfficer = t.id === 'evRequireOfficer';
      if (!isChip && !isOfficer) return;
      scheduleEligibilityPreview(false);
    }

    /** immediate=true 用於初次開啟 modal（契約 8.5：初次也查一次） */
    function scheduleEligibilityPreview(immediate) {
      if (eligPreviewTimer) clearTimeout(eligPreviewTimer);
      eligPreviewTimer = setTimeout(function () {
        eligPreviewTimer = null;
        refreshEligibilityPreview();
      }, immediate ? 0 : ELIG_PREVIEW_DEBOUNCE_MS);
    }

    function setEligibilityPreviewHtml(html) {
      var host = $('eligibilityPreview');
      if (host) host.innerHTML = html;
    }

    /** 顯示「符合條件的學生：N 人」；N=0 紅色警告；失敗灰字且不擋儲存 */
    function refreshEligibilityPreview() {
      var host = $('eligibilityPreview');
      if (!host) return;

      var seq = ++eligPreviewSeq;
      var payload = {
        userID: user.userID,
        classes: chipGetValue('classes'),
        grades: chipGetValue('grades'),
        clubs: chipGetValue('clubs'),
        requireOfficer: $('evRequireOfficer') ? $('evRequireOfficer').checked === true : false
      };

      setEligibilityPreviewHtml('<span class="text-muted">正在計算符合條件的學生…</span>');

      API.previewEligibility(payload).then(function (data) {
        if (seq !== eligPreviewSeq) return; // 較舊的回應，丟棄（避免競態）
        var count = num(data && data.count);
        if (count <= 0) {
          setEligibilityPreviewHtml(
            '<div class="alert alert-danger d-flex align-items-start gap-2 py-2 mb-0" role="alert">' +
              '<i class="bi bi-exclamation-triangle-fill mt-1"></i>' +
              '<div><strong>目前沒有學生符合，這個活動將無人可報名</strong>' +
                '<div class="small mt-1">請放寬班級／年級／學會條件，或取消「僅限學生幹事報名」。</div>' +
              '</div>' +
            '</div>'
          );
          return;
        }
        var students = (data && data.students) || [];
        var examples = students.slice(0, 2).map(function (s) {
          return s.name + (s.className ? ' ' + s.className : '');
        });
        setEligibilityPreviewHtml(
          '<div class="text-success">' +
            '<i class="bi bi-people me-1"></i><strong>符合條件的學生：' + count + ' 人</strong>' +
            (examples.length ? '<span class="muted">（例：' + esc(examples.join('、')) + '）</span>' : '') +
          '</div>'
        );
      }).catch(function () {
        if (seq !== eligPreviewSeq) return;
        // 後端尚未實作 / 其他錯誤：只顯示灰字，不影響儲存（契約 8.5）
        setEligibilityPreviewHtml(
          '<span class="text-muted"><i class="bi bi-question-circle me-1"></i>無法預覽資格人數</span>'
        );
      });
    }

    function openEventModal(ev) {
      var form = $('eventForm');
      if (!form) return;
      editingEventID = ev ? ev.eventID : null;

      form.reset();
      clearFormInvalid(form);

      var title = $('eventModalTitle');
      if (title) {
        title.innerHTML = ev
          ? '<i class="bi bi-pencil-square me-1"></i>修改活動'
          : '<i class="bi bi-plus-circle me-1"></i>新增活動';
      }

      // 預設值（資格 chips：全部勾選 = ALL）
      chipSetValue('classes', 'ALL');
      chipSetValue('grades', 'ALL');
      chipSetValue('clubs', 'ALL');
      $('evRequireOfficer').checked = false;
      $('evIsMandatory').checked = false;
      $('evMaxQuota').value = '0';
      $('evDescription').value = '';

      if (ev) {
        $('evName').value = ev.name || '';
        ensureCategoryOption(ev.category);
        $('evCategory').value = ev.category || '其他';
        $('evLocation').value = ev.location || '';
        $('evRegStart').value = dtApiToLocal(ev.regStart);
        $('evRegEnd').value = dtApiToLocal(ev.regEnd);
        $('evEventStart').value = dtApiToLocal(ev.eventStart);
        $('evEventEnd').value = dtApiToLocal(ev.eventEnd);
        chipSetValue('classes', ev.eligibleClasses);
        chipSetValue('grades', ev.eligibleGrades);
        chipSetValue('clubs', ev.eligibleClubs);
        $('evRequireOfficer').checked = ev.requireOfficer === true;
        $('evIsMandatory').checked = ev.isMandatory === true;
        $('evMaxQuota').value = String(num(ev.maxQuota));
        $('evDescription').value = ev.description || '';
      } else {
        $('evCategory').value = '其他';
      }

      // 負責老師：僅 Admin 可見可改
      var hostWrap = $('hostFieldWrap');
      if (isAdmin) {
        if (hostWrap) hostWrap.classList.remove('d-none');
        loadHostOptions(ev ? ev.hostID : user.userID);
      } else {
        if (hostWrap) hostWrap.classList.add('d-none');
      }

      // v1.2：初次開啟自動查一次資格人數（全 ALL → 5 人）；修改時依回填值查詢
      setEligibilityPreviewHtml('');
      scheduleEligibilityPreview(true);

      if (eventModal) eventModal.show();
    }

    /** 設定 host select 的值；若不在選項中則補一個選項，避免誤改成自己 */
    function setHostValue(sel, value) {
      if (!sel || !value) return;
      var exists = false;
      for (var i = 0; i < sel.options.length; i++) {
        if (sel.options[i].value === value) { exists = true; break; }
      }
      if (!exists) {
        var opt = document.createElement('option');
        opt.value = value;
        opt.textContent = value;
        sel.appendChild(opt);
      }
      sel.value = value;
    }

    function loadHostOptions(selectedValue) {
      if (!isAdmin) return;
      var sel = $('evHost');
      if (!sel) return;

      if (hostOptionsLoaded) {
        setHostValue(sel, selectedValue || user.userID);
        return;
      }

      // 先把操作者自己放進去，避免 API 失敗時無選項
      sel.innerHTML = '<option value="' + esc(user.userID) + '">' +
        esc(user.name + '（' + user.userID + '，' + CES_UI.roleLabel(user.role) + '）') +
        '</option>';
      sel.value = user.userID;

      API.getUsers(user.userID).then(function (data) {
        var list = (data && data.users) || [];
        var options = list.filter(function (u) {
          return u.role === 'Teacher' || u.role === 'Admin';
        });
        var hasSelf = options.some(function (u) { return u.userID === user.userID; });
        if (!hasSelf) {
          options.unshift({ userID: user.userID, name: user.name, role: user.role });
        }
        sel.innerHTML = options.map(function (u) {
          return '<option value="' + esc(u.userID) + '">' +
            esc(u.name + '（' + u.userID + '，' + CES_UI.roleLabel(u.role) + '）') +
            '</option>';
        }).join('');
        hostOptionsLoaded = true;
        setHostValue(sel, selectedValue || user.userID);
      }).catch(function (err) {
        // 載入老師清單失敗不阻斷建立活動，維持預設自己
        hostOptionsLoaded = true;
        if (window.console && console.warn) console.warn('載入負責老師清單失敗', err);
        setHostValue(sel, selectedValue || user.userID);
      });
    }

    function markInvalid(id, msg) {
      var el = $(id);
      if (!el) return;
      el.classList.add('is-invalid');
      var parent = el.parentElement;
      var fb = parent ? parent.querySelector('.invalid-feedback') : null;
      if (fb && msg) fb.textContent = msg;
    }

    function clearFormInvalid(form) {
      if (!form) return;
      var list = form.querySelectorAll('.is-invalid');
      for (var i = 0; i < list.length; i++) list[i].classList.remove('is-invalid');
    }

    /** 前端驗證；通過回傳 event 物件，否則 null（錯誤以 .is-invalid 呈現） */
    function validateEventForm() {
      var form = $('eventForm');
      clearFormInvalid(form);

      var name = $('evName').value.trim();
      var location = $('evLocation').value.trim();
      var regStart = dtLocalToApi($('evRegStart').value);
      var regEnd = dtLocalToApi($('evRegEnd').value);
      var eventStart = dtLocalToApi($('evEventStart').value);
      var eventEnd = dtLocalToApi($('evEventEnd').value);
      var maxQuotaRaw = $('evMaxQuota').value.trim();
      var maxQuota = Number(maxQuotaRaw);
      var ok = true;

      // 必填
      if (!name) { markInvalid('evName', '請填寫活動名稱'); ok = false; }
      if (!location) { markInvalid('evLocation', '請填寫活動地點'); ok = false; }
      if (!regStart) { markInvalid('evRegStart', '請選擇報名開始時間'); ok = false; }
      if (!regEnd) { markInvalid('evRegEnd', '請選擇報名截止時間'); ok = false; }
      if (!eventStart) { markInvalid('evEventStart', '請選擇活動開始時間'); ok = false; }
      if (!eventEnd) { markInvalid('evEventEnd', '請選擇活動結束時間'); ok = false; }

      // 名額：≥0 整數（0 表示不限）
      if (maxQuotaRaw === '' || !isFinite(maxQuota) || Math.floor(maxQuota) !== maxQuota || maxQuota < 0) {
        markInvalid('evMaxQuota', '名額需為大於或等於 0 的整數（0 表示不限）');
        ok = false;
      }

      // 時間順序：RegStart < RegEnd < EventStart < EventEnd
      if (regStart && regEnd && !(regStart < regEnd)) {
        markInvalid('evRegEnd', '報名截止必須晚於報名開始');
        ok = false;
      }
      if (regEnd && eventStart && !(regEnd < eventStart)) {
        markInvalid('evEventStart', '活動開始必須晚於報名截止');
        ok = false;
      }
      if (eventStart && eventEnd && !(eventStart < eventEnd)) {
        markInvalid('evEventEnd', '活動結束必須晚於活動開始');
        ok = false;
      }

      if (!ok) {
        var first = form ? form.querySelector('.is-invalid') : null;
        if (first && first.focus) first.focus();
        return null;
      }

      var hostValue = (isAdmin && $('evHost') && $('evHost').value) ? $('evHost').value : user.userID;

      return {
        name: name,
        category: $('evCategory').value || '其他',
        location: location,
        regStart: regStart,
        regEnd: regEnd,
        eventStart: eventStart,
        eventEnd: eventEnd,
        // v1.1：資格由 chips 決定（白名單值；全勾／全不勾 → ALL；部分 → 逗號串）
        eligibleClasses: chipGetValue('classes'),
        eligibleGrades: chipGetValue('grades'),
        eligibleClubs: chipGetValue('clubs'),
        requireOfficer: $('evRequireOfficer').checked === true,
        isMandatory: $('evIsMandatory').checked === true,
        maxQuota: maxQuota,
        hostID: hostValue,
        description: $('evDescription').value.trim()
      };
    }

    function onEventSubmit(e) {
      e.preventDefault();
      var payload = validateEventForm();
      if (!payload) return;

      var mode = editingEventID ? 'update' : 'create';
      if (editingEventID) payload.eventID = editingEventID;

      var btn = $('eventSubmitBtn');
      setBusy(btn, true, '儲存中…');

      API.manageEvent(user.userID, mode, payload).then(function (data) {
        var msg = mode === 'create'
          ? '活動已建立' + (data && data.eventID ? '（編號：' + data.eventID + '）' : '')
          : '活動已更新';
        CES_UI.toast(msg, 'success');

        // v1.1：必須參加活動會自動報名，回報自動加入人數
        var autoEnrolled = data ? num(data.autoEnrolled) : 0;
        if (autoEnrolled > 0) {
          CES_UI.toast('已自動為 ' + autoEnrolled + ' 位合資格學生報名（必須參加活動）', 'info');
        }

        if (eventModal) eventModal.hide();
        return loadEvents();
      }).catch(showError).then(function () {
        setBusy(btn, false);
      });
    }

    /* ============ 報名與點名 ============ */

    function fillParticipantSelect() {
      var sel = $('participantSelect');
      if (!sel) return;
      var prev = sel.value;

      var active = allEvents.filter(function (ev) { return ev.status === 'Active'; });
      if (!isAdmin) {
        active = active.filter(function (ev) { return ev.hostID === user.userID; });
      }

      var hintEl = $('participantHint');

      if (!active.length) {
        sel.innerHTML = '<option value="">（暫無可管理的活動）</option>';
        sel.disabled = true;
        if (hintEl) {
          hintEl.textContent = isAdmin ? '目前沒有開放中的活動' : '您目前沒有負責的開放中活動';
        }
        renderQuota(null);
        clearParticipantTables('暫無活動可顯示');
        return;
      }

      sel.disabled = false;
      sel.innerHTML = active.map(function (ev) {
        return '<option value="' + esc(ev.eventID) + '">' +
          esc(ev.name + '（' + CES_UI.fmtDT(ev.eventStart) + '）') + '</option>';
      }).join('');

      var keep = active.some(function (ev) { return ev.eventID === prev; });
      if (keep) sel.value = prev;

      loadParticipants();
    }

    function clearParticipantTables(text) {
      var c = $('confirmedTableBody');
      var w = $('waitlistTableBody');
      if (c) c.innerHTML = emptyRow(7, text || '暫無資料');
      if (w) w.innerHTML = emptyRow(5, text || '暫無資料');
      participantsEvent = null;
      renderNotice(null);
    }

    function loadParticipants() {
      var sel = $('participantSelect');
      var eventID = sel ? sel.value : '';
      if (!eventID) return;
      participantsEventID = eventID;

      var c = $('confirmedTableBody');
      var w = $('waitlistTableBody');
      if (c) c.innerHTML = loadingRow(7);
      if (w) w.innerHTML = loadingRow(5);

      API.getParticipantList(eventID, user.userID).then(function (data) {
        if (participantsEventID !== eventID) return; // 使用者已切換活動
        renderParticipants(data || {});
      }).catch(function (err) {
        if (participantsEventID !== eventID) return;
        showError(err);
        clearParticipantTables('名單載入失敗，請稍後重試');
      });
    }

    function renderQuota(ev, waitlistCount, confirmedFallback) {
      var host = $('participantQuota');
      if (!host) return;
      if (!ev) { host.innerHTML = ''; return; }

      var max = num(ev.maxQuota);
      var used = ev.registeredCount !== undefined && ev.registeredCount !== null
        ? num(ev.registeredCount)
        : num(confirmedFallback);
      var wait = num(waitlistCount);
      var pct = max > 0 ? Math.min(100, Math.round(used / max * 100)) : 0;
      var remainText = max > 0 ? ('剩餘 ' + Math.max(0, max - used) + ' 個名額') : '名額不限';

      host.innerHTML = '<div class="ces-quota">' +
        '<div class="d-flex justify-content-between mb-1">' +
        '<span>已確認 <strong>' + used + '</strong> / ' + (max > 0 ? max : '不限') + '</span>' +
        '<span class="muted">' + esc(remainText) + ' · 候補 ' + wait + ' 人</span>' +
        '</div>' +
        '<div class="progress"><div class="progress-bar" role="progressbar" style="width:' + pct + '%"></div></div>' +
        '</div>';
    }

    /** task-5：必須參加 / 未開始 提示（容器 #participantNotice） */
    function renderNotice(ev) {
      var host = $('participantNotice');
      if (!host) return;

      var html = '';
      if (ev && ev.isMandatory === true) {
        html += '<div class="alert alert-danger d-flex align-items-start gap-2 py-2 mb-2" role="alert">' +
          '<i class="bi bi-exclamation-circle-fill mt-1"></i>' +
          '<div><strong>必須參加</strong>：此活動已自動為合資格學生報名，請於活動開始後為出席者點名。</div>' +
          '</div>';
      }
      if (ev && ev.started === false) {
        html += '<div class="alert alert-warning d-flex align-items-start gap-2 py-2 mb-2" role="alert">' +
          '<i class="bi bi-clock-history mt-1"></i>' +
          '<div>活動尚未開始（開始時間 ' + esc(CES_UI.fmtDT(ev.eventStart)) + '），暫不可點名。</div>' +
          '</div>';
      }
      host.innerHTML = html;
    }

    function renderParticipants(data) {
      var ev = data.event || {};
      var confirmed = data.confirmed || [];
      var waitlist = data.waitlist || [];

      participantsEvent = ev;
      renderNotice(ev);

      var hintEl = $('participantHint');
      if (hintEl) hintEl.textContent = ev.name ? ('目前活動：' + ev.name) : '';

      renderQuota(ev, waitlist.length, confirmed.length);

      // v1.1：舊後端沒有 started 欄位時視為已開始（不鎖點名）
      var started = ev.started !== false;

      var c = $('confirmedTableBody');
      if (c) {
        if (!confirmed.length) {
          c.innerHTML = emptyRow(7, '目前沒有已確認的報名者');
        } else {
          c.innerHTML = confirmed.map(function (p) {
            var attended = p.attended === 'Yes';
            return '<tr>' +
              '<td><span class="tag tag-soft">' + esc(p.userID) + '</span></td>' +
              '<td>' + esc(p.name) + '</td>' +
              '<td class="col-class">' + esc(p.class || '—') + '</td>' +
              '<td class="col-grade">' + esc(p.grade || '—') + '</td>' +
              '<td class="text-nowrap col-regtime">' + esc(CES_UI.fmtDT(p.regTime)) + '</td>' +
              '<td>' + (attended
                ? '<span class="badge-status is-confirmed">已出席</span>'
                : '<span class="badge-status is-none">未出席</span>') + '</td>' +
              '<td class="text-nowrap">' + (started
                ? '<button type="button" class="btn btn-sm ' +
                    (attended ? 'btn-outline-secondary' : 'btn-ces-ghost') +
                    '" data-attend="' + (attended ? 'No' : 'Yes') +
                    '" data-id="' + esc(p.userID) + '">' +
                    (attended
                      ? '<i class="bi bi-arrow-counterclockwise"></i> 取消出席'
                      : '<i class="bi bi-check2-circle"></i> 標記出席') +
                  '</button>'
                : '<span class="lock-note" title="活動尚未開始，不能點名"><i class="bi bi-lock"></i> 活動開始後可點名</span>') +
              '</td>' +
            '</tr>';
          }).join('');
        }
      }

      var w = $('waitlistTableBody');
      if (w) {
        if (!waitlist.length) {
          w.innerHTML = emptyRow(5, '目前沒有候補者');
        } else {
          w.innerHTML = waitlist.map(function (p) {
            return '<tr>' +
              '<td><span class="tag tag-soft">' + esc(p.userID) + '</span></td>' +
              '<td>' + esc(p.name) + '</td>' +
              '<td class="col-class">' + esc(p.class || '—') + '</td>' +
              '<td class="col-grade">' + esc(p.grade || '—') + '</td>' +
              '<td class="text-nowrap col-regtime">' + esc(CES_UI.fmtDT(p.regTime)) + '</td>' +
            '</tr>';
          }).join('');
        }
      }
    }

    function onAttendanceClick(e) {
      var btn = e.target.closest('button[data-attend]');
      if (!btn || btn.disabled) return;

      // v1.1：活動未開始不可點名（後端亦會回 EVENT_NOT_STARTED）
      if (participantsEvent && participantsEvent.started === false) {
        CES_UI.toast('活動尚未開始，不能點名', 'warning');
        return;
      }

      var targetUserID = btn.dataset.id;
      var attended = btn.dataset.attend === 'No' ? 'No' : 'Yes';
      if (!participantsEventID) return;

      setBusy(btn, true, '處理中…');
      API.markAttendance(participantsEventID, user.userID, targetUserID, attended)
        .then(function () {
          CES_UI.toast(attended === 'Yes' ? '已標記為出席' : '已取消出席標記', 'success');
          loadParticipants();
        })
        .catch(showError)
        .then(function () { setBusy(btn, false); });
    }

    /* ============ 權限管理（僅 Admin） ============ */

    function loadUsers() {
      var tbody = $('userTableBody');
      if (!tbody || !isAdmin) return;
      tbody.innerHTML = loadingRow(7);

      API.getUsers(user.userID).then(function (data) {
        var users = (data && data.users) || [];
        if (!users.length) {
          tbody.innerHTML = emptyRow(7, '暫無使用者資料');
          return;
        }
        tbody.innerHTML = users.map(function (u) {
          var self = u.userID === user.userID;
          var options = ['Student', 'Teacher', 'Admin'].map(function (r) {
            return '<option value="' + r + '"' + (u.role === r ? ' selected' : '') + '>' +
              CES_UI.roleLabel(r) + '（' + r + '）</option>';
          }).join('');

          return '<tr>' +
            '<td><span class="tag tag-soft">' + esc(u.userID) + '</span></td>' +
            '<td>' + esc(u.name) + (self ? ' <span class="tag tag-soft">本人</span>' : '') + '</td>' +
            '<td>' +
              '<select class="form-select form-select-sm" style="min-width: 11rem;"' +
                ' data-role-select data-id="' + esc(u.userID) + '"' +
                ' data-name="' + esc(u.name) + '" data-prev="' + esc(u.role) + '"' +
                (self ? ' disabled title="不能修改自己的角色"' : '') + '>' +
                options +
              '</select>' +
            '</td>' +
            '<td>' + esc(u.email || '—') + '</td>' +
            '<td>' + esc(u.class || '—') + '</td>' +
            '<td>' + esc(u.grade || '—') + '</td>' +
            '<td>' + esc(u.club || '—') + '</td>' +
          '</tr>';
        }).join('');
      }).catch(function (err) {
        showError(err);
        tbody.innerHTML = emptyRow(7, '使用者資料載入失敗，請重新整理頁面', 'bi-exclamation-triangle');
      });
    }

    function onRoleChange(e) {
      var sel = e.target.closest('select[data-role-select]');
      if (!sel) return;

      var targetID = sel.dataset.id;
      var targetName = sel.dataset.name || targetID;
      var prevRole = sel.dataset.prev || sel.value;
      var newRole = sel.value;

      if (targetID === user.userID) {
        sel.value = prevRole;
        CES_UI.toast('不能修改自己的角色', 'warning');
        return;
      }
      if (newRole === prevRole) return;

      CES_UI.confirmDialog({
        title: '變更使用者角色',
        body: '<p class="mb-1">確定要將 <strong>' + esc(targetName) + '</strong>（' + esc(targetID) +
          '）的角色由「' + esc(CES_UI.roleLabel(prevRole)) + '」變更為「' +
          esc(CES_UI.roleLabel(newRole)) + '」嗎？</p>' +
          '<p class="muted small mb-0">變更後該使用者需重新登入才會生效。</p>',
        okText: '確定變更',
        cancelText: '取消'
      }).then(function (ok) {
        if (!ok) { sel.value = prevRole; return; }
        sel.disabled = true;
        API.updateUserRole(user.userID, targetID, newRole).then(function () {
          CES_UI.toast('已將「' + targetName + '」的角色更新為「' + CES_UI.roleLabel(newRole) + '」', 'success');
          // 重新載入使用者清單（角色變更會影響權限顯示）
          return loadUsers();
        }).catch(function (err) {
          sel.value = prevRole;
          sel.disabled = false;
          showError(err);
        });
      });
    }
  }

  /* =========================================================
   * 4. stats.html —— 數據報表 + Chart.js
   * =======================================================*/
  function initStats() {
    if (!$('statEventTableBody')) return;

    var charts = { attendance: null, byClass: null, byCategory: null };

    /* ---- 4.1 圖表工具 ---- */
    function destroyChart(key) {
      if (charts[key]) {
        charts[key].destroy();
        charts[key] = null;
      }
    }

    function createChart(key, canvas, config) {
      if (!canvas) return;
      if (typeof Chart === 'undefined') {
        CES_UI.toast('Chart.js 載入失敗，請檢查網絡後重新整理頁面', 'warning');
        return;
      }
      destroyChart(key);
      charts[key] = new Chart(canvas, config);
    }

    function toggleEmpty(emptyId, show, canvasId) {
      var emptyEl = $(emptyId);
      var canvas = $(canvasId);
      if (emptyEl) emptyEl.classList.toggle('d-none', !show);
      if (canvas) canvas.classList.toggle('d-none', show);
    }

    function setText(id, text) {
      var el = $(id);
      if (el) el.textContent = text;
    }

    /* ---- 4.2 載入資料 ---- */
    loadStats();

    function loadStats() {
      var meta = $('statsHeroMeta');
      if (meta) meta.textContent = '登入身份：' + user.name + '（' + CES_UI.roleLabel(user.role) + '）';

      API.getDashboardStats(user.userID).then(function (data) {
        renderStats(data || {});
      }).catch(function (err) {
        showError(err);
        setText('statEvents', '—');
        setText('statRegistrations', '—');
        setText('statConfirmed', '—');
        setText('statAttendance', '—');
        var tbody = $('statEventTableBody');
        if (tbody) tbody.innerHTML = emptyRow(5, '統計資料載入失敗，請稍後重新整理頁面', 'bi-exclamation-triangle');
        toggleEmpty('attendanceEmpty', true, 'chartAttendance');
        toggleEmpty('byClassEmpty', true, 'chartByClass');
        toggleEmpty('byCategoryEmpty', true, 'chartByCategory');
      });
    }

    function renderStats(data) {
      var totals = data.totals || {};
      var byEvent = data.byEvent || [];
      var waitTotal = 0;
      byEvent.forEach(function (ev) { waitTotal += num(ev.waitlist); });

      // v1.1：統計卡標籤（stats.html 不在本次寫入範圍，改由 JS 設定）
      var rateLabel = document.querySelector('.ces-stat.stat-red .ces-stat-label');
      if (rateLabel) rateLabel.textContent = '平均出席率（已開始活動）';

      // 4 張統計卡
      setText('statEvents', num(totals.events));
      setText('statEventsSub', '開放中 ' + num(totals.activeEvents) + ' 個');
      setText('statRegistrations', num(totals.registrations));
      setText('statRegistrationsSub', '其中候補 ' + waitTotal + ' 人次');
      setText('statConfirmed', num(totals.confirmed));
      setText('statConfirmedSub', '已出席 ' + num(totals.attended) + ' 人次');

      var rate = Number(totals.attendanceRate);
      setText('statAttendance', isFinite(rate) ? rate.toFixed(1) + '%' : '—');
      // v1.1：出席率只統計已開始活動，小字顯示已開始/總場數
      setText('statAttendanceSub', totals.startedEvents !== undefined
        ? '已開始 ' + num(totals.startedEvents) + ' / 共 ' + num(totals.events) + ' 場'
        : '出席 / 已確認 × 100%');

      renderAttendanceChart(totals);
      renderClassChart(data.byClass || []);
      renderCategoryChart(data.byCategory || []);
      renderEventTable(byEvent);
    }

    function renderAttendanceChart(totals) {
      totals = totals || {};

      // 契約 8.3：圓餅圖只認 totals.attendance（只計已開始活動的 Confirmed）；
      // 舊後端沒有 attendance 時 fallback 用 v1.1 口徑（totals.attended / totals.confirmed）。
      var att = (totals.attendance && typeof totals.attendance === 'object') ? totals.attendance : null;
      var attended, absent, eventCount, eventNames;
      var usingAttendance = !!att;

      if (att) {
        attended = num(att.attended);
        absent = num(att.confirmed) - attended;
        if (att.confirmed === undefined || att.confirmed === null || !isFinite(Number(att.confirmed))) {
          absent = num(att.absent);
        }
        absent = Math.max(0, absent);
        eventCount = num(att.eventCount);
        eventNames = att.eventNames || [];
      } else {
        attended = num(totals.attended);
        absent = Math.max(0, num(totals.confirmed) - attended);
        eventCount = num(totals.startedEvents);
        eventNames = [];
      }

      var total = attended + absent;

      // 契約 8.3：標題固定「已開始活動的出席情況」；副標顯示納入的活動數與名稱
      var titleEl = $('attendanceChartTitle');
      if (titleEl) titleEl.textContent = '已開始活動的出席情況';
      var subEl = $('attendanceChartSub');
      if (subEl) {
        subEl.textContent = usingAttendance
          ? '納入 ' + eventCount + ' 場已開始活動' +
            (eventNames.length ? '：' + eventNames.join('、') : '')
          : '已出席 vs 未出席';
      }

      // 空狀態文案：新口徑下明確是「已開始活動」
      var emptyEl = $('attendanceEmpty');
      if (emptyEl) {
        emptyEl.innerHTML = '<i class="bi bi-pie-chart"></i>' +
          (usingAttendance ? '目前已開始活動暫無已確認的報名資料' : '暫無已確認的報名資料');
      }

      var canvas = $('chartAttendance');
      if (!canvas) return;

      if (total <= 0) {
        toggleEmpty('attendanceEmpty', true, 'chartAttendance');
        destroyChart('attendance');
        return;
      }
      toggleEmpty('attendanceEmpty', false, 'chartAttendance');

      createChart('attendance', canvas, {
        type: 'doughnut',
        data: {
          labels: ['已出席 ' + attended + ' 人次', '未出席 ' + absent + ' 人次'],
          datasets: [{
            data: [attended, absent],
            backgroundColor: ['#1b8a5a', '#d7263d'],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          aspectRatio: 1.7,
          plugins: {
            legend: { position: 'bottom' },
            tooltip: {
              callbacks: {
                label: function (ctx) {
                  var pct = total > 0 ? (ctx.parsed / total * 100).toFixed(1) : '0.0';
                  return ctx.label + '（' + pct + '%）';
                }
              }
            }
          }
        }
      });
    }

    function renderClassChart(byClass) {
      var canvas = $('chartByClass');
      if (!canvas) return;

      if (!byClass.length) {
        toggleEmpty('byClassEmpty', true, 'chartByClass');
        destroyChart('byClass');
        return;
      }
      toggleEmpty('byClassEmpty', false, 'chartByClass');

      createChart('byClass', canvas, {
        type: 'bar',
        data: {
          labels: byClass.map(function (it) { return it['class'] || '未分班'; }),
          datasets: [{
            label: '參與人次',
            data: byClass.map(function (it) { return num(it.count); }),
            backgroundColor: '#2b6cb0',
            borderRadius: 6,
            maxBarThickness: 48
          }]
        },
        options: {
          responsive: true,
          aspectRatio: 2,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, ticks: { precision: 0 } }
          }
        }
      });
    }

    function renderCategoryChart(byCategory) {
      var canvas = $('chartByCategory');
      if (!canvas) return;

      if (!byCategory.length) {
        toggleEmpty('byCategoryEmpty', true, 'chartByCategory');
        destroyChart('byCategory');
        return;
      }
      toggleEmpty('byCategoryEmpty', false, 'chartByCategory');

      var palette = ['#16324f', '#2b6cb0', '#1b8a5a', '#d99a1b', '#d7263d', '#6b7280'];

      createChart('byCategory', canvas, {
        type: 'bar',
        data: {
          labels: byCategory.map(function (it) { return it.category || '其他'; }),
          datasets: [{
            label: '報名數',
            data: byCategory.map(function (it) {
              return it.registrations !== undefined ? num(it.registrations) : num(it.count);
            }),
            backgroundColor: byCategory.map(function (it, i) { return palette[i % palette.length]; }),
            borderRadius: 6,
            maxBarThickness: 28
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          aspectRatio: 4,
          plugins: { legend: { display: false } },
          scales: {
            x: { beginAtZero: true, ticks: { precision: 0 } }
          }
        }
      });
    }

    function renderEventTable(byEvent) {
      var tbody = $('statEventTableBody');
      if (!tbody) return;

      if (!byEvent.length) {
        tbody.innerHTML = emptyRow(5, '暫無活動統計資料');
        return;
      }

      tbody.innerHTML = byEvent.map(function (ev) {
        var confirmed = num(ev.confirmed);
        var attended = num(ev.attended);
        var rateText;

        // v1.1：未開始活動的出席率為 null → 灰字「未開始」；舊後端無此欄位時回退自行計算
        if (ev.attendanceRate === null) {
          rateText = '<span class="text-pending">未開始</span>';
        } else if (ev.attendanceRate !== undefined && isFinite(Number(ev.attendanceRate))) {
          rateText = Number(ev.attendanceRate).toFixed(1) + '%';
        } else {
          rateText = confirmed > 0 ? (attended / confirmed * 100).toFixed(1) + '%' : '—';
        }

        var mandatoryBadge = ev.isMandatory === true
          ? ' <span class="badge-mandatory"><i class="bi bi-exclamation-circle"></i>必須參加</span>'
          : '';

        return '<tr>' +
          '<td>' + esc(ev.name || ev.eventID || '—') + mandatoryBadge + '</td>' +
          '<td>' + confirmed + '</td>' +
          '<td>' + num(ev.waitlist) + '</td>' +
          '<td>' + attended + '</td>' +
          '<td>' + rateText + '</td>' +
        '</tr>';
      }).join('');
    }
  }
})();
