Page({
  data: {
    inputValue: '',
    messageList: [
      { type: 'ai', text: '你好！我是你的专属校园 AI 助手。你可以直接对我说：“查一下今天1到10节的空闲教室”哦！' }
    ],
    isTyping: false,
    scrollToId: '', 
    isLoggedIn: false,
    userInfo: null
  },

  onShow() {
    this.checkLoginStatus();
  },

  checkLoginStatus() {
    const userInfo = wx.getStorageSync('user_info');
    if (userInfo) {
      this.setData({ isLoggedIn: true, userInfo });
    } else {
      this.setData({ isLoggedIn: false, userInfo: null });
    }
  },

  goToLogin() {
    wx.switchTab({
      url: '/pages/user/user'
    });
  },

  getCurrentTermConfig() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1; 

    let xnm = '';
    let xqm = '';

    if (month >= 8) {
      xnm = year.toString(); 
      xqm = '3';             
    } else if (month === 1) {
      xnm = (year - 1).toString(); 
      xqm = '3';
    } else {
      xnm = (year - 1).toString(); 
      xqm = '12';            
    }

    return { xnm, xqm };
  },

  getCurrentTimeConfig() {
    const now = new Date();
    let xqj = now.getDay();
    if (xqj === 0) xqj = 7; 

    const hour = now.getHours();
    const minute = now.getMinutes();
    const currentTime = hour + minute / 60; 

    let jcd = '3'; 
    let sectionDesc = '1-2节';

    if (currentTime >= 8 && currentTime < 10) {
      jcd = '3'; 
      sectionDesc = '1-2节';
    } else if (currentTime >= 10 && currentTime < 12) {
      jcd = '12'; 
      sectionDesc = '3-4节';
    } else if (currentTime >= 14 && currentTime < 16) {
      jcd = '48'; 
      sectionDesc = '5-6节';
    } else if (currentTime >= 16 && currentTime < 18) {
      jcd = '192'; 
      sectionDesc = '7-8节';
    } else if (currentTime >= 19 && currentTime < 22.5) { 
      jcd = '768'; 
      sectionDesc = '晚上';
    } else if (currentTime >= 22.5 || currentTime < 8) { 
      xqj = xqj === 7 ? 1 : xqj + 1;
      jcd = '3';
      sectionDesc = '明天上午 1-2节';
    }

    const currentWeek = 10; 
    const zcd = Math.pow(2, currentWeek - 1).toString();

    return { xqj: xqj.toString(), jcd, zcd, sectionDesc };
  },

  onLoad(options) {
    this.checkLoginStatus();

    if (options.autoQuery) {
      const query = decodeURIComponent(options.autoQuery);
      this.setData({ inputValue: query });
      this.sendMessage();
    }
  },

  onInput(e) {
    this.setData({ inputValue: e.detail.value });
  },

  async sendMessage() {
    if (!this.data.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    const query = this.data.inputValue.trim();
    if (!query || this.data.isTyping) return;

    const { messageList } = this.data;
    messageList.push({ type: 'user', text: query });

    this.setData({
      messageList,
      inputValue: '',
      isTyping: true
    }, this.scrollToBottom);

    try {
      const aiRes = await wx.cloud.callFunction({
        name: 'askAI',
        data: { query: query }
      });

      if (aiRes.result && aiRes.result.success) {
        const aiData = aiRes.result.data;
        const intent = aiData.intent;

        if (intent === 'classroom') {
          await this.handleClassroomQuery(aiData);
        } else if (intent === 'exam') {
          await this.handleExamQuery(aiData.termDesc);
        } else {
          this.pushAiMessage(aiData.reply);
        }
      } else {
        this.pushAiMessage('网络好像断开连接了，请检查一下~');
      }
    } catch (err) {
      this.pushAiMessage('请求超时了，请稍后再试。');
    }
  },

  // 🤖 核心逻辑：处理【查空教室】意图（带有防内卷随机算法）
  async handleClassroomQuery(aiData) {
    const { timeDesc, dayOffset, sections } = aiData;
    const termConfig = this.getCurrentTermConfig();
    const timeConfig = this.getCurrentTimeConfig(); 

    let targetXqj = timeConfig.xqj;
    if (typeof dayOffset === 'number') {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + dayOffset); 
      let day = targetDate.getDay();
      targetXqj = day === 0 ? '7' : day.toString(); 
    }

    let targetJcd = timeConfig.jcd;
    if (Array.isArray(sections) && sections.length > 0) {
      let mask = 0;
      sections.forEach(s => {
        mask += Math.pow(2, s - 1); 
      });
      targetJcd = mask.toString();
    }

    let displayTime = timeDesc;
    if (!timeDesc || timeDesc.includes('现在') || timeDesc.includes('目前')) {
      displayTime = `现在(${timeConfig.sectionDesc})`;
    }

    this.pushAiMessage(`收到！正在为你寻找【${displayTime}】的空闲教室，请稍候...`);
    this.setData({ isTyping: true }); 

    const account = wx.getStorageSync('jwc_account');
    if (!account) {
      this.pushAiMessage('哎呀，我发现你还没绑定教务系统账号。请先去绑定后再来找我查教室哦！');
      return;
    }

    try {
      const roomRes = await wx.cloud.callFunction({
        name: 'getClassroom',
        data: {
          studentId: account.studentId, 
          password: account.password,
          xnm: termConfig.xnm,          
          xqm: termConfig.xqm,          
          xqj: targetXqj,               
          zcd: timeConfig.zcd,          
          jcd: targetJcd                
        }
      });

      if (roomRes.result && roomRes.result.success && roomRes.result.data.length > 0) {
        
        let allRooms = roomRes.result.data;

        // 1. 过滤掉座位数小于 30 的小教室（如果全都很小，就不过滤）
        let goodRooms = allRooms.filter(r => parseInt(r.seats) >= 30);
        if (goodRooms.length < 5) goodRooms = allRooms; 

        // 2. Fisher-Yates 洗牌算法：把教室完全打乱
        for (let i = goodRooms.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [goodRooms[i], goodRooms[j]] = [goodRooms[j], goodRooms[i]];
        }

        // 3. 选出随机打乱后的前 5 个
        let rooms = goodRooms.slice(0, 5); 

        // 4. 为了展示美观，把选出来的这 5 个按座位数从大到小排序
        rooms.sort((a, b) => parseInt(b.seats) - parseInt(a.seats));

        let reply = `找到啦！为你随机精选了几个【${displayTime}】宽敞的空闲教室：\n\n`;
        rooms.forEach((room, index) => {
          reply += `${index + 1}.  ${room.name} (${room.type}, ${room.seats}座)\n`;
        });
        reply += `\n快去占座吧！`;
        this.pushAiMessage(reply);
      } else {
        this.pushAiMessage(`太火爆了，【${displayTime}】没有找到空闲教室，大家都在卷啊~`);
      }
    } catch (err) {
      this.pushAiMessage('糟糕，教务系统好像在维护，查询失败了。');
    }
  },

  async handleExamQuery(termDesc) {
    this.pushAiMessage(`没问题！正在为你拉取【${termDesc || '本学期'}】的考试安排...`);
    this.setData({ isTyping: true });

    const account = wx.getStorageSync('jwc_account');
    if (!account) {
      this.pushAiMessage('需要先绑定教务系统账号才能查考试哦！');
      return;
    }

    try {
      const { xnm, xqm } = this.getCurrentTermConfig();

      const examRes = await wx.cloud.callFunction({
        name: 'getExamInfo',
        data: {
          studentId: account.studentId,
          password: account.password,
          xnm: xnm, 
          xqm: xqm  
        }
      });

      if (examRes.result && examRes.result.success && examRes.result.data.length > 0) {
        const exams = examRes.result.data;
        let reply = `你要的考试安排来啦，祝你逢考必过！🎉\n\n`;
        exams.forEach((exam, index) => {
          reply += `【${exam.courseName}】\n 时间: ${exam.examTime}\n🏫 地点: ${exam.location}\n🪑 座位: ${exam.seatNum}号\n\n`;
        });
        this.pushAiMessage(reply.trim());
      } else {
        this.pushAiMessage('好消息！目前系统里没有查到你的考试安排，可以稍微放松一下啦~');
      }
    } catch (err) {
      this.pushAiMessage('查询考试安排失败，教务系统可能在闹情绪。');
    }
  },

  pushAiMessage(text) {
    const { messageList } = this.data;
    messageList.push({ type: 'ai', text: text });
    this.setData({
      messageList,
      isTyping: false
    }, this.scrollToBottom);
  },

  scrollToBottom() {
    setTimeout(() => {
      this.setData({ scrollToId: `msg-${this.data.messageList.length - 1}` });
    }, 100);
  }
});