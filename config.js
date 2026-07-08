// ===== 全局游戏规则配置（所有可调参数集中在此）=====
// 改这一个文件就能调整：初始属性 / 概率档位 / 计分权重 / 健康衰减 / 存档键名等
// 作者 小龙虾

const CONFIG = {
  // === 数据上报(经 Edge Function,前端零密钥) ===
  // 只需 url(拼 Edge Function 地址);上报由服务端 service_role 插表,前端不带任何 key。留空则不上报(妙搭全栈版走 postMessage)。
  supabase: {
    url: 'https://cddkniwbhvcbfgkgomtl.supabase.co',
  },

  // 玩家初始属性
  start: { aum:100, track:100, network:100, health:100, luck:50 },

  // 属性条最大值（用于UI进度条归一化，不是硬上限）
  statMax: { aum:1200, track:1900, network:750, luck:100, health:100 },

  // 5档结果对应的属性变动倍率 + 显示样式
  outcomeTiers: {
    SS: { mult: 2.0,  label:'传奇回报', cls:'ss', emoji:'🚀' },
    S:  { mult: 1.0,  label:'投资成功', cls:'s',  emoji:'✅' },
    A:  { mult: 0.3,  label:'勉强保本', cls:'a',  emoji:'➖' },
    B:  { mult:-1.0,  label:'投资失利', cls:'b',  emoji:'⚠️' },
    C:  { mult:-1.2,  label:'血本无归', cls:'c',  emoji:'💀' },
  },

  // === 概率结算参数 ===
  // 表现分 = p*perfWeight.base + (1-dice)*perfWeight.dice
  // p = clamp(项目base + baseAdjust + luckBonus, baseClamp.min, baseClamp.max)
  // luckBonus = clamp((luck-8)*luckPerPoint, luckClamp.min, luckClamp.max)
  // 落档：表现分 ≥ tierCuts[X] → 档位 X
  probability: {
    baseAdjust: 0,                    // 全局基础胜率微调(正=整体偏好运)。2026-06-24:-0.02过难导致封神3.5%/健康透支21.5%严重偏离,回中性0后七档贴目标(封神9.4/一线19.8/资深20/稳进18.2/过山车14.5/离场5.8/健康透支12.2,总偏离6.2). baseAdjust是一刀切旋钮,压低分局会连带压低封神,不宜用它控离场比例
    baseClamp: { min:0.05, max:0.93 },
    luckBase: 50,                     // 运气中位基准(0-100制)
    luckPerPoint: 0.004,              // 每点运气对胜率影响
    luckClamp: { min:-0.16, max:0.20 },
    perfWeight: { base:0.68, dice:0.32 },  // 运气适度参与:同样选择运气影响约上下一档，又能拉开分数
    tierCuts: { SS:0.80, S:0.62, A:0.44, B:0.28 },  // 低于B的就是C
    trendBoost: { hot:0.08, down:0.08 },  // 风口/逆势 可博性加成(让博风口不至于纯送死)
  },

  // === 趋势回报修正(2026-06-21平衡:让顺势不能无脑封神,博险才有暴利)===
  // 仅作用于正收益(SS/S/A)。
  trendReturn: {
    upDecay: 0.85,    // 顺应时代:每多选一次,后续顺势回报×0.85^(已选次数)，边际递减(风口红利越吃越薄)
    upFloor: 0.4,     // 顺势回报衰减下限(至少保留40%)
    hotGain: 1.4,     // 风口/逆势 博中(正收益)时的超额回报倍数
  },

  // 运气增减（按结果档位）
  luckDelta: { SS:4, S:2, A:0, B:-2, C:-4 },

  // 健康衰减规则
  health: { baseDecay:1.5, rampPerPeriod:0.7, extraOnBad:7, extraOnVeryBad:14, bonusOnGreat:1, minHealth:0, maxHealth:100 },

  // 健康死亡相关
  healthDeath: {
    earlyOutTrackCap: 800,   // 健康死亡且业绩低于此 → 触发"健康透支"特殊结局
  },

  // === 综合评分（五属性归一化构成1000分，2026-06-21重设计）===
  // === 净值线性评分(2026-06-22重构)===  综合分 = (资本-100-累计投入)*a + (业绩-100)*b + (人脉-100)*c
  // 系数 a:b:c 守 资本:业绩:人脉=2:3:1 的"对分贡献",并经模拟反解让满分落1000+命中档位比例
  scoreCoef: { a: 0.206, b: 0.309, c: 0.103 },  // 资本:业绩:人脉=2:3:1, 模拟反解满分落1000
  scoreClampMax: 1000,                          // 总分上限
  // 运气影响胜率: 实际胜率 = clamp(base + (运气-50)/50 * luckEffect, 0, 1)
  luckEffect: 0.3,        // 平滑曲线指数(未达目标也能拿大部分分)
  deadPenalty: 0.6,        // 健康归零时总分打折(唯一权威值,calcScore 引用)
  // 结局音效门槛(跟 endingTiers 对齐:winBig=封神/一线传奇, winMid=资深/稳进, neutral=过山车, 以下lose)
  scoreTiersForSfx: { big: 550, mid: 250, neutral: 150 },

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
  // 注:音量/淡入淡出在 engine-music.js 内写死(WebAudio调度参数已随换mp3废弃),此处只留引擎实际读取的两个开关
  music: {
    defaultOn: true,   // 默认开(首次交互时响起)
    enabled: true,     // 音乐总开关(已换真实mp3年代金曲风)
  },

  // === UI 文案（封面等通用文本，便于改）===
  ui: {
    coverTitle:    '中国创业<br>投资模拟器',
    coverYears:    '2000 — 2026',
    coverSub:      '从千禧年泡沫破裂起步，亲历中国创投二十六年的惊涛骇浪。每一次出手，都是一次命运的押注。',
    coverRules:    '5大时代 · 20次抉择 · 押注当下不揭晓<br>每个时代结束，命运统一揭晓<br>顺势·过热·逆势，胜率不同，运气也算数<br>钱不够投不起大项目，熬垮身体提前出局',
    coverCredit:   '🦞 小龙虾 出品 · 仅供娱乐<br>剧情与项目均为虚构，如有雷同纯属巧合',
    btnStart:      '开始游戏',
    btnContinue:   '⏎ 继续上次',
    btnViewLast:   '查看上次战绩',
    btnRestart:    '重新开始',
    confirmRestart:'确定放弃当前进度，回到首页重新开始吗？',
    musicTipNeed:  '点右上角🔇可开启时代背景音乐',
    scrollHint:    '↓ 下滑了解玩法',
  },

  // === 游戏内文案(便于翻译/定制) ===
  text: {
    // 5档揭晓点评
    tierSS: '时代给了你最丰厚的回报——${name}成为传奇级案例，你的判断被写进教科书。',
    tierS:  '${name}稳稳兑现，你押对了方向，吃到了完整的时代红利。',
    tierA:  '${name}不功不过，勉强保本退出。有些投资，活着就是胜利。',
    tierB:  '${name}没能跑出来，你交了学费。${why}。',
    tierC:  '${name}彻底归零，血本无归。${why}——这一课，刻骨铭心。',
    // 邀请横幅
    invited: '🎉 你是被 <b>${name}</b> 邀请来的，开启属于你的二十六年吧',
    // 选择页
    choiceTitle: '${year} 年 · 投资抉择',
    choiceSub: '作为${title}，这一站你只能押注 1 个项目',
    choicePending: '⏳ 押注后不会立刻揭晓，本时代结束时才知道命运',
    // 项目锁定
    lockNoAum: '资本不足',
    lockNoTrack: '声望不足',
    lockNoHealth: '精力不足',
    lockNoNet: '人脉不足',
    lockSmall: '资本不足·小额参投（回报减半）',
    // 封存页
    stagedTitle: '已下注 · 封存待揭晓',
    stagedTip: '你押上了 ${amt}M。<br>这一笔是神来之手还是踩雷，<br>要等这个时代落幕才能见分晓。',
    stagedUndo: '撤销，重选本站',
    // 揭晓页
    verdictMark: '— 时 代 落 幕 · 命 运 揭 晓 —',
    healthDeadWarn: '⚠️ 你的健康已透支殆尽，身体亮起最后的红灯……',
    btnAfterPeriod: {
      dead: '迎接结局…',
      last: '见证你的二十六年',
      next: '走向下一个时代',
    },
    // 按钮
    btnSeeChoices: '看看有哪些项目',
    btnEnterPeriod: '进入这个时代',
    btnConfirmPick: '请选择一个项目',
    btnConfirmed: '确认押注',
    btnWitness: '见证时代的答案',
    btnContinue: '继续下一站',
    // 结局页 · 战绩卡
    endingRankLabel: '二 十 六 年 · 终 局',
    endingStatScore: '综合评分',
    endingStatAum: '最终资本',
    endingStatTrack: '业绩声望',
    endingStatHitMiss: '命中/踩坑',
    endingBestTitle: '🏆 封神一投',
    endingWorstTitle: '💀 至暗一坑',
    endingBestNone: '这一生，未曾抓住真正的大鱼',
    endingWorstNone: '谨慎如你，未踩重大深坑',
    endingRecordHead: '— 二十六年投资轨迹 —',
    endingFootBrand: '中国创业投资模拟器 · <b>2000—2026</b> · <span style="white-space:nowrap">🦞 小龙虾出品</span>',
    endingFootQrTip: '长按扫码走一遍你的投资人生 · 仅供娱乐',
    // 五档结果简称(轨迹表/高光框用，区别于 outcomeTiers.label 长名)
    outcomeShort: { SS:'传奇', S:'命中', A:'保本', B:'失利', C:'惨败' },
    // 结局页按钮/提示
    btnCopyShare: '复制分享',
    btnEndingRestart: '重新开始',
    endingShareHint: '长图生成后会弹出预览，手机端长按图片即可保存到相册<br>复制链接发给朋友，挑战谁是更强的投资人',
    mbtiHead: '— 你的投资风格画像 —',
    genImage: '生成战绩长图',
    genImageWait: '正在生成长图，请稍候…',
    genImageOk: '生成成功！',
    genImageFail: '生成失败，请直接截图保存',
    genImageTip: '✅ 战绩长图已生成<br>手机：长按图片保存到相册 ｜ 电脑：右键另存为',
    copyOk: '链接+文案已复制，去粘贴分享吧',
    copyFail: '请手动复制地址栏链接',
    promptName: '给自己起个投资人名号吧（让朋友知道是谁邀请的，可留空跳过）：',
    // 称号
    titles: ['投资分析师','投资经理','投资总监','副总裁','合伙人'],
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
      body:'走完二十六年，收获两张专属标签：<br><b>① 结局称号</b>——从「封神级·时代造王者」到「离场的勇者」共7档，由战绩决定。<br><b>② 五维人格</b>——从风险/理性/视野/集中度/果断 五个维度，测出你是「价值守望者」「趋势猎手」还是「狂想押注者」等6型，并匹配最像你的投资大师(巴菲特/索罗斯/木头姐…)。<br>结果可生成战绩长图，分享比拼。' },
    { icon:'💾', title:'贴心功能',
      body:'• 中途退出自动存档，下次接着玩<br>• 随时回看上次战绩<br>• 记录最高分与最常风格<br>• 5时代专属背景音乐，可随时开关' },
  ],
};
