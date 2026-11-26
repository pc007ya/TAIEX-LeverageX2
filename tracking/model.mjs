export const series = [
  ['TAIEX','加權指數','#007f79'],['TRI','加權報酬指數','#597087'],
  ['0050','0050 台灣50','#215eca'],['009816','009816','#956523'],
  ['00685L','00685L 群益臺灣加權正2','#b33d61'],['00631L','00631L 元大台灣50正2','#6751ba'],
  ['0052','0052 富邦科技','#a44a18'],['0055','0055 元大MSCI金融','#12649f'],['2330','2330 台積電','#a32f68'],
  ['00981A','00981A','#166125']
];
export const keys = series.map(s=>s[0]);
const aliases = Object.fromEntries(series.flatMap(([id])=>[[id,id],[id+'收盤價',id]]));
Object.assign(aliases,{ '50':'0050','台指':'TAIEX','加權指數':'TAIEX','含息大盤':'TRI','加權報酬指數':'TRI' });
const val = x => Number.isFinite(x) && x > 0;
export const rel = (x,y) => val(x)&&val(y) ? x/y-1 : null;
const finite = x => Number.isFinite(x);
const plain = s=>s.trim().replace(/^"|"$/g,'').replace(/""/g,'"').trim();
function csvLine(line){
  const out=[]; let cell='', quoted=false;
  for(let i=0;i<line.length;i++){
    const c=line[i];
    if(c==='"'){ if(quoted && line[i+1]==='"'){cell+='"';i++;} else quoted=!quoted; }
    else if(c===','&&!quoted){out.push(cell.trim());cell='';}
    else cell+=c;
  }
  if(quoted) throw Error('CSV 有未結束的引號');
  out.push(cell.trim()); return out;
}
export function day(value){
  const m = plain(value).match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:\s.*)?$/);
  if(!m) return null;
  const iso = [m[1],m[2].padStart(2,'0'),m[3].padStart(2,'0')].join('-');
  const d = new Date(iso+'T00:00:00Z');
  return finite(+d) && d.toISOString().slice(0,10)===iso ? iso : null;
}
export function parseCSV(str){
  const lines=str.replace(/^\uFEFF/,'').trim().split(/\r?\n/);
  const h=csvLine(lines.shift()??'');
  const di=h.findIndex(k=>['日期','date'].includes(k.toLowerCase()));
  const mapping=h.map(k=>Object.hasOwn(aliases,k)?aliases[k]:null);
  if(di<0||!mapping.some(Boolean)) throw Error('找不到日期及可辨識的市場價格欄');
  if(new Set(mapping.filter(Boolean)).size !== mapping.filter(Boolean).length) throw Error('CSV 欄名重複');
  const rows=new Map();
  for(const line of lines){
    if(!line.trim()) continue;
    const c=csvLine(line); if(!c[di]) continue;
    const date=day(c[di]); if(!date) throw Error('日期格式不符：請用 YYYY-MM-DD 或 YYYY/M/D');
    if(rows.has(date)) throw Error('CSV 日期重複：'+date);
    const row={date};
    mapping.forEach((key,i)=>{
      if(!key) return;
      const raw=c[i]?.replace(/,/g,'')??'';
      const x=/^\d+(?:\.\d+)?$/.test(raw)?Number(raw):NaN;
      row[key]=val(x)?x:null;
    });
    if(keys.some(k=>val(row[k]))) rows.set(date,row);
  }
  if(!rows.size) throw Error('沒有可讀取的行情');
  return [...rows.values()].sort((a,b)=>a.date.localeCompare(b.date));
}
export function mergeRows(main, incoming){
  const map=new Map(main.map(r=>[r.date,r]));
  for(const r of incoming) map.set(r.date,{...map.get(r.date),...r});
  return [...map.values()].sort((a,b)=>a.date.localeCompare(b.date));
}
export function commonBase(rows, ids){
  return rows.find(r=>ids.every(id=>val(r[id])))??null;
}
export function analyze(rows, ids, benchmark){
  const base=commonBase(rows,[...new Set([...ids,benchmark])]);
  if(!base) return {base:null,points:[]};
  const i=rows.indexOf(base);
  return {base:base.date,points:rows.slice(i).map((r,j)=>{
    const previous=rows[i+j-1];
    const bench=rel(r[benchmark],base[benchmark]);
    const daily=rel(r[benchmark],previous?.[benchmark]);
    const performance={},difference={},spread={};
    for(const k of ids){
      performance[k]=rel(r[k],base[k]);
      difference[k]=finite(bench)&&finite(performance[k])?performance[k]-bench:null;
      const v=rel(r[k],previous?.[k]);
      spread[k]=j>0&&finite(daily)&&finite(v)?v-daily*(['00685L','00631L'].includes(k)?2:1):null;
    }
    return {date:r.date,bench,performance,difference,spread};
  })};
}
export function summary(points,k){
  const sample=points.map(r=>r.spread[k]).filter(finite);
  const avg=sample.length?sample.reduce((a,b)=>a+b,0)/sample.length:null;
  const dev=sample.length>=2?Math.sqrt(sample.reduce((a,b)=>a+(b-avg)**2,0)/(sample.length-1))*Math.sqrt(252):null;
  return {avg,dev,n:sample.length};
}

