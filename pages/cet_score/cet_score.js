// pages/cet_score/cet_score.js

// ================= 四级常量对照表 (蓝表) =================
const CET4_LISTENING_TABLE = {
  35: 249, 34: 234, 33: 229, 32: 224, 31: 219, 30: 215, 29: 210, 28: 205, 27: 200, 26: 195, 
  25: 191, 24: 186, 23: 181, 22: 176, 21: 171, 20: 167, 19: 162, 18: 157, 17: 152, 16: 147, 
  15: 143, 14: 138, 13: 133, 12: 128, 11: 123, 10: 119, 9: 114, 8: 109, 7: 104, 6: 99, 
  5: 95, 4: 90, 3: 86
};

// 四级阅读的 3 分对应是 85 (听力是 86)，严格按照图表抠的细节
const CET4_READING_TABLE = {
  35: 249, 34: 234, 33: 229, 32: 224, 31: 219, 30: 215, 29: 210, 28: 205, 27: 200, 26: 195, 
  25: 191, 24: 186, 23: 181, 22: 176, 21: 171, 20: 167, 19: 162, 18: 157, 17: 152, 16: 147, 
  15: 143, 14: 138, 13: 133, 12: 128, 11: 123, 10: 119, 9: 114, 8: 109, 7: 104, 6: 99, 
  5: 95, 4: 90, 3: 85
};

// 四级写译，0分保底68分
const CET4_WRITING_TABLE = {
  30: 212, 29: 207, 28: 202, 27: 198, 26: 193, 25: 188, 24: 183, 23: 178, 22: 174, 21: 169, 
  20: 164, 19: 159, 18: 154, 17: 150, 16: 145, 15: 140, 14: 135, 13: 130, 12: 126, 11: 121, 
  10: 116, 9: 111, 8: 106, 7: 102, 6: 97, 5: 92, 4: 87, 3: 82, 2: 78, 1: 73, 0: 68
};

// ================= 六级常量对照表 (绿表) =================
const CET6_LISTENING_TABLE = {
  35: 249, 34: 237, 33: 231, 32: 225, 31: 219, 30: 213, 29: 207, 28: 201, 27: 195, 26: 189, 
  25: 183, 24: 177, 23: 171, 22: 165, 21: 159, 20: 153, 19: 147, 18: 141, 17: 135, 16: 129, 
  15: 123, 14: 117, 13: 111, 12: 105, 11: 99, 10: 93, 9: 87, 8: 81, 7: 75, 6: 69, 
  5: 63, 4: 57, 3: 51
};

const CET6_READING_TABLE = {
  35: 249, 34: 246, 33: 240, 32: 234, 31: 228, 30: 222, 29: 216, 28: 210, 27: 204, 26: 198, 
  25: 192, 24: 186, 23: 180, 22: 174, 21: 168, 20: 162, 19: 156, 18: 150, 17: 144, 16: 138, 
  15: 132, 14: 126, 13: 120, 12: 114, 11: 108, 10: 102, 9: 96, 8: 90, 7: 84, 6: 78, 
  5: 72, 4: 66, 3: 60
};

const CET6_WRITING_TABLE = {
  30: 212, 29: 206, 28: 200, 27: 194, 26: 188, 25: 182, 24: 176, 23: 170, 22: 164, 21: 158, 
  20: 152, 19: 146, 18: 140, 17: 134, 16: 128, 15: 122, 14: 116, 13: 110, 12: 104, 11: 98, 
  10: 92, 9: 86, 8: 80, 7: 74, 6: 68, 5: 62, 4: 56, 3: 50, 2: 44, 1: 38, 0: 32
};

// ================= 辅助查表函数 =================
function getScoreFromTable(rawUnits, table) {
  if (rawUnits >= 35) return 249;
  if (rawUnits < 3) return rawUnits * 7.1; // 低于3个的按正常分给

  if (Number.isInteger(rawUnits)) {
    return table[rawUnits];
  }

  // 处理阅读中可能出现的 0.5 步长：取上下相邻分数的平均值
  const floor = Math.floor(rawUnits);
  const ceil = Math.ceil(rawUnits);
  const floorScore = table[floor] || (floor * 7.1);
  const ceilScore = table[ceil] || (ceil * 7.1);
  return (floorScore + ceilScore) / 2;
}

