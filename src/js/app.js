let current=2;
let currentFraction=current;
let continuousState=null;
let currentLineStrength=null;
let activePerspective=typeof perspectiveColors!=='undefined'?Object.keys(perspectiveColors)[0]:'technology';

function statusMeta(status){
  switch(status){
    case 'Accelerating': return {text:'↑ ACCELERATING', cls:'up'};
    case 'Growing': return {text:'↑ GROWING', cls:'up'};
    case 'Cooling': return {text:'↓ COOLING', cls:'down'};
    case 'Emerging': return {text:'✦ EMERGING', cls:'new'};
    case 'Dominant': return {text:'● DOMINANT', cls:'dominant'};
    default: return {text:status, cls:''};
  }
}
function glowFor(status){
  if(status==='Accelerating') return '0 16px 45px rgba(0,0,0,.1), 0 0 45px rgba(0,113,227,.24)';
  if(status==='Emerging') return '0 16px 45px rgba(0,0,0,.1), 0 0 45px rgba(108,86,184,.28)';
  return '0 16px 45px rgba(0,0,0,.1)';
}

function lerp(a,b,t){ return a+(b-a)*t; }

function setBlobTransitions(enabled){
  document.querySelectorAll('.blob').forEach(el=>{ el.style.transition=enabled?'':'none'; });
}

function buildInterpolatedState(fraction){
  const i=Math.min(2,Math.floor(fraction));
  const t=fraction-i;
  const a=states[i], b=states[i+1];
  const isMobile=window.innerWidth<=560;
  const nodes={};
  nodeOrder.forEach(k=>{
    const na=a.nodes[k], nb=b.nodes[k];
    const pa=(isMobile && na.mobile)?na.mobile:na;
    const pb=(isMobile && nb.mobile)?nb.mobile:nb;
    const opacityA=(typeof pa.opacity==='number')?pa.opacity:na.opacity;
    const opacityB=(typeof pb.opacity==='number')?pb.opacity:nb.opacity;
    nodes[k]={
      x:lerp(pa.x,pb.x,t),
      y:lerp(pa.y,pb.y,t),
      w:lerp(pa.w,pb.w,t),
      h:lerp(pa.h,pb.h,t),
      opacity:lerp(opacityA,opacityB,t),
      br:t>0.5?(pb.br||nb.br):(pa.br||na.br),
      sources:Math.round(lerp(na.sources,nb.sources,t)),
      status:t>0.5?nb.status:na.status
    };
  });
  return {nodes,lineStrength:lerp(a.lineStrength,b.lineStrength,t),fromIndex:i};
}

function crossfadeText(el,earlyText,lateText,t,reduced){
  if(!el) return;
  if(reduced){
    el.textContent=t>0.5?lateText:earlyText;
    el.style.opacity='';
    return;
  }
  const baseOpacity=el.id==='question'?0.72:1;
  const fade=1-Math.abs(t-0.5)*2;
  el.style.opacity=baseOpacity*fade;
  if(fade<0.05){
    const desired=t>0.5?lateText:earlyText;
    if(el.textContent!==desired) el.textContent=desired;
  }
}

function applyState(idx,initial){
  current=+idx;
  currentFraction=current;
  continuousState=null;
  currentLineStrength=null;
  setBlobTransitions(true);
  const s=states[current];
  const isMobile=window.innerWidth<=560;
  document.getElementById('timelineSlider').value=current;
  const q=document.getElementById('question');
  if(q && q.textContent!==s.question){
    if(initial){ q.textContent=s.question; q.style.opacity=0.72; }
    else{
      q.style.opacity=0;
      setTimeout(()=>{ q.textContent=s.question; q.style.opacity=0.72; },260);
    }
  } else if(q){
    q.style.opacity=0.72;
  }
  const synth=document.getElementById('synthesisText');
  if(synth){
    synth.textContent=s.synthesis;
    synth.style.opacity=1;
  }
  nodeOrder.forEach(k=>{
    const data=s.nodes[k];
    const pos=(isMobile && data.mobile)?data.mobile:data;
    const el=document.querySelector(`.blob[data-id="${k}"]`);
    if(!el) return;
    el.style.setProperty('--x', pos.x+'%');
    el.style.setProperty('--y', pos.y+'%');
    el.style.setProperty('--w', pos.w+'%');
    el.style.setProperty('--h', pos.h+'%');
    el.style.setProperty('--o', (typeof pos.opacity==='number'?pos.opacity:data.opacity));
    el.style.pointerEvents=((typeof pos.opacity==='number'?pos.opacity:data.opacity)<0.05)?'none':'auto';
    el.style.setProperty('--br', pos.br||data.br);
    el.style.setProperty('--glow', glowFor(data.status));
    el.querySelector('h3').textContent=k;
    el.querySelector('p').textContent=perspectiveBodies[k][current];
    el.querySelector('.sources').textContent=`${data.sources} SOURCES →`;
    const meta=statusMeta(data.status);
    const trend=el.querySelector('.trend');
    trend.textContent=meta.text;
    trend.className='trend '+meta.cls;
  });
  drawLines();
  if(!initial) animateLines(860);
  updateTimelineCard();
}

