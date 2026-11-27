import {comparableUnits} from './relationship.mjs?v=5';
export const FIELDS = ['date','index','long','short','units631','close631','foreign631','units685','close685','foreign685'];
export function parseObservations(text){
  const [header,...lines]=text.trim().split(/\r?\n/);
  if(header!==FIELDS.join(',')||lines.length===0)throw Error('觀測檔格式錯誤');
  let previous='';
  return lines.map(line=>{
    const x=line.split(','), d=x[0];
    if(x.length!==FIELDS.length||!/^20\d{2}-\d\d-\d\d$/.test(d)||d<=previous)throw Error('觀測日期不正確');
    const v=x.slice(1).map(s=>s===''?null:/^[0-9]+(?:\.[0-9]+)?$/.test(s)?Number(s):NaN);
    if(!v.every(i=>i===null||Number.isFinite(i))||!(v[0]>0)||
       [3,4,6,7].some(i=>v[i]!==null&&v[i]<=0)||
       ![1,2,3,5,6,8].every(i=>v[i]===null||Number.isSafeInteger(v[i]))||
       (v[1]===null)!==(v[2]===null)||(v[3]===null)!==(v[5]===null)||(v[6]===null)!==(v[8]===null)||
       v[5]>v[3]||v[8]>v[6])throw Error('觀測數值不正確');
    previous=d;
    return Object.fromEntries(FIELDS.map((k,i)=>[k,i?v[i-1]:d]));
  });
}
export function exposure(row,basis){
  const foreign=basis==='foreign';
  const u631=comparableUnits(row,'631',basis),u685=comparableUnits(row,'685',basis);
  const raw631=foreign?row.foreign631:row.units631, raw685=foreign?row.foreign685:row.units685;
  const base=row.index*200;
  const eq=(normalized,raw,close)=>[normalized,raw,close].every(Number.isFinite)?raw*close*2/base:null;
  const eq631=eq(u631,raw631,row.close631),eq685=eq(u685,raw685,row.close685);
  return {u631,u685,eq631,eq685,total:eq631!==null&&eq685!==null?eq631+eq685:null,
          net:[row.long,row.short].every(Number.isFinite)?row.long-row.short:null};

}
// Positive is net short; a net long remains negative, missing stays null.
export function netShortLots(net){
  return Number.isFinite(net)?(net===0?0:-net):null;
}

export function preferRows(base,latest){
  if(!base.length)return latest;
  if(!latest.length)return base;
  const previous=base.at(-1).date;
  const byDate=new Map(latest.map(r=>[r.date,r]));
  if(latest.at(-1).date<previous||!base.every(r=>{
    const compare=byDate.get(r.date);return compare&&FIELDS.every(k=>r[k]===compare[k]);
  }))return base;
  return latest;
}

export function parseLocalInterest(content,known){
  const text=content.trim().replace(/^\uFEFF/,'');
  let lines;
  if(text.startsWith('{')){
    const source=JSON.parse(text);
    if(source.status!==200||!Array.isArray(source.data))throw Error('無法讀取 JSON 資料');
    lines=source.data.filter(row=>row.futures_id==='TX'&&['外資','外資及陸資'].includes(row.institutional_investors))
      .map(row=>[row.date,row.long_open_interest_balance_volume,row.short_open_interest_balance_volume]);
  }else{
    const [header,...values]=text.split(/\r?\n/);
    if(header!=='date,long,short')throw Error('CSV 表頭須為 date,long,short');
    lines=values.map(line=>line.split(','));
  }
  const result=new Map();
  for(const [date,long,short,...extra] of lines){
    if(extra.length||!/^20\d{2}-\d\d-\d\d$/.test(date)||![long,short].every(v=>/^\d{1,9}$/.test(v))||result.has(date))
      throw Error('日期或口數格式錯誤：'+date);
    if(known.has(date))result.set(date,{long:+long,short:+short});
  }
  if(!result.size)throw Error('沒有可使用的大臺未平倉紀錄');
  return result;
}

export function parseLocalFunds(source,code,known){
  if(source.status!==200||!Array.isArray(source.data))throw Error('無法讀取 '+code+' 歷史發行量');
  const records=new Map();
  for(const row of source.data){
    if(row.stock_id!==code)throw Error('ETF 代號不符：'+code);
    const d=row.date, u=Number(row.NumberOfSharesIssued), f=Number(row.ForeignInvestmentShares);
    if(!known.has(d))continue;
    if(records.has(d)||!Number.isSafeInteger(u)||!Number.isSafeInteger(f)||u<=0||f<0||f>u)throw Error('ETF 歷史欄位不正確：'+code+' '+d);
    records.set(d,{count:u,held:f});
  }
  return records;
}
export function asResearchRows(rows,tx,issuance){
  return rows.map(row=>{
    const result={...row};
    const localTx=tx.get(row.date);
    if(localTx&&row.long===null){result.long=localTx.long;result.short=localTx.short;}
    for(const fund of ['631','685']){
      const local=issuance[fund]?.get(row.date);
      if(local&&row['units'+fund]===null){result['units'+fund]=local.count;result['foreign'+fund]=local.held;}
    }
    return result;
  });
}
