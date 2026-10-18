/* =============================================================
 * event.js — 活動列表（events.html）＋ 活動詳情（event_detail.html）
 * 依賴：api.js（window.API）、auth.js（window.CES_AUTH / window.CES_UI）
 * 分流：以 document.body.dataset.page 或頁面容器判斷要初始化哪一頁
 * ============================================================= */
(function () {
  'use strict';

  var BACKEND_MSG = '無法連接後端，請先啟動本地 mock server 或部署 GAS';

  /* =========================================================
   * 通用小工具
   * =======================================================*/
  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  function esc(v) { return CES_UI.escapeHtml(v); }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function nowText() {
    var d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
      ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  function isNetworkError(code) {
    return code === 'NETWORK_ERROR' || code === 'TIMEOUT' || code === 'BAD_RESPONSE' ||
      String(code || '').indexOf('HTTP_') === 0;
  }

  function isActive(e) { return (e && (e.status || 'Active')) === 'Active'; }

  function isBlank(v) { return v === undefined || v === null || v === ''; }

  function detailLink(e) {
    return 'event_detail.html?id=' + encodeURIComponent(e.eventID);
  }

  /* v1.1：「必須參加」活動（老師點名、自動報名、不可取消） */
  function isMandatory(e) { return !!(e && e.isMandatory === true); }

  function mandatoryBadge(e) {
    if (!isMandatory(e)) return '';
    return '<span class="badge-mandatory" title="必須參加（老師點名，不可取消報名）">' +
      '<i class="bi bi-exclamation-circle-fill"></i>必須參加</span>';
  }

  /* v1.1：後端回傳 started（now >= EventStart）；舊回應則以字串比較回退 */
  function hasStarted(e) {
    if (e && typeof e.started === 'boolean') return e.started;
    return !!(e && e.eventStart && e.eventStart <= nowText());
  }

  function eligibilityRules(e) {
    var parts = [];
    if (!isBlank(e.eligibleClasses) && e.eligibleClasses !== 'ALL') parts.push('班別：' + e.eligibleClasses);
    if (!isBlank(e.eligibleClubs) && e.eligibleClubs !== 'ALL') parts.push('學會：' + e.eligibleClubs);
    if (!isBlank(e.eligibleGrades) && e.eligibleGrades !== 'ALL') parts.push('年級：' + e.eligibleGrades);
    if (e.requireOfficer === true) parts.push('僅限幹事');
    return parts.length ? parts.join('；') : '不限（全體學生）';
  }

  function quotaPercent(e) {
    if (!e || !e.maxQuota || e.maxQuota <= 0) return 0;
    return Math.min(100, Math.round((e.registeredCount || 0) / e.maxQuota * 100));
  }

  function progressHtml(e) {
    return '<div class="progress"><div class="progress-bar bg-success" role="progressbar" ' +
      'data-pct="' + quotaPercent(e) + '"></div></div>';
  }

  /* 進度條寬度需在插入 DOM 後以 JS 設定（不新增 <style> 區塊） */
  function applyProgress(root) {
    (root || document).querySelectorAll('[data-pct]').forEach(function (bar) {
      var pct = Number(bar.getAttribute('data-pct')) || 0;
      bar.style.width = pct + '%';
      bar.setAttribute('aria-valuenow', String(pct));
      bar.setAttribute('aria-valuemin', '0');
      bar.setAttribute('aria-valuemax', '100');
    });
  }

  function emptyHtml(icon, msg) {
    return '<div class="ces-empty"><i class="bi ' + icon + '"></i>' + esc(msg) + '</div>';
  }

  /* =========================================================
   * 共用：報名 / 取消 / 錯誤提示
   * =======================================================*/
  function handleActionError(err) {
    var code = err && err.code;
    var msg = (err && err.message) || '';
    if (code === 'ALREADY_REGISTERED') CES_UI.toast('你已報名此活動', 'info');
    else if (code === 'REG_CLOSED') CES_UI.toast(msg || '報名已截止', 'warning');
    else if (code === 'NOT_ELIGIBLE') CES_UI.toast(msg || '不符合報名資格', 'warning');
    else if (code === 'EVENT_STARTED') CES_UI.toast('活動已開始，無法報名', 'warning');
    else if (code === 'NOT_REGISTERED') CES_UI.toast('你尚未報名此活動', 'warning');
    else if (code === 'MANDATORY_EVENT') {
      CES_UI.toast(msg || '必須參加的活動不可取消報名，請聯絡負責老師', 'warning');
    } else if (code === 'EVENT_NOT_STARTED') CES_UI.toast(msg || '活動尚未開始', 'warning');
    else if (code === 'NOT_FOUND') CES_UI.toast('找不到此活動', 'danger');
    else if (isNetworkError(code)) CES_UI.toast(BACKEND_MSG, 'danger');
    else CES_UI.toast(msg || '操作失敗，請稍後再試', 'danger');
  }

  /* 撞期 → 二次確認；回傳 Promise<boolean>（是否繼續報名） */
  function confirmConflict(err) {
    var conflicts = (err && err.data && err.data.conflicts) || [];
    var items = conflicts.map(function (c) {
      return '<li>' + esc(c.name) +
        '<span class="muted">（' + esc(CES_UI.fmtDT(c.eventStart)) +
        ' 至 ' + esc(CES_UI.fmtTime(c.eventEnd)) + '）</span></li>';
    }).join('');
    return CES_UI.confirmDialog({
      title: '活動時間衝突',
      body: '<p class="mb-2">系統檢測到你當天已有以下活動，仍要報名嗎？</p>' +
        '<ul class="mb-0">' + items + '</ul>',
      okText: '仍要報名',
      cancelText: '取消'
    });
  }

  function onRegisterSuccess(data, onSuccess) {
    var waitlist = data && data.status === 'Waitlist';
    CES_UI.toast(waitlist ? '名額已滿，已加入候補名單' : '報名成功', waitlist ? 'warning' : 'success');
    if (onSuccess) onSuccess();
  }

  /**
   * 報名（含撞期二次確認）
   * @param {string} eventID
   * @param {object} user
   * @param {function} onSuccess 成功後回呼
   * @param {function} onSettled 成功或失敗後都回呼（用於恢復按鈕狀態）
   */
  function doRegister(eventID, user, onSuccess, onSettled) {
    function done() { if (onSettled) onSettled(); }

    API.registerEvent(eventID, user.userID, false).then(function (data) {
      onRegisterSuccess(data, onSuccess);
      done();
    }).catch(function (err) {
      if (err && err.code === 'CONFLICT') {
        confirmConflict(err).then(function (ok) {
          if (!ok) { done(); return; }
          API.registerEvent(eventID, user.userID, true).then(function (data) {
            onRegisterSuccess(data, onSuccess);
            done();
          }).catch(function (e2) {
            handleActionError(e2);
            done();
          });
        });
        return;
      }
      handleActionError(err);
      done();
    });
  }

  function doCancel(eventID, user, eventName, isWaitlist, onSuccess) {
    var label = isWaitlist ? '取消候補' : '取消報名';
    CES_UI.confirmDialog({
      title: label,
      body: '<p class="mb-0">確定要' + esc(label) + '「' + esc(eventName || eventID) + '」嗎？</p>',
      okText: '確定取消',
      cancelText: '保留'
    }).then(function (ok) {
      if (!ok) return;
      API.cancelRegistration(eventID, user.userID).then(function (data) {
        var msg = isWaitlist ? '已取消候補' : '已取消報名';
        if (data && data.promoted) {
          msg += '；候補者 ' + (data.promoted.name || data.promoted.userID) + ' 已自動遞補';
        }
        CES_UI.toast(msg, 'success');
        if (onSuccess) onSuccess();
      }).catch(handleActionError);
    });
  }

  /* =========================================================
   * 一、活動列表頁 events.html
   * =======================================================*/
  var listState = {
    user: null,
    events: [],
    now: '',
    tab: 'all',
    keyword: '',
    sort: 'time',
    loading: false
  };

  function initEventsPage() {
    var user = CES_AUTH.requireLogin();
    if (!user) return;
    listState.user = user;
    CES_UI.renderNav('events');

    var tabs = document.getElementById('eventTabs');
    if (tabs) {
      tabs.addEventListener('click', function (ev) {
        var btn = ev.target.closest('[data-tab]');
        if (!btn) return;
        listState.tab = btn.getAttribute('data-tab');
        Array.prototype.forEach.call(tabs.querySelectorAll('[data-tab]'), function (b) {
          var active = b === btn;
          b.classList.toggle('active', active);
          b.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        renderEventsList();
      });
    }

    var search = document.getElementById('searchInput');
    if (search) {
      search.addEventListener('input', function () {
        listState.keyword = search.value.trim().toLowerCase();
        renderEventsList();
      });
    }

    var sort = document.getElementById('sortSelect');
    if (sort) {
      sort.addEventListener('change', function () {
        listState.sort = sort.value === 'latest' ? 'latest' : 'time';
        loadEvents();
      });
    }

    var panel = document.getElementById('eventsPanel');
    if (panel) {
      panel.addEventListener('click', function (ev) {
        var btn = ev.target.closest('[data-action]');
        if (!btn) return;
        var action = btn.getAttribute('data-action');
        var eventID = btn.getAttribute('data-id');
        var e = findEvent(eventID);
        if (!e) return;
        if (action === 'register') {
          btn.disabled = true;
          doRegister(eventID, listState.user, function () {
            loadEvents();
          }, function () {
            btn.disabled = false;
          });
        } else if (action === 'cancel') {
          doCancel(eventID, listState.user, e.name, e.myStatus === 'Waitlist', function () {
            loadEvents();
          });
        }
      });
    }

    loadEvents();
  }

  function findEvent(eventID) {
    for (var i = 0; i < listState.events.length; i++) {
      if (listState.events[i].eventID === eventID) return listState.events[i];
    }
    return null;
  }

  function setEventsLoading(on) {
    var loadingEl = document.getElementById('eventsLoading');
    var panel = document.getElementById('eventsPanel');
    var errEl = document.getElementById('eventsError');

    if (on) {
      if (loadingEl) { loadingEl.classList.remove('d-none'); CES_UI.loading(loadingEl, true); }
      if (panel) panel.classList.add('d-none');
      if (errEl) { errEl.classList.add('d-none'); errEl.innerHTML = ''; }
    } else if (loadingEl) {
      CES_UI.loading(loadingEl, false);
      loadingEl.classList.add('d-none');
    }
  }

  function loadEvents() {
    if (listState.loading) return;
    listState.loading = true;
    setEventsLoading(true);

    API.getEvents({ userID: listState.user.userID, sort: listState.sort }).then(function (data) {
      listState.events = (data && data.events) || [];
      listState.now = (data && data.now) || nowText();
      setEventsLoading(false);
      listState.loading = false;
      var panel = document.getElementById('eventsPanel');
      if (panel) panel.classList.remove('d-none');
      renderEventsList();
    }).catch(function (err) {
      listState.loading = false;
      setEventsLoading(false);
      var msg = isNetworkError(err && err.code) ? BACKEND_MSG : ((err && err.message) || BACKEND_MSG);
      showEventsError(msg);
    });
  }

  function showEventsError(msg) {
    var panel = document.getElementById('eventsPanel');
    var errEl = document.getElementById('eventsError');
    if (panel) panel.classList.add('d-none');
    if (errEl) {
      errEl.classList.remove('d-none');
      errEl.innerHTML = '<div class="ces-empty"><i class="bi bi-cloud-slash"></i>' + esc(msg) +
        '<div class="mt-3"><button type="button" class="btn btn-sm btn-ces-ghost" id="eventsRetryBtn">' +
        '<i class="bi bi-arrow-clockwise"></i> 重新載入</button></div></div>';
      var retry = document.getElementById('eventsRetryBtn');
      if (retry) retry.addEventListener('click', function () { loadEvents(); });
    }
  }

  function matchTab(e) {
    if (listState.tab === 'eligible') return isActive(e) && e.isEligible !== false;
    if (listState.tab === 'joined') return e.myStatus === 'Confirmed' || e.myStatus === 'Waitlist';
    if (listState.tab === 'notjoined') {
      return isActive(e) && (!e.myStatus || e.myStatus === 'Cancelled');
    }
    return true;
  }

  function matchKeyword(e) {
    if (!listState.keyword) return true;
    var haystack = [e.name, e.eventID, e.location, e.category].join(' ').toLowerCase();
    return haystack.indexOf(listState.keyword) !== -1;
  }

  function renderEventsList() {
    var list = listState.events.filter(function (e) {
      return matchTab(e) && matchKeyword(e);
    });

    var tbody = document.getElementById('eventsTableBody');
    var cards = document.getElementById('eventsCards');
    var emptyBox = document.getElementById('eventsEmpty');
    var emptyText = document.getElementById('eventsEmptyText');
    var countEl = document.getElementById('eventsCount');

    if (tbody) tbody.innerHTML = list.map(tableRowHtml).join('');
    if (cards) cards.innerHTML = list.map(eventCardHtml).join('');

    if (emptyBox) {
      var showEmpty = list.length === 0;
      emptyBox.classList.toggle('d-none', !showEmpty);
      if (showEmpty && emptyText) {
        emptyText.textContent = listState.events.length === 0 ? '暫時沒有活動' : '沒有符合條件的活動';
      }
    }

    if (countEl) {
      countEl.textContent = '共 ' + list.length + ' 個活動' +
        (listState.keyword ? '（搜尋：' + listState.keyword + '）' : '');
    }

    var panel = document.getElementById('eventsPanel');
    applyProgress(panel);
  }

  function myStatusCell(e) {
    if (!isActive(e)) return '<span class="badge-status is-cancelled">已取消</span>';
    return CES_UI.statusBadge(e.myStatus);
  }

  function eligibilityCell(e) {
    if (!isActive(e)) return '<span class="muted small">—</span>';
    if (e.isEligible === false) {
      var reason = e.eligibleReason || '不符合資格';
      return '<span class="small text-danger" title="' + esc(reason) + '">' + esc(reason) + '</span>';
    }
    var rules = eligibilityRules(e);
    return '<span class="tag tag-soft" title="' + esc(rules) + '">' + esc(rules) + '</span>';
  }

  function quotaCellHtml(e) {
    var html = '<div class="ces-quota">';
    if (!e.maxQuota || e.maxQuota === 0) {
      html += '<div>不限名額</div>';
    } else {
      html += '<div class="d-flex justify-content-between gap-2">' +
        '<span>已報 ' + (e.registeredCount || 0) + '</span>' +
        '<span class="muted">上限 ' + e.maxQuota + '</span></div>' +
        progressHtml(e);
    }
    if (e.waitlistCount) {
      html += '<div class="mt-1">候補 ' + e.waitlistCount + ' 人</div>';
    }
    if (e.isFull && isActive(e)) {
      html += '<div class="mt-1"><span class="tag tag-soft">名額已滿</span></div>';
    }
    html += '</div>';
    return html;
  }

  function actionsHtml(e) {
    var id = esc(e.eventID);
    var html = '<div class="d-flex flex-wrap gap-1 justify-content-lg-end">' +
      '<a class="btn btn-sm btn-outline-secondary" href="' + detailLink(e) + '">詳情</a>';

    if (e.myStatus === 'Confirmed' || e.myStatus === 'Waitlist') {
      if (isMandatory(e)) {
        /* 必須參加：不提供取消入口 */
        html += '<button type="button" class="btn btn-sm btn-outline-secondary" disabled ' +
          'title="必須參加的活動不可取消報名，請聯絡負責老師">不可取消</button>';
      } else {
        var cancelLabel = e.myStatus === 'Waitlist' ? '取消候補' : '取消報名';
        html += '<button type="button" class="btn btn-sm btn-outline-danger" data-action="cancel" ' +
          'data-id="' + id + '">' + cancelLabel + '</button>';
      }
    } else if (isActive(e) && e.isEligible !== false && e.isRegOpen === true) {
      html += '<button type="button" class="btn btn-sm btn-ces-primary" data-action="register" ' +
        'data-id="' + id + '">' + (e.isFull ? '報名候補' : '快速報名') + '</button>';
    }

    html += '</div>';
    return html;
  }

  function timeCellHtml(e) {
    return '<div class="small">' + esc(CES_UI.fmtDT(e.eventStart)) + '</div>' +
      '<div class="small muted">至 ' + esc(CES_UI.fmtTime(e.eventEnd)) + '</div>';
  }

  function tableRowHtml(e) {
    var rowClass = isActive(e) ? '' : ' class="opacity-75"';
    return '<tr' + rowClass + '>' +
      '<td class="small muted">' + esc(e.eventID) + '</td>' +
      '<td><div class="d-flex flex-wrap align-items-center gap-1">' +
      '<a class="fw-semibold" href="' + detailLink(e) + '">' + esc(e.name) + '</a>' +
      mandatoryBadge(e) + '</div></td>' +
      '<td>' + (e.category ? '<span class="tag">' + esc(e.category) + '</span>' : '<span class="muted">—</span>') + '</td>' +
      '<td>' + timeCellHtml(e) + '</td>' +
      '<td class="small">' + esc(e.location) + '</td>' +
      '<td>' + quotaCellHtml(e) + '</td>' +
      '<td>' + eligibilityCell(e) + '</td>' +
      '<td>' + myStatusCell(e) + '</td>' +
      '<td>' + actionsHtml(e) + '</td>' +
      '</tr>';
  }

  function eventCardHtml(e) {
    var statusHtml = isActive(e) ? CES_UI.statusBadge(e.myStatus) :
      '<span class="badge-status is-cancelled">已取消</span>';
    var flags = '';
    if (isActive(e) && e.isFull) flags += '<span class="tag tag-soft">名額已滿</span>';
    if (isActive(e) && e.isEligible === false) flags += '<span class="tag tag-soft">不符合資格</span>';

    return '<div class="ces-card ces-event-card">' +
      '<div class="card-cover"></div>' +
      '<div class="d-flex justify-content-between align-items-start gap-2">' +
      '<h3 class="mb-0"><a href="' + detailLink(e) + '">' + esc(e.name) + '</a> ' +
      mandatoryBadge(e) + '</h3>' +
      '<div class="flex-shrink-0">' + statusHtml + '</div>' +
      '</div>' +
      '<div class="meta mt-2">' +
      '<div><i class="bi bi-hash"></i>' + esc(e.eventID) + '</div>' +
      '<div><i class="bi bi-clock"></i>' + timeCellHtml(e) + '</div>' +
      '<div><i class="bi bi-geo-alt"></i>' + esc(e.location) + '</div>' +
      '</div>' +
      '<div class="d-flex flex-wrap align-items-center gap-1 mt-2 small">' +
      (e.category ? '<span class="tag">' + esc(e.category) + '</span>' : '') +
      flags +
      '</div>' +
      '<div class="ces-quota mt-2">' + quotaCellHtml(e) + '</div>' +
      '<div class="actions">' + actionsHtml(e) + '</div>' +
      '</div>';
  }

  /* =========================================================
   * 二、活動詳情頁 event_detail.html
   * =======================================================*/
  var detailState = { user: null, eventID: null, event: null };

  function initDetailPage() {
    var host = document.getElementById('detailRoot');
    if (!host) return;

    var user = CES_AUTH.requireLogin();
    if (!user) return;
    detailState.user = user;
    CES_UI.renderNav('events');

    var id = CES_UI.qs('id');
    if (!id) {
      showDetailError('缺少活動編號，請從活動列表進入。');
      return;
    }
    detailState.eventID = id;

    host.addEventListener('click', function (ev) {
      var btn = ev.target.closest('[data-action]');
      if (!btn) return;
      var e = detailState.event;
      if (!e) return;
      var eventID = btn.getAttribute('data-id') || e.eventID;

      if (btn.getAttribute('data-action') === 'register') {
        btn.disabled = true;
        doRegister(eventID, detailState.user, function () {
          loadDetail();
        }, function () {
          btn.disabled = false;
        });
      } else if (btn.getAttribute('data-action') === 'cancel') {
        doCancel(eventID, detailState.user, e.name, e.myStatus === 'Waitlist', function () {
          loadDetail();
        });
      }
    });

    loadDetail();
  }

  function showDetailError(msg) {
    var loadingEl = document.getElementById('detailLoading');
    var root = document.getElementById('detailRoot');
    var errEl = document.getElementById('detailError');
    if (loadingEl) { CES_UI.loading(loadingEl, false); loadingEl.classList.add('d-none'); }
    if (root) root.classList.add('d-none');
    if (errEl) {
      errEl.classList.remove('d-none');
      errEl.innerHTML = '<div class="ces-empty"><i class="bi bi-exclamation-triangle"></i>' + esc(msg) +
        '<div class="mt-3 d-flex justify-content-center gap-2">' +
        '<button type="button" class="btn btn-sm btn-ces-ghost" id="detailRetryBtn">' +
        '<i class="bi bi-arrow-clockwise"></i> 重新載入</button>' +
        '<a class="btn btn-sm btn-ces-primary" href="events.html">返回活動列表</a>' +
        '</div></div>';
      var retry = document.getElementById('detailRetryBtn');
      if (retry) retry.addEventListener('click', function () { loadDetail(); });
    }
  }

  function loadDetail() {
    var loadingEl = document.getElementById('detailLoading');
    var root = document.getElementById('detailRoot');
    var errEl = document.getElementById('detailError');

    if (loadingEl) { loadingEl.classList.remove('d-none'); CES_UI.loading(loadingEl, true); }
    if (root) root.classList.add('d-none');
    if (errEl) { errEl.classList.add('d-none'); errEl.innerHTML = ''; }

    API.getEvent(detailState.eventID, detailState.user.userID).then(function (data) {
      var e = data && data.event;
      if (!e) throw new Error('找不到活動資料');
      detailState.event = e;
      renderDetail(e);

      if (loadingEl) { CES_UI.loading(loadingEl, false); loadingEl.classList.add('d-none'); }
      if (root) root.classList.remove('d-none');
    }).catch(function (err) {
      var msg;
      if (err && err.code === 'NOT_FOUND') msg = '找不到此活動（可能已被取消或編號錯誤）。';
      else if (isNetworkError(err && err.code)) msg = BACKEND_MSG;
      else msg = (err && err.message) || BACKEND_MSG;
      showDetailError(msg);
    });
  }

  function infoRow(label, valueHtml) {
    return '<tr><th scope="row" class="text-nowrap text-muted fw-semibold">' + esc(label) + '</th>' +
      '<td>' + valueHtml + '</td></tr>';
  }

  function quotaBlockHtml(e) {
    var html = '';
    if (!e.maxQuota || e.maxQuota === 0) {
      html += '<div>名額不限 <span class="muted small">（已報 ' + (e.registeredCount || 0) + ' 人）</span></div>';
    } else {
      html += '<div class="d-flex justify-content-between small mb-1">' +
        '<span>已報 ' + (e.registeredCount || 0) + ' / ' + e.maxQuota + '</span>' +
        (e.remaining === null || e.remaining === undefined ? '' : '<span class="muted">剩餘 ' + e.remaining + '</span>') +
        '</div>' + progressHtml(e);
    }
    html += '<div class="small mt-1">候補 ' + (e.waitlistCount || 0) + ' 人</div>';
    return html;
  }

  function renderDetail(e) {
    document.title = (e.name || '活動詳情') + ' · 校園活動管理系統';

    var live = isActive(e);
    var hero = document.getElementById('detailHero');
    if (hero) {
      hero.innerHTML = '<div class="detail-hero">' +
        '<div class="d-flex flex-wrap justify-content-between align-items-start gap-3">' +
        '<div class="min-w-0">' +
        '<div class="d-flex flex-wrap align-items-center gap-2 mb-2">' +
        (e.category ? '<span class="tag">' + esc(e.category) + '</span>' : '') +
        mandatoryBadge(e) +
        '<span class="badge-status ' + (live ? 'is-confirmed' : 'is-cancelled') + '">' +
        (live ? '開放報名' : '已取消') + '</span>' +
        '</div>' +
        '<h1>' + esc(e.name) + '</h1>' +
        '<div class="meta"><i class="bi bi-hash"></i> ' + esc(e.eventID) +
        ' · <i class="bi bi-person-badge"></i> 負責老師：' + esc(e.hostName || e.hostID || '—') +
        '</div>' +
        '</div>' +
        '<div class="meta text-lg-end">' +
        '<div><i class="bi bi-calendar-event"></i> ' + esc(CES_UI.fmtDT(e.eventStart)) + '</div>' +
        '<div class="mt-1"><i class="bi bi-geo-alt"></i> ' + esc(e.location) + '</div>' +
        '</div>' +
        '</div></div>';
    }

    var infoBody = document.getElementById('detailInfoBody');
    if (infoBody) {
      var description = isBlank(e.description) ? '—' : esc(e.description).replace(/\n/g, '<br>');
      var eligState = e.isEligible === false
        ? '<span class="badge-status is-cancelled">不符合資格</span>'
        : '<span class="badge-status is-confirmed">符合資格</span>';

      infoBody.innerHTML =
        infoRow('活動編號', esc(e.eventID)) +
        infoRow('類別', e.category ? '<span class="tag">' + esc(e.category) + '</span>' : '<span class="muted">—</span>') +
        infoRow('參加性質', isMandatory(e) ? mandatoryBadge(e) +
          '<span class="muted small ms-2">老師點名，系統已自動報名，不可取消</span>' :
          '<span class="muted">自願報名</span>') +
        infoRow('狀態', live ? '<span class="badge-status is-confirmed">開放報名</span>' :
          '<span class="badge-status is-cancelled">已取消</span>') +
        infoRow('負責老師', esc(e.hostName || e.hostID || '—') +
          (e.hostID ? '<span class="muted small">（' + esc(e.hostID) + '）</span>' : '')) +
        infoRow('報名時間', esc(CES_UI.fmtDT(e.regStart)) + ' 至 ' + esc(CES_UI.fmtDT(e.regEnd))) +
        infoRow('活動時間', esc(CES_UI.fmtDT(e.eventStart)) + ' 至 ' + esc(CES_UI.fmtDT(e.eventEnd))) +
        infoRow('地點', esc(e.location)) +
        infoRow('名額', quotaBlockHtml(e)) +
        infoRow('資格條件', esc(eligibilityRules(e)) + ' ' + eligState +
          (e.isEligible === false && e.eligibleReason
            ? '<div class="small text-danger mt-1">' + esc(e.eligibleReason) + '</div>' : '')) +
        infoRow('簡介', '<div class="text-break">' + description + '</div>');
    }

    var actionBody = document.getElementById('actionBody');
    if (actionBody) actionBody.innerHTML = actionHtml(e);

    applyProgress(document.getElementById('detailRoot'));
  }

  function disabledActionBtn(label, title) {
    return '<button type="button" class="btn btn-secondary" disabled' +
      (title ? ' title="' + esc(title) + '"' : '') + '>' + esc(label) + '</button>';
  }

  function actionHtml(e) {
    var live = isActive(e);
    var now = nowText();
    var my = e.myStatus;
    var html = '';

    html += '<div class="mb-3 d-flex flex-wrap align-items-center gap-2">' +
      (live ? (my === 'Cancelled' ? CES_UI.statusBadge(null) : CES_UI.statusBadge(my))
        : '<span class="badge-status is-cancelled">活動已取消</span>') +
      mandatoryBadge(e) +
      '</div>';

    html += '<div class="mb-3">' + quotaBlockHtml(e) + '</div>';

    html += '<div class="small muted"><i class="bi bi-clock me-1"></i>報名時段：' +
      esc(CES_UI.fmtDT(e.regStart)) + ' 至 ' + esc(CES_UI.fmtDT(e.regEnd)) + '</div>';
    html += '<div class="small muted mt-1"><i class="bi bi-shield-check me-1"></i>資格：' +
      esc(eligibilityRules(e)) + '</div>';
    if (live && e.isEligible === false) {
      html += '<div class="small text-danger mt-1">你未符合資格：' + esc(e.eligibleReason || '不符合') + '</div>';
    }

    var notice = '';
    if (!live) notice = '此活動已取消，無法報名。';
    else if (my === 'Confirmed' && isMandatory(e)) {
      notice = '這是必須參加的活動，系統已為你自動報名；老師會點名，報名不可取消。';
    } else if (my === 'Confirmed') notice = '你已成功報名，請準時出席。';
    else if (my === 'Waitlist' && isMandatory(e)) {
      notice = '名額已滿，你目前位於候補名單；必須參加的活動不可取消。';
    } else if (my === 'Waitlist') notice = '名額已滿，你目前位於候補名單。';
    else if (my === 'Cancelled') notice = '你曾取消此活動的報名，可重新報名。';
    else if (e.isEligible === false) notice = '你未符合本活動的報名資格。';
    else if (e.isFull) notice = '名額已滿，現在報名將自動加入候補名單。';
    else if (!e.isRegOpen) {
      notice = (e.regStart && now < e.regStart) ? '報名尚未開始。' : '報名已截止。';
    }
    if (notice) {
      html += '<div class="alert alert-warning py-2 small mt-3 mb-0">' + esc(notice) + '</div>';
    }

    var id = esc(e.eventID);
    var btn;
    if (!live) {
      btn = disabledActionBtn('活動已取消');
    } else if (isMandatory(e) && (my === 'Confirmed' || my === 'Waitlist')) {
      /* 必須參加：不可取消（按鈕保留但禁用，並說明原因） */
      btn = disabledActionBtn(
        my === 'Waitlist' ? '候補中（必須參加，不可取消）' : '必須參加（已自動報名）',
        '必須參加的活動不可取消報名，請聯絡負責老師'
      ) +
        '<div class="small muted text-center mt-2">' +
        '<i class="bi bi-info-circle me-1"></i>必須參加的活動不可取消</div>';
    } else if (my === 'Confirmed') {
      btn = '<button type="button" class="btn btn-outline-danger" data-action="cancel" data-id="' + id + '">' +
        '已報名（取消報名）</button>';
    } else if (my === 'Waitlist') {
      btn = '<button type="button" class="btn btn-warning" data-action="cancel" data-id="' + id + '">' +
        '候補中（取消候補）</button>';
    } else if (e.isEligible === false) {
      btn = disabledActionBtn('不符合報名資格', e.eligibleReason);
    } else if (hasStarted(e)) {
      btn = disabledActionBtn('活動已開始');
    } else if (!e.isRegOpen) {
      btn = disabledActionBtn((e.regStart && now < e.regStart) ? '報名尚未開始' : '報名已截止');
    } else {
      btn = '<button type="button" class="btn btn-ces-primary" data-action="register" data-id="' + id + '">' +
        (isMandatory(e) ? '報名（必須參加）' : (e.isFull ? '候補報名' : '立即報名')) + '</button>';
    }

    html += '<div class="d-grid mt-3">' + btn + '</div>';
    return html;
  }

  /* =========================================================
   * 分流初始化
   * =======================================================*/
  ready(function () {
    var page = (document.body && document.body.dataset.page) || '';
    var isEvents = page === 'events' || !!document.getElementById('eventsTableBody');
    var isDetail = page === 'event-detail' || !!document.getElementById('detailRoot');

    if (isEvents && !isDetail) {
      initEventsPage();
    } else if (isDetail) {
      initDetailPage();
    }
  });
})();
