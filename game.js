const MUSIC_SVG_ON=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 010 7"/><path d="M18.5 5.5a9 9 0 010 13"/></svg>`;
const MUSIC_SVG_OFF=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="22" y1="9" x2="16" y2="15"/><line x1="16" y1="9" x2="22" y2="15"/></svg>`;
const IC_CAMERA=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`;
const IC_LINK=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`;
const IC_RESTART=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L3 8"/></svg>`;
const IC_CHART=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6"/><rect x="12.5" y="8" width="3" height="10"/><rect x="18" y="5" width="3" height="13"/></svg>`;
// === 数据合并(从配置和数据文件聚合,代码层只用 GAME 这个统一对象)===
const $game = document.getElementById('game');
const $ending = document.getElementById('ending');
const $content = document.getElementById('content');
const $periodIntro = document.getElementById('periodIntro');

const GAME = {
  start: CONFIG.start,
  titles: DATA_PERIODS.titles,
  outcomeTiers: CONFIG.outcomeTiers,
  periods: DATA_PERIODS.periods,
  endingTiers: DATA_ENDINGS.endingTiers,
  endingMeta: DATA_ENDINGS.endingMeta,
};

let state, pIdx, rIdx, selDeal, stagedThisPeriod, fullHistory, gameOver, mbti, upPicks=0;

// ===== 本地存档系统 (localStorage) =====
const SAVE_KEY=CONFIG.storage.save;
const RESULT_KEY=CONFIG.storage.result;
const STATS_KEY=CONFIG.storage.stats;
function lsGet(k){try{const v=localStorage.getItem(k);return v?JSON.parse(v):null;}catch(e){return null;}}
function lsSet(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}

// ===== 玩家身份 + 分享邀请(纯前端) =====
function getPlayerId(){
  let id=lsGet(CONFIG.storage.playerId);
  if(!id){ id='p'+Date.now().toString(36)+Math.random().toString(36).slice(2,6); lsSet(CONFIG.storage.playerId,id); }
  return id;
}
function getPlayerName(){ return lsGet(CONFIG.storage.playerName)||''; }
function setPlayerName(n){ lsSet(CONFIG.storage.playerName,n); }
// 解析URL里的邀请人(?ref=ID&n=昵称)
function getInviter(){
  try{
    const p=new URLSearchParams(location.search);
    const ref=p.get('ref'), n=p.get('n');
    if(ref && ref!==getPlayerId()){ return {id:ref, name:n?decodeURIComponent(n):'一位投资人'}; }
  }catch(e){}
  return null;
}
// 生成专属分享链接
function buildShareLink(){
  const base=location.href.split('#')[0].split('?')[0];
  const id=getPlayerId();
  const nm=getPlayerName();
  let u=base+'?ref='+encodeURIComponent(id);
  if(nm) u+='&n='+encodeURIComponent(nm);
  return u;
}
function lsDel(k){try{localStorage.removeItem(k);}catch(e){}}
// 保存中途进度(每进入一站/答题时调用)
function saveProgress(){
  if(gameOver)return;
  lsSet(SAVE_KEY,{state,pIdx,rIdx,stagedThisPeriod,fullHistory,mbti,upPicks,ts:Date.now()});
}
function clearProgress(){ lsDel(SAVE_KEY); }
// 保存完成的结果
// ===== 上报到后端(全栈版数据收集,同源fetch,静默失败不影响游戏) =====
// 上报:postMessage 给父页(全栈版iframe嵌入时父页收集);纯静态独立打开时无后端,静默
function reportApi(kind, body){
  // 纯静态托管(妙搭/GitHub Pages)无后端,仅 postMessage 给父页(全栈版iframe嵌入时收集);独立打开则静默无操作
  try{ if(window.parent && window.parent!==window){ window.parent.postMessage(Object.assign({__vcsim__:kind}, body), '*'); } }catch(e){}
}
function reportResult(payload){
  reportApi('result',{
    playerId:getPlayerId(), playerName:getPlayerName(),
    score:payload.score, title:payload.title, style:payload.styleTitle
  });
}
function reportVisit(){
  const inv=getInviter();
  reportApi('visit',{
    visitorId:getPlayerId(), playerName:getPlayerName(),
    inviterId:inv?inv.id:null, inviterName:inv?inv.name:null
  });
}
function saveResult(payload){
  reportResult(payload);
  lsSet(RESULT_KEY,payload);
  // 更新历史统计
  let st=lsGet(STATS_KEY)||{plays:0,bestScore:0,bestTitle:'',styles:{}};
  st.plays++;
  if(payload.score>st.bestScore){st.bestScore=payload.score;st.bestTitle=payload.title;}
  st.styles[payload.styleTitle]=(st.styles[payload.styleTitle]||0)+1;
  lsSet(STATS_KEY,st);
}
// 续玩：恢复存档继续
function continueGame(){
  if(window.Sfx)Sfx.play('swipe');
  const s=lsGet(SAVE_KEY); if(!s){startGame();return;}
  state={...GAME.start,...s.state}; upPicks=s.upPicks||0; pIdx=s.pIdx; rIdx=s.rIdx; stagedThisPeriod=s.stagedThisPeriod||[];
  fullHistory=s.fullHistory||[]; mbti=s.mbti||{risk:0,mind:0}; selDeal=null; gameOver=false;
  document.getElementById('cover').classList.add('hidden');
  $ending.classList.add('hidden');
  $ending.innerHTML='';
  $game.classList.remove('hidden');
  renderTop(); renderStats(true);
  maybeStartMusic();
  applyPeriodTheme(pIdx);
  showStory();
}
// 回看上次结果
function viewLastResult(){
  if(window.Sfx)Sfx.play('click');
  const r=lsGet(RESULT_KEY); if(!r){return;}
  document.getElementById('cover').classList.add('hidden');
  $game.classList.add('hidden');
  const el=$ending; el.classList.remove('hidden');
  el.innerHTML=r.html;
  // 重新挂载渲染(MBTI block 已在html里)
  window.scrollTo({top:0,behavior:'smooth'});
}
// 封面初始化：检测存档，动态加按钮
function initCover(){
  // 静态文案从 CONFIG.ui 注入(可在 config.js 里改)
  const U=CONFIG.ui;
  document.getElementById('coverYears').innerHTML=U.coverYears;
  document.getElementById('coverH1').innerHTML=U.coverTitle;
  document.getElementById('coverSub').innerHTML=U.coverSub;
  document.getElementById('coverRules').innerHTML=U.coverRules;
  document.getElementById('coverCredit').innerHTML=U.coverCredit;
  // 被邀请横幅
  const inv=getInviter(); const ib=document.getElementById('inviteBanner');
  if(inv){ ib.innerHTML=CONFIG.text.invited.replace(/\$\{name\}/g,inv.name); ib.style.display='block'; lsSet('vcsim_invited_by',inv); }
  else ib.style.display='none';
  getPlayerId(); // 确保本机有专属ID
  reportVisit(); // 上报访问(含邀请人)
  renderIntro();
  const btns=document.getElementById('coverBtns');
  const save=lsGet(SAVE_KEY), result=lsGet(RESULT_KEY), stats=lsGet(STATS_KEY);
  let html='';
  if(save){
    const yr=GAME.periods[save.pIdx]?.rounds[save.rIdx]?.year||'';
    const gi=(()=>{let n=0;for(let i=0;i<save.pIdx;i++)n+=GAME.periods[i].rounds.length;return n+save.rIdx+1;})();
    html+=`<button class="btn" onclick="continueGame()">${CONFIG.ui.btnContinue}（第${gi}站 · ${yr}年）</button>`;
    html+=`<button class="btn ghost" onclick="newGameConfirm()">${CONFIG.ui.btnRestart}</button>`;
  } else {
    html+=`<button class="btn" onclick="startGame()">${CONFIG.ui.btnStart}</button>`;
  }
  if(result){ html+=`<button class="btn ghost" onclick="viewLastResult()"><span class="btn-ic">${IC_CHART}</span>${CONFIG.ui.btnViewLast}</button>`; }
  btns.innerHTML=html;
  // 历史统计
  const sc=document.getElementById('coverStats');
  if(stats&&stats.plays>0){
    let topStyle='';let mx=0;for(const k in stats.styles){if(stats.styles[k]>mx){mx=stats.styles[k];topStyle=k;}}
    sc.innerHTML=`已玩 <b>${stats.plays}</b> 局<span class="sep">·</span>最高分 <b>${stats.bestScore}</b>`+(stats.bestTitle?`<span class="sep">·</span>最佳 <b>${stats.bestTitle.split(' ')[0]}</b>`:'')+(topStyle?`<br>最常见风格：<b>${topStyle}</b>`:'');
  } else sc.innerHTML='';
}
function renderIntro(){
  const panel=document.getElementById('tipPanel'); if(!panel)return;
  // 只取前3部分（这是什么游戏/故事背景/核心设定）
  const cards=(CONFIG.intro||[]).slice(0,3).map(c=>`
    <div class="intro-card">
      <div class="ic-icon">${c.icon}</div>
      <div class="ic-body"><div class="ic-title">${c.title}</div><div class="ic-text">${c.body}</div></div>
    </div>`).join('');
  panel.innerHTML=`
    <div class="tip-head"><span>了解玩法</span><button class="tip-close" onclick="toggleTip()">×</button></div>
    ${cards}`;
}
function toggleTip(){ if(window.Sfx)Sfx.play('click'); const m=document.getElementById('tipMask'); m.classList.toggle('hidden'); }
function closeTip(e){ if(e.target.id==='tipMask'){ if(window.Sfx)Sfx.play('click'); document.getElementById('tipMask').classList.add('hidden'); } }
function newGameConfirm(){
  if(window.Sfx)Sfx.play('click');
  if(confirm(CONFIG.ui.confirmRestart)){ goHome(); }
}
function toggleMusic(){
  if(window.Sfx)Sfx.play('click');
  const isOn=Music.toggle(typeof pIdx==='number'?pIdx:0);
  const btn=document.getElementById('musicBtn');
  btn.innerHTML=isOn?MUSIC_SVG_ON:MUSIC_SVG_OFF;
  btn.classList.toggle('on',isOn);
  lsSet(CONFIG.storage.music, isOn?1:0);
}

