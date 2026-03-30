const db = wx.cloud.database()
const _ = db.command

Page({
  data: {
    posts: [],
    isLoading: false, // 改为 false，由请求方法统一控制
    page: 1,          // 当前请求的页码
    pageSize: 7,      // 每次加载的帖子数量
    hasMore: true     // 是否还有更多数据
  },


  onLoad: function () {
    this.getMyPosts();
  },

  onPullDownRefresh() {
    this.setData({ page: 1, hasMore: true, posts: [] });
    this.getMyPosts(false, true);
  },

  onReachBottom() {
    // 如果没有更多数据，或者正在加载中，则不发起请求
    if (!this.data.hasMore || this.data.isLoading) return;
    this.getMyPosts(true);
  },

  async getMyPosts(isLoadMore = false, isPullDown = false) {
    if (this.data.isLoading) return;
    this.setData({ isLoading: true });

    try {
      // 1. 强制获取真实的 OpenID
      const loginRes = await wx.cloud.callFunction({ name: 'login' });
      const myOpenid = loginRes.result.openid;

      // 2. 用真实的 OpenID 去查帖子表 (加入 skip 和 limit)
      const postsRes = await db.collection('forum_posts')
        .where({
          _openid: myOpenid 
        })
        .orderBy('createTime', 'desc') 
        .skip((this.data.page - 1) * this.data.pageSize) // 跳过已加载的数据
        .limit(this.data.pageSize) 
        .get();

      // 判断：如果取回来的数据不到 7 条，说明后面没数据了
      if (postsRes.data.length < this.data.pageSize) {
        this.setData({ hasMore: false });
      }

      // 如果本页一条帖子都没查到
      if (postsRes.data.length === 0) {
        this.setData({ isLoading: false });
        if (isPullDown) { wx.stopPullDownRefresh(); } else { wx.hideLoading(); }
        return;
      }

      // 3. 查一下这些帖子里，我点赞过哪些 (为了显示红心状态)
      const postIds = postsRes.data.map(item => item._id);
      const likeRes = await db.collection('forum_likes').where({
        postId: _.in(postIds),
        _openid: myOpenid // 这里也用真实的 OpenID
      }).get();
      
      const myLikedSet = new Set(likeRes.data.map(item => item.postId));

      // 4. 格式化数据
      const formattedPosts = postsRes.data.map(item => {
        let dateObj = new Date(item.createTime);
        const categoryConfig = {
          'love': { name: '表白', color: '#ff4d4f', bg: '#fff0f0' },
          'help': { name: '求助', color: '#1890ff', bg: '#e6f7ff' },
          'speak': { name: '吐槽', color: '#fa8c16', bg: '#fff7e6' },
          'ask': { name: '提问', color: '#fa8c16', bg: '#cbcbcb' },
          'other': { name: '日常', color: '#52c41a', bg: '#f6ffed' }
        };
        const config = categoryConfig[item.category] || categoryConfig['other'];

        return {
          ...item,
          isLiked: myLikedSet.has(item._id), 
          timeString: this.calcTimeAgo(dateObj),
          tagName: config.name,
          tagStyle: `color: ${config.color}; background-color: ${config.bg};`
        }
      });

      this.setData({
        posts: isLoadMore ? this.data.posts.concat(formattedPosts) : formattedPosts,
        page: this.data.page + 1, // 页码 + 1
        isLoading: false
      });

      if (isPullDown) {
        wx.stopPullDownRefresh();
        wx.showToast({ title: '刷新成功', icon: 'none' });
      } else {
      }

    } catch (err) {
      console.error("加载我的发布失败", err);
      this.setData({ isLoading: false });
      if (isPullDown) wx.stopPullDownRefresh();
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  // 预览图片
  previewImage(e) {
    const current = e.currentTarget.dataset.current;
    const urls = e.currentTarget.dataset.urls;
    wx.previewImage({ current, urls });
  },

  // 格式化时间
  calcTimeAgo(d) {
    if (!d) return '';
    const now = new Date().getTime();
    const time = d.getTime();
    const diff = (now - time) / 1000;
    if (diff < 60) return '刚刚';
    if (diff < 3600) return Math.floor(diff / 60) + '分钟前';
    if (diff < 86400) return Math.floor(diff / 3600) + '小时前';
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  },

  // 跳转详情页
  gotoDetail(e) {
    const postId = e.currentTarget.dataset.id;
    const isLiked = e.currentTarget.dataset.liked;
    wx.navigateTo({
      url: `/pages/postDetail/postDetail?id=${postId}&liked=${isLiked}`,
    });
  },
})