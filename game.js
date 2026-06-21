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
function saveResult(payload){
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
function toggleTip(){ const m=document.getElementById('tipMask'); m.classList.toggle('hidden'); }
function closeTip(e){ if(e.target.id==='tipMask') document.getElementById('tipMask').classList.add('hidden'); }
function newGameConfirm(){
  if(confirm(CONFIG.ui.confirmRestart)){ goHome(); }
}
function toggleMusic(){
  const isOn=Music.toggle(typeof pIdx==='number'?pIdx:0);
  const btn=document.getElementById('musicBtn');
  btn.innerHTML=isOn?MUSIC_SVG_ON:MUSIC_SVG_OFF;
  btn.classList.toggle('on',isOn);
  if(window.Sfx)Sfx.setEnabled(isOn);
  lsSet(CONFIG.storage.music, isOn?1:0);
}

function startGame(){
  clearProgress();
  resetTheme();
  state={...GAME.start};
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
}
function applyPeriodTheme(idx){
  const p=GAME.periods[idx];
  applyTheme(p&&p.theme?p.theme:BASE_THEME);
}
function resetTheme(){ applyTheme(BASE_THEME); }
function globalRoundIndex(){let n=0;for(let i=0;i<pIdx;i++)n+=GAME.periods[i].rounds.length;return n+rIdx;}
function totalRounds(){let n=0;GAME.periods.forEach(p=>n+=p.rounds.length);return n;}

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
  const p=GAME.periods[pIdx];
  const o=MBTI.scenarios[p.id].opts[i];
  if(o.e){for(const k in o.e)mbti[k]+=o.e[k];}
  // 选中反馈后进入投资叙事
  document.querySelectorAll('.sc-opt').forEach(el=>el.classList.toggle('picked',+el.dataset.i===i));
  setTimeout(()=>showStory(),320);
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
function renderStats(instant,deltas){
  const SM=CONFIG.statMax;
  const map=[['Aum','aum',SM.aum],['Track','track',SM.track],['Net','network',SM.network],['Luck','luck',SM.luck],['Health','health',SM.health]];
  for(const [id,key,max] of map){
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
  const r=GAME.periods[pIdx].rounds[rIdx]; selDeal=null;
  // 防死局：若所有项目都投不起，把门槛最低的项目标记为"可小额参投"(回报减半)
  const anyAfford = r.deals.some(d=>state.aum>=d.minAUM);
  let smallTicketIdx = -1;
  if(!anyAfford){
    let minM=1e9;
    r.deals.forEach((d,i)=>{ if(d.minAUM<minM){minM=d.minAUM;smallTicketIdx=i;} });
  }
  let cards=r.deals.map((d,i)=>{
    const [ti,tl]=trendLabel(d.trend);
    const small = (i===smallTicketIdx);
    const afford = state.aum>=d.minAUM || small;
    const lockNote = !afford ? `<div class="lock-note">${CONFIG.text.lockNoAum}</div>` : (small?`<div class="lock-note" style="color:var(--warn)">${CONFIG.text.lockSmall}</div>`:'');
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
        <div class="mi"><div class="k">门槛AUM</div><div class="v">${d.minAUM||'无'}</div></div>
      </div>
      <div class="trend ${d.trend}">${ti} ${tl}</div>
    </div>`;}).join('');
  window._smallTicketIdx = smallTicketIdx;
  $content.innerHTML=`
    <div class="choice-head"><h2>${CONFIG.text.choiceTitle.replace('${year}',r.year)}</h2><p>${CONFIG.text.choiceSub.replace('${title}',curTitle())}</p>
    <p class="pending">${CONFIG.text.choicePending}</p></div>
    <div class="deals">${cards}</div>
    <div class="center-btn"><button class="btn" id="confirmBtn" disabled onclick="confirmDeal()">${CONFIG.text.btnConfirmPick}</button></div>`;
  window.scrollTo({top:0,behavior:'smooth'});
  // 返回上一站时,恢复之前选中的项目高亮
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
  const small = (selDeal===window._smallTicketIdx);
  // 投资选择按 trend 暗含性格倾向，累积 MBTI 分
  const tm2=TREND_MBTI[d.trend]; if(tm2){for(const k in tm2)mbti[k]+=tm2[k];}
  // 计算该选项在本题里的「优劣排名」(按 base 降序，0=最优)，用于排名计分
  const sorted=[...r.deals].slice().sort((a,b)=>b.base-a.base);
  const rankIdx=sorted.findIndex(x=>x===d);
  const optCount=r.deals.length;
  // 即时只扣投入(占用资本)，结果期末揭晓。先记录这笔押注。
  stagedThisPeriod.push({year:r.year, deal:d, tag:d.tag, name:d.name, small, rankIdx, optCount});
  // 显示"已封存"页（提供重选入口，未揭晓前可反悔）
  $content.innerHTML=`
    <div class="staged">
      <div class="seal">📜</div>
      <h2>${CONFIG.text.stagedTitle}</h2>
      <div class="pick-name">${d.tag} · ${d.name}</div>
      <div class="tip">${CONFIG.text.stagedTip.replace('${amt}',d.amt)}</div>
      <div class="staged-actions">
        <button type="button" class="undo-icon" onclick="undoStaged()" title="${CONFIG.text.stagedUndo}" aria-label="上一站"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg></button>
        <button type="button" class="btn" onclick="advance()">${rIdx>=p.rounds.length-1?CONFIG.text.btnWitness:CONFIG.text.btnContinue}</button>
      </div>
    </div>`;
  window.scrollTo({top:0,behavior:'smooth'});
}
// 未揭晓前撤回当前这笔押注，重新选择本站（回滚 MBTI 加分）
function undoStaged(){
  if(!stagedThisPeriod.length) return;
  const last=stagedThisPeriod.pop();
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
  let luckBonus=(state.luck-CONFIG.start.luck)*P.luckPerPoint;
  luckBonus=clamp(luckBonus,P.luckClamp.min,P.luckClamp.max);
  const dice=Math.random();
  const tb=(P.trendBoost&&P.trendBoost[d.trend])||0;
  let p=clamp(d.base+P.baseAdjust+luckBonus+tb,P.baseClamp.min,P.baseClamp.max);
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
    let dh=-(HC.baseDecay+Math.floor(pIdx*HC.rampPerPeriod));
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
    // 排名计分：按选项优劣排名给基础分，运气在档位上下浮动一档(钳制0-50)
    const qScore=rankScore(R.s.rankIdx, R.s.optCount, R.tier);
    R.s.qScore=qScore;
    fullHistory.push({year:R.s.year, tag:R.s.tag, name:R.s.name, tier:R.tier, score:qScore});
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
  // 返回两维度偏向百分比(50中点)，max≈12(6题+24投资估算)
  const norm=(v,max)=>clamp(50+v/max*50,6,94);
  return {
    risk:{val:mbti.risk, pct:norm(mbti.risk,14)},
    mind:{val:mbti.mind, pct:norm(mbti.mind,14)},
  };
}
// 排名计分：根据选项优劣排名(rankIdx,0=最优)与选项数给基础分，再由运气(tier)上下浮动一档
// 3选项:50/25/0  4选项:50/30/15/0  5选项:50/40/25/15/0
function rankScore(rankIdx, optCount, tier){
  const TABLE={3:[50,25,0],4:[50,30,15,0],5:[50,40,25,15,0]};
  const pts=TABLE[optCount]||TABLE[3];
  let idx=(typeof rankIdx==='number'&&rankIdx>=0)?Math.min(rankIdx,pts.length-1):pts.length-1;
  // 运气浮动：50% 概率触发，触发时在上下一档之间随机(等概率上/下)；钳制在档位范围(0-50)
  if(Math.random()<0.5){
    if(Math.random()<0.5) idx=Math.max(0, idx-1);
    else idx=Math.min(pts.length-1, idx+1);
  }
  return pts[idx];
}
function calcScore(){
  // 五属性归一化评分(2026-06-21重设计)：每项 min(1,(值/目标)^gamma)*权重，累加满1000
  const T=CONFIG.scoreTarget, W=CONFIG.scoreWeight, g=CONFIG.scoreGamma;
  let s=0;
  for(const k in W){
    const v=Math.max(0, state[k]||0);
    const r=Math.min(1, Math.pow(v/T[k], g));
    s+=r*W[k];
  }
  if(state.health<=0) s*=CONFIG.deadPenalty;        // 健康归零出局打折
  return Math.round(s);
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
  if(window.Sfx){ const _s=score; setTimeout(()=>{ if(healthDead)Sfx.play('lose'); else if(_s>=750)Sfx.play('winBig'); else if(_s>=550)Sfx.play('winMid'); else if(_s>=450)Sfx.play('neutral'); else Sfx.play('lose'); }, 350); }
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
    <div class="share-card" id="shareCard" style="--accent-c:${meta.color}">
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
      <div class="sc-record"><h3>— 二十六年投资轨迹 —</h3>${recRows}</div>
      <div class="sc-foot">中国创业投资模拟器 · <b>2000—2026</b> · 🦞 小龙虾出品<div class="qr-tip">长按/扫码也来走一遍你的投资人生 · 仅供娱乐</div></div>
    </div>
    <div class="share-actions">
      <button class="btn" onclick="genImage()"><span class="btn-ic">${IC_CAMERA}</span>${CONFIG.text.genImage}</button>
      <button class="btn ghost" onclick="copyLink()"><span class="btn-ic">${IC_LINK}</span>复制分享</button>
      <button class="btn ghost" onclick="goHome()"><span class="btn-ic">${IC_RESTART}</span>重新开始</button>
    </div>
    <div class="share-hint">长图生成后会弹出预览，手机端长按图片即可保存到相册<br>复制链接发给朋友，挑战谁是更强的投资人</div>`;
  renderMBTI();
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
  const card=document.getElementById('shareCard');
  toast(CONFIG.text.genImageWait,4000);
  setTimeout(()=>{
    html2canvas(card,{scale:2,backgroundColor:'#f5f1e8',useCORS:true,logging:false,windowWidth:card.scrollWidth}).then(canvas=>{
      const dataUrl=canvas.toDataURL('image/png');
      const modal=document.getElementById('imgModal');
      document.getElementById('imgOut').src=dataUrl;
      document.getElementById('imgTip').innerHTML=CONFIG.text.genImageTip;
      modal.classList.add('show');
      toast(CONFIG.text.genImageOk,1500);
    }).catch(e=>{console.error(e);toast(CONFIG.text.genImageFail,3000);});
  },80);
}
function closeImg(){document.getElementById('imgModal').classList.remove('show');}
function copyLink(){
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
