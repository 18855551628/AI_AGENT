//删除帖子数据

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { postId } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  try {
    // 1. 获取帖子信息 (为了拿到帖子图片 & 验证权限)
    const postRes = await db.collection('forum_posts').doc(postId).get()
    const post = postRes.data

    // 安全校验：只有作者自己才能删 (防止有人调用云函数搞破坏)
    if (post._openid !== openid) {
      return { success: false, msg: '无权删除' }
    }

    // 2. 获取该帖子下的所有评论 (为了拿到评论图片 & 评论ID)
    // 提示：如果评论极其多(几千条)，这里可能需要分批处理，但一般校园网够用了
    const commentsRes = await db.collection('forum_comments').where({
      postId: postId
    }).limit(1000).get()
    
    const comments = commentsRes.data

    // 3. 收集所有需要删除的图片 fileID (帖子图 + 评论图)
    let allFileIds = []
    
    // 3.1 帖子的图
    if (post.images && post.images.length > 0) {
      allFileIds = allFileIds.concat(post.images)
    }

    // 3.2 评论的图
    const commentIds = []
    comments.forEach(c => {
      commentIds.push(c._id) // 顺便收集评论ID，后面删点赞用
      if (c.images && c.images.length > 0) {
        allFileIds = allFileIds.concat(c.images)
      }
    })

    // 4. 【核心】从云存储彻底删除文件
    if (allFileIds.length > 0) {
      await cloud.deleteFile({
        fileList: allFileIds
      })
    }

    // 5. 【核心】从数据库彻底删除记录 (并行执行提速)
    const tasks = [
      // A. 删帖子本体
      db.collection('forum_posts').doc(postId).remove(),
      // B. 删该帖子的所有评论
      db.collection('forum_comments').where({ postId: postId }).remove(),
      // C. 删该帖子的所有点赞记录
      db.collection('forum_likes').where({ postId: postId }).remove(),
    ]

    // D. 删评论的点赞记录 (如果有评论的话)
    if (commentIds.length > 0) {
      tasks.push(
        db.collection('forum_comment_likes').where({
          commentId: _.in(commentIds)
        }).remove()
      )
    }

    await Promise.all(tasks)

    return { success: true }

  } catch (e) {
    console.error(e)
    return { success: false, errMsg: e }
  }
}