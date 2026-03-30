const db = wx.cloud.database()
const _ = db.command

Page({
  data: {
    posts: [],
    active: 'latest', // 当前选中的标签 name，默认是最新
    currentCategory: 'latest', // 用于存储当前的分类状态
    searchKeyword: '',
    movableX: 300, 
    movableY: 500,
    isFabOpen: false,
    page: 1,          // 当前请求的页码
    pageSize: 7,      // 每次加载的帖子数量
    hasMore: true,    // 是否还有更多数据
    isLoading: false
  },

  onLoad: function (options) {
    this.getForumPosts()
    const sys = wx.getSystemInfoSync();
    this.setData({
      movableX: sys.windowWidth - 80, // 屏幕宽 - 按钮宽 - 边距
      movableY: sys.windowHeight - 100 // 屏幕高 - 按钮高 - 底部Tab栏高度
    });
  },
  toggleFab() {
    this.setData({
      isFabOpen: !this.data.isFabOpen
    });
  },
  closeFab() {
    if (this.data.isFabOpen) {
      this.setData({ isFabOpen: false });
    }
  },
  // 发布 (跳转后要收起菜单)
  gotoPublish() {
    this.setData({ isFabOpen: false }); // 先收起
    wx.navigateTo({ url: '/pages/publish/publish' });
  },
  gotoMyLikes() {
    this.setData({ isFabOpen: false }); // 1. 先收起悬浮球菜单
    wx.navigateTo({
      url: '/pages/myLikes/myLikes' // 2. 跳转新页面
    });
  },

  gotoMyPosts(){
    this.setData({ isFabOpen: false }); // 1. 先收起悬浮球菜单
    wx.navigateTo({
      url: '/pages/myPosts/myPosts' // 2. 跳转新页面
    });
  },

  onShow: function(options){
    this.setData({ isFabOpen: false });
  },

  updateSinglePost(postId, newStatus, newLikeCount, newCommentCount) {
    const posts = this.data.posts;
    const index = posts.findIndex(p => p._id === postId);
    if (index !== -1) {
      this.setData({
        [`posts[${index}].isLiked`]: newStatus,
        [`posts[${index}].like_count`]: newLikeCount,
        [`posts[${index}].comment_count`]: newCommentCount
      });
    }
  },

  onSearchChange(e) {
    this.setData({
      searchKeyword: e.detail
    })
  },

  gotoDetail(e) {
    const postId = e.currentTarget.dataset.id;
    const isLiked = e.currentTarget.dataset.liked;
    wx.navigateTo({
      url: `/pages/postDetail/postDetail?id=${postId}&liked=${isLiked}`,
    });
  },

  onSearch() {
    this.setData({ posts: [], page: 1, hasMore: true });
    this.getForumPosts(this.data.currentCategory);
  },

  previewImage(e) {
    const current = e.currentTarget.dataset.current; // 当前点的哪张图
    const urls = e.currentTarget.dataset.urls;       // 这条帖子的所有图
    
    wx.previewImage({
      current: current, // 当前显示图片的http链接
      urls: urls        // 需要预览的图片http链接列表
    })
  },

  onClear() {
    this.setData({ searchKeyword: '', posts: [], page: 1, hasMore: true });
    this.getForumPosts(this.data.currentCategory);
  },

  onTabChange(e) {
    const category = e.detail.name; 
    this.setData({ currentCategory: category, posts: [], page: 1, hasMore: true });
    this.getForumPosts(category);
  },

 getForumPosts(category = 'latest', isPullDown = false, isLoadMore = false) {
    // 防抖：如果正在请求中，直接拦截
    if (this.data.isLoading) return;
    this.setData({ isLoading: true });

    if (!isPullDown && !isLoadMore) {
      wx.showLoading({ title: '加载中...' });
    }

    let query = db.collection('forum_posts');
    let conditions = {};

    if (category !== 'latest') {
      conditions.category = category;
    }
    if (this.data.searchKeyword) {
      conditions.content = db.RegExp({
        regexp: this.data.searchKeyword,
        options: 'i',
      });
    }
    if (Object.keys(conditions).length > 0) {
      query = query.where(conditions);
    }
    query.orderBy('isTop', 'desc').orderBy('createTime', 'desc')
      .skip((this.data.page - 1) * this.data.pageSize)
      .limit(this.data.pageSize)
      .get()
      .then(async res => {
        let newPosts = res.data;

        if (newPosts.length < this.data.pageSize) {
          this.setData({ hasMore: false });
        }

        if (newPosts.length === 0) {
           this.setData({ isLoading: false });
           if (isPullDown) { wx.stopPullDownRefresh(); wx.showToast({ title: '刷新成功', icon: 'none' }); }
           else { wx.hideLoading(); }
           return;
        }

        // --- 以下是你原有的点赞检测逻辑，保持不变 ---
        const postIds = newPosts.map(p => p._id);
        const likeResult = await db.collection('forum_likes').where({
          postId: _.in(postIds)
        }).get();
        const myLikedPostIds = new Set(likeResult.data.map(item => item.postId));

        const formattedPosts = newPosts.map(item => {
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
            isLiked: myLikedPostIds.has(item._id),
            timeString: this.calcTimeAgo(dateObj),
            tagName: config.name,
            tagStyle: `color: ${config.color}; background-color: ${config.bg};`
          }
        });

        // 🌟 核心数据合并逻辑 🌟
        // 如果是加载更多，就把新数据拼接到旧数组 (concat)；如果是刷新，就直接覆盖
        this.setData({
          posts: isLoadMore ? this.data.posts.concat(formattedPosts) : formattedPosts,
          page: this.data.page + 1,  // 成功后，将页码 +1，为下次滑动到底部做准备
          isLoading: false
        });
        
        if (isPullDown) {
          wx.stopPullDownRefresh();
          wx.showToast({ title: '刷新成功', icon: 'none' });
        } else {
          wx.hideLoading(); 
        }
      })
      .catch(err => {
        console.error("加载失败", err)
        this.setData({ isLoading: false });
        if (isPullDown) wx.stopPullDownRefresh();
        wx.hideLoading();
      })
  },

  async onLike(e) {
    // 1. 登录检查
    if (!wx.getStorageSync('user_info')) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    const index = e.currentTarget.dataset.idx;
    const posts = this.data.posts;
    const post = posts[index];
    const isLiked = post.isLiked;
    
    // --- 2. 乐观更新 (先改界面，让红心瞬间亮起/熄灭) ---
    const newStatus = !isLiked;
    const newCount = isLiked ? (post.like_count - 1) : ((post.like_count || 0) + 1);

    this.setData({
      [`posts[${index}].isLiked`]: newStatus,
      [`posts[${index}].like_count`]: newCount
    });

    // --- 3. 前端直连数据库处理逻辑 ---
    const db = wx.cloud.database();
    const _ = db.command;

    try {
      if (!isLiked) {
        // 【情况 B：没点赞过 -> 执行点赞逻辑】
        
        // 步骤 1: 添加点赞记录
        // 注意：小程序端 add 时，微信会自动把当前用户的 _openid 注入进去，所以不用手动写
        await db.collection('forum_likes').add({
          data: {
            postId: post._id,
            createTime: db.serverDate() 
          }
        });
        
        // 步骤 2: 帖子计数 +1 (使用 _.inc 原子操作防并发覆盖)
        await db.collection('forum_posts').doc(post._id).update({
          data: {
            like_count: _.inc(1)
          }
        });
        
      } else {
        // 【情况 A：已经点赞过 -> 执行取消逻辑】
        
        // 步骤 1: 先查出“我”给“这个帖子”的点赞记录 ID
        // 使用 '{openid}' 是微信小程序专属的占位符，它会自动替换成当前用户的真实 openid，绝对不会误删别人的赞
        const likeRes = await db.collection('forum_likes').where({
          postId: post._id,
          _openid: '{openid}' 
        }).get();

        if (likeRes.data.length > 0) {
          const likeRecordId = likeRes.data[0]._id;
          
          // 步骤 2: 删除找到的这条点赞记录
          await db.collection('forum_likes').doc(likeRecordId).remove();
          
          // 步骤 3: 帖子计数 -1
          await db.collection('forum_posts').doc(post._id).update({
            data: {
              like_count: _.inc(-1)
            }
          });
        }
      }
    } catch (err) {
      console.error('前端直连数据库操作失败', err);
      // 如果网络波动或者报错，执行失败回滚：把红心和数字变回原本的样子
      this.setData({
        [`posts[${index}].isLiked`]: isLiked,
        [`posts[${index}].like_count`]: post.like_count
      });
      wx.showToast({ title: '操作频繁，请稍后重试', icon: 'none' });
    }
  },

  calcTimeAgo(d) {
    if (!d) return '';
    const now = new Date().getTime();
    const time = d.getTime();
    const diff = (now - time) / 1000;

    if (diff < 60) return '刚刚';
    if (diff < 3600) return Math.floor(diff / 60) + '分钟前';
    if (diff < 86400) return Math.floor(diff / 3600) + '小时前';
    if (diff < 259200) return Math.floor(diff / 86400) + '天前';
    
    // 超过3天，显示具体日期
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  },
  // 跳转到发布页
  gotoPublish() {
    wx.navigateTo({
      url: '/pages/publish/publish', 
    })
  },
  
  // 下拉刷新
  onPullDownRefresh() {
    this.setData({ page: 1, hasMore: true });
    this.getForumPosts(this.data.currentCategory, true);
  },
  onReachBottom() {
    // 如果正在加载中，或者已经没有更多数据了，就不要再发请求了
    if (this.data.isLoading || !this.data.hasMore) return;
    this.getForumPosts(this.data.currentCategory, false, true);
  },
})