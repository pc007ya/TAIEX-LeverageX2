let cachedQuotes = {};
let defaultMarketData = { indexPrice: null, etfPrice: null, etf631LPrice: null };
const quoteInputs = { futures: 'indexPrice', etf685L: 'etfPrice', etf631L: 'etf631LPrice' };
const quoteLabels = { futures: 'TX', etf685L: '00685L', etf631L: '00631L' };
let quoteRequestGeneration = 0;
const manuallyEdited = new Set();
function positiveNumber(value) {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
}
function validQuote(quote, key, today = new Date()) {
    if (!quote || quote.status !== 'ok' || typeof quote.price !== 'number' || positiveNumber(quote.price) === null) return false;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(quote.quoteDate || '') || !quote.source) return false;
    const time = Date.parse(quote.quoteDate + 'T00:00:00+08:00');
    const age = today.getTime() - time;
    const taipeiDate = new Date(today.getTime() + 8 * 3600000).toISOString().slice(0, 10);
    const previous = new Date(taipeiDate + 'T00:00:00Z');
    previous.setUTCDate(previous.getUTCDate() - 1);
    while ([0, 6].includes(previous.getUTCDay())) previous.setUTCDate(previous.getUTCDate() - 1);
    if (!Number.isFinite(time) || age < 0 || quote.quoteDate < previous.toISOString().slice(0,10)) return false;
    if (key === 'futures') return quote.symbol === 'TX' && /^\d{6}$/.test(quote.contractMonth || '') && quote.session === 'regular' && quote.priceType === 'daily_last';
    return quote.symbol === (key === 'etf685L' ? '00685L' : '00631L');
}
function textAt(id, value) { const el = document.getElementById(id); if (el) el.innerText = value; }
function clearFuturesResults() {
    ['totalContractVal', 'adjEquity', 'currentLeverage', 'rec25', 'rec30'].forEach(id => textAt(id, '未計算：請提供有效期貨價格'));
    const canvas = document.getElementById('riskMatrixCanvas');
    if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
}
function calculateAll() {
    let indexPrice = positiveNumber(document.getElementById('indexPrice').value);
    const equity = parseFloat(document.getElementById('equity').value) || 0;
    const miniQty = parseFloat(document.getElementById('miniQty').value) || 0;
    const microQty = parseFloat(document.getElementById('microQty').value) || 0;
    const otherMargin = parseFloat(document.getElementById('otherMargin').value) || 0;
    const etfPrice = parseFloat(document.getElementById('etfPrice').value) || 0;
    const etf631LPrice = parseFloat(document.getElementById('etf631LPrice').value) || 0;
    
    // 獲取模擬跌點
    const simulateDropPoints = parseFloat(document.getElementById('simulateDropPoints').value) || 0;

    textAt('etfShares', positiveNumber(etfPrice) ? (equity / (etfPrice * 1000)).toFixed(2) + ' 張' : '未計算：缺少有效價格');
    textAt('etf631LShares', positiveNumber(etf631LPrice) ? (equity / (etf631LPrice * 1000)).toFixed(2) + ' 張' : '未計算：缺少有效價格');
    if (indexPrice === null) { clearFuturesResults(); textAt('etfExposure', (equity * 2).toLocaleString() + ' 元'); return; }
    if (simulateDropPoints >= indexPrice) { clearFuturesResults(); return; }
    const totalMultiplier = (miniQty * 50) + (microQty * 10);
    const baseIndexPrice = indexPrice; 

    // 手動模擬跌點觸發時調整計算常數
    if (simulateDropPoints > 0) {
        indexPrice = Math.max(0, indexPrice - simulateDropPoints);
    }

    const totalContractVal = totalMultiplier * indexPrice;
    const baseAdjEquity = equity - otherMargin;
    
    // 扣除手動跌點模擬損益
    const manualLoss = simulateDropPoints * totalMultiplier;
    const adjEquity = baseAdjEquity - manualLoss;
    
    const currentLeverage = adjEquity > 0 ? (totalContractVal / adjEquity) : null;

    document.getElementById('totalContractVal').innerText = totalContractVal.toLocaleString() + " 元";
    document.getElementById('adjEquity').innerText = adjEquity.toLocaleString() + " 元" + (simulateDropPoints > 0 ? " (已扣模擬損益)" : "");
    document.getElementById('currentLeverage').innerText = currentLeverage === null
        ? (totalContractVal !== 0 ? '無法計算：淨權益非正（高風險）' : '無部位；淨權益非正，槓桿不適用')
        : currentLeverage.toFixed(2) + " 倍";

    function getRecStr(targetLev) {
        if (adjEquity <= 0) return '停止試算：淨權益非正，請核對資金與部位';
        if (totalMultiplier === 0) return '無部位';
        const diffMicro = (totalContractVal - (targetLev * adjEquity)) / (10 * indexPrice);
        if (diffMicro > 0.05) return `需減 ${diffMicro.toFixed(1)} 口微台`;
        if (diffMicro < -0.05) return `可加 ${Math.abs(diffMicro).toFixed(1)} 口微台`;
        return "保持現狀";
    }
    document.getElementById('rec25').innerText = getRecStr(2.5);
    document.getElementById('rec30').innerText = getRecStr(3.0);

    if (etfPrice > 0) {
        document.getElementById('etfShares').innerText = (equity / (etfPrice * 1000)).toFixed(2) + " 張";
    }
    if (etf631LPrice > 0) {
        document.getElementById('etf631LShares').innerText = (equity / (etf631LPrice * 1000)).toFixed(2) + " 張";
    }
    
    const etfExposure = equity * 2;
    document.getElementById('etfExposure').innerText = etfExposure.toLocaleString() + " 元";

    const manualDropPct = baseIndexPrice > 0 ? -(simulateDropPoints / baseIndexPrice) * 100 : 0;
    drawRiskMatrix(baseIndexPrice, baseAdjEquity, totalMultiplier, manualDropPct);
}

