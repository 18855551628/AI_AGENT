const db = wx.cloud.database();

Page({
  data: {
    type: '1', // '1'寻物, '0'招领 (单选框需要字符串类型)
    typeNames: ['寻物启事', '失物招领'],
    typeValues: [1, 0], // 1代表寻物，0代表招领
    typeIndex: 0, // 默认选中第0项（寻物启事）
    // 分类数据，保持与列表页一致 (去掉了'全部')
    categories: [
      { id: 1, name: "证件卡片" },
      { id: 2, name: "数码电子" },
      { id: 3, name: "钥匙门禁" },
      { id: 4, name: "书籍文具" },
      { id: 5, name: "生活用品" },
      { id: 6, name: "其他" }
    ],
    categoryNames: ["证件卡片", "数码电子", "钥匙门禁", "书籍文具", "生活用品", "其他"],
    categoryIndex: -1, 

    title: '',
    location: '',
    date: '',
    content: '',
    
    fileList: [], // 预览的本地图片列表
  },

  onLoad() {
    // 默认日期设为今天
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`;
    this.setData({ date: dateStr });
  },

  // --- 表单数据绑定 ---
  onTypeChange(e) { 
    this.setData({ typeIndex: e.detail.value }); 
  },
  onCategoryChange(e) { this.setData({ categoryIndex: e.detail.value }); },
  onTitleChange(e) { this.setData({ title: e.detail }); },
  onLocationChange(e) { this.setData({ location: e.detail }); },
  onDateChange(e) { this.setData({ date: e.detail.value }); },
  onContentChange(e) { this.setData({ content: e.detail }); },

  // --- 图片上传相关 ---
  afterRead(event) {
    const { file } = event.detail;
    // 将选中的图片推入 fileList 进行本地预览
    const { fileList = [] } = this.data;
    fileList.push({ ...file, url: file.url });
    this.setData({ fileList });
  },

  deleteImg(event) {
    const { index } = event.detail;
    const { fileList } = this.data;
    fileList.splice(index, 1);
    this.setData({ fileList });
  },

  // --- 提交主流程 ---
  async onSubmit() {
    const { typeIndex, typeValues, categoryIndex, categories, title, location, date, content, fileList } = this.data;

    // 1. 表单校验
    if (categoryIndex === -1) return wx.showToast({ title: '请选择分类', icon: 'none' });
    if (!title.trim()) return wx.showToast({ title: '请填写标题', icon: 'none' });
    if (!location.trim()) return wx.showToast({ title: '请填写地点', icon: 'none' });
    if (!date) return wx.showToast({ title: '请选择日期', icon: 'none' });

    const userInfo = wx.getStorageSync('user_info');
    if (!userInfo) return wx.showToast({ title: '登录信息失效', icon: 'none' });

    wx.showLoading({ title: '发布中...', mask: true });

    try {
      // 2. 上传图片到云存储
      let cloudImgUrls = [];
      if (fileList.length > 0) {
        const uploadTasks = fileList.map(item => {
          const cloudPath = `lost_and_found/${Date.now()}_${Math.floor(Math.random() * 1000)}${item.url.match(/\.[^.]+?$/)[0]}`;
          return wx.cloud.uploadFile({
            cloudPath: cloudPath,
            filePath: item.url, 
          });
        });
        
        // 并发上传所有图片
        const uploadResults = await Promise.all(uploadTasks);
        cloudImgUrls = uploadResults.map(res => res.fileID);
      }

      // 3. 构造要写入数据库的数据
      const postData = {
        type: typeValues[typeIndex],
        category_id: categories[categoryIndex].id,
        title: title,
        location: location,
        date: date,
        content: content,
        imgs: cloudImgUrls,
        status: 1, // 1 表示寻找中/招领中
        create_time: db.serverDate(),
        publisher_info: {
          nickName: userInfo.nickName,
          avatarUrl: userInfo.avatarUrl,
          openid: userInfo._openid // 存一下发布者的 openid 方便后续校验权限
        }
      };

      // 4. 写入数据库
      await db.collection('lost_and_found').add({ data: postData });

      wx.hideLoading();
      wx.showToast({ title: '发布成功', icon: 'success' });

      // 5. 延迟返回上一页，并通知上一页刷新数据
      setTimeout(() => {
        const pages = getCurrentPages();
        const prevPage = pages[pages.length - 2];
        if (prevPage && prevPage.getList) {
          prevPage.getList(true); // 调用列表页的方法刷新数据
        }
        wx.navigateBack();
      }, 1500);

    } catch (err) {
      wx.hideLoading();
      console.error('发布失败:', err);
      wx.showToast({ title: '发布失败，请重试', icon: 'none' });
    }
  }
});