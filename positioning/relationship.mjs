export const SPLITS={
  '631':{factor:22,halt:'2026-03-25',resume:'2026-03-31'},
  '685':{factor:24,halt:'2026-07-01',resume:'2026-07-07'}
};
export function comparableUnits(row,fund,basis='issued'){
  const info=SPLITS[fund], raw=row[(basis==='foreign'?'foreign':'units')+fund];
  if(!Number.isFinite(raw)||row.date>=info.halt&&row.date<info.resume)return null;
  return raw*(row.date<info.halt?info.factor:1);
}
export function makeChanges(rows,fund){
  return rows.map((row,i)=>{
    const prior=rows[i-1];
    if(!prior)return {date:row.date,x:null,y:null,z:null};
    const u=comparableUnits(row,fund), u0=comparableUnits(prior,fund);
    return {
      date:row.date,
      x:Number.isFinite(u)&&u0>0&&row.date!==SPLITS[fund].resume?(u/u0-1)*100:null,
      y:[row.short,row.long,prior.short,prior.long].every(Number.isFinite)?(row.short-row.long)-(prior.short-prior.long):null,
      z:(row.index/prior.index-1)*100,
    };
  });
}
function moments(pairs){
  const n=pairs.length;
  let mx=0,my=0;
  for(const [x,y] of pairs){mx+=x;my+=y;}
  mx/=n||1;my/=n||1;
  let xx=0,yy=0,xy=0;
  for(const [x,y] of pairs){const a=x-mx,b=y-my;xx+=a*a;yy+=b*b;xy+=a*b;}
  return {xx,yy,xy,mx,my};
}
function pearson(pairs){
  const {xx,yy,xy}=moments(pairs);
  return xx>0&&yy>0?Math.min(1,Math.max(-1,xy/Math.sqrt(xx*yy))):null;
}
function residual(pairs){
  const m=moments(pairs), slope=m.yy?m.xy/m.yy:0;
  return pairs.map(([v,z])=>v-m.mx-slope*(z-m.my));
}
export function correlate(data,lag=0,from=0,to=data.length){
  const valid=[];
  for(let i=from;i<to;i++){
    const j=i+lag;
    if(j<from||j>=to)continue;
    const a=data[i],b=data[j];
    if([a.x,a.z,b.y,b.z].every(Number.isFinite))valid.push([a.x,b.y,a.z,b.z]);
  }
  const n=valid.length;
  if(n<20)return {n,plain:null,adjusted:null};
  const plain=pearson(valid.map(([x,y])=>[x,y]));
  // Remove the same-date market return from each input at its own date.
  const x=residual(valid.map(([a,,z])=>[a,z]));
  const y=residual(valid.map(([,b,,z])=>[b,z]));
  return {n,plain,adjusted:pearson(x.map((a,i)=>[a,y[i]]))};
}
export function lags(data){
  return Array.from({length:11},(_,j)=>({lag:j-5,...correlate(data,j-5)}));
}
export function rolling(data,size=60,min=40){
  return data.map((_,i)=>{
    if(i+1<size)return null;
    const r=correlate(data,0,i+1-size,i+1);
    return r.n>=min?r.adjusted:null;
  });
}
