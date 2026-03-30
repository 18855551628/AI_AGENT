import Toast from '@vant/weapp/toast/toast';

Page({
  data: {
    studentId: '',
    password: '',
    isSubmitting: false
  },

  onLoad() {
    const cachedAccount = wx.getStorageSync('jwc_account');
    if (cachedAccount) {
      this.setData({
        studentId: cachedAccount.studentId
      });
    }
  },

  onIdChange(event) { this.setData({ studentId: event.detail }); },
  onPwdChange(event) { this.setData({ password: event.detail }); },

  onSubmit() {
    const { studentId, password } = this.data;

    if (!studentId || !password) {
      Toast('学号和密码填写完整哦');
      return;
    }

    this.setData({ isSubmitting: true });

    // 呼叫云函数，执行纯粹的“验证登录”动作
    wx.cloud.callFunction({
      name: 'verifyJwcAccount', // 我们需要一个专门用来验证的云函数
      data: { studentId, password },
      success: res => {
        this.setData({ isSubmitting: false });
        
        if (res.result && res.result.success) {
          Toast.success('校园网认证成功！');
          wx.setStorageSync('jwc_account', {
            studentId: studentId,
            password: password
          });
        
          setTimeout(() => {
            wx.switchTab({ 
              url: '/pages/functions/functions',
            })
          }, 1500);
          
        } else {
          Toast.fail(res.result.msg || '认证失败，请检查账号密码');
        }
      },
      fail: err => {
        this.setData({ isSubmitting: false });
        Toast.fail('网络连接教务系统超时');
        console.error('云函数调用异常:', err);
      }
    });
  }
})