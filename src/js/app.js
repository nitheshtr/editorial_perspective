let current=2;

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

function applyState(idx,initial){
  current=+idx;
  const s=states[current];
  const isMobile=window.innerWidth<=560;
  document.getElementById('state').textContent=s.label;
  document.getElementById('range').value=current;
  const q=document.getElementById('question');
  if(q && q.textContent!==s.question){
    if(initial){ q.textContent=s.question; }
    else{
      q.style.opacity=0;
      setTimeout(()=>{ q.textContent=s.question; q.style.opacity=0.72; },260);
    }
  }
  document.getElementById('synthesisText').textContent=s.synthesis;
  nodeOrder.forEach(k=>{
    const data=s.nodes[k];
    const pos=(isMobile && data.mobile) ? data.mobile : data;
    const el=document.querySelector(`.blob[data-id="${k}"]`);
    if(!el) return;
    el.style.setProperty('--x', pos.x+'%');
    el.style.setProperty('--y', pos.y+'%');
    el.style.setProperty('--w', pos.w+'%');
    el.style.setProperty('--h', pos.h+'%');
    el.style.setProperty('--o', (typeof pos.opacity==='number' ? pos.opacity : data.opacity));
    el.style.pointerEvents = ((typeof pos.opacity==='number' ? pos.opacity : data.opacity) < 0.05) ? 'none' : 'auto';
    el.style.setProperty('--br', pos.br || data.br);
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
}
function timeChange(v){ applyState(v); }

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
  const s=states[current];
  const centerEl=document.querySelector('.center');
  const map=document.querySelector('.map');
  if(!centerEl || !map) return;
  const mapRect=map.getBoundingClientRect();
  const cr=centerEl.getBoundingClientRect();
  const center={x:cr.left+cr.width/2-mapRect.left, y:cr.top+cr.height/2-mapRect.top};
  const visible=nodeOrder.filter(k=>s.nodes[k].opacity>0.05);
  let html='';
  const strength=s.lineStrength;
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

function drawSparkline(svg,data){
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
  svg.innerHTML=`<polyline points="${poly}" fill="none" stroke="#0071e3" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${last[0]}" cy="${last[1]}" r="3.5" fill="#0071e3" stroke="#fff" stroke-width="1.5"/>`;
}
function openPerspectiveLens(name){
  const d=details[name];
  const cur=states[current].nodes[name];
  const meta=statusMeta(cur.status);
  document.getElementById('lensEyebrow').textContent=`${meta.text} · ${cur.sources} SOURCES`;
  document.getElementById('lensTitle').textContent=name;
  document.getElementById('lensSummary').textContent=d.summary;
  drawSparkline(document.getElementById('lensSparkline'), d.sparkline);
  document.getElementById('lensSteps').innerHTML=d.history.map((txt,i)=>`<div class="lens-step"><div class="when">${i+1}</div><div class="when-label">${states[i].label}</div><p>${txt}</p></div>`).join('');
  document.getElementById('lensSources').innerHTML=d.sources.map(s=>`<div class="lens-source"><div class="pub">${s.pub}</div><h4>${s.title}</h4><p>${s.desc}</p><a href="#">READ ORIGINAL ↗</a></div>`).join('');
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
  const list=document.getElementById('panelArticles');
  list.innerHTML=(d&&d.sources?d.sources:[]).map(s=>`<article class="article"><div class="pub">${s.pub}</div><h3>${s.title}</h3><p>${s.desc}</p><a href="#">READ ORIGINAL ↗</a></article>`).join('');
  const p=document.getElementById('sourcesPanel');
  p.classList.add('show');
  setTimeout(()=>p.scrollIntoView({behavior:'smooth',block:'start'}),30);
}
function toggle(id){ document.getElementById(id).classList.toggle('show'); }

document.addEventListener('keydown',function(e){
  if(e.key==='Escape'){
    closeChangeSheet();
    closeLens();
  }
});
window.addEventListener('resize',()=>{ applyState(current,true); animateLines(860); });
document.addEventListener('DOMContentLoaded',()=>{ applyState(2,true); });
