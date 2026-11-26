"""Build and refresh public closing-price history from TWSE, not from Sheets."""
import argparse
import csv
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
import json
import os
from pathlib import Path
import time
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

FIELDS = ('日期','TAIEX','TRI','0050','009816','00685L','00631L','0052','2330','00981A','0055')
SYMBOLS = FIELDS[3:]
INDEX = {'TAIEX': '發行量加權股價指數', 'TRI': '發行量加權股價報酬指數'}
SPLITS = {'0052': ('2025-11-26', 7), '00631L': ('2026-03-31', 22), '00685L': ('2026-07-07', 24)}
SUSPENDED = {'0052': ('2025-11-19','2025-11-25'), '00631L': ('2026-03-25','2026-03-30'), '00685L': ('2026-07-01','2026-07-06')}
LISTED = {'009816':'2026-02-03'}
CSV_PATH = Path('tracking/market-snapshot.csv')

def roc(value):
    y,m,d=map(int,value.split('/'))
    return date(y+1911,m,d).isoformat()

def numeric(value):
    try:
        n=Decimal(str(value).replace(',','').strip())
        if n.is_finite() and n>0:
            return n
    except InvalidOperation:
        pass
    raise ValueError(f'Invalid close: {value!r}')

def unavailable(k, d):
    lo,hi=SUSPENDED.get(k,('',''))
    return d<LISTED.get(k,'') or lo<=d<=hi

def adjusted(k,d,value):
    n=numeric(value)
    if k in SPLITS and d<SPLITS[k][0]:
        n=(n/SPLITS[k][1]).quantize(Decimal('0.000001'))
    return format(n.normalize(),'f')

def month_id(d):
    return d[:7].replace('-','')+'01'

def anniversary(d):
    try:
        return d.replace(year=d.year-1)
    except ValueError:
        return d.replace(year=d.year-1,day=28)

def months(start,end):
    d=start.replace(day=1)
    while d<=end:
        yield d.strftime('%Y%m')
        d=date(d.year+1,1,1) if d.month==12 else date(d.year,d.month+1,1)

def request_json(path, params):
    failures=[]
    for host in ('www.twse.com.tw','wwwc.twse.com.tw','www.twse.com.tw'):
        try:
            req=Request('https://'+host+'/'+path+'?'+urlencode(params),headers={'User-Agent':'Mozilla/5.0 (compatible; Taiwan market close history)'})
            with urlopen(req,timeout=18) as res:
                obj=json.load(res)
            if not isinstance(obj,dict) or not isinstance(obj.get('stat'),str):
                raise ValueError('TWSE response schema')
            return obj
        except (OSError,ValueError) as exc:
            failures.append(str(exc))
            time.sleep(2)
    raise RuntimeError('TWSE request failed: '+path+' '+str(params)+' '+repr(failures))

def monthly(obj,k,month):
    if obj.get('stat')!='OK':
        if k in LISTED and month<LISTED[k][:7].replace('-','') and '沒有符合條件' in obj.get('stat',''):
            return {}
        raise ValueError(f'Missing {k} month {month}: {obj.get("stat")}')
    if obj.get('date','')[:6]!=month:
        raise ValueError(f'Month does not match request: {k} {month}')
    col=INDEX[k] if k=='TRI' else '收盤指數' if k=='TAIEX' else '收盤價'
    if k in SYMBOLS and f' {k} ' not in obj.get('title',''):
        raise ValueError(f'Wrong security: {k} {month}')
    pos=obj['fields'].index(col)
    rows={}
    for row in obj['data']:
        d=roc(row[0])
        if d[:7].replace('-','')!=month or d in rows:
            raise ValueError(f'Unexpected date: {k} {d}')
        if unavailable(k,d):
            if row[pos].strip() not in ('','--','---','X'):
                raise ValueError(f'Unexpected trading during unavailable dates: {k} {d}')
            continue
        rows[d]=adjusted(k,d,row[pos])
    return rows

def check_day(row):
    d=row['日期']
    for k in FIELDS[1:]:
        v=row.get(k)
        if unavailable(k,d):
            if v: raise ValueError(f'Unexpected quote: {k} {d}')
        else:
            try: numeric(v)
            except ValueError as exc: raise ValueError(f'Missing or bad quote: {k} {d}') from exc

