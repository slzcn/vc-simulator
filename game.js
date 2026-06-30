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
  outcomeTiers: CONFIG.outcomeTiers,
  periods: DATA_PERIODS.periods,
  endingTiers: DATA_ENDINGS.endingTiers,
  endingMeta: DATA_ENDINGS.endingMeta,
};

let state, pIdx, rIdx, selDeal, stagedThisPeriod, fullHistory, gameOver, upPicks=0;
// 投资选择不主导风格(会被「想赢选顺势」带偏),风格纯由情境题决定
const TREND_MBTI = { up:{}, hot:{}, down:{}, safe:{} };
window.mbti={risk:0,data:0,horizon:0,focus:0,decisive:0};

// ===== 选项随机展示(Fisher-Yates原地洗牌) =====
// 洗的是数组本身 → index→数据映射、评分、门槛、undo(按name匹配)全部自动正确。
// 用 _sh 标记保证一局内每题/每轮只洗一次,重选/重渲染保持同序,不抖动。
function shuffleOnce(arr){
  if(!arr||arr._sh)return arr;
  for(let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]];}
  Object.defineProperty(arr,'_sh',{value:true,enumerable:false,configurable:true});
  return arr;
}
// 开新一局时清掉所有 _sh 标记,让新局重新随机(否则同一浏览器会话内多局顺序会一样)
function resetShuffle(){
  try{
    Object.keys(PROFILE.scenarios||{}).forEach(k=>{const a=PROFILE.scenarios[k].opts;if(a)delete a._sh;});
    (GAME.periods||[]).forEach(p=>(p.rounds||[]).forEach(r=>{if(r.deals)delete r.deals._sh;}));
  }catch(e){}
}

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
// 简易 HTML 转义(防 XSS:邀请人/玩家名等用户可控字符串拼到 innerHTML 前必须过)
function escapeHTML(s){return String(s==null?"":s).replace(/[&<>"'`]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;","`":"&#96;"}[c];});}
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
// 优先用外壳注入的应用域 base(全栈版 iframe 嵌入时由父页注入 window.__APP_SHARE_BASE__);
// 独立打开(sim/静态版)未注入时 fallback 到 location.href, 行为不变
function buildShareLink(){
  let base='';
  // 全栈版 iframe 嵌入时, 父页通过 ?appbase= 透传应用域地址; 独立打开无此参数
  try{ const ab=new URLSearchParams(location.search).get('appbase'); if(ab) base=decodeURIComponent(ab).split('#')[0].split('?')[0]; }catch(e){}
  if(!base){ try{ base=(window.__APP_SHARE_BASE__||'').toString().split('#')[0].split('?')[0]; }catch(e){ base=''; } }
  if(!base){ base=location.href.split('#')[0].split('?')[0]; }
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
  if(!state||typeof pIdx!=='number'||typeof rIdx!=='number')return;  // 防御:纯回看态/冷启动时 state/pIdx 为 undefined,不可写入残废存档覆盖正常进度
  lsSet(SAVE_KEY,{state,pIdx,rIdx,stagedThisPeriod,fullHistory,mbti,upPicks,ts:Date.now()});
}
function clearProgress(){ lsDel(SAVE_KEY); }
// 保存完成的结果
// ===== 上报到后端(全栈版数据收集,同源fetch,静默失败不影响游戏) =====
// 上报:postMessage 给父页(全栈版iframe嵌入时父页收集);纯静态独立打开时无后端,静默
// 上报:两条路并行,各部署各取所需,静默失败不影响游戏。
// 1) 妙搭全栈版:postMessage 给父页(iframe外壳收,带csrf调server入库)
// 2) GitHub Pages纯静态版:直连 Supabase REST 插表(配置了 CONFIG.supabase 才走)
// kind: 'result' → results表 / 'visit' → visits表; row 已是对应表的字段(下划线命名)
function reportApi(kind, row){
  // 妙搭外壳路径(保留,行为不变)
  try{ if(window.parent && window.parent!==window){ window.parent.postMessage(Object.assign({__vcsim__:kind}, row), '*'); } }catch(e){}
  // Supabase 直连路径
  try{
    var sb=(CONFIG&&CONFIG.supabase)||{};
    if(!sb.url||!sb.key)return; // 未配置则不上报(妙搭版即此情况,只走postMessage)
    var table=(kind==='result')?'results':(kind==='visit')?'visits':null;
    if(!table)return;
    fetch(sb.url.replace(/\/$/,'')+'/rest/v1/'+table,{
      method:'POST',
      headers:{
        'apikey':sb.key,
        'Authorization':'Bearer '+sb.key,
        'Content-Type':'application/json',
        'Prefer':'return=minimal'
      },
      body:JSON.stringify(row)
    }).catch(function(){});
  }catch(e){}
}
function reportResult(payload){
  // 采集全套局况:基础+风格两维+终局五维属性+胜负数+出局+最佳/最差一投+完整轨迹+是否被邀请+UA
  var s=state||{};
  var hist=Array.isArray(fullHistory)?fullHistory:[];
  var winList=hist.filter(function(h){return h.tier==='SS'||h.tier==='S';});
  var loseList=hist.filter(function(h){return h.tier==='C'||h.tier==='B';});
  var ord={SS:5,S:4,A:3,B:2,C:1};
  var best=winList.slice().sort(function(a,b){return ord[b.tier]-ord[a.tier];})[0];
  var worst=loseList.slice().sort(function(a,b){return ord[a.tier]-ord[b.tier];})[0];
  var inv=null; try{inv=getInviter();}catch(e){}
  reportApi('result',{
    player_id:getPlayerId(), player_name:getPlayerName()||null,
    score:payload.score, title:payload.title, style:payload.styleTitle,
    mbti_risk:(typeof mbti==='object'&&mbti)?mbti.risk:null,
    win_count:winList.length, lose_count:loseList.length,
    final_aum:s.aum!=null?Math.round(s.aum):null,
    final_track:s.track!=null?Math.round(s.track):null,
    final_net:s.network!=null?Math.round(s.network):null,
    final_health:s.health!=null?Math.round(s.health):null,
    final_luck:s.luck!=null?Math.round(s.luck):null,
    health_dead:(s.health!=null?s.health<=0:null),
    best_deal:best?(best.tag+' · '+best.name):null,
    worst_deal:worst?(worst.tag+' · '+worst.name):null,
    picks:hist.map(function(h){return {year:h.year, tag:h.tag, name:h.name, tier:h.tier};}),
    is_invited:!!inv,
    ua:(navigator&&navigator.userAgent)?navigator.userAgent.slice(0,200):null
  });
}
function reportVisit(){
  const inv=getInviter();
  reportApi('visit',{
    visitor_id:getPlayerId(), player_name:getPlayerName()||null,
    inviter_id:inv?inv.id:null, inviter_name:inv?inv.name:null
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
  fullHistory=s.fullHistory||[]; window.mbti=s.mbti||{risk:0,data:0,horizon:0,focus:0,decisive:0}; selDeal=null; gameOver=false;
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
  // 二维码、雷达图都是 canvas 异步生成的像素,存进 localStorage 的 html 里只剩空壳,
  // 回看时必须现场重新绘制,否则空白。
  renderShareQR();
  // 重绘雷达图:用存档时抓下来的 ps/mp/accent 数据(老存档无 radar 字段则跳过,保持向后兼容)
  if(r.radar && typeof drawRadar==='function' && typeof PROFILE!=='undefined'){
    const cv=document.getElementById('radarCanvas');
    if(cv){
      // 用存档里的 accent 重设容器主题色(原 innerHTML 里 style 已有,这里兜底确保)
      const wrap=cv.closest('.mbti-block')||cv.parentElement;
      if(wrap && r.radar.accent) wrap.style.setProperty('--sc', r.radar.accent);
      requestAnimationFrame(()=>drawRadar(cv, r.radar.ps, r.radar.mp, r.radar.accent));
      // 回看走的是恢复存档html的独立路径,不经renderMBTI,需补绑hover监听(否则划过节点/条块无浮层)
      const mb=document.getElementById('mbtiBlock');
      if(typeof setupRadarHover==='function') setupRadarHover(cv);
      if(typeof setupP6Hover==='function' && mb) setupP6Hover(mb, r.radar.accent);
    }
  }
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
  if(inv){ ib.innerHTML=CONFIG.text.invited.replace(/\$\{name\}/g,escapeHTML(inv.name)); ib.style.display='block'; lsSet('vcsim_invited_by',inv); }
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
  window.mbti={risk:0,data:0,horizon:0,focus:0,decisive:0};
  resetShuffle();  // 新局重新洗牌,每局选项顺序不同
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
    // 通知外壳(父窗口)同步底部安全区/状态栏色块,使外壳背景随游戏主题变化(纯静态部署时无外壳,此段自动跳过)
    try{ if(window.parent && window.parent!==window){ window.parent.postMessage({__vcsim__:'theme', paper:t.paper}, '*'); } }catch(e2){}
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
  const sc=PROFILE.scenarios[p.id];
  if(!sc){ showStory(); return; }
  shuffleOnce(sc.opts);  // 随机展示选项顺序(首次进入本题时洗一次)
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
  const SC=(typeof PROFILE!=='undefined'&&PROFILE.scenarios&&PROFILE.scenarios[p.id])?PROFILE.scenarios[p.id]:(typeof MBTI!=='undefined'&&MBTI.scenarios?MBTI.scenarios[p.id]:null);
  if(!SC){return;}
  const o=SC.opts[i];
  if(o.e){for(const k in o.e){ if(mbti[k]==null) mbti[k]=0; mbti[k]+=o.e[k]; } }
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
  shuffleOnce(r.deals);  // 随机展示标的顺序(首次进入本轮时洗一次,重选保持同序)
  // ===== 统一门槛系统 gate:{type:'aum'|'track'|'health', min} 每项最多1个 =====
  // 资本/业绩=硬门槛(属性<min直接锁); 健康=软门槛(运气降门槛+随机扰动,精力波动感)
  // gateLock[i]: 0=不锁 / 'aum' / 'track' / 'health'(锁定原因)
  let gateLock=r.deals.map((d,i)=>{
    const g=d.gate; if(!g) return 0;
    if(g.type==='aum')   return state.aum   < g.min ? 'aum'   : 0;
    if(g.type==='track') return state.track < g.min ? 'track' : 0;
    if(g.type==='health') return state.health < g.min ? 'health' : 0;  // 硬门槛:所见即所得(健康<显示门槛就锁)
    if(g.type==='net')   return state.network < g.min ? 'net'  : 0;  // 人脉门槛:资源/关系不够,挤不进这类局
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
    const lockTxt = lk==='aum'?(CONFIG.text.lockNoAum||'资本不足') : lk==='track'?(CONFIG.text.lockNoTrack||'声望不足') : lk==='health'?(CONFIG.text.lockNoHealth||'精力不足') : lk==='net'?(CONFIG.text.lockNoNet||'人脉不足') : '';
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
        <div class="mi"><div class="k">门槛</div><div class="v">${d.gate?(d.gate.type==='aum'?'资本≥'+d.gate.min:d.gate.type==='track'?'业绩≥'+d.gate.min:d.gate.type==='net'?'人脉≥'+d.gate.min:'健康≥'+d.gate.min):'无'}</div></div>
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
  let p=clamp(d.base+(P.baseAdjust||0)+luckAdj+tb, 0, 1);  // 2026-06-24:补回baseAdjust(此前真实引擎漏读),vc当前baseAdjust=0无变化,保证两引擎一致
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
  // 五维人格：玩家五维(0-100) → 最近人格原型(与大师匹配同源)
  const ps = (typeof profile6Scores==='function') ? profile6Scores() : null;
  if(ps && typeof PERSONA5!=='undefined'){
    const a = PERSONA5.match(ps);
    const sub = PERSONA5.subFromDims(ps, (typeof PROFILE!=='undefined'&&PROFILE.dims)?PROFILE.dims:[]);
    return { key:a.key, emoji:a.emoji, title:a.title, sub:sub, color:a.color, tag:a.tag, desc:a.desc };
  }
  // 兜底(PERSONA5/PROFILE 未加载)：返回均衡型
  return { key:'balanced', emoji:'⚖️', title:'均衡掌舵者', sub:'攻守兼备 · 不走极端', color:'#5a6470',
    tag:'灵活 · 不走极端', desc:'你没有明显的偏科，能稳能进、能算账也懂得为愿景留温度，像老练的舵手随风浪调整航向。' };
}function calcScore(){
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
  stopMusic();
  const score=calcScore();
  const meta=pickEnding(score,healthDead);
  // 结局页背景跟随结局卡片色(meta.bg),使 body/底部安全区与卡片一体,不露米色白块
  applyTheme(Object.assign({}, BASE_THEME, { bg: meta.bg||BASE_THEME.bg, paper: meta.bg||BASE_THEME.paper }));
  if(window.Sfx){ const _s=score; setTimeout(()=>{ if(healthDead)Sfx.play('lose'); else if(_s>=CONFIG.scoreTiersForSfx.big)Sfx.play('winBig'); else if(_s>=CONFIG.scoreTiersForSfx.mid)Sfx.play('winMid'); else if(_s>=CONFIG.scoreTiersForSfx.neutral)Sfx.play('neutral'); else Sfx.play('lose'); }, 350); }
  $game.classList.add('hidden');
  const el=$ending;el.classList.remove('hidden');
  // 把结局主色挂到结果页外层容器,让 share-actions 底部按钮 hover 也能用结局色
  el.style.setProperty('--accent-c', meta.color);
  el.style.setProperty('--ending-bg', meta.bg||'#f5f1e8');
  el.style.setProperty('--ending-glow', meta.glow||'rgba(184,134,11,.1)');
  const order={SS:5,S:4,A:3,B:2,C:1};
  const wins=fullHistory.filter(h=>h.tier==='SS'||h.tier==='S').sort((a,b)=>order[b.tier]-order[a.tier]);
  const loses=fullHistory.filter(h=>h.tier==='C'||h.tier==='B').sort((a,b)=>order[a.tier]-order[b.tier]);
  const best=wins[0], worst=loses[0];
  const ocL=CONFIG.text.outcomeShort;
  const recRows=fullHistory.map(h=>`<div class="rec-row"><span class="yr">${h.year}</span><span class="dl">${h.tag} · ${h.name}</span><span class="oc rtier ${GAME.outcomeTiers[h.tier].cls}">${ocL[h.tier]}</span></div>`).join('');
  const winCnt=fullHistory.filter(h=>h.tier==='SS'||h.tier==='S').length;
  const loseCnt=fullHistory.filter(h=>h.tier==='C'||h.tier==='B').length;
  el.innerHTML=`
    <div class="share-card" id="shareCard" style="--accent-c:${meta.color};--ending-bg:${meta.bg||'#f5f1e8'};--ending-glow:${meta.glow||'rgba(184,134,11,.1)'}">
      <div class="sc-head"><div class="emoji">${meta.emoji}</div><div class="rank-label">${CONFIG.text.endingRankLabel}</div><h1>${meta.title}</h1></div>
      <div class="sc-quote">「${meta.quote}」</div>

      <div class="sc-chapter"><span class="ch-name">我的投资生涯</span></div>
      <div class="sc-summary">${meta.summary}</div>
      <div class="sc-panel sc-stats">
        <div class="fs"><div class="k">${CONFIG.text.endingStatScore}</div><div class="v">${score}</div></div>
        <div class="fs"><div class="k">${CONFIG.text.endingStatAum}</div><div class="v">${Math.round(state.aum)}</div></div>
        <div class="fs"><div class="k">${CONFIG.text.endingStatTrack}</div><div class="v">${Math.round(state.track)}</div></div>
        <div class="fs"><div class="k">${CONFIG.text.endingStatHitMiss}</div><div class="v">${winCnt}/${loseCnt}</div></div>
      </div>
      <div class="sc-highlights">
        <div class="hl-box win"><div class="t">${CONFIG.text.endingBestTitle}</div>${best?`<div class="nm">${best.name}</div><div class="yr">${best.year} · ${best.tag} · ${ocL[best.tier]}</div>`:`<div class="none">${CONFIG.text.endingBestNone}</div>`}</div>
        <div class="hl-box lose"><div class="t">${CONFIG.text.endingWorstTitle}</div>${worst?`<div class="nm">${worst.name}</div><div class="yr">${worst.year} · ${worst.tag} · ${ocL[worst.tier]}</div>`:`<div class="none">${CONFIG.text.endingWorstNone}</div>`}</div>
      </div>

      <div class="sc-chapter"><span class="ch-name">我是怎样的投资人</span></div>
      <div class="mbti-block" id="mbtiBlock"></div>

      <div class="sc-chapter" data-chapter="3"><span class="ch-name">二十六年轨迹</span></div>
      <div class="sc-record" id="scRecord" data-chapter="3">${recRows}</div>
      <div class="sc-foot"><div class="sc-qr" id="scQr"></div><div class="sc-foot-txt">${CONFIG.text.endingFootBrand}<div class="qr-tip">${CONFIG.text.endingFootQrTip}</div></div></div>
    </div>
    <div class="share-actions">
      <button class="btn" onclick="genImage()"><span class="btn-ic">${IC_CAMERA}</span>${CONFIG.text.genImage}</button>
      <button class="btn ghost" onclick="copyLink()"><span class="btn-ic">${IC_LINK}</span>${CONFIG.text.btnCopyShare}</button>
      <button class="btn ghost" onclick="goHome()"><span class="btn-ic">${IC_RESTART}</span>${CONFIG.text.btnEndingRestart}</button>
    </div>
    <div class="share-hint">${CONFIG.text.endingShareHint}</div>`;
  renderMBTI();
  renderShareQR();   // 生成分享二维码(指向当前游戏链接,html2canvas会一起截进长图)
  // 保存本局结果(供回看) + 清掉中途进度
  gameOver=true; clearProgress();
  const sty=calcStyle();
  // 抓雷达图所需数据(canvas 像素无法随 innerHTML 持久化,回看时要现场重绘)
  let radarData=null;
  try{
    const _ps=(typeof profile6Scores==='function')?profile6Scores():null;
    let _mp=null;
    if(_ps && typeof MASTERS!=='undefined'){ const _m=MASTERS.match(_ps); _mp=_m&&_m.best?_m.best.p6:null; }
    if(_ps) radarData={ ps:_ps, mp:_mp, accent:sty.color||'#b8860b' };
  }catch(e){}
  saveResult({
    html: $ending.innerHTML,
    title: meta.title, score: score, styleTitle: sty.title, ts: Date.now(),
    radar: radarData
  });
  initCover(); // 刷新封面按钮(下次回来能回看)
  window.scrollTo({top:0,behavior:'smooth'});
}
function profile6Scores(){
  if(typeof PROFILE==='undefined') return null;
  // 把累积的 5 维原始分(单题±4)归一化到 0~100，50 中点
  const N = (typeof PROFILE!=='undefined' && PROFILE.norm) ? PROFILE.norm : 9;
  const out = {};
  PROFILE.dims.forEach(d=>{
    const v = (mbti[d.key]||0);
    out[d.key] = Math.round(Math.max(4, Math.min(96, 50 + v / N * 50)));
  });
  return out;
}
// 画雷达图：playerScores 实线，masterScores 虚线
// progress: 0~1 入场动画进度(数据多边形从中心展开),默认1=完整(回看/截图直接终态)
function drawRadar(canvas, playerScores, masterScores, accent, progress){
  if(typeof PROFILE==='undefined') return;
  const prog = (progress==null)?1:Math.max(0,Math.min(1,progress));
  const dims = PROFILE.dims;
  const n = dims.length;
  const dpr = window.devicePixelRatio || 2;
  const W = canvas.clientWidth || 320, H = W;
  canvas.width = W*dpr; canvas.height = H*dpr;
  canvas.style.height = H+'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const cx = W/2, cy = H/2, R = W*0.34;
  const ink = '#9a9285', line = '#d8d0bf';
  // 同心网格(4 圈)
  ctx.lineWidth = 1;
  for(let ring=1; ring<=4; ring++){
    const r = R*ring/4;
    ctx.beginPath();
    for(let i=0;i<n;i++){
      const ang = -Math.PI/2 + i*2*Math.PI/n;
      const x = cx + r*Math.cos(ang), y = cy + r*Math.sin(ang);
      i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
    }
    ctx.closePath();
    ctx.strokeStyle = line; ctx.globalAlpha = ring===4?0.9:0.5; ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // 轴线 + 轴标签
  ctx.font = '600 12px -apple-system,"PingFang SC",sans-serif';
  ctx.textAlign='center'; ctx.textBaseline='middle';
  for(let i=0;i<n;i++){
    const ang = -Math.PI/2 + i*2*Math.PI/n;
    const x = cx + R*Math.cos(ang), y = cy + R*Math.sin(ang);
    ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(x,y);
    ctx.strokeStyle=line; ctx.globalAlpha=0.6; ctx.stroke(); ctx.globalAlpha=1;
    const lx = cx + (R+20)*Math.cos(ang), ly = cy + (R+20)*Math.sin(ang);
    ctx.fillStyle = ink;
    ctx.fillText(dims[i].axis, lx, ly);
  }
  function poly(scores, color, dashed, fill){
    ctx.beginPath();
    for(let i=0;i<n;i++){
      const ang = -Math.PI/2 + i*2*Math.PI/n;
      const v = (scores[dims[i].key]!=null?scores[dims[i].key]:50)/100 * prog;  // prog缩放:从中心展开
      const x = cx + R*v*Math.cos(ang), y = cy + R*v*Math.sin(ang);
      i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
    }
    ctx.closePath();
    if(fill){ ctx.fillStyle=color; ctx.globalAlpha=0.12*prog; ctx.fill(); ctx.globalAlpha=1; }
    ctx.lineWidth = dashed?1.8:2.4;
    ctx.setLineDash(dashed?[5,4]:[]);
    ctx.strokeStyle = color; ctx.globalAlpha = prog; ctx.stroke(); ctx.globalAlpha = 1;
    ctx.setLineDash([]);
    // 顶点圆点(仅实线,动画末段才显形避免乱跳)
    if(!dashed && prog>0.6){
      for(let i=0;i<n;i++){
        const ang = -Math.PI/2 + i*2*Math.PI/n;
        const v = (scores[dims[i].key]!=null?scores[dims[i].key]:50)/100 * prog;
        const x = cx + R*v*Math.cos(ang), y = cy + R*v*Math.sin(ang);
        ctx.beginPath(); ctx.arc(x,y,3,0,2*Math.PI); ctx.fillStyle=color; ctx.globalAlpha=(prog-0.6)/0.4; ctx.fill(); ctx.globalAlpha=1;
      }
    }
  }
  // 先画大师(虚线) 再画玩家(实线在上)；两者同色(流派色),靠线型区分:你=实线、大师=虚线
  if(masterScores) poly(masterScores, accent, true, false);
  poly(playerScores, accent, false, true);
  // 存下玩家各顶点的"CSS像素坐标"+维度信息,供 hover tooltip 命中检测(动画终态时记一次)
  if(prog>=1){
    var verts=[];
    for(let i=0;i<n;i++){
      const ang=-Math.PI/2 + i*2*Math.PI/n;
      const pv=(playerScores[dims[i].key]!=null?playerScores[dims[i].key]:50);
      const v=pv/100;
      verts.push({ x:cx+R*v*Math.cos(ang), y:cy+R*v*Math.sin(ang),
        axis:dims[i].axis, val:Math.round(pv),
        master:(masterScores&&masterScores[dims[i].key]!=null)?Math.round(masterScores[dims[i].key]):null });
    }
    canvas.__radarVerts=verts;            // CSS px(因ctx.scale过dpr,这里用逻辑坐标=CSS px)
    canvas.__radarAccent=accent;
  }
}

function renderMBTI(){
  const sty=calcStyle();
  const el=document.getElementById('mbtiBlock'); if(!el)return;
  const ps = profile6Scores();
  let mt=null, b=null;
  if(typeof MASTERS!=='undefined'){ mt=MASTERS.match(ps); b=mt.best; }
  // 方案C: 第二部分跟随人格气质色(对齐大师流派色),章节标题仍用结局色
  const accent = sty.color || (mt?mt.school.color:'#b8860b');
  el.style.setProperty('--sc', accent);  // 容器主题色=人格色,子元素(人格卡/大师卡/雷达/图例/数值条)全继承
  const others = mt ? mt.others.map(o=>`<span class="mm-other">${o.emoji} ${o.name.replace(/\(.*\)/,'')}</span>`).join('') : '';
  // 图例 + 5 维数值条
  const legend = mt ? `<div class="radar-legend">
      <span class="lg lg-you"><i></i>你</span>
      <span class="lg lg-master"><i></i>${b.name.replace(/\(.*\)/,'')}</span>
    </div>` : '';
  const dimList = (typeof PROFILE==='undefined') ? '' : PROFILE.dims.map(d=>{
    const v = ps[d.key];
    const label = v>=58?d.high : (v<=42?d.low : '均衡');
    const mv = (b&&b.p6&&b.p6[d.key]!=null) ? Math.round(b.p6[d.key]) : '';  // 大师分(用于hover)
    return `<div class="p6-row" data-axis="${d.axis}" data-you="${Math.round(v)}" data-mt="${mv}"><span class="p6-axis">${d.axis}</span><div class="p6-bar"><i style="width:${v}%"></i></div><span class="p6-val">${label}</span></div>`;
  }).join('');

  let masterHTML='';
  if(mt){
    const pSrc=(window.PORTRAITS_INLINE&&window.PORTRAITS_INLINE[b.id])||('portraits/'+b.id+'.jpg');
    const pctTxt=(typeof mt.bestPct==='number')?mt.bestPct:'';
    masterHTML=`
    <div class="master-card">
      <div class="mm-portrait" style="background-image:url('${pSrc}')"><span class="mm-emoji-mini">${b.emoji}</span></div>
      <div class="mm-name">${b.name}</div>
      <div class="mm-en">${b.en}</div>
      ${pctTxt!==''?`<div class="mm-pct"><span class="mm-pct-num">${pctTxt}%</span> 相似度</div>`:''}
      <div class="mm-school">${mt.school.name} · ${b.tags}</div>
      <div class="mm-blurb"><span class="mm-bridge">${(typeof PERSONA5!=='undefined')?PERSONA5.bridge(ps, b.p6, b.name, (typeof PROFILE!=='undefined'&&PROFILE.dims)?PROFILE.dims:[]):''}</span>${b.blurb}</div>
      <div class="mm-others-wrap"><span class="mm-others-label">你也有点像</span>${others}</div>
    </div>`;
  }

  el.innerHTML=`
    <div class="sc-sub-head"><span class="sh-emoji">🎭</span>投资人格画像<span class="sh-emoji">🎭</span></div>
    <div class="mbti-card">
      <div class="mc-emoji">${sty.emoji}</div>
      <div class="mc-title">${sty.title}</div>
      <div class="mc-sub">${sty.sub}</div>
      <div class="mc-tag">${sty.tag}</div>
      <div class="mc-desc">${sty.desc}</div>
    </div>
    <div class="sc-sub-head"><span class="sh-emoji">🌟</span>你最像的投资大师<span class="sh-emoji">🌟</span></div>
    ${masterHTML}
    <div class="sc-sub-head"><span class="sh-emoji">📊</span>五维人格对比<span class="sh-emoji">📊</span></div>
    <div class="radar-wrap">
      <canvas id="radarCanvas" class="radar-canvas"></canvas>
      <div id="radarTip" class="radar-tip"></div>
      ${legend}
    </div>
    <div class="p6-list">${dimList}<div id="p6Tip" class="radar-tip"></div></div>`;
  // 画雷达图(canvas 需在 DOM 后绘制)。结局页很长,雷达在下方——必须滚进视口才播动画,
  // 否则用户滑到时早动完了(只见终态)。先画终态兜底(防截图/不支持IO时空白),进视口再从0重播。
  const cv = document.getElementById('radarCanvas');
  if(cv && typeof PROFILE!=='undefined'){
    cv.__radarParams={ps:ps, mp:(b?b.p6:null), accent:accent};  // 存渲染参数,供截图前结算到终态
    requestAnimationFrame(()=>drawRadar(cv, ps, b?b.p6:null, accent, 1)); // 终态兜底
    whenVisible(cv, ()=>animateRadar(cv, ps, b?b.p6:null, accent));        // 进视口播放
    setupRadarHover(cv);                                                   // 鼠标划过顶点显数值
  }
  setupP6Hover(el, accent);  // 雷达下方五维条:hover显示你的分/大师分
  // 五维人格数值条(p6) count-up:同样进视口才滚
  whenVisible(el.querySelector('.p6-list')||el, ()=>countUpBars(el));
}

// 元素滚进视口时触发 cb。默认每次进入都触发(完全离开视口后再进来可重播);
// 不支持 IntersectionObserver 则立即执行一次。
function whenVisible(target, cb){
  if(!target){ cb(); return; }
  if(typeof IntersectionObserver==='undefined'){ cb(); return; }
  var inside=false;
  var io=new IntersectionObserver(function(entries){
    entries.forEach(function(e){
      if(e.isIntersecting){
        if(!inside){ inside=true; cb(); }   // 进入(之前在外面)→播一次
      } else {
        inside=false;                        // 完全离开→武装下次重播
      }
    });
  }, { threshold:0.35 });  // 露出35%才算"看到了",完全移出才 reset
  io.observe(target);
}

// 雷达 hover/触摸:指针靠近某顶点时,浮出该维"名称+你的分/大师分"小气泡(命中圆点~26px内)
function setupRadarHover(canvas){
  var tip=document.getElementById('radarTip'); if(!tip)return;
  var wrap=tip.offsetParent||canvas.parentNode;  // 气泡定位上下文(radar-wrap)
  function locate(clientX, clientY){
    var verts=canvas.__radarVerts; if(!verts)return null;
    var rect=canvas.getBoundingClientRect();
    var px=(clientX-rect.left), py=(clientY-rect.top);  // 鼠标相对 canvas(用于命中检测)
    var fx=px/rect.width*(canvas.clientWidth||rect.width);
    var fy=py/rect.height*(canvas.clientHeight||rect.height);
    var best=null,bd=1e9;
    verts.forEach(function(v){var d=Math.hypot(v.x-fx,v.y-fy);if(d<bd){bd=d;best=v;}});
    // 命中:同时返回鼠标相对 wrap 的坐标(气泡跟随鼠标,不是固定在顶点)
    if(best&&bd<=26){
      var wr=wrap.getBoundingClientRect();
      return {v:best, mx:clientX-wr.left, my:clientY-wr.top};
    }
    return null;
  }
  function show(hit){
    var v=hit.v, ac=canvas.__radarAccent||'#b8860b';
    tip.innerHTML='<span class="rt-axis">'+v.axis+'</span>'+
      '<span class="rt-you" style="color:'+ac+'">你 '+v.val+'</span>'+
      (v.master!=null?'<span class="rt-mt">大师 '+v.master+'</span>':'');
    // 紧贴鼠标上方(相对 radar-wrap),CSS transform 再上移自身高度
    tip.style.left=hit.mx+'px';
    tip.style.top=(hit.my-10)+'px';
    tip.classList.add('show');
  }
  function hide(){ tip.classList.remove('show'); }
  canvas.addEventListener('mousemove',function(e){var h=locate(e.clientX,e.clientY);h?show(h):hide();});
  canvas.addEventListener('mouseleave',hide);
  // 触屏:点一下顶点也能看(手机用户)
  canvas.addEventListener('touchstart',function(e){
    if(!e.touches[0])return; var t=e.touches[0]; var h=locate(t.clientX,t.clientY);
    if(h){ show(h); setTimeout(hide,1800); }
  },{passive:true});
}

// 雷达下方五维条 hover/触摸:浮出该维"你的分/大师分"气泡(复用 .radar-tip 样式)
function setupP6Hover(scope, accent){
  var tip=scope.querySelector('#p6Tip'); if(!tip)return;
  var rows=scope.querySelectorAll('.p6-row');
  function show(row){
    var ac=accent||'#b8860b';
    var you=row.getAttribute('data-you'), mt=row.getAttribute('data-mt'), axis=row.getAttribute('data-axis');
    tip.innerHTML='<span class="rt-axis">'+axis+'</span>'+
      '<span class="rt-you" style="color:'+ac+'">你 '+you+'</span>'+
      ((mt!=='' && mt!=null)?'<span class="rt-mt">大师 '+mt+'</span>':'');
    // 气泡定位到该行上方中部(相对 p6-list)
    var lr=scope.querySelector('.p6-list').getBoundingClientRect();
    var rr=row.getBoundingClientRect();
    tip.style.left=(rr.left-lr.left+rr.width/2)+'px';
    tip.style.top=(rr.top-lr.top)+'px';
    tip.classList.add('show');
  }
  function hide(){ tip.classList.remove('show'); }
  Array.prototype.forEach.call(rows,function(row){
    row.addEventListener('mouseenter',function(){show(row);});
    row.addEventListener('mouseleave',hide);
    row.addEventListener('touchstart',function(){ show(row); setTimeout(hide,1800); },{passive:true});
  });
}

// 雷达入场动画:数据多边形从中心弹性展开(~700ms cubicOut),尊重reduce-motion
function animateRadar(canvas, ps, mp, accent){
  var reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion:reduce)').matches;
  if(reduce){ drawRadar(canvas, ps, mp, accent, 1); return; }
  var dur=720, t0=null;
  function tick(ts){
    if(!t0)t0=ts; var k=Math.min(1,(ts-t0)/dur);
    var eased=1-Math.pow(1-k,3);  // cubicOut
    drawRadar(canvas, ps, mp, accent, eased);
    if(k<1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// 数值条宽度 count-up(p6-bar i 从0展开到内联width目标)
function countUpBars(root){
  if(!root)return;
  var reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion:reduce)').matches;
  var bars=root.querySelectorAll('.p6-bar i');
  Array.prototype.forEach.call(bars,function(b,i){
    var w=b.style.width; if(!w)return;
    if(reduce){return;}
    b.style.setProperty('--w', w);
    b.style.width='0';
    b.style.transition='width .6s cubic-bezier(.22,.61,.36,1)';
    setTimeout(function(){ b.style.width=w; }, 120+i*60);
  });
}

// 截图前结算:把进行中的入场动画立刻拉到终态,避免 html2canvas 截到半截雷达/归零数值条
function settleEndingVisuals(){
  // 1) 雷达:用存的参数重画到 progress=1(终态)
  try{
    var cv=document.getElementById('radarCanvas');
    if(cv && cv.__radarParams && typeof drawRadar==='function'){
      var pr=cv.__radarParams; drawRadar(cv, pr.ps, pr.mp, pr.accent, 1);
    }
  }catch(e){}
  // 2) 五维数值条:若被 countUpBars 归零/动画中,直接设回目标宽(--w),并去掉过渡立即生效
  try{
    var bars=document.querySelectorAll('.p6-bar i');
    Array.prototype.forEach.call(bars,function(b){
      var target=b.style.getPropertyValue('--w');
      if(target){ b.style.transition='none'; b.style.width=target; }
    });
  }catch(e){}
}

function toast(msg,ms){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');clearTimeout(window._tt);window._tt=setTimeout(()=>t.classList.remove('show'),ms||2200);}
function genImage(){
  if(window._genImaging) return;  // 重入锁:截图进行中再点直接忽略,防止连点导致明细块被永久隐藏
  if(typeof html2canvas==='undefined'){ toast(CONFIG.text.genImageFail||'截图库未就绪，请稍后再试',3000); return; }  // H3:库未加载完(慢网首次)直接提示,不抛错
  window._genImaging=true;
  if(window.Sfx)Sfx.play('click');
  settleEndingVisuals();  // 截图前先把进行中的入场动画结算到终态(否则截到半截雷达/归零数值条)
  const card=document.getElementById('shareCard');
  // 截图前临时隐藏「二十六年投资轨迹」明细块(页面仍显示,只是不进截图,避免截图过长)
  // 截图时隐藏整个章节叁(章节标题+轨迹明细)，页面仍显示,仅不进截图避免太长
  const ch3=Array.from(document.querySelectorAll('[data-chapter="3"]'));
  ch3.forEach(n=>n.style.display='none');
  const restore=()=>{ ch3.forEach(n=>n.style.display=''); window._genImaging=false; };  // 恢复为CSS默认(block),不依赖快照值
  // H1加固:二维码是异步生成(白边重绘),若截图时还没就绪(回看页秒点)会截到空/半成品.先确保就绪.
  const qrReady=()=>{ const i=document.querySelector('#scQr img'); return i && i.src && i.src.indexOf('data:image')===0; };
  if(!qrReady() && typeof renderShareQR==='function'){ renderShareQR(); }  // 没就绪就补生成一次
  toast(CONFIG.text.genImageWait,4000);
  const shoot=()=>{
    // 方案A:按结果页真实显示宽度×设备 dpr 截图(所见即所得),取消高度限制尽量清晰.
    // 已去掉第三章节(轨迹明细),卡片高度可控,不压 scale.
    const dpr=window.devicePixelRatio||1;
    let scale=Math.max(2, dpr);  // 至少 2,高分屏跟 dpr(不设上限,尽量清晰)
    // 极端保护:位图高度超 12000px 才限一下(防个别老手机崩溃),正常不触发
    const ch=card.scrollHeight||2400;
    if(ch*scale>12000){ scale=Math.max(2, 12000/ch); }
    html2canvas(card,{scale:scale,backgroundColor:'#f5f1e8',useCORS:true,logging:false,windowWidth:card.scrollWidth}).then(canvas=>{
      restore();  // 截完立即恢复显示
      // 用 JPEG(q0.92)而非 PNG:PNG 长图 dataURL 常 >1MB,手机解码慢/易失败;JPEG 体积约 1/3,渲染更稳
      let dataUrl;
      try{ dataUrl=canvas.toDataURL('image/jpeg',0.92); }catch(e){ dataUrl=canvas.toDataURL('image/png'); }
      const modal=document.getElementById('imgModal');
      const imgEl=document.getElementById('imgOut');
      document.getElementById('imgTip').innerHTML=CONFIG.text.genImageTip;
      // 关键:等图片真正解码完成(onload)再显示 modal,避免大图未就绪时 modal 一闪而过
      imgEl.onload=()=>{ modal.classList.add('show'); toast(CONFIG.text.genImageOk,1500); };
      imgEl.onerror=()=>{ toast(CONFIG.text.genImageFail,3000); };
      imgEl.src=dataUrl;
      // 兜底:个别浏览器对已缓存/同源 dataURL 不触发 onload,250ms 后强制显示一次
      setTimeout(()=>{ if(!modal.classList.contains('show')){ modal.classList.add('show'); } },250);
    }).catch(e=>{restore();console.error(e);toast(CONFIG.text.genImageFail,3000);});
  };
  // 轮询等二维码就绪(最多~500ms),就绪即截;兜底超时也截(不卡死)
  let waited=0;
  const tick=()=>{ if(qrReady()||waited>=500){ setTimeout(shoot,30); } else { waited+=40; setTimeout(tick,40); } };
  tick();
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
          // 尺寸交由 CSS 控制(.sc-qr img),便于手机媒体查询缩小;不再内联写死
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
    else if(target=e.target.closest('.music-btn,.undo-icon,.tip-close')){ kind='icon'; }
    if(!kind) return;
    // 首页 i 按钮(.info-btn)不要 hover 音效,只保留点击音效
    if(e.target.closest('.info-btn')) return;
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
