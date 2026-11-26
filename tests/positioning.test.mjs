import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FIELDS,parseObservations, exposure, preferRows} from '../positioning/model.mjs';
const sample='2026-11-26,39151.81,9083,115358,11297348000,25.5,61178229,11738336000,8.25,18549661';
const d=(...lines)=>parseObservations(FIELDS.join(',')+'\n'+lines.join('\n'));
test('issued and foreign holdings are two denominators; neither changes actual net',()=>{
  const [r]=d(sample);
  const issued=exposure(r,'issued'), foreign=exposure(r,'foreign');
  assert.deepEqual([issued.net,foreign.net],[-106275,-106275]);
  assert.equal(foreign.u685,18549661);
  assert.equal(Math.round(issued.eq631),73581);
  assert.equal(Math.round(foreign.total),438);
});
test('invalid values and stale or incompatible raw feeds cannot replace bundled history',()=>{
  const old=sample.replace('2026-11-26','2026-11-25');
  const base=d(old,sample), fresh=d(old,sample,sample.replace('2026-11-26','2026-11-27'));
  assert.equal(preferRows(base,d(sample)),base);
  assert.equal(preferRows(base,fresh),fresh);
  assert.throws(()=>d(sample.replace('61178229','99999999999')));
  assert.throws(()=>d(sample,sample));
});
test('bundled data have full dated observations and preserve exact final nets',()=>{
  const rows=parseObservations(readFileSync(new URL('../positioning/observations.csv',import.meta.url),'utf8'));
  assert.ok(rows.length>=40);
  const date=rows.find(r=>r.date==='2026-11-26');
  assert.equal(exposure(date,'issued').net,-106275);
});
