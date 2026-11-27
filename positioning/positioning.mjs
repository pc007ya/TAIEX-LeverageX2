import {anniversary, validateIssuance, issuanceCounts} from './issuance-window.mjs?v=1';
import {parseCandles,candleFor,candleDomain,candlePaths,extendWithIndex} from './candles.mjs?v=1';
import {parseObservations, exposure, netShortLots, preferRows, parseLocalInterest, parseLocalFunds, asResearchRows} from './model.mjs?v=issue-window-2';
import {makeChanges,lags,rolling} from './relationship.mjs?v=5';
const $=id=>document.getElementById(id);
const fmt=new Intl.NumberFormat('zh-TW',{maximumFractionDigits:0});
const cents=new Intl.NumberFormat('zh-TW',{minimumFractionDigits:2,maximumFractionDigits:2});
const n=x=>Number.isFinite(x)?fmt.format(x):'—';
const rtext=x=>Number.isFinite(x)?(x>0?'+':'')+x.toFixed(3):'—';
const colors=['#086960','#9c4f13','#37539e'];
let rows=[], days=[], selected=null, views=[], frame, relValues=[], previousByDate=new Map(), inputTx=new Map(), serviceTx=new Map(), serviceFunds={};
let indexCandles=new Map();
const localURL='./observations.csv?v=history-5';
const rawURL='https://raw.githubusercontent.com/pc007ya/TAIEX-LeverageX2/main/positioning/observations.csv';
const el=(name,text)=>{const e=document.createElement(name);e.textContent=text;return e;};
function svg(name,attrs,text){
  const e=document.createElementNS('http://www.w3.org/2000/svg',name);
  for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);
  if(text!==undefined)e.textContent=text;
  return e;
}
const unitAxis=v=>Number.isFinite(v)?new Intl.NumberFormat('zh-TW',{maximumFractionDigits:2}).format(v/1e9):'—';
const signed=x=>Number.isFinite(x)?(x>0?'+':'')+n(x):'—';
function chart(host,title,lines,format,fixed,rightFormat,candles){
  const box=$(host);
  box.replaceChildren();
  const W=Math.max(260,box.clientWidth), H=W<480?184:231, L=67, R=W-49, T=13, B=H-35;
  const x=i=>days.length===1?(L+R)/2:L+(R-L)*i/(days.length-1);
  const domain=(values)=>{
    const lo=Math.min(...values,0), hi=Math.max(...values,0), span=hi-lo||1;
    return [lo-(lo<0?span*.06:0),hi>0?hi+span*.06:lo<0?0:1];
  };
  const values=axis=>lines.filter(q=>Boolean(q.right)===axis).flatMap(q=>q.values).filter(Number.isFinite);
  const left=candles?candles.filter(Boolean).map(v=>v.close):values(false),right=values(true);
  if(!left.length&&!right.length){box.append(el('p',candles?'此期間沒有可核對的日 K 資料。':'此期間沒有足夠資料。'));return;}
  const [min,max]=fixed??domain(left), [rmin,rmax]=domain(right);
  const y=(v,onRight=false)=>B-(v-(onRight?rmin:min))*(B-T)/(onRight?rmax-rmin:max-min);
  const pane=svg('svg',{viewBox:`0 0 ${W} ${H}`,role:'img','aria-label':title,class:'plot'});
  for(let i=0;i<=4;i++){
    const value=min+(max-min)*i/4, yy=y(value);
    pane.append(svg('line',{x1:L,x2:R,y1:yy,y2:yy,stroke:'#dfeae9'}));
    if(left.length)pane.append(svg('text',{x:L-5,y:yy+4,'text-anchor':'end',class:'axis'},format(value)));
    if(rightFormat&&right.length)pane.append(svg('text',{x:R+5,y:yy+4,'text-anchor':'start',class:'axis'},rightFormat(rmin+(rmax-rmin)*i/4)));
  }
  if(!candles&&left.length)pane.append(svg('line',{x1:L,x2:R,y1:y(0),y2:y(0),stroke:'#8ea5a9','stroke-dasharray':'4 3'}));
  const ticks=new Set([0,days.length-1]);
  for(let i=1;i<(W<480?3:6);i++)ticks.add(Math.round(i*(days.length-1)/(W<480?3:6)));
  for(const i of ticks)pane.append(svg('text',{'data-date':days[i].date,x:x(i),y:B+19,'text-anchor':i===0?'start':i===days.length-1?'end':'middle',class:'axis'},days.at(-1).date.slice(0,4)===days[0].date.slice(0,4)?days[i].date.slice(5).replace('-','/'):days[i].date.slice(0,7).replace('-','/')));
  for(const q of lines){
    let on=false,d='';
    q.values.forEach((v,i)=>{if(!Number.isFinite(v)){on=false;return;}d+=(on?' L':' M')+x(i).toFixed(2)+','+y(v,q.right).toFixed(2);on=true;});
    pane.append(svg('path',{d,stroke:q.color,'stroke-width':2.1,fill:'none','stroke-linecap':'round','stroke-linejoin':'round','stroke-dasharray':q.dash?'5 3':''}));
  }
  if(candles){
    pane.dataset.candles=String(left.length);
    const gaps=candlePaths(candles,x,y,(R-L)/Math.max(1,days.length-1));
    for(const [k,color] of [['up','#aa3146'],['down','#006b58'],['flat','#62777f']]){
      const {wick,body}=gaps[k];
      if(wick)pane.append(svg('path',{d:wick,stroke:color,'stroke-width':.85,fill:'none'}),svg('path',{d:body,fill:color}));
    }
  }
  const line=svg('line',{y1:T,y2:B,stroke:'#123a48','stroke-dasharray':'3 3',class:'date-guide'});
  pane.append(line);
  const dots=lines.map(q=>svg('circle',{r:3.5,fill:q.color,stroke:'#fff','stroke-width':1}));
  const candleDot=candles?svg('circle',{r:3.2,fill:'#133449',stroke:'#fff','stroke-width':1,visibility:'hidden'}):null;
  pane.append(...dots);if(candleDot)pane.append(candleDot);
  const get=e=>{
    const pos=new DOMPoint(e.clientX,e.clientY).matrixTransform(pane.getScreenCTM().inverse());
    return Math.max(0,Math.min(days.length-1,Math.round((pos.x-L)*(days.length-1)/(R-L))));
  };
  pane.addEventListener('pointermove',e=>{if(e.pointerType==='mouse')paint(get(e));});
  pane.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse')paint(selectedIndex());});
  pane.addEventListener('click',e=>{selected=days[get(e)].date;paint(selectedIndex());});
  views.push(i=>{
    line.setAttribute('x1',x(i));line.setAttribute('x2',x(i));line.dataset.date=days[i].date;
    if(candleDot){const b=candles[i];candleDot.setAttribute('visibility',b?'visible':'hidden');if(b){candleDot.setAttribute('cx',x(i));candleDot.setAttribute('cy',y(b.close));}}
    dots.forEach((dot,j)=>{const value=lines[j].values[i];dot.setAttribute('visibility',Number.isFinite(value)?'visible':'hidden');if(Number.isFinite(value)){dot.setAttribute('cx',x(i));dot.setAttribute('cy',y(value,lines[j].right));}});
  });
  box.append(pane);
}
function selectedIndex(){
  const i=days.findIndex(r=>r.date===selected);
  return i<0?Math.max(0,days.findLastIndex(q=>!q.candleOnly)):i;
}
function paint(i){
  const q=days[i];if(!q)return;
  views.forEach(f=>f(i));
  const v=exposure(q,$('basis').value), label=$('basis').value==='foreign'?'外資及陸資持有':'發行';
  $('lookup').value=q.date;
  const bar=candleFor(indexCandles,q);
  $('index-readout').replaceChildren(el('strong',q.date),...(bar?
    [['開盤',bar.open],['最高',bar.high],['最低',bar.low],['收盤',bar.close]].map(([label,value])=>{
      const b=el('div','');b.append(el('small',label),el('b',cents.format(value)));return b;
    }):[el('span','這天沒有可核對的開高低收。')]));
  const prev=previousByDate.get(q.date);
  const dl=[q.long,prev?.long].every(Number.isFinite)?q.long-prev.long:null;
  const ds=[q.short,prev?.short].every(Number.isFinite)?q.short-prev.short:null;
  const dnet=[dl,ds].every(Number.isFinite)?ds-dl:null;
  $('comparison-readout').replaceChildren(el('strong',q.date),
    el('span',q.candleOnly?'同日 ETF／大臺資料尚未合併':'大臺淨部位 '+n(v.net)+' 口'),
    el('span','ETF 合計等值 '+(Number.isFinite(v.total)?'約 '+n(v.total)+' 口':'—')),
    el('span','00631L '+n(v.u631)+' 單位'),
    el('span','00685L '+n(v.u685)+' 單位'),
    el('span','淨空較前日 '+signed(dnet)+' 口'),
    el('span','多方變動 '+signed(dl)+' 口'),
    el('span','空方變動 '+signed(ds)+' 口'));
  $('tx-readout').textContent=q.date+' ｜ 淨部位 '+n(v.net)+' 口（多 '+n(q.long)+'／空 '+n(q.short)+'）';
  $('etf-readout').replaceChildren(el('strong',q.date),
    el('span','ETF 合計等值 '+(Number.isFinite(v.total)?'約 '+n(v.total)+' 口':'—')),
    el('span','外資大臺淨空 '+(Number.isFinite(v.net)?n(netShortLots(v.net))+' 口':'—')),
    el('span','00631L 約 '+n(v.eq631)+' 口'),
    el('span','00685L 約 '+n(v.eq685)+' 口'));
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
  const effective=extendWithIndex(asResearchRows(rows,new Map([...serviceTx,...inputTx]),serviceFunds),indexCandles);
  previousByDate=new Map(effective.slice(1).map((row,i)=>[row.date,effective[i]]));
  const latest=rows.at(-1), rv=exposure(latest,$('basis').value), published=rows.filter(r=>Number.isFinite(r.long)), count=effective.filter(r=>Number.isFinite(r.long)).length;
  $('compare-mode').textContent=$('basis').value==='foreign'?'ETF 外陸資持有':'ETF 發行量';
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
  const range=$('range').value, axisEnd=effective.at(-1).date;
  const windowRows=range==='all'?effective:['year','five'].includes(range)?effective.filter(r=>r.date>=anniversary(axisEnd,range==='five'?5:1)):effective.slice(-Number(range));
  const matched=[];
  windowRows.forEach((r,i)=>{
    const {net,u631,u685}=exposure(r,$('basis').value);
    if([net,u631,u685].every(Number.isFinite))matched.push(i);
  });
  const common=$('common-only');
  common.disabled=!matched.length;
  days=common.checked&&matched.length?windowRows.slice(matched[0],matched.at(-1)+1):windowRows;
  $('common-status').textContent='目前 '+days[0].date+' 至 '+days.at(-1).date+'；三者同日有資料 '+matched.length+' 日。'+
    (matched.length<days.length?'缺值留白、不移動日期。':'')+
    (days.at(-1).candleOnly?' 最新日先顯示加權日 K。':'');
  views=[];
  $('lookup').replaceChildren(...days.map(q=>el('option',q.date)).reverse());
  const data=days.map(q=>exposure(q,$('basis').value));
  const line=(k,color,dash=false)=>({values:data.map(r=>r[k]),color,dash});
  const txColor='#a54a69';
  const bars=days.map(q=>candleFor(indexCandles,q));
  chart('index-candles','加權指數日 K 線，單位點，共用查值交易日',[],n,candleDomain(bars),null,bars);
  chart('comparison','同一交易日：左軸大臺淨部位與 ETF 合計大臺等值，右軸兩檔 ETF 單位數',
    [line('net',txColor),line('total',colors[2],true),{...line('u631',colors[0]),right:true},{...line('u685',colors[1]),right:true}],n,null,unitAxis);
  chart('tx','外資大臺實際淨部位，單位為口',[line('net','#a54a69')],n);
  chart('exposure','兩檔 ETF 大臺等值與外資大臺淨空，共用同一口數軸',
    [line('eq631',colors[0]),line('eq685',colors[1]),line('total',colors[2]),
     {values:data.map(r=>netShortLots(r.net)),color:txColor,dash:true}],n);
  chart('units','兩檔正2 ETF 單位數',[line('u631',colors[0]),line('u685',colors[1])],v=>unitAxis(v)+' 十億');
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
fetch('./taiex-ohlc.csv?v=1',{cache:'no-cache'}).then(r=>{
  if(!r.ok)throw new Error('K 線資料未載入');return r.text();
}).then(t=>{indexCandles=parseCandles(t);render();}).catch(()=>{});
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
$('common-only').addEventListener('change',render);
$('rel-fund').addEventListener('change',render);
function validateTx(rows,tx){
  let count=0;
  for(const row of rows){
    const v=tx.get(row.date);
    if(v&&row.long!==null){count++;if(v.long!==row.long||v.short!==row.short)throw Error('大臺公開資料對照不符：'+row.date);}
  }
  if(count<10)throw Error('大臺可交叉核對的交易日不足');
}
async function provider(dataset,id,start,end){
  const url='https://api.finmindtrade.com/api/v4/data?'+new URLSearchParams({dataset,data_id:id,start_date:start,end_date:end});
  const response=await fetch(url,{credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error('來源暫時無法存取（'+response.status+'）');
  return response.text();
}
const historyButtons=['issue-year','issue-five','load-five'].map($);
async function loadHistory(years,withTx){
  if(!rows.length){$('research-status').textContent='請先等公開資料載入。';return;}
  historyButtons.forEach(b=>b.disabled=true);
  $('discard-five').disabled=true;
  const status=$('research-status'), label=years===1?'一年':'五年';
  status.textContent='正在直接從來源載入'+label+'資料…';
  try{
    const end=rows.at(-1).date,start=[rows[0].date,anniversary(end,years)].sort().at(-1);
    const window=rows.filter(r=>r.date>=start&&r.date<=end);
    const known=new Set(window.map(r=>r.date));
    const [a,b]=await Promise.all(['00631L','00685L'].map(code=>provider('TaiwanStockShareholding',code,start,end)));
    const funds={631:parseLocalFunds(JSON.parse(a),'00631L',known),685:parseLocalFunds(JSON.parse(b),'00685L',known)};
    validateIssuance(window,funds);
    for(const k of ['631','685'])serviceFunds[k]=new Map([...(serviceFunds[k]??[]),...funds[k]]);
    $('range').value=years===1?'year':'five';selected=null;$('discard-five').hidden=false;
    const changes=issuanceCounts(asResearchRows(window,new Map(),serviceFunds));
    const text='ETF 發行量 '+changes.both+' / '+changes.total+' 個交易日（'+window[0].date+' 至 '+end+'；00631L：'+changes.a+' 日，00685L：'+changes.b+' 日）。';
    status.textContent=text+' 僅在此瀏覽器，未上傳。';render();
    if(withTx)try{
      const tx=parseLocalInterest(await provider('TaiwanFuturesInstitutionalInvestors','TX',start,end),known);
      validateTx(window,tx);
      serviceTx=new Map([...serviceTx,...tx]);
      const amount=asResearchRows(window,serviceTx,serviceFunds).filter(r=>Number.isFinite(r.long)).length;
      status.textContent=text+' 大臺 '+amount+' / '+window.length+' 日。僅在此瀏覽器，未上傳。';render();
    }catch(error){status.textContent=text+' 大臺補載失敗：'+error.message+'。ETF 資料仍保留。';}
  }catch(error){status.textContent='ETF 歷史未載入：'+error.message+'。既有資料仍可用。';}
  finally{historyButtons.forEach(b=>b.disabled=false);$('discard-five').disabled=false;}
}
$('issue-year').addEventListener('click',()=>loadHistory(1,false));
$('issue-five').addEventListener('click',()=>loadHistory(5,false));
$('load-five').addEventListener('click',()=>loadHistory(5,true));
$('discard-five').addEventListener('click',()=>{
  serviceTx=new Map();serviceFunds={};
  $('discard-five').hidden=true;$('research-status').textContent='已清除本機向來源補載的研究資料。';render();
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
