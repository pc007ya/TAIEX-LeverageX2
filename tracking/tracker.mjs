import {series,parseCSV,mergeRows,rel,analyze,summary,chartDomain,chartWindow} from './model.mjs?v=chart-zoom-1';
const $=id=>document.getElementById(id);
const s=Object.fromEntries(series.map(([k,name,color])=>[k,{name,color}]));
const groups={core:['0050','009816','00685L','00631L','TRI'],extra:['0050','0052','0055','2330','00981A'],sectors:['0052','0055'],all:series.map(x=>x[0])};
const defaults={core:groups.core,extra:groups.extra,sectors:groups.sectors,all:['0050','00685L','00631L','TRI','2330']};
const state={base:[],rows:[],localRows:[],ids:new Set(defaults.core),date:null,imports:0,source:'官方歷史快照'};
const finite=Number.isFinite;
let chartViews={}, zoomKind=null, zoomSpan=Infinity;
const dlg=$('chart-dialog');
const num=x=>finite(x)?x.toLocaleString('zh-TW',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
const pct=(x,u='%',digits=2)=>finite(x)?(x>0?'+':'')+new Intl.NumberFormat('zh-TW',{minimumFractionDigits:2,maximumFractionDigits:digits}).format(x*100)+u:'—';
function el(tag,t,cl){const n=document.createElement(tag);if(t!==undefined)n.textContent=t;if(cl)n.className=cl;return n;}
function kpis(){

  $('kpis').replaceChildren();
  for(const id of ['TAIEX','TRI','00685L','00631L']){
    const i=state.rows.findLastIndex(r=>finite(r[id]));
    const last=state.rows[i],prev=state.rows[i-1];
    const box=el('div',undefined,'kpi'), p=el('strong',num(last?.[id]));
    const dr=rel(last?.[id],prev?.[id]);
    const pt=finite(dr)&&id==='TAIEX'?' · '+(last[id]-prev[id]>0?'+':'')+num(last[id]-prev[id])+' 點':'';
    const ch=el('small',finite(dr)?'單日 '+pct(dr)+pt:'單日：—');
    box.append(el('span',s[id].name),p,ch,el('small',last?.date??'無資料'));$('kpis').append(box);
  }
}
function symbols(){
  const group=$('group').value, box=$('symbols'), bench=$('benchmark').value;
  box.replaceChildren();
  for(const k of groups[group]){
    if(k===bench) continue;
    const name=el('label'), input=el('input');
    input.type='checkbox';input.checked=state.ids.has(k);
    input.value=k;
    input.addEventListener('change',()=>{
      input.checked?state.ids.add(k):state.ids.delete(k);
      state.date=null;render();
    });
    name.append(input,el('span',s[k].name));box.append(name);
  }
}
const SVG='http://www.w3.org/2000/svg';
function mark(name,props,text){
  const node=document.createElementNS(SVG,name);
  for(const [k,v] of Object.entries(props))node.setAttribute(k,v);
  if(text!==undefined)node.textContent=text;
  return node;
}
function drawChart(host,points,dateseries,index,kind,{expanded=false,gap=false}={}){
  const box=$(host);box.replaceChildren();
  if(!points.length){box.append(el('p','沒有可共同比較的行情。','subtle'));return;}
  const W=512,H=expanded?302:252,L=62,R=444,T=33,B=H-36;
  const indexSeries=dateseries.find(q=>q.axis==='points');
  const returns=dateseries.filter(q=>q.axis!=='points');
  const left=chartDomain(indexSeries.values,'points');
  const right=chartDomain(returns.flatMap(q=>q.values),'return');
  const isGap=gap;
  const x=i=>points.length===1?(L+R)/2:L+i*(R-L)/(points.length-1);
  const y=(v,domain)=>B-(v-domain[0])*(B-T)/(domain[1]-domain[0]);
  const seriesY=(q,v)=>y(v,q.axis==='points'?left:right);
  const svg=mark('svg',{viewBox:`0 0 ${W} ${H}`,role:'img','aria-label':kind+'趨勢圖，左軸加權指數點數，右軸'+(isGap?'相對報酬差百分點':'累積報酬百分比')});
  const title=(x,text,cls,anchor)=>mark('text',{x,y:17,'text-anchor':anchor,class:cls},text);
  svg.append(title(5,'加權指數（點）','axis axis-index axis-caption','start'),title(W-5,isGap?'相對差（百分點）':'累積報酬（%）','axis axis-caption','end'));
  const numberTick=new Intl.NumberFormat('zh-TW',{maximumFractionDigits:0});
  for(let i=0;i<=4;i++){
    const t=i/4, row=B-t*(B-T), rv=right[0]+(right[1]-right[0])*t;
    svg.append(mark('line',{x1:L,x2:R,y1:row,y2:row,stroke:'#deebea'}));
    if(left){
      const lv=left[0]+(left[1]-left[0])*t;
      svg.append(mark('text',{x:L-6,y:row+4,'text-anchor':'end',class:'axis axis-index'},numberTick.format(lv)));
    }
    svg.append(mark('text',{x:R+6,y:row+4,'text-anchor':'start',class:'axis'},(rv*100).toFixed(right[1]-right[0]<.03?1:0)+(isGap?' pp':'%')));
  }
  for(const ax of [L,R])svg.append(mark('line',{x1:ax,x2:ax,y1:T,y2:B,stroke:'#aabfbd'}));
  svg.append(mark('line',{x1:L,x2:R,y1:y(0,right),y2:y(0,right),stroke:'#82999b','stroke-dasharray':'4 4'}));
  for(const i of [...new Set([0,Math.floor((points.length-1)/2),points.length-1])]){
    svg.append(mark('text',{x:x(i),y:H-14,'text-anchor':points.length===1?'middle':i===0?'start':i===points.length-1?'end':'middle',class:'axis'},points[i].date.slice(5)));
  }
  const guide=mark('line',{x1:x(index),x2:x(index),y1:T,y2:B,stroke:'#345b66','stroke-dasharray':'3 4'});
  svg.append(guide);
  const dots=[];
  for(const q of dateseries){
    let pen=false, d='';
    q.values.forEach((v,i)=>{
      if(!finite(v)||(q.axis==='points'&&!(v>0))){pen=false;return;}
      d+=(pen?'L':'M')+x(i).toFixed(2)+','+seriesY(q,v).toFixed(2)+' ';pen=true;
    });
    svg.append(mark('path',{d,fill:'none',stroke:q.color,'stroke-width':'2.15','stroke-linecap':'round','stroke-linejoin':'round','stroke-dasharray':q.dash?'5 3':''}));
    if(expanded&&points.length<=35){
      q.values.forEach((v,i)=>{
        if(finite(v)&&(q.axis!=='points'||v>0))svg.append(mark('circle',{cx:x(i),cy:seriesY(q,v),r:1.65,fill:q.color,'aria-hidden':'true'}));
      });
    }
    const dot=mark('circle',{r:expanded?4.1:3.7,fill:q.color,stroke:'#fff','stroke-width':1});
    svg.append(dot);dots.push(dot);
  }
  const tip=el(expanded?'section':'p',undefined,expanded?'point-inspector':'chart-readout');
  if(expanded)tip.setAttribute('aria-label','指定交易日數值');
  function choose(i){
    guide.setAttribute('x1',x(i));guide.setAttribute('x2',x(i));
    dots.forEach((dot,j)=>{
      const q=dateseries[j], n=q.values[i];
      const hasValue=finite(n)&&(q.axis!=='points'||n>0);
      dot.setAttribute('visibility',hasValue?'visible':'hidden');
      if(hasValue){dot.setAttribute('cx',x(i));dot.setAttribute('cy',seriesY(q,n));}
    });
    if(!expanded){
      tip.textContent=points[i].date+' ｜ '+dateseries.map(q=>q.readout+' '+(q.axis==='points'?(finite(q.values[i])?num(q.values[i])+' 點':'—'):pct(q.values[i],isGap?' pp':'%'))).join(' · ');
    }else{
      const list=el('dl');
      for(const q of dateseries){
        const value=q.values[i];
        const row=el('div');
        row.append(el('dt',q.readout),el('dd',q.axis==='points'?(finite(value)?num(value)+' 點':'—'):pct(value,isGap?' pp':'%',4)));
        if(q.raw){const raw=q.raw[i];row.append(el('small',finite(raw)?'收盤 '+num(raw)+' 元':'收盤 —'));}
        list.append(row);
      }
      tip.replaceChildren(el('h3',points[i].date+' 單日查值'),list);
    }
  }
  function fromPointer(e){
    const ctm=svg.getScreenCTM();
    if(!ctm)return index;
    const p=svg.createSVGPoint();p.x=e.clientX;p.y=e.clientY;
    const local=p.matrixTransform(ctm.inverse());
    return Math.min(points.length-1,Math.max(0,Math.round((local.x-L)*(points.length-1)/(R-L))));
  }
  let hover=index;
  svg.addEventListener('pointermove',e=>{if(e.pointerType==='mouse'){const next=fromPointer(e);if(next!==hover){hover=next;choose(next);}}});
  if(expanded)svg.addEventListener('pointerdown',e=>{if(e.pointerType==='touch')choose(fromPointer(e));});
  svg.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse'){hover=index;choose(index);}});
  svg.addEventListener('click',e=>{state.date=points[fromPointer(e)].date;render();});
  const legend=el('ul',undefined,'plot-key');
  for(const q of dateseries){
    const item=el('li');
    const sample=mark('svg',{viewBox:'0 0 20 10','aria-hidden':'true'});
    sample.append(mark('line',{x1:1,x2:19,y1:5,y2:5,stroke:q.color,'stroke-width':2.5,'stroke-dasharray':q.dash?'5 3':''}));
    item.append(sample,el('span',q.label));legend.append(item);
  }
  choose(index);box.append(svg,legend,tip);
}
function render(){
  if(!state.rows.length) return;
  const group=$('group').value, bench=$('benchmark').value, period=$('period').value;
  const allowed=groups[group].filter(k=>k!==bench);
  const ids=allowed.filter(k=>state.ids.has(k));
  const available=state.rows.filter(r=>[...ids,bench].every(k=>finite(r[k])));
  const newestComparable=available.at(-1)?.date;
  const newestAny=state.rows.at(-1).date;
  const latest=newestComparable??newestAny;
  $('source').textContent=(state.imports?'含本機匯入':state.source)+' ｜ 資料截至 '+newestAny+' ｜ 非即時';
  let full=state.rows.filter(r=>r.date<=latest);
  if(period==='year'){
    const prev=new Date(latest+'T00:00:00Z');
    const m=prev.getUTCMonth();
    prev.setUTCFullYear(prev.getUTCFullYear()-1);
    if(prev.getUTCMonth()!==m)prev.setUTCDate(0);
    const start=prev.toISOString().slice(0,10);
    full=full.filter(r=>r.date>=start);
  }
  const rows=period==='all'||period==='year'?full:full.slice(-Number(period));
  const {base,points}=analyze(rows,ids,bench);
  $('dividend-note').hidden=!(ids.includes('0055') && base && base < '2026-11-20' && latest >= '2026-11-20');
  const ready=points.length&&ids.length;
  for(const b of document.querySelectorAll('[data-chart]'))b.disabled=!ready;
  if(!ready){
    chartViews={};
    if(dlg.open)dlg.close();
    $('scope').textContent=ids.length?'所選標的與基準沒有同日有效價格，請延長期間或減少標的。':'請至少勾選一項標的。';
    for(const id of ['returns','gap','asof','table','mode'])$(id).replaceChildren();
    delete $('asof').dataset.stamp;
    return;
  }
  $('scope').textContent=`共同基準日 ${base} ｜ 至 ${latest} ｜ ${points.length} 個交易日`+
    (base!==rows[0].date?' ｜ 部分標的起始較晚，已同日對齊。':'');
  $('mode').textContent='比較基準：'+s[bench].name+'。正2單日與基準 × 2 比較，其餘 × 1。';
  let idx=points.findIndex(p=>p.date===state.date);
  if(idx<0)idx=points.length-1;
  const pick=points[idx], opts=$('asof');
  if(opts.dataset.stamp!==base+'_'+latest+'_'+points.length){
    opts.replaceChildren(...points.map(p=>{const n=el('option',p.date);n.value=p.date;return n;}).reverse());
    opts.dataset.stamp=base+'_'+latest+'_'+points.length;
  }
  opts.value=pick.date;
  const byDate=new Map(rows.map(r=>[r.date,r]));
  const cash={axis:'points',values:points.map(p=>byDate.get(p.date)?.TAIEX),label:'加權指數點數（左軸）',readout:'加權指數',color:'#123a48'};
  const raw=k=>!['TAIEX','TRI'].includes(k)?points.map(p=>byDate.get(p.date)?.[k]):null;
  const line=(k,type)=>({values:points.map(p=>p[type][k]),label:k,readout:k,color:s[k].color,raw:raw(k)});
  chartViews={
    returns:{kind:'累積報酬',points,idx,lines:[cash,{values:points.map(p=>p.bench),label:s[bench].name+'報酬（基準）',readout:s[bench].name+'報酬',color:s[bench].color,dash:true,raw:raw(bench)},...ids.map(k=>line(k,'performance'))]},
    gap:{kind:'相對報酬差',points,idx,lines:[cash,...ids.map(k=>line(k,'difference'))]}
  };
  for(const [key,c] of Object.entries(chartViews))drawChart(key,points,c.lines,idx,c.kind,{gap:key==='gap'});
  if(dlg.open)renderZoom();
  const r=state.rows.find(x=>x.date===pick.date), slice=points.slice(0,idx+1);
  const tbody=$('table');
  tbody.replaceChildren();
  const sets=[[s[bench].name+'（基準）',num(r[bench]),pct(pick.bench),'—','—','—','—']];
  for(const k of ids){
    const j=summary(slice,k);
    sets.push([s[k].name,num(r[k]),pct(pick.performance[k]),pct(pick.difference[k],' pp'),pct(pick.spread[k],' pp'),finite(j.dev)?num(j.dev*100)+'%':'—',String(j.n)]);
  }
  for(const fields of sets){
    const tr=el('tr');
    for(const [i,v] of fields.entries()){
      const td=el(i?'td':'th',v,i>=2&&i<=4?(v.startsWith('+')?'plus':v.startsWith('-')?'minus':''):'');
      if(!i)td.scope='row';tr.append(td);
    }
    tbody.append(tr);
  }
}
function renderZoom(){
  const c=chartViews[zoomKind];if(!c)return;
  const n=c.points.length,[start,end]=chartWindow(n,c.idx,zoomSpan);
  const shown=c.points.slice(start,end);
  $('zoom-title').textContent=c.kind+'｜放大查看';
  $('zoom-range').textContent=shown[0].date+' ～ '+shown.at(-1).date+' ｜ 顯示 '+shown.length+' / '+n+' 日';
  const datePicker=$('zoom-date');
  const stamp=c.points[0].date+'#'+c.points.at(-1).date+'#'+n;
  if(datePicker.dataset.stamp!==stamp){
    datePicker.replaceChildren(...c.points.map(p=>{const o=el('option',p.date);o.value=p.date;return o;}).reverse());
    datePicker.dataset.stamp=stamp;
  }
  datePicker.value=c.points[c.idx].date;
  $('zoom-prev').disabled=c.idx===0;
  $('zoom-next').disabled=c.idx===n-1;
  $('zoom-in').disabled=end-start<=5;
  $('zoom-out').disabled=end-start===n;
  $('zoom-reset').disabled=end-start===n;
  const lines=c.lines.map(q=>({...q,values:q.values.slice(start,end),raw:q.raw?.slice(start,end)}));
  drawChart('zoom-plot',shown,lines,c.idx-start,c.kind,{expanded:true,gap:zoomKind==='gap'});
}
for(const b of document.querySelectorAll('[data-chart]')){
  b.disabled=true;
  b.addEventListener('click',()=>{
    const k=b.dataset.chart;if(!chartViews[k])return;
    zoomKind=k;zoomSpan=Infinity;
    renderZoom();dlg.showModal();$('zoom-close').focus();
  });
}
$('zoom-close').addEventListener('click',()=>dlg.close());
dlg.addEventListener('close',()=>{zoomKind=null;});
const currentZoom=()=>chartViews[zoomKind];
$('zoom-in').addEventListener('click',()=>{const c=currentZoom();zoomSpan=Math.max(5,Math.ceil(Math.min(zoomSpan,c.points.length)/2));renderZoom();});
$('zoom-out').addEventListener('click',()=>{const c=currentZoom();zoomSpan=Math.min(c.points.length,zoomSpan*2);renderZoom();});
$('zoom-reset').addEventListener('click',()=>{zoomSpan=Infinity;renderZoom();});
function stepDate(offset){
  const c=currentZoom(),p=c?.points[c.idx+offset];
  if(p){state.date=p.date;render();}
}
$('zoom-prev').addEventListener('click',()=>stepDate(-1));
$('zoom-next').addEventListener('click',()=>stepDate(1));
$('zoom-date').addEventListener('change',e=>{state.date=e.target.value;render();});
$('group').addEventListener('change',()=>{state.ids=new Set(defaults[$('group').value]);state.date=null;symbols();render();});
$('period').addEventListener('change',()=>{state.date=null;render();});
$('benchmark').addEventListener('change',()=>{state.date=null;symbols();render();});
$('asof').addEventListener('change',e=>{state.date=e.target.value;render();});
$('clear').addEventListener('click',()=>{state.rows=state.base;state.localRows=[];state.imports=0;state.date=null;$('csv').value='';$('import-status').textContent='已恢復預設快照。';kpis();render();});
$('csv').addEventListener('change',async e=>{
  const f=e.target.files[0]; if(!f) return;
  try{
    if(f.size>2e6)throw Error('CSV 超過 2 MB，請截取需要的行情期間');
    const rows=parseCSV(await f.text());
    state.localRows=mergeRows(state.localRows,rows);state.rows=mergeRows(state.base,state.localRows);state.imports++;state.date=null;
    $('import-status').textContent=`已在本頁匯入 ${rows.length} 個交易日，未上傳。`;
    kpis();render();
  }catch(err){$('import-status').textContent='未匯入：'+err.message;}
  e.target.value='';
});
symbols();
const REMOTE='https://raw.githubusercontent.com/pc007ya/TAIEX-LeverageX2/main/tracking/market-snapshot.csv';
async function officialCSV(url){
  const response=await fetch(url,{cache:'no-cache',signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw Error('HTTP '+response.status);
  const txt=await response.text();
  if(!txt.startsWith('日期,TAIEX,TRI,0050,009816,00685L,00631L,0052,2330,00981A,0055\n'))throw Error('行情欄位不符');
  const rows=parseCSV(txt);
  const latest=rows.at(-1);
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  if(rows.length<230||latest.date>today||rows.some(r=>!finite(r.TAIEX)||!finite(r.TRI)))throw Error('行情日期或指數覆蓋不足');
  return rows;
}
function adopt(rows,label){
  const old=state.base.at(-1),latest=rows.at(-1);
  if(old&&(old.date>latest.date||state.base.length>rows.length))return;
  state.base=rows;
  state.source=label;
  state.rows=mergeRows(state.base,state.localRows);
  kpis();render();
}
await Promise.allSettled([
  officialCSV('./market-snapshot.csv?v=official-year-1').then(rows=>{
    if(!state.base.length)adopt(rows,'官方歷史快照');
  }),
  officialCSV(REMOTE).then(rows=>adopt(rows,'GitHub 最新官方資料'))
]);
if(!state.rows.length)$('source').textContent='官方行情無法載入。可重新整理，或展開下方匯入行情 CSV。';