function drawRiskMatrix(baseIdx, baseAdjEquity, currentMultiplier, manualDropPct) {
    const canvas = document.getElementById('riskMatrixCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    
    const reqMaintenancePerMultiplierPoint = 820; 

    const padL = 70, padR = 40, padT = 40, padB = 50;
    const graphW = w - padL - padR;
    const graphH = h - padT - padB;

    const minPct = -10, maxPct = 0; 
    const minDeltaQty = -3, maxDeltaQty = 3; 

    function getX(pct) { return padL + ((pct - minPct) / (maxPct - minPct)) * graphW; }
    function getY(deltaQty) { return padT + (1 - (deltaQty - minDeltaQty) / (maxDeltaQty - minDeltaQty)) * graphH; }

    const xStep = 0.5;
    const yStep = 0.5;

    for (let p = minPct; p <= maxPct; p += xStep) {
        for (let dq = minDeltaQty; dq <= maxDeltaQty; dq += yStep) {
            const simMultiplier = currentMultiplier + (dq * 50);
            const simIdx = baseIdx * (1 + p / 100);
            const equityLoss = (simIdx - baseIdx) * currentMultiplier;
            const simEquity = baseAdjEquity + equityLoss;
            const simReqMaintenance = Math.max(0, simMultiplier * reqMaintenancePerMultiplierPoint);
            
            let simRatio = 999;
            if (simReqMaintenance > 0) {
                simRatio = (simEquity / simReqMaintenance) * 100;
            }

            // 警戒線調高至 250% 核心判定
            if (simRatio <= 130 || simEquity <= 0) {
                ctx.fillStyle = 'rgba(230, 57, 70, 0.16)'; 
            } else if (simRatio <= 250) {
                ctx.fillStyle = 'rgba(244, 162, 97, 0.16)'; 
            } else {
                ctx.fillStyle = 'rgba(42, 157, 143, 0.12)'; 
            }

            const x1 = getX(p), x2 = getX(p + xStep);
            const y1 = getY(dq), y2 = getY(dq + yStep);
            ctx.fillRect(x1, y2, x2 - x1, y1 - y2);
        }
    }

    ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1;
    ctx.fillStyle = '#64748b'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
    
    for (let p = minPct; p <= maxPct; p += 0.5) {
        let x = getX(p);
        if (p % 1 === 0) {
            ctx.strokeStyle = '#cbd5e1';
            ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, h - padB); ctx.stroke();
            ctx.fillText(p + '%', x, h - padB + 16);
        } else {
            ctx.strokeStyle = '#f1f5f9';
            ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, h - padB); ctx.stroke();
        }
    }

    ctx.textBaseline = 'middle';
    for (let dq = minDeltaQty; dq <= maxDeltaQty; dq += 1) {
        let y = getY(dq);
        ctx.strokeStyle = dq === 0 ? '#94a3b8' : '#e2e8f0';
        ctx.lineWidth = dq === 0 ? 2 : 1;
        ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
        
        ctx.textAlign = 'right';
        let lbl = dq === 0 ? "目前部位" : (dq > 0 ? `+${dq}台` : `${dq}台`);
        ctx.fillText(lbl, padL - 8, y);
    }
    ctx.lineWidth = 1;

    // 依據手動模擬跌點，動態讓核心十字焦點往左飄移
    let originX = getX(Math.max(minPct, Math.min(maxPct, manualDropPct)));
    let originY = getY(0);
    
    ctx.fillStyle = manualDropPct < minPct ? '#e63946' : '#1d3557'; 
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(originX, originY, 6, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();

    ctx.fillStyle = '#334155'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('← 模擬台指期每下跌 0.5% (橫軸)', padL + graphW/2, h - 12);
    
    ctx.save(); ctx.translate(18, padT + graphH/2); ctx.rotate(-Math.PI/2);
    ctx.fillText('← 減碼 ｜ 部位調整小台口數 (Y軸) ｜ 加碼 →', 0, 0); ctx.restore();

    ctx.textAlign = 'left'; ctx.font = '10px sans-serif';
    ctx.fillStyle = '#2a9d8f'; ctx.fillRect(w - 110, 5, 12, 12); ctx.fillStyle = '#334155'; ctx.fillText('安全區', w - 94, 14);
    ctx.fillStyle = '#f4a261'; ctx.fillRect(w - 110, 20, 12, 12); ctx.fillStyle = '#334155'; ctx.fillText('警戒 (<250%)', w - 94, 29);
    ctx.fillStyle = '#e63946'; ctx.fillRect(w - 210, 20, 12, 12); ctx.fillStyle = '#334155'; ctx.fillText('危險/斷頭 (<130%)', w - 194, 29);
}

