// app.js
App({
  onLaunch: function () {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
    } else {
      // ✅ 核心代码在这里：初始化云开发能力
      wx.cloud.init({
        env: 'cloud1-9gk9eodofe81f8b6', 
        traceUser: true,
      })
    }
    this.globalData = {}
  },
})
