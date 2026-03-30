const cloud = require('wx-server-sdk');
const axios = require('axios');
const crypto = require('crypto');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// --- 工具函数：解析 Token 和处理 Cookie ---
function extractCsrfToken(html) {
  let reg = /id="csrftoken"[^>]*value="([^"]+)"/i; let match = html.match(reg); if (match) return match[1];
  reg = /value="([^"]+)"[^>]*id="csrftoken"/i; match = html.match(reg); if (match) return match[1]; return null;
}
function base64ToBase64Url(base64Str) { return base64Str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, ''); }
function updateCookies(oldCookieStr, newCookieArray) {
  if (!newCookieArray || newCookieArray.length === 0) return oldCookieStr;
  let cookieMap = {};
  oldCookieStr.split(';').forEach(c => { let parts = c.trim().split('='); if (parts.length >= 2) cookieMap[parts[0]] = parts[1]; });
  newCookieArray.forEach(c => { let parts = c.split(';')[0].split('='); if (parts.length >= 2) cookieMap[parts[0]] = parts[1]; });
  return Object.keys(cookieMap).map(k => `${k}=${cookieMap[k]}`).join('; ');
}

exports.main = async (event, context) => {
  const { studentId, password, xnm, xqm } = event;
  const baseUrl = 'http://jwgl.hebtu.edu.cn';

  try {
    // 1. 模拟登录获取 Cookie 和 Token
    const getRes = await axios.get(`${baseUrl}/xtgl/login_slogin.html`);
    let cookieStr = (getRes.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
    const csrftoken = extractCsrfToken(getRes.data);
    const keyRes = await axios.get(`${baseUrl}/xtgl/login_getPublicKey.html?time=${Date.now()}`, { headers: { 'Cookie': cookieStr } });
    const { modulus, exponent } = keyRes.data;
    const jwk = { kty: 'RSA', n: base64ToBase64Url(modulus), e: base64ToBase64Url(exponent) };
    const encryptedPassword = crypto.publicEncrypt({ key: crypto.createPublicKey({ key: jwk, format: 'jwk' }), padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.from(password)).toString('base64');

    const loginRes = await axios({
      method: 'POST',
      url: `${baseUrl}/xtgl/login_slogin.html?time=${Date.now()}`,
      data: `csrftoken=${encodeURIComponent(csrftoken)}&yhm=${encodeURIComponent(studentId)}&mm=${encodeURIComponent(encryptedPassword)}`,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': cookieStr },
      maxRedirects: 0,
      validateStatus: status => status >= 200 && status < 400
    });
    cookieStr = updateCookies(cookieStr, loginRes.headers['set-cookie']);

    // 2. 构造查询参数并请求考试信息接口
    const queryUrl = `${baseUrl}/kwgl/kscx_cxXsksxxIndex.html?doType=query&gnmkdm=N358105`;
    
    const params = new URLSearchParams();
    params.append('xnm', xnm || '2024');   // 抓包里的学年
    params.append('xqm', xqm || '12');     // 抓包里的学期
    params.append('_search', 'false');
    params.append('nd', Date.now().toString());
    params.append('queryModel.showCount', '100'); // 改大一点，保证一次性拉出整个学期的所有考试
    params.append('queryModel.currentPage', '1');
    params.append('queryModel.sortName', '');
    params.append('queryModel.sortOrder', 'asc');
    params.append('time', '1');

    const examRes = await axios({
      method: 'POST',
      url: queryUrl,
      data: params.toString(),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'Cookie': cookieStr,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': `${baseUrl}/kwgl/kscx_cxXsksxxIndex.html?gnmkdm=N358105`
      }
    });

    // 拦截校验：如果教务系统把我们踢回了登录页
    if (typeof examRes.data === 'string' && examRes.data.includes('html')) {
        return { success: false, msg: '登录失效或系统正在维护，请稍后重试' };
    }

    // 3. 数据清洗 (精准匹配你发来的字段)
    const rawList = examRes.data.items || [];
    const cleanExamList = rawList.map(item => {
      // 提取“期末考试”、“期中考试”等短标签，比如把"2024-2025-2学期 期末考试"变成"期末考试"
      let examTag = '未知类型';
      if (item.ksmc) {
        const parts = item.ksmc.split(' ');
        examTag = parts.length > 1 ? parts[parts.length - 1] : item.ksmc;
      }

      return {
        id: item.sjbh || item.row_id || Math.random().toString(), // 用事件编号作为唯一 key
        courseName: item.kcmc || '未知课程',           // 比如：编译原理
        examTime: item.kssj || '时间未定',             // 比如：2025-06-26(14:30-16:30)
        location: item.cdmc || '考场未定',             // 比如：公共教学楼B座208
        seatNum: item.zwh || '暂无',                   // 比如：4
        status: examTag                                // 比如：期末考试
      };
    });

    return { success: true, data: cleanExamList, total: cleanExamList.length };
  } catch (error) {
    return { success: false, msg: '查询异常：' + error.message };
  }
};