// 音效引擎：Web Audio API 纯合成（零文件/零加载/零体积）
// 跟背景乐共存，轻音量不抢戏。可全局开关(跟随音乐开关)。
// 作者 小龙虾 2026-06-21
const Sfx = (function(){
  let ctx=null, master=null, enabled=true;
  const VOL=0.32;  // 音效总音量(低于背景乐，点缀为主)

  function ensure(){
    if(!ctx){
      try{
        ctx=new (window.AudioContext||window.webkitAudioContext)();
        master=ctx.createGain(); master.gain.value=VOL; master.connect(ctx.destination);
      }catch(e){ ctx=null; }
    }
    if(ctx && ctx.state==='suspended'){ try{ctx.resume();}catch(e){} }
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
    // 选项点选：清脆短"叮"
    pick(){ tone(880, 0, 0.10, 'triangle', 0.4); tone(1320,0.02,0.08,'sine',0.25); },
    // 封存确认：稳重"咚"(盖章感)
    confirm(){ tone(330,0,0.16,'sine',0.55,180); tone(165,0,0.20,'sine',0.4,110); },
    // 按钮通用 click
    click(){ tone(660,0,0.06,'square',0.18); },
    // 翻页/推进
    swipe(){ tone(520,0,0.12,'sine',0.3,780); },
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

  return {
    setEnabled(v){ enabled=!!v; },
    isEnabled(){ return enabled; },
    play(name){
      if(!enabled) return;
      if(!ensure()) return;
      const fn=lib[name];
      if(fn){ try{ fn(); }catch(e){} }
    },
    // 揭晓一组结果：取最高档位播代表音(避免多条叠成噪音)
    revealTier(tiers){
      if(!enabled||!ensure()) return;
      const order=['SS','S','A','B','C'];
      let best='C';
      for(const t of order){ if(tiers.includes(t)){ best=t; break; } }
      this.play(best);
    }
  };
})();
