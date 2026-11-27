// An absent or contradictory row never substitutes close for OHLC.
export function parseCandles(text){
 const [head,...lines]=text.trim().split(/\r?\n/);
 if(head!=='date,open,high,low,close')throw new Error('不認得 K 線資料欄位');
 const result=new Map();
 let prev='';
 for(const line of lines){
  const cols=line.split(','),[date,...raw]=cols;
  const day=new Date(date+'T00:00:00Z');
  if(cols.length!==5||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(+day)||day.toISOString().slice(0,10)!==date||date<=prev||raw.some(x=>!/^\d+(?:\.\d+)?$/.test(x)))throw new Error('K 線日期或數字無效');
  const [open,high,low,close]=raw.map(Number);
  if(![open,high,low,close].every(x=>Number.isFinite(x)&&x>0)||low>Math.min(open,close)||high<Math.max(open,close))throw new Error('K 線高低不合');
  result.set(date,{open,high,low,close});prev=date;
 }
 return result;
}
export const candleFor=(map,row)=>{
 const b=map.get(row.date);
 return b&&Math.abs(b.close-row.index)<.005?b:null;
};
export function candleDomain(bars){
 const real=bars.filter(Boolean);
 if(!real.length)return null;
 const lo=Math.min(...real.map(p=>p.low)),hi=Math.max(...real.map(p=>p.high));
 const pad=Math.max(1,(hi-lo)*.06);
 return [lo-pad,hi+pad];
}
export function candlePaths(bars,x,y,spacing){
 const rows={up:{wick:'',body:''},down:{wick:'',body:''},flat:{wick:'',body:''}};
 const half=Math.min(5,Math.max(.14,spacing*.32));
 const f=a=>Number(a.toFixed(2));
 bars.forEach((p,i)=>{
  if(!p)return;
  const entry=rows[p.close>p.open?'up':p.close<p.open?'down':'flat'];
  const t=f(x(i)),h=f(y(p.high)),l=f(y(p.low)),top=y(Math.max(p.close,p.open)),bottom=Math.max(top+1,y(Math.min(p.open,p.close)));
  entry.wick+=`M${t} ${h}V${l}`;
  entry.body+=`M${f(t-half)} ${f(top)}H${f(t+half)}V${f(bottom)}H${f(t-half)}Z`;
 });
 return rows;
}
// A newer exchange index session may be published before the ETF/TAIFEX join.
export function extendWithIndex(rows,map){
 if(!rows.length)return rows;
 const pending=[];
 for(const [date,b] of map)if(date>rows.at(-1).date)pending.push({date,index:b.close,candleOnly:true,
  long:null,short:null,units631:null,close631:null,foreign631:null,units685:null,close685:null,foreign685:null});
 return [...rows,...pending];
}
