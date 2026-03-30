Page({
  data: {
    myPoints: 0,
    // 核心商品库
    productList: [],
  },

  onLoad() {
    this.fetchGoodsList();
  },

  async fetchGoodsList() {
    wx.showLoading({ title: '加载商品中...', mask: true });
    try {
      const db = wx.cloud.database();
      
      // 1. 获取 goods_list 集合中的所有商品
      const res = await db.collection('goods_list').get();
      const goodsList = res.data;
      // 使用 db.command.count() 效率最高，不会受到单次 get() 20条记录的限制
      const listWithCountPromises = goodsList.map(async (item) => {
        try {
          const countRes = await db.collection('user_items').where({
            itemId: item.id,
            status: 'active' // 之前云函数里写入的状态
          }).count();
          
          return {
            ...item,
            ownedCount: countRes.total // 将数量挂载到商品对象上
          };
        } catch (err) {
          console.error(`查询 ${item.name} 数量失败`, err);
          return { ...item, ownedCount: 0 };
        }
      });
      const finalProductList = await Promise.all(listWithCountPromises);

      this.setData({ 
        productList: finalProductList 
      });
      
      wx.hideLoading();
    } catch (err) {
      console.error('获取商品列表失败', err);
      wx.hideLoading();
      wx.showToast({ title: '商品加载失败', icon: 'none' });
    }
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
  },

  // 进商城必须查实时的云端余额
  async fetchRealTimePoints() {
    // console.log("调用了函数")
    const accountInfo = wx.getStorageSync('user_info');
    if (!accountInfo) {
      this.setData({ myPoints: 0 });
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

  handleBuy(e) {
    const item = e.currentTarget.dataset.item;

    if (this.data.myPoints < item.price) {
      wx.showToast({ title: '积分不足哦，快去签到攒积分吧~', icon: 'none' });
      return;
    }

    wx.showModal({
      title: '确认兑换',
      content: `确定要花费 ${item.price} 积分兑换【${item.name}】吗？`,
      confirmColor: '#4F7BFC', // 确认按钮依然保持你的主题色
      success: (res) => {
        if (res.confirm) {
          // 用户点击了确定，执行扣费逻辑
          this.executePurchase(item);
        }
      }
    });
  },

  //触发云函数执行购买 (防止前端改数据作弊)
  executePurchase(item) {
    wx.showLoading({ title: '正在兑换...', mask: true });
    
    // 我们将在下一步写这个云函数 buyItem
    wx.cloud.callFunction({
      name: 'buyItem',
      data: { itemId: item.id },
      success: res => {
        wx.hideLoading(); // 必须手动关掉 loading
        if (res.result && res.result.success) {
          wx.showToast({ title: '兑换成功！', icon: 'success' });
          
          // 购买成功后，立刻扣除页面上显示的余额
          const newPoints = this.data.myPoints - item.price;
          const index = this.data.productList.findIndex(p => p.id === item.id);
          const currentCount = this.data.productList[index].ownedCount || 0;
          this.setData({
            myPoints: newPoints,
            [`productList[${index}].ownedCount`]: currentCount + 1 
          });
          
          // 更新当前页面的积分缓存，防止再次 onShow 时读取到旧缓存
          wx.setStorageSync('my_current_points', newPoints);
          
          // 同时我们要顺手清空首页的积分缓存，让首页下次进去时重新查新余额
          wx.removeStorageSync('point_data_cache');
        } else {
          wx.showToast({ title: res.result.msg || '兑换失败', icon: 'none' });
        }
      },
      fail: err => {
        wx.hideLoading();
        wx.showToast({ title: '网络异常，请重试', icon: 'none' });
        console.error(err);
      }
    });
  }
});