(() => {
  'use strict';
  const names={TAIEX:'台股大盤（TAIEX）',COMP:'NASDAQ 綜合（COMP）',SOX:'費城半導體（SOX）'};
  const metrics={pe:'本益比 P/E',fpe:'未來 12 個月預估本益比 FPE'};
  const fmt=(n,d=2)=>new Intl.NumberFormat('zh-TW',{minimumFractionDigits:d,maximumFractionDigits:d}).format(n);
  function monthList(end,count) {
    const [y,m]=end.split('-').map(Number);
    return Array.from({length:count},(_,i)=>new Date(Date.UTC(y,m-count+i,1)).toISOString().slice(0,7));
  }
  function number(raw){
    if (/^(?:|-|—|NA|N\/A)$/i.test(raw))return null;
    const s=raw.replaceAll(',',''),n=Number(s);
    if(!/^\d+(?:\.\d+)?$/.test(s)||!(n>0)||!Number.isFinite(n))throw Error('價格和倍數須為正數，不知道的值請留白。');
    return n;
  }
  function csvLine(line){
    const tokens=line.match(/(?:^|,)(?:"(?:[^"]|"")*"|[^",]*)/g)||[];
    if(tokens.join('')!==line)throw Error('CSV 引號有誤。');
    return tokens.map((v,i)=>{const s=(i?v.slice(1):v).trim();return s.startsWith('"')?s.slice(1,-1).replaceAll('""','"').trim():s;});
  }
  function parseValCsv(text,nowMonth){
    const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(x=>x.trim());
    if(lines.length<2||lines.length>12001)throw Error('需要 1 到 12,000 筆資料列。');
    const hdr=csvLine(lines.shift()).map(x=>x.toLowerCase()), required=['month','symbol','close','pe','fpe'];
    if(hdr.length!==5||required.some(x=>!hdr.includes(x)))throw Error('標題需要 month,symbol,close,pe,fpe。');
    const seen=new Set();
    return lines.map((line,i)=>{
      try{
        const cells=csvLine(line);
        if(cells.length!==5)throw Error('欄位數有誤。');
        const get=x=>cells[hdr.indexOf(x)],month=get('month'),symbol=get('symbol').toUpperCase();
        if(!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(month)||month<'1900-01'||month>nowMonth||!Object.hasOwn(names,symbol))throw Error('請用 YYYY-MM 與 TAIEX、COMP 或 SOX。');
        const key=symbol+'|'+month;
        if(seen.has(key))throw Error('同一指數、月份不可重複。');
        seen.add(key);
        const close=number(get('close')),pe=number(get('pe')),fpe=number(get('fpe'));
        if(pe==null&&fpe==null)throw Error('至少要有 P/E 或 FPE。');
        return {month,symbol,close,pe,fpe};
      }catch(e){throw Error('第 '+(i+2)+' 列：'+e.message);}
    });
  }
  function qtile(values,p){
    const s=[...values].sort((a,b)=>a-b);if(!s.length)return null;
    const i=p*(s.length-1),a=Math.floor(i);
    return s[a]+(s[Math.min(a+1,s.length-1)]-s[a])*(i-a);
  }
  function observations(months,rows,closes,id,metric){
    const records=new Map(rows.filter(x=>x.symbol===id).map(x=>[x.month,x]));
    return months.flatMap((month,i)=>{
      const row=records.get(month),ratio=row?.[metric],close=row?.close??closes?.[id]?.[month];
      return Number.isFinite(ratio)&&ratio>0?[{month,i,ratio,close:Number.isFinite(close)&&close>0?close:null}]:[];
    });
  }
  function runs(points){
    const groups=[];
    for(const p of points){
      if(!groups.length||p.i!==groups.at(-1).at(-1).i+1)groups.push([]);
      groups.at(-1).push(p);
    }
    return groups;
  }
  if(typeof module!=='undefined')module.exports={parseValCsv,monthList,qtile,observations,runs};
  if(typeof document==='undefined')return;
  const root=document.querySelector('#valuation');if(!root)return;
  const nowMonth=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit'}).format(new Date());
  let defaults=[], imported=[], closes=window.CrossmarketCloses||{};
  root.innerHTML=`
    <h2>台股／NASDAQ／費半：P/E＋FPE 估值河流圖</h2>
    <p class="val-note">已公布盈餘與當時的未來 12 個月預估盈餘分開計算；無資料不補值，不用 Nasdaq-100 或 ETF 代替原指數。</p>
    <div class="val-controls">
      <label>指數<select id="val-index"><option value="TAIEX">台股大盤</option><option value="COMP">NASDAQ 綜合</option><option value="SOX">費城半導體</option></select></label>
      <label>估值區間<select id="val-window"><option value="72">6 年</option><option value="36">3 年</option><option value="12">1 年</option></select></label>
      <label>呈現<select id="val-mode"><option value="bands">估值點位河流</option><option value="ratio">本益比倍數</option></select></label>
    </div>
    <div class="val-charts">
      <article><h3>本益比 P/E</h3><div class="val-plot" id="val-pe"></div><p class="val-current" id="val-pe-read"></p></article>
      <article><h3>預估本益比 FPE</h3><div class="val-plot" id="val-fpe"></div><p class="val-current" id="val-fpe-read"></p></article>
    </div>
    <details open><summary>資料涵蓋與來源</summary><div class="val-table"><table aria-label="估值資料涵蓋"><thead>
      <tr><th scope="col">標的</th><th scope="col">P/E 月數</th><th scope="col">FPE 月數</th><th scope="col">資料來源</th></tr>
    </thead><tbody id="val-coverage"></tbody></table></div>
    <p class="val-note">估值帶為選定區間內配對倍數的第 10、30、50、70、90 百分位數 × 各期隱含獲利點位（同月收盤點位 ÷ 同月本益比）。至少 12 個配對月份才繪製；不足時只顯示觀察倍數。缺月不跨月連線。這是事後歷史分布，不是可回測交易訊號。官方市場 P/E 是證期局整體上市市場口徑，並非自算個股平均。</p></details>
    <details><summary>匯入自有估值資料（僅本機）</summary>
      <p class="val-note">請匯入有權使用的 UTF-8 CSV，欄名 <code>month,symbol,close,pe,fpe</code>。月份用 YYYY-MM；代號 TAIEX、COMP、SOX；close 為當月最後交易日的原指數收盤點位，pe、fpe 為倍數。不知道的數字留白。資料不會上傳，重整即清除。</p>
      <div class="val-controls"><input type="file" accept=".csv,text/csv" id="val-file" aria-label="匯入估值 CSV"><button type="button" id="val-reset">清除匯入</button><a href="./valuation-template.csv" download>下載空白 CSV</a></div>
      <p class="val-note" role="status" id="val-status"></p>
    </details>`;
  const $=id=>root.querySelector('#val-'+id), ns='http://www.w3.org/2000/svg';
  const links={
    TAIEX:'<a href="https://stat.fsc.gov.tw/competitivenessinfo">金管會證期局｜金融競爭力統計</a>（<a href="https://data.gov.tw/license">政府資料開放授權第 1 版</a>）、<a href="https://www.twse.com.tw/zh/trading/statistics/index04.html">TWSE C04001 月報</a>；最新尚未公布月份及 FPE 留白。',
    COMP:'<a href="https://indexes.nasdaqomx.com/index/overview/comp">Nasdaq 指數說明</a>、<a href="https://www.asx.com.au/content/dam/asx/investors/investment-tools-and-resources/investor-day-nov-25/presentations/01-economic-update-betashares.pdf">Betashares／LSEG 估值研究</a>；未內建可再發布歷史數列。',
    SOX:'<a href="https://indexes.nasdaqomx.com/index/overview/sox">Nasdaq 指數說明</a>、<a href="https://www.invesco.com/content/dam/invesco/apac/en/pdf/insights/2026/june/invesco-recapping-recent-tech-volatility-june-2026.pdf">Invesco 估值研究</a>；未內建可再發布歷史數列。'
  };
  function el(tag,attrs,txt){
    const x=document.createElementNS(ns,tag);
    for(const [k,v] of Object.entries(attrs))x.setAttribute(k,v);
    if(txt!=null)x.textContent=txt;
    return x;
  }
  function plot(metric,months,points,wantBands){
    const panel=$(metric),read=$(metric+'-read');panel.replaceChildren();read.textContent='';
    if(!points.length){
      const empty=document.createElement('div');empty.className='val-no';empty.textContent='所選區間無可用 '+metrics[metric]+'。可匯入有權使用的原指數資料。';panel.append(empty);return;
    }
    const paired=points.filter(p=>p.close!=null),bands=wantBands&&paired.length>=12, series=bands?paired:points;
    const cut=bands?[.1,.3,.5,.7,.9].map(q=>qtile(series.map(p=>p.ratio),q)):[];
    const calc=(p,i)=>p.close/p.ratio*cut[i];
    const all=series.flatMap(p=>bands?[p.close,calc(p,0),calc(p,4)]:[p.ratio]);
    const min=Math.min(...all),max=Math.max(...all),pad=(max-min||max*.12)*.10,lo=Math.max(0,min-pad),hi=max+pad;
    const w=Math.max(230,panel.clientWidth||520),h=250,l=w<365?44:58,r=10,t=16,b=26;
    const x=i=>l+i*(w-l-r)/(months.length-1),y=v=>h-b-(v-lo)*(h-t-b)/(hi-lo);
    const chart=el('svg',{viewBox:`0 0 ${w} ${h}`,tabindex:0,role:'img','aria-label':metrics[metric]+'（可用左右鍵選月份）'});
    for(let i=0;i<=4;i++){
      const v=lo+(hi-lo)*i/4, yy=y(v);
      chart.append(el('line',{x1:l,x2:w-r,y1:yy,y2:yy,stroke:'#526b84','stroke-opacity':.65}),el('text',{x:l-6,y:yy+4,fill:'#aabbd0','font-size':10,'text-anchor':'end'},fmt(v,bands?0:1)+(bands?'':'×')));
    }
    const nt=w<365?3:5;
    for(let i=0;i<nt;i++){
      const j=Math.round(i*(months.length-1)/(nt-1));
      chart.append(el('text',{x:x(j),y:h-6,fill:'#aabbd0','font-size':10,'text-anchor':i===0?'start':i===nt-1?'end':'middle'},months[j]));
    }
    const colors=metric==='pe'?['#283c59','#285885','#327bab','#4796bf']:['#47354d','#61526f','#78668c','#997faf'];
    const color=metric==='pe'?'#6fd0ff':'#f1b8ec';
    for(const seg of runs(series)){
      if(seg.length>1&&bands){
        for(let i=0;i<4;i++){
          const xy=(p,k)=>[x(p.i),y(calc(p,k))].join(',');
          chart.append(el('polygon',{points:seg.map(p=>xy(p,i)).concat([...seg].reverse().map(p=>xy(p,i+1))).join(' '),fill:colors[i],'fill-opacity':.88}));
        }
      }
      const yy=p=>y(bands?p.close:p.ratio);
      if(seg.length>1)chart.append(el('polyline',{points:seg.map(p=>x(p.i)+','+yy(p)).join(' '),fill:'none',stroke:color,'stroke-width':2}));
      for(const p of seg)chart.append(el('circle',{cx:x(p.i),cy:yy(p),r:series.length>48?1.6:3,fill:color}));
    }
    const cursor=el('line',{y1:t,y2:h-b,stroke:'#e8f4ff','stroke-width':1,'stroke-dasharray':'4 3'});
    chart.append(cursor);panel.append(chart);
    const active=new Map(series.map(p=>[p.i,p]));
    let selected;
    function select(i){
      selected=Math.max(0,Math.min(months.length-1,i));
      cursor.setAttribute('x1',x(selected));cursor.setAttribute('x2',x(selected));
      const p=active.get(selected);
      read.textContent=months[selected]+'：'+(p?fmt(p.ratio)+' 倍'+(bands?'｜收盤 '+fmt(p.close)+' 點':''):'無資料')+(bands?'｜帶界 '+cut.map(n=>fmt(n,1)+'×').join(' / '):wantBands?'（配對不足，顯示倍數）':'');
    }
    select(series.at(-1).i);
    const point=e=>{const rect=chart.getBoundingClientRect();if(rect.width)select(Math.round(((e.clientX-rect.left)/rect.width*w-l)/(w-l-r)*(months.length-1)));};
    chart.addEventListener('pointermove',point);chart.addEventListener('pointerdown',point);
    chart.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();select(selected+(e.key==='ArrowLeft'?-1:1));}});
  }
  function render(){
    const months=monthList(nowMonth,+$('window').value), merged=new Map(defaults.map(p=>[p.symbol+'|'+p.month,p]));
    for(const p of imported){
      const key=p.symbol+'|'+p.month,prev=merged.get(key)||{};
      merged.set(key,{...p,pe:p.pe??prev.pe,fpe:p.fpe??prev.fpe});
    }
    const rows=[...merged.values()];
    const find=(id,k)=>observations(months,rows,closes,id,k);
    const count=a=>a.length+'/'+months.length+(a.length?'（'+a[0].month+' 至 '+a.at(-1).month+'）':'');
    $('coverage').innerHTML=Object.entries(names).map(([id,n])=>`<tr><th scope="row">${n}</th><td>${count(find(id,'pe'))}</td><td>${count(find(id,'fpe'))}</td><td>${links[id]}</td></tr>`).join('');
    for(const k of Object.keys(metrics))plot(k,months,find($('index').value,k),$('mode').value==='bands');
  }
  for(const k of ['index','window','mode'])$(k).addEventListener('change',render);
  $('file').addEventListener('change',async()=>{
    const file=$('file').files[0];if(!file)return;
    try{
      if(file.size>2_000_000)throw Error('CSV 上限 2 MB。');
      imported=parseValCsv(await file.text(),nowMonth);
      $('index').value=imported[0].symbol;
      $('status').textContent='已匯入 '+imported.length+' 筆，只在本機瀏覽器使用。';render();
    }catch(e){$('status').textContent=e.message;$('file').value='';}
  });
  $('reset').addEventListener('click',()=>{imported=[];$('file').value='';$('status').textContent='已清除本機匯入資料。';render();});
  window.addEventListener('crossmarket:closes',e=>{closes=e.detail||{};render();});
  let timer;window.addEventListener('resize',()=>{clearTimeout(timer);timer=setTimeout(render,110);});
  fetch('./valuation-data.json').then(r=>{if(!r.ok)throw Error();return r.json();}).then(d=>{defaults=d.rows;render();}).catch(()=>{$('status').textContent='無法載入開放估值資料；仍可匯入檔案。';});
  render();
})();
