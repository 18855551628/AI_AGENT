const db = wx.cloud.database()

Page({
  data: {
    content: '',
    selectedCategory: 'latest', // 默认选中第一个
    categories: [
      { label: '表白', value: 'love' },
      { label: '求助', value: 'help' },
      { label: '吐槽', value: 'speak' },
      { label: '提问', value: 'ask' },
      { label: '日常', value: 'latest' }
    ],
    userInfo: null,
    fileList: []
  },

  onLoad() {
    // 1. 进页面先检查有没有登录信息
    const user = wx.getStorageSync('user_info'); // 假设你登录时存的是这个key
    if (user) {
      this.setData({ userInfo: user });
    } else {
      // 没登录就提示去登录
      wx.showModal({
        title: '提示',
        content: '发布帖子需要先登录哦',
        showCancel: false,
        success: () => {
          // 跳转到你的个人中心页去登录 (根据你的实际路径修改)
          wx.switchTab({ url: '/pages/user/user' }) 
        }
      })
    }
  },

  // 监听输入
  onInput(e) {
    this.setData({ content: e.detail });
  },

  // 切换分类
  onSelectCategory(e) {
    this.setData({
      selectedCategory: e.currentTarget.dataset.val
    });
  },

  afterRead(event) {
    const { file } = event.detail;
    // 当 multiple 为 true 时，file 是一个数组
    // 我们需要把它追加到当前的 fileList 里
    const { fileList = [] } = this.data;
    
    // 简单的兼容处理（如果是单选可能是对象，多选是数组）
    const newFiles = Array.isArray(file) ? file : [file];
    
    newFiles.forEach(item => {
      fileList.push({ ...item, url: item.url });
    });

    this.setData({ fileList });
  },

  deleteImg(event) {
    const { index } = event.detail;
    const { fileList } = this.data;
    fileList.splice(index, 1);
    this.setData({ fileList });
  },

  // 提交发布
  submitPost() {
    // 防抖校验
    if (!this.data.content.trim()) {
      wx.showToast({ title: '内容不能为空', icon: 'none' });
      return;
    }
    if (!this.data.userInfo) {
      wx.showToast({ title: '未获取到用户信息', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '发布中...', mask: true });

    // --- A. 如果有图片，先上传图片 ---
    const uploadTasks = this.data.fileList.map((file, index) => {
      return this.uploadFilePromise(file.url);
    });

    // 等所有图片都传完，再存数据库
    Promise.all(uploadTasks)
      .then(resultFileIds => {
        // resultFileIds 是一个数组，装着所有云端图片的 FileID
        
        // --- B. 存入数据库 ---
        return db.collection('forum_posts').add({
          data: {
            content: this.data.content,
            images: resultFileIds, // ✅ 存入图片数组
            category: this.data.selectedCategory,
            nickName: this.data.userInfo.nickName,
            avatarUrl: this.data.userInfo.originalAvatarUrl || this.data.userInfo.avatarUrl,
            createTime: new Date(),
            like_count: 0,
            comment_count: 0,
            view_count: 0,
            isTop: 0, 
            topExpireTime: 0
          }
        });
      }).then(res => {
      wx.hideLoading();
      wx.showToast({ title: '发布成功', icon: 'success' });

      const pages = getCurrentPages();
      const prevPage = pages[pages.length - 2];

      if (prevPage) {
        // 3. 直接修改上一页的数据：把标签切换回 'latest' (最新)，这样用户就能立刻看到自己的帖子
        prevPage.setData({
          active: 'latest',           // 让 Tab 栏 UI 变回“最新”
          currentCategory: 'latest',  // 让查询逻辑变回“最新”
          searchKeyword: ''           // (可选) 清空之前的搜索词
        });

        // 4. 指挥上一页立即执行下拉刷新
        // 注意：这里我们直接调用你在 forum.js 里写好的 onPullDownRefresh 函数
        prevPage.onPullDownRefresh(); 
      }
      // 1.5秒后返回上一页
      setTimeout(() => {
        wx.navigateBack({ delta: 1 });
      }, 1500);
    }).catch(err => {
      wx.hideLoading();
      console.error(err);
      wx.showToast({ title: '发布失败，请重试', icon: 'none' });
    })
  },
  uploadFilePromise(tempFilePath) {
    return new Promise((resolve, reject) => {
      // 生成一个唯一文件名：时间戳 + 随机数 + 后缀
      const suffix = tempFilePath.match(/\.[^.]+?$/)[0]; 
      const cloudPath = 'post_images/' + Date.now() + '-' + Math.floor(Math.random() * 1000) + suffix;

      wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: tempFilePath,
        success: res => resolve(res.fileID), // 上传成功，返回 fileID
        fail: err => reject(err)
      });
    });
  }
})