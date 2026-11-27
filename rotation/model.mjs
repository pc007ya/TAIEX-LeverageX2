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
 if(day(partial?listed:start,10)<first||day(end,-10)>last)return {...meta,missing:'期初／期末覆蓋不足'};
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
