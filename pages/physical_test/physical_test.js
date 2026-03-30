import Toast from '@vant/weapp/toast/toast';

// 官方 20 级标准分数档位
const SCORES = [100, 95, 90, 85, 80, 78, 76, 74, 72, 70, 68, 66, 64, 62, 60, 50, 40, 30, 20, 10];

// 官方分段数据表 (完全按照图表提取，999 是为了处理图表中空缺的赋分档位)
const DB = {
  m12: { // 男生 大一、大二
    lung: [5040, 4920, 4800, 4550, 4300, 4180, 4060, 3940, 3820, 3700, 3580, 3460, 3340, 3220, 3100, 2940, 2780, 2620, 2460, 2300],
    run50: [6.7, 6.8, 6.9, 7.0, 7.1, 7.3, 7.5, 7.7, 7.9, 8.1, 8.3, 8.5, 8.7, 8.9, 9.1, 9.3, 9.5, 9.7, 9.9, 10.1], // 小好
    jump: [273, 268, 263, 256, 248, 244, 240, 236, 232, 228, 224, 220, 216, 212, 208, 203, 198, 193, 188, 183],
    reach: [24.9, 23.1, 21.3, 19.5, 17.7, 16.3, 14.9, 13.5, 12.1, 10.7, 9.3, 7.9, 6.5, 5.1, 3.7, 2.7, 1.7, 0.7, -0.3, -1.3],
    core: [19, 18, 17, 16, 15, 999, 14, 999, 13, 999, 12, 999, 11, 999, 10, 9, 8, 7, 6, 5],
    coreBonus: [20, 21, 22, 23, 24, 25, 26, 27, 28, 29], // 对应 +1 到 +10
    runLong: [197, 202, 207, 214, 222, 227, 232, 237, 242, 247, 252, 257, 262, 267, 272, 292, 312, 332, 352, 372], // 小好
    runLongBonus: [193, 189, 185, 181, 177, 174, 171, 168, 165, 162] // 小好
  },
  m34: { // 男生 大三、大四
    lung: [5140, 5020, 4900, 4650, 4400, 4280, 4160, 4040, 3920, 3800, 3680, 3560, 3440, 3320, 3200, 3030, 2860, 2690, 2520, 2350],
    run50: [6.6, 6.7, 6.8, 6.9, 7.0, 7.2, 7.4, 7.6, 7.8, 8.0, 8.2, 8.4, 8.6, 8.8, 9.0, 9.2, 9.4, 9.6, 9.8, 10.0],
    jump: [275, 270, 265, 258, 250, 246, 242, 238, 234, 230, 226, 222, 218, 214, 210, 205, 200, 195, 190, 185],
    reach: [25.1, 23.3, 21.5, 19.9, 18.2, 16.8, 15.4, 14.0, 12.6, 11.2, 9.8, 8.4, 7.0, 5.6, 4.2, 3.2, 2.2, 1.2, 0.2, -0.8],
    core: [20, 19, 18, 17, 16, 999, 15, 999, 14, 999, 13, 999, 12, 999, 11, 10, 9, 8, 7, 6],
    coreBonus: [21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
    runLong: [195, 200, 205, 212, 220, 225, 230, 235, 240, 245, 250, 255, 260, 265, 270, 290, 310, 330, 350, 370],
    runLongBonus: [191, 187, 183, 179, 175, 172, 169, 166, 163, 160]
  },
  f12: { // 女生 大一、大二
    lung: [3400, 3350, 3300, 3150, 3000, 2900, 2800, 2700, 2600, 2500, 2400, 2300, 2200, 2100, 2000, 1960, 1920, 1880, 1840, 1800],
    run50: [7.5, 7.6, 7.7, 8.0, 8.3, 8.5, 8.7, 8.9, 9.1, 9.3, 9.5, 9.7, 9.9, 10.1, 10.3, 10.5, 10.7, 10.9, 11.1, 11.3],
    jump: [207, 201, 195, 188, 181, 178, 175, 172, 169, 166, 163, 160, 157, 154, 151, 146, 141, 136, 131, 126],
    reach: [25.8, 24.0, 22.2, 20.6, 19.0, 17.7, 16.4, 15.1, 13.8, 12.5, 11.2, 9.9, 8.6, 7.3, 6.0, 5.2, 4.4, 3.6, 2.8, 2.0],
    core: [56, 54, 52, 49, 46, 44, 42, 40, 38, 36, 34, 32, 30, 28, 26, 24, 22, 20, 18, 16],
    coreBonus: [58, 60, 62, 63, 64, 65, 66, 67, 68, 69],
    runLong: [198, 204, 210, 217, 224, 229, 234, 239, 244, 249, 254, 259, 264, 269, 274, 284, 294, 304, 314, 324],
    runLongBonus: [193, 188, 183, 178, 173, 168, 163, 158, 153, 148]
  },
  f34: { // 女生 大三、大四
    lung: [3450, 3400, 3350, 3200, 3050, 2950, 2850, 2750, 2650, 2550, 2450, 2350, 2250, 2150, 2050, 2010, 1970, 1930, 1890, 1850],
    run50: [7.4, 7.5, 7.6, 7.9, 8.2, 8.4, 8.6, 8.8, 9.0, 9.2, 9.4, 9.6, 9.8, 10.0, 10.2, 10.4, 10.6, 10.8, 11.0, 11.2],
    jump: [208, 202, 196, 189, 182, 179, 176, 173, 170, 167, 164, 161, 158, 155, 152, 147, 142, 137, 132, 127],
    reach: [26.3, 24.4, 22.4, 21.0, 19.5, 18.2, 16.9, 15.6, 14.3, 13.0, 11.7, 10.4, 9.1, 7.8, 6.5, 4.9, 4.1, 3.3, 2.5, -0.8],
    core: [57, 55, 53, 50, 47, 45, 43, 41, 39, 37, 35, 33, 31, 29, 27, 25, 23, 21, 19, 17],
    coreBonus: [59, 61, 63, 64, 65, 66, 67, 68, 69, 70],
    runLong: [196, 202, 208, 215, 222, 227, 232, 237, 242, 247, 252, 257, 262, 267, 272, 282, 292, 302, 312, 322],
    runLongBonus: [191, 186, 181, 176, 171, 166, 161, 156, 151, 146]
  }
};

// 工具：在阵列中查找对应基础分数 (查不到给0分)
function getBaseScore(val, thresholds, isLowerBetter = false) {
  let idx = -1;
  if (isLowerBetter) {
    idx = thresholds.findIndex(t => val <= t);
  } else {
    idx = thresholds.findIndex(t => val >= t);
  }
  return idx === -1 ? 0 : SCORES[idx];
}

// 工具：查找附加分 (最高 10 分)
function getBonus(val, thresholds, isLowerBetter = false) {
  let bonus = 0;
  for (let i = 0; i < thresholds.length; i++) {
    if ((isLowerBetter && val <= thresholds[i]) || (!isLowerBetter && val >= thresholds[i])) {
      bonus = i + 1; // 数组第 0 位代表加 1 分
    } else {
      break;
    }
  }
  return bonus;
}

Page({
  data: {
    gender: 'm',
    grade: '12',
    height: '', weight: '', lung: '', run50: '', reach: '', jump: '', core: '', runLong: '',
    showResult: false,
  },

  onGenderChange(e) { this.setData({ gender: e.detail }); },
  onGradeChange(e) { this.setData({ grade: e.detail }); },
  
  onInput(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ [key]: e.detail });
  },

  calculateScore() {
    const d = this.data;
    if (!d.height || !d.weight || !d.lung || !d.run50 || !d.reach || !d.jump || !d.core || !d.runLong) {
      Toast('数据没填全哦，请检查一下');
      return;
    }

    const tKey = d.gender + d.grade; // e.g., 'm12'
    const T = DB[tKey];

    // 1. 计算 BMI 单项得分 (图 1: 15/12/9 分)
    let h = parseFloat(d.height) / 100;
    let w = parseFloat(d.weight);
    let bmi = w / (h * h);
    let bmiScore = 0;
    if (d.gender === 'm') {
      if (bmi <= 17.8) bmiScore = 12;
      else if (bmi <= 23.9) bmiScore = 15;
      else if (bmi <= 27.9) bmiScore = 12;
      else bmiScore = 9;
    } else {
      if (bmi <= 17.1) bmiScore = 12;
      else if (bmi <= 23.9) bmiScore = 15;
      else if (bmi <= 27.9) bmiScore = 12;
      else bmiScore = 9;
    }

    // 2. 解析长跑时间 (如 3.45 代表 3分45秒，转为 225 秒)
    let runLongVal = parseFloat(d.runLong);
    let min = Math.floor(runLongVal);
    let sec = Math.round((runLongVal - min) * 100);
    let runLongSecs = min * 60 + sec;

    // 3. 计算各个单项的原始基础分 (100分制)
    let lungBase = getBaseScore(parseFloat(d.lung), T.lung);
    let run50Base = getBaseScore(parseFloat(d.run50), T.run50, true);
    let reachBase = getBaseScore(parseFloat(d.reach), T.reach);
    let jumpBase = getBaseScore(parseFloat(d.jump), T.jump);
    let coreBase = getBaseScore(parseFloat(d.core), T.core);
    let runLongBase = getBaseScore(runLongSecs, T.runLong, true);

    // 4. 计算附加分 (图5、图6)
    let coreBns = coreBase === 100 ? getBonus(parseFloat(d.core), T.coreBonus) : 0;
    let runLongBns = runLongBase === 100 ? getBonus(runLongSecs, T.runLongBonus, true) : 0;

    // 5. 乘以权重得出最后得分
    let finalScore = 
      bmiScore + // BMI本身就已经是折算后的分 (占比15%)
      lungBase * 0.15 + 
      run50Base * 0.20 + 
      reachBase * 0.10 + 
      jumpBase * 0.10 + 
      (coreBase * 0.10 + coreBns) + 
      (runLongBase * 0.20 + runLongBns);

    // 6. 评定等级
    let finalGrade = '';
    if (finalScore >= 90) finalGrade = '优秀 (满级人类)';
    else if (finalScore >= 80) finalGrade = '良好 (继续保持)';
    else if (finalScore >= 60) finalGrade = '及格 (稳字当头)';
    else finalGrade = '不及格 (别灰心，练起来)';

    this.setData({
      showResult: true,
      finalTotal: finalScore.toFixed(1),
      finalGrade: finalGrade,
      bmiVal: bmi.toFixed(1),
      bmiRes: bmiScore,
      lungRes: (lungBase * 0.15).toFixed(1),
      run50Res: (run50Base * 0.20).toFixed(1),
      reachRes: (reachBase * 0.10).toFixed(1),
      jumpRes: (jumpBase * 0.10).toFixed(1),
      coreRes: (coreBase * 0.10).toFixed(1),
      coreBonus: coreBns,
      runLongRes: (runLongBase * 0.20).toFixed(1),
      runLongBonus: runLongBns
    });
  },

  onCloseResult() { this.setData({ showResult: false }); },
  onShareAppMessage() { return { title: '大学生体测精准计算器', path: '/pages/physical_test/physical_test' } }
})