import importlib.util
import json
import tempfile
import unittest
from datetime import date
from pathlib import Path

spec = importlib.util.spec_from_file_location('update_data', Path(__file__).resolve().parents[1]/'update_data.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)

class QuoteTests(unittest.TestCase):
    day = date(2026, 11, 17)
    def row(self, **overrides):
        d = {'Date':'20261116', 'Contract':'TX', 'ContractMonth(Week)':'202611',
             'Last':'23,123', 'TradingSession':'一般'}
        d.update(overrides); return d
    def test_only_real_regular_monthly_tx(self):
        rows=[self.row(),self.row(Contract='MTX',Last='999'),self.row(TradingSession='盤後',Last='888'),self.row(**{'ContractMonth(Week)':'202611/202612','Last':'777'})]
        q=m.parse_futures(rows,self.day)
        self.assertEqual((q['price'],q['symbol'],q['contractMonth'],q['quoteDate']),(23123,'TX','202611','2026-11-16'))
    def test_halted_and_bad_month(self):
        self.assertEqual(m.parse_futures([self.row(TradingHalt='是')],self.day)['status'],'unavailable')
        self.assertEqual(m.parse_futures([self.row(**{'ContractMonth(Week)':'202613'})],self.day)['status'],'unavailable')
    def test_expiry_day_rolls_forward(self):
        q=m.parse_futures([self.row(Date='20261118'),self.row(Date='20261118', **{'ContractMonth(Week)':'202612'})],date(2026,11,18))
        self.assertEqual(q['contractMonth'],'202612')
    def test_no_fake_prices(self):
        for bad in [None, '', '-', 'NaN','Infinity','-Infinity',float('nan'),float('inf'),0,-1, True]:
            with self.subTest(bad=bad):
                q=m.parse_futures([self.row(Last=bad)],self.day)
                self.assertEqual(q['status'],'unavailable');self.assertIsNone(q['price'])
    def test_empty_future_stale(self):
        self.assertEqual(m.parse_futures([],self.day)['status'],'unavailable')
        self.assertEqual(m.parse_futures([self.row(Date='20261118')],self.day)['status'],'unavailable')
        q=m.parse_futures([self.row(Date='20261110')],self.day)
        self.assertEqual(q['status'],'stale');self.assertIsNone(q['price']);self.assertEqual(q['quoteDate'],'2026-11-10')
    def test_no_older_or_farther_fallback(self):
        q=m.parse_futures([self.row(Last='NaN'),self.row(Date='20261115'),self.row(**{'ContractMonth(Week)':'202612'})],self.day)
        self.assertIsNone(q['price'])
    def test_duplicate_and_missing_fields(self):
        for rows in [[self.row(),self.row()], [{}], 'bad']:
            self.assertEqual(m.parse_futures(rows,self.day)['status'],'unavailable')
    def test_strict_atomic(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'data.json';p.write_text('{"good":1}')
            with self.assertRaises(ValueError):m.write_atomic({'bad':float('nan')},p)
            self.assertEqual(json.loads(p.read_text()),{'good':1})
            m.write_atomic({'quotes':{'price':None}},p)
            self.assertIsNone(json.loads(p.read_text())['quotes']['price'])
    def test_api_csv(self):
        text='日期,契約代號,到期月份(週別),最後成交價,交易時段\n20261116,TX,202611,23123,一般\n'
        rows=m.decode_taifex_response(text.encode('utf-8-sig'))
        self.assertEqual(m.parse_futures(rows,self.day)['price'],23123)
        with self.assertRaises(ValueError):m.decode_taifex_response(b'<html>Error</html>')
        with self.assertRaises(ValueError):m.decode_taifex_response(b'[{"Last":NaN}]')
    def test_weekend_freshness(self):
        self.assertEqual(m.dated_quote('TX','test',1,'2026-11-13',date(2026,11,16))['status'],'ok')
        self.assertEqual(m.dated_quote('TX','test',1,'2026-11-13',self.day)['status'],'stale')
    def test_etf_history(self):
        try:import pandas as pd
        except ImportError:self.skipTest('pandas unavailable')
        h=pd.DataFrame({'Close':[10.5,float('nan')]},index=pd.to_datetime(['2026-11-15','2026-11-16']))
        self.assertIsNone(m.parse_etf_history(h,'00685L',self.day)['price'])
        h.loc[h.index[-1],'Close']=11.5
        q=m.parse_etf_history(h,'00685L',self.day)
        self.assertEqual(q['price'],11.5);self.assertEqual(q['quoteDate'],'2026-11-16')
        self.assertEqual(m.parse_etf_history(h,'00685L',date(2026,11,25))['status'],'stale')
        self.assertEqual(m.parse_etf_history(h.iloc[:0],'00685L',self.day)['status'],'unavailable')

if __name__=='__main__':unittest.main()
