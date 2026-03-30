const db = wx.cloud.database();
const _ = db.command;

Page({
  data: {
    user_info: null, // 存储你的本地用户信息
    activeCategory: 0,
    categories: [
      { id: 0, name: "全部" },
      { id: 1, name: "书籍教材" },
      { id: 2, name: "数码电子" },
      { id: 3, name: "生活用品" },
      { id: 4, name: "美妆护肤" },
      { id: 5, name: "虚拟产品" }
    ],
    goodsList: [], // 页面渲染列表
    pageIndex: 0,  // 分页页码
    pageSize: 10,  // 每页数量
    isEnd: false ,  // 是否已加载完所有数据
    searchKeyword: '',
  },

  onLoad: function (options) {
    // 1. 获取本地存储的用户信息
    const userInfo = wx.getStorageSync('user_info');
    if (userInfo) {
      this.setData({ user_info: userInfo });
    }

    // 2. 初始化加载数据
    this.getGoodsList(true);
  },

  onSearchInput: function(e) {
    this.setData({
      searchKeyword: e.detail.value
    });
  },

// 获取商品列表
getGoodsList: function (isRefresh = false) {
  if (isRefresh) {
    this.setData({ pageIndex: 0, isEnd: false, goodsList: [] });
  }

  if (this.data.isEnd) return;

  wx.showLoading({ title: '加载中...' });

  // --- 修改开始 ---
  // 构建查询条件
  let query = {
    status: 1 // 【新增】只查询状态为 1 (在售) 的商品
  };
  
  // 如果选了具体分类，再追加分类条件
  if (this.data.activeCategory !== 0) {
    query.category_id = this.data.activeCategory;
  }
  // --- 修改结束 ---

  db.collection('market_goods')
    .where(query)
    .orderBy('create_time', 'desc')
    .skip(this.data.pageIndex * this.data.pageSize)
    .limit(this.data.pageSize)
    .get()
    .then(res => {
      // ... 后面的逻辑保持不变
      wx.hideLoading();
      const list = res.data;
      if (list.length < this.data.pageSize) {
        this.setData({ isEnd: true });
      }
      this.setData({
        goodsList: this.data.goodsList.concat(list),
        pageIndex: this.data.pageIndex + 1
      });
    })
    .catch(err => {
      // ... 保持不变
      wx.hideLoading();
      console.error('加载失败', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
    });
},

  onCategoryTap: function(e) {
    const id = e.currentTarget.dataset.id;
    if (id === this.data.activeCategory) return;

    this.setData({ activeCategory: id });
    this.getGoodsList(true); // 重新加载
  },

  onSearch: function() {
    const key = this.data.searchKeyword; 
    
    if (!key) {
      wx.showToast({ title: '请输入关键词', icon: 'none' });
      return;
    }


    this.setData({ goodsList: [], pageIndex: 0, isEnd: true }); 
    
    wx.showLoading({ title: '搜索中' });
    
    db.collection('market_goods').where({
      status: 1, 
      title: db.RegExp({
        regexp: key,
        options: 'i',
      })
    }).get().then(res => {
      wx.hideLoading();
      this.setData({ goodsList: res.data });
    });
  },

  toDetail: function(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/market_detail/market_detail?id=${id}`,
    });
  },

  toMyGoods() {
    wx.navigateTo({
      url: '/pages/my_goods/my_goods',
    });
  },

  onPublish: function() {
    if (!this.data.user_info) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      // 这里可以跳转到你的登录页
      return;
    }
    wx.navigateTo({
      url: '/pages/goods_publish/goods_publish',
    });
  },

  onReachBottom: function () {
    this.getGoodsList(false);
  },

  onPullDownRefresh: function () {
    this.getGoodsList(true);
    wx.stopPullDownRefresh(); 
  }

});