function startGame(){
  if(window.Sfx)Sfx.play('start');
  clearProgress();
  resetTheme();
  state={...GAME.start};
  state.spent=0;  // 累计投入(方案A:资本照常涨,评分时减此值体现钱花出去了)
  upPicks=0;
  pIdx=0; rIdx=0; selDeal=null; stagedThisPeriod=[]; fullHistory=[]; gameOver=false;
  mbti={risk:0,mind:0};
  document.getElementById('cover').classList.add('hidden');
  $ending.classList.add('hidden');
  $ending.innerHTML='';
  $game.classList.add('hidden');
  showPeriodIntro();
}
function goHome(){
  if(window.Sfx)Sfx.play('click');
  // 回到首页(封面+介绍)，清掉中途进度，让玩家从首页重新进入
  clearProgress(); resetTheme(); gameOver=false;
  stopMusic();
  $game.classList.add('hidden');
  $ending.classList.add('hidden');
  $ending.innerHTML='';
  const pi=$periodIntro; if(pi) pi.classList.add('hidden');
  document.getElementById('cover').classList.remove('hidden');
  initCover();
  window.scrollTo({top:0,behavior:'smooth'});
}
function curTitle(){return CONFIG.text.titles[pIdx]||CONFIG.text.titles[0];}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
// 默认基调(首页+结局用)，与 :root 一致
const BASE_THEME={ bg:'#f0ece2', paper:'#f5f1e8', ink:'#1a1714', soft:'#4a443c', faint:'#8c857a', line:'#d6cfc0', accent:'#b8860b' };
function applyTheme(t){
  if(!t) t=BASE_THEME;
  const r=document.documentElement.style;
  r.setProperty('--bg',t.bg);
  r.setProperty('--paper',t.paper);
  r.setProperty('--ink',t.ink);
  r.setProperty('--ink-soft',t.soft);
  r.setProperty('--ink-faint',t.faint);
  r.setProperty('--line',t.line);
  r.setProperty('--card', t.paper);
  r.setProperty('--accent', t.accent||'#8a5a3a');
  // accent 用于强调(进度条高亮/卡片描边/音乐图标等)，随时代变化
  // 直接给 html/body 设背景色(iOS Safari overscroll 橡皮筋回弹、地址栏区域露出的是 html 背景,不设会露白底)
  try{
    document.documentElement.style.backgroundColor=t.paper;
    document.body.style.backgroundColor=t.paper;
    // 同步移动端状态栏颜色(theme-color)
    var mc=document.querySelector('meta[name="theme-color"]');
    if(!mc){ mc=document.createElement('meta'); mc.name='theme-color'; document.head.appendChild(mc); }
    mc.content=t.paper;
  }catch(e){}
}
function applyPeriodTheme(idx){
  const p=GAME.periods[idx];
  applyTheme(p&&p.theme?p.theme:BASE_THEME);
}
function resetTheme(){ applyTheme(BASE_THEME); }
function globalRoundIndex(){let n=0;for(let i=0;i<pIdx;i++)n+=GAME.periods[i].rounds.length;return n+rIdx;}
// 总站数是固定值(游戏数据不变)，缓存一次即可
const TOTAL_ROUNDS=GAME.periods.reduce((n,p)=>n+p.rounds.length,0);
function totalRounds(){return TOTAL_ROUNDS;}

