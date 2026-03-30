const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { commentId, mode } = event
  // mode: 'like' (点赞) 或 'unlike' (取消)
  
  const value = mode === 'like' ? 1 : -1

  try {
    return await db.collection('forum_comments').doc(commentId).update({
      data: {
        like_count: _.inc(value) // 原子自增/自减，防止并发冲突
      }
    })
  } catch (e) {
    console.error(e)
    return { success: false, errMsg: e }
  }
}