"""Join dated source extracts without padding missing market observations.

Inputs: TX foreign long/short from TAIFEX's licensed open publication, and
ETF units/holdings extracted directly from dated TWSE MI_QFIIS. Do not use
restricted mirrors for published rows. The existing public overlap is locked.
"""
import argparse
import csv
from decimal import Decimal
from pathlib import Path
from update_positioning import FIELDS, integer


def read(path, key):
    with path.open(encoding='utf-8',newline='') as f:
        out={}
        for row in csv.DictReader(f):
            if row[key] in out:
                raise ValueError(f'Duplicate source date in {path.name}: {row[key]}')
            out[row[key]]=row
        return out


def assemble(market_path,tx_path,units_path,base_path,out_path):
    market=read(market_path,'日期')
    tx=read(tx_path,'date')
    units=read(units_path,'date')
    base=read(base_path,'date')
    if set(tx)-set(market) or set(units)-set(market):
        raise ValueError('Source contains dates outside the TWSE calendar')
    result=[]
    for d,r in sorted(market.items()):
        interest=tx.get(d,{})
        u=units.get(d,{})
        previous=base.get(d,{})
        line={'date':d,'index':r['TAIEX'],**{k:interest.get(k,previous.get(k,'')) for k in ('long','short')}}
        for k in ('long','short'):
            if line[k] and integer(line[k])<0:
                raise ValueError(f'Negative open interest {d}')
        for tail,resume,split in (('631','2026-03-31',22),('685','2026-07-07',24)):
            original=r['006'+tail[-2:]+'L']
            close=format((Decimal(original)*split).quantize(Decimal('.01')).normalize(),'f') if original and d<resume else original
            count,held=(u.get(k,previous.get(k,'')) for k in ('units'+tail,'foreign'+tail))
            if count and not 0<=integer(held)<=integer(count):
                raise ValueError(f'Invalid holdings {tail} on {d}')
            line.update({f'units{tail}':count,f'foreign{tail}':held,f'close{tail}':close})
        if previous and any(previous[k] and previous[k]!=line[k] for k in FIELDS):
            raise ValueError(f'Existing public observation differs at {d}: {line} vs {previous}')
        result.append(line)
    with out_path.open('w',encoding='utf-8',newline='') as f:
        w=csv.DictWriter(f,fieldnames=FIELDS,lineterminator='\n')
        w.writeheader()
        w.writerows(result)
    print('Market dates',len(result),'TX available',sum(bool(x['long']) for x in result),
          'ETF dates available',sum(bool(x['units631']) and bool(x['units685']) for x in result))


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    for arg in ('market','tx','units','base','out'):
        p.add_argument('--'+arg,type=Path,required=True)
    a=p.parse_args()
    assemble(a.market,a.tx,a.units,a.base,a.out)
