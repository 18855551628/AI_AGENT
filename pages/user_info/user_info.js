const db = wx.cloud.database();
Page({
  data: {
    userInfo: {
      avatarUrl: '',
      nickName: '',
      college: '',
      grade: '',
      gender: '',
      dormArea: '',
      dormNumber: '',
      wechatId: ''
    },
    // 控制年级选择器弹窗显示
    showGradePicker: false,
    // 年级选项列表
    gradeColumns: ['2022级', '2023级', '2024级', '2025级', '2026级', '2027级', '2028级'],
    // 控制性别选择器弹窗显示
    showGenderPicker: false,
    // 性别选项列表
    genderColumns: ['男', '女', '保密'],
    // 控制宿舍区选择器弹窗显示
    showDormAreaPicker: false,
    // 宿舍区选项列表
    dormAreaColumns: ['启智园', '诚朴园', '崇实园'],
  },

  onLoad() {
    // 1. 进来时，先从缓存里把旧数据拿出来显示
    const localUser = wx.getStorageSync('user_info') || {};
    this.setData({ userInfo: localUser });
  },

  // 处理头像选择 (和之前教你的一样)
  onChooseAvatar(e) {
    const { avatarUrl } = e.detail;
    this.setData({ 'userInfo.avatarUrl': avatarUrl });
    // 注意：这里先不上传，等点保存按钮时统一上传，或者你也可以在这里立即上传
  },

  // 处理昵称输入
  onNicknameChange(e) {
    this.setData({ 'userInfo.nickName': e.detail.value });
  },

  onCollegeChange(e) {
    this.setData({
      'userInfo.college': e.detail // Vant 的输入值在 e.detail 中
    });
  },

  // 【新增】点击年级输入框，弹出选择器
  showGradePicker() {
    this.setData({ showGradePicker: true });
  },

  // 【新增】关闭选择器
  onClosePicker() {
    this.setData({ showGradePicker: false });
  },

  // 【新增】确认选择年级
  onConfirmGrade(e) {
    const { value } = e.detail; // 拿到选中的值，例如 "2024级"
    this.setData({
      'userInfo.grade': value,
      showGradePicker: false // 选完关闭弹窗
    });
  },

  // 显示性别选择器
  showGenderPicker() {
    this.setData({ showGenderPicker: true });
  },

  // 关闭性别选择器
  onCloseGenderPicker() {
    this.setData({ showGenderPicker: false });
  },

  // 确认选择性别
  onConfirmGender(e) {
    const { value } = e.detail;
    this.setData({
      'userInfo.gender': value,
      showGenderPicker: false
    });
  },

  // 显示宿舍区选择器
  showDormAreaPicker() {
    this.setData({ showDormAreaPicker: true });
  },

  // 关闭宿舍区选择器
  onCloseDormAreaPicker() {
    this.setData({ showDormAreaPicker: false });
  },

  // 确认选择宿舍区
  onConfirmDormArea(e) {
    const { value } = e.detail;
    this.setData({
      'userInfo.dormArea': value,
      showDormAreaPicker: false
    });
  },

  // 监听宿舍号输入
  onDormNumberChange(e) {
    // Vant 的输入值在 e.detail 中，而不是 e.detail.value
    this.setData({ 'userInfo.dormNumber': e.detail });
  },

  // 监听微信号输入
  onWechatIdChange(e) {
    this.setData({ 'userInfo.wechatId': e.detail });
  },

  // === 核心：保存所有信息 ===
  async saveProfile() {
    wx.showLoading({ title: '保存中...' });

    // 这里拿到的 user 就是扁平的对象，包含 nickName, grade 等
    const user = this.data.userInfo;

    try {
      // 1. 上传头像 (逻辑不变)
      if (user.avatarUrl && (user.avatarUrl.includes('tmp') || user.avatarUrl.includes('wxfile'))) {
        const res = await wx.cloud.uploadFile({
          cloudPath: 'avatars/' + Date.now() + '.png',
          filePath: user.avatarUrl
        });
        user.avatarUrl = res.fileID;
      }

      // 2. 更新数据库 (变简单了！)
      const docId = wx.getStorageSync('user_doc_id');

      if (docId) {
        // 直接把整个 user 对象拿去更新，因为结构和数据库完全一致了
        // 或者只更新特定字段，防止覆盖 createTime
        await db.collection('users').doc(docId).update({
          data: {
            nickName: user.nickName,
            avatarUrl: user.avatarUrl,
            college: user.college,
            grade: user.grade,
            gender: user.gender,
            dormArea: user.dormArea,
            dormNumber: user.dormNumber,
            studentId: user.studentId,
            wechatId: user.wechatId
          }
        });
      } else {
        // 兜底逻辑：如果没 ID，查一下再更新（和之前一样，略）
      }

      // 3. 更新本地缓存
      wx.setStorageSync('user_info', user);

      wx.hideLoading();
      wx.showToast({ title: '保存成功' });
      setTimeout(() => { wx.navigateBack(); }, 1500);

    } catch (err) {
      wx.hideLoading();
      console.error(err);
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  }
});