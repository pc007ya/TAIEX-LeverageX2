import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {analyze,chartDomain,chartWindow,tradingWindow,commonBase,day,mergeRows,parseCSV,summary} from '../tracking/model.mjs';
const eq=(a,b)=>assert.ok(Math.abs(a-b)<1e-9, a+' vs '+b);
const dates=['2026-05-04','2026-05-05','2026-05-06','2026-05-07'];
test('source tabs map by exact header, ignore flawed formulas/private fields',()=>{
  const a=parseCSV('\ufeff日期,50,0050相對報酬,台指,含息大盤,00685L,帳號\r\n2026/5/4,94.6,#REF!,"40,705.14",92860.88,10.14,secret');
  assert.deepEqual(a,[{date:dates[0],'0050':94.6,TAIEX:40705.14,TRI:92860.88,'00685L':10.14}]);
  const b=parseCSV('日期,0050收盤價,0052收盤價,2330收盤價,00981A收盤價\n2026-05-05,94.6,61.75,2400,27.4');
  assert.equal(b[0]['0052'],61.75);
  assert.equal(b[0]['0050'],94.6);
});
test('common date, percent-point difference and 2x daily comparison are separate',()=>{
  const rows=parseCSV('日期,TAIEX,00685L,2330\n2026/5/4,100,10,\n2026/5/5,110,12,500\n2026/5/6,121,15,550');
  assert.equal(commonBase(rows,['TAIEX','00685L','2330']).date,dates[1]);
  const a=analyze(rows,['00685L','2330'],'TAIEX');
  assert.equal(a.base,dates[1]);assert.equal(a.points[0].spread['00685L'],null);
  eq(a.points[1].performance['00685L'],.25);
  eq(a.points[1].difference['00685L'],.15);
  eq(a.points[1].spread['00685L'],.05);
  eq(a.points[1].spread['2330'],0);
  assert.equal(summary(a.points,'00685L').dev,null);
});
test('no missing price interpolation or multi-day masquerading as single-day',()=>{
  const rows=parseCSV('日期,TAIEX,00685L\n2026/5/4,100,10\n2026/5/5,110,#N/A\n2026/5/6,100,10\n2026/5/7,100,10');
  const {points}=analyze(rows,['00685L'],'TAIEX');
  assert.deepEqual(points.map(x=>x.spread['00685L']),[null,null,null,0]);
  assert.equal(points[1].performance['00685L'],null);
  assert.equal(summary(points,'00685L').n,1);
});
test('annualization uses sample standard deviation, not cumulative difference',()=>{
  const st=summary([0,.02,null].map(x=>({spread:{x}})),'x');
  assert.equal(st.n,2);eq(st.avg,.01);eq(st.dev,Math.sqrt(.0002*252));
});
test('merge overlays only recognized columns and sorts; rejects invalid inputs',()=>{
  const a=parseCSV('日期,0050,00685L\n2026-05-05,100,20');
  const b=parseCSV('日期,0050,0052\n2026-05-04,90,45\n2026-05-05,,50');
  assert.deepEqual(mergeRows(a,b),[{date:dates[0],'0050':90,'0052':45},{date:dates[1],'0050':null,'0052':50,'00685L':20}]);
  assert.equal(day('2026/2/30'),null);
  assert.throws(()=>parseCSV('日期,0050,50\n2026-05-05,50,60'));
  assert.throws(()=>parseCSV('日期,0050\n2026-05-05,50\n2026-05-05,60'));
  assert.throws(()=>parseCSV('日期,0050\n2026-05-05,Infinity'));
});
test('snapshot uses only public market fields and leaves split suspension blank',()=>{
  const txt=fs.readFileSync(new URL('../tracking/market-snapshot.csv',import.meta.url),'utf8');
  assert.equal(txt.split('\n')[0],'日期,TAIEX,TRI,0050,009816,00685L,00631L,0052,2330,00981A,0055');
  const rows=parseCSV(txt);
  assert.ok(rows.length>=242);
  assert.equal(rows[0].date,'2025-11-26');
  assert.equal(rows.find(x=>x.date==='2026-11-26').TAIEX,39151.81);
  assert.equal(rows.find(x=>Number.isFinite(x['009816'])).date,'2026-02-03');
  assert.equal(rows.find(x=>x.date==='2026-07-02')['00685L'],null);
  assert.equal(rows.find(x=>x.date==='2026-10-27')['0052'],61.75);
});

test('index points and returns use independent domains and handle missing values',()=>{
  const pts=chartDomain([40500,39000,null,NaN,0],'points');
  assert.ok(pts[0]>38000&&pts[0]<39000&&pts[1]>40500);
  assert.equal(chartDomain([null,NaN,0],'points'),null);
  const flat=chartDomain([40500,40500],'points');
  assert.ok(flat[0]<40500&&flat[1]>40500);
  const ret=chartDomain([.09,.02,NaN],'return');
  assert.ok(ret[0]<0&&ret[1]>.09);
  assert.ok(chartDomain([null],'return')[1]>0);
});

test('0052 and 0055 compare across the same 23 exchange closes',()=>{
  const rows=parseCSV(fs.readFileSync(new URL('../tracking/market-snapshot.csv',import.meta.url),'utf8'));
  const span=rows.filter(d=>d.date>='2026-10-27'&&d.date<='2026-11-26');
  const a=analyze(span,['0052','0055'],'TAIEX');
  assert.equal(a.base,'2026-10-27');
  assert.equal(a.points.length,23);
  assert.ok(a.points.every(d=>Number.isFinite(d.performance['0052'])&&Number.isFinite(d.performance['0055'])));
  assert.ok(rows.find(x=>x.date==='2025-11-26')['0055']>0);
  eq(a.points.at(-1).performance['0052'],53.45/61.75-1);
  eq(a.points.at(-1).performance['0055'],42.51/52.20-1);
});

test('zoom stays inside the data and keeps boundary dates reachable',()=>{
  assert.deepEqual(chartWindow(0,0,10),[0,0]);
  assert.deepEqual(chartWindow(23,22,Infinity),[0,23]);
  assert.deepEqual(chartWindow(23,22,5),[18,23]);
  assert.deepEqual(chartWindow(23,0,5),[0,5]);
  assert.deepEqual(chartWindow(23,11,5),[9,14]);
  assert.deepEqual(chartWindow(2,1,5),[0,2]);
});

test('date picker ranges are inclusive and skip weekends without fabricating data',()=>{
  const days=['2026-11-20','2026-11-23','2026-11-24','2026-11-25'].map(date=>({date}));
  assert.deepEqual(tradingWindow(days,'2026-11-21','2026-11-24'),[1,3]);
  assert.deepEqual(tradingWindow(days,'2026-11-24','2026-11-24'),[2,3]);
  assert.equal(tradingWindow(days,'2026-11-21','2026-11-22'),null);
  assert.equal(tradingWindow(days,'2026-11-25','2026-11-24'),null);
});
