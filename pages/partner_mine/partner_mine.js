const db = wx.cloud.database();

Page({
  data: {
    currentTab: 'published', // 'published', 'applied', 'received'
    publishedList: [],
    appliedList: [],
    receivedList: [], // 新增：向我申请的列表
    pubPage: 1,
    pubHasMore: true,
    appPage: 1,
    appHasMore: true,
    recPage: 1,
    recHasMore: true,
    pageSize: 15,
    isLoading: false
  },

  onLoad(options) {
    if (options.tab) {
      this.setData({ currentTab: options.tab });
    }
    this.fetchData();
  },

  onShow() {
    // 移除自动刷新，防止返回页面时重复加载耗费云调用额度
  },

  onReachBottom() {
    if (this.data.currentTab === 'published') {
      this.fetchPublished(true);
    } else if (this.data.currentTab === 'applied') {
      this.fetchApplied(true);
    } else {
      this.fetchReceived(true);
    }
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (this.data.currentTab === tab) return;
    this.setData({ currentTab: tab });

    // 切换 tab 时，如果该 tab 还没有数据则加载，有的话可以不用重新加载，或者看你需求
    // 这里我们简单处理，每次切换就重新加载第一页
    if (tab === 'published') {
      this.setData({ pubPage: 1, pubHasMore: true, publishedList: [] });
      this.fetchPublished();
    } else if (tab === 'applied') {
      this.setData({ appPage: 1, appHasMore: true, appliedList: [] });
      this.fetchApplied();
    } else {
      this.setData({ recPage: 1, recHasMore: true, receivedList: [] });
      this.fetchReceived();
    }
  },

  fetchData() {
    if (this.data.currentTab === 'published') {
      this.setData({ pubPage: 1, pubHasMore: true, publishedList: [] });
      this.fetchPublished();
    } else if (this.data.currentTab === 'applied') {
      this.setData({ appPage: 1, appHasMore: true, appliedList: [] });
      this.fetchApplied();
    } else {
      this.setData({ recPage: 1, recHasMore: true, receivedList: [] });
      this.fetchReceived();
    }
  },

  fetchPublished(isLoadMore = false) {
    if (this.data.isLoading) return;
    if (isLoadMore && !this.data.pubHasMore) return;
    this.setData({ isLoading: true });

    // 获取当前用户的 openid，如果之前没缓存过就调一次云函数
    let myOpenid = wx.getStorageSync('my_openid');

    if (myOpenid) {
      this.doFetchPublished(myOpenid);
    } else {
      wx.cloud.callFunction({
        name: 'login',
      }).then(res => {
        myOpenid = res.result.openid;
        wx.setStorageSync('my_openid', myOpenid);
        this.doFetchPublished(myOpenid);
      }).catch(err => {
        wx.showToast({ title: '获取用户信息失败', icon: 'none' });
        console.error('调用 login 云函数失败', err);
      });
    }
  },

  doFetchPublished(openid) {
    const { pubPage, pageSize, publishedList } = this.data;

    db.collection('partners').where({
      _openid: openid // 使用真实的 openid
    }).orderBy('createTime', 'desc')
      .skip((pubPage - 1) * pageSize)
      .limit(pageSize)
      .get({
        success: res => {
          const list = res.data.map(item => {
            return {
              ...item,
              time: this.formatTime(item.createTime)
            };
          });
          const hasMore = res.data.length === pageSize;
          this.setData({
            publishedList: pubPage === 1 ? list : publishedList.concat(list),
            pubPage: pubPage + 1,
            pubHasMore: hasMore,
            isLoading: false
          });
        },
        fail: err => {
          this.setData({ isLoading: false });
          console.error(err);
        }
      });
  },

  fetchApplied(isLoadMore = false) {
    if (this.data.isLoading) return;
    if (isLoadMore && !this.data.appHasMore) return;
    this.setData({ isLoading: true });

    let myOpenid = wx.getStorageSync('my_openid');
    if (myOpenid) {
      this.doFetchApplied(myOpenid);
    } else {
      wx.cloud.callFunction({
        name: 'login',
      }).then(res => {
        myOpenid = res.result.openid;
        wx.setStorageSync('my_openid', myOpenid);
        this.doFetchApplied(myOpenid);
      }).catch(err => {
        wx.showToast({ title: '获取用户信息失败', icon: 'none' });
        console.error('调用 login 云函数失败', err);
      });
    }
  },

  doFetchApplied(openid) {
    const { appPage, pageSize, appliedList } = this.data;

    db.collection('partner_applies').where({
      _openid: openid
    }).orderBy('createTime', 'desc')
      .skip((appPage - 1) * pageSize)
      .limit(pageSize)
      .get({
        success: res => {
          const hasMore = res.data.length === pageSize;
          this.setData({
            appliedList: appPage === 1 ? res.data : appliedList.concat(res.data),
            appPage: appPage + 1,
            appHasMore: hasMore,
            isLoading: false
          });
        },
        fail: err => {
          this.setData({ isLoading: false });
          console.error(err);
        }
      });
  },

  fetchReceived(isLoadMore = false) {
    if (this.data.isLoading) return;
    if (isLoadMore && !this.data.recHasMore) return;
    this.setData({ isLoading: true });

    let myOpenid = wx.getStorageSync('my_openid');
    if (myOpenid) {
      this.doFetchReceived(myOpenid);
    } else {
      wx.cloud.callFunction({ name: 'login' }).then(res => {
        myOpenid = res.result.openid;
        wx.setStorageSync('my_openid', myOpenid);
        this.doFetchReceived(myOpenid);
      }).catch(err => {
        wx.showToast({ title: '获取用户信息失败', icon: 'none' });
        console.error('调用 login 云函数失败', err);
      });
    }
  },

  doFetchReceived(openid) {
    const { recPage, pageSize, receivedList } = this.data;

    db.collection('partner_applies').where({
      partner_publisher_openid: openid // 根据发布者的 openid 过滤
    }).orderBy('createTime', 'desc')
      .skip((recPage - 1) * pageSize)
      .limit(pageSize)
      .get({
        success: res => {
          const hasMore = res.data.length === pageSize;
          this.setData({
            receivedList: recPage === 1 ? res.data : receivedList.concat(res.data),
            recPage: recPage + 1,
            recHasMore: hasMore,
            isLoading: false
          });
        },
        fail: err => {
          this.setData({ isLoading: false });
          console.error(err);
        }
      });
  },

  handleDelete(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '提示',
      content: '确定要删除这条发布的搭子吗？',
      success: res => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中' });
          db.collection('partners').doc(id).remove({
            success: () => {
              wx.hideLoading();
              wx.showToast({ title: '已删除' });
              this.fetchPublished();
            },
            fail: err => {
              wx.hideLoading();
              wx.showToast({ title: '删除失败', icon: 'none' });
            }
          });
        }
      }
    });
  },

  handleCancelApply(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '提示',
      content: '确定要取消这个搭子申请吗？',
      success: res => {
        if (res.confirm) {
          wx.showLoading({ title: '取消中' });
          db.collection('partner_applies').doc(id).remove({
            success: () => {
              wx.hideLoading();
              wx.showToast({ title: '已取消' });
              this.setData({ appPage: 1, appHasMore: true, appliedList: [] });
              this.fetchApplied(); // 刷新申请列表
            },
            fail: err => {
              wx.hideLoading();
              wx.showToast({ title: '取消失败', icon: 'none' });
            }
          });
        }
      }
    });
  },

  handleAcceptApply(e) {
    const item = e.currentTarget.dataset.item;
    wx.showModal({
      title: '同意申请',
      content: '同意后，对方可以看见你的微信号，确认同意吗？',
      success: res => {
        if (res.confirm) {
          wx.showLoading({ title: '处理中' });

          // 更新申请状态为 accepted
          db.collection('partner_applies').doc(item._id).update({
            data: {
              status: 'accepted'
            },
            success: () => {
              wx.hideLoading();
              wx.showToast({ title: '已同意', icon: 'success' });

              // 刷新列表
              this.setData({ recPage: 1, recHasMore: true, receivedList: [] });
              this.fetchReceived();

              // 给申请人发通知，告诉他已经被同意了
              const userInfo = wx.getStorageSync('user_info');
              if (item._openid && userInfo) {
                wx.cloud.callFunction({
                  name: 'sendNotification',
                  data: {
                    type: 'partner_accept',
                    toUser: item._openid, // 发给当初的申请人
                    postId: item.partner_id,
                    content: `同意了你的搭子申请！快去[我的搭子]看看TA的微信号吧`,
                    nickName: userInfo.nickName,
                    avatarUrl: userInfo.avatarUrl,
                    postContent: `[${item.partner_info.tag}] ${item.partner_info.content}`,
                    wechatId: userInfo.wechatId || '未填写'
                  }
                }).catch(err => console.error('发送同意通知失败:', err));
              }
            },
            fail: err => {
              wx.hideLoading();
              wx.showToast({ title: '操作失败', icon: 'none' });
              console.error('更新同意状态失败', err);
            }
          });
        }
      }
    });
  },

  formatTime(dateStr) {
    if (!dateStr) return '刚刚';
    const createTime = (typeof dateStr.getTime === 'function') ? dateStr.getTime() : new Date(dateStr).getTime();
    const now = new Date().getTime();
    const diff = now - createTime;
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
    if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
    return Math.floor(diff / 86400000) + '天前';
  }
})