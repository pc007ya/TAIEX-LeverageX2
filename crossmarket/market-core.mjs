export const ISO=/^\d{4}-\d\d-\d\d$/;
export const series = {
 TAIEX:{name:'台灣加權',short:'加權',kind:'index',color:'#0e7490'},
 TWTECH:{name:'台灣電子類',short:'台電子',kind:'index',color:'#0e9a72'},
 COMP:{name:'Nasdaq 綜合',short:'Nasdaq',kind:'index',color:'#385ed0'},
 SOX:{name:'費城半導體',short:'費半',kind:'index',color:'#8b45be'},
 VIX:{name:'Cboe VIX',short:'VIX',kind:'point',color:'#c46c10'},
 FED:{name:'Fed 有效利率',short:'Fed',kind:'rate',color:'#bb3847'}
};
export const sourceFields={NASDAQCOM:'COMP',NASDAQSOX:'SOX',VIXCLS:'VIX',DFF:'FED'};
export function day(s){const ms=Date.parse(s+'T00:00:00Z');return ISO.test(s)&&Number.isFinite(ms)&&new Date(ms).toISOString().slice(0,10)===s?ms:NaN;}
export function iso(ms){return new Date(ms).toISOString().slice(0,10);}
export const DAY=86400000;
export function yearsBefore(d,n){const y=Number(d.slice(0,4))-n;const tail=d.slice(4);return Number.isFinite(day(y+tail))?y+tail:y+'-02-28';}
export function week(d){const t=day(d);return t-((new Date(t).getUTCDay()+6)%7)*DAY;}
export function weekClose(rows,start,end){
 const out=new Map(); for(const [d,v] of rows){if(d<start||d>end)continue;const w=week(d);out.set(w,[d,v]);}return out;
}
export function changes(rows,start,end,kind){
 const map=weekClose(rows,start,end), out=new Map();
 for(const [w,[d,v]] of map){
  if(w<day(start)||w+4*DAY>day(end))continue;
  const prev=map.get(w-7*DAY);
  if(!prev||w-7*DAY<day(start)-4*DAY) continue;
  const p=prev[1];
  if(kind==='index'&&p===0)continue;
  out.set(w,kind==='index'?100*(v/p-1):v-p);
 }
 return out;
}
export function pearson(a,b,min=12){
 const pairs=[...a].filter(([w,v])=>b.has(w)&&Number.isFinite(v)&&Number.isFinite(b.get(w))).map(([w,v])=>[v,b.get(w)]);
 const n=pairs.length; if(n<min)return {n,r:null,reason:'樣本不足'};
 const x=pairs.reduce((s,p)=>s+p[0],0)/n,y=pairs.reduce((s,p)=>s+p[1],0)/n;
 let xx=0, yy=0, xy=0;
 for(const [u,v] of pairs){xx+=(u-x)**2;yy+=(v-y)**2;xy+=(u-x)*(v-y);}
 return xx>0&&yy>0?{n,r:Math.max(-1,Math.min(1,xy/Math.sqrt(xx*yy)))}:{n,r:null,reason:'變異為零'};
}
export function clean(rows,kind){
 const map=new Map();
 for(const pair of rows||[]){
  if(!Array.isArray(pair))continue;const [d,v]=pair;
  if(typeof d==='string'&&Number.isFinite(day(d))&&Number.isFinite(v)&&(kind==='rate'?v>=-20&&v<=100:v>0))map.set(d,v);
 }
 return [...map].sort(([a],[b])=>a.localeCompare(b));
}
export function csvCells(s){
 const out=[];let val='',inQuote=false;for(let i=0;i<s.length;i++){const c=s[i];if(c==='"'){if(inQuote&&s[i+1]==='"'){val+='"';i++;}else inQuote=!inQuote;}else if(c===','&&!inQuote){out.push(val);val='';}else val+=c;}out.push(val);return out;
}
export function parseFred(text){
 const [head,...lines]=text.replace(/^\uFEFF/,'').split(/\r?\n/);
 const titles=csvCells(head).map(s=>s.trim().toUpperCase());
 const dateCol=titles.findIndex(s=>s==='DATE'||s==='OBSERVATION_DATE'), out={};
 if(dateCol<0)return out;
 const cols=titles.map((s,i)=>[sourceFields[s],i]).filter(([id])=>id);
 for(const [id] of cols)out[id]=[];
 for(const line of lines){
  const r=csvCells(line),d=r[dateCol];if(!d||!ISO.test(d))continue;
  for(const [id,j] of cols){const v=r[j]?.trim();if(v&&v!=='.'&&Number.isFinite(Number(v)))out[id].push([d,Number(v)]);}
 }
 for(const [id,rows] of Object.entries(out)){out[id]=clean(rows,series[id].kind);if(!out[id].length)delete out[id];}
 return out;
}
export function parseTaiwan(j,id,ym){
 const expected=id==='TAIEX'?'收盤指數':'電子類指數';
 if(j?.stat!=='OK'||!Array.isArray(j.fields)||!Array.isArray(j.data))throw Error('TWSE 無資料');
 const k=j.fields.indexOf(expected), dt=j.fields.findIndex(s=>s.replace(/\s/g,'')==='日期');
 if(k<0||dt<0)throw Error('TWSE 欄位不符');
 const rows=j.data.map(r=>{
  const m=String(r[dt]).match(/^(\d+)\/(\d\d)\/(\d\d)$/);
  return m?[String(Number(m[1])+1911)+'-'+m[2]+'-'+m[3],Number(String(r[k]).replace(/,/g,''))]:[];
 }).filter(r=>r[0]?.startsWith(ym));
 const cleanRows=clean(rows,'index');
 if(!cleanRows.length||cleanRows.length!==j.data.length)throw Error('TWSE 交易日不符');
 return cleanRows;
}
export function months(start,end){
 let cursor=start.slice(0,7)+'-01';const out=[];
 while(cursor<=end){out.push(cursor.slice(0,7));const d=new Date(day(cursor));d.setUTCMonth(d.getUTCMonth()+1);cursor=iso(+d);}
 return out;
}
export function completeMonthCloses(rows,today){
 const out={};for(const [d,v] of rows)if(d.slice(0,7)<today.slice(0,7))out[d.slice(0,7)]=v;
 return out;
}
export async function zipCsv(buffer) {
 const bytes=new Uint8Array(buffer), v=new DataView(buffer), dec=new TextDecoder();let p=0,size=0;const texts=[];
 if(bytes.length>5_000_000)throw Error('ZIP 過大');
 for(let files=0;p+4<=v.byteLength&&v.getUint32(p,true)===0x04034b50;files++){
  if(files>=20||p+30>v.byteLength)throw Error('ZIP 格式不支援');
  const flags=v.getUint16(p+6,true),method=v.getUint16(p+8,true),comp=v.getUint32(p+18,true),plain=v.getUint32(p+22,true),nameSize=v.getUint16(p+26,true),extra=v.getUint16(p+28,true);
  if((flags&9)!==0||p+30+nameSize+extra+comp>v.byteLength||plain>3_000_000)throw Error('請先解壓縮，選取內部 CSV');
  const name=dec.decode(bytes.subarray(p+30,p+30+nameSize)), from=p+30+nameSize+extra; p=from+comp;
  if(!/\.csv$/i.test(name))continue;
  let raw=bytes.subarray(from,p);
  if(method===8){
   if(typeof DecompressionStream!=='function')throw Error('瀏覽器不支援 ZIP，請解壓縮後選取內部 CSV');
   const reader=new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();const chunks=[];let n=0;
   try{while(true){const {value,done}=await reader.read();if(done)break;n+=value.length;if(n>plain||size+n>5_000_000)throw Error('ZIP 解壓大小超出上限');chunks.push(value);}}
   finally{await reader.cancel().catch(()=>{});}
   if(n!==plain)throw Error('ZIP 資料損毀');
   raw=new Uint8Array(n);let i=0;for(const c of chunks){raw.set(c,i);i+=c.length;}
  }else if(method!==0||comp!==plain)throw Error('請先解壓縮，選取內部 CSV');
  size+=raw.length;if(size>5_000_000)throw Error('ZIP 過大');
  texts.push(dec.decode(raw));
 }
 if(!texts.length)throw Error('ZIP 無 CSV，請用 FRED 下載檔');
 return texts;
}
