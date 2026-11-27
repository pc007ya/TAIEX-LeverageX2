import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseCandles,candleFor,candlePaths,candleDomain,extendWithIndex} from '../positioning/candles.mjs';
import {exposure,netShortLots,parseObservations} from '../positioning/model.mjs';
const map=parseCandles(fs.readFileSync(new URL('../positioning/taiex-ohlc.csv',import.meta.url),'utf8'));
test('checks every published same-day position row against official candle, never fills a contradiction',()=>{
 const rows=parseObservations(fs.readFileSync(new URL('../positioning/observations.csv',import.meta.url),'utf8'));
 assert(rows.length>=1200);
 for(const r of rows)assert(candleFor(map,r),r.date);
 assert.equal(candleFor(map,{date:'2026-11-27',index:39000}),null);
 assert.equal(candleFor(map,{date:'2026-11-27',index:39308.08}).open,39168.57);
});
test('plots high/low and gaps and styles from today open vs close',()=>{
 const fallback={open:10,high:18,low:7,close:14}, rows=[fallback,null,{...fallback,close:8},{...fallback,close:10}];
 const p=candlePaths(rows,i=>i*25,v=>100-v,25);
 assert.match(p.up.wick,/^M0 82V93$/);assert.match(p.down.body,/H55/);assert.match(p.flat.wick,/^M75 /);
 assert.equal(Object.values(p).map(x=>x.wick).join().includes('M25 '),false);
 const [l,h]=candleDomain(rows);assert(l<7&&h>18);
 const head='date,open,high,low,close\n';
 for(const x of ['2026-02-30,10,18,7,14','2026-11-27,10,8,7,14','2026-11-27,,18,7,14'])assert.throws(()=>parseCandles(head+x));
});

test('compares same-date equivalent and actual net shorts without filling blanks',()=>{
 const rows=parseObservations(fs.readFileSync(new URL('../positioning/observations.csv',import.meta.url),'utf8'));
 const r=rows.find(v=>v.date==='2026-11-26'), exp=exposure(r,'issued');
 assert.equal(netShortLots(exp.net),106275);
 assert.equal(exp.total,exp.eq631+exp.eq685);
 assert.equal(netShortLots(null),null);
 assert.equal(netShortLots(25),-25);
 assert.equal(netShortLots(0),0);
 assert.equal(exposure({...r,units685:null},'issued').total,null);
 assert.equal(exposure({...r,long:null},'issued').net,null);
});

test('adds a later index candle without advancing ETF or futures data',()=>{
 const row={date:'2026-11-26',index:39151.81};
 const days=extendWithIndex([row],map);
 assert.equal(days[0],row);
 assert.equal(days.at(-1).date,'2026-11-27');
 assert.equal(days.at(-1).index,39308.08);
 assert.equal(days.at(-1).units631,null);
 assert.equal(days.at(-1).long,null);
});