function applyStateContinuous(fraction){
  currentFraction=Math.max(0,Math.min(3,+fraction));
  const state=buildInterpolatedState(currentFraction);
  continuousState=state;
  currentLineStrength=state.lineStrength;
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(reduced) setBlobTransitions(false);
  const i=state.fromIndex;
  const t=currentFraction-i;

  document.getElementById('timelineSlider').value=currentFraction;

  nodeOrder.forEach(k=>{
    const data=state.nodes[k];
    const el=document.querySelector(`.blob[data-id="${k}"]`);
    if(!el) return;
    el.style.setProperty('--x', data.x+'%');
    el.style.setProperty('--y', data.y+'%');
    el.style.setProperty('--w', data.w+'%');
    el.style.setProperty('--h', data.h+'%');
    el.style.setProperty('--o', data.opacity);
    el.style.pointerEvents=data.opacity<0.05?'none':'auto';
    el.style.setProperty('--br', data.br);
    el.style.setProperty('--glow', glowFor(data.status));
    el.querySelector('h3').textContent=k;
    el.querySelector('p').textContent=perspectiveBodies[k][t>0.5?i+1:i];
    el.querySelector('.sources').textContent=`${data.sources} SOURCES →`;
    const meta=statusMeta(data.status);
    const trend=el.querySelector('.trend');
    trend.textContent=meta.text;
    trend.className='trend '+meta.cls;
  });

  crossfadeText(document.getElementById('question'), states[i].question, states[i+1].question, t, reduced);
  crossfadeText(document.getElementById('synthesisText'), states[i].synthesis, states[i+1].synthesis, t, reduced);

  drawLines();
  updateTimelineCard();
}

function timeChange(v){ applyStateContinuous(v); }

function getRect(key){
  const el=document.querySelector(`.blob[data-id="${key}"]`);
  if(!el) return null;
  const r=el.getBoundingClientRect();
  const map=document.querySelector('.map').getBoundingClientRect();
  return {x:r.left+r.width/2-map.left, y:r.top+r.height/2-map.top};
}
function drawLines(){
  const svg=document.getElementById('lines');
  if(!svg) return;
  const s=continuousState||states[current];
  const centerEl=document.querySelector('.center');
  const map=document.querySelector('.map');
  if(!centerEl || !map) return;
  const mapRect=map.getBoundingClientRect();
  const cr=centerEl.getBoundingClientRect();
  const center={x:cr.left+cr.width/2-mapRect.left, y:cr.top+cr.height/2-mapRect.top};
  const visible=nodeOrder.filter(k=>s.nodes[k].opacity>0.05);
  let html='';
  const strength=(currentLineStrength!==null)?currentLineStrength:s.lineStrength;
  visible.forEach(k=>{
    const p=getRect(k);
    if(!p) return;
    html+=`<line x1="${center.x}" y1="${center.y}" x2="${p.x}" y2="${p.y}" stroke="#0071e3" stroke-width="${1+strength*1.2}" stroke-opacity="${0.1+strength*.22}" stroke-linecap="round"/>`;
  });
  relations.forEach(([a,b])=>{
    if(!visible.includes(a) || !visible.includes(b)) return;
    const ra=getRect(a), rb=getRect(b);
    if(!ra||!rb) return;
    html+=`<line x1="${ra.x}" y1="${ra.y}" x2="${rb.x}" y2="${rb.y}" stroke="#6c56b8" stroke-width="${1.2+strength*.8}" stroke-opacity="${0.12+strength*.28}" stroke-linecap="round"/>`;
  });
  svg.innerHTML=html;
}
let lineRaf;
function animateLines(duration){
  if(lineRaf) cancelAnimationFrame(lineRaf);
  const start=performance.now();
  function step(now){
    drawLines();
    if(now-start<duration) lineRaf=requestAnimationFrame(step);
  }
  lineRaf=requestAnimationFrame(step);
}

