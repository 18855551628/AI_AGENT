const db = wx.cloud.database();

Page({
  data: {
    editId: null,
    title: '',
    desc: '',
    price: '',
    originalPrice: '',
    tempImgs: [], // 本地临时图片路径
    
    // 分类数据 (单选)
    categories: ['书籍教材', '数码电子', '生活用品', '美妆护肤', '虚拟产品'],
    selectedCategory: '', // 存选中的字符串
    
    // 标签数据 (多选，用对象数组方便管理状态)
    tagsOptions: [
      { name: '急售', selected: false },
      { name: '可小刀', selected: false },
      { name: '送货上门', selected: false },
      { name: '自提', selected: false },
      { name: '可置换', selected: false }
    ],
    contactInfo: ''
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ editId: options.id });
      this.loadData(options.id);
      wx.setNavigationBarTitle({ title: '修改闲置' });
    }
  },

  // --- 输入处理 ---
  onInputTitle(e) { this.setData({ title: e.detail.value }) },
  onInputDesc(e) { this.setData({ desc: e.detail.value }) },
  onInputPrice(e) { this.setData({ price: e.detail.value }) },
  onInputOriginalPrice(e) { this.setData({ originalPrice: e.detail.value }) },
  onInputContact(e) {
    this.setData({ contactInfo: e.detail.value });
  },

  // --- 图片选择 ---
  onChooseImg() {
    wx.chooseMedia({
      count: 9 - this.data.tempImgs.length, // 还能选几张
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const paths = res.tempFiles.map(file => file.tempFilePath);
        this.setData({
          tempImgs: this.data.tempImgs.concat(paths)
        });
      }
    })
  },

  // 删除图片
  onDelImg(e) {
    const idx = e.currentTarget.dataset.index;
    const list = this.data.tempImgs;
    list.splice(idx, 1);
    this.setData({ tempImgs: list });
  },

  // --- 交互逻辑 ---
  
  // 选择分类 (单选)
  onSelectCategory(e) {
    const val = e.currentTarget.dataset.value;
    this.setData({ selectedCategory: val });
  },

  // 选择标签 (多选，限制3个)
  onSelectTag(e) {
    const idx = e.currentTarget.dataset.index;
    const options = this.data.tagsOptions;
    const currentItem = options[idx];

    // 如果是取消选中，直接取消
    if (currentItem.selected) {
      currentItem.selected = false;
    } else {
      // 如果是选中，先检查是否超过3个
      const selectedCount = options.filter(i => i.selected).length;
      if (selectedCount >= 3) {
        wx.showToast({ title: '标签最多选3个哦', icon: 'none' });
        return;
      }
      currentItem.selected = true;
    }

    // 更新视图
    this.setData({
      [`tagsOptions[${idx}]`]: currentItem
    });
  },

  loadData(id) {
    wx.showLoading({ title: '加载中' });
    db.collection('market_goods').doc(id).get().then(res => {
      const data = res.data;
      const newTags = this.data.tagsOptions.map(t => {
        t.selected = data.tags.includes(t.name);
        return t;
      });

      this.setData({
        title: data.title,
        desc: data.desc,
        price: data.price,
        originalPrice: data.original_price,
        contactInfo: data.contact_info,
        tempImgs: data.imgs,
        selectedCategory: data.category_name, 
        tagsOptions: newTags
      });
      wx.hideLoading();
    });
  },

  // --- 核心提交逻辑 ---
  submitForm() {
    // 1. 基础校验
    const { title, price, selectedCategory, tempImgs } = this.data;
    if (!title) return wx.showToast({ title: '请填写标题', icon: 'none' });
    if (!price) return wx.showToast({ title: '请填写价格', icon: 'none' });
    if (!selectedCategory) return wx.showToast({ title: '请选择分类', icon: 'none' });
    if (tempImgs.length === 0) return wx.showToast({ title: '请上传至少一张图', icon: 'none' });
    if (!this.data.contactInfo) {
      return wx.showToast({ title: '请填写联系方式', icon: 'none' });
    }

    // 2. 提取选中的标签
    const selectedTags = this.data.tagsOptions
      .filter(item => item.selected)
      .map(item => item.name);

    wx.showLoading({ title: '发布中...', mask: true });

    const oldImgs = this.data.tempImgs.filter(p => p.startsWith('cloud://') || p.startsWith('http'));
    const newImgs = this.data.tempImgs.filter(p => !p.startsWith('cloud://') && !p.startsWith('http'));

    // B. 上传新图片
    const uploadTasks = newImgs.map((filePath, index) => {
      const ext = filePath.match(/\.[^.]+?$/)[0];
      const cloudPath = `market_imgs/${Date.now()}_${index}${ext}`;
      return wx.cloud.uploadFile({ cloudPath, filePath });
    });

    Promise.all(uploadTasks).then(results => {
      const newFileIDs = results.map(res => res.fileID);
      // 合并图片列表
      const finalImgs = oldImgs.concat(newFileIDs);
      
      const formData = {
        title: this.data.title,
        desc: this.data.desc,
        price: this.data.price,
        original_price: this.data.originalPrice,
        contact_info: this.data.contactInfo,
        category_name: this.data.selectedCategory,
        tags: this.data.tagsOptions.filter(i => i.selected).map(i => i.name),
        imgs: finalImgs,
      };

      // 分支判断：是新增还是更新？
      if (this.data.editId) {
        return db.collection('market_goods').doc(this.data.editId).update({
          data: formData
        });
      } else {
        formData.create_time = new Date();
        formData.seller_info = wx.getStorageSync('user_info');
        formData.view_count = 0; // 初始浏览量
        formData.status = 1;
        return db.collection('market_goods').add({
          data: formData
        });
      }

    }).then(() => {
      wx.hideLoading();
      wx.showToast({ title: this.data.editId ? '已修改' : '已发布', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 1500);
    }).catch(err => {
      console.error(err);
      wx.hideLoading();
      wx.showToast({ title: '操作失败', icon: 'none' });
    });
  }
});