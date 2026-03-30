const db = wx.cloud.database();

Page({
  data: {
    myList: []
  },

  onShow() {
    this.getMyGoods();
  },

  getMyGoods() {
    wx.showLoading({ title: '加载中' });
    wx.cloud.callFunction({
      name: 'login', 
    }).then(res => {
      const myOpenid = res.result.openid;
      const db = wx.cloud.database();
      db.collection('market_goods')
        .where({
          _openid: myOpenid
        })
        .orderBy('create_time', 'desc')
        .get()
        .then(dbRes => {
          wx.hideLoading();
          if (dbRes.data.length === 0) {
          }
          this.setData({ myList: dbRes.data });
        });
        
    }).catch(err => {
      wx.hideLoading();
      console.error('获取OpenID失败', err);
    });
  },

  onUpdateStatus(e) {
    const { id, index, status } = e.currentTarget.dataset;
    const isOnSale = status === 1; 
    if (isOnSale) {
      wx.showModal({
        title: '下架确认',
        content: '下架后商品将不在市场显示，确定吗？',
        confirmColor: '#ff4d4f', // 确认按钮搞成红色，起警示作用
        success: (res) => {
          if (res.confirm) {
            this._doUpdateStatus(id, index, 2); // 2 代表下架
          }
        }
      });
    } else {
      // 如果是上架，直接执行（或者是简单的提示）
      wx.showToast({ title: '上架中...', icon: 'loading' });
      this._doUpdateStatus(id, index, 1); // 1 代表上架
    }
  },

  _doUpdateStatus(id, index, newStatus) {
    const db = wx.cloud.database();
    
    db.collection('market_goods').doc(id).update({
      data: {
        status: newStatus
      }
    }).then(() => {
      const key = `myList[${index}].status`;
      this.setData({
        [key]: newStatus
      });
      
      wx.showToast({ 
        title: newStatus === 1 ? '已上架' : '已下架', 
        icon: 'success' 
      });
    }).catch(err => {
      console.error(err);
      wx.showToast({ title: '操作失败', icon: 'none' });
    });
  },

  // 删除功能
  onDelete(e) {
    const id = e.currentTarget.dataset.id;
    const index = e.currentTarget.dataset.index;

    wx.showModal({
      title: '确认删除',
      content: '删除后无法恢复，确定吗？',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中' });
          
          db.collection('market_goods').doc(id).remove()
            .then(() => {
              wx.hideLoading();
              wx.showToast({ title: '已删除' });
              const list = this.data.myList;
              list.splice(index, 1);
              this.setData({ myList: list });
            })
            .catch(err => {
              console.error(err);
              wx.hideLoading();
              wx.showToast({ title: '删除失败', icon: 'none' });
            });
        }
      }
    });
  },

  // 跳转去编辑
  onEdit(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/goods_publish/goods_publish?id=${id}`,
    });
  }
});