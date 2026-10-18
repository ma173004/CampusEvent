/**
 * =============================================================================
 * 01_Code.gs · 入口与路由
 * -----------------------------------------------------------------------------
 * GAS Web App 入口：doGet(e) / doPost(e)
 *  - action 从 e.parameter.action 或 POST JSON body 的 action 字段获取；
 *  - 统一返回 ContentService JSON，所有响应 HTTP 200，用 success 字段区分成败；
 *  - 写接口：POST body 为 JSON 字符串、Content-Type: text/plain;charset=utf-8
 *    （text/plain 属于 CORS 简单请求，可绕过预检，适配 GAS 无法自定义响应头）。
 *
 * 部署：Extensions > Apps Script > Deploy > New deployment > Web app
 *       Execute as: Me / Who has access: Anyone（演示用）
 *       首次运行 setupDatabase() 写种子数据。
 * =============================================================================
 */

/**
 * GET 入口：读接口
 * 例：{BASE}?action=getEvents&userID=S2201&sort=time
 */
function doGet(e) {
  var params = (e && e.parameter) ? e.parameter : {};
  return handleRequest_(params);
}

/**
 * POST 入口：写接口
 * body 例：{"action":"login","userID":"S2201","password":"student123"}
 * 同时兼容 action 放 query、参数部分放 query 的调用方式（body 优先）。
 */
function doPost(e) {
  var params = {};
  var k;

  // 1. query 参数兜底
  if (e && e.parameter) {
    for (k in e.parameter) {
      if (Object.prototype.hasOwnProperty.call(e.parameter, k)) params[k] = e.parameter[k];
    }
  }

  // 2. 解析 JSON body（Content-Type 为 text/plain 或 application/json 均可）
  var raw = (e && e.postData && e.postData.contents) ? e.postData.contents : '';
  if (raw) {
    var body = null;
    try {
      body = JSON.parse(raw);
    } catch (parseErr) {
      body = null;
    }
    if (!body || typeof body !== 'object') {
      return jsonOut_(errorEnvelope_('INVALID_PARAM', 'POST body 必須為合法 JSON', null));
    }
    for (k in body) {
      if (Object.prototype.hasOwnProperty.call(body, k)) params[k] = body[k];
    }
  }

  return handleRequest_(params);
}

/**
 * 统一分发。每个业务函数返回「响应信封」对象（{success:true,data:…}），
 * 业务错误用 apiFail_ 抛出，这里统一转成 {success:false,code,message,data}。
 */
function handleRequest_(params) {
  try {
    var action = (params && params.action !== undefined && params.action !== null)
      ? String(params.action) : '';

    if (!action) {
      return jsonOut_(errorEnvelope_('INVALID_ACTION', '缺少 action 參數', null));
    }

    var result;
    switch (action) {
      // 3.1 / 3.11 / 3.12（账号与权限）
      case 'login': result = login_(params); break;
      case 'getUsers': result = getUsers_(params); break;
      case 'updateUserRole': result = updateUserRole_(params); break;

      // 3.2 / 3.3 / 3.7（活动）
      case 'getEvents': result = getEvents_(params); break;
      case 'getEvent': result = getEvent_(params); break;
      case 'manageEvent': result = manageEvent_(params); break;

      // 3.4（日历）
      case 'getCalendarData': result = getCalendarData_(params); break;

      // 3.5 / 3.6 / 3.8 / 3.9（报名与点名）
      case 'registerEvent': result = registerEvent_(params); break;
      case 'cancelRegistration': result = cancelRegistration_(params); break;
      case 'getParticipantList': result = getParticipantList_(params); break;
      case 'markAttendance': result = markAttendance_(params); break;

      // 3.10（统计）
      case 'getDashboardStats': result = getDashboardStats_(params); break;

      // 3.13（健康检查）
      case 'health': result = health_(); break;

      default:
        return jsonOut_(errorEnvelope_('INVALID_ACTION', '無效的操作：' + action, null));
    }

    return jsonOut_(result);
  } catch (err) {
    if (err && err.cesCode) {
      return jsonOut_(errorEnvelope_(err.cesCode, err.message, err.cesData));
    }
    Logger.log('handleRequest_ 未預期錯誤：' + (err && err.stack ? err.stack : err));
    return jsonOut_(errorEnvelope_('SERVER_ERROR',
      '伺服器錯誤：' + (err && err.message ? err.message : String(err)), null));
  }
}

/** 3.13 health：{ok:true,time,version} */
function health_() {
  return okEnvelope_({
    ok: true,
    time: nowString_(),
    version: CONFIG.VERSION
  });
}