function showPeriodIntro(){
  maybeStartMusic();
  applyPeriodTheme(pIdx);
  const p=GAME.periods[pIdx];
  $game.classList.add('hidden');
  const el=$periodIntro;
  el.classList.remove('hidden');
  el.innerHTML=`
    <div class="roman">${p.roman}</div>
    <div class="pname">${p.name}</div>
    <div class="pspan">${p.span}</div>
    <div class="pintro">${p.intro}</div>
    <button class="btn" onclick="enterPeriod()">${CONFIG.text.btnEnterPeriod}</button>`;
  window.scrollTo({top:0});
}
function enterPeriod(){
  if(window.Sfx)Sfx.play('swipe');
  saveProgress();
  maybeStartMusic();
  applyPeriodTheme(pIdx);
  $periodIntro.classList.add('hidden');
  $game.classList.remove('hidden');
  renderTop(); renderStats(true);
  showScenario();  // 先答本时期的情境题(测MBTI)，再进投资
}
function showScenario(){
  const p=GAME.periods[pIdx];
  const sc=MBTI.scenarios[p.id];
  if(!sc){ showStory(); return; }
  const opts=sc.opts.map((o,i)=>`<div class="sc-opt" data-i="${i}" onclick="pickScenario(${i})">${o.t}</div>`).join('');
  $content.innerHTML=`
    <div class="scenario">
      <div class="sc-mark">— 投资人格测试 · ${p.roman} —</div>
      <div class="sc-q">${sc.q}</div>
      <div class="sc-opts">${opts}</div>
    </div>`;
  window.scrollTo({top:0,behavior:'smooth'});
}
function pickScenario(i){
  if(window.Sfx)Sfx.play('pick');
  const p=GAME.periods[pIdx];
  const o=MBTI.scenarios[p.id].opts[i];
  if(o.e){for(const k in o.e)mbti[k]+=o.e[k];}
  // 选中反馈:仅选中的选项出波纹+弹入效果
  document.querySelectorAll('.sc-opt').forEach(el=>el.classList.toggle('picked',+el.dataset.i===i));
  const sel=document.querySelector('.sc-opt[data-i="'+i+'"]');
  if(sel && window._vcAnim){ const r=sel.getBoundingClientRect(); window._vcAnim.ripple(sel, r.left+r.width/2, r.top+r.height/2); window._vcAnim.anim(sel,'bounce'); }
  setTimeout(()=>showStory(),420);
}
function renderTop(){
  const p=GAME.periods[pIdx], r=p.rounds[rIdx];
  document.getElementById('roundNo').textContent=globalRoundIndex()+1;
  document.getElementById('roundTotal').textContent=totalRounds();
  document.getElementById('eraPill').textContent=r.year+' · '+r.era;
  document.getElementById('titleNow').textContent=curTitle();
  renderProgress();
}

