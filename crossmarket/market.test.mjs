import test from 'node:test';
import assert from 'node:assert/strict';
import {day,yearsBefore,week,changes,pearson,parseFred,parseTaiwan,months,iso,zipCsv,completeMonthCloses} from './market-core.mjs';

test('leap-year date clamp and six-year month list',()=>{
 assert.equal(yearsBefore('2024-02-29',3),'2021-02-28');
 assert.equal(months('2020-11-27','2026-11-27').length,73);
 assert.equal(iso(week('2026-11-27')),'2026-11-23');
 assert.ok(Number.isNaN(day('2026-02-30')));
});
test('changes pair only adjacent completed weeks and select end of week',()=>{
 const obs=[['2026-01-02',100],['2026-01-06',90],['2026-01-08',110],['2026-01-23',120],['2026-01-30',132],['2026-02-03',141]];
 const result=changes(obs,'2026-01-02','2026-02-04','index');
 assert.deepEqual([...result.keys()].map(iso),['2026-01-05','2026-01-26']);
 assert.ok([...result.values()].every(v=>Math.abs(v-10)<1e-10));
 const r=changes(obs,'2026-01-02','2026-02-04','point');
 assert.deepEqual([...r.values()],[10,12]);
});
test('Pearson matches observed ISO weeks; refuses sparse/constant',()=>{
 const a=new Map(Array.from({length:16},(_,i)=>[i,i]));
 const b=new Map(Array.from({length:16},(_,i)=>[i+2,-3*i]));
 assert.deepEqual(pearson(a,b),{n:14,r:-1});
 assert.deepEqual(pearson(a,new Map([[8,1]])),{n:1,r:null,reason:'樣本不足'});
 assert.deepEqual(pearson(a,new Map([...a].map(([i])=>[i,2]))),{n:16,r:null,reason:'變異為零'});
});
test('FRED actual headers, missing values, bad dates, split files',()=>{
 const got=parseFred('observation_date,NASDAQCOM,VIXCLS,BOGUS\n2026-11-25,23585.80,28.29,1\n2026-11-26,,26.80,2\n2026-11-31,111,12,3\n2026-11-27,.,,5');
 assert.deepEqual(got,{COMP:[['2026-11-25',23585.8]],VIX:[['2026-11-25',28.29],['2026-11-26',26.80]]});
 assert.deepEqual(parseFred('abc,value\n2026-11-25,1'),{});
});
test('TWSE ROC conversion, exact field and month; reject misdated inputs',()=>{
 const d={stat:'OK',fields:['日　期','電子類指數'],data:[['115/11/27','2,436.71']]};
 assert.deepEqual(parseTaiwan(d,'TWTECH','2026-11'),[['2026-11-27',2436.71]]);
 assert.throws(()=>parseTaiwan(d,'TWTECH','2026-10'));
 assert.throws(()=>parseTaiwan(d,'TAIEX','2026-11'));
});
test('month-end excludes still-open calendar month',()=>{
 assert.deepEqual(completeMonthCloses([['2026-10-29',1],['2026-10-30',2],['2026-11-27',3]],'2026-11-28'),{'2026-10':2});
});
test('reject invalid archive',async()=>{
 await assert.rejects(zipCsv(new Uint8Array([1,2,3,4,5]).buffer),/無 CSV/);
});
