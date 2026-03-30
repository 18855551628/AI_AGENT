const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// 校园运势盲盒题库
const fortunes = [
  { title: '逢考必过', type: '宜', action: '泡图书馆', desc: '今天脑力爆表，速去复习硬核科目！', points: 15, color: '#52c41a' },
  { title: '福星高照', type: '宜', action: '表白/交友', desc: '魅力值满点，去操场转转说不定有奇遇~', points: 20, color: '#fa8c16' },
  { title: '劳逸结合', type: '忌', action: '疯狂熬夜', desc: '黑眼圈快掉到地上了，今天宜早睡养生。', points: 10, color: '#1890ff' },
  { title: '食神附体', type: '宜', action: '吃食堂', desc: '今天去食堂有几率打到阿姨手不抖的肉！', points: 12, color: '#eb2f96' },
  { title: '水逆退散', type: '忌', action: '冲动消费', desc: '捂好钱包，不要乱消费了噢', points: 8, color: '#722ed1' }
];

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  // 1. 强制转换北京时间
  const now = new Date();
  const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const todayStr = beijingTime.toISOString().split('T')[0]; 
  
  const yesterdayTime = new Date(beijingTime.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayStr = yesterdayTime.toISOString().split('T')[0];

  try {
    // 2. 查询用户账户
    const userRes = await db.collection('user_account').where({ _openid: openid }).get();
    let account = userRes.data[0];

    // 如果是新用户，先建初始账户
    if (!account) {
      await db.collection('user_account').add({
        data: { _openid: openid, totalPoints: 0, streakDays: 0, lastCheckIn: '' }
      });
      account = { totalPoints: 0, streakDays: 0, lastCheckIn: '' };
    }

    // 3. 防刷拦截：今天已经签到过了
    if (account.lastCheckIn === todayStr) {
      return { success: false, msg: '今天已经签过到了哦，明天再来吧！' };
    }

    // 4. 计算连续签到天数 (昨天签了就+1，否则断签重置为1)
    let newStreak = (account.lastCheckIn === yesterdayStr) ? (account.streakDays + 1) : 1;

    // 5. 抽取今日运势和基础积分
    // 注意：对象是按引用传递的，为了防止修改原题库，这里浅拷贝一下
    const randomFortune = { ...fortunes[Math.floor(Math.random() * fortunes.length)] };
    let rewardPoints = randomFortune.points; 

    // --- 【核心修改区 开始】 ---

    // 5.1 连签累增奖励逻辑 (第2天+1, 第3天+2... 最多+5)
    let streakBonus = 0;
    if (newStreak > 1) {
      // 巧用 Math.min，确保加分上限不会超过 5
      streakBonus = Math.min(newStreak - 1, 5); 
      rewardPoints += streakBonus;
    }

    // 5.2 动态拼接提示文案，给用户情绪价值
    let prefixMsg = '';
    if (streakBonus > 0) {
      prefixMsg = `连签加成+${streakBonus}分！`;
    }

    // 5.3 逢 7 天额外大奖逻辑
    if (newStreak % 7 === 0) {
      rewardPoints += 30; 
      // 触发 7 天大奖时，覆盖掉普通的连签提示，让文案更震撼
      prefixMsg = `连续签到 ${newStreak} 天达成！额外送30分！`; 
    }

    // 把奖励提示拼接到运势描述的前面
    if (prefixMsg) {
      randomFortune.desc = prefixMsg + randomFortune.desc;
    }

    // --- 【核心修改区 结束】 ---


    // 6. 原子化更新账户
    await db.collection('user_account').where({ _openid: openid }).update({
      data: {
        totalPoints: _.inc(rewardPoints),
        streakDays: newStreak,
        lastCheckIn: todayStr,
        updateTime: db.serverDate(),
        todayFortune: randomFortune
      }
    });

    // 7. 记录积分流水 
    await db.collection('point_records').add({
      data: {
        _openid: openid,
        action: 'daily_check_in',
        points_change: rewardPoints,
        fortune_title: randomFortune.title,
        streak_days: newStreak, // 顺手把连续签到天数也记到流水里，方便日后查账
        createTime: db.serverDate()
      }
    });

    // 8. 返回给前端更新界面
    return { 
      success: true, 
      fortune: randomFortune, 
      newPoints: account.totalPoints + rewardPoints, 
      newStreak: newStreak,
      earnedPoints: rewardPoints // 把本次实际赚到的总积分也返给前端，方便做弹窗动画
    };

  } catch (error) {
    return { success: false, msg: '签到服务器开小差了：' + error.message };
  }
};