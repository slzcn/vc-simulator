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
    return 'audio/'+p+'.mp3?v=20260622s';  // 版本号破缓存(欢快版)
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
