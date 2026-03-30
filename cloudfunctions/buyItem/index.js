// 云函数入口文件
const cloud = require('wx-server-sdk')

// 初始化云环境
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV }) 
const db = cloud.database()
const _ = db.command

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  // 仅仅信任前端传来的商品ID，忽略前端传的价格和名称
  const { itemId } = event

  // 1. 基础参数校验
  if (!itemId) {
    return { success: false, msg: '缺少商品参数' }
  }

  try {
    // 安全核心：从数据库读取真实的商品信息
    const goodRes = await db.collection('goods_list').where({
      id: itemId
    }).get()

    if (goodRes.data.length === 0) {
      return { success: false, msg: '商品不存在或已下架' }
    }

    const realItem = goodRes.data[0]
    const realPrice = realItem.price
    const realName = realItem.name

    // 3. 核心防超卖：利用数据库原子操作进行扣费
    // 扣费条件：用户 openid 匹配，且当前总积分 >= 真实商品价格
    const accountRef = db.collection('user_account').where({
      _openid: openid,
      totalPoints: _.gte(realPrice) 
    })

    const updateRes = await accountRef.update({
      data: {
        totalPoints: _.inc(-realPrice) // 原子级减去真实价格
      }
    })

    // 如果 updated 为 0，说明积分不够，或者没有该用户的账户记录
    if (updateRes.stats.updated === 0) {
      return { 
        success: false, 
        msg: '积分不足或账户异常，兑换失败' 
      }
    }

    // 4. 发放商品记录
    // 记录到用户的背包/物品集合 user_items
    await db.collection('user_items').add({
      data: {
        _openid: openid,
        itemId: itemId,
        itemName: realName,     // 存入真实名称
        buyPrice: realPrice,    // 存入真实花费
        buyTime: db.serverDate(),
        status: 'active' 
      }
    })

    // 5. 记录积分流水 (记录到 point_records)
    await db.collection('point_records').add({
      data: {
        _openid: openid,
        type: 'consume', 
        desc: `兑换【${realName}】`,
        amount: -realPrice,
        createTime: db.serverDate()
      }
    })

    // 6. 返回成功给前端
    return {
      success: true,
      msg: '兑换成功'
    }

  } catch (err) {
    console.error('云函数 [buyItem] 执行异常:', err)
    return {
      success: false,
      msg: '系统繁忙，请稍后重试',
      error: err
    }
  }
}