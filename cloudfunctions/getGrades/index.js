// 云函数入口文件
const cloud = require('wx-server-sdk');
const axios = require('axios');
const crypto = require('crypto');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// --- 辅助武器 1：正则提取 csrftoken ---
function extractCsrfToken(html) {
  let reg = /id="csrftoken"[^>]*value="([^"]+)"/i;
  let match = html.match(reg);
  if (match) return match[1];
  reg = /value="([^"]+)"[^>]*id="csrftoken"/i;
  match = html.match(reg);
  if (match) return match[1];
  return null;
}

// --- 辅助武器 2：Base64 转 Base64Url ---
function base64ToBase64Url(base64Str) {
  return base64Str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// 🌟 新增绝招：Cookie 融合器 (将登录后的新通行证和老通行证合并)
function updateCookies(oldCookieStr, newCookieArray) {
  if (!newCookieArray || newCookieArray.length === 0) return oldCookieStr;
  let cookieMap = {};
  
  // 拆解老 Cookie
  oldCookieStr.split(';').forEach(c => {
    let parts = c.trim().split('=');
    if (parts.length >= 2) cookieMap[parts[0]] = parts[1];
  });
  
  // 覆盖新 Cookie
  newCookieArray.forEach(c => {
    let firstPart = c.split(';')[0];
    let parts = firstPart.split('=');
    if (parts.length >= 2) cookieMap[parts[0]] = parts[1];
  });
  
  // 重新组装
  return Object.keys(cookieMap).map(k => `${k}=${cookieMap[k]}`).join('; ');
}


exports.main = async (event, context) => {
  const { studentId, password, xnm = '2025', xqm = '3' } = event;
  const baseUrl = 'http://jwgl.hebtu.edu.cn';

  try {
    // ==========================================
    // 阶段一：静默登录并拿稳所有 Cookie
    // ==========================================
    const getRes = await axios.get(`${baseUrl}/xtgl/login_slogin.html`);
    let cookieStr = (getRes.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
    const csrftoken = extractCsrfToken(getRes.data);

    if (!csrftoken) return { success: false, msg: '获取暗号失败' };

    const keyRes = await axios.get(`${baseUrl}/xtgl/login_getPublicKey.html?time=${Date.now()}`, {
      headers: { 'Cookie': cookieStr }
    });
    
    const { modulus, exponent } = keyRes.data;
    if (!modulus || !exponent) return { success: false, msg: '获取公钥失败' };

    const jwk = { kty: 'RSA', n: base64ToBase64Url(modulus), e: base64ToBase64Url(exponent) };
    const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    const encryptedPassword = crypto.publicEncrypt({
      key: publicKey,
      padding: crypto.constants.RSA_PKCS1_PADDING
    }, Buffer.from(password)).toString('base64');

    const loginRes = await axios({
      method: 'POST',
      url: `${baseUrl}/xtgl/login_slogin.html?time=${Date.now()}`,
      data: `csrftoken=${encodeURIComponent(csrftoken)}&yhm=${encodeURIComponent(studentId)}&mm=${encodeURIComponent(encryptedPassword)}`,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookieStr,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0'
      },
      maxRedirects: 0,
      validateStatus: status => status >= 200 && status < 400
    });

    // 🌟 重点修复：更新 Cookie，拿到包含已授权状态的 JSESSIONID
    cookieStr = updateCookies(cookieStr, loginRes.headers['set-cookie']);

    // 严谨研判登录结果：防止被重定向到 CAS 我们还傻傻不知道
    if (loginRes.status === 302 && loginRes.headers.location && loginRes.headers.location.includes('cas.hebtu')) {
        return { success: false, msg: '教务系统强制拦截，要求走统一认证通道' };
    }

    const htmlData = typeof loginRes.data === 'string' ? loginRes.data : '';
    const isLoginSuccess = loginRes.status === 302 || loginRes.status === 301 || htmlData.includes('退出');

    if (!isLoginSuccess) {
      return { success: false, msg: '登录教务系统失败，请确认密码是否正确' };
    }

    // ==========================================
    // 阶段二：携带完整通行证拉取成绩
    // ==========================================
    const gradeQueryUrl = `${baseUrl}/cjcx/cjcx_cxDgXscj.html?doType=query&gnmkdm=N305005`;
    const queryPayload = `xnm=${xnm}&xqm=${xqm}&sfzgcj=&kcbj=&pkey=&_search=false&nd=${Date.now()}&queryModel.showCount=100&queryModel.currentPage=1`;

    const gradeRes = await axios({
      method: 'POST',
      url: gradeQueryUrl,
      data: queryPayload,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'Cookie': cookieStr, // 此时的 Cookie 已经是最新授权版
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
        'X-Requested-With': 'XMLHttpRequest',
        // 🌟 新增伪装：告诉服务器我们是从哪个页面点过来的
        'Referer': `${baseUrl}/cjcx/cjcx_cxDgXscj.html?doType=query&gnmkdm=N305005`,
        'Origin': baseUrl
      },
      maxRedirects: 0, // 🌟 严禁自动跳转：如果再被踢，直接报错，绝不下载 CAS 源码
      validateStatus: status => status >= 200 && status < 400
    });

    // ==========================================
    // 阶段三：解析数据
    // ==========================================
    if (gradeRes.status === 302) {
       return { success: false, msg: '成绩查询被拦截 (被踢到了: ' + gradeRes.headers.location + ')' };
    }

    if (gradeRes.data && gradeRes.data.items) {
      const cleanGrades = gradeRes.data.items.map(item => ({
        courseName: item.kcmc,       
        credit: item.xf,             
        score: item.cj,              
        gpa: item.jd || '0.0',       
        property: item.kcxzmc,       
        teacher: item.jsxm || '未知',
        jxb_id: item.jxb_id
      }));

      return { 
        success: true, 
        data: cleanGrades,
        term: `${xnm}学年 第${xqm}学期` 
      };
    } else {
      return { success: false, msg: '教务系统未返回成绩 JSON 数据' };
    }

  } catch (error) {
    console.error('抓取异常:', error);
    return { success: false, msg: '网络请求崩溃: ' + error.message };
  }
};