function renderProgress(){
  const el=document.getElementById('periodProgress'); if(!el)return;
  el.innerHTML=GAME.periods.map((p,i)=>{
    const cls=i<pIdx?'done':(i===pIdx?'cur':'');
    return `<div class="pp-seg ${cls}"><div class="rn">${p.roman}</div><div class="bar"></div><div class="lbl">${p.name}</div></div>`;
  }).join('');
}
// 属性条映射表(固定,提到函数外避免每次重建)
const STAT_MAP=[['Aum','aum'],['Track','track'],['Net','network'],['Luck','luck'],['Health','health']];
function renderStats(instant,deltas){
  const SM=CONFIG.statMax;
  for(const [id,key] of STAT_MAP){
    const max=SM[key];
    document.getElementById('v'+id).textContent=Math.round(state[key]);
    const pct=clamp(state[key]/max*100,0,100);
    const bar=document.getElementById('b'+id);
    if(instant){bar.style.transition='none';bar.style.width=pct+'%';setTimeout(()=>bar.style.transition='',50);}
    else bar.style.width=pct+'%';
    const dEl=document.getElementById('d'+id);
    if(deltas&&deltas[key]){const d=Math.round(deltas[key]);dEl.textContent=(d>0?'+':'')+d;dEl.className='delta '+(d>0?'up':'down');}
    else dEl.textContent='';
  }
}
function showStory(){
  saveProgress();
  const r=GAME.periods[pIdx].rounds[rIdx];
  $content.innerHTML=`
    <div class="narr"><div class="era-line">${r.year} 年 · <b>${r.era}</b></div><div class="story">${r.story}</div></div>
    <div class="center-btn"><button class="btn" onclick="showChoices()">${CONFIG.text.btnSeeChoices}</button></div>`;
  window.scrollTo({top:0,behavior:'smooth'});
}
function trendLabel(t){
  return {up:['📈','顺应时代趋势'],hot:['🔥','风口过热，泡沫与机会并存'],down:['📉','逆势夕阳，但若成则爆'],safe:['🛡','稳健确定，放弃暴利']}[t]||['',''];
}
function showChoices(preselectIdx){
  if(window.Sfx)Sfx.play('swipe');
  const r=GAME.periods[pIdx].rounds[rIdx]; selDeal=null;
  // ===== 统一门槛系统 gate:{type:'aum'|'track'|'health', min} 每项最多1个 =====
  // 资本/业绩=硬门槛(属性<min直接锁); 健康=软门槛(运气降门槛+随机扰动,精力波动感)
  // gateLock[i]: 0=不锁 / 'aum' / 'track' / 'health'(锁定原因)
  let gateLock=r.deals.map((d,i)=>{
    const g=d.gate; if(!g) return 0;
    if(g.type==='aum')   return state.aum   < g.min ? 'aum'   : 0;
    if(g.type==='track') return state.track < g.min ? 'track' : 0;
    if(g.type==='health') return state.health < g.min ? 'health' : 0;  // 硬门槛:所见即所得(健康<显示门槛就锁)
    return 0;
  });
  // 防死局铁律1：全锁 → 强制解锁"门槛最低"的1个(总能投点什么)
  if(gateLock.every(x=>x)){
    let minG=1e9, unlockIdx=0;
    r.deals.forEach((d,i)=>{ const m=(d.gate&&d.gate.min)||0; if(m<minG){minG=m;unlockIdx=i;} });
    gateLock[unlockIdx]=0;
  }
  // ===== 投入校验:资本<投入amt → 标记"小额参投"(可投但回报×0.5,体现钱不够只能少投,不死局) =====
  // smallSet[i]=true 表示该项资本不够投全额,只能小额参投
  let smallSet=r.deals.map((d,i)=>{
    if(gateLock[i]) return false;          // 已被门槛锁的不管
    return (d.amt||0) > state.aum;          // 资本 < 投入 → 小额参投
  });
  // 防死局:若全部"未锁项"都资本不够(全是小额),也没关系——小额仍可投,不死局
  // (这正是小额参投存在的意义:钱再少也能凑合投点)
  let cards=r.deals.map((d,i)=>{
    const [ti,tl]=trendLabel(d.trend);
    const lk = gateLock[i];
    const small = smallSet[i];
    const afford = !lk;
    const lockTxt = lk==='aum'?(CONFIG.text.lockNoAum||'资本不足') : lk==='track'?(CONFIG.text.lockNoTrack||'声望不足') : lk==='health'?(CONFIG.text.lockNoHealth||'精力不足') : '';
    const lockNote = lk ? `<div class="lock-note" style="color:var(--bad)">${lockTxt}</div>` : (small?`<div class="lock-note" style="color:var(--warn)">${CONFIG.text.lockSmall}</div>`:'');
    return `
    <div class="deal ${afford?'':'locked'}" data-i="${i}" ${afford?`onclick="pickDeal(${i})"`:''}>
      ${afford&&!small?'<div class="pick-tag">✓</div>':lockNote}
      <div class="sector">${d.tag}</div>
      <div class="nm">${d.name}</div>
      <div class="ds">${d.desc}</div>
      <div class="meta">
        <div class="mi"><div class="k">轮次</div><div class="v">${d.round}</div></div>
        <div class="mi"><div class="k">估值</div><div class="v">${d.val}</div></div>
        <div class="mi"><div class="k">需投入</div><div class="v">${d.amt?d.amt+'M':'——'}</div></div>
        <div class="mi"><div class="k">门槛</div><div class="v">${d.gate?(d.gate.type==='aum'?'资本≥'+d.gate.min:d.gate.type==='track'?'业绩≥'+d.gate.min:'健康≥'+d.gate.min):'无'}</div></div>
      </div>
      <div class="trend ${d.trend}">${ti} ${tl}</div>
    </div>`;}).join('');
  window._smallSet = smallSet;
  $content.innerHTML=`
    <div class="choice-head"><h2>${CONFIG.text.choiceTitle.replace('${year}',r.year)}</h2><p>${CONFIG.text.choiceSub.replace('${title}',curTitle())}</p>
    <p class="pending">${CONFIG.text.choicePending}</p></div>
    <div class="deals">${cards}</div>
    <div class="center-btn"><button class="btn" id="confirmBtn" disabled onclick="confirmDeal()">${CONFIG.text.btnConfirmPick}</button></div>`;
  window.scrollTo({top:0,behavior:'smooth'});
  // 重选本站时,恢复之前选中的项目高亮
  if(typeof preselectIdx==='number' && preselectIdx>=0){
    const card=document.querySelector('.deal[data-i="'+preselectIdx+'"]');
    if(card && !card.classList.contains('locked')) pickDeal(preselectIdx);
  }
}
function pickDeal(i){
  selDeal=i;
  if(window.Sfx)Sfx.play('pick');
  document.querySelectorAll('.deal').forEach(el=>el.classList.toggle('sel',+el.dataset.i===i&&!el.classList.contains('locked')));
  const b=document.getElementById('confirmBtn');b.textContent=CONFIG.text.btnConfirmed;b.disabled=false;
}
function confirmDeal(){
  if(selDeal===null)return;
  if(window.Sfx)Sfx.play('confirm');
  const p=GAME.periods[pIdx], r=p.rounds[rIdx], d=r.deals[selDeal];
  const small = !!(window._smallSet && window._smallSet[selDeal]);
  // 投资选择按 trend 暗含性格倾向，累积 MBTI 分
  const tm2=TREND_MBTI[d.trend]; if(tm2){for(const k in tm2)mbti[k]+=tm2[k];}
  // 记累计投入(方案A:不扣资本数值,仅记录,评分时减)
  state.spent=(state.spent||0)+(d.amt||0);
  stagedThisPeriod.push({year:r.year, deal:d, tag:d.tag, name:d.name, small, amt:d.amt||0});
  // 显示"已封存"页（提供重选入口，未揭晓前可反悔）
  $content.innerHTML=`
    <div class="staged">
      <div class="seal">📜</div>
      <h2>${CONFIG.text.stagedTitle}</h2>
      <div class="pick-name">${d.tag} · ${d.name}</div>
      <div class="tip">${CONFIG.text.stagedTip.replace('${amt}',d.amt)}</div>
      <div class="staged-actions">
        <button type="button" class="undo-icon" onclick="undoStaged()" title="${CONFIG.text.stagedUndo}" aria-label="重选本站"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg></button>
        <button type="button" class="btn" onclick="advance()">${rIdx>=p.rounds.length-1?CONFIG.text.btnWitness:CONFIG.text.btnContinue}</button>
      </div>
    </div>`;
  window.scrollTo({top:0,behavior:'smooth'});
}
// 未揭晓前撤回当前这笔押注，重新选择本站（回滚 MBTI 加分）
function undoStaged(){
  if(window.Sfx)Sfx.play('click');
  if(!stagedThisPeriod.length) return;
  const last=stagedThisPeriod.pop();
  state.spent=Math.max(0,(state.spent||0)-(last.amt||last.deal.amt||0));  // 撤销:投入加回来
  const tm=TREND_MBTI[last.deal.trend]; if(tm){for(const k in tm)mbti[k]-=tm[k];}
  selDeal=null; saveProgress();
  const r=GAME.periods[pIdx].rounds[rIdx];
  const prevIdx=r.deals.findIndex(x=>x.name===last.deal.name && x.tag===last.deal.tag);
  showChoices(prevIdx);
}
function advance(){
  if(window.Sfx)Sfx.play('swipe');
  const p=GAME.periods[pIdx];
  if(rIdx>=p.rounds.length-1){ revealPeriod(); }
  else { rIdx++; renderTop(); showStory(); }
}

