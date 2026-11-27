# TAIEX-LeverageX2

期貨槓桿與 ETF 試算工具；不是即時行情、交易指令或券商風控通知。

## 行情與缺失處理
- TX 使用 [TAIFEX 每日期貨行情](https://openapi.taifex.com.tw/) 的月契約、一般時段「最後成交價」，明示契約月份與交易日期，不使用加權現貨 `^TWII` 冒充期貨，也不把最後成交價當結算價。標準第三週三到期日起保守採次月，未推定假日調整；顯示所選契約月份，不保證與使用者實際部位月份相同。
- ETF 使用 Yahoo Finance 未還原日收盤價，各自保留行情日期與來源。
- `updatedAt` 是檔案生成時間，不是報價時間。早於前一工作日的資料保守列為 stale；未內建交易所假日表，長假可能需手動輸入。來源失敗、NaN、Infinity、非正值與未識別格式一律留空，不默默回退至舊日或硬編碼價格。
- 缺少期貨價格不計算期貨槓桿／矩陣。ETF 缺價各自停止張數試算。可手動輸入已核對的契約價格，頁面會標明手動試算。
- 維持率矩陣仍是原有固定參數模型，需另核券商與交易所規則；此修復不認證模型符合即時保證金。

## 維護
單一 `main.yml` 每工作日台灣 15:30 抓取行情。原重複 `update.yml` 已改為不寫資料的說明工作。更新採嚴格 JSON、原子寫檔、共享單寫入鎖；若 main 已被他人更新，push 明確失敗，不 rebase 生成資料覆蓋新碼。

```sh
python -m pip install yfinance pandas
python -m unittest discover -s tests -p 'test_*.py'
node --test tests/frontend.test.cjs
node --check script.js
python update_data.py
```

測試涵蓋壞 JSON、非有限值、現貨誤用、缺資料、過期、交易時段與契約過濾、獨立 ETF 欄位、手動輸入／延遲載入／重設。瀏覽器環境需另外實測；CPU 測試不等於畫面驗收。

## 追蹤誤差分頁
- `tracking/` 是獨立的歷史行情比較，不寫入原風控的 `data.json`。
- `tracking/market-snapshot.csv` 只含市場日期、指數與收盤價。起始涵蓋 2021-11-26 至 2026-11-26 的五年交易日，來源為 TWSE；之後由 `tracking-daily.yml` 每天台灣 18:00 嘗試更新。頁面先顯示隨站快照，並讀取 GitHub 公開 raw 檔更新，不依賴機器人提交重新觸發 Pages 建置。0050、0052、00631L、00685L 的分割前已按換發比率換算；停牌、無成交與未上市留空。若用同口徑更新 CSV，不可加入帳戶、持倉、表單網址或憑證。
- 各線基準為選定期間內第一個共同有效交易日。相對差按 1 倍基準；日偏離對正2採 2 倍基準。年化偏離波動用樣本標準差乘以 √252。市場價格比較不可當作基金淨值追蹤誤差。
- 也可下載原試算表單一分頁的 CSV，在網頁本機匯入；選檔不離開瀏覽器，不寫入 GitHub。
- `node --test tests/tracking.test.mjs`

- 可在「全部標的」同時勾選 0052 與 0055 比較；11/20 的 0055 除息 2.70 元另行標示，報酬不含配息。

The positioning tab adds a shared-date TAIEX spot daily candlestick panel. OHLC comes from [TWSE historical index data](https://www.twse.com.tw/zh/indices/taiex/mi-5min-hist.html) ([open dataset description](https://data.gov.tw/dataset/11755)); chart joins candle closes to the same positioning dates and leaves missing/mismatched dates blank. The existing 18:00 Taipei closing-price workflow appends official candle sessions without truncating history. Local updater: `python scripts/update_index_candles.py`.
