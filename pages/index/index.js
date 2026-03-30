// 声明在 Page 外面的变量，它的生命周期跟随整个小程序运行期间
// 只有用户彻底退出重进小程序，它才会重置为 false
let hasGreetedThisSession = false;

Page({
  data: {
    daysLeft: 0,
    hasCheckedIn: false,
    totalPoints: 0,
    streakDays: 0,
    todayFortune: null,
    showStreakRules: false,
    userInfo: null,
    // AI 助手相关状态
    aiQuery: '',         
    currentQuery: '',    
    aiResponse: '',      
    isAiLoading: false   
  },

  toggleStreakRules() {
    this.setData({
      showStreakRules: !this.data.showStreakRules
    });
  },

  closeTooltip() {
    if (this.data.showStreakRules) {
      this.setData({
        showStreakRules: false
      });
    }
  },

  getTodayStr() {
    const now = new Date();
    const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    return beijingTime.toISOString().split('T')[0];
  },

  onLoad() {
    this.calculateDays();
  },

  onShow() {
    this.fetchUserAccount();
    const userInfo = wx.getStorageSync('user_info');
    if (userInfo) {
      this.setData({ userInfo });
    }
    // 🌟 每次页面展示时，尝试触发 AI 主动问候
    this.autoGreet();
  },

  // === 新增：AI 智能主动问候逻辑 ===
  autoGreet() {
    // 如果这次运行期间已经问候过了，就直接跳过
    if (hasGreetedThisSession) return;
    hasGreetedThisSession = true;

    // 1. 获取当前时间推算问候语
    const hour = new Date().getHours();
    let timeGreeting = '';
    if (hour >= 6 && hour < 11) timeGreeting = '早上好！🌅 一日之计在于晨。';
    else if (hour >= 11 && hour < 14) timeGreeting = '中午好！🍱 记得按时干饭哦。';
    else if (hour >= 14 && hour < 18) timeGreeting = '下午好！☕ 学习辛苦啦。';
    else if (hour >= 18 && hour < 23) timeGreeting = '晚上好！🌙 忙碌了一天，放松一下吧。';
    else timeGreeting = '夜深了！🦉 还在修仙吗？注意保护头发哦~';

    // 2. 模拟检查未读消息 (将来这里可以换成查数据库真实未读数)
    // 这里简单做个随机数模拟 0~2 条消息
    const unreadCount = Math.floor(Math.random() * 3); 
    let msgPrompt = unreadCount > 0 
      ? `顺便提醒一下，你还有 ${unreadCount} 条未读的消息。` 
      : `目前没有任何未读消息，一切井然有序。`;

    // 3. 延迟一点点弹出来，显得比较自然
    setTimeout(() => {
      this.setData({
        currentQuery: '', // 留空，代表这是 AI 自己主动说话，不是用户问的
        aiResponse: `${timeGreeting}\n\n${msgPrompt}\n\n今天想了解点什么？查课表还是找空教室？`,
        isAiLoading: false
      });
    }, 800);
  },

  handleCheckIn() {
    const accountInfo = wx.getStorageSync('user_info');
    if (!accountInfo) {
      wx.showToast({ title: '请先登录哦', icon: 'none' });
      return;
    }
    if (this.data.hasCheckedIn) return;

    wx.vibrateShort();
    wx.showLoading({ title: '正在求签...', mask: true });
    wx.cloud.callFunction({
      name: 'dailyCheckIn',
      success: res => {
        wx.hideLoading();
        const result = res.result;

        if (result && result.success) {
          const newData = {
            hasCheckedIn: true,
            todayFortune: result.fortune,
            totalPoints: result.newPoints,
            streakDays: result.newStreak
          };
          this.setData(newData);
          wx.setStorageSync('point_data_cache', {
            ...newData,
            cacheDate: this.getTodayStr()
          });
          wx.setStorageSync('need_refresh_points', true);
          wx.showToast({ title: '签到成功！', icon: 'success' });
        } else {
          wx.showToast({ title: result.msg || '签到失败', icon: 'none' });
        }
      },
      fail: err => {
        wx.hideLoading();
        wx.showToast({ title: '网络开小差了', icon: 'none' });
        console.error('签到云函数报错：', err);
      }
    });
  },

  async fetchUserAccount() {
    const accountInfo = wx.getStorageSync('user_info');
    if (!accountInfo) {
      this.setData({
        totalPoints: 0,
        streakDays: 0,
        hasCheckedIn: false,
        todayFortune: null
      });
      wx.removeStorageSync('point_data_cache'); 
      return;
    }

    const todayStr = this.getTodayStr();
    const localCache = wx.getStorageSync('point_data_cache');
    if (localCache && localCache.cacheDate === todayStr) {
      this.setData({
        totalPoints: localCache.totalPoints,
        streakDays: localCache.streakDays,
        hasCheckedIn: localCache.hasCheckedIn,
        todayFortune: localCache.todayFortune
      });
      return;
    }

    try {
      const db = wx.cloud.database();
      const res = await db.collection('user_account').get();
      if (res.data.length > 0) {
        const account = res.data[0];
        const now = new Date();
        const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
        const todayStr = beijingTime.toISOString().split('T')[0];
        const isCheckedInToday = (account.lastCheckIn === todayStr);

        let displayFortune = null;
        if (isCheckedInToday && account.todayFortune) {
          displayFortune = account.todayFortune;
        }

        const freshData = {
          totalPoints: account.totalPoints || 0,
          streakDays: account.streakDays || 0,
          hasCheckedIn: isCheckedInToday,
          todayFortune: displayFortune
        };
        this.setData(freshData);
        wx.setStorageSync('point_data_cache', {
          ...freshData,
          cacheDate: todayStr
        });
      }
    } catch (err) {
      console.error('获取账户资产失败：', err);
    }
  },

  goToMall() {
    wx.navigateTo({ url: '/pages/point_market/point_market' });
  },

  onToolClick(e) {
    const type = e.currentTarget.dataset.type;
    if (type === 'map') {
      wx.navigateTo({ url: '/pages/map/map' });
    } else if (type === 'forum') {
      wx.navigateTo({ url: '/pages/forum/forum' });
    } else if (type === 'ai') {
      this.goToAIChat();
    }
  },

  calculateDays() {
    const targetDate = new Date('2026-06-01');
    const today = new Date();
    const diff = targetDate - today;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    this.setData({
      daysLeft: days > 0 ? days : 0
    });
  },

  goToAIChat() {
    wx.navigateTo({
      url: '/pages/askAI/askAI',
    });
  },

  // === AI 桌面卡片互动逻辑 ===

  onAiInput(e) {
    this.setData({ aiQuery: e.detail.value });
  },

  quickAskInPage(e) {
    const query = e.currentTarget.dataset.query;
    this.setData({ aiQuery: query });
    this.sendAiQuery();
  },

  resetAi() {
    this.setData({
      aiQuery: '',
      currentQuery: '',
      aiResponse: '',
      isAiLoading: false
    });
  },

  async sendAiQuery() {
    const query = this.data.aiQuery ? this.data.aiQuery.trim() : '';
    if (!query) {
      wx.showToast({ title: '你想问点什么呢？', icon: 'none' });
      return;
    }

    this.setData({
      currentQuery: query,
      aiQuery: '', 
      isAiLoading: true,
      aiResponse: ''
    });

    try {
      const res = await wx.cloud.callFunction({
        name: 'askAI',
        data: { query: query }
      });

      if (res.result && res.result.success) {
        const aiData = res.result.data; 
        
        if (aiData.intent === 'chat') {
          this.setData({
            aiResponse: aiData.reply,
            isAiLoading: false
          });
        } 
        else {
          this.setData({ isAiLoading: false });
          wx.navigateTo({
            url: `/pages/askAI/askAI?autoQuery=${encodeURIComponent(this.data.currentQuery)}`
          });
          
          setTimeout(() => {
            this.resetAi();
          }, 800);
        }
      } else {
        this.setData({
          aiResponse: '抱歉，我刚刚走神了，请稍后再试一次哦。',
          isAiLoading: false
        });
      }
    } catch (err) {
      console.error('AI 请求失败', err);
      this.setData({
        aiResponse: '网络好像有点问题，请检查下网络连接~',
        isAiLoading: false
      });
    }
  }
});