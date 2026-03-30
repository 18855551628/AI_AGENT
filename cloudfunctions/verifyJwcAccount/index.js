// 云函数入口文件
const cloud = require('wx-server-sdk');
const axios = require('axios');
const crypto = require('crypto'); 

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// --- 辅助武器：正则提取 csrftoken ---
function extractCsrfToken(html) {
  let reg = /id="csrftoken"[^>]*value="([^"]+)"/i;
  let match = html.match(reg);
  if (match) return match[1];
  
  reg = /value="([^"]+)"[^>]*id="csrftoken"/i;
  match = html.match(reg);
  if (match) return match[1];
  return null;
}

// 🌟 核心修复点：河北师大下发的已经是 Base64，直接转成 Base64Url 即可，不再按 Hex 解析！
function base64ToBase64Url(base64Str) {
  return base64Str
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

exports.main = async (event, context) => {
  const { studentId, password } = event;
  const baseUrl = 'http://jwgl.hebtu.edu.cn';

  try {
    // 1. 拿 Cookie 和 暗号(csrftoken)
    const getRes = await axios.get(`${baseUrl}/xtgl/login_slogin.html`);
    const rawCookies = getRes.headers['set-cookie'] || [];
    const cookieStr = rawCookies.map(c => c.split(';')[0]).join('; ');
    const html = getRes.data;
    const csrftoken = extractCsrfToken(html);

    if (!csrftoken) {
      return { success: false, msg: '获取暗号 csrftoken 失败' };
    }

    // 2. 拿 RSA 公钥
    const keyRes = await axios.get(`${baseUrl}/xtgl/login_getPublicKey.html?time=${Date.now()}`, {
      headers: { 'Cookie': cookieStr }
    });

    const modulus = keyRes.data.modulus;
    const exponent = keyRes.data.exponent;

    if (!modulus || !exponent) {
      return { success: false, msg: '获取 RSA 公钥失败' };
    }

    // 3. 组装钥匙并加密（修复了 invalid key 的问题）
    const jwk = {
      kty: 'RSA',
      n: base64ToBase64Url(modulus),
      e: base64ToBase64Url(exponent)
    };
    
    const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    const encryptedPassword = crypto.publicEncrypt({
      key: publicKey,
      padding: crypto.constants.RSA_PKCS1_PADDING
    }, Buffer.from(password)).toString('base64');

    // 4. 发起登录
    const formData = `csrftoken=${encodeURIComponent(csrftoken)}&yhm=${encodeURIComponent(studentId)}&mm=${encodeURIComponent(encryptedPassword)}`;

    const loginRes = await axios({
      method: 'POST',
      url: `${baseUrl}/xtgl/login_slogin.html?time=${Date.now()}`,
      data: formData,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookieStr, 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0'
      },
      maxRedirects: 0, 
      validateStatus: status => status >= 200 && status < 400
    });

    // 5. 验证结果
    const htmlData = typeof loginRes.data === 'string' ? loginRes.data : '';

    if (loginRes.status === 302 || loginRes.status === 301) {
      return { success: true, msg: '验证通过(触发重定向)' };
    }
    if (htmlData.includes('用户名或密码不正确')) {
      return { success: false, msg: '学号或密码错误' };
    }
    if (htmlData.includes('验证码')) {
      return { success: false, msg: '系统检测频繁，触发验证码拦截' };
    }
    if (htmlData.includes('退出') || htmlData.includes('个人信息')) {
      return { success: true, msg: '验证通过(静默进入)' };
    }

    return { success: false, msg: '教务系统未放行', debug_status: loginRes.status };

  } catch (error) {
    console.error('云函数运行错误:', error);
    return { success: false, msg: '请求过程发生异常: ' + error.message };
  }
};