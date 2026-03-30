Page({
  data: {
    // 顶部问候语数据
    userInfo: {
      name: "同学",
      greeting: "今天也要好好学习呀"
    },

    nextClass: {
      hasCourse: false,
      status: '',
      courseName: "",
      time: "",
      location: "",
      teacher: ""
    },

    // 快捷工具入口
    quickTools: [
      { id: 'grades', name: '成绩查询', icon: 'records', desc: '期末/绩点', color: '#FFF4E5' },
      { id: 'classroom', name: '空闲教室', icon: 'location-o', desc: '自习/研讨', color: '#FFFFE5' },
      { id: 'exam', name: '考试安排', icon: 'notes-o', desc: '考场查询', color: '#E8F5E9' },
      { id: 'askAI', name: 'AI助手', icon: 'chat-o', desc: '智能问答', color: '#F3E5F5' }
    ],

    // 社区互动模块
    communityModules: [
      { id: 'partner', name: '寻找搭子', icon: 'friends-o', desc: '课表智配', color: '#FFFFFF' },
      { id: 'market', name: '二手市场', icon: 'shopping-cart-o', desc: '闲置出清', color: '#FFFFFF' },
      { id: 'lost', name: '失物招领', icon: 'search', desc: '互帮互助', color: '#FFFFFF' },
      { id: 'forum', name: '校园论坛', icon: 'comment-o', desc: '畅所欲言', color: '#FFFFFF' },
      { id: 'map', name: '校园地图', icon: 'location-o', desc: '路线导航', color: '#FFFFFF' },
      { id: 'errand', name: '跑腿代办', icon: 'logistics', desc: '省时省力', color: '#FFFFFF' },
      { id: 'physical_test', name: '体测估分', icon: 'award-o', desc: '成绩预估', color: '#FFFFFF' },
      { id: 'cet_score', name: '四六级估分', icon: 'records', desc: '成绩预估', color: '#FFFFFF' },
    ],
    loading: true,
  },

  onLoad(options) {
    this.setGreetingByTime();

    setTimeout(() => {
      this.setData({
        loading: false
      });
    }, 1000);
  },

  onShow() {
    this.updateNextClass();
  },

  setGreetingByTime() {
    const hour = new Date().getHours();
    let greetText = "今天也要好好学习呀";
    if (hour < 9) greetText = "早上好，新的一天开始啦";
    else if (hour >= 9 && hour < 12) greetText = "上午好，打起精神来";
    else if (hour >= 12 && hour < 14) greetText = "中午好，记得午休哦";
    else if (hour >= 14 && hour < 18) greetText = "下午好，继续加油";
    else if (hour >= 18 && hour < 22) greetText = "晚上好，注意休息";
    else greetText = "夜深了，早点睡吧";

    this.setData({ 'userInfo.greeting': greetText });
  },

  updateNextClass() {
    const account = wx.getStorageSync('jwc_account');
    if (!account) return;

    // 1. 获取当前时间信息
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTimeVal = currentHour * 60 + currentMinute; // 转换成“分钟数”方便比较

    // 获取星期几 (JS里周日是0，我们要转成教务系统的 7; 周一到周六不变)
    let todayDay = now.getDay();
    if (todayDay === 0) todayDay = 7;

    let year = wx.getStorageSync('current_year');
    let term = wx.getStorageSync('current_term');

    if (!year || !term) {
      year = '2025';
      term = '3';
    }

    const cacheKey = `schedule_${account.studentId}_${year}_${term}`;

    // 3. 读取本地缓存
    const scheduleList = wx.getStorageSync(cacheKey) || [];

    // 4. 筛选出“今天的课”
    const todayCourses = scheduleList.filter(item => item.day === todayDay);

    // 如果今天没课
    if (todayCourses.length === 0) {
      this.setData({ 'nextClass.hasCourse': false });
      return;
    }

    // 5. 定义时间映射表 (转换成绝对分钟数)
    const timeMap = {
      1: { start: 480, end: 570 },   // 1-2节: 08:00 - 09:30
      3: { start: 585, end: 675 },   // 3-4节: 09:45 - 11:15
      5: { start: 680, end: 725 },   // 5节:   11:20 - 12:05
      6: { start: 840, end: 930 },   // 6-7节: 14:00 - 15:30
      8: { start: 935, end: 980 },   // 8节:   15:35 - 16:20
      9: { start: 995, end: 1085 },  // 9-10节: 16:35 - 18:05
      11: { start: 1140, end: 1230 },// 11-12节: 19:00 - 20:30
      13: { start: 1235, end: 1280 } // 13节: 20:35 - 21:20
    };

    // 6. 寻找“下一节”或“正在上”的课
    // 逻辑：找到第一节“结束时间”晚于“当前时间”的课
    // 我们先把课程按节次排序
    todayCourses.sort((a, b) => a.startSection - b.startSection);

    let targetCourse = null;
    let status = '即将开始';

    for (let course of todayCourses) {
      const sectionConfig = timeMap[course.startSection];

      // 如果这节课的时间配置找不到（比如非标准课），跳过
      if (!sectionConfig) continue;

      // 计算这门课的实际结束时间 (考虑连堂)
      // 简单算法：用起始节次的开始时间，和 结束节次的结束时间（这里简化处理，只看开始时间是否在未来，或者当前时间是否在课内）

      // 情况A：还没下课 (当前时间 < 结束时间)
      // 注意：这里我们粗略用这节大课的“开始节次对应的结束时间”做判断，
      // 如果是3-5节连上，startSection是3。
      // 为了更精准，你可以根据 course.sectionCount 算结束时间，但 MVP 版本我们只要找到“还没结束的课”

      const endTime = sectionConfig.end + (course.sectionCount - 1) * 45;

      if (currentTimeVal < endTime) {
        targetCourse = course;

        if (currentTimeVal >= sectionConfig.start) {
          status = '进行中';
        } else {
          status = '即将开始';
        }
        break;
      }
    }

    if (targetCourse) {
      this.setData({
        nextClass: {
          hasCourse: true,
          status: status,
          courseName: targetCourse.name,
          time: targetCourse.timeRange,
          location: targetCourse.room || '地点未知',
          teacher: targetCourse.teacher || '老师未知'
        }
      });
    } else {
      // 今天的课都上完了
      this.setData({ 'nextClass.hasCourse': false });
    }
  },

  // 统一的页面跳转处理函数
  handleNavigate(e) {
    const target = e.currentTarget.dataset.target;
    wx.navigateTo({ url: `/pages/${target}/${target}` });
  }
})