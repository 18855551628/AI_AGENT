
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const postId = event.postId
  const value = event.value || 1 

  if (!postId) {
    return { success: false, errMsg: '缺少 postId' }
  }

  try {
    return await db.collection('forum_posts').doc(postId).update({
      data: {
        comment_count: _.inc(value) 
      }
    })
  } catch (e) {
    console.error(e)
    return { success: false, errMsg: e }
  }
}