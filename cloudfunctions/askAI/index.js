const cloud = require('wx-server-sdk')
const axios = require('axios')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// 替换为你真实的火山引擎 API_KEY 和 接入点
const API_KEY = '868aed42-3c7b-4a76-b85b-f47ca54340fc';

const ENDPOINT_ID = 'ep-20260329170901-l9rr7';

exports.main = async (event, context) => {
  const { query } = event;
  if (!query) return { success: false, error: '问题不能为空' };

  try {
    const modelUrl = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
    
    // 🌟 核心升级：让 AI 变成一个强大的“参数提取器”
    const systemPrompt = `你是一个大学校园专属AI助手。你需要精准识别用户的意图并提取关键参数。
请严格按照以下 JSON 格式输出，不要包含任何额外的 markdown 标记（如 \`\`\`json ），直接输出纯 JSON 字符串：

1. 如果用户想查询【空闲教室/自习室】：
{ 
  "intent": "classroom", 
  "timeDesc": "用户提到的原始时间描述，如'今天1到10节'或'明天上午'",
  "dayOffset": 0, // 0代表今天，1代表明天，2代表后天，依次类推。如果是具体的星期几，请根据今天推算出天数差。如果没提具体日期，默认 0。
  "sections": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] // 解析用户提到的具体节次，返回一个纯数字数组。比如'1到10节'就是[1,2,3,4,5,6,7,8,9,10]。'上午'默认[1,2,3,4,5]，'下午'默认[6,7,8,9,10]，'晚上'默认[11,12,13]。如果用户问'现在'或没提节次，必须返回 [] 空数组。
}

2. 如果用户想查询【考试安排/考场】：
{ "intent": "exam", "termDesc": "用户提到的学期，如这学期" }

3. 其他任何日常聊天、写简历、模拟面试、学习建议等：
{ "intent": "chat", "reply": "你的具体回答内容（可以用自然语言，带有鼓励的语气）" }`;

    const chatRes = await axios.post(
      modelUrl,
      {
        model: ENDPOINT_ID,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: query }
        ],
        temperature: 0.1 // 保持低温度，确保 JSON 格式化输出的准确性
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`
        }
      }
    );

    let resultText = chatRes.data.choices[0].message.content.trim();
    
    // 清洗可能存在的 markdown 代码块包裹
    if (resultText.startsWith('```json')) {
      resultText = resultText.replace(/^```json\n/, '').replace(/\n```$/, '');
    } else if (resultText.startsWith('```')) {
      resultText = resultText.replace(/^```\n/, '').replace(/\n```$/, '');
    }

    // 解析大模型返回的 JSON
    const parsedData = JSON.parse(resultText);
    
    return {
      success: true,
      data: parsedData // 包含了 intent, dayOffset, sections 等字段
    };

  } catch (err) {
    console.error('AI 意图识别失败:', err);
    return { success: false, data: { intent: 'chat', reply: '抱歉，我的大脑好像短路了，没能理解你的意思。' } };
  }
}