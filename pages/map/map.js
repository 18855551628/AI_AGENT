const QQMapWX = require('../../utils/qqmap-wx-jssdk.min.js');
let qqmapsdk;

Page({
  data: {
    selectedMarker: null,
    latitude: 37.997263, 
    longitude: 114.52069,
  
    markers: [
      {
        id: 0,
        latitude: 37.997214, 
        longitude: 114.517854,
        width: 30,
        height: 30,
        // iconPath: '/images/icon/location.png', // 如果没有图，这行删掉
        desc: '早上7点开放', // 自定义描述字段
        callout: {
          content: '图书馆',
          padding: 8,
          borderRadius: 4,
          display: 'ALWAYS', // 常显
          bgColor: '#ffffff',
          color: '#000000',
        }
      },
      {
        id: 1,
        latitude: 37.996975, 
        longitude: 114.513312,
        width: 30,
        height: 30,
        desc: '',
        callout: {
          content: '西门',
          padding: 8,
          borderRadius: 4,
          display: 'ALWAYS',
          bgColor: '#ffffff',
        }
      },
      {
        id: 2,
        latitude: 38.000571, 
        longitude: 114.520339,
        width: 30,
        height: 30,
        desc: '',
        callout: {
          content: '北门',
          padding: 8,
          borderRadius: 4,
          display: 'ALWAYS',
          bgColor: '#ffffff',
        }
      },
      {
        id: 3,
        latitude: 37.997541, 
        longitude: 114.527184,
        width: 30,
        height: 30,
        desc: '',
        callout: {
          content: '东门',
          padding: 8,
          borderRadius: 4,
          display: 'ALWAYS',
          bgColor: '#ffffff',
        }
      },
      {
        id: 4,
        latitude: 37.997694, 
        longitude: 114.51578,
        width: 30,
        height: 30,
        desc: '',
        callout: {
          content: '第四食堂｜第五食堂',
          padding: 8,
          borderRadius: 4,
          display: 'ALWAYS',
          bgColor: '#ffffff',
        }
      },
    ],
    // 2. 新增：用来存放路线的数据
    polyline: []
  },

  onLoad() {
    // 3. 实例化 SDK
    qqmapsdk = new QQMapWX({
      key: 'FHTBZ-JVA63-C7C32-OKRUO-A5IVQ-2UFKA' // 必填！！
    });

    // 进页面先定位到用户当前位置
    this.moveToCurrentLocation();
  },

  // 定位到当前位置
  moveToCurrentLocation() {
    const that = this;
    wx.getLocation({
      type: 'gcj02',
      success(res) {
        that.setData({
          latitude: res.latitude,
          longitude: res.longitude
        });
      }
    });
  },

  // 4. 点击标记点/列表项 -> 开始“画线导航”
  onMarkerTap(e) {
    const id = e.detail.markerId || e.currentTarget.dataset.id;
    const target = this.data.markers.find(item => item.id == id);
    if (target) {
      this.setData({
        selectedMarker: target,
        // 将地图中心移过去
        latitude: target.latitude,
        longitude: target.longitude
      });
    }
  },

  onListTap(e) {
    this.onMarkerTap(e);
  },
  startNavigation() {
    const target = this.data.selectedMarker;
    if (!target) return;
    
    // 这里调用你之前的腾讯地图 SDK 规划函数 (drawRoute)
    this.drawRoute(target.id); 
  },

  // 3. 关闭详情页
  closeDetail() {
    this.setData({
      selectedMarker: null,
      polyline: [] // 清除已有的路线
    });
  },

  // 5. 核心函数：计算并绘制路线
  drawRoute(markerId) {
    const that = this;
    // 找到目标点坐标
    const target = this.data.markers.find(item => item.id == markerId);
    if (!target) return;

    // 提示用户
    wx.showLoading({ title: '规划路线中...' });

    // 调用腾讯地图 SDK 的步行导航接口
    qqmapsdk.direction({
      mode: 'walking', // walking(步行), bicycling(骑行), driving(驾车)
      // from: '', // 不填默认就是当前用户位置
      to: {
        latitude: target.latitude,
        longitude: target.longitude
      },
      success: function (res) {
        console.log('规划成功', res);
        
        // 提取路线坐标点
        const coors = res.result.routes[0].polyline;
        const pl = [];
        
        // 坐标解压（腾讯地图返回的是压缩数据，需要解压）
        // 下面这段是官方解压算法，直接复制即可
        for (let i = 2; i < coors.length; i++) {
          coors[i] = coors[i - 2] + coors[i] / 1000000;
        }
        for (let i = 0; i < coors.length; i += 2) {
          pl.push({
            latitude: coors[i],
            longitude: coors[i + 1]
          });
        }

        // 设置到页面上，地图就会自动画线了！
        that.setData({
          polyline: [{
            points: pl, // 路线点数组
            color: '#3875FF', // 线的颜色（迪士尼蓝）
            width: 6, // 线的宽度
            arrowLine: true, // 线上面带箭头
            borderColor: '#2255BB', // 描边颜色
            borderWidth: 1
          }]
        });
      },
      fail: function (error) {
        console.error(error);
        if (error.status === 373) {
          wx.showModal({
            title: '距离太远啦',
            content: '起终点距离过长，无法规划步行路线。请确认您当前是否在校内。',
            showCancel: false, // 只有确定按钮
            confirmText: '我知道了',
            confirmColor: '#1890ff'
          })
        }else {
          wx.showToast({ 
            title: '规划失败: ' + (error.message || '未知错误'), 
            icon: 'none' 
          });
        }
      },
      complete: function () {
        wx.hideLoading();
      }
    });
  }
})