const db = wx.cloud.database()
const _ = db.command

Page({
  data: {
    msgs: [],
    hasMore: true,
    isLoading: false
  },

  onLoad: function () {
    this.getMyMessages();
  },

  onReachBottom() {
    this.getMyMessages(true);
  },

  onUnload: function () {
    wx.setStorageSync('last_check_time', 0);
  },

  onPullDownRefresh() {
    // 只有用户主动下拉才拉取最新数据（消耗1次云调用）
    this.setData({ hasMore: true });
    this.getMyMessages();
  },

  // 处理滑动单元格关闭事件
  onDeleteMsg(event) {
    const { position, instance } = event.detail;
    const { id, index } = event.currentTarget.dataset;

    switch (position) {
      case 'left':
      case 'cell':
        instance.close();
        break;
      case 'right':
        wx.showModal({
          title: '提示',
          content: '确定删除这条消息吗？',
          confirmColor: '#ee0a24',
          success: (res) => {
            if (res.confirm) {
              this.deleteMessage(id, index, instance);
            } else {
              instance.close();
            }
          }
        });
        break;
    }
  },

  deleteMessage(docId, index, instance) {
    wx.showLoading({ title: '删除中...' });

    const msg = this.data.msgs[index];
    const wasUnread = msg && !msg.isRead;

    db.collection('notifications').doc(docId).remove()
      .then(res => {
        wx.hideLoading();
        const newMsgs = this.data.msgs;
        newMsgs.splice(index, 1);

        this.setData({
          msgs: newMsgs
        });

        instance.close();

        if (wasUnread) {
          let cachedUnread = wx.getStorageSync('cached_unread_count') || 0;
          if (cachedUnread > 0) {
            cachedUnread--;
            wx.setStorageSync('cached_unread_count', cachedUnread);
            if (cachedUnread > 0) {
              wx.setTabBarBadge({ index: 2, text: String(cachedUnread) }).catch(() => { });
            } else {
              wx.removeTabBarBadge({ index: 2 }).catch(() => { });
            }
          }
        }

        wx.showToast({ title: '已删除', icon: 'success' });
      })
      .catch(err => {
        wx.hideLoading();
        instance.close();
        console.error('删除失败：', err);
        wx.showToast({ title: '删除失败', icon: 'none' });
      });
  },

  // 获取消息列表
  getMyMessages(isLoadMore = false) {
    if (this.data.isLoading) return;
    if (isLoadMore && !this.data.hasMore) return;

    const userInfo = wx.getStorageSync('user_info');
    if (!userInfo) {
      wx.stopPullDownRefresh();
      return;
    }

    this.setData({ isLoading: true });
    if (!isLoadMore) {
      wx.showLoading({ title: '加载中...' });
    }

    const skipCount = isLoadMore ? this.data.msgs.length : 0;

    db.collection('notifications')
      .where({
        toUser: userInfo._openid
      })
      .orderBy('createTime', 'desc')
      .skip(skipCount)
      .limit(7)
      .get()
      .then(res => {
        const newItems = res.data.map(item => {
          return {
            ...item,
            timeString: this.formatTime(item.createTime)
          }
        });

        const list = isLoadMore ? this.data.msgs.concat(newItems) : newItems;
        this.setData({
          msgs: list,
          hasMore: newItems.length === 7,
          isLoading: false
        });

        if (!isLoadMore) {
          // 为了极致省钱，不再单独 count，直接根据拉取到的第一页消息来处理未读
          const unreadCount = list.filter(msg => !msg.isRead).length;
          let cachedUnread = wx.getStorageSync('cached_unread_count') || 0;
          if (unreadCount > cachedUnread || !this.data.hasMore) {
            wx.setStorageSync('cached_unread_count', unreadCount);
            cachedUnread = unreadCount;
          }

          if (cachedUnread > 0) {
            wx.setTabBarBadge({ index: 2, text: String(cachedUnread) }).catch(() => { });
          } else {
            wx.removeTabBarBadge({ index: 2 }).catch(() => { });
          }
        }

        wx.stopPullDownRefresh();
        wx.hideLoading();
      })
      .catch(err => {
        console.error('获取消息失败', err);
        this.setData({ isLoading: false });
        wx.stopPullDownRefresh();
        wx.hideLoading();
      })
  },

  // 点击跳转逻辑
  onReadAndGo(e) {
    const item = e.currentTarget.dataset.item;
    const index = e.currentTarget.dataset.index;

    // 如果未读，我们只在本地改状态 + 后台静默改数据库，无需重新 get 整个列表！
    if (!item.isRead) {
      // 1. 立刻让本页面的红点消失（视觉优化，0 云调用）
      this.setData({
        [`msgs[${index}].isRead`]: true
      });

      // 2. 异步更新数据库状态 (这个 update 是必需的，只改这一条数据)
      db.collection('notifications').doc(item._id).update({
        data: { isRead: true }
      }).then(() => {
        // 确保外面个人中心的红点能同步
        wx.setStorageSync('last_check_time', 0);
      }).catch(console.error);

      // 3. 更新本地缓存红点数字
      let cachedUnread = wx.getStorageSync('cached_unread_count') || 0;
      if (cachedUnread > 0) {
        cachedUnread--;
        wx.setStorageSync('cached_unread_count', cachedUnread);
        if (cachedUnread > 0) {
          wx.setTabBarBadge({ index: 2, text: String(cachedUnread) }).catch(() => { });
        } else {
          wx.removeTabBarBadge({ index: 2 }).catch(() => { });
        }
      }
    }

    // 跳转逻辑
    if (item.type === 'partner_apply' || item.type === 'partner_accept') {
      wx.navigateTo({
        url: `/pages/partner_mine/partner_mine?tab=${item.type === 'partner_apply' ? 'received' : 'applied'}`
      });
    } else {
      wx.navigateTo({
        url: `/pages/postDetail/postDetail?id=${item.postId}`
      });
    }
  },

  formatTime(timeStr) {
    if (!timeStr) return '';
    const date = typeof timeStr === 'object' ? timeStr : new Date(timeStr);
    const now = new Date();
    if (date.toDateString() === now.toDateString()) {
      return `${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
    }
    return `${date.getMonth() + 1}-${date.getDate()}`;
  }
})