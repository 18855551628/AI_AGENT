const db = wx.cloud.database();

Page({
  data: {
    lf: null, 
    isLoading: true
  },

  onLoad: function (options) {
    const id = options.id; 
    if(id) {
      this.getDetail(id);
      this.updateViewCount(id); 
    }
  },

  // 获取详情
  getDetail(id) {
    wx.showLoading({ title: '加载中' });
    
    db.collection('lost_and_found').doc(id).get().then(res => {
      wx.hideLoading();
      const lfData = res.data;
      
      // 如果状态不是 1 (例如已被标记为已找回/已解决)
      if (lfData.status !== 1) {
        wx.showModal({
          title: '提示',
          content: '该启事已结束（物品已找回或归还）',
          showCancel: false, 
          confirmText: '返回列表', 
          confirmColor: '#ffd000', 
          success: (modalRes) => {
            if (modalRes.confirm) {
              this.refreshPrevPage();
              wx.navigateBack();
            }
          }
        });
        return; 
      }

      this.setData({
        lf: lfData,
        isLoading: false
      });
      
    }).catch(err => {
      wx.hideLoading();
      wx.showToast({ title: '启事不存在或已删除', icon: 'none' });
      this.refreshPrevPage();
      setTimeout(() => wx.navigateBack(), 1500);
    });
  },

  // 增加浏览量并同步到上一页
  updateViewCount(id) {
    db.collection('lost_and_found').doc(id).update({
      data: {
        view_count: db.command.inc(1)
      }
    });

    const pages = getCurrentPages();
    const prevPage = pages[pages.length - 2]; 
    if (prevPage && prevPage.data.lfList) {
      const list = prevPage.data.lfList;
      const index = list.findIndex(item => item._id === id);

      if (index !== -1) {
        const key = `lfList[${index}].view_count`;
        const currentCount = list[index].view_count || 0;
        prevPage.setData({
          [key]: currentCount + 1
        });
      }
    }
  },

  // 刷新上一页数据提取为公共方法
  refreshPrevPage() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      const prevPage = pages[pages.length - 2]; 
      if (prevPage && prevPage.getList) {
        prevPage.getList(true); 
      }
    }
  },

  // 预览大图
  onPreviewImage(e) {
    const current = e.currentTarget.dataset.url;
    wx.previewImage({
      current: current,
      urls: this.data.lf.imgs
    });
  },

  onContact() {
    wx.showModal({
      title: '联系发布者',
      content: '请仔细查看【详细描述】中发布者留下的联系方式（如微信/手机号/宿舍号）。\n\n是否需要一键复制详细描述的内容？',
      confirmText: '复制内容',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          wx.setClipboardData({
            data: this.data.lf.content,
            success: () => {
              wx.showToast({ title: '内容已复制', icon: 'success' });
            }
          });
        }
      }
    });
  },

  // 分享功能
  onShareAppMessage() {
    const typeStr = this.data.lf.type === 0 ? '招领' : '寻物';
    const defaultImg = '/images/default_lf.png'; 
    
    return {
      title: `【${typeStr}】${this.data.lf.title}`,
      path: `/pages/lost_found_detail/lost_found_detail?id=${this.data.lf._id}`,
      imageUrl: (this.data.lf.imgs && this.data.lf.imgs.length > 0) ? this.data.lf.imgs[0] : defaultImg
    }
  }
});