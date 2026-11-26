"""Dated official TAIFEX and TWSE observations for the dedicated ETF/TX page."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import csv
from datetime import date, datetime, timedelta
from decimal import Decimal
from html.parser import HTMLParser
from io import StringIO
import os
from pathlib import Path
import re
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo
from update_tracking import calendar, day_report, request_json

FILE = Path('positioning/observations.csv')
FIELDS = ('date','index','long','short','units631','close631','foreign631','units685','close685','foreign685')
START = date(2021, 11, 26)
INCREMENTAL_START = date(2026, 9, 1)
TAIFEX = 'https://www.taifex.com.tw/cht/3/futContractsDate'


class TxTables(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tables, self.table, self.row, self.cell = [], None, None, None

    def handle_starttag(self, tag, attrs):
        if tag == 'table' and 'table_f' in dict(attrs).get('class','').split():
            self.table = []
        elif self.table is not None and tag == 'tr':
            self.row = []
        elif self.row is not None and tag in ('td','th'):
            self.cell = []

    def handle_data(self, data):
        if self.cell is not None:
            self.cell.append(data)

    def handle_endtag(self, tag):
        if tag in ('td','th') and self.cell is not None:
            self.row.append(''.join(self.cell).strip())
            self.cell = None
        elif tag == 'tr' and self.row is not None:
            self.table.append(self.row)
            self.row = None
        elif tag == 'table' and self.table is not None:
            self.tables.append(self.table)
            self.table = None


def integer(s):
    if not re.fullmatch(r'-?[0-9]+',str(s).replace(',','').strip()):
        raise ValueError(f'Not an integer: {s!r}')
    return int(str(s).replace(',','').strip())


def tx_interest(html,d):
    dates = re.findall(r'日期\s*(20\d\d/\d\d/\d\d)\s*</span>', html)
    if dates != [d.replace('-','/')]:
        raise ValueError(f'TAIFEX dated report mismatch: {d}, found {dates}')
    parsed = TxTables()
    parsed.feed(html)
    hits=[]
    for table in parsed.tables:
        if not any('未平倉餘額' in r for r in table):
            continue
        is_tx=False
        for row in table:
            if len(row)==15:
                is_tx = row[1]=='臺股期貨'
            if is_tx and len(row)==13 and row[0] in ('外資','外資及陸資'):
                long,short,net=map(integer,(row[7],row[9],row[11]))
                if long<0 or short<0 or long-short!=net:
                    raise ValueError(f'TAIFEX unsettled long/short mismatch for {d}')
                hits.append((long,short))
    if len(hits)!=1:
        raise ValueError(f'TAIFEX TX position row count {len(hits)} for {d}')
    return hits[0]


def fund_units(obj,d):
    if obj.get('stat')!='OK' or obj.get('date')!=d.replace('-',''):
        raise ValueError(f'TWSE dated issuance mismatch: {d}')
    columns=obj['fields']
    id_col, u_col, f_col=map(columns.index,('證券代號','發行股數','全體外資及陸資持有股數'))
    res={}
    for code in ('00631L','00685L'):
        rows=[r for r in obj['data'] if r[id_col]==code]
        if len(rows)!=1:
            raise ValueError(f'TWSE issuance row count {len(rows)} for {code}, {d}')
        units,held=map(integer,(rows[0][u_col],rows[0][f_col]))
        if units<=0 or not 0<=held<=units:
            raise ValueError(f'Invalid holdings or units: {code}, {d}')
        res[code]=(units,held)
    return res


def request_tx(d):
    req=Request(TAIFEX+'?'+urlencode({'queryDate':d.replace('-','/'),'queryType':'1','doQuery':'1'}),
                headers={'User-Agent':'Mozilla/5.0 (compatible; market position history)'})
    with urlopen(req, timeout=22) as r:
        return tx_interest(r.read(1800000).decode('utf-8'),d)


def observation(row):
    d=row['日期']
    if d<INCREMENTAL_START.isoformat():
        raise ValueError('Unit bases before the configured start require split handling')
    with ThreadPoolExecutor(max_workers=2) as pool:
        task=pool.submit(request_tx,d)
        funds=fund_units(request_json('rwd/zh/fund/MI_QFIIS',{'date':d.replace('-',''),'response':'json','selectType':'ALLBUT0999'}),d)
        long,short=task.result()
    record=(d,row['TAIEX'],long,short,*((funds['00631L'][0]),row['00631L'],funds['00631L'][1]),*((funds['00685L'][0]),row['00685L'],funds['00685L'][1]))
    if any(Decimal(record[i])<=0 for i in (1,5,8)):
        raise ValueError(f'Invalid closing price on {d}')
    return dict(zip(FIELDS,map(str,record),strict=True))


def read_snapshot(path,today):
    if not path.exists():
        return []
    with path.open(encoding='utf-8',newline='') as f:
        reader=csv.DictReader(f)
        if tuple(reader.fieldnames or [])!=FIELDS:
            raise ValueError('Position snapshot header mismatch')
        rows=list(reader)
    dates=[r['date'] for r in rows]
    if dates!=sorted(set(dates)) or any(not START<=date.fromisoformat(d)<=today for d in dates):
        raise ValueError('Invalid dates in existing position snapshot')
    return rows


def quote(d):
    return day_report(request_json('exchangeReport/MI_INDEX',{'response':'json','type':'ALLBUT0999','date':d.replace('-','')}),d)


def refresh(path,today):
    base=read_snapshot(path,today)
    watermark=date.fromisoformat(base[-1]['date']) if base else INCREMENTAL_START
    if (today-watermark).days>120 and base:
        raise ValueError('Position snapshot more than 120 days behind; review sources')
    days=calendar(watermark,today)
    if base and days.get(base[-1]['date'])!=base[-1]['index']:
        raise ValueError('Existing position snapshot disagrees with index calendar')
    with Path('tracking/market-snapshot.csv').open(encoding='utf-8') as f:
        market={r['日期']:r for r in csv.DictReader(f)}
    pending=[d for d in sorted(days) if not base or d>base[-1]['date']]
    def compute(d):
        row=market.get(d) or quote(d)
        if row['TAIEX']!=days[d]:
            raise ValueError(f'Index close mismatch across TWSE reports: {d}')
        return observation(row)
    # Only a small bounded fanout, with one observation per official trading date.
    with ThreadPoolExecutor(max_workers=2) as pool:
        new=list(pool.map(compute,pending))
    if not new:
        print('No pending official trading dates')
        return
    buf=StringIO(newline='')
    writer=csv.DictWriter(buf,fieldnames=FIELDS,lineterminator='\n')
    writer.writeheader()
    writer.writerows(base+new)
    temp=path.with_suffix('.tmp')
    temp.write_text(buf.getvalue(),encoding='utf-8')
    os.replace(temp,path)
    print(f'Added {len(new)} dates: {new[0]["date"]} to {new[-1]["date"]}')


if __name__=='__main__':
    p=argparse.ArgumentParser()
    p.add_argument('--through',type=date.fromisoformat,default=datetime.now(ZoneInfo('Asia/Taipei')).date())
    p.add_argument('--path',type=Path,default=FILE)
    args=p.parse_args()
    refresh(args.path,args.through)
