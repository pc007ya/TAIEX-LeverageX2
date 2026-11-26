import {parseObservations, exposure, preferRows} from './model.mjs?v=1';
const $=id=>document.getElementById(id);
const fmt=new Intl.NumberFormat('zh-TW',{maximumFractionDigits:0});
const cents=new Intl.NumberFormat('zh-TW',{minimumFractionDigits:2,maximumFractionDigits:2});
const n=x=>fmt.format(x);
const colors=['#086960','#9c4f13','#37539e'];
let rows=[], days=[], selected=null, views=[], frame;
const localURL='./observations.csv?v=launch-1';
const rawURL='https://raw.githubusercontent.com/pc007ya/TAIEX-LeverageX2/main/positioning/observations.csv';
const el=(name,text)=>{const e=document.createElement(name);e.textContent=text;return e;};
function svg(name,attrs,text){
  const e=document.createElementNS('http://www.w3.org/2000/svg',name);
  for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);
  if(text!==undefined)e.textContent=text;
  return e;
}
function chart(host,title,lines,format){
  const box=$(host);
  box.replaceChildren();
  const W=Math.max(260,box.clientWidth), H=W<480?184:231, L=72, R=W-20, T=13, B=H-35;
  const x=i=>days.length===1?(L+R)/2:L+(R-L)*i/(days.length-1);
  const values=lines.flatMap(q=>q.values);
  const lo=Math.min(...values,0), hi=Math.max(...values,0), span=hi-lo||1;
  const min=lo-(lo<0?span*.06:0), max=hi+(hi>0?span*.06:0)||1;
  const y=v=>B-(v-min)*(B-T)/(max-min);
  const pane=svg('svg',{viewBox:`0 0 ${W} ${H}`,role:'img','aria-label':title,class:'plot'});
  for(let i=0;i<=4;i++){
    const value=min+(max-min)*i/4, yy=y(value);
    pane.append(svg('line',{x1:L,x2:R,y1:yy,y2:yy,stroke:'#dfeae9'}),svg('text',{x:L-5,y:yy+4,'text-anchor':'end',class:'axis'},format(value)));
  }
  pane.append(svg('line',{x1:L,x2:R,y1:y(0),y2:y(0),stroke:'#8ea5a9','stroke-dasharray':'4 3'}));
  const ticks=new Set([0,days.length-1]);
  for(let i=1;i<(W<480?3:6);i++)ticks.add(Math.round(i*(days.length-1)/(W<480?3:6)));
  for(const i of ticks)pane.append(svg('text',{x:x(i),y:B+19,'text-anchor':i===0?'start':i===days.length-1?'end':'middle',class:'axis'},days[i].date.slice(5).replace('-','/')));
  for(const q of lines){
    const d=q.values.map((v,i)=>(i?'L':'M')+x(i).toFixed(2)+','+y(v).toFixed(2)).join(' ');
    pane.append(svg('path',{d,stroke:q.color,'stroke-width':2.1,fill:'none','stroke-linecap':'round','stroke-linejoin':'round','stroke-dasharray':q.dash?'5 3':''}));
  }
  const line=svg('line',{y1:T,y2:B,stroke:'#123a48','stroke-dasharray':'3 3',class:'date-guide'});
  pane.append(line);
  const dots=lines.map(q=>svg('circle',{r:3.5,fill:q.color,stroke:'#fff','stroke-width':1}));
  pane.append(...dots);
  const get=e=>{
    const pos=new DOMPoint(e.clientX,e.clientY).matrixTransform(pane.getScreenCTM().inverse());
    return Math.max(0,Math.min(days.length-1,Math.round((pos.x-L)*(days.length-1)/(R-L))));
  };
  pane.addEventListener('pointermove',e=>{if(e.pointerType==='mouse')paint(get(e));});
  pane.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse')paint(selectedIndex());});
  pane.addEventListener('click',e=>{selected=days[get(e)].date;paint(selectedIndex());});
  views.push(i=>{
    line.setAttribute('x1',x(i));line.setAttribute('x2',x(i));line.dataset.date=days[i].date;
    dots.forEach((dot,j)=>{dot.setAttribute('cx',x(i));dot.setAttribute('cy',y(lines[j].values[i]));});
  });
  box.append(pane);
}
function selectedIndex(){
  const i=days.findIndex(r=>r.date===selected);
  return i<0?days.length-1:i;
}
function paint(i){
  const q=days[i];if(!q)return;
  views.forEach(f=>f(i));
  const v=exposure(q,$('basis').value), label=$('basis').value==='foreign'?'外資及陸資持有':'發行';
  $('lookup').value=q.date;
  $('tx-readout').textContent=q.date+' ｜ 淨部位 '+n(v.net)+' 口（多 '+n(q.long)+'／空 '+n(q.short)+'）';
  $('etf-readout').textContent=q.date+' ｜ 00631L 約 '+n(v.eq631)+' 口 · 00685L 約 '+n(v.eq685)+' 口 · 合計約 '+n(v.total)+' 口';
  $('units-readout').textContent=q.date+' ｜ '+label+'：00631L '+n(v.u631)+' · 00685L '+n(v.u685)+' 單位';
  $('day').textContent=q.date;
  $('daily').replaceChildren(...[
    ['00631L',n(q.units631),n(q.foreign631),cents.format(q.close631)+' 元','約 '+n(v.eq631)+' 口'],
    ['00685L',n(q.units685),n(q.foreign685),cents.format(q.close685)+' 元','約 '+n(v.eq685)+' 口'],
  ].map(fields=>{
    const tr=el('tr','');
    fields.forEach((field,j)=>{const cell=el(j?'td':'th',field);if(!j)cell.scope='row';tr.append(cell);});
    return tr;
  }));
}
function render(){
  if(!rows.length)return;
  const latest=rows.at(-1), rv=exposure(latest,$('basis').value);
  $('coverage').textContent='同日資料 '+rows[0].date+' ～ '+latest.date+' ｜ '+rows.length+' 個交易日 ｜ 非即時';
  $('summary').replaceChildren(...[
    ['最新外資大臺淨部位',n(rv.net)+' 口','期交所實際未平倉'],
    ['00631L 發行',n(latest.units631),'受益權單位'],
    ['00685L 發行',n(latest.units685),'受益權單位'],
  ].map(([label,value,desc])=>{
    const b=el('div','');b.className='kpi';b.append(el('span',label),el('strong',value),el('small',desc));return b;
  }));
  const range=$('range').value;
  days=range==='all'?rows:rows.slice(-Number(range));views=[];
  $('lookup').replaceChildren(...days.map(q=>el('option',q.date)).reverse());
  const data=days.map(q=>exposure(q,$('basis').value));
  const line=(k,color,dash=false)=>({values:data.map(r=>r[k]),color,dash});
  chart('tx','外資大臺實際淨部位，單位為口',[line('net','#a54a69')],n);
  chart('exposure','兩檔 ETF 大臺等值口數，為估算',[line('eq631',colors[0]),line('eq685',colors[1]),line('total',colors[2],true)],n);
  chart('units','兩檔正2 ETF 單位數',[line('u631',colors[0]),line('u685',colors[1])],v=>n(v/1000000)+' 百萬');
  paint(selectedIndex());
}
async function get(url){
  const response=await fetch(url,{cache:'no-cache'});
  if(!response.ok)throw Error('資料未載入');
  return parseObservations(await response.text());
}
let local=[],remote=[];
function apply(){
  const next=preferRows(local,remote);
  if(next!==rows&&next.length){rows=next;render();}
}
Promise.allSettled([
  get(localURL).then(x=>{local=x;apply();}),
  get(rawURL).then(x=>{remote=x;apply();}),
]).then(()=>{if(!rows.length)$('coverage').textContent='觀測資料暫時無法載入，請稍後重整。';});
$('range').addEventListener('change',()=>{selected=null;render();});
$('basis').addEventListener('change',render);
$('lookup').addEventListener('change',e=>{selected=e.target.value;paint(selectedIndex());});
addEventListener('resize',()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(render);});
