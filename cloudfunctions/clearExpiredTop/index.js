const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const now = Date.now();

  try {
    // 寻找那些 isTop 为 1，且 topExpireTime 小于当前时间的帖子
    const res = await db.collection('forum_posts').where({
      isTop: 1,
      topExpireTime: _.lt(now) // _.lt 是“小于”的意思
    }).update({
      data: {
        isTop: 0,
        topExpireTime: 0
      }
    });

    console.log(`巡检完成：成功清理了 ${res.stats.updated} 个过期置顶帖`);
    return { success: true, count: res.stats.updated }
  } catch (err) {
    console.error('清理过期置顶帖失败', err);
    return { success: false, err }
  }
}