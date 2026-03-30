const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { commentId } = event
  
  try {
    // 1. 删除这条评论本身
    await db.collection('forum_comments').doc(commentId).remove();

    // 连带删除所有 parentId 等于这条评论 ID 的子回复
    // 这样数据库里就不会产生“幽灵盖楼”数据了
    await db.collection('forum_comments').where({
      parentId: commentId
    }).remove();

    // 清理相关的点赞记录，保持数据库整洁
    await db.collection('forum_comment_likes').where({
      commentId: commentId
    }).remove();

    return { success: true, msg: '级联删除成功' }
  } catch (err) {
    console.error('删除云函数执行失败', err)
    return { success: false, err: err }
  }
}