// 概率结算：base + luck修正 + 随机 → 5档
function rollOutcome(d){
  if(d.trend==='safe') return 'A';
  const P=CONFIG.probability;
  // 运气影响胜率: 实际胜率 = clamp(base + (运气-50)/50 * luckEffect, 0, 1)
  const luckAdj=((state.luck-50)/50)*(CONFIG.luckEffect||0.3);
  const tb=(P.trendBoost&&P.trendBoost[d.trend])||0;
  let p=clamp(d.base+luckAdj+tb, 0, 1);
  const dice=Math.random();
  const perf=p*P.perfWeight.base+(1-dice)*P.perfWeight.dice;
  if(perf>=P.tierCuts.SS) return 'SS';
  if(perf>=P.tierCuts.S)  return 'S';
  if(perf>=P.tierCuts.A)  return 'A';
  if(perf>=P.tierCuts.B)  return 'B';
  return 'C';
}
function revealPeriod(){
  const p=GAME.periods[pIdx];
  const results=stagedThisPeriod.map(s=>{
    const d=s.deal;
    const tier=rollOutcome(d);
    const tm=GAME.outcomeTiers[tier];
    const sf=s.small?CONFIG.smallTicketFactor:1;
    // 趋势回报修正(仅正收益)：顺势边际递减、风口博中超额
    const TR=CONFIG.trendReturn; let tg=1;
    if(tm.mult>0){
      if(d.trend==='up'){ tg=Math.max(TR.upFloor, Math.pow(TR.upDecay, upPicks)); }
      else if(d.trend==='hot'||d.trend==='down'){ tg=TR.hotGain; }
    }
    if(d.trend==='up') upPicks++;
    const eff=tm.mult*tg;
    const da={aum:Math.round(d.w.aum*eff*sf), track:Math.round(d.w.track*eff*sf), net:Math.round((d.w.net||0)*Math.max(0.3,eff>0?eff:0.3)*sf)};
    const dl=CONFIG.luckDelta[tier]||0;
    const HC=CONFIG.health;
    let dh=-Math.round(HC.baseDecay+pIdx*HC.rampPerPeriod);  // 取整,健康始终整数(不出现小数)
    if(tier==='C')dh-=HC.extraOnVeryBad;
    else if(tier==='B')dh-=HC.extraOnBad;
    else if(tier==='SS')dh+=HC.bonusOnGreat;
    return {s,d,tier,tm,da,dl,dh};
  });
  // 应用所有结果
  results.forEach(R=>{
    state.aum=Math.max(0,state.aum+R.da.aum);
    state.track=Math.max(0,state.track+R.da.track);
    state.network=Math.max(0,state.network+R.da.net);
    state.luck=clamp(state.luck+R.dl,0,CONFIG.statMax.luck);
    state.health=clamp(state.health+R.dh,CONFIG.health.minHealth,CONFIG.health.maxHealth);
    R.s.tier=R.tier; R.s.da=R.da;
    fullHistory.push({year:R.s.year, tag:R.s.tag, name:R.s.name, tier:R.tier});
  });
  if(window.Sfx)Sfx.revealTier(results.map(R=>R.tier));
  renderStats(false);
  setTimeout(()=>renderTop(),300);

  const tierText=(d,tier)=>{
    const tpl=CONFIG.text['tier'+tier]||'';
    return tpl.replace(/\$\{name\}/g,d.name).replace(/\$\{why\}/g,d.why||'');
  };
  let items=results.map((R,k)=>{
    const dc=(l,v,key)=>v?`<span class="${v>0?'u':'d'}"><span class="lbl">${l}</span>${v>0?'+':''}${v}</span>`:'';
    return `
    <div class="reveal-item" style="animation-delay:${k*0.12}s">
      <div class="rtop">
        <span class="ryear">${R.s.year} · ${R.s.tag}</span>
        <span class="rname">${R.s.name}</span>
        <span class="rtier ${R.tm.cls}">${R.tm.emoji} ${R.tm.label}</span>
      </div>
      <div class="rtext">${tierText(R.d,R.tier)}</div>
      <div class="rdeltas">${dc('资本',R.da.aum)}${dc('业绩',R.da.track)}${dc('人脉',R.da.net)}</div>
    </div>`;}).join('');

  // 健康归零 → 提前出局
  const healthDead = state.health<=0;
  const isLast = pIdx>=GAME.periods.length-1;
  let btnLabel = healthDead ? CONFIG.text.btnAfterPeriod.dead : (isLast ? CONFIG.text.btnAfterPeriod.last : CONFIG.text.btnAfterPeriod.next);
  $content.innerHTML=`
    <div class="verdict">
      <div class="vhead"><div class="vmark">${CONFIG.text.verdictMark}</div><h2>${p.roman} ${p.name}</h2></div>
      <div class="vtext">${p.verdict}</div>
      ${items}
      ${healthDead?`<div class="vtext" style="color:var(--bad);text-indent:0;text-align:center;margin-top:20px;">${CONFIG.text.healthDeadWarn}</div>`:''}
      <div class="center-btn"><button class="btn" onclick="afterPeriod(${healthDead})">${btnLabel}</button></div>
    </div>`;
  window.scrollTo({top:0,behavior:'smooth'});
}
function afterPeriod(healthDead){
  if(window.Sfx)Sfx.play('swipe');
  stagedThisPeriod=[];
  if(healthDead){ showEnding(true); return; }
  if(pIdx>=GAME.periods.length-1){ showEnding(false); return; }
  pIdx++; rIdx=0; showPeriodIntro();
}