function changeCard(arrow,title,body){
  const cls=arrow==='↓'?'down':(arrow==='✦'?'new':'up');
  return `<div class="changeCard"><div class="arrow ${cls}">${arrow}</div><h3>${title}</h3><p>${body}</p></div>`;
}
function renderChangeSheet(){
  const prevIdx=Math.max(0,current-1);
  const prev=states[prevIdx], cur=states[current];
  document.getElementById('sheetTitle').textContent = prevIdx===current ? 'The baseline conversation' : `From ${prev.label.toLowerCase()} to ${cur.label.toLowerCase()}`;
  const grid=document.getElementById('changeGrid');
  grid.innerHTML='';
  if(prevIdx===current){
    nodeOrder.forEach(k=>{
      const n=cur.nodes[k];
      const meta=statusMeta(n.status);
      grid.innerHTML+=changeCard(meta.cls==='down'?'↓':(meta.cls==='new'?'✦':'↑'), `${k} — ${n.status}`,`${n.sources} sources. ${perspectiveBodies[k][current]}`);
    });
  }else{
    nodeOrder.forEach(k=>{
      const p=prev.nodes[k], c=cur.nodes[k];
      if(c.opacity<0.05 && p.opacity<0.05) return;
      const delta=c.sources-p.sources;
      let card=null;
      if(p.opacity<0.05 && c.opacity>=0.05){
        card=changeCard('✦', `${k} emerged`,`Sources went from ${p.sources} to ${c.sources}. Now ${c.status.toLowerCase()}.`);
      }else if(c.status==='Cooling' && delta<0){
        card=changeCard('↓', `${k} cooled`,`Sources fell from ${p.sources} to ${c.sources}. The perspective is ${c.status.toLowerCase()}.`);
      }else if((c.status==='Accelerating' || c.status==='Growing' || c.status==='Dominant') && delta>0){
        card=changeCard('↑', `${k} ${c.status.toLowerCase()}`,`Sources rose from ${p.sources} to ${c.sources}.`);
      }
      if(card) grid.innerHTML+=card;
    });
  }
  document.getElementById('sheetFrom').textContent=prevIdx===current ? `“${cur.question}”` : `“${prev.question}”`;
  document.getElementById('sheetTo').textContent=`“${cur.question}”`;
}
function openChangeSheet(){ renderChangeSheet(); document.getElementById('changeSheet').classList.add('show'); }
function closeChangeSheet(){ document.getElementById('changeSheet').classList.remove('show'); }

function drawSparkline(svg,data,color){
  color=color||'#0071e3';
  const w=200,h=50,pad=6;
  const max=Math.max(...data,1), min=Math.min(...data,0);
  const range=max-min||1;
  const pts=data.map((v,i)=>{
    const x=pad+(i*(w-2*pad)/(data.length-1));
    const y=h-pad-((v-min)/range*(h-2*pad));
    return [x,y];
  });
  svg.setAttribute('viewBox',`0 0 ${w} ${h}`);
  const poly=pts.map(p=>p.join(',')).join(' ');
  const last=pts[pts.length-1];
  svg.innerHTML=`<polyline points="${poly}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${last[0]}" cy="${last[1]}" r="3.5" fill="${color}" stroke="#fff" stroke-width="1.5"/>`;
}
function windowsStrip(w){w=w||{y:0,q:0,m:0,w:0};return `<span title="Counts by article date. Undated articles are counted by the day we discovered them."><b>${w.y}</b><i>LAST 1 YEAR</i></span><span title="Counts by article date."><b>${w.q}</b><i>LAST 3 MONTHS</i></span><span title="Counts by article date."><b>${w.m}</b><i>LAST 1 MONTH</i></span><span title="Counts by article date."><b>${w.w}</b><i>LAST 1 WEEK</i></span>`;}
function openPerspectiveLens(name){
  const d=details[name];
  const cur=states[current].nodes[name];
  const meta=statusMeta(cur.status);
  document.getElementById('lensEyebrow').textContent=`${meta.text} · ${cur.sources} SOURCES`;
  document.getElementById('lensTitle').textContent=name;
  document.getElementById('lensSummary').textContent=d.summary;
  document.getElementById('lensWindows').innerHTML=windowsStrip(d.windows)+`<span><b>${corpus.real}</b><i>CORPUS REAL</i></span>`;
  drawSparkline(document.getElementById('lensSparkline'), d.sparkline, categoryColors[name]||'#0071e3');
  document.getElementById('lensSteps').innerHTML=d.history.map((txt,i)=>`<div class="lens-step"><div class="when">${i+1}</div><div class="when-label">${states[i].label}</div><p>${txt}</p></div>`).join('');
  document.getElementById('lensSources').innerHTML=d.sources.map(s=>`<div class="lens-source"><div class="pub">${s.pub}</div><h4>${s.title}</h4><p>${s.desc}</p><a href="${s.url||"#"}" target="_blank" rel="noopener">READ ORIGINAL ↗</a></div>`).join('');
  const viewBtn=document.getElementById('lensView');
  viewBtn.textContent=`View all ${cur.sources} sources`;
  viewBtn.onclick=()=>{ closeLens(); openPerspective(name); };
  document.getElementById('lensBackdrop').style.display='flex';
}
function closeLens(e){
  if(e && e.target!==e.currentTarget) return;
  document.getElementById('lensBackdrop').style.display='none';
}

