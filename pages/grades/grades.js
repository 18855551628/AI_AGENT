import Toast from '@vant/weapp/toast/toast';

Page({
  data: {
    loading: true,
    term: '',
    avgGpa: '0.00',
    totalCredit: '0.0',
    grades: [],
    selectedYear: '2025', 
    selectedTerm: '3',
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
      { text: '第2学期', value: '12' },
    ],
    isShowDetail: false,
    currentCourse: {},
    detailLoading:false,
    detailsCache: {}
  },

  showDetail(event) {
    const courseInfo = event.currentTarget.dataset.course;
    if (!courseInfo.jxb_id) {
      Toast('该课程无分项明细'); 
      return; 
    }

    const detailCacheKey = `detail_${courseInfo.jxb_id}`; 
    const cachedDetails = wx.getStorageSync(detailCacheKey);
    
    if (cachedDetails && cachedDetails.length > 0) {
      this.setData({
        currentCourse: { ...courseInfo, details: cachedDetails },
        isShowDetail: true,
        detailLoading: false
      });
      return; 
    }

    this.setData({
      currentCourse: { ...courseInfo, details: [] }, 
      isShowDetail: true,
      detailLoading: true 
    });

    const account = wx.getStorageSync('jwc_account');
    wx.cloud.callFunction({
      name: 'getGradeDetail',
      data: {
        studentId: account.studentId,
        password: account.password,
        jxb_id: courseInfo.jxb_id,
        xnm: this.data.selectedYear,
        xqm: this.data.selectedTerm,
        courseName: courseInfo.courseName
      },
      success: res => {
        if (res.result && res.result.success) {
          const resultData = res.result.data; 
          
          if (resultData && resultData.length > 0) {
            wx.setStorageSync(detailCacheKey, resultData); 
          }
          
          this.setData({
            'currentCourse.details': resultData,
            detailLoading: false
          });
          
        } else {
          this.setData({ detailLoading: false });
          Toast.fail('获取明细失败');
        }
      },
      fail: err => {
        this.setData({ detailLoading: false });
        Toast.fail('网络异常');
      }
    });
  },

  closeDetail() {
    this.setData({
      isShowDetail: false
    });
  },

  onLoad() {
    this.fetchGradesSilently();
  },
  onPullDownRefresh() {
    this.fetchGradesSilently(true);
  },

  onYearChange(event) {
    this.setData({ selectedYear: event.detail });
    this.fetchGradesSilently(); // 切换后重新抓取数据
  },
  onTermChange(event) {
    this.setData({ selectedTerm: event.detail });
    this.fetchGradesSilently(); // 切换后重新抓取数据
  },

  fetchGradesSilently(isRefresh = false) {
    const account = wx.getStorageSync('jwc_account');

    if (!account) {
      if (isRefresh) wx.stopPullDownRefresh(); 
      wx.showModal({
        title: '温馨提示',
        content: '查成绩需要先绑定教务系统哦',
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

    const cacheKey = `grades_${account.studentId}_${year}_${term}`;

    // 如果不是强制刷新，先试图从本地硬盘拿数据
    if (!isRefresh) {
      const cachedData = wx.getStorageSync(cacheKey);
      if (cachedData) {
        // 硬盘里有数据直接秒开渲染，拦截后续的所有网络请求！
        this.processGradesData(cachedData.rawList, cachedData.termStr);
        return; 
      }
      
      this.setData({ loading: true, grades: [], avgGpa: '0.00', totalCredit: '0.0' });
    }

    wx.cloud.callFunction({
      name: 'getGrades',
      data: {
        studentId: account.studentId,
        password: account.password,
        xnm: year, 
        xqm: term  
      },
      success: res => {
        if (res.result && res.result.success) {

          wx.setStorageSync(cacheKey, {
            rawList: res.result.data,
            termStr: res.result.term
          });

          this.processGradesData(res.result.data, res.result.term);
          
          // 如果是下拉刷新进来的，给个友好的更新提示
          if (isRefresh) Toast.success('成绩已同步最新');

        } else {
          if (!isRefresh) this.setData({ loading: false });
          Toast.fail(res.result.msg || '该学期暂无成绩');
        }
      },
      fail: err => {
        if (!isRefresh) this.setData({ loading: false });
        Toast.fail('网络开小差了');
        console.error(err);
      },
      complete: () => {
        if (isRefresh) {
          wx.stopPullDownRefresh();
        }
      }
    });
  },


  processGradesData(rawList, termStr) {
    let totalCredit = 0;
    let totalGpaPoints = 0;

    const processedList = rawList.map(item => {
      const credit = parseFloat(item.credit) || 0;
      const gpa = parseFloat(item.gpa) || 0;
      
      if (gpa > 0 || (gpa === 0 && item.score === '不及格')) {
        totalCredit += credit;
        totalGpaPoints += (credit * gpa);
      }

      let colorClass = 'score-normal';
      let numScore = parseFloat(item.score);
      
      if (!isNaN(numScore)) {
        if (numScore >= 90) colorClass = 'score-excellent';
        else if (numScore < 60) colorClass = 'score-fail';
      } else {
        if (item.score.includes('优') || item.score.includes('良')) {
          colorClass = 'score-excellent';
        } else if (item.score.includes('不及格')) {
          colorClass = 'score-fail';
        }
      }

      return { ...item, colorClass };
    });

    const finalAvgGpa = totalCredit > 0 ? (totalGpaPoints / totalCredit).toFixed(2) : '0.00';

    let humanReadableTerm = this.data.selectedTerm === '12' ? '第2学期' : '第1学期';
    let beautifulTitle = `${this.data.selectedYear}学年 ${humanReadableTerm}`;

    this.setData({
      loading: false,
      term: beautifulTitle, 
      grades: processedList,
      totalCredit: totalCredit.toFixed(1),
      avgGpa: finalAvgGpa
    });
  }
});