Page({
  data: {
    activeTab: 'cet4',

    // 四级数据
    c4_l1: 0, c4_l2: 0, c4_l3: 0,
    c4_r1: 0, c4_r2: 0, c4_r3: 0,
    c4_w: 0,

    // 六级数据
    c6_l1: 0, c6_l2: 0, c6_l3: 0,
    c6_r1: 0, c6_r2: 0, c6_r3: 0,
    c6_w: 0,

    showResult: false,
    totalScore: 0
  },

  onTabChange(event) {
    this.setData({ activeTab: event.detail.name });
  },

  // 听力单独绑定
  onC4L1(e) { this.setData({ c4_l1: e.detail }); },
  onC4L2(e) { this.setData({ c4_l2: e.detail }); },
  onC4L3(e) { this.setData({ c4_l3: e.detail }); },
  onC6L1(e) { this.setData({ c6_l1: e.detail }); },
  onC6L2(e) { this.setData({ c6_l2: e.detail }); },
  onC6L3(e) { this.setData({ c6_l3: e.detail }); },

  // 阅读通用绑定
  onChangeShared(e) {
    const level = e.currentTarget.dataset.level;
    const type = e.currentTarget.dataset.type;  
    const key = `c${level}_${type}`;
    this.setData({ [key]: e.detail });
  },

  // 写作通用绑定
  onChangeWriting(e) {
    const level = e.currentTarget.dataset.level;
    const key = `c${level}_w`;
    
    let val = parseFloat(e.detail);
    if (isNaN(val)) val = 0;
    
    if (val > 30) {
      val = 30;
      wx.showToast({ title: '卷面满分仅为30分', icon: 'none', duration: 2000 });
    } else if (val < 0) {
      val = 0;
    }
    this.setData({ [key]: val });
  },

  // --- 核心计算逻辑 ---
  calculateScore() {
    const isCet4 = this.data.activeTab === 'cet4';
    let rawTotal = 0;

    if (isCet4) {
      // ================= 四级查表算法 =================
      const { c4_l1, c4_l2, c4_l3, c4_r1, c4_r2, c4_r3, c4_w } = this.data;
      
      // 听力单元数计算
      const rawL = (c4_l1 * 1) + (c4_l2 * 1) + (c4_l3 * 2);
      const listeningScore = getScoreFromTable(rawL, CET4_LISTENING_TABLE);

      // 阅读单元数计算
      const rawR = (c4_r1 * 0.5) + (c4_r2 * 1) + (c4_r3 * 2);
      const readingScore = getScoreFromTable(rawR, CET4_READING_TABLE);

      // 写译得分
      const safeWriting = Math.floor(c4_w);
      const writingScore = CET4_WRITING_TABLE[safeWriting] || 68; // 0分保底68

      rawTotal = listeningScore + readingScore + writingScore;

    } else {
      // ================= 六级查表算法 =================
      const { c6_l1, c6_l2, c6_l3, c6_r1, c6_r2, c6_r3, c6_w } = this.data;
      
      const rawL = (c6_l1 * 1) + (c6_l2 * 1) + (c6_l3 * 2);
      const listeningScore = getScoreFromTable(rawL, CET6_LISTENING_TABLE);

      const rawR = (c6_r1 * 0.5) + (c6_r2 * 1) + (c6_r3 * 2);
      const readingScore = getScoreFromTable(rawR, CET6_READING_TABLE);

      const safeWriting = Math.floor(c6_w);
      const writingScore = CET6_WRITING_TABLE[safeWriting] || 32; // 0分保底32

      rawTotal = listeningScore + readingScore + writingScore;
    }

    this.setData({
      totalScore: Math.round(rawTotal),
      showResult: true
    });
  },

  onCloseResult() {
    this.setData({ showResult: false });
  },

  onShareAppMessage() {
    return {
      title: '四六级精准估分工具',
      path: '/pages/cet_score/cet_score'
    }
  }
})