function calcStyle(){
  const TH=CONFIG.mbtiMidThreshold;
  const r=mbti.risk, m=mbti.mind;
  const rMid=Math.abs(r)<=TH, mMid=Math.abs(m)<=TH;
  let key;
  if(rMid && mMid) key='balanced';        // 两维都模糊 → 均衡型
  else {
    const rk=r>=0?'aggressive':'steady';
    const mk=m>=0?'emotional':'rational';
    key=rk+'_'+mk;
  }
  return MBTI.styles[key];
}
function mbtiDimBars(){
  // 返回两维度偏向百分比(50中点)。单维度极端累计≈5题×3=15，取 14 为归一化分母
  const norm=(v,max)=>clamp(50+v/max*50,6,94);
  return {
    risk:{val:mbti.risk, pct:norm(mbti.risk,14)},
    mind:{val:mbti.mind, pct:norm(mbti.mind,14)},
  };
}
function calcScore(){
  // 净值线性评分(2026-06-22重构): 总分 = (资本-100-累计投入)*a + (业绩-100)*b + (人脉-100)*c
  const C=CONFIG.scoreCoef;
  const spent=state.spent||0;
  const aumNet=Math.max(0,(state.aum||0)-100-spent);
  const trackNet=Math.max(0,(state.track||0)-100);
  const netNet=Math.max(0,(state.network||0)-100);
  let s=aumNet*C.a + trackNet*C.b + netNet*C.c;
  if(state.health<=0) s*=CONFIG.deadPenalty;
  return Math.round(Math.max(0, Math.min(CONFIG.scoreClampMax||1000, s)));
}
function pickEnding(score,healthDead){
  if(healthDead && state.track<CONFIG.healthDeath.earlyOutTrackCap) return GAME.endingMeta.earlyout;
  let key='exit';
  for(const t of GAME.endingTiers){ if(score>=t.min){key=t.key;break;} }
  return GAME.endingMeta[key];
}
function showEnding(healthDead){
  gameOver=true;
  resetTheme();
  stopMusic();
  const score=calcScore();
  const meta=pickEnding(score,healthDead);
  if(window.Sfx){ const _s=score; setTimeout(()=>{ if(healthDead)Sfx.play('lose'); else if(_s>=CONFIG.scoreTiersForSfx.big)Sfx.play('winBig'); else if(_s>=CONFIG.scoreTiersForSfx.mid)Sfx.play('winMid'); else if(_s>=CONFIG.scoreTiersForSfx.neutral)Sfx.play('neutral'); else Sfx.play('lose'); }, 350); }
  $game.classList.add('hidden');
  const el=$ending;el.classList.remove('hidden');
  const order={SS:5,S:4,A:3,B:2,C:1};
  const wins=fullHistory.filter(h=>h.tier==='SS'||h.tier==='S').sort((a,b)=>order[b.tier]-order[a.tier]);
  const loses=fullHistory.filter(h=>h.tier==='C'||h.tier==='B').sort((a,b)=>order[a.tier]-order[b.tier]);
  const best=wins[0], worst=loses[0];
  const ocL={SS:'传奇',S:'命中',A:'保本',B:'失利',C:'惨败'};
  const recRows=fullHistory.map(h=>`<div class="rec-row"><span class="yr">${h.year}</span><span class="dl">${h.tag} · ${h.name}</span><span class="oc rtier ${GAME.outcomeTiers[h.tier].cls}">${ocL[h.tier]}</span></div>`).join('');
  const winCnt=fullHistory.filter(h=>h.tier==='SS'||h.tier==='S').length;
  const loseCnt=fullHistory.filter(h=>h.tier==='C'||h.tier==='B').length;
  el.innerHTML=`
    <div class="share-card" id="shareCard" style="--accent-c:${meta.color};--ending-bg:${meta.bg||'#f5f1e8'};--ending-glow:${meta.glow||'rgba(184,134,11,.1)'}">
      <div class="sc-head"><div class="emoji">${meta.emoji}</div><div class="rank-label">二 十 六 年 · 终 局</div><h1>${meta.title}</h1></div>
      <div class="sc-quote">「${meta.quote}」</div>
      <div class="sc-summary">${meta.summary}</div>
      <div class="sc-stats">
        <div class="fs"><div class="k">综合评分</div><div class="v">${score}</div></div>
        <div class="fs"><div class="k">最终资本</div><div class="v">${Math.round(state.aum)}</div></div>
        <div class="fs"><div class="k">业绩声望</div><div class="v">${Math.round(state.track)}</div></div>
        <div class="fs"><div class="k">命中/踩坑</div><div class="v">${winCnt}/${loseCnt}</div></div>
      </div>
      <div class="sc-highlights">
        <div class="hl-box win"><div class="t">🏆 封神一投</div>${best?`<div class="nm">${best.name}</div><div class="yr">${best.year} · ${best.tag} · ${ocL[best.tier]}</div>`:`<div class="none">这一生，未曾抓住真正的大鱼</div>`}</div>
        <div class="hl-box lose"><div class="t">💀 至暗一坑</div>${worst?`<div class="nm">${worst.name}</div><div class="yr">${worst.year} · ${worst.tag} · ${ocL[worst.tier]}</div>`:`<div class="none">谨慎如你，未踩重大深坑</div>`}</div>
      </div>
      <div class="mbti-block" id="mbtiBlock"></div>
      <div class="sc-record" id="scRecord"><h3>— 二十六年投资轨迹 —</h3>${recRows}</div>
      <div class="sc-foot"><div class="sc-qr" id="scQr"></div><div class="sc-foot-txt">中国创业投资模拟器 · <b>2000—2026</b> · 🦞 小龙虾出品<div class="qr-tip">长按扫码走一遍你的投资人生 · 仅供娱乐</div></div></div>
    </div>
    <div class="share-actions">
      <button class="btn" onclick="genImage()"><span class="btn-ic">${IC_CAMERA}</span>${CONFIG.text.genImage}</button>
      <button class="btn ghost" onclick="copyLink()"><span class="btn-ic">${IC_LINK}</span>复制分享</button>
      <button class="btn ghost" onclick="goHome()"><span class="btn-ic">${IC_RESTART}</span>重新开始</button>
    </div>
    <div class="share-hint">长图生成后会弹出预览，手机端长按图片即可保存到相册<br>复制链接发给朋友，挑战谁是更强的投资人</div>`;
  renderMBTI();
  renderShareQR();   // 生成分享二维码(指向当前游戏链接,html2canvas会一起截进长图)
  // 保存本局结果(供回看) + 清掉中途进度
  gameOver=true; clearProgress();
  const sty=calcStyle();
  saveResult({
    html: $ending.innerHTML,
    title: meta.title, score: score, styleTitle: sty.title, ts: Date.now()
  });
  initCover(); // 刷新封面按钮(下次回来能回看)
  window.scrollTo({top:0,behavior:'smooth'});
}
function renderMBTI(){
  const sty=calcStyle();
  const bars=mbtiDimBars();
  const el=document.getElementById('mbtiBlock'); if(!el)return;
  // 双向刻度条：左端=neg(稳健/理性)，右端=pos(激进/感性)，圆点落在pct处
  const dimRows=MBTI.dims.map(dm=>{
    const b=bars[dm.key];
    return `<div class="dm2-row">
      <div class="dm2-left">${dm.neg}</div>
      <div class="dm2-track"><div class="dm2-fill" style="left:${Math.min(50,b.pct)}%;width:${Math.abs(b.pct-50)}%"></div><div class="dm2-dot" style="left:${b.pct}%"></div></div>
      <div class="dm2-right">${dm.pos}</div>
    </div>`;
  }).join('');
  el.innerHTML=`
    <div class="mbti-head"><h3>${CONFIG.text.mbtiHead}</h3></div>
    <div class="mbti-card" style="--mc:${sty.color}">
      <div class="mc-emoji">${sty.emoji}</div>
      <div class="mc-title">${sty.title}</div>
      <div class="mc-sub">${sty.sub}</div>
      <div class="mc-tag">${sty.tag}</div>
      <div class="mc-desc">${sty.desc}</div>
    </div>
    <div class="mbti-dims2">${dimRows}</div>`;
}

