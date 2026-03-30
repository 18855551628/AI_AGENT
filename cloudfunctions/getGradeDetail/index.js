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
  const { studentId, password, jxb_id, xnm, xqm, courseName } = event;
  const baseUrl = 'http://jwgl.hebtu.edu.cn';

  if (!jxb_id || jxb_id === 'undefined') {
    return { 
      success: false, 
      msg: `【${courseName}】的 jxb_id 丢失！请务必点击上方工具栏的“重新编译”，刷新成绩列表后再试！` 
    };
  }

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

    // === 2. 抓取明细网页 ===
    const detailUrl = `${baseUrl}/cjcx/cjcx_cxCjxqGjh.html?time=${Date.now()}&gnmkdm=N305005`;
    const payload = `jxb_id=${jxb_id}&xnm=${xnm}&xqm=${xqm}&kcmc=${encodeURIComponent(courseName)}`;

    const detailRes = await axios({
      method: 'POST',
      url: detailUrl,
      data: payload,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'Cookie': cookieStr,
        'User-Agent': 'Mozilla/5.0',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': `${baseUrl}/cjcx/cjcx_cxDgXscj.html?doType=query&gnmkdm=N305005`
      },
      maxRedirects: 0,
      validateStatus: status => status >= 200 && status < 400
    });

    const html = detailRes.data;

    const detailsList = [];
    const trReg = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let trMatch;
    
    while ((trMatch = trReg.exec(html)) !== null) {
      const tdReg = /<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi;
      let tdMatch;
      const tds = [];
      while ((tdMatch = tdReg.exec(trMatch[1])) !== null) {
        let cleanText = tdMatch[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/ig, '').replace(/\s+/g, ' ').trim();
        tds.push(cleanText);
      }
      if (tds.length >= 3 && !tds[0].includes('成绩分项') && !tds[0].includes('总评')) {
        let name = tds[0].replace(/【|】/g, ''); 
        detailsList.push({ name: name, percent: tds[1], score: tds[2] });
      }
    }

    if (detailsList.length === 0) {
       return { success: false, msg: '这门课暂无分项明细 (教务系统返回了空表格)' };
    }

    return { success: true, data: detailsList };

  } catch (error) {
    return { success: false, msg: '抓取异常: ' + error.message };
  }
};