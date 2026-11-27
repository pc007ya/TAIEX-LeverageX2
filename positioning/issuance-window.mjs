export function anniversary(date,years){
 const [year,month,day]=date.split('-').map(Number);
 const y=year-years,max=new Date(Date.UTC(y,month,0)).getUTCDate();
 return new Date(Date.UTC(y,month-1,Math.min(day,max))).toISOString().slice(0,10);
}
export function validateIssuance(rows,funds){
 const overlap={631:0,685:0};
 for(const row of rows)for(const key of ['631','685']){
  const u=funds[key].get(row.date);
  if(u&&row['units'+key]!==null){
   overlap[key]++;
   if(u.count!==row['units'+key]||u.held!==row['foreign'+key])throw Error('ETF '+key+' 與公開資料不符：'+row.date);
  }
 }
 if(Object.values(overlap).some(v=>v<10))throw Error('ETF 可交叉核對的交易日不足');
 return overlap;
}
export function issuanceCounts(rows){
 return {
  total:rows.length,
  a:rows.filter(r=>Number.isFinite(r.units631)).length,
  b:rows.filter(r=>Number.isFinite(r.units685)).length,
  both:rows.filter(r=>[r.units631,r.units685].every(Number.isFinite)).length,
 };
}
