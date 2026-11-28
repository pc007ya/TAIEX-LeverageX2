import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {day,dateOK,clean,measure,flowMap,parseCSV,classify} from './model.mjs';
import {US} from './universe.mjs';
const snap=JSON.parse(readFileSync(new URL('./tw-snapshot.json',import.meta.url),'utf8'));
test('50 official ranks, unique and market cap ordered, all have source dates',()=>{
 assert.equal(snap.universe.length,50);
 assert.equal(new Set(snap.universe.map(x=>x.symbol)).size,50);
 assert(snap.universe.some(x=>x.market==='TPEx'));
 for(const [i,x] of snap.universe.entries()){
  assert.equal(x.rank,i+1);
  if(i)assert(x.cap<=snap.universe[i-1].cap);
  assert.equal(snap.prices[x.symbol][0][0],snap.date);
  assert.equal(measure(clean(snap.prices[x.symbol]),snap.date,snap.date,'proxy',null,x.market).missing,undefined);
 }
});
test('proxy and exchange reset vs US previous close',()=>{
 const rows=clean([['2020-01-01',20,21,18,20,1],['2020-01-02',11,11,9,300,1],['2020-01-03',10,12,10,100,-1]]);
 const tw=measure(rows,'2020-01-02','2020-01-03','proxy',null,'TWSE'),us=measure(rows,'2020-01-02','2020-01-03','proxy',null,'US');
 assert.equal(tw.x,50);assert(Math.abs(tw.y)<1e-9);assert(Math.abs(us.y+50)<1e-9);
 assert.equal(tw.q,'N');
});
test('all quadrants and zero axis',()=>{
 assert.deepEqual([[1,1],[-1,1],[-1,-1],[1,-1],[1,0]].map(x=>classify(...x)),['1','2','3','4','N']);
});
test('exact observed exchange T86 total excludes foreign dealer',()=>{
 const d='2026-11-27';
 const vals=[['Foreign_Investor',20686833,29397392],['Investment_Trust',1115061,203010],['Dealer_self',808020,251000],['Dealer_Hedging',426613,391210],['Foreign_Dealer_Self',1000000,0]];
 const f=flowMap(vals.map(([name,buy,sell])=>({date:d,name,buy,sell})));
 assert.equal(f.get(d).foreign,-8710559);
 assert.equal(f.get(d).institutions,-7206085);
 const x=measure(clean(snap.prices['2330']),d,d,'institutions',f,'TWSE');
 assert.equal(x.net,-7206085);assert(x.y>0);
 assert.equal(measure(clean(snap.prices['2330']),d,d,'institutions',f,'US').missing,'美股無相同口徑的法人淨額');
});
test('missing information remains missing; horizon & date validation',()=>{
 assert.equal(dateOK('2020-02-30'),false);assert.equal(day('2024-03-01',-1),'2024-02-29');
 assert(measure(clean(snap.prices['2330']),'2020-11-27',snap.date,'proxy',null,'TWSE').missing);
 assert(measure(clean(snap.prices['2330']),snap.date,snap.date,'institutions',new Map(),'TWSE').missing);
});
test('SNDK discards legacy history and US universe includes all named names',()=>{
 for(const s of ['AAPL','MSFT','NVDA','AMZN','GOOGL','META','TSLA','MU','SNDK','AMAT','ASML','XLE','XLF','XLP','XLV','XLU'])assert(US.some(x=>x.symbol===s));
 const s=US.find(x=>x.symbol==='SNDK');
 const rows=clean([['2020-12-01',10],['2025-02-24',20]],s.listed);
 assert.equal(rows.length,1);
 assert(measure(rows,'2021-01-01','2021-01-02','proxy',null,'US',s.listed).missing.includes('獨立'));
 const measured=measure(clean([['2025-02-24',10,11,9,100],['2025-02-25',11,12,9,100]]),'2020-11-27','2025-02-25','proxy',null,'US',s.listed);
 assert.equal(measured.partial,true);assert(Math.abs(measured.y-10)<1e-8);
});
test('CSV validates schema, correct UTC dates and numeric cleaning',()=>{
 assert.throws(()=>parseCSV('data,date\nfoo,2025-02-24'));
 const rows=parseCSV('symbol,date,close,high,low,volume\nAAPL,2025-02-30,10,11,8,500\nAAPL,2025-02-28,10,11,8,500\n');
 assert.deepEqual(clean(rows.get('AAPL')),[['2025-02-28',10,11,8,500,null]]);
});
test('a Friday snapshot cannot represent the whole week; sparse endpoints are not a complete month',()=>{
 const rows=clean(snap.prices['2330']);
 assert.equal(measure(rows,'2026-11-21',snap.date,'proxy',null,'TWSE').missing,'所選期間的交易日資料不完整');
 assert.equal(measure(rows,snap.date,snap.date,'proxy',null,'TWSE').missing,undefined);
 const us=clean([['2026-10-30',95,98,92,100],['2026-11-02',100,102,98,200],['2026-11-27',106,108,102,200]]);
 assert.equal(measure(us,'2026-11-01','2026-11-30','proxy',null,'US').missing,'所選期間的交易日資料不完整');
});
test('playback remeasures real sessions with fixed scale and no forward filling',async()=>{
 const {playbackFrames}=await import('./model.mjs');
 const d=['2026-11-19','2026-11-20','2026-11-23','2026-11-24','2026-11-25','2026-11-26','2026-11-27'];
 const rows=clean(d.map((date,i)=>[date,100+i,103+i,98+i,100,1]));
 const stocks=[{symbol:'2330',market:'TWSE',listed:'1994-09-05'},{symbol:'AAPL',market:'US',listed:'1980-12-12'}];
 const get=s=>s.symbol==='2330'?rows:rows.slice(0,4);
 const daily=playbackFrames(stocks,d[2],d.at(-1),'proxy',1,get,new Map());
 assert.deepEqual(daily.frames.map(x=>x.date),d.slice(2));
 assert.equal(daily.frames[0].points.length,2);
 assert.equal(daily.frames.at(-1).points.length,1);
 const roll=playbackFrames(stocks,d[2],d.at(-1),'proxy',5,get,new Map());
 assert.deepEqual(roll.frames.map(x=>x.date),d.slice(4));
 assert.equal(roll.frames[0].points[0].days,5);
 assert(roll.maxima.y>4);
});