def day_report(obj,d):
    if obj.get('stat')!='OK' or obj.get('date')!=d.replace('-',''):
        raise ValueError(f'No matching dated TWSE daily report for {d}')
    row={'日期':d}
    for table in obj.get('tables',[]):
        fields=table.get('fields',[])
        if '收盤指數' in fields and fields[0] in ('指數','報酬指數'):
            for k, label in INDEX.items():
                hits=[r for r in table['data'] if r[0]==label]
                if len(hits)>1 or (hits and k in row):
                    raise ValueError(f'Duplicate {k}')
                if hits:
                    row[k]=adjusted(k,d,hits[0][fields.index('收盤指數')])
        if '證券代號' in fields and '收盤價' in fields:
            for v in table['data']:
                k=v[fields.index('證券代號')]
                if k not in SYMBOLS or unavailable(k,d):
                    continue
                if k in row:
                    raise ValueError(f'Duplicate {k}')
                row[k]=adjusted(k,d,v[fields.index('收盤價')])
    check_day(row)
    return row

def calendar(start, end):
    days={}
    for m in months(start,end):
        data=request_json('indicesReport/MI_5MINS_HIST',{'response':'json','date':m+'01'})
        days.update(monthly(data,'TAIEX',m))
    return {d:v for d,v in days.items() if start.isoformat()<=d<=end.isoformat()}

def validate(rows):
    previous={}
    for row in rows:
        check_day(row)
        for k in FIELDS[1:]:
            if not row.get(k):
                continue
            now=numeric(row[k])
            if k in previous and abs(now/previous[k]-1)>Decimal('.30'):
                raise ValueError(f'{k} {row["日期"]}: move over 30%; check split/unusual price before publication')
            previous[k]=now

def write(rows,path):
    temp=path.with_suffix('.tmp')
    with temp.open('w',encoding='utf-8',newline='') as fp:
        w=csv.DictWriter(fp,fieldnames=FIELDS,lineterminator='\n')
        w.writeheader(); w.writerows(rows)
    os.replace(temp,path)

def backfill(cache,end):
    start=anniversary(end)
    series={k:{} for k in FIELDS[1:]}
    for k in series:
        for m in months(start,end):
            obj=json.loads((cache/f'{k}-{m}.json').read_text())
            series[k].update(monthly(obj,k,m))
    days=sorted(d for d in series['TAIEX'] if start.isoformat()<=d<=end.isoformat())
    # Verify both indices align exactly; ETF suspensions and pre-listing blanks are explicit.
    assert set(days)=={d for d in series['TRI'] if start.isoformat()<=d<=end.isoformat()}
    if not 230<=len(days)<=260 or days[-1]!=end.isoformat():
        raise ValueError('Incomplete backfill')
    result=[{'日期':d,**{k:series[k].get(d,'') for k in series}} for d in days]
    validate(result)
    return result

def update(path,today):
    with path.open(encoding='utf-8',newline='') as f:
        reader=csv.DictReader(f)
        if tuple(reader.fieldnames or [])!=FIELDS:
            raise ValueError('Unexpected snapshot header')
        base=list(reader)
    dates=[r['日期'] for r in base]
    if dates!=sorted(set(dates)) or len(base)<230 or dates[-1]>today.isoformat():
        raise ValueError('Existing snapshot is incomplete, unordered, or future-dated')
    start=date.fromisoformat(dates[-1])
    if (today-start).days>45:
        raise ValueError('Snapshot more than 45 days behind; rebuild via monthly backfill')
    official=calendar(start,today)
    last_seen=max(official,default=None)
    if last_seen is None:
        raise ValueError('No official cash-index dates')
    if official.get(dates[-1])!=base[-1]['TAIEX']:
        raise ValueError('Cash-index mismatch at the most recent published date')
    additions=[]
    for d in sorted(set(official)-set(dates)):
        data=request_json('exchangeReport/MI_INDEX',{'response':'json','type':'ALLBUT0999','date':d.replace('-','')})
        row=day_report(data,d)
        if row['TAIEX']!=official[d]:
            raise ValueError(f'Cash-index reports disagree for {d}')
        additions.append(row)
        time.sleep(1)
    if additions:
        # Keep accumulated history; the website's one-year control is rolling.
        result=base+additions
        validate(result)
        write(result,path)
        print(f'Added {len(additions)} trading day(s); latest {result[-1]["日期"]}')
    else:
        print(f'No newer official trading date as of {today}; snapshot retained at {last_seen}')

if __name__=='__main__':
    p=argparse.ArgumentParser()
    p.add_argument('--today',type=date.fromisoformat)
    p.add_argument('--monthly-cache',type=Path)
    p.add_argument('--output',type=Path,default=CSV_PATH)
    args=p.parse_args()
    now=args.today or datetime.now(ZoneInfo('Asia/Taipei')).date()
    if args.monthly_cache:
        rows=backfill(args.monthly_cache,now)
        write(rows,args.output)
        print(f'Official backfill: {len(rows)} dates, {rows[0]["日期"]} to {rows[-1]["日期"]}')
    else:
        update(args.output,now)
