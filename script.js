let defaultMarketData = {
    indexPrice: 46752,
    etfPrice: 306.75,
    etf631LPrice: 245.50
};

function calculateAll() {
    // 讀取輸入數值
    let indexPrice = parseFloat(document.getElementById('indexPrice').value) || 0;
    const equity = parseFloat(document.getElementById('equity').value) || 0;
    const miniQty = parseFloat(document.getElementById('miniQty').value) || 0;
    const microQty = parseFloat(document.getElementById('microQty').value) || 0;
    const otherMargin = parseFloat(document.getElementById('otherMargin').value) || 0;
    const etfPrice = parseFloat(document.getElementById('etfPrice').value) || 0;
    const etf631LPrice = parseFloat(document.getElementById('etf631LPrice').value) || 0;
    
    // 新增：手動模擬大跌點數
    const simulateDropPoints = parseFloat(document.getElementById('simulateDropPoints').value) || 0;

    // 計算目前的合約基本體質
    const totalMultiplier = (miniQty * 50) + (microQty * 10);
    
    // 如果有輸入手動模擬跌點，在此處將計算用的指數下修
    const baseIndexPrice = indexPrice; // 保留原始指數繪圖用
    if (simulateDropPoints > 0) {
        indexPrice = Math.max(0, indexPrice - simulateDropPoints);
    }

    const totalContractVal = totalMultiplier * indexPrice;
    
    // 扣除其餘保證金後的初始淨權益
    const baseAdjEquity = equity - otherMargin;
    
    // 若手動模擬了大跌，淨權益必須扣掉該跌點帶來的實質損失
    const manualLoss = simulateDropPoints * totalMultiplier;
    const adjEquity = Math.max(0, baseAdjEquity - manualLoss);
    
    const currentLeverage = adjEquity > 0 ? (totalContractVal / adjEquity) : 0;

    // 渲染上方摘要數據 (會隨手動模擬跌點動態變化)
    document.getElementById('totalContractVal').innerText = totalContractVal.toLocaleString() + " 元";
    document.getElementById('adjEquity').innerText = adjEquity.toLocaleString() + " 元" + (simulateDropPoints > 0 ? " (已扣模擬損益)" : "");
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

    // 計算 ETF 可買張數（以模擬前的帳戶總剩餘資金去評估現貨可買規模）
    if (etfPrice > 0) {
        document.getElementById('etfShares').innerText = (equity / (etfPrice * 1000)).toFixed(2) + " 張";
    }
    if (etf631LPrice > 0) {
        document.getElementById('etf631LShares').innerText = (equity / (etf631LPrice * 1000)).toFixed(2) + " 張";
    }
    
    const etfExposure = equity * 2;
    document.getElementById('etfExposure').innerText = etfExposure.toLocaleString() + " 元";

    // 呼叫矩陣繪圖（將原始無跌點大盤指數、以及手動模擬跌點百分比傳入）
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
    
    const reqMaintenancePerMultiplierPoint = 820; // 台灣期交所維持保證金推算基準常數

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
            const simIdx = baseIdx * (1 + p / 100);
            const equityLoss = (simIdx - baseIdx) * currentMultiplier;
            const simEquity = baseAdjEquity + equityLoss;
            const simReqMaintenance = Math.max(0, simMultiplier * reqMaintenancePerMultiplierPoint);
            
            let simRatio = 999;
            if (simReqMaintenance > 0) {
                simRatio = (simEquity / simReqMaintenance) * 100;
            }

            // === 關鍵修正：警戒線調整為 250% ===
            if (simRatio <= 130 || simEquity <= 0) {
                ctx.fillStyle = 'rgba(230, 57, 70, 0.16)'; // 紅色：低於 130% 隨時斷頭
            } else if (simRatio <= 250) {
                ctx.fillStyle = 'rgba(244, 162, 97, 0.16)'; // 黃色：高規格警戒區 (< 250%)
            } else {
                ctx.fillStyle = 'rgba(42, 157, 143, 0.12)'; // 綠色：極度安全
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

    // 繪製定位核心點 (若有手動模擬跌點，核心原點會動態往左飄移，精確標示出你在股災下落在哪個顏色象限)
    let originX = getX(Math.max(minPct, Math.min(maxPct, manualDropPct)));
    let originY = getY(0);
    
    ctx.fillStyle = manualDropPct < minPct ? '#e63946' : '#1d3557'; 
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(originX, originY, 6, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();

    ctx.fillStyle = '#334155'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('← 模擬台指期每下跌 0.5% (橫軸)', padL + graphW/2, h - 12);
    
    ctx.save(); ctx.translate(18, padT + graphH/2); ctx.rotate(-Math.PI/2);
    ctx.fillText('← 減碼 ｜ 部位調整小台口數 (Y軸) ｜ 加碼 →', 0, 0); ctx.restore();

    // 更新圖例文字說明為 250%
    ctx.textAlign = 'left'; ctx.font = '10px sans-serif';
    ctx.fillStyle = '#2a9d8f'; ctx.fillRect(w - 110, 5, 12, 12); ctx.fillStyle = '#334155'; ctx.fillText('安全區', w - 94, 14);
    ctx.fillStyle = '#f4a261'; ctx.fillRect(w - 110, 20, 12, 12); ctx.fillStyle = '#334155'; ctx.fillText('警戒 (<250%)', w - 94, 29);
    ctx.fillStyle = '#e63946'; ctx.fillRect(w - 210, 20, 12, 12); ctx.fillStyle = '#334155'; ctx.fillText('危險/斷頭 (<130%)', w - 194, 29);
}

function resetToDefault() {
    document.getElementById('indexPrice').value = defaultMarketData.indexPrice;
    document.getElementById('etfPrice').value = defaultMarketData.etfPrice;
    document.getElementById('etf631LPrice').value = defaultMarketData.etf631LPrice;
    document.getElementById('simulateDropPoints').value = 0; // 同步重置模擬跌點
    calculateAll();
}

document.addEventListener('DOMContentLoaded', () => {
    // 將新加入的輸入框 id 'simulateDropPoints' 加入監聽陣列
    const inputs = ['indexPrice', 'equity', 'miniQty', 'microQty', 'otherMargin', 'etfPrice', 'etf631LPrice', 'simulateDropPoints'];
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
            calculateAll();
        });
});
