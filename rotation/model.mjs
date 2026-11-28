export const day=(s,d)=>{const t=new Date(s+'T12:00:00Z');t.setUTCDate(t.getUTCDate()+d);return t.toISOString().slice(0,10)};
export const dateOK=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
export function number(x){if(x==null||String(x).trim()==='')return null;const n=Number(String(x).replaceAll(',',''));return Number.isFinite(n)?n:null}
export function clean(rows,listed='1900-01-01'){
 const m=new Map();
 for(const [d,...rest] of rows??[]){
  const [c,h,l,v,k]=rest.map(number);
  if(dateOK(d)&&d>=listed&&c>0)m.set(d,[d,c,h??null,l??null,v??null,k??null]);
 }
 return [...m.values()].sort((a,b)=>a[0].localeCompare(b[0]));
}
export const classify=(x,y)=>Math.abs(x)<1e-9||Math.abs(y)<1e-9?'N':x>0?(y>0?'1':'4'):(y>0?'2':'3');
export function minimumSessions(from,to){
 const span=(Date.parse(to)-Date.parse(from))/864e5+1;
 return span>=28?Math.floor(span*.48):span>=7?2:1;
}
export const Q=[
 ['1','右上 · 價漲／指標偏多','兩者同步走強；仍須核對消息與成交量。'],
 ['2','左上 · 價漲／指標偏空','價格和資金指標背離；不代表已反轉。'],
 ['3','左下 · 價跌／指標偏空','價格與資金指標同步偏弱。'],
 ['4','右下 · 價跌／指標偏多','或有承接，但不等於止跌確認。']];
export function measure(rows,start,end,mode,flow,market,listed){
 if(listed&&end<listed)return {missing:'當時尚未上市／未獨立交易'};
 if(mode!=='proxy'&&market==='US')return {missing:'美股無相同口徑的法人淨額'};
 const i=rows.findIndex(r=>r[0]>=start);
 const active=i<0?[]:rows.slice(i).filter(r=>r[0]<=end);
 if(!active.length)return {missing:'此區間未載入資料／無交易'};
 const first=active[0][0],last=active.at(-1)[0],days=active.length;
 const partial=dateOK(listed)&&listed>start&&listed<=end;
 const meta={first,last,days,partial};
 const from=partial?listed:start;
 if(day(from,10)<first||day(end,-10)>last)return {...meta,missing:'期初／期末覆蓋不足'};
 // This is a conservative completeness floor, not an exchange calendar. Weekends and
 // holidays need not be present; one stray close cannot represent a week of trading.
 const floor=minimumSessions(from,end);
 if(days<floor||active.some((r,j)=>j>0&&day(active[j-1][0],12)<r[0]))
  return {...meta,missing:'所選期間的交易日資料不完整'};
 let linked=1,sum=0,volume=0,used=0;
 for(let j=0;j<days;j++){
  const [d,c,h,l,v,diff]=active[j],p=rows[i+j-1];
  const ref=market!=='US'&&diff!=null&&c-diff>0?c-diff:p?.[1];
  if(!(ref>0)&&!(partial&&j===0&&days>1))return {...meta,missing:'缺期初前收盤／基準價'};
  if(ref>0)linked*=c/ref;
  if(!(v>0))continue;
  let term;
  if(mode==='proxy'){
   if(h==null||l==null||h<l||c>h+.000001||c<l-.000001)continue;
   term=(h===l?0:(2*c-h-l)/(h-l))*v;
  } else {
   term=flow?.get(d)?.[mode];if(!Number.isFinite(term))continue;
  }
  sum+=term;volume+=v;used++;
 }
 if(!(volume>0)||used<Math.ceil(days*.8))return {...meta,used,missing:mode==='proxy'?'有效價量不足 80%':'法人資料不足 80%'};
 const x=sum/volume*100,y=(linked-1)*100;
 return {...meta,x,y,q:classify(x,y),used,net:mode==='proxy'?null:sum};
}
const dealer=['Dealer_self','Dealer_Hedging'], cats=['Foreign_Investor','Investment_Trust',...dealer];
export function flowMap(rows){
 const d=new Map();
 for(const row of rows??[]){
  if(!dateOK(row.date)||!cats.includes(row.name))continue;
  const b=number(row.buy),s=number(row.sell);if(b==null||s==null)continue;
  if(!d.has(row.date))d.set(row.date,{});
  d.get(row.date)[row.name]=b-s;
 }
 return new Map([...d].map(([dt,o])=>[dt,{foreign:o.Foreign_Investor,institutions:cats.every(k=>Number.isFinite(o[k]))?cats.reduce((s,k)=>s+o[k],0):null}]));
}
export function parseCSV(txt){
 const split=row=>row.split(',').map(x=>x.trim().replace(/^"|"$/g,''));
 const [head,...body]=txt.replace(/^\uFEFF/,'').trim().split(/\r?\n/).map(split);
 const f=['symbol','date','close','high','low','volume','change'].map(k=>head.findIndex(h=>h.toLowerCase()===k));
 if(f.slice(0,-1).includes(-1))throw Error('CSV 欄位需要 symbol,date,close,high,low,volume');
 const ret=new Map();
 for(const row of body){
  const [s,d,c,h,l,v,k]=f.map(i=>row[i]??'');const sy=s.toUpperCase();if(!/^[A-Z0-9.-]{1,12}$/.test(sy)||!dateOK(d))continue;
  if(!ret.has(sy))ret.set(sy,[]);ret.get(sy).push([d,c,h,l,v,k]);
 }
 return ret;
}

// Each observation uses exactly the selected start and its real trading close.
export function playbackFrames(items,start,end,mode,measureRows,flows,limit=180){
 const dateSet=new Set(), rowsBySymbol=new Map();
 for(const s of items){
  const rows=measureRows(s);rowsBySymbol.set(s.symbol,rows);
  for(const row of rows)if(row[0]>=start&&row[0]<=end)dateSet.add(row[0]);
 }
 const dates=[...dateSet].sort(),step=Math.max(1,Math.ceil(dates.length/limit));
 const selected=dates.filter((_,i)=>i%step===0||i===dates.length-1);
 const frames=selected.map(date=>({date,points:[]}));
 const byDate=new Map(frames.map(f=>[f.date,f.points])),maxima={x:1,y:1};
 for(const s of items){
  const rows=rowsBySymbol.get(s.symbol),startIndex=rows.findIndex(r=>r[0]>=start);
  if(startIndex<0)continue;
  const from=Math.max(0,startIndex-1);
  for(let i=startIndex;i<rows.length&&rows[i][0]<=end;i++){
   const points=byDate.get(rows[i][0]);if(!points)continue;
   const p=measure(rows.slice(from,i+1),start,rows[i][0],mode,flows.get(s.symbol),s.market,s.listed);
   if(p.missing)continue;
   points.push({...s,...p});
   maxima.x=Math.max(maxima.x,Math.abs(p.x));maxima.y=Math.max(maxima.y,Math.abs(p.y));
  }
 }
 return {frames:frames.filter(f=>f.points.length),maxima,total:dates.length,sampled:step>1};
}
