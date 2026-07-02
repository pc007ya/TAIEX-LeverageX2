let defaultMarketData = {
    indexPrice: 46752,
    etfPrice: 306.75,
    etf631LPrice: 245.50
};

function calculateAll() {
    const indexPrice = parseFloat(document.getElementById('indexPrice').value) || 0;
    const equity = parseFloat(document.getElementById('equity').value) || 0;
    const miniQty = parseFloat(document.getElementById('miniQty').value) || 0;
    const microQty = parseFloat(document.getElementById('microQty').value) || 0;
    const otherMargin = parseFloat(document.getElementById('otherMargin').value) || 0;
    const etfPrice = parseFloat(document.getElementById('etfPrice').value) || 0;
    const etf631LPrice = parseFloat(document.getElementById('etf631LPrice').value) || 0;

    const totalMultiplier = (miniQty * 50) + (microQty * 10);
    const totalContractVal = totalMultiplier * indexPrice;
    const adjEquity = equity - otherMargin;
    const currentLeverage = adjEquity > 0 ? (totalContractVal / adjEquity) : 0;

    document.getElementById('totalContractVal').innerText = totalContractVal.toLocaleString() + " 元";
    document.getElementById('adjEquity').innerText = adjEquity.toLocaleString() + " 元";
    document.getElementById('currentLeverage').innerText = currentLeverage.toFixed(2) + " 倍";

    function getRecStr(targetLev) {
        if (adjEquity <= 0 || totalMultiplier === 0) return "N/A";
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

    drawRiskMatrix(indexPrice, currentLeverage);
}

function drawRiskMatrix(currentIdx, currentLev) {
    const canvas = document.getElementById('riskMatrixCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    
    const equity = parseFloat(document.getElementById('equity').value) || 0;
    const otherMargin = parseFloat(document.getElementById('otherMargin').value) || 0;
    const miniQty = parseFloat(document.getElementById('miniQty').value) || 0;
    const microQty = parseFloat(document.getElementById('microQty').value) || 0;
    
    const baseAdjEquity = equity - otherMargin; 
    const currentMultiplier = (miniQty * 50) + (microQty * 10); 
    const reqMaintenancePerMultiplierPoint = 820; // 每點合約乘數對應之維持保證金估算基底

    const padL = 70, padR = 40, padT = 40, padB = 50;
    const graphW = w - padL - padR;
    const graphH = h - padT - padB;

    const minPct = -10, maxPct = 0; 
    const minDeltaQty = -3, maxDeltaQty = 3; 

    function getX(pct) { return padL + ((pct - minPct) / (maxPct - minPct)) * graphW; }
    function getY(deltaQty) { return padT + (1 - (deltaQty - minDeltaQty) / (maxDeltaQty - minDeltaQty)) * graphH; }

    const xStep = 0.5;
    const yStep = 0.5;

    // 渲染維持率二維區塊
    for (let p = minPct; p <= maxPct; p += xStep) {
        for (let dq = minDeltaQty; dq <= maxDeltaQty; dq += yStep) {
            const simMultiplier = currentMultiplier + (dq * 50);
            const simIdx = currentIdx * (1 + p / 100);
            const equityLoss = (simIdx - currentIdx) * currentMultiplier;
            const simEquity = baseAdjEquity + equityLoss;
            const simReqMaintenance = Math.max(0, simMultiplier * reqMaintenancePerMultiplierPoint);
            
            let simRatio = 999;
            if (simReqMaintenance > 0) {
                simRatio = (simEquity / simReqMaintenance) * 100;
            }

            if (simRatio <= 130 || simEquity <= 0) {
                ctx.fillStyle = 'rgba(230, 57, 70, 0.16)';
            } else if (simRatio <= 166) {
                ctx.fillStyle = 'rgba(244, 162, 97, 0.16)';
            } else {
                ctx.fillStyle = 'rgba(42, 157, 143, 0.12)';
            }

            const x1 = getX(p), x2 = getX(p + xStep);
            const y1 = getY(dq), y2 = getY(dq + yStep);
            ctx.fillRect(x1, y2, x2 - x1, y1 - y2);
        }
    }

    // 繪製格線
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

    // 繪製現狀黃金原點十字核心
    let originX = getX(0);
    let originY = getY(0);
    ctx.fillStyle = '#1d3557'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(originX, originY, 6, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();

    ctx.fillStyle = '#334155'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('← 模擬台指期每下跌 0.5% (橫軸)', padL + graphW/2, h - 12);
    
    ctx.save(); ctx.translate(18, padT + graphH/2); ctx.rotate(-Math.PI/2);
    ctx.fillText('← 減碼 ｜ 部位調整小台口數 (Y軸) ｜ 加碼 →', 0, 0); ctx.restore();

    ctx.textAlign = 'left'; ctx.font = '10px sans-serif';
    ctx.fillStyle = '#2a9d8f'; ctx.fillRect(w - 110, 5, 12, 12); ctx.fillStyle = '#334155'; ctx.fillText('安全區', w - 94, 14);
    ctx.fillStyle = '#f4a261'; ctx.fillRect(w - 110, 20, 12, 12); ctx.fillStyle = '#334155'; ctx.fillText('警戒 (<166%)', w - 94, 29);
    ctx.fillStyle = '#e63946'; ctx.fillRect(w - 210, 20, 12, 12); ctx.fillStyle = '#334155'; ctx.fillText('危險/斷頭 (<130%)', w - 194, 29);
}

function resetToDefault() {
    document.getElementById('indexPrice').value = defaultMarketData.indexPrice;
    document.getElementById('etfPrice').value = defaultMarketData.etfPrice;
    document.getElementById('etf631LPrice').value = defaultMarketData.etf631LPrice;
    calculateAll();
}

document.addEventListener('DOMContentLoaded', () => {
    const inputs = ['indexPrice', 'equity', 'miniQty', 'microQty', 'otherMargin', 'etfPrice', 'etf631LPrice'];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', calculateAll);
    });

    document.getElementById('btnReset').addEventListener('click', resetToDefault);

    fetch('data.json')
        .then(response => response.json())
        .then(data => {
            defaultMarketData.indexPrice = data.indexPrice;
            defaultMarketData.etfPrice = data.etfPrice;
            defaultMarketData.etf631LPrice = data.etf631LPrice;

            document.getElementById('indexPrice').value = data.indexPrice;
            document.getElementById('etfPrice').value = data.etfPrice;
            document.getElementById('etf631LPrice').value = data.etf631LPrice;
            
            document.getElementById('lblLastUpdated').innerText = data.lastUpdated || "未取得";
            document.getElementById('lblSource').innerText = data.source || "Yahoo Finance";
            calculateAll();
        })
        .catch(err => {
            console.log("讀取自動化資料失敗，改用預設值", err);
            document.getElementById('lblLastUpdated').innerText = "使用網頁預設值";
            document.getElementById('lblSource').innerText = "區域靜態資料";
            calculateAll();
        });
});