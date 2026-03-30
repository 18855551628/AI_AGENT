const db = wx.cloud.database();

Page({
  data: {
    isLoggedIn: false,
    userInfo: null,
    unreadCount: 0,
    hasUnread: false,
    myPoints: 0,
    errandIncome: 0 // 🌟 跑腿收益
  },

  onShow() {
    const needRefresh = wx.getStorageSync('need_refresh_points');
    const cachedPoints = wx.getStorageSync('my_current_points');

    // 只有在“被标记需要刷新” 或者 “本地根本没缓存过积分（第一次进）” 时，才去查数据库
    if (needRefresh || cachedPoints === '') {
      this.fetchRealTimePoints();
    } else {
      // 否则直接使用本地缓存，0 次云调用！
      this.setData({ myPoints: cachedPoints });
    }

    if (cacheUser && cacheUser._openid) {
      this.fetchErrandIncome(cacheUser._openid);
    }

    let cacheUser = wx.getStorageSync('user_info');
    if (cacheUser) {

      //1：进页面先体检，验证本地头像文件是否失效
      cacheUser = this.validateAvatar(cacheUser);

      this.setData({ isLoggedIn: true, userInfo: cacheUser });

      // 每次显示都检查缓存中的未读数并更新 UI
      const cachedUnread = wx.getStorageSync('cached_unread_count') || 0;
      this.updateUnreadUI(cachedUnread);

      // 添加冷却时间 (60秒)
      const lastCheckTime = wx.getStorageSync('last_check_time') || 0;
      const now = Date.now();

      // 如果距离上次检查超过 60 秒，才去查数据库同步最新的
      if (now - lastCheckTime > 600000) {
        this.checkUnreadMessages(cacheUser._openid);
        wx.setStorageSync('last_check_time', now); // 更新检查时间
      }
    }
  },

  // 🌟 新增：验证本地头像缓存是否可用，不可用则自我修复
  validateAvatar(user) {
    // 如果存在原图地址，且当前展示的地址和原图不同（说明当前用的是本地存储的地址）
    if (user.originalAvatarUrl && user.avatarUrl !== user.originalAvatarUrl) {
      try {
        // 尝试访问这个本地文件，看它是不是被微信清理了
        wx.getFileSystemManager().accessSync(user.avatarUrl);
      } catch (e) {
        console.log('检测到本地头像已失效，正在恢复云端原图并重新下载...');

        // 文件已失效，立刻退回到原始云路径/网络路径，保证页面不碎图
        user.avatarUrl = user.originalAvatarUrl;
        wx.setStorageSync('user_info', user);

        // 唤起后台静默重新下载
        this.downloadAndSaveAvatar(user);
      }
    }
    return user;
  },

  // 🌟 新增：统计跑腿总收益
  fetchErrandIncome(openid) {
    if (!openid) return;

    const db = wx.cloud.database();
    db.collection('errand_tasks').where({
      accepterId: openid,
      status: '已完成'
    }).get().then(res => {
      let total = 0;
      res.data.forEach(task => {
        total += (task.reward || 0);
      });
      this.setData({ errandIncome: total });
    }).catch(err => {
      console.error('获取跑腿收益失败', err);
    });
  },

  async fetchRealTimePoints() {
    const accountInfo = wx.getStorageSync('user_info');
    if (!accountInfo) {
      this.setData({ myPoints: 0, errandIncome: 0 });
      return;
    }

    try {
      const db = wx.cloud.database();
      const res = await db.collection('user_account').get();
      if (res.data.length > 0) {
        const points = res.data[0].totalPoints || 0
        this.setData({ myPoints: points });
        wx.setStorageSync('my_current_points', points);
        wx.removeStorageSync('need_refresh_points');
      }
    } catch (err) {
      console.error('获取实时积分失败', err);
    }
  },

  checkUnreadMessages(myOpenid) {
    if (!myOpenid) return;

    const db = wx.cloud.database();
    db.collection('notifications').where({
      toUser: myOpenid,
      isRead: false
    }).count().then(res => {
      // 将最新的未读数存入本地缓存，供冷却期内使用
      wx.setStorageSync('cached_unread_count', res.total);
      this.updateUnreadUI(res.total);
    }).catch(console.error);
  },

  handleWechatLogin() {
    wx.getUserProfile({
      desc: '用于完善会员资料',
      success: (res) => {
        this.loginOrRegister(res.userInfo);
      },
      fail: (err) => {
        console.error('用户拒绝授权', err);
      }
    })
  },

  updateUnreadUI(count) {
    if (count > 0) {
      this.setData({ hasUnread: true, unreadCount: count });
      wx.setTabBarBadge({ index: 2, text: String(count) }).catch(() => { });
    } else {
      this.setData({ hasUnread: false, unreadCount: 0 });
      wx.removeTabBarBadge({ index: 2 }).catch(() => { });
    }
  },

  loginOrRegister(wxUser) {
    wx.showLoading({ title: '正在登录...' });

    db.collection('users').get().then(res => {
      if (res.data.length > 0) {
        // 【老用户】
        const record = res.data[0];
        wx.setStorageSync('user_doc_id', record._id);
        this.finishLogin(record);
      } else {
        // 【新用户】
        const customUser = {
          nickName: wxUser.nickName,
          avatarUrl: wxUser.avatarUrl,
          college: '',
          grade: '',
          gender: '保密',
          dormArea: '',
          dormNumber: '',
          wechatId: '',
          createTime: db.serverDate()
        };

        db.collection('users').add({
          data: customUser
        }).then(res => {
          wx.setStorageSync('user_doc_id', res._id);
          this.finishLogin(customUser);
        }).catch(addErr => {
          wx.hideLoading();
          wx.showToast({ title: '注册失败，请检查数据库权限', icon: 'none' });
        });
      }
    }).catch(err => {
      wx.hideLoading();
      wx.showToast({ title: '登录服务异常', icon: 'none' });
    });
  },

  //  2：剥离登录阻塞，让体验更丝滑
  finishLogin(finalUser) {
    // 锁定初始的安全地址（网络图或云路径）
    if (!finalUser.originalAvatarUrl) {
      finalUser.originalAvatarUrl = finalUser.avatarUrl;
    }

    // 1. 立即结束登录 Loading 并更新页面！不要让用户干等图片下载
    this.completeLoginProcess(finalUser);

    // 2. 将耗时的下载存储操作甩到后台静默执行
    this.downloadAndSaveAvatar(finalUser);
  },

  // 3：独立的静默下载与保存逻辑
  downloadAndSaveAvatar(user) {
    const avatar = user.originalAvatarUrl;
    if (!avatar) return;

    const saveAndComplete = (tempFilePath) => {
      const fs = wx.getFileSystemManager();
      fs.saveFile({
        tempFilePath: tempFilePath,
        success: (saveRes) => {
          user.avatarUrl = saveRes.savedFilePath;

          // 更新本地缓存
          wx.setStorageSync('user_info', user);

          // 如果用户还停留在当前页面，实时无感刷新 UI
          if (this.data.isLoggedIn && this.data.userInfo) {
            this.setData({ 'userInfo.avatarUrl': user.avatarUrl });
          }
        },
        fail: (err) => {
          console.error('头像持久化保存失败，继续使用原图', err);
        }
      });
    };

    if (avatar.startsWith('cloud://')) {
      wx.cloud.downloadFile({
        fileID: avatar,
        success: res => {
          if (res.statusCode === 200) saveAndComplete(res.tempFilePath);
        }
      });
      // 防止陷入开发者工具的 127.0.0.1 闭环报错
    } else if (avatar.startsWith('http') && !avatar.includes('127.0.0.1')) {
      wx.downloadFile({
        url: avatar,
        success: res => {
          if (res.statusCode === 200) saveAndComplete(res.tempFilePath);
        }
      });
    }
  },

  completeLoginProcess(finalUser) {
    wx.hideLoading();
    this.setData({ isLoggedIn: true, userInfo: finalUser });
    wx.setStorageSync('user_info', finalUser);
    wx.showToast({ title: '登录成功', icon: 'success' });
    this.checkUnreadMessages(finalUser._openid);
    this.fetchErrandIncome(finalUser._openid);
  },

  handleLogout() {
    wx.clearStorageSync();
    this.setData({
      isLoggedIn: false,
      userInfo: null,
      errandIncome: 0 // 退出时清空
    });
  },

  showAboutUs() {
    wx.showModal({
      title: '关于校园助手',
      content: '校园助手是一款专为大学生打造的一站式校园生活服务平台，集成了跑腿代办、二手市场、失物招领、学习交流等丰富功能，致力于让校园生活更加便捷、高效。',
      showCancel: false,
      confirmText: '我知道了',
      confirmColor: '#667eea'
    });
  }
})