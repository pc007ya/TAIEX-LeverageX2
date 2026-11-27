const test=require('node:test');
const assert=require('node:assert/strict');
const v=require('./valuation.js');
test('six-year window is 72 contiguous months',()=>{
  const months=v.monthList('2026-11',72);
  assert.equal(months.length,72);
  assert.equal(months[0],'2020-12');assert.equal(months.at(-1),'2026-11');
});
test('CSV permits blank missing values and formatted quoted prices',()=>{
  assert.deepEqual(v.parseValCsv('\ufeffmonth,symbol,close,pe,fpe\r\n2026-01,comp,"20,150.65",,23.4','2026-11'),[{month:'2026-01',symbol:'COMP',close:20150.65,pe:null,fpe:23.4}]);
  assert.equal(v.parseValCsv('month,symbol,close,pe,fpe\n2026-01,TAIEX,,21.24,','2026-11')[0].fpe,null);
});
test('bad ratios, fabricated zeros, unsupported ticker and duplicate rows reject',()=>{
  const row='month,symbol,close,pe,fpe\n';
  for(const x of ['2026-01,NDX,20,10,11','2026-01,SOX,20,0,11','2026-01,SOX,20,,','2026-12,SOX,20,25,24','2026-01,COMP,20,-23,24','2026-01,TAIEX,20,20.5,\n2026-01,TAIEX,20,20,','2026-01,TAIEX,"20,20.5,'])assert.throws(()=>v.parseValCsv(row+x,'2026-11'),/第 2 列|第 3 列/);
});
test('only same symbol/date and positive ratio match; no bridge across missing periods',()=>{
  const rows=[{month:'2026-01',symbol:'TAIEX',pe:20},{month:'2026-02',symbol:'COMP',pe:99},{month:'2026-03',symbol:'TAIEX',pe:24}];
  const days=['2026-01','2026-02','2026-03'];
  const points=v.observations(days,rows,{TAIEX:{'2026-01':100,'2026-02':110}},'TAIEX','pe');
  assert.deepEqual(points.map(x=>[x.month,x.ratio,x.close]),[['2026-01',20,100],['2026-03',24,null]]);
  assert.deepEqual(v.runs(points).map(g=>g.length),[1,1]);
});
test('quantiles interpolate input without mutation',()=>{
  const a=[27,18,21,24];
  assert.equal(v.qtile(a,.5),22.5);assert.deepEqual(a,[27,18,21,24]);
});