function toast(msg,ms){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');clearTimeout(window._tt);window._tt=setTimeout(()=>t.classList.remove('show'),ms||2200);}
function genImage(){
  if(window.Sfx)Sfx.play('click');
  const card=document.getElementById('shareCard');
  // 截图前临时隐藏「二十六年投资轨迹」明细块(页面仍显示,只是不进长图,避免截图过长)
  const rec=document.getElementById('scRecord');
  const recPrevDisplay = rec ? rec.style.display : null;
  if(rec) rec.style.display='none';
  toast(CONFIG.text.genImageWait,4000);
  setTimeout(()=>{
    html2canvas(card,{scale:2,backgroundColor:'#f5f1e8',useCORS:true,logging:false,windowWidth:card.scrollWidth}).then(canvas=>{
      if(rec) rec.style.display = recPrevDisplay || '';  // 截完立即恢复显示
      const dataUrl=canvas.toDataURL('image/png');
      const modal=document.getElementById('imgModal');
      document.getElementById('imgOut').src=dataUrl;
      document.getElementById('imgTip').innerHTML=CONFIG.text.genImageTip;
      modal.classList.add('show');
      toast(CONFIG.text.genImageOk,1500);
    }).catch(e=>{if(rec) rec.style.display = recPrevDisplay || '';console.error(e);toast(CONFIG.text.genImageFail,3000);});
  },80);
}

function renderShareQR(){
  try{
    var box=document.getElementById('scQr'); if(!box||typeof QRCode==='undefined') return;
    box.innerHTML='';
    // 二维码固定指向公网稳定地址(不用当前域,避免妙搭域名/301跳转扫不出),带上该局 ref/名字
    var pub='https://slzcn.github.io/vc-simulator/';
    var id=(typeof getPlayerId==='function')?getPlayerId():'';
    var nm=(typeof getPlayerName==='function')?getPlayerName():'';
    var target=pub+'?ref='+encodeURIComponent(id||'');
    if(nm) target+='&n='+encodeURIComponent(nm);
    // 用本地 qrcodejs 生成(不跨域),底层位图 240 提清晰度,纠错级 H
    new QRCode(box, { text:target, width:240, height:240, colorDark:'#1a1714', colorLight:'#ffffff', correctLevel:QRCode.CorrectLevel.H });
    // 【关键修复】qrcodejs 生成的码四周没有静默区(quiet zone),扫码器/微信长按难识别。
    // 生成后用 canvas 给位图四周加足够白边后重新入画。
    setTimeout(function(){
      try{
        var node=box.querySelector('img,canvas'); if(!node) return;
        var src=(node.tagName==='IMG')?node.src:node.toDataURL('image/png');
        var im=new Image();
        im.onload=function(){
          var q=Math.round(im.width*0.08); // 白边=码宽的8%(规范最小≥4模块约7-8%,单层白边,既安全又不显空)
          var size=im.width+q*2;
          var cv=document.createElement('canvas'); cv.width=size; cv.height=size;
          var ctx=cv.getContext('2d');
          ctx.fillStyle='#ffffff'; ctx.fillRect(0,0,size,size);
          ctx.drawImage(im,q,q,im.width,im.height);
          box.innerHTML='';
          var out=document.createElement('img');
          out.src=cv.toDataURL('image/png');
          out.alt='扫码试玩'; out.style.display='block';
          out.style.width='80px'; out.style.height='80px';
          box.appendChild(out);
        };
        im.src=src;
      }catch(e){}
    }, 30);
  }catch(e){ /* 二维码生成失败不影响长图 */ }
}

function closeImg(){ if(window.Sfx)Sfx.play('click'); document.getElementById('imgModal').classList.remove('show'); }
function copyLink(){
  if(window.Sfx)Sfx.play('click');
  let nm=getPlayerName();
  if(!nm){
    const input=prompt(CONFIG.text.promptName,'');
    if(input&&input.trim()){ nm=input.trim().slice(0,12); setPlayerName(nm); }
  }
  const url=buildShareLink();
  const who=nm?nm+'（我）':'我';
  const txt=`${who}在「中国创业投资模拟器」走完了二十六年创投人生，来挑战你的投资判断力，看看你能不能超过我 👉 ${url}`;
  if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(txt).then(()=>toast(CONFIG.text.copyOk),()=>fb(txt));}
  else fb(txt);
  function fb(t){const ta=document.createElement('textarea');ta.value=t;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();try{document.execCommand('copy');toast(CONFIG.text.copyOk);}catch(e){toast(CONFIG.text.copyFail);}ta.remove();}
}
initCover();

