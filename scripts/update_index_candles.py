"""TAIEX spot OHLC from the TWSE historical statistics, never synthesised from close."""
import argparse
import csv
from datetime import date, datetime
import io
import json
import os
from pathlib import Path
from zoneinfo import ZoneInfo
from update_tracking import months, numeric, request_json, roc

OUT = Path('positioning/taiex-ohlc.csv')
TRACK = Path('tracking/market-snapshot.csv')
HEAD = ('date', 'open', 'high', 'low', 'close')
TWSE = ('日期', '開盤指數', '最高指數', '最低指數', '收盤指數')
ENDPOINT = 'indicesReport/MI_5MINS_HIST'

def candle(cells):
    o,h,l,c = tuple(map(numeric, cells))
    if l > min(o,c) or h < max(o,c):
        raise ValueError('Inconsistent OHLC')
    return tuple(format(v,'f') for v in (o,h,l,c))

def official_month(obj, month):
    if obj.get('stat') != 'OK' or obj.get('date','')[:6] != month or '發行量加權股價指數歷史資料' not in obj.get('title',''):
        raise ValueError(f'Wrong TWSE report/month: {month}')
    fields = obj['fields']
    if any(fields.count(f)!=1 for f in TWSE):
        raise ValueError('Wrong TWSE fields')
    ix = [fields.index(f) for f in TWSE]
    out = {}
    for row in obj['data']:
        d = roc(row[ix[0]])
        if d in out or d[:7].replace('-','') != month:
            raise ValueError(f'Unexpected TWSE date: {d}')
        out[d] = candle(row[i] for i in ix[1:])
    return out

def fetch(month, cache):
    if cache:
        data=json.loads((cache/f'TAIEX-{month}.json').read_text(encoding='utf-8'))
    else:
        data=request_json(ENDPOINT,{'response':'json','date':month+'01'})
    return official_month(data, month)

def published(path):
    with path.open(encoding='utf-8',newline='') as fp:
        reader = csv.DictReader(fp)
        if tuple(reader.fieldnames or []) != HEAD:
            raise ValueError('Candle CSV header mismatch')
        records = list(reader)
    days = [r['date'] for r in records]
    if len(days)<230 or days!=sorted(set(days)):
        raise ValueError('Candle CSV is sparse, unsorted or duplicated')
    for d in days:
        if date.fromisoformat(d).isoformat()!=d:
            raise ValueError('Invalid candle date')
    return {r['date']: candle(r[k] for k in HEAD[1:]) for r in records}

def check_tracking(path, data):
    with path.open(encoding='utf-8',newline='') as fp:
        track = {r['日期']: r['TAIEX'] for r in csv.DictReader(fp)}
    if not data or not track:
        raise ValueError('Missing comparison data')
    lo,hi = min(track),max(track)
    overlap = {d for d in data if lo<=d<=hi}
    if overlap!=set(track):
        raise ValueError(f'Candles/calendar disagree; missing {sorted(set(track)-overlap)[:6]}')
    mismatch = [d for d in track if numeric(data[d][-1])!=numeric(track[d])]
    if mismatch:
        raise ValueError(f'Official cash close mismatch: {mismatch[:6]}')

def refresh(path, tracking, last, cache=None, backfill_start=None):
    old = {} if backfill_start else published(path)
    start = backfill_start or date.fromisoformat(max(old))
    if start>last or (not backfill_start and (last-start).days>45):
        raise ValueError('Unexpected daily update date; rebuild via dated backfill')
    incoming = {}
    for m in months(start,last):
        incoming.update({d: row for d,row in fetch(m,cache).items() if start.isoformat()<=d<=last.isoformat()})
    if old and (start.isoformat() not in incoming or tuple(map(numeric,incoming[start.isoformat()]))!=tuple(map(numeric,old[start.isoformat()]))):
        raise ValueError('Latest published OHLC differs from official anchor')
    data = {**old,**incoming}
    check_tracking(tracking,data)
    if old==data:
        print('No new index trading dates.')
        return
    buf=io.StringIO()
    w=csv.writer(buf,lineterminator='\n')
    w.writerow(HEAD)
    w.writerows((d,*data[d]) for d in sorted(data))
    tmp=path.with_suffix('.tmp');tmp.write_text(buf.getvalue(),encoding='utf-8');os.replace(tmp,path)
    print(f'{len(data)} official candles through {max(data)}')

if __name__=='__main__':
    p=argparse.ArgumentParser()
    p.add_argument('--backfill-start',type=date.fromisoformat)
    p.add_argument('--through',type=date.fromisoformat,default=datetime.now(ZoneInfo('Asia/Taipei')).date())
    p.add_argument('--cache',type=Path)
    a=p.parse_args()
    refresh(OUT,TRACK,a.through,a.cache,a.backfill_start)
