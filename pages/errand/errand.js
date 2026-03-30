import Toast from '@vant/weapp/toast/toast';

const db = wx.cloud.database();
const _ = db.command;

Page({
  data: {
    activeTab: 'hall', // 🌟 默认进来的页面改为跑腿大厅

    // --- 发单表单数据 ---
    taskType: 'fetch',
    startAddress: '',
    endAddress: '',
    taskDesc: '',
    reward: '',

    // --- 列表数据 ---
    taskList: [],        // 跑腿大厅
    myPublishedList: [], // 我发布的
    myAcceptedList: [],  // 我接单的

    userInfo: null,
    openid: ''
  },

  onLoad() {
    const userInfo = wx.getStorageSync('user_info');
    const openid = wx.getStorageSync('openid');
    this.setData({ userInfo, openid });

    this.fetchAllData();
  },

  onShow() {
    this.fetchAllData();
  },

  // 监听 Tab 切换
  onTabChange(event) {
    this.setData({ activeTab: event.detail.name });
    if (event.detail.name !== 'publish') {
      this.fetchAllData();
    }
  },

  // 监听输入框和单选框
  onTaskTypeChange(event) { this.setData({ taskType: event.detail }); },
  onInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ [field]: event.detail });
  },

  getTypeConfig(type) {
    const config = {
      'fetch': { name: '代取快递', color: '#4F7BFC' },
      'buy': { name: '帮忙买', color: '#00C853' },
      'deliver': { name: '帮忙送', color: '#FF9100' }
    };
    return config[type] || config['fetch'];
  },

  getStatusColor(status) {
    const config = {
      '待接单': '#4F7BFC',
      '进行中': '#00C853',
      '已完成': '#999999',
      '已取消': '#E0E0E0'
    };
    return config[status] || '#333';
  },

  // 提交发单
  submitTask() {
    // 每次发单前重新校验一下登录态，防止 onLoad 没抓到
    const userInfo = wx.getStorageSync('user_info');
    if (!userInfo) {
      Toast('请先到“我的”页面登录');
      return;
    }

    const { taskType, startAddress, endAddress, taskDesc, reward } = this.data;
    if (!startAddress || !endAddress || !taskDesc || !reward) {
      Toast('请将跑腿信息填写完整哦');
      return;
    }

    const typeConfig = this.getTypeConfig(taskType);

    wx.showLoading({ title: '发布中' });
    db.collection('errand_tasks').add({
      data: {
        taskType,
        typeName: typeConfig.name,
        typeColor: typeConfig.color,
        startAddress,
        endAddress,
        taskDesc,
        reward: Number(reward),
        status: '待接单',
        createTime: db.serverDate(),
        publisherAvatar: userInfo.avatarUrl,
        publisherName: userInfo.nickName,
        accepterId: null
      }
    }).then(res => {
      wx.hideLoading();
      Toast.success('发布成功！');
      this.setData({
        startAddress: '', endAddress: '', taskDesc: '', reward: '',
        activeTab: 'my_published'
      });
      this.fetchAllData();
    }).catch(err => {
      wx.hideLoading();
      Toast.fail('发布失败');
      console.error(err);
    });
  },

  // 拉取云端数据
  fetchAllData() {
    if (this.data.activeTab === 'hall') {
      this.fetchHallData();
    } else if (this.data.activeTab === 'my_published') {
      this.fetchMyPublishedData();
    } else if (this.data.activeTab === 'my_accepted') {
      this.fetchMyAcceptedData();
    }
  },

  // 获取跑腿大厅数据（待接单）
  fetchHallData() {
    const userInfo = wx.getStorageSync('user_info');
    const openid = userInfo ? userInfo._openid : '';

    wx.showNavigationBarLoading();
    db.collection('errand_tasks')
      .where({
        status: '待接单',
        _openid: _.neq(openid) // 🌟 过滤掉自己发出的单子
      })
      .orderBy('createTime', 'desc')
      .get()
      .then(res => {
        const list = res.data.map(item => this.formatTaskData(item));
        this.setData({ taskList: list });
      })
      .finally(() => {
        wx.hideNavigationBarLoading();
      });
  },

  // 获取我发布的数据
  fetchMyPublishedData() {
    // 每次请求前重新获取一下，防止刚登录时没刷到
    const userInfo = wx.getStorageSync('user_info');
    const openid = userInfo ? userInfo._openid : this.data.openid;

    if (!openid) return;

    wx.showNavigationBarLoading();
    db.collection('errand_tasks')
      .where({
        _openid: openid
      })
      .orderBy('createTime', 'desc')
      .get()
      .then(res => {
        const list = res.data.map(item => this.formatTaskData(item));
        this.setData({ myPublishedList: list });
      })
      .finally(() => {
        wx.hideNavigationBarLoading();
      });
  },

  // 获取我接单的数据
  fetchMyAcceptedData() {
    const userInfo = wx.getStorageSync('user_info');
    const openid = userInfo ? userInfo._openid : this.data.openid;

    if (!openid) return;

    wx.showNavigationBarLoading();
    db.collection('errand_tasks')
      .where({
        accepterId: openid
      })
      .orderBy('createTime', 'desc')
      .get()
      .then(res => {
        const list = res.data.map(item => this.formatTaskData(item));
        this.setData({ myAcceptedList: list });
      })
      .finally(() => {
        wx.hideNavigationBarLoading();
      });
  },

  formatTaskData(item) {
    let timeStr = '';
    if (item.createTime) {
      const date = new Date(item.createTime);
      timeStr = `${date.getMonth() + 1}-${date.getDate()} ${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
    }
    return {
      id: item._id,
      typeName: item.typeName,
      typeColor: item.typeColor,
      desc: item.taskDesc,
      start: item.startAddress,
      end: item.endAddress,
      reward: item.reward,
      time: timeStr,
      status: item.status,
      statusColor: this.getStatusColor(item.status),
      publisherId: item._openid
    };
  },

  // 抢单
  takeOrder(e) {
    const id = e.currentTarget.dataset.id;
    const userInfo = wx.getStorageSync('user_info');
    const openid = userInfo ? userInfo._openid : '';

    if (!userInfo || !openid) {
      Toast('请先到“我的”页面登录');
      return;
    }

    wx.showLoading({ title: '抢单中...' });

    // 🌟 由于接单人不是创建者，普通的云数据库客户端 .update() 会因为默认权限（仅创建者可读写）被拒绝。
    // 为了不引入新的云函数，可以通过云数据库调用云函数的方式，但这里如果用户没改权限，最好提示。
    // 但是这里如果我们要更新别人的记录，必须依赖云函数或者在控制台把集合权限设为"所有用户可读写"。
    // 这里我们先执行，如果遇到权限问题，建议用户在控制台修改集合权限或后续我们补云函数。
    db.collection('errand_tasks').doc(id).update({
      data: {
        status: '进行中',
        accepterId: openid,
        acceptTime: db.serverDate()
      }
    }).then(res => {
      wx.hideLoading();
      Toast.success('抢单成功！');
      this.setData({ activeTab: 'my_accepted' }); // 🌟 抢单成功后，自动跳转到“我接单的”
      this.fetchMyAcceptedData();
    }).catch(err => {
      wx.hideLoading();
      Toast.fail('抢单失败,可能没权限');
      console.error('抢单失败原因：', err);
    });
  },

  // 取消订单
  cancelOrder(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '提示',
      content: '确定要取消该订单吗？',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '取消中...' });
          db.collection('errand_tasks').doc(id).update({
            data: { status: '已取消' }
          }).then(() => {
            wx.hideLoading();
            Toast.success('已取消');
            this.fetchMyPublishedData();
          }).catch(() => {
            wx.hideLoading();
            Toast.fail('操作失败');
          });
        }
      }
    });
  },

  // 确认送达 (发单人操作)
  finishOrder(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '提示',
      content: '确认物品已送达并完成订单？',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '处理中...' });
          db.collection('errand_tasks').doc(id).update({
            data: {
              status: '已完成',
              finishTime: db.serverDate()
            }
          }).then(() => {
            wx.hideLoading();
            Toast.success('订单已完成');
            // 刷新对应的列表
            if (this.data.activeTab === 'my_published') {
              this.fetchMyPublishedData();
            } else {
              this.fetchMyAcceptedData();
            }
          }).catch(() => {
            wx.hideLoading();
            Toast.fail('操作失败');
          });
        }
      }
    });
  },

  // 联系雇主：根据 publisherId 查 users 集合获取 wechatId
  contactUser(e) {
    const publisherId = e.currentTarget.dataset.publisher;
    if (!publisherId) {
      Toast('获取雇主信息失败');
      return;
    }

    wx.showLoading({ title: '获取中...' });
    db.collection('users').where({
      _openid: publisherId
    }).get().then(res => {
      wx.hideLoading();
      if (res.data && res.data.length > 0) {
        const wechatId = res.data[0].wechatId;
        if (wechatId) {
          wx.showModal({
            title: '雇主微信号',
            content: wechatId,
            confirmText: '复制',
            success(modalRes) {
              if (modalRes.confirm) {
                wx.setClipboardData({
                  data: wechatId,
                  success: () => {
                    wx.showToast({ title: '已复制微信号', icon: 'success' });
                  }
                });
              }
            }
          });
        } else {
          Toast('该雇主未填写微信号');
        }
      } else {
        Toast('未找到雇主信息');
      }
    }).catch(err => {
      wx.hideLoading();
      Toast('获取失败');
      console.error(err);
    });
  }
});