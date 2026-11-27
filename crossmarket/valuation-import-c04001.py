#!/usr/bin/env python3
"""Convert lawfully obtained TWSE C04001 ZIPs to a local valuation import CSV.

Requires xlrd 2.x. This utility does not request data online or transmit input
or output. It extracts one observation date and one overall-market PE for each
report. It does not output FPE or claim to reconstruct constituent EPS.
"""
import argparse
import csv
from pathlib import Path
import re
import sys
import zipfile
import xlrd

def parse(path):
    with zipfile.ZipFile(path) as archive:
        books=[x for x in archive.infolist() if x.filename.lower().endswith('.xls')]
        if len(books)!=1 or books[0].file_size>5_000_000:
            raise ValueError(f'{path.name}: expected one XLS workbook below 5 MB')
        book=xlrd.open_workbook(file_contents=archive.read(books[0]))
    sheet=book.sheet_by_index(0)
    if not any('P/E RATIO' in str(c).upper() for c in sheet.row_values(0)):
        raise ValueError(f'{path.name}: workbook is not a C04001 report')
    dates=[xlrd.xldate_as_datetime(c.value,book.datemode).date()
           for c in sheet.row(1) if c.ctype==xlrd.XL_CELL_DATE]
    if not dates and sheet.cell_type(1,0)==xlrd.XL_CELL_NUMBER:
        dates=[xlrd.xldate_as_datetime(sheet.cell_value(1,0),book.datemode).date()]
    dates=set(dates)
    if len(dates)!=1:
        raise ValueError(f'{path.name}: missing or ambiguous observation date')
    month=dates.pop().strftime('%Y-%m')
    match=re.match(r'(\d{4})(\d{2})_C04001',path.name,re.I)
    if match and '-'.join(match.groups())!=month:
        raise ValueError(f'{path.name}: file and workbook months disagree')
    label=lambda x: ''.join(str(x).split())
    rows=[sheet.row_values(i) for i in range(min(sheet.nrows,20))
          if label(sheet.cell_value(i,0)) in {'大盤','Market'}]
    if len(rows)!=1:
        raise ValueError(f'{path.name}: expected exactly one overall-market row')
    # In verified fixture, the first positive numeric in the market row is
    # the PE; there is no 'latest price' value for the market.
    numbers=[x for x in rows[0][1:] if isinstance(x,(float,int))]
    if len(numbers)<3 or not 0<numbers[0]<1000:
        raise ValueError(f'{path.name}: market valuation fields invalid')
    return month,numbers[0]

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('reports',nargs='+',type=Path)
    args=p.parse_args()
    data={}
    try:
        for path in args.reports:
            m,pe=parse(path)
            if m in data and data[m]!=pe:
                raise ValueError(f'{m}: conflicting input reports')
            data[m]=pe
    except (OSError,ValueError,zipfile.BadZipFile,xlrd.XLRDError) as e:
        p.exit(1,f'{e}\n')
    out=csv.writer(sys.stdout,lineterminator='\n')
    out.writerow(['month','symbol','close','pe','fpe'])
    for m,pe in sorted(data.items()):out.writerow([m,'TAIEX','',pe,''])
if __name__=='__main__': main()
