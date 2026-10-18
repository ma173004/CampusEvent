/**
 * =============================================================================
 * 02_Auth.gs · 登录与权限
 * -----------------------------------------------------------------------------
 * 契约对应：3.1 login / 3.11 getUsers / 3.12 updateUserRole
 *           以及 3.7/3.8/3.9 共用的角色校验（Teacher/Admin、Teacher 仅限自己主持的活动）。
 *
 * 说明：本项目按方案要求密码明文存储（见数据字典），不做哈希/加密。
 * =============================================================================
 */

/* ============================== 3.1 login (POST) ============================== */

/**
 * 请求：{"action":"login","userID":"S2201","password":"student123"}
 * 成功：data = { user:{userID,name,role,email,class,club,grade,isOfficer}, now }
 * 失败：AUTH_FAILED「帳號或密碼錯誤」
 */
function login_(params) {
  var userID = trimParam_(params, 'userID');
  var password = params.password === undefined || params.password === null
    ? '' : String(params.password);

  if (!userID) apiFail_('INVALID_PARAM', '缺少參數：userID');
  if (!password) apiFail_('INVALID_PARAM', '缺少參數：password');

  var users = readUsers_();
  var user = getUser_(users, userID);
  // 账号不存在或密码不符统一返回同一提示，避免账号枚举
  if (!user || user.password !== password) {
    apiFail_('AUTH_FAILED', '帳號或密碼錯誤');
  }

  return okEnvelope_({
    user: userPublic_(user),
    now: nowString_()
  });
}

/* ============================== 3.11 getUsers (GET) —— 仅 Admin ============================== */

/**
 * 请求：?action=getUsers&userID=U001
 * data：{users:[{userID,name,role,email,class,club,grade,isOfficer}]}（不返回 Password）
 */
function getUsers_(params) {
  requireOperator_(params.userID, ['Admin'], '未授權的操作（只限管理員）');
  var users = readUsers_();
  var list = [];
  for (var i = 0; i < users.length; i++) {
    list.push(userPublic_(users[i]));
  }
  return okEnvelope_({ users: list });
}

/* ============================== 3.12 updateUserRole (POST) —— 仅 Admin ============================== */

/**
 * 请求：{"action":"updateUserRole","userID":"U001","targetUserID":"S2203","role":"Teacher"}
 * data：{userID, role}；role 非法 → VALIDATION_ERROR；目标不存在 → NOT_FOUND
 */
function updateUserRole_(params) {
  requireOperator_(params.userID, ['Admin'], '未授權的操作（只限管理員）');

  var targetUserID = trimParam_(params, 'targetUserID');
  if (!targetUserID) apiFail_('INVALID_PARAM', '缺少參數：targetUserID');

  var role = params.role === undefined || params.role === null ? '' : String(params.role).trim();
  if (role !== 'Student' && role !== 'Teacher' && role !== 'Admin') {
    apiFail_('VALIDATION_ERROR', 'role 必須為 Student / Teacher / Admin');
  }

  var users = readUsers_();
  var target = getUser_(users, targetUserID);
  if (!target) apiFail_('NOT_FOUND', '使用者不存在');

  target.role = role;
  var rowObj = userRow_(target);
  rowObj._row = target._row;
  updateSheetObject_('Users', rowObj);

  return okEnvelope_({ userID: target.userID, role: target.role });
}

/* ============================== 权限校验辅助 ============================== */

/** 取参数并 trim（GAS 的 e.parameter 全是字符串） */
function trimParam_(params, key) {
  if (!params) return '';
  var v = params[key];
  if (v === undefined || v === null) return '';
  return String(v).trim();
}

/**
 * 要求操作者为指定角色之一。
 * @param {string} userID 操作者
 * @param {string[]} roles 允许角色，如 ['Teacher','Admin']
 * @param {string} message 失败提示
 * @return 用户对象
 */
function requireOperator_(userID, roles, message) {
  var id = userID === undefined || userID === null ? '' : String(userID);
  var users = readUsers_();
  var user = getUser_(users, id);
  if (!user) {
    apiFail_('NOT_AUTHORIZED', message || '未授權的操作（使用者不存在）');
  }
  if (roles && roles.length > 0 && !contains_(roles, user.role)) {
    apiFail_('NOT_AUTHORIZED', message || '未授權的操作（權限不足）');
  }
  return user;
}

/** Teacher 只能操作 HostID 为自己的活动；Admin 不限（契约 3.7 权限） */
function requireHostOrAdmin_(operator, event) {
  if (operator.role === 'Admin') return;
  if (operator.role === 'Teacher' && event.hostID === operator.userID) return;
  apiFail_('NOT_AUTHORIZED', '未授權的操作（只可管理自己主持的活動）');
}

/** 取活动，不存在 / 缺参数时报错（契约 3.3 NOT_FOUND） */
function requireEvent_(params) {
  var eventID = trimParam_(params, 'eventID');
  if (!eventID) apiFail_('INVALID_PARAM', '缺少參數：eventID');
  var events = readEvents_();
  var event = getEventById_(events, eventID);
  if (!event) apiFail_('NOT_FOUND', '活動不存在');
  return event;
}
