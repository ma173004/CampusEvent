/* =============================================================
 * auth.js — 登录态 / 会话 / 导航栏 / 通用 UI 工具
 * 全局暴露：window.CES_AUTH、window.CES_UI
 * 依赖：api.js（window.API）
 * ============================================================= */
(function () {
  'use strict';

  var STORAGE_KEY = 'ces_user';

  /* =========================================================
   * CES_AUTH —— 会话与权限
   * =======================================================*/
  var CES_AUTH = {
    getUser: function () {
      try {
        var raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
    },

    setUser: function (user) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    },

    isRole: function () {
      var user = this.getUser();
      if (!user) return false;
      var roles = Array.prototype.slice.call(arguments);
      if (!roles.length) return true;
      return roles.indexOf(user.role) !== -1;
    },

    /** 未登录 → 跳登录页；角色不符 → 回首页。返回当前用户。 */
    requireLogin: function (roles) {
      var user = this.getUser();
      if (!user) {
        var here = location.pathname.split('/').pop() + location.search;
        location.replace('login.html?next=' + encodeURIComponent(here || 'dashboard.html'));
        return null;
      }
      if (roles && roles.length && roles.indexOf(user.role) === -1) {
        location.replace('dashboard.html');
        return null;
      }
      return user;
    },

    login: function (userID, password) {
      return API.login(userID, password).then(function (data) {
        CES_AUTH.setUser(data.user);
        return data.user;
      });
    },

    logout: function () {
      localStorage.removeItem(STORAGE_KEY);
      location.href = 'login.html';
    }
  };

  /* =========================================================
   * CES_UI —— 导航、提示、格式化
   * =======================================================*/
  var CES_UI = {
    /* 注入导航栏到 <div id="ces-nav"> */
    renderNav: function (activePage) {
      var host = document.getElementById('ces-nav');
      if (!host) return;
      var user = CES_AUTH.getUser();
      if (!user) { host.innerHTML = ''; return; }

      var isStaff = user.role === 'Teacher' || user.role === 'Admin';
      var isAdmin = user.role === 'Admin';
      var initial = (user.name || '?').slice(0, 1);

      function item(page, href, icon, label) {
        var active = page === activePage ? ' active' : '';
        return '<li class="nav-item">' +
          '<a class="nav-link' + active + '" href="' + href + '">' +
          '<i class="bi ' + icon + '"></i> ' + label + '</a></li>';
      }

      host.innerHTML =
        '<nav class="navbar navbar-expand-lg ces-navbar sticky-top">' +
        '<div class="container-xxl">' +
        '<a class="navbar-brand d-flex align-items-center gap-2" href="dashboard.html">' +
        '<img src="assets/img/logo.png" alt="logo" class="ces-logo">' +
        '<span class="ces-brand-text">校園活動管理系統</span></a>' +
        '<button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#cesNavCollapse">' +
        '<span class="navbar-toggler-icon"></span></button>' +
        '<div class="collapse navbar-collapse" id="cesNavCollapse">' +
        '<ul class="navbar-nav me-auto mb-2 mb-lg-0">' +
        item('dashboard', 'dashboard.html', 'bi-calendar3', '主頁') +
        item('events', 'events.html', 'bi-list-ul', '活動') +
        (isStaff ? item('admin', 'admin.html', 'bi-sliders', '活動管理') : '') +
        (isStaff ? item('stats', 'stats.html', 'bi-bar-chart-line', '數據報表') : '') +
        '</ul>' +
        '<div class="d-flex align-items-center gap-2 ces-user-chip">' +
        '<span class="role-badge role-' + String(user.role).toLowerCase() + '">' +
        CES_UI.roleLabel(user.role) + '</span>' +
        '<span class="ces-avatar">' + CES_UI.escapeHtml(initial) + '</span>' +
        '<span class="ces-username">' + CES_UI.escapeHtml(user.name) + '</span>' +
        '<button class="btn btn-sm btn-outline-secondary" id="cesLogoutBtn" type="button">' +
        '<i class="bi bi-box-arrow-right"></i> 登出</button>' +
        '</div></div></div></nav>';

      var btn = document.getElementById('cesLogoutBtn');
      if (btn) btn.addEventListener('click', function () { CES_AUTH.logout(); });

      if (isAdmin && !document.getElementById('cesAdminLink')) {
        // 预留：管理员可在 admin 页看到用户权限 Tab，无需额外导航项
      }
    },

    /* 右下角 toast 提示 */
    toast: function (message, type) {
      type = type || 'success';
      var wrap = document.getElementById('cesToastWrap');
      if (!wrap) {
        wrap = document.createElement('div');
        wrap.id = 'cesToastWrap';
        wrap.className = 'toast-container position-fixed top-0 end-0 p-3';
        wrap.style.zIndex = '2000';
        document.body.appendChild(wrap);
      }
      var el = document.createElement('div');
      el.className = 'toast align-items-center text-bg-' + type + ' border-0';
      el.setAttribute('role', 'alert');
      el.innerHTML = '<div class="d-flex"><div class="toast-body">' +
        CES_UI.escapeHtml(message) + '</div>' +
        '<button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div>';
      wrap.appendChild(el);
      var t = new bootstrap.Toast(el, { delay: 3000 });
      t.show();
      el.addEventListener('hidden.bs.toast', function () { el.remove(); });
    },

    /* 通用确认框，返回 Promise<boolean> */
    confirmDialog: function (opts) {
      opts = opts || {};
      return new Promise(function (resolve) {
        var id = 'cesConfirmModal';
        var old = document.getElementById(id);
        if (old) old.remove();
        var wrap = document.createElement('div');
        wrap.innerHTML =
          '<div class="modal fade" id="' + id + '" tabindex="-1">' +
          '<div class="modal-dialog modal-dialog-centered"><div class="modal-content">' +
          '<div class="modal-header"><h5 class="modal-title">' + CES_UI.escapeHtml(opts.title || '確認') + '</h5>' +
          '<button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
          '<div class="modal-body">' + (opts.body || '') + '</div>' +
          '<div class="modal-footer">' +
          '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">' +
          CES_UI.escapeHtml(opts.cancelText || '取消') + '</button>' +
          '<button type="button" class="btn btn-primary" id="cesConfirmOk">' +
          CES_UI.escapeHtml(opts.okText || '確定') + '</button>' +
          '</div></div></div></div>';
        var modalEl = wrap.firstElementChild;
        document.body.appendChild(modalEl);
        var modal = new bootstrap.Modal(modalEl);
        var resolved = false;
        modalEl.addEventListener('hidden.bs.modal', function () {
          if (!resolved) resolve(false);
          modal.dispose();
          modalEl.remove();
        });
        modalEl.querySelector('#cesConfirmOk').addEventListener('click', function () {
          resolved = true;
          modal.hide();
          resolve(true);
        });
        modal.show();
      });
    },

    /* 日期格式化 */
    fmtDT: function (s) {
      if (!s) return '';
      return String(s).replace(/-/g, '/').replace('T', ' ');
    },
    fmtDate: function (s) {
      if (!s) return '';
      return String(s).slice(0, 10).replace(/-/g, '/');
    },
    fmtTime: function (s) {
      if (!s) return '';
      var m = String(s).match(/(\d{2}:\d{2})/);
      return m ? m[1] : '';
    },

    /* HTML 转义，所有用户数据插入 innerHTML 前必须调用 */
    escapeHtml: function (s) {
      return String(s === null || s === undefined ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },

    roleLabel: function (role) {
      return ({ Student: '學生', Teacher: '老師', Admin: '管理員' })[role] || role || '';
    },

    statusBadge: function (status) {
      var map = {
        Confirmed: ['is-confirmed', '已確認'],
        Waitlist: ['is-waitlist', '候補中'],
        Cancelled: ['is-cancelled', '已取消']
      };
      var it = map[status];
      if (!it) return '<span class="badge-status is-none">未報名</span>';
      return '<span class="badge-status ' + it[0] + '">' + it[1] + '</span>';
    },

    qs: function (name) {
      var m = new RegExp('[?&]' + encodeURIComponent(name) + '=([^&#]*)').exec(location.search);
      return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : null;
    },

    loading: function (el, on) {
      if (!el) return;
      if (on) {
        el.classList.add('is-loading');
        el.setAttribute('aria-busy', 'true');
      } else {
        el.classList.remove('is-loading');
        el.removeAttribute('aria-busy');
      }
    }
  };

  window.CES_AUTH = CES_AUTH;
  window.CES_UI = CES_UI;
})();
