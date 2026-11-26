export const FIELDS = ['date','index','long','short','units631','close631','foreign631','units685','close685','foreign685'];
export function parseObservations(text){
  const [header,...lines]=text.trim().split(/\r?\n/);
  if(header!==FIELDS.join(',')||lines.length===0)throw Error('觀測檔格式錯誤');
  let previous='';
  return lines.map(line=>{
    const x=line.split(','), d=x[0];
    if(x.length!==FIELDS.length||!/^20\d{2}-\d\d-\d\d$/.test(d)||d<=previous)throw Error('觀測日期不正確');
    const v=x.slice(1).map(s=>/^[0-9]+(?:\.[0-9]+)?$/.test(s)?Number(s):NaN);
    if(!v.every(Number.isFinite)||v[0]<=0||v[3]<=0||v[4]<=0||v[6]<=0||v[7]<=0||
       ![1,2,3,5,6,8].every(i=>Number.isSafeInteger(v[i]))||v[5]>v[3]||v[8]>v[6])throw Error('觀測數值不正確');
    previous=d;
    return Object.fromEntries(FIELDS.map((k,i)=>[k,i?v[i-1]:d]));
  });
}
export function exposure(row,basis){
  const foreign=basis==='foreign';
  const u631=foreign?row.foreign631:row.units631, u685=foreign?row.foreign685:row.units685;
  const base=row.index*200;
  const eq631=u631*row.close631*2/base, eq685=u685*row.close685*2/base;
  return {u631,u685,eq631,eq685,total:eq631+eq685,net:row.long-row.short};
}
export function preferRows(base,latest){
  if(!base.length)return latest;
  if(!latest.length)return base;
  const previous=base.at(-1).date;
  const byDate=new Map(latest.map(r=>[r.date,r]));
  if(latest.at(-1).date<previous||!base.every(r=>{
    const compare=byDate.get(r.date);return compare&&FIELDS.every(k=>r[k]===compare[k]);
  }))return base;
  return latest;
}
