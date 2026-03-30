const db = wx.cloud.database()
const _ = db.command

Page({
  data: {
    post: null, // 存放帖子详情
    userInfo: {}, // 当前登录用户信息（用于底部头像）
    postId: '',
    showMenu: false,
    menuActions: [
    ],
    showCommentPopup: false, // 控制弹窗显示
    commentContent: '',      // 评论文字
    fileList: [],            // 评论图片列表
    isSubmitting: false, // 防止重复点击
    comments: [],
    myOpenid: '', // 用于存当前用户的ID
    showCommentMenuPopup: false,
    commentActions: [],
    currentCommentItem: null, // 当前操作的评论对象
    canDelete: false,
    placeholder: '友善发言是美德...', // 动态输入框提示
    replyToComment: null,           // 记录当前正在回复的评论对象
    commentSort: 'time'
  },

  onLoad: function (options) {
    // 1. 获取 ID
    if (options.id) {
      this.setData({ postId: options.id });
      // 2. 【关键】先根据传过来的参数，设置一个临时的点赞状态
      // 这样用户一点进来，心就是红的，不用等数据库返回，体验更好
      const isLikedStr = options.liked; 
      const isLiked = (isLikedStr === 'true'); // 字符串转布尔值
      
      // 这里的 post 可能还没加载完，先存一个空对象占位，把 isLiked 放进去
      this.setData({
        post: { isLiked: isLiked } 
      });

      // 3. 去数据库查详情（含真实点赞状态）
      this.getPostDetail(options.id);
      
      // 4. 加载评论
      this.getComments(options.id);
      this.getOpenIdAndComments(options.id);
    }
    
    // 获取用户信息
    const user = wx.getStorageSync('user_info');
    if (user) {
      this.setData({ userInfo: user });
    }
  },
  
  
  getOpenIdAndComments(postId) {
    wx.cloud.callFunction({
      name: 'login', // 使用云开发默认的 login 函数
      data: {}
    }).then(res => {
      this.setData({ myOpenid: res.result.openid });
      this.getComments(postId); // 拿到ID后再去加载评论
    }).catch(err => {
      console.error('获取OpenID失败', err);
      // 即使失败也尝试加载评论，只是不能删除
      this.getComments(postId);
    });
  },

  onFocusInput() {
    if (!this.data.userInfo.nickName) {
       return wx.showToast({ title: '请先登录', icon: 'none' });
    }
    this.setData({ 
      showCommentPopup: true,
      replyToComment: null, // 确保这里是 null，代表评论帖子本身
      placeholder: '说点什么吧...' // 恢复默认提示
    });
  },

  // 2. 关闭弹窗
  onCloseComment() {
    this.setData({ 
      showCommentPopup: false,
      replyToComment: null, // 关闭时也清空
      placeholder: '说点什么吧...'
    });
  },

  // 3. 监听输入
  onInputComment(e) {
    this.setData({ commentContent: e.detail.value });
  },

  afterRead(event) {
    const { file } = event.detail;
    // 当设置 mutiple 为 true 时, file 是数组格式，否则是对象
    const fileList = this.data.fileList;
    fileList.push({ ...file, url: file.url });
    this.setData({ fileList });
  },

  // 2. 删除图片
  deleteImg(event) {
    const { index } = event.detail;
    const fileList = this.data.fileList;
    fileList.splice(index, 1);
    this.setData({ fileList });
  },


  async submitComment() {
    const content = this.data.commentContent.trim();
    const fileList = this.data.fileList;

    if (!content && fileList.length === 0) {
      return wx.showToast({ title: '写点什么或发张图吧', icon: 'none' });
    }

    this.setData({ isSubmitting: true });

    try {
      let imageFileIds = [];
      if (fileList.length > 0) {
        const uploadTasks = fileList.map((file) => {
          const suffix = file.url.match(/\.[^.]+?$/)[0];
          return wx.cloud.uploadFile({
            cloudPath: `comment_imgs/${Date.now()}-${Math.random()}${suffix}`,
            filePath: file.url,
          });
        });
        const uploadResults = await Promise.all(uploadTasks);
        imageFileIds = uploadResults.map(res => res.fileID);
      }

      const userInfo = wx.getStorageSync('user_info');
      
      // 处理回复目标 (保持不变)
      let parentId = null;
      let replyToName = null;
      if (this.data.replyToComment) {
        parentId = this.data.replyToComment.parentId;
        if (this.data.replyToComment.isReplyToSub) {
          replyToName = this.data.replyToComment.nickName;
        }
      }
      await db.collection('forum_comments').add({
        data: {
          postId: this.data.postId,
          parentId: parentId,           
          replyToName: replyToName,     
          content: content,
          images: imageFileIds,
          nickName: userInfo.nickName,
          avatarUrl: userInfo.originalAvatarUrl,
          createTime: db.serverDate(),
          like_count: 0,
        }
      });

      wx.cloud.callFunction({ 
        name: 'incCommentCount', 
        data: { postId: this.data.postId, value: 1 } 
      }).catch(err => console.error(err));
      if (this.data.post && this.data.post._openid && this.data.post._openid !== this.data.myOpenid) {
        console.log('正在发送通知给:', this.data.post._openid);
        wx.cloud.callFunction({
          name: 'sendNotification',
          data: {
            toUser: this.data.post._openid, // 发给帖子作者
            postId: this.data.postId,
            content: content || '[图片]',   // 评论内容
            nickName: userInfo.nickName,    // 我的名字
            avatarUrl: userInfo.avatarUrl,  // 我的头像
            postContent: this.data.post.content // 告诉他评论了哪条帖子
          }
        }).then(res => console.log('通知发送结果', res));
      } else {
        console.log('无需发送通知：是自己评论');
      }
      wx.showToast({ title: '发表成功', icon: 'success' });
      this.setData({
        showCommentPopup: false,
        commentContent: '',
        fileList: [],
        replyToComment: null,
        placeholder: '友善发言是美德...',
        isSubmitting: false,
        ['post.comment_count']: (this.data.post.comment_count || 0) + 1
      });

      this.getComments();

    } catch (err) {
      console.error('评论失败', err);
      wx.showToast({ title: '发布失败，请重试', icon: 'none' });
      this.setData({ isSubmitting: false });
    }
  },

  // 【新增】显示菜单
  showMenu() {
    // 获取当前帖子信息和我的OpenID
    const post = this.data.post;
    const myOpenid = this.data.myOpenid;
    
    let actions = [];

    // 判断权限：如果帖子作者是我
    if (post && post._openid === myOpenid) {
      actions = [
        {name:'置顶', color:'#0066ff'} ,
        { name: '删除', color: '#ee0a24' }
      ];
    } else {
      // 如果不是我，显示举报
      actions = [
        { name: '举报' }
      ];
    }

    this.setData({ 
      showMenu: true,
      menuActions: actions
    });
  },

  // 【新增】关闭菜单
  onCloseMenu() {
    this.setData({ showMenu: false });
  },

  // 【新增】选中菜单项
  onSelectMenu(e) {
    const name = e.detail.name;
    if (name === '举报') {
      wx.showToast({
        title: '举报已提交，我们会尽快处理',
        icon: 'none',
        duration: 2000
      });
    }else if (name === '删除') {
      this.deletePost();
    }else if(name==='置顶') {
      this.handleUseTopCard()
    }
    this.onCloseMenu();
  },

  handleUseTopCard() {
    const postId = this.data.postId;
    wx.showModal({
      title: '提示',
      content: '你确定要消耗一张置顶卡，将该帖子置顶 24 小时吗？',
      confirmColor: '#ee0a24', 
      success: (res) => {
        if (res.confirm) {
          wx.cloud.callFunction({
            name: 'useTopCard',
            data: { 
              postId: postId,
              itemId: 'item_top_card' 
            },
            success: cloudRes => {
              if (cloudRes.result && cloudRes.result.success) {
                wx.showToast({ title: '置顶成功！', icon: 'success' });
                
              } else {
                wx.showToast({ title: cloudRes.result.msg || '置顶失败', icon: 'none' });
              }
            },
            fail: err => {
              wx.showToast({ title: '网络异常，请重试', icon: 'none' });
              console.error('置顶调用失败：', err);
            }
          });
        } else if (res.cancel) {
          console.log('取消了置顶操作');
        }
      }
    });
  },

  deletePost() {
    wx.showModal({
      title: '警告',
      content: '确定要删除这条帖子吗？不可恢复。',
      confirmColor: '#ee0a24',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...' });
          try {
            // 1. 删除数据库里的帖子记录
            await db.collection('forum_posts').doc(this.data.postId).remove();

           //调用云函数删除关联的评论和图片，防止产生垃圾数据
            await wx.cloud.callFunction({ name: 'deletePostData', data: { postId: this.data.postId } })

            wx.hideLoading();
            wx.showToast({ title: '已删除', icon: 'success' });

            // 3. 延迟一秒返回上一页 (论坛列表页)
            setTimeout(() => {
              wx.navigateBack({
                delta: 1
              });
            }, 1000);

          } catch (err) {
            console.error('删除帖子失败', err);
            wx.hideLoading();
            wx.showToast({ title: '删除失败，请重试', icon: 'none' });
          }
        }
      }
    })
  },

  // 获取帖子详情
  async getPostDetail(id) {
    try {
      // 1. 并行查询：同时查帖子详情 AND 查我是否点过赞
      const postPromise = db.collection('forum_posts').doc(id).get();
      
      // 查 forum_likes 表，条件是：postId 是这个帖子，且 _openid 是我自己
      // (云开发会自动给查询加上 _openid: '{我的ID}' 的隐式条件)
      const likePromise = db.collection('forum_likes').where({
        postId: id
      }).count();

      const [postRes, likeRes] = await Promise.all([postPromise, likePromise]);

      let post = postRes.data;

      // 2. 处理数据
      post.timeString = this.formatTime(new Date(post.createTime));
      const categoryConfig = {
        'love': '表白', 'help': '求助', 'speak': '吐槽', 
        'ask': '提问', 'other': '日常'
      };
      post.tagName = categoryConfig[post.category] || '日常';

      // 3. 【关键】如果 count > 0，说明我点赞过
      // likeRes.total 是符合条件的记录数
      post.isLiked = likeRes.total > 0;

      this.setData({ post: post });

      // 增加阅读量（静默调用）
      // wx.cloud.callFunction({ name: 'incView', data: { postId: id } }).catch(()=>{});

    } catch (err) {
      console.error(err);
      wx.showToast({ title: '帖子加载出错', icon: 'none' });
    }
  },

  async getComments(postId) {
    const id = postId || this.data.postId;
    const sortType = this.data.commentSort || 'time';
    try {
      let query = db.collection('forum_comments').where({ postId: id });
      
      // 根据不同状态调整排序策略
      if (sortType === 'hot') {
        // 最热：先按点赞数降序，遇到点赞一样多的，再按时间降序
        query = query.orderBy('like_count', 'desc').orderBy('createTime', 'desc');
      } else {
        // 最新：只按时间降序
        query = query.orderBy('createTime', 'desc');
      }

      const res = await query.get();
      let list = res.data;
      if (list.length > 0) {
        const commentIds = list.map(item => item._id);
        const likeRes = await db.collection('forum_comment_likes').where({
          commentId: _.in(commentIds)
        }).get();
        const myLikedSet = new Set(likeRes.data.map(item => item.commentId));

        // 分离主评论和回复
        let mainComments = [];
        let repliesMap = {};

        list.forEach(item => {
          item.isLiked = myLikedSet.has(item._id);
          item.timeString = this.formatTime(item.createTime);

          if (item.parentId) {
            // 这是个回复
            if (!repliesMap[item.parentId]) repliesMap[item.parentId] = [];
            repliesMap[item.parentId].push(item);
          } else {
            // 这是主评论
            mainComments.push(item);
          }
        });

        // 将回复按时间正序排列（最老的在最上面，符合盖楼习惯），并塞入对应的主评论中
        for (let key in repliesMap) {
          repliesMap[key].sort((a, b) => new Date(a.createTime) - new Date(b.createTime));
        }

        mainComments.forEach(item => {
          item.replies = repliesMap[item._id] || [];
        });

        this.setData({ comments: mainComments });
      } else {
        this.setData({ comments: [] });
      }
    } catch (err) {
      console.error('加载评论失败', err);
    }
  },
  
  // 简单的增加阅读量
  // incrementView(id) {
  //   wx.cloud.callFunction({
  //     name: 'incView', // 你需要写一个云函数来做这个，或者暂时不做
  //     data: { postId: id }
  //   }).catch(e => {}) // 静默失败
  // },


  // 格式化时间
  formatTime(d) {
    const now = new Date();
    const diff = (now - d) / 1000;
    if (diff < 60) return '刚刚';
    if (diff < 3600) return Math.floor(diff / 60) + '分钟前';
    if (diff < 86400) return Math.floor(diff / 3600) + '小时前';
    return `${d.getMonth() + 1}-${d.getDate()}`;
  },

  // 预览图片
  previewImage(e) {
    const current = e.currentTarget.dataset.current;
    wx.previewImage({
      current: current,
      urls: this.data.post.images
    })
  },
