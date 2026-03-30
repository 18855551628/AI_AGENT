Page({
  data: {
    loading: false,
    examList: [], 
    selectedTerm: '', 
    termOptions: [], 
  },

  onLoad() {
    const account = wx.getStorageSync('jwc_account');
    if (!account) {
      wx.showModal({
        title: '温馨提示',
        content: '查考场需要先绑定教务系统哦',
        confirmText: '去绑定',
        success: (res) => {
          if (res.confirm) wx.navigateTo({ url: '/pages/bind_account/bind_account' });
          else wx.navigateBack(); 
        }
      });
      return;
    }
    this.initDropdownOptions();
  },

  initDropdownOptions() {
    // 这里的学期可以根据你们学校的实际情况自动生成或写死
    const terms = [
      { text: '请选择学期', value: '' },
      { text: '2027-2028-2', value: '2027-2028-2' },
      { text: '2027-2028-1', value: '2027-2028-1' },
      { text: '2026-2027-2', value: '2026-2027-2' },
      { text: '2026-2027-1', value: '2026-2027-1' },
      { text: '2025-2026-2', value: '2025-2026-2' },
      { text: '2025-2026-1', value: '2025-2026-1' },
      { text: '2024-2025-2', value: '2024-2025-2' },
      { text: '2024-2025-1', value: '2024-2025-1' },
      {text: '2023-2024-2', value: '2023-2024-2' },
      {text: '2023-2024-1', value: '2023-2024-1' },
      {text: '2022-2023-2', value: '2022-2023-2' },
      {text: '2022-2023-1', value: '2022-2023-1' },
    ];
    this.setData({ termOptions: terms });
  },

  onFilterChange(event) {
    const value = event.detail;
    this.setData({ selectedTerm: value });
    
    if (!value) {
      this.setData({ examList: [] });
      return; 
    }
    this.fetchExams();
  },

  fetchExams() {
    const account = wx.getStorageSync('jwc_account');
    if (!account) {
      wx.showToast({ title: '账号信息丢失，请重新绑定', icon: 'none' });
      return;
    }
    
    this.setData({ loading: true, examList: [] });
    
    // 解析学年学期，比如把 "2025-2026-2" 拆开
    const termStr = this.data.selectedTerm; 
    const parts = termStr.split('-'); 
    const xnm = parts[0];       // 年份，例如 "2025"
    const termIndex = parts[2]; // 学期，例如 "1" 或 "2"

    // 教务系统通常有自己的学期编码规则（如 1代表秋季，2代表春季，或者 3, 12 等）
    // 你需要根据你们学校爬虫的实际入参进行转换，这里先做个简单的映射示例：
    let xqm = '3'; 
    if (termIndex === '1') xqm = '3';
    if (termIndex === '2') xqm = '12';

    // 🌟 这里要替换成你的查考场云函数名称
    wx.cloud.callFunction({
      name: 'getExamInfo', 
      data: {
        studentId: account.studentId,
        password: account.password,
        xnm: xnm, 
        xqm: xqm
      },
      success: res => {
        console.log('考场查询返回：', res.result); 

        if (res.result && res.result.success) {
          // 这里假设后端返回的数组里的字段为：courseName, examTime, location, seatNum, status
          this.setData({ 
            examList: res.result.data || [], 
            loading: false 
          });
        } else {
          this.setData({ loading: false });
          wx.showToast({ title: res.result.msg || '查询失败，可能是教务系统暂无数据', icon: 'none' });
        }
      },
      fail: err => {
        this.setData({ loading: false });
        wx.showToast({ title: '网络异常', icon: 'none' });
      }
    });
  }
});