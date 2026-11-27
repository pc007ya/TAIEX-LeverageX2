"""Build one dated Taiwan listed/OTC Open Government Data snapshot, not price history."""
import concurrent.futures, json, math, pathlib, urllib.request
U={
 'tw':'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL',
 'tc':'https://openapi.twse.com.tw/v1/opendata/t187ap03_L',
 'otc':'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes',
 'oc':'https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O'}
def get(u):
 with urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':'Mozilla/5.0'}),timeout=35) as r: return json.load(r)
def n(x):
 try:
  v=float(str(x).replace(',',''))
  return v if math.isfinite(v) else None
 except (TypeError,ValueError): return None
sectors=dict(zip('01 02 03 04 05 06 08 09 10 11 12 14 15 16 17 18 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37 38'.split(),'水泥 食品 塑膠 紡織 電機機械 電器電纜 玻璃陶瓷 造紙 鋼鐵 橡膠 汽車 營建 航運 觀光餐旅 金融 貿易百貨 其他 化學 生技醫療 油電燃氣 半導體 電腦週邊 光電 通信網路 電子零組件 電子通路 資訊服務 其他電子 文化創意 農業科技 電子商務 綠能環保 數位雲端 運動休閒 居家生活'.split()))
with concurrent.futures.ThreadPoolExecutor() as ex: d=dict(zip(U,ex.map(get,U.values())))
dates={x['Date'] for k in ('tw','otc') for x in d[k]}
if len(dates)!=1: raise ValueError(f'源資料交易日期不一致：{dates}')
roc=next(iter(dates)); day=f'{1911+int(roc[:-4]):04d}-{roc[-4:-2]}-{roc[-2:]}'
out=[]; px={}
for market,co,qo in [('TWSE','tc','tw'),('TPEx','oc','otc')]:
 code,name,listing,sector,shares,qcode,cls,high,low,vol,change=('公司代號','公司簡稱','上市日期','產業別','已發行普通股數或TDR原股發行股數','Code','ClosingPrice','HighestPrice','LowestPrice','TradeVolume','Change') if market=='TWSE' else ('SecuritiesCompanyCode','CompanyAbbreviation','DateOfListing','SecuritiesIndustryCode','IssueShares','SecuritiesCompanyCode','Close','High','Low','TradingShares','Change')
 company_dates={x.get('出表日期',x.get('Date')) for x in d[co]}
 if company_dates!={roc}: raise ValueError(f'公司與行情快照日期不同：{company_dates}, {roc}')
 qs={q[qcode]:q for q in d[qo] if q[qcode].isdigit() and len(q[qcode])==4}
 for c in d[co]:
  s=c[code];q=qs.get(s)
  if not q: continue
  p,qty=n(q[cls]),n(c[shares]); L=c[listing]
  if p and qty and p>0 and qty>0:
   out.append(dict(symbol=s,name=c[name].strip(),market=market,sector=sectors.get(c[sector],'其他'),cap=round(p*qty),listed=f'{L[:4]}-{L[4:6]}-{L[6:8]}'))
   px[s]=[day,p,n(q[high]),n(q[low]),n(q[vol]),n(q[change])]
out=sorted(out,key=lambda c:(-c['cap'],c['symbol']))[:50]
if len(out)!=50 or len({x['symbol'] for x in out})!=50: raise ValueError('市值樣本不足或代號重複')
for i,x in enumerate(out,1): x['rank']=i
p=pathlib.Path(__file__).with_name('tw-snapshot.json')
if p.exists() and json.loads(p.read_text())['date']>day: raise ValueError('拒絕用舊交易日覆蓋')
p.write_text(json.dumps(dict(date=day,universe=out,prices={x['symbol']:[px[x['symbol']]] for x in out}),ensure_ascii=False,separators=(',',':'))+'\n')
print(day,len(out),'上市',sum(x['market']=='TWSE' for x in out),'上櫃',sum(x['market']=='TPEx' for x in out))
