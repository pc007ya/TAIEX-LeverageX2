"""Publish dated quotes, never synthetic prices. No equity index is a futures quote.

TAIFEX schema: https://openapi.taifex.com.tw/swagger.json
DailyMarketReportFut fields Date, Contract, ContractMonth(Week), Last,
TradingSession. Last is the daily last trade, not settlement or live bid/ask.
"""
import csv
import io
import json
import math
import os
import re
import tempfile
from datetime import date, datetime, timedelta
from pathlib import Path
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

TAIPEI = ZoneInfo('Asia/Taipei')
TAIFEX_URL = 'https://openapi.taifex.com.tw/v1/DailyMarketReportFut'
# No exchange holiday calendar: conservatively reject dates older than the previous
# weekday. Long exchange holidays can require manual entry, never silently stale quotes.


def positive_number(value):
    if isinstance(value, bool) or value is None:
        raise ValueError('missing/non-numeric price')
    if isinstance(value, str):
        value = value.strip().replace(',', '')
    price = float(value)
    if not math.isfinite(price) or price <= 0:
        raise ValueError('non-finite/non-positive price')
    return round(price, 2)


def parse_date(value):
    text = str(value).strip().replace('/', '-').replace('.', '-')
    if re.fullmatch(r'\d{8}', text):
        return datetime.strptime(text, '%Y%m%d').date()
    return date.fromisoformat(text)


def unavailable(symbol, source, reason, **metadata):
    return dict(symbol=symbol, source=source, price=None, status='unavailable',
                quoteDate=None, reason=reason, **metadata)


def dated_quote(symbol, source, price, quote_date, today, **metadata):
    p = positive_number(price)
    d = parse_date(quote_date)
    age = (today-d).days
    if age < 0:
        raise ValueError('future quote date')
    q = dict(symbol=symbol, source=source, price=p, status='ok', quoteDate=d.isoformat(),
             reason=None, **metadata)
    previous_weekday = today - timedelta(days=1)
    while previous_weekday.weekday() >= 5:
        previous_weekday -= timedelta(days=1)
    if d < previous_weekday:
        q.update(price=None, status='stale', reason='行情日期早於前一工作日；休市日未自動豁免，未自動採用')
    return q


def contract_not_expired(month, today):
    first = datetime.strptime(month, '%Y%m').date()
    # Conservative monthly TX rollover: use next contract from the standard
    # third-Wednesday expiry day. Holiday adjustments are not inferred.
    expiry = first + timedelta(days=(2-first.weekday()) % 7 + 14)
    return today < expiry


def parse_futures(rows, today):
    base = dict(contractMonth=None, session='regular', priceType='daily_last')
    try:
        if not isinstance(rows, list):
            raise ValueError('TAIFEX response must be an array')
        # Only standard monthly TX outright contracts and regular session.
        relevant = [r for r in rows if isinstance(r, dict) and r.get('Contract') == 'TX'
                    and r.get('TradingSession') in ('一般', '一般交易時段', 'Regular')
                    and re.fullmatch(r'\d{6}', str(r.get('ContractMonth(Week)', '')))]
        if not relevant:
            raise ValueError('no regular-session monthly TX records')
        latest_date = max(parse_date(r['Date']) for r in relevant)
        latest = [r for r in relevant if parse_date(r['Date']) == latest_date
                  and contract_not_expired(r['ContractMonth(Week)'], today)]
        if not latest:
            raise ValueError('no unexpired-month TX records')
        month = min(r['ContractMonth(Week)'] for r in latest)
        selected = [r for r in latest if r['ContractMonth(Week)'] == month]
        if len(selected) != 1:
            raise ValueError('ambiguous duplicate TX contract/session')
        r = selected[0]
        datetime.strptime(month, '%Y%m')  # validate month, not just six digits
        if str(r.get('TradingHalt', '')).strip() not in ('', '否', 'N', 'No'):
            raise ValueError('TX trading halt or unknown halt status')
        # Do not silently select a farther contract or older day if close is invalid.
        base['contractMonth'] = month
        return dated_quote('TX', 'TAIFEX 期貨每日交易行情', r['Last'], latest_date,
                           today, **base)
    except (ValueError, KeyError, TypeError, OverflowError) as exc:
        return unavailable('TX', 'TAIFEX 期貨每日交易行情', str(exc), **base)


