#!/usr/bin/env python3
"""Create/update the TAIEX monthly trailing P/E file from FSC open statistics."""
import csv
import io
import json
import math
from pathlib import Path
import re
import sys
from urllib.request import Request,urlopen

EXPORT='https://stat.fsc.gov.tw/api/v1/public/datasets/70284558-c657-47c0-9352-5e19bac25479/export'
SOURCE='https://stat.fsc.gov.tw/competitivenessinfo'
LICENSE='https://data.gov.tw/license'

def parse_csv(text):
    out={}
    for rec in csv.DictReader(io.StringIO(text)):
        raw=rec['年月'].strip()
        raw_pe=rec['上市本益比'].strip()
        if not raw_pe:
            continue
        if not re.fullmatch(r'\d{3}(?:0[1-9]|1[0-2])',raw):
            raise ValueError(f'Unrecognized ROC year-month: {raw!r}')
        month=f'{int(raw[:3])+1911:04d}-{raw[3:]}'
        pe=float(raw_pe)
        if not math.isfinite(pe) or pe<=0:
            raise ValueError(f'{month}: invalid P/E {raw_pe!r}')
        if month in out and out[month]!=pe:
            raise ValueError(f'{month}: conflicting source rows')
        out[month]=pe
    if len(out)<72:
        raise ValueError(f'Incomplete FSC response: {len(out)} unique months')
    keys=sorted(out)
    month_id=lambda s:int(s[:4])*12+int(s[5:])
    if any(month_id(b)-month_id(a)!=1 for a,b in zip(keys,keys[1:])):
        raise ValueError('Unexpected gaps in FSC source')
    return [{'month':m,'symbol':'TAIEX','pe':out[m]} for m in keys]

def main():
    if len(sys.argv)>2:
        raise SystemExit('usage: valuation-refresh-fsc.py [local-export.csv]')
    if len(sys.argv)==2:
        text=Path(sys.argv[1]).read_text(encoding='utf-8-sig')
    else:
        request=Request(EXPORT,headers={'User-Agent':'TAIEX-LeverageX2 research dashboard'})
        with urlopen(request,timeout=20) as r:
            text=r.read(2_000_001).decode('utf-8-sig')
    rows=parse_csv(text)
    result={'source':'金融監督管理委員會證券期貨局：金融競爭力，上市本益比','url':SOURCE,'export':EXPORT,'license':LICENSE,'rows':rows}
    file=Path(__file__).with_name('valuation-data.json')
    if file.is_file():
        previous=json.loads(file.read_text(encoding='utf-8'))['rows']
        if previous and (rows[-1]['month']<previous[-1]['month'] or rows[0]['month']>previous[0]['month']):
            raise ValueError('FSC snapshot would lose published month coverage')
    file.write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
    print(f'{len(rows)} FSC equity market P/E observations: {rows[0]["month"]} through {rows[-1]["month"]}')
if __name__=='__main__':main()
