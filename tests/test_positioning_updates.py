import sys
import unittest
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from update_positioning import fund_units, tx_interest


class TestPositioning(unittest.TestCase):
    def test_fund_units_read_by_name_and_date(self):
        obj={'stat':'OK','date':'20261126','fields':['全體外資及陸資持有股數','證券代號','發行股數'],
             'data':[['61,178,229','00631L','11,297,348,000'],['18,549,661','00685L','11,738,336,000']]}
        self.assertEqual(fund_units(obj,'2026-11-26')['00685L'],(11738336000,18549661))
        with self.assertRaises(ValueError):
            fund_units(obj,'2026-11-25')
        obj['data'][0][0]='21,000,000,000'
        with self.assertRaises(ValueError):
            fund_units(obj,'2026-11-26')

    def test_tx_uses_open_interest_and_ignores_other_contracts(self):
        def row(cells):
            return '<tr>'+''.join(f'<td>{cell}</td>' for cell in cells)+'</tr>'
        header='<span>日期2026/11/26</span><table class="table_f"><tr><th>未平倉餘額</th></tr>'
        foreign=['外資','20000','0','30000','0','-10000','0','<span>9,083</span>','0','115,358','0','-106,275','0']
        html=header+row(['1','臺股期貨','自營商']+['0']*12)+row(foreign)+row(['2','小型臺指期貨','自營商']+['0']*12)+row(foreign)+'</table>'
        self.assertEqual(tx_interest(html,'2026-11-26'),(9083,115358))
        for bad in (html.replace('2026/11/26','2026/11/25'),html.replace('-106,275','-106,274')):
            with self.assertRaises(ValueError):
                tx_interest(bad,'2026-11-26')
