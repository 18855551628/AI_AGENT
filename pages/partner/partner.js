Page({
  data: {
    currentTab: 'all',
    // 从云数据库获取的搭子数据
    partnerList: [],
    page: 1,
    pageSize: 7,
    hasMore: true,
    isLoading: false,
    movableX: 300,
    movableY: 500,
    isFabOpen: false,
  },

  onLoad() {
    // 页面加载时获取云数据库中的搭子数据
    this.fetchPartnerList();

    // 动态计算屏幕宽高，把悬浮球默认放在右下角
    const sys = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    this.setData({
      movableX: sys.windowWidth - 80, // 屏幕宽 - 按钮宽 - 边距
      movableY: sys.windowHeight - 100 // 屏幕高 - 按钮高 - 底部距离
    });
  },

  // 获取云数据库中的搭子列表
  fetchPartnerList(isLoadMore = false) {
    if (this.data.isLoading) return;
    if (isLoadMore && !this.data.hasMore) return;

    this.setData({ isLoading: true });

    let { page, pageSize, partnerList, currentTab } = this.data;
    if (!isLoadMore) {
      page = 1;
      partnerList = [];
    }

    const db = wx.cloud.database();
    let query = db.collection('partners');
    if (currentTab !== 'all') {
      query = query.where({ type: currentTab });
    }

    // 1. 分页获取搭子
    query.orderBy('createTime', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get()
      .then(res => {
        const dataList = res.data.map(item => {
          if (item.createTime) {
            const now = new Date();
            const createTimeMs = (typeof item.createTime.getTime === 'function') ? item.createTime.getTime() : new Date(item.createTime).getTime();
            const diff = now.getTime() - createTimeMs;
            if (diff < 60000) item.time = '刚刚';
            else if (diff < 3600000) item.time = Math.floor(diff / 60000) + '分钟前';
            else if (diff < 86400000) item.time = Math.floor(diff / 3600000) + '小时前';
            else item.time = Math.floor(diff / 86400000) + '天前';
          } else {
            item.time = '刚刚';
          }
          item.hasApplied = false;
          return item;
        });

        const hasMore = dataList.length === pageSize;

        // 获取真实的 openid
        let myOpenid = wx.getStorageSync('my_openid');

        const checkApplies = (openid) => {
          db.collection('partner_applies').where({
            _openid: openid
          }).get().then(applyRes => {
            dataList.forEach(item => {
              const applyRecord = applyRes.data.find(a => a.partner_id === item._id);
              if (applyRecord) {
                item.hasApplied = true;
                item.applyId = applyRecord._id;
              }
            });

            this.setData({
              partnerList: isLoadMore ? partnerList.concat(dataList) : dataList,
              page: page + 1,
              hasMore: hasMore,
              isLoading: false
            });
          }).catch(err => {
            console.error('获取申请记录失败：', err);
            this.setData({
              partnerList: isLoadMore ? partnerList.concat(dataList) : dataList,
              page: page + 1,
              hasMore: hasMore,
              isLoading: false
            });
          });
        };

        if (myOpenid) {
          checkApplies(myOpenid);
        } else {
          wx.cloud.callFunction({ name: 'login' }).then(loginRes => {
            myOpenid = loginRes.result.openid;
            wx.setStorageSync('my_openid', myOpenid);
            checkApplies(myOpenid);
          }).catch(err => {
            console.error('获取openid失败', err);
            // 兜底直接渲染
            this.setData({
              partnerList: isLoadMore ? partnerList.concat(dataList) : dataList,
              page: page + 1,
              hasMore: hasMore,
              isLoading: false
            });
          });
        }
      }).catch(err => {
        this.setData({ isLoading: false });
        wx.showToast({ title: '获取数据失败', icon: 'none' });
        console.error('获取搭子列表失败：', err);
      });
  },

  // 页面上拉触底事件的处理函数
  onReachBottom() {
    this.fetchPartnerList(true);
  },

  // 切换分类 Tab
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({
      currentTab: tab,
      page: 1,
      hasMore: true,
      partnerList: []
    });
    this.fetchPartnerList();
  },

  toggleFab() {
    this.setData({
      isFabOpen: !this.data.isFabOpen
    });
  },

  // 点击申请加入
  handleJoin(e) {
    const item = e.currentTarget.dataset.item;
    const that = this;

    // 为了避免丑陋的 loading，我们在 onLoad 时就把用户的 openid 缓存下来
    const myOpenid = wx.getStorageSync('my_openid');

    if (myOpenid) {
      if (item._openid === myOpenid) {
        wx.showToast({
          title: '不能申请自己发布的搭子哦',
          icon: 'none'
        });
        return;
      }
      that.proceedWithJoin(item);
    } else {
      // 只有在没缓存的情况下才调云函数，并且不显示 loading
      wx.cloud.callFunction({
        name: 'login',
      }).then(res => {
        const currentOpenid = res.result.openid;
        wx.setStorageSync('my_openid', currentOpenid);

        if (item._openid === currentOpenid) {
          wx.showToast({
            title: '不能申请自己发布的搭子哦',
            icon: 'none'
          });
          return;
        }
        that.proceedWithJoin(item);
      }).catch(err => {
        console.error('调用 login 云函数失败', err);
        // 作为兜底，如果云函数失败，允许继续
        that.proceedWithJoin(item);
      });
    }
  },

  proceedWithJoin(item) {
    const that = this;

    if (item.hasApplied) {
      wx.showModal({
        title: '取消申请',
        content: '确认要取消这个搭子申请吗？',
        confirmColor: '#FF6B6B',
        success(res) {
          if (res.confirm) {
            wx.showLoading({ title: '取消中...' });
            const db = wx.cloud.database();
            db.collection('partner_applies').doc(item.applyId).remove({
              success: () => {
                wx.hideLoading();
                wx.showToast({
                  title: '已取消申请',
                  icon: 'success'
                });

                // 局部更新状态，避免全局刷新导致列表跳动
                const newList = that.data.partnerList.map(p => {
                  if (p._id === item._id) {
                    return { ...p, hasApplied: false, applyId: null };
                  }
                  return p;
                });
                that.setData({ partnerList: newList });
              },
              fail: err => {
                wx.hideLoading();
                wx.showToast({
                  title: '取消失败',
                  icon: 'none'
                });
                console.error('取消申请失败', err);
              }
            });
          }
        }
      });
    } else {
      wx.showModal({
        title: '发送申请',
        content: '是否向Ta发送搭子申请并交换微信号？',
        confirmColor: '#1A1A1A',
        success(res) {
          if (res.confirm) {
            wx.showLoading({ title: '发送中...' });
            const db = wx.cloud.database();
            db.collection('partner_applies').add({
              data: {
                partner_id: item._id,
                partner_info: item, // 对方发布的搭子信息（包含他的微信号等，后续同意后可以直接读取）
                partner_publisher_openid: item._openid, // 记录搭子发布者的 openid，方便查询“向我申请的”
                apply_user_info: wx.getStorageSync('user_info'), // 申请人（我）的信息，包含我的微信号，方便发布者同意后查看
                status: 'pending',
                createTime: db.serverDate()
              },
              success: (addRes) => {
                wx.hideLoading();
                wx.showToast({
                  title: '已发送申请',
                  icon: 'success'
                });

                // 局部更新状态，避免全局刷新导致列表跳动
                const newList = that.data.partnerList.map(p => {
                  if (p._id === item._id) {
                    return { ...p, hasApplied: true, applyId: addRes._id };
                  }
                  return p;
                });
                that.setData({ partnerList: newList });

                // ======= 给搭子发布者发送通知 =======
                const userInfo = wx.getStorageSync('user_info');
                if (item._openid && userInfo) {
                  wx.cloud.callFunction({
                    name: 'sendNotification',
                    data: {
                      type: 'partner_apply',
                      toUser: item._openid, // 发给搭子作者
                      postId: item._id,     // 搭子记录的ID
                      content: `申请加入你的搭子`, // 通知内容
                      nickName: userInfo.nickName,
                      avatarUrl: userInfo.avatarUrl,
                      postContent: `[${item.tag}] ${item.content}`, // 对方发布的搭子内容概要
                      wechatId: userInfo.wechatId || '未填写'
                    }
                  }).then(res => console.log('搭子申请通知发送结果:', res))
                    .catch(err => console.error('搭子申请通知发送失败:', err));
                }
              },
              fail: err => {
                wx.hideLoading();
                wx.showToast({
                  title: '申请失败',
                  icon: 'none'
                });
                console.error('发送申请失败', err);
              }
            });
          }
        }
      });
    }
  },

  onShow() {
    // 移除 onShow 自动刷新，节省云调用次数
    this.setData({ isFabOpen: false });
  },

  // 去发布页面
  gotoPublish() {
    this.setData({ isFabOpen: false }); // 先收起菜单
    wx.navigateTo({ url: '/pages/partner_publish/partner_publish' });
  },

  // 去“我的搭子”页面
  gotoMyPartner() {
    this.setData({ isFabOpen: false }); // 先收起菜单
    wx.navigateTo({ url: '/pages/partner_mine/partner_mine' });
  },

  // 开启下拉刷新
  onPullDownRefresh() {
    this.fetchPartnerList();
    setTimeout(() => {
      wx.stopPullDownRefresh();
      wx.showToast({ title: '已更新最新动态', icon: 'none' });
    }, 1000);
  }
})