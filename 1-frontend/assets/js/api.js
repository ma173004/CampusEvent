/* =============================================================
 * api.js — 统一封装后端请求（CampusEventSystem）
 * 全局暴露：window.API
 * 依赖：无（原生 fetch）
 * 约定见 3-docs/05_API契约与数据字典.md
 * ============================================================= */
(function () {
  'use strict';

  /* ---------- 1. 后端地址配置 ---------- */
  // 本地 Node mock server（4-local-demo/server.js）的 API 根路径
  var LOCAL_API = 'http://127.0.0.1:8787/api';
  // GAS 部署后，把下面这行替换成你的 Web App /exec 链接
  var GAS_API = 'https://script.googleusercontent.com/a/macros/lcms.edu.hk/echo?user_content_key=AUkAhnRUGEcz7XMh1k0CN2UahXSsygB95hduFPrOkA1Dnx2Y4E9B1d2CMbJuGeY3i0K5Yn7XMteSZCBvQNvC93mNaSu8SeRoWf_QJ3fv8wSO5IAyYyhMQoFlzuM8kr90mmaA5afYcEXBUNDFH-7jmrK253itPGtjSrLvRqGGPmTvH0EbEo3ef7BhEtnFpdSc2P8vbgbjWqSPf1dk0ct_jUC_HU74DuWH_fJhssfC4OUiTByghPZ9b9zT5bGj6KEnK09zFp6Z_ImHKgsEQhzVsRVlfGXP05b_fqj1c-dXfl4bytvi4-NrO-15DFtMXjpVOw&lib=MPt9q1pgAab8fBceBTy2qF-XQ1G8wOI53';

  function resolveBase() {
    // 允许在浏览器控制台临时切换：localStorage.setItem('ces_api_base', '...')
    try {
      var saved = localStorage.getItem('ces_api_base');
      if (saved) return saved;
    } catch (e) { /* 无痕模式忽略 */ }
    var host = location.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host === '') return LOCAL_API;
    if (GAS_API.indexOf('REPLACE_WITH_YOUR_DEPLOYMENT_ID') !== -1) return LOCAL_API; // 未配置 GAS 时回退本地
    return GAS_API;
  }

  var baseURL = resolveBase();

  /* ---------- 2. 底层请求 ---------- */
  // GET：action + params 转 query；POST：JSON body + Content-Type: text/plain（绕过 GAS 的 CORS 预检）
  function request(action, params, method) {
    params = params || {};
    method = (method || 'GET').toUpperCase();

    var url, init;

    if (method === 'GET') {
      var qs = ['action=' + encodeURIComponent(action)];
      Object.keys(params).forEach(function (k) {
        var v = params[k];
        if (v === undefined || v === null) return;
        qs.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
      });
      url = baseURL + (baseURL.indexOf('?') === -1 ? '?' : '&') + qs.join('&');
      init = { method: 'GET', cache: 'no-store' };
    } else {
      var body = Object.assign({ action: action }, params);
      url = baseURL;
      init = {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body)
      };
    }

    // 20 秒超时，避免 GAS 慢响应时页面永久卡住
    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = null;
    if (ctrl) {
      init.signal = ctrl.signal;
      timer = setTimeout(function () { ctrl.abort(); }, 20000);
    }

    return fetch(url, init)
      .then(function (res) {
        if (timer) clearTimeout(timer);
        if (!res.ok) {
          var e1 = new Error('伺服器回應錯誤（HTTP ' + res.status + '）');
          e1.code = 'HTTP_' + res.status;
          throw e1;
        }
        return res.text();
      })
      .then(function (text) {
        var json;
        try {
          json = JSON.parse(text);
        } catch (e) {
          var e2 = new Error('後端回傳的不是合法 JSON（請檢查 API 網址 / GAS 部署權限）');
          e2.code = 'BAD_RESPONSE';
          e2.raw = text;
          throw e2;
        }
        if (json && json.success === true) return json.data;
        var err = new Error((json && json.message) || '請求失敗');
        err.code = (json && json.code) || 'UNKNOWN';
        err.data = (json && json.data) || null;
        throw err;
      })
      .catch(function (err) {
        if (timer) clearTimeout(timer);
        if (err && err.name === 'AbortError') {
          var e3 = new Error('請求逾時，請檢查網絡或後端是否已部署');
          e3.code = 'TIMEOUT';
          throw e3;
        }
        if (err && !err.code) {
          var e4 = new Error('無法連接後端（' + err.message + '）。本機演示請先執行 node 4-local-demo/server.js');
          e4.code = 'NETWORK_ERROR';
          throw e4;
        }
        throw err;
      });
  }

  function get(action, params) { return request(action, params, 'GET'); }
  function post(action, params) { return request(action, params, 'POST'); }

  /* ---------- 3. 语义化接口 ---------- */
  var API = {
    baseURL: baseURL,
    request: request,
    get: get,
    post: post,

    health: function () { return get('health'); },

    // 登录
    login: function (userID, password) {
      return post('login', { userID: userID, password: password });
    },

    // 活动
    getEvents: function (opts) {
      opts = opts || {};
      return get('getEvents', { userID: opts.userID || '', sort: opts.sort || 'time' });
    },
    getEvent: function (eventID, userID) {
      return get('getEvent', { eventID: eventID, userID: userID || '' });
    },
    getCalendarData: function (userID) {
      return get('getCalendarData', { userID: userID || '' });
    },

    // 报名
    registerEvent: function (eventID, userID, confirm) {
      return post('registerEvent', { eventID: eventID, userID: userID, confirm: confirm === true });
    },
    cancelRegistration: function (eventID, userID) {
      return post('cancelRegistration', { eventID: eventID, userID: userID });
    },

    // 教师 / 管理员
    manageEvent: function (userID, mode, event) {
      return post('manageEvent', { userID: userID, mode: mode, event: event || null });
    },
    getParticipantList: function (eventID, userID) {
      return get('getParticipantList', { eventID: eventID, userID: userID || '' });
    },
    markAttendance: function (eventID, userID, targetUserID, attended) {
      return post('markAttendance', {
        eventID: eventID, userID: userID,
        targetUserID: targetUserID, attended: attended || 'Yes'
      });
    },
    getDashboardStats: function (userID) {
      return get('getDashboardStats', { userID: userID || '' });
    },

    // v1.2：資格人數預覽（契約 8.2）
    // classes / grades / clubs：逗號串，空字串或 'ALL' = 該欄不限
    previewEligibility: function (opts) {
      opts = opts || {};
      return get('previewEligibility', {
        userID: opts.userID || '',
        classes: opts.classes || '',
        grades: opts.grades || '',
        clubs: opts.clubs || '',
        requireOfficer: opts.requireOfficer === true
      });
    },

    // 权限
    getUsers: function (userID) { return get('getUsers', { userID: userID }); },
    updateUserRole: function (userID, targetUserID, role) {
      return post('updateUserRole', { userID: userID, targetUserID: targetUserID, role: role });
    }
  };

  window.API = API;
})();