// ===== 音乐：仅在游戏过程中(第一章起)播放/显示按钮，首页/结局静音且隐藏按钮 =====
// 加载时不显示按钮。进时代由 maybeStartMusic 触发显示+播放,离开由 stopMusic 隐藏。
// 进入游戏时段调用：若偏好为开则启动当前时代音乐
function maybeStartMusic(){
  if(!CONFIG.music.enabled) return;
  // 进游戏时显示按钮(让用户能关掉)
  const btn=document.getElementById('musicBtn');
  btn.style.display='flex';
  const pref=lsGet(CONFIG.storage.music);
  const wantOn=(pref===null||pref===undefined)?CONFIG.music.defaultOn:(pref===1);
  if(!wantOn){ btn.innerHTML=MUSIC_SVG_OFF; btn.classList.remove('on'); return; }
  if(!Music.isOn()){
    Music.toggle(typeof pIdx==='number'?pIdx:0);
    btn.innerHTML=MUSIC_SVG_ON; btn.classList.add('on');
  } else {
    Music.setPeriod(typeof pIdx==='number'?pIdx:0);
  }
}
// 离开游戏(回首页/结局)调用：停音乐
function stopMusic(){
  if(Music.isOn()){ Music.stop(); }
  const btn=document.getElementById('musicBtn');
  btn.innerHTML=MUSIC_SVG_OFF; btn.classList.remove('on');
  btn.style.display='none';  // 首页/结局隐藏按钮
}

// ===== 点击灵动效果：波纹 + 按元素类型差异化动画 =====
(function(){
  function spawnRipple(el, x, y){
    try{
      const r=el.getBoundingClientRect();
      const size=Math.max(r.width, r.height);
      const rip=document.createElement('span');
      rip.className='ripple';
      rip.style.width=rip.style.height=size+'px';
      rip.style.left=(x-r.left-size/2)+'px';
      rip.style.top=(y-r.top-size/2)+'px';
      el.appendChild(rip);
      setTimeout(()=>rip.remove(), 650);
    }catch(e){}
  }
  function addAnim(el, cls){
    el.classList.remove(cls);
    void el.offsetWidth; // 重排以重启动画
    el.classList.add(cls);
    setTimeout(()=>el.classList.remove(cls), 600);
  }
  // 暴露给 pickScenario 等选中逻辑调用(选中那刻才出效果)
  window._vcAnim={ ripple:spawnRipple, anim:addAnim };
  document.addEventListener('pointerdown', function(e){
    const x=e.clientX, y=e.clientY;
    // 主按钮
    const btn=e.target.closest('.btn');
    if(btn){ spawnRipple(btn,x,y); addAnim(btn,'tapped'); return; }
    // 投资卡
    const deal=e.target.closest('.deal:not(.locked)');
    if(deal){ spawnRipple(deal,x,y); addAnim(deal,'pulse'); return; }
    // 情境选项
    // 情境选项不在这里触发:改为选中那刻(pickScenario)才出效果
    // 图标按钮(音乐/返回/info/玩法关闭)
    const icon=e.target.closest('.music-btn,.undo-icon,.info-btn,.tip-close');
    if(icon){ addAnim(icon,'icon-tap'); return; }
  }, true);

  // ===== Hover 轻量音效 (仅 PC 鼠标触发) =====
  // 使用 pointerenter 接近原生 hover 语义(不冒泡、不重复触发)
  // 触屏 pointerType=='touch' 跳过;锁定状态的 deal 不响
  let lastHoverEl=null;
  document.addEventListener('pointerover', function(e){
    if(e.pointerType!=='mouse') return;  // 触屏/笔不响 hover
    if(!window.Sfx || !Sfx.isHoverEnabled || !Sfx.isHoverEnabled()) return;
    if(Sfx.unlock) Sfx.unlock();  // 双保险:确保音频上下文已解锁(hover 本身不算手势,依赖之前点击过)
    let kind=null, target=null;
    if(target=e.target.closest('.btn:not(:disabled)')){ kind='btn'; }
    else if(target=e.target.closest('.deal:not(.locked)')){ kind='deal'; }
    else if(target=e.target.closest('.scenario .sc-opt')){ kind='opt'; }
    else if(target=e.target.closest('.music-btn,.undo-icon,.info-btn,.tip-close')){ kind='icon'; }
    if(!kind) return;
    if(target===lastHoverEl) return;  // 同元素不重复响(子元素冒泡进来不重响)
    lastHoverEl=target;
    Sfx.playHover(kind);
  }, true);
  // 鼠标离开所有可点元素时,重置 lastHoverEl(进出同元素可重响一次)
  document.addEventListener('pointerout', function(e){
    if(e.pointerType!=='mouse') return;
    const t=e.relatedTarget;
    // 鼠标进入的不是可点元素 → 重置
    if(!t || !t.closest || !t.closest('.btn,.deal,.scenario .sc-opt,.music-btn,.undo-icon,.info-btn,.tip-close')){
      lastHoverEl=null;
    }
  }, true);
})();
