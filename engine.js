/* ============================================================
 * engine.js — 音效+背景音乐引擎(自动合并,改原始 engine-*.js 后重跑 merge_js.py)
 * 含: Sfx / Music
 * ============================================================ */

/* ===== engine-sfx.js ===== */
// 音效引擎：Web Audio API 纯合成（零文件/零加载/零体积）
// 跟背景乐共存，轻音量不抢戏。可全局开关(跟随音乐开关)。
// 作者 小龙虾 2026-06-21
const Sfx = (function(){
  let ctx=null, master=null, enabled=true;
  let hoverEnabled=true;        // hover 音效独立开关(不受背景乐/总音效影响)
  let lastHoverAt=0;            // 全局 hover 节流时间戳(防炸响)
  const VOL=0.85;  // 音效总音量(明显高于背景乐,反馈清晰)

  function ensure(){
    if(!ctx){
      try{
        // iOS 17+:把 Web Audio 切到“播放”通道,让手机静音键打开时也能出声(默认 ambient 受静音键控制)
        try{ if(navigator.audioSession){ navigator.audioSession.type='playback'; } }catch(e){}
        ctx=new (window.AudioContext||window.webkitAudioContext)();
        master=ctx.createGain(); master.gain.value=VOL;
        // 限幅压缩器：防止多层叠加剔波爆音,让音效更结实饱满(尤其震撼开场不糊)
        var comp=ctx.createDynamicsCompressor();
        comp.threshold.setValueAtTime(-3, ctx.currentTime);
        comp.knee.setValueAtTime(12, ctx.currentTime);
        comp.ratio.setValueAtTime(6, ctx.currentTime);
        comp.attack.setValueAtTime(0.003, ctx.currentTime);
        comp.release.setValueAtTime(0.15, ctx.currentTime);
        // makeup gain:压缩后补响度,保住冲击力(响而不爆)
        var makeup=ctx.createGain(); makeup.gain.value=1.5;
        master.connect(comp); comp.connect(makeup); makeup.connect(ctx.destination);
      }catch(e){ ctx=null; }
    }
    if(ctx && ctx.state!=='running'){ try{ctx.resume();}catch(e){} }
    return ctx;
  }
  // 单音：频率/时长/波形/音量包络
  function tone(freq, start, dur, type='sine', peak=0.5, glideTo=null){
    if(!ctx) return;
    const o=ctx.createOscillator(), g=ctx.createGain();
    o.type=type; o.frequency.setValueAtTime(freq, ctx.currentTime+start);
    if(glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, ctx.currentTime+start+dur);
    g.gain.setValueAtTime(0.0001, ctx.currentTime+start);
    g.gain.exponentialRampToValueAtTime(peak, ctx.currentTime+start+0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime+start+dur);
    o.connect(g); g.connect(master);
    o.start(ctx.currentTime+start); o.stop(ctx.currentTime+start+dur+0.02);
  }
  // 琶音(多音依次)
  function arp(freqs, step, dur, type='triangle', peak=0.5){
    freqs.forEach((f,i)=>tone(f, i*step, dur, type, peak));
  }

  const lib={
    // ===== 开始游戏音效候选(主人挑选用,选定后替换 start) =====
    // A：史诗号角(当前版,作对照)
    startA(){
      tone(98,0,0.55,'sawtooth',0.55,196); tone(131,0.02,0.50,'triangle',0.45,262);
      tone(262,0.04,0.30,'triangle',0.55); tone(330,0.10,0.30,'triangle',0.6); tone(392,0.16,0.30,'triangle',0.65); tone(523,0.22,0.42,'triangle',0.7);
      tone(523,0.30,0.5,'triangle',0.5); tone(659,0.30,0.5,'triangle',0.45); tone(784,0.30,0.5,'sine',0.5); tone(1047,0.30,0.55,'triangle',0.55);
      tone(1568,0.34,0.45,'sine',0.4); tone(2093,0.40,0.5,'sine',0.3);
    },
    // B：钟磬开悟(东方禅意,编钟+磬,空灵庄重)
    startB(){
      // 低频磬底
      tone(110,0,0.9,'sine',0.4); tone(165,0.0,0.8,'sine',0.3);
      // 编钟主音(纯净sine+泛音),从容上行
      tone(523,0.05,0.7,'sine',0.55); tone(784,0.05,0.7,'sine',0.32);
      tone(659,0.30,0.7,'sine',0.5); tone(988,0.30,0.65,'sine',0.28);
      tone(880,0.58,0.9,'sine',0.55); tone(1319,0.58,0.8,'sine',0.3);
      // 高频余韵(磬尾)
      tone(1760,0.62,0.7,'sine',0.22); tone(2637,0.70,0.6,'sine',0.14);
    },
    // C：资本脉动(电子科技感,低频脉冲+上扬合成器)
    startC(){
      // 低频脉冲铺底(三连击,像心跳/数据脉冲)
      tone(65,0,0.14,'square',0.5); tone(65,0.16,0.14,'square',0.5); tone(65,0.32,0.18,'square',0.55);
      // 上扬合成器扫频(科技上升感)
      tone(220,0.30,0.5,'sawtooth',0.4,880);
      // 主和弦绽放(方波+锯齿,电子味)
      tone(523,0.46,0.42,'square',0.4); tone(659,0.46,0.42,'sawtooth',0.32); tone(784,0.46,0.45,'square',0.42);
      // 高频亮点收尾
      tone(1568,0.52,0.4,'triangle',0.3); tone(1047,0.56,0.45,'sine',0.35);
    },
    // D：命运叩门(戏剧性,三声叩击+和弦绽放,宿命感)
    startD(){
      // 三声低沉叩击(命运动机)
      tone(196,0,0.22,'triangle',0.6,147); tone(196,0.24,0.22,'triangle',0.6,147); tone(196,0.48,0.26,'triangle',0.62,131);
      // 沉默后和弦戏剧绽放(小调转大调的释然)
      tone(262,0.74,0.6,'triangle',0.5); tone(330,0.74,0.6,'triangle',0.45); tone(392,0.74,0.6,'sine',0.5); tone(523,0.78,0.65,'triangle',0.55);
      // 高音绽放收尾
      tone(784,0.82,0.55,'sine',0.4); tone(1047,0.88,0.6,'triangle',0.35);
    },

    // 选项点选：清亮灵动"叮"(比 click 更高更跳跃,选中确定感)
    pick(){ tone(988, 0, 0.07, 'triangle', 0.5); tone(1480,0.018,0.06,'sine',0.32); },
    // 封存确认：一记“咚”(原版骨架,更清脆+更浑厚)——高频瞬态打亮起音 + 中频主体“咚” + 深低频共鸣增厚
    confirm(){
      // ① 高频瞬态(清脆感来自起音的高频点,极短)
      tone(1320, 0, 0.05, 'triangle', 0.35);
      // ② 中频主体“咚”(原版的骨架:下滑盖章感)
      tone(330, 0, 0.18, 'sine', 0.65, 175);
      tone(220, 0, 0.20, 'triangle', 0.5, 130);
      // ③ 深低频共鸣增厚(浑厚感的根:更低更长的低音托底)
      tone(110, 0, 0.30, 'sine', 0.6, 80);
      tone(73, 0.005, 0.34, 'sine', 0.45, 55);
    },
    // 按钮通用 click：清脆双音叠(高频亮点,脆生生)
    click(){ tone(1046,0,0.06,'triangle',0.5); tone(1568,0.012,0.05,'sine',0.3); },
    // 翻页/推进：轻快上扬滑音
    swipe(){ tone(560,0,0.11,'triangle',0.48,860); tone(840,0.035,0.08,'sine',0.28); },
    // 开始游戏/启程：明亮上扬三音琴音，有仪式感(专门给重要入场动作)
    // 开始游戏/启程：史诗级震撼开场——低频上扫铺底+号角琶音爆发+顶点和弦齐鸣+高频闪耀
    start(){
      // ① 低频厚重铺底：低音上扫,奠定恢弘基底(像引擎/巨门开启)
      tone(98, 0, 0.55, 'sawtooth', 0.55, 196);
      tone(131, 0.02, 0.50, 'triangle', 0.45, 262);
      // ② 主号角：中频上扬琶音,明亮有力,层层推进
      tone(262, 0.04, 0.30, 'triangle', 0.55);
      tone(330, 0.10, 0.30, 'triangle', 0.6);
      tone(392, 0.16, 0.30, 'triangle', 0.65);
      tone(523, 0.22, 0.42, 'triangle', 0.7);
      // ③ 顶点和弦齐鸣：do-mi-sol-do↑ 同时炸开,饱满辉煌
      tone(523, 0.30, 0.5, 'triangle', 0.5);
      tone(659, 0.30, 0.5, 'triangle', 0.45);
      tone(784, 0.30, 0.5, 'sine', 0.5);
      tone(1047, 0.30, 0.55, 'triangle', 0.55);
      // ④ 高频闪耀：高音点缀+顶音收尾,光芒绽放
      tone(1568, 0.34, 0.45, 'sine', 0.4);
      tone(2093, 0.40, 0.5, 'sine', 0.3);
    },
    // 揭晓结果(按档位)
    SS(){ arp([523,659,784,1047,1319], 0.075, 0.28, 'triangle', 0.5); tone(1568,0.34,0.4,'sine',0.35); }, // 欢庆上行+亮顶
    S(){ arp([523,784,1047], 0.07, 0.24, 'triangle', 0.45); },   // 明亮三音
    A(){ tone(523,0,0.18,'sine',0.4); tone(659,0.06,0.16,'sine',0.3); }, // 中性双音
    B(){ tone(392,0,0.22,'sine',0.42,294); },  // 低沉下行
    C(){ tone(294,0,0.16,'sawtooth',0.4,180); tone(196,0.10,0.26,'sine',0.4,130); }, // 失落顿挫下坠
    // 结局：胜利/平/失落
    winBig(){ arp([523,659,784,1047,1319,1568], 0.09, 0.5, 'triangle', 0.5); tone(2093,0.6,0.6,'sine',0.3); },
    winMid(){ arp([523,659,784,1047], 0.10, 0.42, 'triangle', 0.45); },
    neutral(){ arp([440,554,659], 0.10, 0.35, 'sine', 0.4); },
    lose(){ tone(330,0,0.4,'sine',0.45,165); tone(247,0.18,0.5,'sine',0.4,123); }, // 缓缓下坠
    // 数值跳动(揭晓属性变化时的小滴答)
    tick(){ tone(1200,0,0.04,'square',0.15); },
  };

  // 首次用户交互时解锁 AudioContext(浏览器自动播放策略要求)
  let unlocked=false;
  function unlock(){
    if(unlocked) return;
    unlocked=true;
    ensure();
    // 在用户手势同步上下文立即 resume(这是浏览器唯一认可的解锁时机)
    if(ctx && ctx.state!=='running'){ try{ ctx.resume(); }catch(e){} }
    // 注:不再播“唤醒音” oscillator。ctx.resume() 已足够激活管线;play() 内含 resume 轮询等待,首声不靠唤醒音。避免后台/任何点击因创建 oscillator 在个别浏览器产生瞬态爆音
  }
  // 轻量提前 resume:不受 unlocked 守卫限制,每次交互都顺手 resume ctx
  // 作用:页面静置后 ctx 挂起,用户手指一按下就立即 resume,等松手触发音效时 ctx 已 running→即时发声不滞后
  function eagerResume(){ try{ if(ctx && ctx.state!=='running'){ ctx.resume(); } }catch(e){} }
  try{
    ['pointerdown','touchstart','keydown'].forEach(ev=>
      document.addEventListener(ev, unlock, {once:false, passive:true, capture:true}));
    // pointerdown/pointermove 提前唤醒(滞后修复:点击前ctx就开始resume)
    ['pointerdown','pointermove','touchstart','keydown'].forEach(ev=>
      document.addEventListener(ev, eagerResume, {once:false, passive:true, capture:true}));
  }catch(e){}

  return {
    unlock,
    setEnabled(v){ enabled=!!v; },
    // 强制唤醒 ctx(可见性恢复时用,不受 unlocked 守卫限制;ctx 不存在则不创建,避免无手势创建)
    resumeNow(){ try{ if(ctx && ctx.state!=='running'){ ctx.resume(); } }catch(e){} },
    isEnabled(){ return enabled; },
    play(name){
      if(!enabled) return;
      if(!ensure()) return;
      const fn=lib[name];
      if(!fn) return;
      // ctx 刚解锁可能还是 suspended(resume 是异步)。
      // 关键:resume.then 的回调已脱离用户手势上下文,首声 oscillator 会被浏览器静音/丢弃。
      // 解法:resume 后轮询等 ctx.state 真正变 running 再播,确保振荡器在激活管线上发声。
      if(ctx.state!=='running'){
        try{ ctx.resume(); }catch(e){}
        let tries=0;
        (function waitRun(){
          if(ctx.state==='running'){ try{ fn(); }catch(e){} return; }
          if(tries++>20){ try{ fn(); }catch(e){} return; }  // 兜底:最多等~400ms仍播
          try{ ctx.resume(); }catch(e){}
          setTimeout(waitRun, 20);
        })();
      } else {
        try{ fn(); }catch(e){}
      }
    },
    // 揭晓一组结果：取最高档位播代表音(避免多条叠成噪音)
    revealTier(tiers){
      if(!enabled||!ensure()) return;
      const order=['SS','S','A','B','C'];
      let best='C';
      for(const t of order){ if(tiers.includes(t)){ best=t; break; } }
      this.play(best);
    },
    // ===== Hover 轻量音效 (PC 鼠标划过使用,极轻极短,独立开关) =====
    // 独立开关 hoverEnabled,主人不喜欢能单独关;默认 true。
    // 节流机制:同一元素 80ms 内不重复响,整体 35ms 全局冷却防炸响(快速划过多元素不炸耳)。
    // 音量比 click 低一半,频率偏高(轻盈不狂耳)。
    setHoverEnabled(v){ hoverEnabled=!!v; },
    isHoverEnabled(){ return hoverEnabled; },
    playHover(kind){
      if(!enabled||!hoverEnabled||!ensure()) return;
      // 节流用 performance.now()(墙钟毫秒)不用 ctx.currentTime——ctx 挂起时 currentTime 会冻结,
      // 用它做节流会误判为“还在冷却”而拦截,导致静置后 hover 永远不响。
      const now=(typeof performance!=='undefined'&&performance.now)?performance.now():Date.now();
      if(now-lastHoverAt<35) return;  // 全局 35ms 冷却
      lastHoverAt=now;
      // hover 沉闷短促(跟手不拖):低频 sine,按元素类型微差异。比 click 低一个八度,营造"闷"感
      const f={
        btn:    [392],   // 主按钮:偏低沉(重要元素,足感)
        deal:   [440],   // 投资卡:中低(稳)
        opt:    [349],   // 题目选项:最低沉(柔和)
        icon:   [523],   // 图标钮:略高一点(轻巧)
      }[kind]||[392];
      // 时长砍回 0.05s(跟手不拖沓),音量 0.85(沉闷但听得到)
      const emit=()=>{ try{ f.forEach((freq,i)=>tone(freq, i*0.01, 0.05, 'sine', 0.85)); }catch(e){} };
      // 与 play() 同样的解锁兼底:ctx 还 suspended 时轮询等变 running 再发,否则 oscillator 被静音丢弃
      if(ctx.state!=='running'){
        try{ ctx.resume(); }catch(e){}
        let tries=0;
        (function waitRun(){
          if(ctx.state==='running'){ emit(); return; }
          if(tries++>20){ emit(); return; }
          try{ ctx.resume(); }catch(e){}
          setTimeout(waitRun, 20);
        })();
      } else { emit(); }
    }
  };
})();
// 页面重新可见/获焦时主动 resume(系统静置挂起 ctx 后,切回页面自动唤醒,双保险)
// 注意:不能调 unlock(有 unlocked 守卫会直接return),用 Sfx.resumeNow() 强制 resume
try{
  var __wake=function(){ try{ if(window.Sfx&&Sfx.resumeNow) Sfx.resumeNow(); }catch(e){} };
  document.addEventListener('visibilitychange', function(){ if(!document.hidden) __wake(); }, {passive:true});
  window.addEventListener('focus', __wake, {passive:true});
  window.addEventListener('pageshow', __wake, {passive:true});
}catch(e){}
window.Sfx = Sfx;  // 显式挂全局,让 if(window.Sfx) 检查能过

