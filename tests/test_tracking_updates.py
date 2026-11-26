import csv
import importlib.util
import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import patch

path=Path(__file__).resolve().parents[1]/'scripts/update_tracking.py'
spec=importlib.util.spec_from_file_location('tracking',path)
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class Tracking(unittest.TestCase):
    def table(self,d,missing=None):
        return {'stat':'OK','date':d.replace('-',''),'tables':[
            {'fields':['指數','收盤指數'],'data':[[m.INDEX['TAIEX'],'40,010']]},
            {'fields':['報酬指數','收盤指數'],'data':[[m.INDEX['TRI'],'90,010']]},
            {'fields':['證券代號','收盤價'],'data':[[k,'40.01'] for k in m.SYMBOLS if k!=missing]}]}
    def test_official_exact_date_and_required_symbols(self):
        d='2026-11-27'
        self.assertEqual(m.day_report(self.table(d),d)['TAIEX'],'40010')
        with self.assertRaisesRegex(ValueError,'No matching'):
            m.day_report(self.table('2026-11-26'),d)
        with self.assertRaisesRegex(ValueError,'Missing'):
            m.day_report(self.table(d,'0055'),d)
    def test_known_split_and_blank_rules(self):
        self.assertEqual(m.adjusted('00631L','2026-03-24','550'),'25')
        self.assertEqual(m.adjusted('00631L','2026-03-31','25'),'25')
        self.assertEqual(m.adjusted('00685L','2026-06-30','306'),'12.75')
        self.assertTrue(m.unavailable('00685L','2026-07-02'))
        self.assertTrue(m.unavailable('009816','2026-02-02'))
        self.assertFalse(m.unavailable('009816','2026-02-03'))
        self.assertEqual(m.anniversary(date(2028,2,29)),date(2027,2,28))
        self.assertEqual(m.anniversary(date(2028,2,29),5),date(2023,2,28))
        self.assertEqual(m.adjusted('0050','2025-06-10','187.9'),'46.975')
        self.assertTrue(m.unavailable('0050','2025-06-17'))
        self.assertFalse(m.unavailable('0050','2025-06-18'))
        self.assertTrue(m.unavailable('00981A','2025-05-26'))
        self.assertFalse(m.unavailable('00981A','2025-05-27'))
    def test_historical_no_trade_requires_zero_activity(self):
        r={'stat':'OK','date':'20211201','title':'110年12月 00685L 群益臺灣加權正2',
           'fields':['日期','成交股數','成交筆數','收盤價'],
           'data':[['110/12/06','0','0','--'],['110/12/07','1000','1','48']]}
        self.assertEqual(m.monthly(r,'00685L','202112'),{'2021-12-07':'2'})
        r['data'][0][1]='1000'
        with self.assertRaisesRegex(ValueError,'nonzero activity'):
            m.monthly(r,'00685L','202112')
    def test_no_write_for_closed_day_or_bad_report(self):
        d='2026-11-26'
        source=(path.parents[1]/'tracking/market-snapshot.csv').read_text().splitlines()
        base=('\n'.join([source[0]]+[line for line in source[1:] if line[:10]<=d])+'\n').encode()
        with tempfile.TemporaryDirectory() as tmp:
            f=Path(tmp)/'out.csv'
            f.write_bytes(base)
            with patch.object(m,'calendar',return_value={d:'39151.81'}):
                m.update(f,date(2026,11,28))
            self.assertEqual(base,f.read_bytes())
            with patch.object(m,'calendar',return_value={d:'39151.81','2026-11-27':'40010'}), patch.object(m,'request_json',return_value=self.table(d)):
                with self.assertRaisesRegex(ValueError,'No matching'):
                    m.update(f,date(2026,11,27))
            self.assertEqual(base,f.read_bytes())
            good=self.table('2026-11-27')
            latest=list(csv.DictReader(base.decode().splitlines()))[-1]
            good['tables'][2]['data']=[[k,latest[k]] for k in m.SYMBOLS]
            with patch.object(m,'calendar',return_value={d:'39151.81','2026-11-27':'40010'}), patch.object(m,'request_json',return_value=good), patch.object(m.time,'sleep'):
                m.update(f,date(2026,11,27))
            self.assertEqual(list(csv.DictReader(f.read_text().splitlines()))[-1]['日期'],'2026-11-27')

if __name__=='__main__':
    unittest.main()
