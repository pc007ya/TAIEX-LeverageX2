import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comparableUnits, makeChanges, correlate, rolling } from '../positioning/relationship.mjs';
import { parseObservations, exposure, FIELDS } from '../positioning/model.mjs';
test('same price basis notional and no artificial growth at split or trading halt',()=>{
 const stable={index:22000,long:1,short:5,units685:1000,close685:10,foreign685:100};
 const rows=[
 {date:'2026-03-24',...stable,close631:440,units631:1000,foreign631:50},
 {date:'2026-03-25',...stable,close631:null,units631:1000,foreign631:50},
 {date:'2026-03-31',...stable,close631:20,units631:22000,foreign631:1100},
 {date:'2026-04-01',...stable,close631:21,units631:24200,foreign631:1210}];
 assert.deepEqual(rows.map(r=>comparableUnits(r,'631')),[22000,null,22000,24200]);
 assert.equal(exposure(rows[0],'issued').eq631,exposure(rows[2],'issued').eq631);
 assert.equal(exposure(rows[1],'issued').eq631,null);
 const changes=makeChanges(rows,'631');
 assert.deepEqual(changes.slice(0,3).map(r=>r.x),[null,null,null]);
 assert.ok(Math.abs(changes[3].x-10)<1e-9);
});
test('partial Pearson removes common movement, and lag sign means ETF leads',()=>{
 const score=i=>Math.sin(i*2.666);
 const market=i=>Math.cos(i*1.22);
 const rows=Array.from({length:90},(_,i)=>({x:score(i)+10*market(i),z:market(i),y:score(i-2)+20*market(i)}));
 assert.ok(correlate(rows).plain>.9);
 assert.ok(correlate(rows,2).adjusted>.99);
 assert.ok(correlate(rows,-2).adjusted<.8);
 assert.equal(rolling(rows).filter(Number.isFinite).length,31);
});
test('parser leaves real gaps blank and does not accept mismatched long/short',()=>{
 const header=FIELDS.join(',')+'\n';
 const [r]=parseObservations(header+'2021-11-26,20000,,,22000,25,200,24000,,240');
 assert.equal(r.long,null);
 assert.equal(exposure(r,'issued').net,null);
 assert.equal(exposure(r,'issued').total,null);
 assert.throws(()=>parseObservations(header+'2021-11-26,20000,19,,22000,25,200,24000,,240'));
});
