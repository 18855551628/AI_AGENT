const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  
  // 接收前端传来的 帖子ID 和 道具ID(比如 'item_top_card')
  const { postId, itemId } = event

  if (!postId || !itemId) {
    return { success: false, msg: '参数缺失' }
  }

  try {
    // 1. 查用户的背包，看有没有这张未使用的置顶卡
    const itemRes = await db.collection('user_items').where({
      _openid: openid,
      itemId: itemId,
      status: 'active'
    }).limit(1).get()

    if (itemRes.data.length === 0) {
      return { success: false, msg: '你的背包里没有可用的置顶卡' }
    }

    const userItemId = itemRes.data[0]._id // 拿到这条道具记录的唯一ID

    // 2. 扣除卡片 (把状态改为 used)
    await db.collection('user_items').doc(userItemId).update({
      data: {
        status: 'used',
        useTime: db.serverDate(),
        usedOnPost: postId // 记录一下用在哪个帖子上，方便以后查账
      }
    })

    // 3. 置顶帖子 (计算 24 小时后的时间戳)
    const expireTime = Date.now() + 24 * 60 * 60 * 1000
    
    await db.collection('forum_posts').doc(postId).update({
      data: {
        isTop: 1,
        topExpireTime: expireTime
      }
    })

    return { success: true, msg: '置顶成功！去论坛看看吧' }
    
  } catch (err) {
    console.error('置顶失败', err)
    return { success: false, msg: '系统繁忙，请稍后重试' }
  }
}