const cloud = require('wx-server-sdk');
const axios = require('axios');
const crypto = require('crypto');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

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

    const scheduleUrl = `${baseUrl}/kbcx/xskbcx_cxXsgrkb.html?time=${Date.now()}&gnmkdm=N2151`;
    const payload = `xnm=${xnm}&xqm=${xqm}&kzlx=ck`; 

    const scheduleRes = await axios({
      method: 'POST',
      url: scheduleUrl,
      data: payload,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'Cookie': cookieStr,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': `${baseUrl}/kbcx/xskbcx_cxXskbcxIndex.html?gnmkdm=N2151` // 防盗链
      }
    });

    const rawList = scheduleRes.data.kbList || [];

    const cleanSchedule = rawList.map(item => ({
      name: item.kcmc,           // 课名
      teacher: item.xm || '',    // 老师
      room: item.cdmc || '未排教室', // 教室
      weeks: item.zcd,           // 周次 (如 "1-16周")
      day: parseInt(item.xqj),   // 星期几 (1-7的数字)
      section: item.jc           // 节次 (如 "1-2节")
    }));

    return { success: true, data: cleanSchedule };

  } catch (error) {
    return { success: false, msg: '课表抓取失败：' + error.message };
  }
};