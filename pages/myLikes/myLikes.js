const db = wx.cloud.database()
const _ = db.command

Page({
  data: {
    posts: [],
    isLoading: false,
    page: 1,          // 当前请求的页码
    pageSize: 7,      // 每次加载的帖子数量
    hasMore: true,    // 是否还有更多数据
  },

  onLoad: function () {
    this.getMyLikes();
  },

  onPullDownRefresh() {
    this.setData({ page: 1, hasMore: true, posts: [] });
    this.getMyLikes(false, true);
  },

  onReachBottom() {
    if (!this.data.hasMore || this.data.isLoading) return;
    this.getMyLikes(true);
  },

  async getMyLikes(isLoadMore = false, isPullDown = false) {
    if (this.data.isLoading) return;
    this.setData({ isLoading: true });

    try {
      // 1. 查点赞表 (这里加上核心的 skip 和 limit 分页)
      const likeRes = await db.collection('forum_likes')
        .orderBy('createTime', 'desc') 
        .skip((this.data.page - 1) * this.data.pageSize) // 跳过已经加载的
        .limit(this.data.pageSize) // 每次只取 7 条
        .get();

      // 判断：如果取回来的数据不到 7 条，说明后面没有数据了
      if (likeRes.data.length < this.data.pageSize) {
        this.setData({ hasMore: false });
      }

      // 如果本页一条赞都没查到
      if (likeRes.data.length === 0) {
        this.setData({ isLoading: false });
        if (isPullDown) { wx.stopPullDownRefresh(); } else { wx.hideLoading(); }
        return;
      }

      // 提取出所有的 postId
      const likedPostIds = likeRes.data.map(item => item.postId);

      // 2. 查帖子表：根据 ID 列表查详情
      const postsRes = await db.collection('forum_posts')
        .where({
          _id: _.in(likedPostIds) // 查这些 ID 的帖子
        })
        .get();

      // 3. 格式化数据
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
          isLiked: true, // 在这肯定点过赞
          timeString: this.calcTimeAgo(dateObj),
          tagName: config.name,
          tagStyle: `color: ${config.color}; background-color: ${config.bg};`
        }
      });

      // 4. 前端排序：让最近点赞的排在前面（因为 IN 查询不保证顺序）
      const sortedPosts = [];
      likedPostIds.forEach(id => {
        const post = formattedPosts.find(p => p._id === id);
        if (post) sortedPosts.push(post);
      });

      // 如果是加载更多，就把新数据拼接到原数组后面
      this.setData({
        posts: isLoadMore ? this.data.posts.concat(sortedPosts) : sortedPosts,
        page: this.data.page + 1, // 页码 + 1
        isLoading: false
      });

      if (isPullDown) {
        wx.stopPullDownRefresh();
        wx.showToast({ title: '刷新成功', icon: 'none' });
      } else {
       
      }

    } catch (err) {
      console.error("加载喜欢列表失败", err);
      this.setData({ isLoading: false });
      if (isPullDown) wx.stopPullDownRefresh();
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  async onUnlike(e) {
    const index = e.currentTarget.dataset.idx;
    const post = this.data.posts[index];
    wx.showModal({
      title: '提示',
      content: '确定取消喜欢吗？',
      confirmColor: '#ee0a24',
      success: async (res) => {
        if (res.confirm) {
          
          // 1. 【当前页面秒删】
          const newPosts = [...this.data.posts];
          newPosts.splice(index, 1);
          this.setData({ posts: newPosts });

          //  2. 无感同步论坛主页
          const pages = getCurrentPages();
          if (pages.length >= 2) {
            // 获取上一页的实例 (通常就是论坛主页)
            const prevPage = pages[pages.length - 2]; 
            // 如果上一页有 updateSinglePost 这个方法，就调用它
            if (prevPage && prevPage.updateSinglePost) {
              // 计算新的点赞数 (最小为0)
              const newLikeCount = Math.max(0, (post.like_count || 1) - 1);
              // 传参：帖子ID, 是否点赞(false), 新点赞数, 评论数保持不变
              prevPage.updateSinglePost(post._id, false, newLikeCount, post.comment_count);
            }
          }

          // 3. 【数据库后台静默处理】
          const db = wx.cloud.database();
          const _ = db.command;

          try {
            const likeRes = await db.collection('forum_likes').where({
              postId: post._id
            }).get();

            if (likeRes.data.length > 0) {
              const likeRecordId = likeRes.data[0]._id;
              await db.collection('forum_likes').doc(likeRecordId).remove();
              await db.collection('forum_posts').doc(post._id).update({
                data: { like_count: _.inc(-1) }
              });
            }
          } catch (err) {
            console.error('后台静默取消点赞失败', err);
          }
        }
      }
    });
  },

  previewImage(e) {
    const current = e.currentTarget.dataset.current;
    const urls = e.currentTarget.dataset.urls;
    wx.previewImage({ current, urls });
  },

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
  gotoDetail(e) {
    const postId = e.currentTarget.dataset.id;
    const isLiked = e.currentTarget.dataset.liked;
    wx.navigateTo({
      url: `/pages/postDetail/postDetail?id=${postId}&liked=${isLiked}`,
    });
  },
})