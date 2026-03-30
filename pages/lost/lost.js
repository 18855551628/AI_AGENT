const db = wx.cloud.database();
const _ = db.command;

Page({
  data: {
    user_info: null,
    activeCategory: 0,
    categories: [
      { id: 0, name: "全部" },
      { id: 1, name: "证件卡片" },
      { id: 2, name: "数码电子" },
      { id: 3, name: "钥匙门禁" },
      { id: 4, name: "书籍文具" },
      { id: 5, name: "生活用品" },
      { id: 6, name: "其他" }
    ],
    lfList: [],
    pageIndex: 0,
    pageSize: 10,
    isEnd: false,
    searchKeyword: '',
  },

  onLoad: function (options) {
    const userInfo = wx.getStorageSync('user_info');
    if (userInfo) {
      this.setData({ user_info: userInfo });
    }
    this.getList(true);
  },

  onSearchInput: function(e) {
    this.setData({ searchKeyword: e.detail.value });
  },

  // 获取失物招领列表
  getList: function (isRefresh = false) {
    if (isRefresh) {
      this.setData({ pageIndex: 0, isEnd: false, lfList: [] });
    }

    if (this.data.isEnd) return;
    wx.showLoading({ title: '加载中...' });

    // 只查询状态为 1 (寻找中) 的记录
    let query = { status: 1 };
    
    // 分类筛选
    if (this.data.activeCategory !== 0) {
      query.category_id = this.data.activeCategory;
    }

    db.collection('lost_and_found')
      .where(query)
      .orderBy('create_time', 'desc')
      .skip(this.data.pageIndex * this.data.pageSize)
      .limit(this.data.pageSize)
      .get()
      .then(res => {
        wx.hideLoading();
        const list = res.data;
        if (list.length < this.data.pageSize) {
          this.setData({ isEnd: true });
        }
        this.setData({
          lfList: this.data.lfList.concat(list),
          pageIndex: this.data.pageIndex + 1
        });
      })
      .catch(err => {
        wx.hideLoading();
        console.error('加载失败', err);
        wx.showToast({ title: '加载失败', icon: 'none' });
      });
  },

  onCategoryTap: function(e) {
    const id = e.currentTarget.dataset.id;
    if (id === this.data.activeCategory) return;
    this.setData({ activeCategory: id });
    this.getList(true); 
  },

  // 搜索逻辑复用你之前的，只是改了集合名称
  onSearch: function() {
    const key = this.data.searchKeyword; 
    if (!key) {
      wx.showToast({ title: '请输入关键词', icon: 'none' });
      return;
    }

    this.setData({ lfList: [], pageIndex: 0, isEnd: true }); 
    wx.showLoading({ title: '搜索中' });
    
    db.collection('lost_and_found').where({
      status: 1, 
      title: db.RegExp({
        regexp: key,
        options: 'i',
      })
    }).get().then(res => {
      wx.hideLoading();
      this.setData({ lfList: res.data });
    });
  },

  toDetail: function(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/lf_detail/lf_detail?id=${id}`,
    });
  },

  toMyPosts() {
    wx.navigateTo({ url: '/pages/my_lfs/my_lfs' });
  },

  onPublish: function() {
    if (!this.data.user_info) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/lf_publish/lf_publish' });
  },

  onReachBottom: function () { this.getList(false); },
  onPullDownRefresh: function () {
    this.getList(true);
    wx.stopPullDownRefresh(); 
  }
});