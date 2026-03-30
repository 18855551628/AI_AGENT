const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const fromOpenId = wxContext.OPENID // 评论者的 OpenID

  // 1. 如果收件人 ID 为空（即老数据没有 _openid），直接返回失败
  if (!event.toUser) {
    return { success: false, msg: 'No receiver' }
  }

  // 2. 如果是自己评论自己，不发通知
  if (fromOpenId === event.toUser) {
    return { success: true, msg: 'Self reply' }
  }

  try {
    // 3. 写入通知表
    // 兼容多种通知类型，不仅限于 comment
    const type = event.type || 'comment';

    await db.collection('notifications').add({
      data: {
        type: type,                 // 类型: comment (评论), partner_apply (搭子申请), 等
        toUser: event.toUser,       // 接收者（被通知的人）
        postId: event.postId || '', // 关联的内容ID (可能是帖子ID，也可能是搭子ID)
        content: event.content || '',// 通知具体内容 (如：评论的具体字，或者“申请加入你的自习”)
        nickName: event.nickName || '匿名用户',   // 发起者名字
        avatarUrl: event.avatarUrl || '', // 发起者头像
        postContent: event.postContent || '', // 被操作对象的摘要（帖子的文字或搭子的标签/内容）
        isRead: false,              // 默认为未读
        createTime: db.serverDate(),// 服务器时间
        wechatId: event.wechatId || '' // 若有微信号交换则保存
      }
    })
    return { success: true }
  } catch (err) {
    console.error(err)
    return { success: false, err: err }
  }
}