/* ===== engine-music.js ===== */
// 背景音乐引擎 v2：播放真实 mp3 文件（各年代金曲风改编，循环）
// 5个时代各一首，进时代切换；可开关；淡入淡出
// mp3 路径：audio/P1.mp3 ... P5.mp3（5时代各一首胡伟立风格配乐）
// P1门户=笛+古筝 / P2 Web2.0=琵琶 / P3移动=二胡 / P4硬科技=大提琴苍劲 / P5 AI=箫空灵
// 作者 小龙虾

const Music = (function(){
  let audio=null, on=false, curIdx=-1, fadeTimer=null;
  const VOL = 0.4;  // 目标音量(背景乐,低音量不抢戏)

  function ensureAudio(){
    if(!audio){
      audio=new Audio();
      audio.loop=true;
      audio.preload='auto';
      audio.volume=0;
      audio.id='bgm-audio';
      try{ document.body.appendChild(audio); }catch(e){}
    }
    return audio;
  }
  function srcFor(idx){
    const p='P'+(idx>=0?idx+1:1);
    return 'audio/'+p+'.mp3?v=20260623k';  // 版本号破缓存(欢快版)
  }
  function fadeTo(target, ms, onDone){
    if(!audio) return;
    clearInterval(fadeTimer);
    const steps=Math.max(1, Math.floor(ms/40));
    const start=audio.volume, delta=(target-start)/steps;
    let i=0;
    fadeTimer=setInterval(()=>{
      i++; audio.volume=Math.max(0,Math.min(1,start+delta*i));
      if(i>=steps){ clearInterval(fadeTimer); audio.volume=target; if(onDone)onDone(); }
    },40);
  }

  return {
    isOn:()=>on,
    // 切到某时代的音乐(idx 0-5)。开着的话平滑换曲
    setPeriod(idx){
      curIdx=idx;
      if(!on) return;
      ensureAudio();
      const newSrc=srcFor(idx);
      if(audio.src.indexOf(newSrc)>=0) return; // 同曲不换
      // 淡出→换源→淡入
      fadeTo(0, 400, ()=>{
        audio.src=newSrc;
        audio.play().then(()=>fadeTo(VOL,600)).catch(()=>{});
      });
    },
    toggle(idx){
      ensureAudio();
      on=!on;
      if(on){
        const want=srcFor(idx>=0?idx:(curIdx>=0?curIdx:0));
        if(audio.src.indexOf(want)<0) audio.src=want;
        audio.play().then(()=>fadeTo(VOL,600)).catch(()=>{});
      } else {
        fadeTo(0, 400, ()=>{ try{audio.pause();}catch(e){} });
      }
      return on;
    },
    stop(){
      on=false;
      if(audio){ fadeTo(0,300,()=>{try{audio.pause();}catch(e){}}); }
    }
  };
})();

/* ===== 全局规范化(幂等) ===== */
if(typeof window!=='undefined'){
  if(typeof Sfx!=='undefined')window.Sfx=Sfx;
  if(typeof Music!=='undefined')window.Music=Music;
}
