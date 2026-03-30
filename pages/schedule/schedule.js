import Toast from '@vant/weapp/toast/toast';
const formatCourseTime = (sectionStr) => {
  if (!sectionStr) return '';
  // 比如把 "1-2节" 提取为 start: 1, end: 2
  const match = sectionStr.match(/(\d+)(-(\d+))?/);
  if (!match) return '';
  const start = parseInt(match[1]);
  const end = match[3] ? parseInt(match[3]) : start;

  const timeMap = {
    1: { start: '08:00', end: '08:45' }, // 1-2节: 08:00-09:30
    2: { start: '08:45', end: '09:30' },
    3: { start: '09:45', end: '10:30' }, // 3-4节: 09:45-11:15
    4: { start: '10:30', end: '11:15' },
    5: { start: '11:20', end: '12:05' }, // 5节: 11:20-12:05
    6: { start: '14:00', end: '14:45' }, // 6-7节: 14:00-15:30
    7: { start: '14:45', end: '15:30' },
    8: { start: '15:35', end: '16:20' }, // 8节: 15:35-16:20
    9: { start: '16:35', end: '17:20' }, // 9-10节: 16:35-18:05
    10: { start: '17:20', end: '18:05' },
    11: { start: '19:00', end: '19:45' }, // 11-12节: 19:00-20:30
    12: { start: '19:45', end: '20:30' },
    13: { start: '20:35', end: '21:20' }  // 13节: 20:35-21:20
  };

  // 完美拼接起止时间，比如 3-5节连排就会自动算出 09:45-12:05
  if (timeMap[start] && timeMap[end]) {
    return `${timeMap[start].start} - ${timeMap[end].end}`;
  }
  return '';
};
Page({
  data: {
    loading: true,
    selectedYear: '2025',
    selectedTerm: '3', // 完美继承：3为第1学期，12为第2学期

    yearOptions: [
      { text: '2029-2030学年', value: '2029' },
      { text: '2028-2029学年', value: '2028' },
      { text: '2027-2028学年', value: '2027' },
      { text: '2026-2027学年', value: '2026' },
      { text: '2025-2026学年', value: '2025' },
      { text: '2024-2025学年', value: '2024' },
      { text: '2023-2024学年', value: '2023' },
      { text: '2022-2023学年', value: '2022' }
    ],
    termOptions: [
      { text: '第1学期', value: '3' },
      { text: '第2学期', value: '12' }
    ],
    scheduleList: [],
    isShowDetail: false,
    currentCourse: {}
  },

  showCourseDetail(event) {
    const course = event.currentTarget.dataset.course;
    this.setData({
      currentCourse: course,
      isShowDetail: true
    });
  },

  closeCourseDetail() {
    this.setData({
      isShowDetail: false
    });
  },

  onLoad() {
    this.fetchScheduleSilently();
  },

  onPullDownRefresh() {
    this.fetchScheduleSilently(true);
  },

  onYearChange(event) {
    this.setData({ selectedYear: event.detail });
    this.fetchScheduleSilently();
  },

  onTermChange(event) {
    this.setData({ selectedTerm: event.detail });
    this.fetchScheduleSilently();
  },

  fetchScheduleSilently(isRefresh = false) {
    const account = wx.getStorageSync('jwc_account');

    if (!account) {
      if (isRefresh) wx.stopPullDownRefresh();
      wx.showModal({
        title: '温馨提示',
        content: '查课表需要先绑定教务系统哦',
        confirmText: '去绑定',
        success: (res) => {
          if (res.confirm) wx.navigateTo({ url: '/pages/bind_account/bind_account' });
          else wx.navigateBack(); 
        }
      });
      return;
    }

    const year = this.data.selectedYear;
    const term = this.data.selectedTerm;
    const cacheKey = `schedule_${account.studentId}_${year}_${term}`;

    // 1. 本地硬盘缓存拦截
    if (!isRefresh) {
      const cachedData = wx.getStorageSync(cacheKey);
      if (cachedData && cachedData.length > 0) {
        this.setData({ scheduleList: cachedData, loading: false });
        return; 
      }
      this.setData({ loading: true, scheduleList: [] });
    }

    // 2. 呼叫云函数去教务系统进货
    wx.cloud.callFunction({
      name: 'getSchedule',
      data: {
        studentId: account.studentId,
        password: account.password,
        xnm: year, 
        xqm: term  
      },
      success: res => {
        if (res.result && res.result.success) {
          
          const dayMap = { 1: '一', 2: '二', 3: '三', 4: '四', 5: '五', 6: '六', 7: '日' };

          const colorList = ['#E8F0FE', '#FCE8E6', '#E6F4EA', '#FEF7E0', '#F3E8FD', '#E0F7FA', '#FBE9E7'];
          const fontColorList = ['#1A73E8', '#D93025', '#1E8E3E', '#E37400', '#8E24AA', '#0097A7', '#D84315'];
          let courseColorMap = {}; // 记住每门课的颜色，保证同一门课颜色一样
          let colorIndex = 0;

          const dataList = (res.result.data || []).map(item => {
            const match = item.section.match(/(\d+)(-(\d+))?/);
            const start = match ? parseInt(match[1]) : 1; // 从第几节开始
            const end = match && match[3] ? parseInt(match[3]) : start; // 到第几节结束
            const count = end - start + 1; // 总共跨越几节课的高度

            if (!courseColorMap[item.name]) {
              courseColorMap[item.name] = {
                 bg: colorList[colorIndex % colorList.length],
                 font: fontColorList[colorIndex % fontColorList.length]
              };
              colorIndex++;
            }

            return {
              ...item,
              timeRange: formatCourseTime(item.section),
              dayStr: dayMap[item.day] || item.day,
              startSection: start,
              sectionCount: count,
              colorConfig: courseColorMap[item.name]
            };
          });

          wx.setStorageSync('current_year', year);
          wx.setStorageSync('current_term', term);
          
          if (dataList.length > 0) {
            wx.setStorageSync(cacheKey, dataList);
          }
          
          this.setData({ scheduleList: dataList, loading: false });
          if (isRefresh) Toast.success('课表已同步最新');

        } else {
          if (!isRefresh) this.setData({ loading: false });
          Toast.fail(res.result.msg || '该学期暂无排课');
        }
      },
      fail: err => {
        if (!isRefresh) this.setData({ loading: false });
        Toast.fail('网络开小差了');
      },
      complete: () => {
        if (isRefresh) wx.stopPullDownRefresh();
      }
    });
  }
});