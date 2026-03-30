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
  const { studentId, password, xnm, zcd, xqj, jcd } = event;
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

    const queryUrl = `${baseUrl}/cdjy/cdjy_cxKxcdlb.html?doType=query&gnmkdm=N2155`;
    
    //使用 URLSearchParams 严格构造表单，100% 还原你的抓包数据
    const params = new URLSearchParams();
    params.append('xqh_id', '4');             // 裕华校区
    params.append('xnm', xnm || '2025');      // 学年
    params.append('xqm', '12');               // 强制匹配截图的学期 2025-2026-2
    params.append('cdlb_id', '02');           // 多媒体教室
    params.append('cdejlb_id', '');
    params.append('qszws', '');
    params.append('jszws', '');
    params.append('cdmc', '');
    params.append('lh', '');                  // 楼号置空，查所有教学楼
    params.append('jyfs', '0');
    params.append('cdjylx', '');
    params.append('sfbhkc', '');
    params.append('zcd', zcd.toString());     // 前端算好的二进制周次 (如 32)
    params.append('xqj', xqj.toString());     // 星期
    params.append('jcd', jcd.toString());     // 前端算好的二进制节次 (如 6175)
    params.append('_search', 'false');
    params.append('nd', Date.now().toString());
    params.append('queryModel.showCount', '200'); // 一次性拉取全校
    params.append('queryModel.currentPage', '1');
    params.append('queryModel.sortName', 'cdbh');
    params.append('queryModel.sortOrder', 'asc');
    params.append('time', '3');

    const roomRes = await axios({
      method: 'POST',
      url: queryUrl,
      data: params.toString(),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'Cookie': cookieStr,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': `${baseUrl}/cdjy/cdjy_cxKxcdlb.html?gnmkdm=N2155`
      }
    });

    if (typeof roomRes.data === 'string' && roomRes.data.includes('html')) {
        let detailMatch = roomRes.data.match(/<p[^>]*class="[^"]*alert-danger[^"]*"[^>]*>\s*([\s\S]*?)\s*<\/p>/i);
        let realError = detailMatch ? detailMatch[1].replace(/<[^>]+>/g, '').trim() : '系统参数仍被拦截';
        return { success: false, msg: '教务系统原话：' + realError };
    }

    const rawList = roomRes.data.items || [];
    const cleanRoomList = rawList.map(item => ({
      id: item.cd_id,
      name: item.cdmc,
      type: item.cdlbmc || '普通教室',
      building: item.jxlmc || '',
      seats: item.kszws1 || item.zws || '未知'
    }));

    return { success: true, data: cleanRoomList, total: cleanRoomList.length };
  } catch (error) {
    return { success: false, msg: '抓取报错：' + error.message };
  }
};