import {parseObservations, exposure, preferRows, parseLocalInterest, parseLocalFunds, asResearchRows} from './model.mjs?v=5';
import {makeChanges,lags,rolling} from './relationship.mjs?v=5';
const $=id=>document.getElementById(id);
const fmt=new Intl.NumberFormat('zh-TW',{maximumFractionDigits:0});
const cents=new Intl.NumberFormat('zh-TW',{minimumFractionDigits:2,maximumFractionDigits:2});
const n=x=>Number.isFinite(x)?fmt.format(x):'—';
const rtext=x=>Number.isFinite(x)?(x>0?'+':'')+x.toFixed(3):'—';
const colors=['#086960','#9c4f13','#37539e'];
let rows=[], days=[], selected=null, views=[], frame, relValues=[], inputTx=new Map(), serviceTx=new Map(), serviceFunds={};
const localURL='./observations.csv?v=history-5';
const rawURL='https://raw.githubusercontent.com/pc007ya/TAIEX-LeverageX2/main/positioning/observations.csv';
const el=(name,text)=>{const e=document.createElement(name);e.textContent=text;return e;};
function svg(name,attrs,text){
  const e=document.createElementNS('http://www.w3.org/2000/svg',name);
  for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);
  if(text!==undefined)e.textContent=text;
  return e;
}
function chart(host,title,lines,format,fixed){
  const box=$(host);
  box.replaceChildren();
  const W=Math.max(260,box.clientWidth), H=W<480?184:231, L=72, R=W-20, T=13, B=H-35;
  const x=i=>days.length===1?(L+R)/2:L+(R-L)*i/(days.length-1);
  const values=lines.flatMap(q=>q.values).filter(Number.isFinite);
  if(!values.length){box.append(el('p','此期間沒有足夠資料。','subtle'));return;}
  const lo=Math.min(...values,0), hi=Math.max(...values,0), span=hi-lo||1;
  const [min,max]=fixed??[lo-(lo<0?span*.06:0),hi>0?hi+span*.06:lo<0?0:1];
  const y=v=>B-(v-min)*(B-T)/(max-min);
  const pane=svg('svg',{viewBox:`0 0 ${W} ${H}`,role:'img','aria-label':title,class:'plot'});
  for(let i=0;i<=4;i++){
    const value=min+(max-min)*i/4, yy=y(value);
    pane.append(svg('line',{x1:L,x2:R,y1:yy,y2:yy,stroke:'#dfeae9'}),svg('text',{x:L-5,y:yy+4,'text-anchor':'end',class:'axis'},format(value)));
  }
  pane.append(svg('line',{x1:L,x2:R,y1:y(0),y2:y(0),stroke:'#8ea5a9','stroke-dasharray':'4 3'}));
  const ticks=new Set([0,days.length-1]);
  for(let i=1;i<(W<480?3:6);i++)ticks.add(Math.round(i*(days.length-1)/(W<480?3:6)));
  for(const i of ticks)pane.append(svg('text',{x:x(i),y:B+19,'text-anchor':i===0?'start':i===days.length-1?'end':'middle',class:'axis'},days.at(-1).date.slice(0,4)===days[0].date.slice(0,4)?days[i].date.slice(5).replace('-','/'):days[i].date.slice(0,7).replace('-','/')));
  for(const q of lines){
    let on=false,d='';
    q.values.forEach((v,i)=>{if(!Number.isFinite(v)){on=false;return;}d+=(on?' L':' M')+x(i).toFixed(2)+','+y(v).toFixed(2);on=true;});
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
    dots.forEach((dot,j)=>{const value=lines[j].values[i];dot.setAttribute('visibility',Number.isFinite(value)?'visible':'hidden');if(Number.isFinite(value)){dot.setAttribute('cx',x(i));dot.setAttribute('cy',y(value));}});
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
  $('rel-readout').textContent=q.date+' ｜ 調整後滾動 r '+rtext(relValues[i]);
  $('daily').replaceChildren(...[
    ['00631L',n(q.units631),n(q.foreign631),Number.isFinite(q.close631)?cents.format(q.close631)+' 元':'—','約 '+n(v.eq631)+' 口'],
    ['00685L',n(q.units685),n(q.foreign685),Number.isFinite(q.close685)?cents.format(q.close685)+' 元':'—','約 '+n(v.eq685)+' 口'],
  ].map(fields=>{
    const tr=el('tr','');
    fields.forEach((field,j)=>{const cell=el(j?'td':'th',field);if(!j)cell.scope='row';tr.append(cell);});
    return tr;
  }));
}
function render(){
  if(!rows.length)return;
  const effective=asResearchRows(rows,new Map([...serviceTx,...inputTx]),serviceFunds);
  const latest=rows.at(-1), rv=exposure(latest,$('basis').value), published=rows.filter(r=>Number.isFinite(r.long)), count=effective.filter(r=>Number.isFinite(r.long)).length;
  const issued=effective.filter(r=>Number.isFinite(r.units631)&&Number.isFinite(r.units685)).length;
  $('coverage').textContent=rows[0].date+' ～ '+latest.date+' ｜ ETF 發行量 '+issued+' / '+rows.length+' 個交易日 ｜ 非即時';
  $('tx-coverage').textContent='大臺公開來源：'+(published.length?published[0].date+' 至 '+published.at(-1).date+'（'+published.length+' 日）':'無')+
    (count>published.length?'；本機匯入再補 '+(count-published.length)+' 日。':'。');
  $('public-coverage').textContent='大臺公開部位 '+published.length+' 日'+(count>published.length?'，本機另補 '+(count-published.length)+' 日':'')+'。';
  $('summary').replaceChildren(...[
    ['最新外資大臺淨部位',n(rv.net)+' 口','期交所實際未平倉'],
    ['00631L 發行',n(latest.units631),'受益權單位'],
    ['00685L 發行',n(latest.units685),'受益權單位'],
  ].map(([label,value,desc])=>{
    const b=el('div','');b.className='kpi';b.append(el('span',label),el('strong',value),el('small',desc));return b;
  }));
  const range=$('range').value;
  const anniversary=(num)=>{
    const y=+latest.date.slice(0,4)-num, m=+latest.date.slice(5,7), d=+latest.date.slice(8);
    return new Date(Date.UTC(y,m-1,Math.min(d,new Date(Date.UTC(y,m,0)).getUTCDate()))).toISOString().slice(0,10);
  };
  days=range==='all'?effective:['year','five'].includes(range)?effective.filter(r=>r.date>=anniversary(range==='five'?5:1)):effective.slice(-Number(range));views=[];
  $('lookup').replaceChildren(...days.map(q=>el('option',q.date)).reverse());
  const data=days.map(q=>exposure(q,$('basis').value));
  const line=(k,color,dash=false)=>({values:data.map(r=>r[k]),color,dash});
  chart('tx','外資大臺實際淨部位，單位為口',[line('net','#a54a69')],n);
  chart('exposure','兩檔 ETF 大臺等值口數，為估算',[line('eq631',colors[0]),line('eq685',colors[1]),line('total',colors[2],true)],n);
  chart('units','兩檔正2 ETF 單位數',[line('u631',colors[0]),line('u685',colors[1])],v=>n(v/1000000)+' 百萬');
  relationship();
  paint(selectedIndex());
}
function relationship(){
  const changes=makeChanges(days,$('rel-fund').value), stats=lags(changes), today=stats[5];
  relValues=rolling(changes);
  const labels=[['同日原始 r',rtext(today.plain)],['扣除大盤影響後 r',rtext(today.adjusted)],['同日有效配對',n(today.n)]];
  $('rel-stats').replaceChildren(...labels.map(([label,value])=>{const box=el('div','');box.append(el('span',label),el('strong',value));return box;}));
  $('rel-table').replaceChildren(...stats.map(({lag,n:count,plain,adjusted})=>{
    const tr=el('tr','');tr.append(el('th',lag>0?'+'+lag:lag),el('td',rtext(plain)),el('td',rtext(adjusted)),el('td',n(count)));return tr;
  }));
  const host=$('rel-lags');host.replaceChildren();
  const pane=svg('svg',{viewBox:'0 0 368 136',role:'img','aria-label':'−5 到 +5 日調整後 Pearson 相關係數'});
  for(const [y,v] of [[12,'+1'],[64,'0'],[116,'−1']]){
    pane.append(svg('line',{x1:31,x2:359,y1:y,y2:y,stroke:'#d3e1e0'}),svg('text',{x:26,y:y+3,'text-anchor':'end',class:'axis'},v));
  }
  stats.forEach(({lag,adjusted})=>{
    const x=45+(lag+5)*30,label=lag>0?'+'+lag:lag;
    pane.append(svg('text',{x,y:133,'text-anchor':'middle',class:'axis'},label));
    if(Number.isFinite(adjusted)){
      const bar=svg('rect',{x:x-8,y:Math.min(64,64-adjusted*52),width:16,height:Math.max(1,Math.abs(adjusted)*52),fill:lag===0?'#173854':adjusted>=0?'#086960':'#975971'});
      bar.append(svg('title',{},label+' 日 r '+rtext(adjusted)));pane.append(bar);
    }
  });
  host.append(pane);
  chart('rel-trend','60 個交易日滾動相關',[{values:relValues,color:'#37539e'}],v=>v.toFixed(1),[-1,1]);
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
$('rel-fund').addEventListener('change',render);
function checkOverlap(rows,tx,funds){
  let txCount=0;
  const fundCounts={631:0,685:0};
  for(const row of rows){
    const v=tx.get(row.date);
    if(v&&row.long!==null){txCount++;if(v.long!==row.long||v.short!==row.short)throw Error('大臺公開資料對照不符：'+row.date);}
    for(const key of ['631','685']){
      const u=funds[key].get(row.date);
      if(u&&row['units'+key]!==null){fundCounts[key]++;if(u.count!==row['units'+key]||u.held!==row['foreign'+key])throw Error('ETF 發行量對照不符：'+row.date);}
    }
  }
  if(txCount<10||fundCounts['631']<10||fundCounts['685']<10)throw Error('可交叉核對的交易日不足');
}
async function provider(dataset,id,start,end){
  const url='https://api.finmindtrade.com/api/v4/data?'+new URLSearchParams({dataset,data_id:id,start_date:start,end_date:end});
  const response=await fetch(url,{credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error('來源暫時無法存取（'+response.status+'）');
  return response.text();
}
$('load-five').addEventListener('click',async()=>{
  if(!rows.length){$('research-status').textContent='請先等公開資料載入。';return;}
  const button=$('load-five');button.disabled=true;
  $('research-status').textContent='正在直接從來源載入歷史資料…';
  try{
    const known=new Set(rows.map(r=>r.date));
    const start=rows[0].date,end='2026-10-30';
    const [txText,a,b]=await Promise.all([
      provider('TaiwanFuturesInstitutionalInvestors','TX',start,end),
      provider('TaiwanStockShareholding','00631L',start,end),
      provider('TaiwanStockShareholding','00685L',start,end),
    ]);
    const tx=parseLocalInterest(txText,known);
    const funds={631:parseLocalFunds(JSON.parse(a),'00631L',known),685:parseLocalFunds(JSON.parse(b),'00685L',known)};
    checkOverlap(rows,tx,funds);
    serviceTx=tx;serviceFunds=funds;
    $('range').value='five';$('discard-five').hidden=false;
    const active=asResearchRows(rows,new Map([...serviceTx,...inputTx]),serviceFunds);
    const complete=active.filter(r=>[r.long,r.short,r.units631,r.units685].every(Number.isFinite)).length;
    $('research-status').textContent='在本機核對完成：'+complete+' / '+rows.length+' 個交易日具備發行與大臺部位。未上傳。';
    render();
  }catch(error){$('research-status').textContent='本機資料未載入：'+error.message+'。公開圖仍可用。';}
  finally{button.disabled=false;}
});
$('discard-five').addEventListener('click',()=>{
  serviceTx=new Map();serviceFunds={};
  $('discard-five').hidden=true;$('research-status').textContent='已清除五年個人研究資料。';render();
});
$('tx-import').addEventListener('change',async e=>{
  const input=e.currentTarget, file=input.files[0];
  if(!file)return;
  try{
    if(file.size>5000000)throw Error('檔案大於 5 MB');
    const known=new Map(rows.map(r=>[r.date,r])), next=parseLocalInterest(await file.text(),known);
    inputTx=next;$('tx-reset').hidden=false;
    const amount=[...next.keys()].filter(d=>known.get(d).long===null).length;
    $('tx-import-status').textContent='已在本機補入 '+amount+' 個缺漏交易日；既有官方資料不改。';render();
  }catch(error){$('tx-import-status').textContent='未匯入：'+error.message;}
  input.value='';
});
$('tx-reset').addEventListener('click',()=>{inputTx=new Map();$('tx-reset').hidden=true;$('tx-import-status').textContent='已清除本機匯入。';render();});
$('lookup').addEventListener('change',e=>{selected=e.target.value;paint(selectedIndex());});
addEventListener('resize',()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(render);});