// 预览评论里的图片
previewCommentImage(e) {
  const urls = e.currentTarget.dataset.urls;
  const current = e.currentTarget.dataset.current;
  wx.previewImage({
    urls: urls,
    current: current
  });
},
  // 点击点赞
  onLike() {
    if (!this.data.post) return;
    const post = this.data.post;
    const isLiked = this.data.post.isLiked;
    // 乐观更新
    this.setData({
      ['post.isLiked']: !isLiked,
      ['post.like_count']: isLiked ? (this.data.post.like_count - 1) : ((this.data.post.like_count || 0) + 1)
    });
    // 这里应该调用云函数 toggleLike，跟列表页一样
    wx.cloud.callFunction({
      name: 'toggleLike',
      data: {
        postId: post._id
      }
    }).then(res => {
      // 如果云函数报错或逻辑失败（极少情况），这里可以考虑回滚界面
      if (!res.result.success) {
        console.error('点赞失败', res);
        // 失败回滚（可选）
        this.setData({
          [`posts[${index}].isLiked`]: isLiked,
          [`posts[${index}].like_count`]: post.like_count
        });
        wx.showToast({ title: '操作失败', icon: 'none' });
      }
    }).catch(err => {
      console.error('调用云函数失败', err);
      // 失败回滚（可选）
      this.setData({
        [`posts[${index}].isLiked`]: isLiked,
        [`posts[${index}].like_count`]: post.like_count
      });
    });
  },

  //评论点赞
  async onLikeComment(e) {
    if (!wx.getStorageSync('user_info')) return wx.showToast({ title: '请先登录', icon: 'none' });

    const parentIdx = e.currentTarget.dataset.parentIdx;
    const replyIdx = e.currentTarget.dataset.replyIdx;
    const commentId = e.currentTarget.dataset.id;
    
    // 区分是点赞主评论还是子回复
    let item;
    if (replyIdx !== undefined) {
      item = this.data.comments[parentIdx].replies[replyIdx];
    } else {
      item = this.data.comments[parentIdx];
    }

    const isLiked = item.isLiked;
    const newStatus = !isLiked;
    const newCount = isLiked ? (item.like_count - 1) : ((item.like_count || 0) + 1);
    
    // 更新本地 UI 数据
    if (replyIdx !== undefined) {
      this.setData({
        [`comments[${parentIdx}].replies[${replyIdx}].isLiked`]: newStatus,
        [`comments[${parentIdx}].replies[${replyIdx}].like_count`]: newCount
      });
    } else {
      this.setData({
        [`comments[${parentIdx}].isLiked`]: newStatus,
        [`comments[${parentIdx}].like_count`]: newCount
      });
    }

    // 更新数据库
    try {
      if (newStatus) {
        await db.collection('forum_comment_likes').add({ data: { commentId } });
        wx.cloud.callFunction({ name: 'updateCommentLike', data: { commentId: commentId, mode: 'like' } });
      } else {
        await db.collection('forum_comment_likes').where({ commentId }).remove();
        wx.cloud.callFunction({ name: 'updateCommentLike', data: { commentId: commentId, mode: 'unlike' } });
      }
    } catch (err) { console.error('点赞失败', err); }
  },

  // 【新增】点击右下角三个点
  showCommentMenu(e) {
    const item = e.currentTarget.dataset.item;
    
    // 判断权限：我是评论作者 OR 我是帖子作者
    const isMyComment = (item._openid === this.data.myOpenid);
    const isMyPost = (this.data.post._openid === this.data.myOpenid);
    
    this.setData({
      showCommentMenuPopup: true,
      currentCommentItem: item,
      canDelete: isMyComment || isMyPost
    });
  },

  // 关闭菜单
  onCloseCommentMenu() {
    this.setData({ showCommentMenuPopup: false });
  },

  onMenuCopy() {
    wx.setClipboardData({
      data: this.data.currentCommentItem.content,
      success: () => {
        this.onCloseCommentMenu();
        wx.showToast({ title: '已复制' });
      }
    });
  },

  onMenuReply() {
    this.onCloseCommentMenu();
    const target = this.data.currentCommentItem;
    
    // 【关键新增】判断是在回复主评论，还是在回复别人盖的子楼层
    const isReplyToSub = !!target.parentId; 
    // 统一挂载到主评论的 ID 下
    const parentId = target.parentId ? target.parentId : target._id;

    this.setData({
      showCommentPopup: true,
      replyToComment: {
        parentId: parentId,
        nickName: target.nickName,
        isReplyToSub: isReplyToSub // 记录是否为子回复
      },
      placeholder: `回复 @${target.nickName}：`
    });
  },

  onMenuReport() {
    this.onCloseCommentMenu();
    wx.showToast({ title: '举报已提交', icon: 'success' });
  },

  // 选中菜单项
  onSelectCommentMenu(e) {
    const name = e.detail.name;
    const comment = this.data.currentCommentItem;

    if (name === '删除') {
      this.deleteComment(comment._id);
    } else if (name === '举报') {
      wx.showToast({ title: '举报成功', icon: 'success' });
    }
    this.onCloseCommentMenu();
  },

  // 【新增】删除评论逻辑
  // 5. 菜单动作 - 删除
  onMenuDelete() {
    this.onCloseCommentMenu();
    const commentId = this.data.currentCommentItem._id;
    
    wx.showModal({
      title: '提示',
      content: '确定删除这条评论吗？',
      success: async (res) => {
        if (res.confirm) {
          this.deleteCommentLogic(commentId);
        }
      }
    });
  },

  async deleteCommentLogic(commentId) {
    wx.showLoading({ title: '删除中' });
    try {
      const target = this.data.currentCommentItem;
      
      // 🌟 核心修复 1：计算真正需要删除的评论总数
      let deleteCount = 1; // 默认删除自身这 1 条
      // 如果删除的是主评论（没有 parentId），并且它携带了子回复
      if (!target.parentId && target.replies && target.replies.length > 0) {
        deleteCount += target.replies.length;
      }

      // 2：智能分发删除任务
      // ⚠️ 极其重要：如果带有子回复，哪怕主评论是你发的，前端也无权删除别人盖楼的子回复！
      // 所以只要有盖楼（deleteCount > 1），或者是不是自己的评论，统统交给云函数。
      if (target._openid === this.data.myOpenid && deleteCount === 1) {
        // 只有在确定是“自己发的”且“没有子回复”的孤立评论时，前端直连删除才安全
        await db.collection('forum_comments').doc(commentId).remove();
      } else {
        // 交给云函数进行“拔出萝卜带出泥”的级联删除
        await wx.cloud.callFunction({ name: 'deleteComment', data: { commentId: commentId } });
      }
      
      // 3：动态减去实际删除的数量 (传入 -deleteCount)
      await wx.cloud.callFunction({ 
        name: 'incCommentCount', 
        data: { postId: this.data.postId, value: -deleteCount } 
      });

      wx.hideLoading();
      wx.showToast({ title: '已删除' });
      
      // 更新页面 UI 显示的总数量 (防止减成负数)
      const currentTotal = this.data.post.comment_count || 1;
      this.setData({ 
        ['post.comment_count']: Math.max(0, currentTotal - deleteCount) 
      });
      
      // 删除完毕直接重新加载评论
      this.getComments(); 

    } catch (err) {
      console.error('删除评论失败', err);
      wx.hideLoading();
      wx.showToast({ title: '删除失败', icon: 'none' });
    }
  },

  onUnload: function () {
    const pages = getCurrentPages();
    const prevPage = pages[pages.length - 2];
    if (prevPage && this.data.post) {
      if (prevPage.updateSinglePost) {
        prevPage.updateSinglePost(
          this.data.post._id,           // 帖子ID
          this.data.post.isLiked,       // 最新点赞状态
          this.data.post.like_count,    // 最新点赞数
          this.data.post.comment_count,  // 最新评论数
          this.data.post.isTop
        );
      }
    }
  },

  // 新增：切换评论排序方式
  switchCommentSort(e) {
    const type = e.currentTarget.dataset.type;
    // 如果点的就是当前选中的，啥也不做
    if (this.data.commentSort === type) return; 
    
    this.setData({ commentSort: type });

    
    // 重新去查一遍评论
    this.getComments()
  },
})