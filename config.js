// ===== 全局游戏规则配置（所有可调参数集中在此）=====
// 改这一个文件就能调整：初始属性 / 概率档位 / 计分权重 / 健康衰减 / 存档键名等
// 作者 小龙虾

const CONFIG = {
  // 玩家初始属性
  start: { aum:40, track:5, network:10, health:90, luck:8 },

  // 属性条最大值（用于UI进度条归一化，不是硬上限）
  statMax: { aum:1600, track:440, network:60, luck:40, health:100 },

  // 5档结果对应的属性变动倍率 + 显示样式
  outcomeTiers: {
    SS: { mult: 1.8,  label:'传奇回报', cls:'ss', emoji:'🚀' },
    S:  { mult: 1.0,  label:'投资成功', cls:'s',  emoji:'✅' },
    A:  { mult: 0.25, label:'勉强保本', cls:'a',  emoji:'➖' },
    B:  { mult:-0.7,  label:'投资失利', cls:'b',  emoji:'⚠️' },
    C:  { mult:-1.4,  label:'血本无归', cls:'c',  emoji:'💀' },
  },

  // === 概率结算参数 ===
  // 表现分 = p*perfWeight.base + (1-dice)*perfWeight.dice
  // p = clamp(项目base + baseAdjust + luckBonus, baseClamp.min, baseClamp.max)
  // luckBonus = clamp((luck-8)*luckPerPoint, luckClamp.min, luckClamp.max)
  // 落档：表现分 ≥ tierCuts[X] → 档位 X
  probability: {
    baseAdjust: 0.02,                 // 全局基础胜率微调(正=整体偏好运)
    baseClamp: { min:0.05, max:0.93 },
    luckPerPoint: 0.012,              // 每点运气对胜率影响
    luckClamp: { min:-0.16, max:0.20 },
    perfWeight: { base:0.80, dice:0.20 },  // 运气(骰子)只做小幅扰动，同样选择运气最多影响上下一档
    tierCuts: { SS:0.805, S:0.625, A:0.445, B:0.29 },  // 低于B的就是C
  },

  // 运气增减（按结果档位）
  luckDelta: { SS:3, S:1, A:0, B:-1, C:-3 },

  // 健康衰减规则
  health: {
    baseDecay: 1,        // 每笔投资基础衰减
    rampPerPeriod: 0.5,  // 每过一个时代,衰减+0.5(后期更耗)
    extraOnBad: 2,       // 失利额外扣
    extraOnVeryBad: 5,   // 惨败额外扣
    bonusOnGreat: 1,     // 大成功反而提振
    minHealth: 0,
    maxHealth: 100,
  },

  // 健康死亡相关
  healthDeath: {
    earlyOutThreshold: 30,   // 健康低于此值时综合评分打折
    earlyOutPenalty: 0.82,
    deadPenalty: 0.55,       // 健康归零时
    earlyOutTrackCap: 260,   // 健康死亡且业绩低于此 → 触发"健康透支"特殊结局
  },

  // 综合评分公式权重
  scoreWeights: { track:1.8, aum:0.28, network:0.5, luck:3.5 },

  // 小额参投(资本不够时兜底)回报系数
  smallTicketFactor: 0.5,

  // === MBTI风格判定阈值 ===
  // 某维度|分|≤midThreshold 视为接近中点(均衡倾向)
  mbtiMidThreshold: 2,

  // === 本地存档键名 ===
  storage: {
    save:   'vcsim_save_v1',      // 中途进度
    result: 'vcsim_result_v1',   // 上次结果
    stats:  'vcsim_stats_v1',     // 历史统计
    music:  'vcsim_music_v1',     // 音乐偏好
    playerId: 'vcsim_pid_v1',     // 本机玩家专属ID
    playerName:'vcsim_pname_v1',  // 本机玩家昵称
  },

  // === 音乐参数 ===
  music: {
    masterVolume: 0.9,
    fadeInMs: 300,
    fadeOutMs: 250,
    schedAheadSec: 0.2,
    lookaheadMs: 80,
    defaultOn: true,   // 默认开(首次交互时响起)
    enabled: true,     // 音乐总开关(已换真实mp3年代金曲风)
  },

  // === UI 文案（封面等通用文本，便于改）===
  ui: {
    coverTitle:    '中国创业<br>投资模拟器',
    coverYears:    '2000 — 2026',
    coverSub:      '从千禧年泡沫破裂起步，亲历中国创投二十六年的惊涛骇浪。每一次出手，都是一次命运的押注。',
    coverRules:    '📜 5大时代 · 20次抉择 · 押注当下不揭晓<br>每个时代结束，命运统一揭晓<br>顺势·过热·逆势，胜率不同，运气也算数<br>钱不够投不起大项目，熬垮身体提前出局',
    coverCredit:   '🦞 小龙虾 出品 · 仅供娱乐<br>剧情与项目均为虚构，如有雷同纯属巧合',
    btnStart:      '开始游戏',
    btnContinue:   '⏎ 继续上次',
    btnViewLast:   '📊 查看上次战绩',
    btnRestart:    '重新开始',
    confirmRestart:'确定放弃当前进度，回到首页重新开始吗？',
    musicTipNeed:  '点右上角🔇可开启时代背景音乐',
    scrollHint:    '↓ 下滑了解玩法',
  },

  // === 介绍首页内容(图文卡片,可自由增删改)===
  intro: [
    { icon:'🎮', title:'这是什么游戏',
      body:'一款关于「选择、运气与时代」的文字叙事投资游戏。你扮演一名投资人，从2000年互联网泡沫起步，亲历中国创投二十六年——每一次出手，都是对时代的下注。' },
    { icon:'📖', title:'故事背景',
      body:'从纳斯达克泡沫破裂的2000年出发，穿越门户与泡沫、Web2.0觉醒、移动互联网、硬科技时代、AI新纪元五个时代。每个时代都有造富神话与埋人深坑——你是看懂方向的人，还是浪潮的祭品？' },
    { icon:'⚙️', title:'核心设定',
      body:'<b>5大时代</b>：2000-2026分为门户与泡沫→Web2.0觉醒→移动互联网→硬科技时代→AI新纪元。<br><b>5维属性</b>：资本、声望、人脉、运气、健康——没钱投不起，熬垮身体提前出局。<br><b>趋势×运气</b>：项目分顺势/过热/逆势，胜率不同，但运气也掷骰子——同样选择，每局结果都不同。' },
    { icon:'🎯', title:'怎么玩',
      body:'每个时代3-5次机会，每次从3个项目押注1个。<br><b>延迟揭晓</b>：押注后不立刻出结果，等整个时代落幕才一次性揭晓（如真实投资要等多年才见分晓）。<br>看懂趋势、管好资本与健康，是穿越周期的关键。' },
    { icon:'🏆', title:'你会得到什么',
      body:'走完二十六年，收获两张专属标签：<br><b>① 结局称号</b>——从「封神级·时代造王者」到「离场的勇者」共7档，由战绩决定。<br><b>② 风格画像</b>——稳健/激进 × 理性/感性，测出你是「精算守门人」「热血弄潮儿」还是「平衡掌舵者」。<br>结果可生成战绩长图，分享比拼。' },
    { icon:'💾', title:'贴心功能',
      body:'• 中途退出自动存档，下次接着玩<br>• 随时回看上次战绩<br>• 记录最高分与最常风格<br>• 6时代专属背景音乐，可随时开关' },
  ],
};