function openPerspective(name){
  const d=details[name];
  document.getElementById('panelTitle').textContent=name;
  document.getElementById('panelKicker').textContent=name.toUpperCase()+' · PERSPECTIVE';
  document.getElementById('panelSummary').textContent=(d&&d.summary)||'';
  document.getElementById('panelWindows').innerHTML=windowsStrip(d&&d.windows)+`<span><b>${corpus.real}</b><i>CORPUS REAL</i></span>`;
  const list=document.getElementById('panelArticles');
  list.innerHTML=(d&&d.sources?d.sources:[]).map(s=>`<article class="article"><div class="pub">${s.pub}</div><h3>${s.title}</h3><p>${s.desc}</p><a href="${s.url||"#"}" target="_blank" rel="noopener">READ ORIGINAL ↗</a></article>`).join('');
  const p=document.getElementById('sourcesPanel');
  p.classList.add('show');
  setTimeout(()=>p.scrollIntoView({behavior:'smooth',block:'start'}),30);
}
function toggle(id){ document.getElementById(id).classList.toggle('show'); }

function selectPerspective(key){
  activePerspective=key;
  updateTimelineCard();
}

function setStep(index){
  const idx=Math.max(0,Math.min(states.length-1,+index));
  const slider=document.getElementById('timelineSlider');
  if(slider) slider.value=idx;
  applyState(idx);
}

function updateTimelineCard(){
  if(typeof timeline==='undefined' || !timeline || !timeline.length) return;
  const step=Math.max(0,Math.min(timeline.length-1,Math.round(currentFraction)));
  const data=timeline[step];
  const perspectiveData=data.perspectives[activePerspective];
  if(!perspectiveData) return;
  const activeColor=(typeof perspectiveColors!=='undefined' && perspectiveColors[activePerspective])||'var(--ink)';
  const card=document.querySelector('.timeline-card');
  if(card) card.style.setProperty('--active-perspective-color', activeColor);

  const timeBadge=document.getElementById('timeBadge');
  const mainHeadline=document.getElementById('mainHeadline');
  const slider=document.getElementById('timelineSlider');
  const tickLabels=document.querySelectorAll('.tick-label');
  const pills=document.querySelectorAll('.perspective-pill');
  const insightCard=document.getElementById('insightCard');
  const insightHeader=document.getElementById('insightHeader');
  const themeText=document.getElementById('themeText');
  const changeText=document.getElementById('changeText');

  if(timeBadge){ timeBadge.textContent=data.label; timeBadge.style.color=activeColor; }
  if(mainHeadline) mainHeadline.textContent=`"${data.headline}"`;
  if(slider) slider.value=step;
  tickLabels.forEach((label,idx)=>label.classList.toggle('active',idx===step));
  pills.forEach(pill=>{
    const pressed=pill.getAttribute('data-key')===activePerspective;
    pill.classList.toggle('active',pressed);
    pill.setAttribute('aria-pressed',String(pressed));
  });
  if(insightCard) insightCard.style.borderColor=activeColor;
  if(insightHeader){
    insightHeader.style.color=activeColor;
    insightHeader.textContent=`${activePerspective.replace(/-/g,' ')} perspective`;
  }
  if(themeText) themeText.textContent=perspectiveData.theme;
  if(changeText) changeText.textContent=perspectiveData.changed;
}

document.addEventListener('keydown',function(e){
  if(e.key==='Escape'){
    closeChangeSheet();
    closeLens();
  }
});
window.addEventListener('resize',()=>{ applyState(current,true); animateLines(860); });
document.addEventListener('DOMContentLoaded',()=>{
  const slider=document.getElementById('timelineSlider');
  if(slider){
    slider.addEventListener('keydown',function(e){
      if(e.key==='ArrowLeft' || e.key==='ArrowRight' || e.key==='ArrowUp' || e.key==='ArrowDown'){
        e.preventDefault();
        const delta=(e.key==='ArrowRight' || e.key==='ArrowUp')?1:-1;
        const idx=Math.max(0,Math.min(3,Math.round(+slider.value)+delta));
        setStep(idx);
      }
    });
  }
  applyState(states.length-1,true);
});
