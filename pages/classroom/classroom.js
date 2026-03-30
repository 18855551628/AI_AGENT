Page({
  data: {
    loading: false,
    roomList: [],
    selectedWeek: '1',
    selectedDay: '1',
    selectedTerm: '',
    sectionTitle: '第1-2节',     
    selectedSectionStr: '3',  
    sectionList: [],           
    weekOptions: [],
    dayOptions: [],
    termOptions: [], // 🌟 新增学期选项数组
  },

  onLoad() {
    const account = wx.getStorageSync('jwc_account');
    if (!account) {
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
    this.initDropdownOptions();
    let today = new Date().getDay();
    if (today === 0) today = 7; 
    this.setData({ selectedDay: today.toString() });
  },

  initDropdownOptions() {
    const terms = [
      { text: '请选择学期', value: '' },
      { text: '2027-2028-2', value: '2027-2028-2' },
      { text: '2027-2028-1', value: '2027-2028-1' },
      { text: '2026-2027-3', value: '2026-2027-3' },
      { text: '2026-2027-2', value: '2026-2027-2' },
      { text: '2026-2027-1', value: '2026-2027-1' },
      { text: '2025-2026-3', value: '2025-2026-3' },
      { text: '2025-2026-2', value: '2025-2026-2' },
      { text: '2025-2026-1', value: '2025-2026-1' }
    ];
    const weeks = [];
    for (let i = 1; i <= 20; i++) weeks.push({ text: `第${i}周`, value: i.toString() });
    
    const days = [
      { text: '星期一', value: '1' }, { text: '星期二', value: '2' },
      { text: '星期三', value: '3' }, { text: '星期四', value: '4' },
      { text: '星期五', value: '5' }, { text: '星期六', value: '6' },
      { text: '星期日', value: '7' }
    ];

    const sections = [];
    for (let i = 1; i <= 13; i++) {
      sections.push({ id: i, selected: (i === 1 || i === 2) });
    }

    this.setData({termOptions: terms,weekOptions: weeks, dayOptions: days, sectionList: sections });
  },

  onFilterChange(event) {
    const type = event.currentTarget.dataset.type;
    const value = event.detail;
    if (type === 'term') this.setData({ selectedTerm: value });
    if (type === 'week') this.setData({ selectedWeek: value });
    if (type === 'day') this.setData({ selectedDay: value });
    if (!this.data.selectedTerm) {
      this.setData({ roomList: [] });
      return; 
    }
    this.fetchClassrooms();
  },

  toggleSection(event) {
    const index = event.currentTarget.dataset.index;
    const list = this.data.sectionList;
    list[index].selected = !list[index].selected;
    this.setData({ sectionList: list });
  },

  clearSections() {
    const list = this.data.sectionList.map(item => ({...item, selected: false}));
    this.setData({ sectionList: list });
  },

  confirmSections() {
    const selectedIds = this.data.sectionList.filter(item => item.selected).map(item => item.id);
    if (!this.data.selectedTerm) {
      wx.showToast({ title: '请先在顶部选择学期', icon: 'none' });
      this.selectComponent('#sectionDrop').toggle(); // 收起面板
      return;
    }
    if (selectedIds.length === 0) {
      wx.showToast({ title: '请至少选择一节课哦', icon: 'none' });
      return;
    }

    // 计算传给后台的数字 (1,2,12,13 -> 6147)
    let jcdNumber = 0;
    selectedIds.forEach(id => {
      jcdNumber += Math.pow(2, id - 1);
    });

    // 计算显示在菜单上的文字 (比如：已选4节)
    this.setData({
      selectedSectionStr: jcdNumber.toString(), // 把算好的 6147 存起来
      sectionTitle: `已选 ${selectedIds.length} 节` // 显示在界面的字
    });

    this.selectComponent('#sectionDrop').toggle();
    this.fetchClassrooms();
  },

  fetchClassrooms() {
    const account = wx.getStorageSync('jwc_account');
    if (!account) {
      wx.showToast({ title: '账号信息丢失，请重新绑定', icon: 'none' });
      return;
    }
    this.setData({ loading: true, roomList: [] });
    const termStr = this.data.selectedTerm; 
    const parts = termStr.split('-'); 
    const xnm = parts[0];       // 拿到前四个字 "2025"
    const termIndex = parts[2]; // 拿到最后一个字 "2"

    let xqm = '3'; 
    if (termIndex === '1') xqm = '3';
    if (termIndex === '2') xqm = '12';

    // 计算周次的二进制掩码 (第6周 -> 32)
    const zcdNumber = Math.pow(2, parseInt(this.data.selectedWeek) - 1);

    wx.cloud.callFunction({
      name: 'getClassroom',
      data: {
        studentId: account.studentId,
        password: account.password,
        xnm: xnm, 
        xqm: xqm,
        xqj: this.data.selectedDay,
        zcd: zcdNumber.toString(), // 发送算好的 32
        jcd: this.data.selectedSectionStr // 发送算好的 6147
      },
      success: res => {
        console.log('云函数返回：', res.result); 

        if (res.result && res.result.success) {
          this.setData({ 
            roomList: res.result.data || [], 
            loading: false 
          });
          console.log('页面数据已赋值，当前教室数量：', this.data.roomList.length); 
        } else {
          this.setData({ loading: false });
          wx.showToast({ title: res.result.msg || '查询失败', icon: 'none' });
        }
      },
      fail: err => {
        this.setData({ loading: false });
        wx.showToast({ title: '网络异常', icon: 'none' });
      }
    });
  }
});