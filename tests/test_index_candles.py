import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'scripts'))
from update_index_candles import TRACK, OUT, published, check_tracking, official_month, TWSE

class IndexCandles(unittest.TestCase):
    def test_published_calendar(self):
        data=published(OUT)
        self.assertGreaterEqual(len(data),1200)
        self.assertEqual(data['2026-11-26'],('38435.99','39459.95','38435.99','39151.81'))
        check_tracking(TRACK,data)
        del data['2026-11-26']
        with self.assertRaises(ValueError):
            check_tracking(TRACK,data)

    def test_month_and_extrema(self):
        body={'stat':'OK','date':'20261101','title':'115年11月 發行量加權股價指數歷史資料','fields':list(TWSE),
              'data':[['115/11/27','39,168.57','39,495.41','38,890.53','39,308.08']]}
        self.assertEqual(official_month(body,'202611')['2026-11-27'][-1],'39308.08')
        with self.assertRaises(ValueError):
            official_month(body,'202610')
        with self.assertRaises(ValueError):
            official_month({**body,'data':[['115/11/27','100','103','105','110']]},'202611')

if __name__=='__main__':
    unittest.main()