def decode_taifex_response(raw):
    text = raw.decode('utf-8-sig')
    if text.lstrip().startswith('['):
        return json.loads(text, parse_constant=lambda x: (_ for _ in ()).throw(ValueError('invalid JSON constant '+x)))
    # The documented API also serves CSV despite Accept: application/json.
    mapping = {'日期':'Date', '契約代號':'Contract', '到期月份(週別)':'ContractMonth(Week)',
               '最後成交價':'Last', '交易時段':'TradingSession'}
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames or not set(mapping).issubset(reader.fieldnames):
        raise ValueError('unrecognized TAIFEX JSON/CSV schema')
    mapping['是否因訊息面暫停交易'] = 'TradingHalt'
    return [{mapping.get(k,k):v for k,v in row.items()} for row in reader]


def fetch_json(url):
    request = Request(url, headers={'Accept': 'application/json', 'User-Agent': 'TAIEX-LeverageX2/2.0'})
    with urlopen(request, timeout=30) as response:
        return decode_taifex_response(response.read())


def fetch_futures(today):
    try:
        return parse_futures(fetch_json(TAIFEX_URL), today)
    except Exception as exc:
        return unavailable('TX', 'TAIFEX 期貨每日交易行情', '來源讀取失敗: '+type(exc).__name__,
                           contractMonth=None, session='regular', priceType='daily_last')


def parse_etf_history(history, symbol, today):
    source = 'Yahoo Finance '+symbol+'.TW（未還原日收盤價）'
    try:
        if history is None or history.empty:
            raise ValueError('no ETF price records')
        # Last returned row only. Missing latest price must not fall back to old data.
        series = history.sort_index()
        stamp = series.index[-1]
        if getattr(stamp, 'tzinfo', None) is not None:
            stamp = stamp.tz_convert('Asia/Taipei')
        return dated_quote(symbol, source, series['Close'].iloc[-1], stamp.date(), today,
                           priceType='close', session='regular')
    except (ValueError, TypeError, KeyError, AttributeError, OverflowError) as exc:
        return unavailable(symbol, source, str(exc), priceType='close', session='regular')


def fetch_etf(symbol, today):
    try:
        import yfinance as yf
        history = yf.Ticker(symbol+'.TW').history(period='7d', auto_adjust=False, actions=False)
        return parse_etf_history(history, symbol, today)
    except Exception as exc:
        return unavailable(symbol, 'Yahoo Finance '+symbol+'.TW（未還原日收盤價）',
                           '來源讀取失敗: '+type(exc).__name__, priceType='close', session='regular')


def write_atomic(payload, path):
    encoded = json.dumps(payload, ensure_ascii=False, indent=2, allow_nan=False)+'\n'
    path = Path(path)
    fd, temp = tempfile.mkstemp(prefix='.quotes-', suffix='.json', dir=path.parent)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            f.write(encoded)
            f.flush()
            os.fsync(f.fileno())
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def fetch_latest_data(path='data.json', now=None):
    now = now or datetime.now(TAIPEI)
    if now.tzinfo is None:
        raise ValueError('now must include timezone')
    today = now.astimezone(TAIPEI).date()
    payload = {'schemaVersion': 2, 'updatedAt': now.isoformat(timespec='seconds'),
               'note': '日行情非即時報價；各商品日期、契約分別標示。缺失或過期不計算。',
               'quotes': {'futures': fetch_futures(today),
                          'etf685L': fetch_etf('00685L', today),
                          'etf631L': fetch_etf('00631L', today)}}
    write_atomic(payload, path)
    print('Published strict JSON:', {k:v['status'] for k,v in payload['quotes'].items()})
    return payload


if __name__ == '__main__':
    fetch_latest_data()
