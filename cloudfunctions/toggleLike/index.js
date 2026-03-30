const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { postId } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  try {
    // 1. 先查询是否已经点赞过
    const likeRecord = await db.collection('forum_likes').where({
      postId: postId,
      _openid: openid
    }).get()

    if (likeRecord.data.length > 0) {
      // --- 情况A：已经点赞过 -> 执行取消逻辑 ---
      
      // 1. 删除点赞记录
      // (注意：云函数里删除需要带上记录的_id或者更具体的条件，虽然where也能删但建议先查再删更稳，这里偷懒用where删)
      await db.collection('forum_likes').where({
        postId: postId,
        _openid: openid
      }).remove()

      // 2. 帖子计数 -1
      await db.collection('forum_posts').doc(postId).update({
        data: { like_count: _.inc(-1) }
      })

      return { success: true, status: 'unliked', msg: '取消成功' }

    } else {
      // --- 情况B：没点赞过 -> 执行点赞逻辑 ---

      // 1. 添加点赞记录
      await db.collection('forum_likes').add({
        data: {
          postId: postId,
          createTime: db.serverDate(), // 使用服务端时间
          _openid: openid // 显式存入openid（虽然云开发会自动加，但显式写比较清晰）
        }
      })

      // 2. 帖子计数 +1
      await db.collection('forum_posts').doc(postId).update({
        data: { like_count: _.inc(1) }
      })

      return { success: true, status: 'liked', msg: '点赞成功' }
    }
  } catch (err) {
    console.error(err)
    return { success: false, err: err }
  }
}