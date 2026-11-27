import fs from 'node:fs';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {anniversary,validateIssuance,issuanceCounts} from '../positioning/issuance-window.mjs';
import {parseObservations,parseLocalFunds,asResearchRows,exposure} from '../positioning/model.mjs';
const rows=parseObservations(fs.readFileSync(new URL('../positioning/observations.csv',import.meta.url),'utf8'));
test('uses rolling anniversary windows and leap-day clamp',()=>{
 assert.equal(anniversary('2024-02-29',1),'2023-02-28');
 assert.equal(anniversary('2026-11-26',5),'2021-11-26');
 assert.equal(anniversary('2026-11-26',1),'2025-11-26');
});
test('requires an official overlap for each independently and preserves gaps',()=>{
 const tail=rows.filter(r=>r.date<='2026-11-26').slice(-12);
 const f=k=>new Map(tail.map(r=>[r.date,{count:r['units'+k],held:r['foreign'+k]}]));
 const maps={631:f('631'),685:f('685')};
 assert.deepEqual(validateIssuance(tail,maps),{631:12,685:12});
 const [d,v]=maps[685].entries().next().value;
 maps[685].set(d,{...v,count:v.count+1});
 assert.throws(()=>validateIssuance(tail,maps),/685 與公開資料不符/);
 assert.throws(()=>validateIssuance(tail,{...maps,685:new Map()}),/不足/);
 const r={...tail[0],units631:null,foreign631:null};
 assert.equal(exposure(r,'issued').total,null);
 const merged=asResearchRows([r],new Map(),{631:maps[631],685:new Map()});
 assert.deepEqual(issuanceCounts(merged),{a:1,b:1,both:1,total:1});
 assert.equal(merged[0].long,r.long);
});
test('rejects null, empty, and missing foreign holding instead of treating them as zero',()=>{
 const known=new Set(['2021-11-26']), sample={date:'2021-11-26',stock_id:'00631L',NumberOfSharesIssued:100};
 for(const value of [null,'',undefined])assert.throws(()=>parseLocalFunds({status:200,data:[{...sample,ForeignInvestmentShares:value}]},'00631L',known));
 assert.equal(parseLocalFunds({status:200,data:[{...sample,ForeignInvestmentShares:0}]},'00631L',known).size,1);
});