function resetToDefault() {
    manuallyEdited.clear();
    const missing = [];
    for (const [key, id] of Object.entries(quoteInputs)) {
        // Cached numbers alone are insufficient: re-check dates at the time of use.
        defaultMarketData[id] = validQuote(cachedQuotes[key], key) ? cachedQuotes[key].price : null;
        document.getElementById(id).value = defaultMarketData[id] ?? '';
        if (defaultMarketData[id] === null) missing.push(quoteLabels[key]);
    }
    document.getElementById('simulateDropPoints').value = 0;
    textAt('marketStatus', (missing.length ? '未還原缺失或已過期行情：' + missing.join('、') + '；欄位留空。' : '已重新核對日期並還原有效每日行情。') + '本頁非即時報價。');
    calculateAll();
}
async function loadMarketData() {
    const generation = ++quoteRequestGeneration;
    try {
        const response = await fetch('data.json', {cache: 'no-store'});
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const data = await response.json();
        if (generation !== quoteRequestGeneration) return;
        if (data.schemaVersion !== 2 || !data.quotes) throw new Error('不支援的行情格式');
        cachedQuotes = data.quotes;
        const details = [], missing = [];
        for (const [key, id] of Object.entries(quoteInputs)) {
            const q = data.quotes[key];
            const accepted = validQuote(q, key);
            defaultMarketData[id] = accepted ? q.price : null;
            if (!manuallyEdited.has(id)) document.getElementById(id).value = defaultMarketData[id] ?? '';
            if (!accepted) missing.push(quoteLabels[key]);
            details.push(quoteLabels[key] + (key === 'futures' && q?.contractMonth ? ' ' + q.contractMonth : '') + ': ' + (accepted ? q.quoteDate + ' / ' + q.source + ' / ' + (key === 'futures' ? '一般時段最後成交價（非即時／非結算價）' : '每日收盤') : '未採用（缺失、過期或格式不符）' + (q?.quoteDate ? ' / 來源日期 ' + q.quoteDate : '') + (q?.source ? ' / ' + q.source : '')));
        }
        textAt('lblLastUpdated', data.updatedAt || '未提供');
        textAt('lblSource', details.join('；'));
        textAt('marketStatus', (missing.length ? '行情不完整：' + missing.join('、') + '；缺失欄位不代入預設值。' : '每日行情已載入。') + '非即時報價；手動修改僅供試算。');
        calculateAll();
    } catch (err) {
        if (generation !== quoteRequestGeneration) return;
        cachedQuotes = {};
        defaultMarketData = {indexPrice:null, etfPrice:null, etf631LPrice:null};
        for (const id of Object.values(quoteInputs)) if (!manuallyEdited.has(id)) document.getElementById(id).value = '';
        textAt('lblLastUpdated', '載入失敗'); textAt('lblSource', '未取得；不使用預設行情');
        textAt('marketStatus', '行情載入失敗，未使用預設行情。請核對來源後手動輸入，所有結果僅供試算。');
        calculateAll();
    }
}
document.addEventListener('DOMContentLoaded', () => {
    ['indexPrice', 'equity', 'miniQty', 'microQty', 'otherMargin', 'etfPrice', 'etf631LPrice', 'simulateDropPoints'].forEach(id => {
        const el = document.getElementById(id);
        if (el) ['input', 'change'].forEach(event => el.addEventListener(event, () => {
            if (Object.values(quoteInputs).includes(id)) { manuallyEdited.add(id); textAt('marketStatus', '使用手動試算價格，非即時行情；行情來源資訊僅供參考。'); }
            calculateAll();
        }));
    });
    document.getElementById('btnReset')?.addEventListener('click', resetToDefault);
    calculateAll();
    loadMarketData();
});
