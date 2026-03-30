const db = wx.cloud.database();

Page({
  data: {
    goods: null, // 存放商品详情
    isLoading: true
  },

  onLoad: function (options) {
    const id = options.id; // 从页面参数获取商品ID
    if(id) {
      this.getDetail(id);
      this.updateViewCount(id); // 增加浏览量（可选功能）
    }
  },

  // 获取详情
  getDetail(id) {
    const db = wx.cloud.database();
    
    wx.showLoading({ title: '加载中' });
    
    db.collection('market_goods').doc(id).get().then(res => {
      wx.hideLoading();
      const goods = res.data;
      const app = getApp(); 
      if (goods.status !== 1) {
        wx.showModal({
          title: '提示',
          content: '来晚了一步，该宝贝已下架或被删除',
          showCancel: false, 
          confirmText: '返回市场', 
          confirmColor: '#ffd000', 
          success: (modalRes) => {
            if (modalRes.confirm) {
              const pages = getCurrentPages();
      if (pages.length > 1) {
        const prevPage = pages[pages.length - 2]; 
        if (prevPage && prevPage.getGoodsList) {
          prevPage.getGoodsList(true);
        }
      }
              wx.navigateBack();
            }
          }
        });
        return; 
      }
      this.setData({
        goods: goods,
        isLoading: false
      });
      
    }).catch(err => {
      wx.hideLoading();
      wx.showToast({ title: '商品不存在或已删除', icon: 'none' });
      
      // 执行刷新上一页逻辑
      const pages = getCurrentPages();
      if (pages.length > 1) {
        const prevPage = pages[pages.length - 2]; 
        if (prevPage && prevPage.getGoodsList) {
          prevPage.getGoodsList(true);
        }
      }
      setTimeout(() => wx.navigateBack(), 1500);
    });
  },

  // 增加浏览量 (静默操作)
  updateViewCount(id) {
    db.collection('market_goods').doc(id).update({
      data: {
        view_count: db.command.inc(1)
      }
    });
    const pages = getCurrentPages();
    const prevPage = pages[pages.length - 2]; 
    if (prevPage && prevPage.data.goodsList) {
      const list = prevPage.data.goodsList;

      const index = list.findIndex(item => item._id === id);

      if (index !== -1) {
        const key = `goodsList[${index}].view_count`;
        const currentCount = list[index].view_count || 0;
        prevPage.setData({
          [key]: currentCount + 1
        });
      }
    }
  },

  // 预览大图
  onPreviewImage(e) {
    const current = e.currentTarget.dataset.url;
    wx.previewImage({
      current: current,
      urls: this.data.goods.imgs
    });
  },

  // --- 核心功能：获取联系方式 ---
  onContactSeller() {
    const contact = this.data.goods.contact_info || '卖家未留联系方式';
    
    wx.showModal({
      title: '联系卖家',
      content: `联系方式：${contact}\n\n(建议复制后去微信添加，交易时请注意财产安全)`,
      confirmText: '复制',
      cancelText: '知道了',
      success: (res) => {
        if (res.confirm) {
          // 用户点击复制
          wx.setClipboardData({
            data: contact,
            success: () => {
              wx.showToast({ title: '已复制', icon: 'success' });
            }
          });
        }
      }
    });
  },

  // 分享功能
  onShareAppMessage() {
    return {
      title: `【闲置】${this.data.goods.title} 只要¥${this.data.goods.price}`,
      path: `/pages/market_detail/market_detail?id=${this.data.goods._id}`,
      imageUrl: this.data.goods.imgs[0]
    }
  }
});