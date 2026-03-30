const db = wx.cloud.database();

Page({
  data: {
    myList: []
  },

  onShow() {
    this.getMyList();
  },

  // 获取我发布的启事
  getMyList() {
    wx.showLoading({ title: '加载中' });
    wx.cloud.callFunction({
      name: 'login', // 复用你获取 openid 的云函数
    }).then(res => {
      const myOpenid = res.result.openid;
      
      db.collection('lost_and_found')
        .where({
          _openid: myOpenid
        })
        .orderBy('create_time', 'desc')
        .get()
        .then(dbRes => {
          wx.hideLoading();
          this.setData({ myList: dbRes.data });
        }).catch(err => {
          wx.hideLoading();
          console.error('查询数据库失败', err);
        });
        
    }).catch(err => {
      wx.hideLoading();
      console.error('获取OpenID失败', err);
    });
  },

  // 更新启事状态（标记解决 / 重新寻找）
  onUpdateStatus(e) {
    const { id, index, status } = e.currentTarget.dataset;
    const isActive = status === 1; // 1 表示正在寻找/招领中
    
    if (isActive) {
      wx.showModal({
        title: '确认解决',
        content: '标记解决后，该启事将不再展示在公共大厅中，确定已物归原主了吗？',
        confirmColor: '#07c160', // 绿色，代表圆满解决
        success: (res) => {
          if (res.confirm) {
            this._doUpdateStatus(id, index, 0); // 0 代表已解决
          }
        }
      });
    } else {
      wx.showToast({ title: '恢复中...', icon: 'loading' });
      this._doUpdateStatus(id, index, 1); // 1 代表重新恢复寻找
    }
  },

  // 执行数据库更新
  _doUpdateStatus(id, index, newStatus) {
    db.collection('lost_and_found').doc(id).update({
      data: {
        status: newStatus
      }
    }).then(() => {
      const key = `myList[${index}].status`;
      this.setData({
        [key]: newStatus
      });
      
      wx.showToast({ 
        title: newStatus === 1 ? '已恢复寻找' : '已标记解决', 
        icon: 'success' 
      });
    }).catch(err => {
      console.error(err);
      wx.showToast({ title: '操作失败', icon: 'none' });
    });
  },

  // 删除功能
  onDelete(e) {
    const { id, index } = e.currentTarget.dataset;

    wx.showModal({
      title: '确认删除',
      content: '删除后无法恢复，确定吗？',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中' });
          
          db.collection('lost_and_found').doc(id).remove()
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

  // 跳转去详情
  toDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/lost_found_detail/lost_found_detail?id=${id}`,
    });
  }
});