// A price axis follows the observed cash-index range; it must not share
// a domain (or zero baseline) with the return axis.
export function chartDomain(values, axis){
  let lo=axis==='points'?Infinity:0;
  let hi=axis==='points'?-Infinity:0;
  for(const v of values){
    if(!finite(v)||(axis==='points'&&!val(v)))continue;
    lo=Math.min(lo,v);hi=Math.max(hi,v);
  }
  if(!finite(lo))return null;
  if(axis==='points'&&hi-lo<10){
    const midpoint=(lo+hi)/2;
    lo=midpoint-5; hi=midpoint+5;
  }else if(axis!=='points'&&hi-lo<.002){
    hi=Math.max(.001,hi);lo=Math.min(-.001,lo);
  }
  const pad=(hi-lo)*.09;
  return [axis==='points'?Math.max(0,lo-pad):lo-pad,hi+pad];
}

// Keep the selected date in view even at either end of the series.
export function chartWindow(length, selected, size){
  if(length<1)return [0,0];
  const span=Math.max(1,Math.min(length,size));
  const start=Math.max(0,Math.min(length-span,selected-Math.floor(span/2)));
  return [start,start+span];
}

// Start/end are inclusive; calendar dates without trading are never invented.
export function tradingWindow(points,start,end){
  if(!start||!end||start>end)return null;
  const i=points.findIndex(p=>p.date>=start);
  const j=points.findLastIndex(p=>p.date<=end);
  return i>=0&&j>=i?[i,j+1]:null;
}

// Market-day ticks: at least one labeled tick for every month shown.
export function timeTicks(points,width){
  const firstByMonth=[];
  for(let i=0;i<points.length;i++){
    const month=points[i].date.slice(0,7);
    if(i===0||points[i-1].date.slice(0,7)!==month)firstByMonth.push([i,month]);
  }
  if(firstByMonth.length<=1){
    if(!points.length)return [];
    const last=points.length-1;
    return [...new Set([0,Math.floor(last/2),last])].map(i=>({i,label:points[i].date.slice(5),row:0}));
  }
  const long=width/firstByMonth.length>=64;
  const step=Math.max(1,Math.ceil(16*firstByMonth.length/width));
  return firstByMonth.map(([i,month],j)=>({i,label:j%step?'':long?month.replace('-','/'):Number(month.slice(5))+'月',row:long?0:Math.floor(j/step)%2}));
}

// Use a simple-average seed for each EMA; missing sessions do not advance it.
export function macdSeries(rows,symbol){
  const ema=n=>{
    let count=0,total=0,previous=null;
    return v=>{
      if(count<n){
        total+=v;count++;
        if(count===n)previous=total/n;
      }else previous+=(v-previous)*2/(n+1);
      return previous;
    };
  };
  const fast=ema(12),slow=ema(26),signal=ema(9),out=new Map();
  for(const row of rows){
    const price=row[symbol];
    if(!val(price))continue;
    const f=fast(price),s=slow(price),dif=s===null?null:f-s;
    const dea=dif===null?null:signal(dif);
    out.set(row.date,{price,dif,dea,hist:dea===null?null:dif-dea});
  }
  return out;
}

// Compare with the previous trading row, not the start of the chart window.
export function dailyPointChange(current, previous){
  const rate=rel(current,previous);
  return rate===null?null:{points:current-previous,rate};
}
