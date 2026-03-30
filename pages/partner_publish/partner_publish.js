import Toast from '@vant/weapp/toast/toast';

Page({
  data: {
    tags: ['约自习', '约运动', '干饭拼单', '游戏开黑', '约电影',],
    selectedTag: '约自习', // 默认选中
    content: '',
  },

  // 选择标签
  chooseTag(e) {
    this.setData({
      selectedTag: e.currentTarget.dataset.tag
    });
  },

  // 监听内容输入
  onContentInput(e) {
    this.setData({
      content: e.detail.value
    });
  },

  // 提交发布
  submitPost() {
    const { selectedTag, content } = this.data;

    // 1. 表单非空校验
    if (!content.trim()) {
      Toast('请填写具体需求哦');
      return;
    }

    // 2. 交互反馈
    Toast.loading({
      message: '发布中...',
      forbidClick: true,
      duration: 0,
    });

    let type = 'other';
    if (selectedTag.includes('自习')) type = 'study';
    if (selectedTag.includes('游戏')) type = 'game';
    if (selectedTag.includes('运动')) type = 'sport';
    if (selectedTag.includes('干饭') || selectedTag.includes('拼单')) type = 'meal';

    // 3. 组装数据并存入云数据库
    const db = wx.cloud.database();
    db.collection('partners').add({
      data: {
        tag: selectedTag,
        content: content,
        createTime: db.serverDate(), // 使用服务端时间
        type: type,
        // 这里先用随机头像或缓存，实际应该在云函数或通过获取用户信息拿到
        avatar: wx.getStorageSync('user_info')?.avatarUrl || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + Math.random().toString(36).substr(2, 5),
        nickname: wx.getStorageSync('user_info')?.nickName || '热心同学',
        gender: wx.getStorageSync('user_info')?.gender || '未知',
        dormArea: wx.getStorageSync('user_info')?.dormArea || '',
        dormNumber: wx.getStorageSync('user_info')?.dormNumber || '',
        wechatId: wx.getStorageSync('user_info')?.wechatId || '' // 把发帖人的微信号存入搭子信息中
      },
      success: res => {
        Toast.clear();
        wx.showToast({
          title: '发布成功',
          icon: 'success',
          duration: 1500
        });

        // 5. 延迟返回上一页，并触发上一页的数据刷新
        setTimeout(() => {
          // 获取所有页面栈
          const pages = getCurrentPages();
          const prevPage = pages[pages.length - 2];

          // 如果上一个页面是寻找搭子列表页，直接调用它的获取数据方法刷新
          if (prevPage && prevPage.fetchPartnerList) {
            prevPage.fetchPartnerList();
          }

          wx.navigateBack();
        }, 1500);
      },
      fail: err => {
        Toast.clear();
        wx.showToast({
          title: '发布失败',
          icon: 'error'
        });
        console.error('发布失败：', err);
      }
    });
  }
})