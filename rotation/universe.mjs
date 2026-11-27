const us=(sector,group,list)=>list.map(p=>{const [symbol,name,listed='1900-01-01']=p.split(':');return {symbol,name,market:'US',sector,group,listed}});
export const US=[
 ...us('大型科技','美股七巨頭',['AAPL:Apple','MSFT:Microsoft','NVDA:NVIDIA','AMZN:Amazon','GOOGL:Alphabet A','META:Meta','TSLA:Tesla']),
 ...us('半導體','晶片設備',['MU:Micron','SNDK:Sandisk:2025-02-24','AMAT:Applied Materials','ASML:ASML ADR','AVGO:Broadcom','AMD:AMD','TSM:台積電 ADR']),
 ...us('能源','板塊指標',['XOM:ExxonMobil','CVX:Chevron','XLE:能源 ETF']),
 ...us('金融','板塊指標',['JPM:JPMorgan','GS:Goldman Sachs','XLF:金融 ETF']),
 ...us('必需消費','防守板塊',['PG:P&G','KO:Coca-Cola','XLP:必需消費 ETF']),
 ...us('醫療','防守板塊',['JNJ:Johnson & Johnson','UNH:UnitedHealth','XLV:醫療 ETF']),
 ...us('公用事業','防守板塊',['NEE:NextEra','DUK:Duke Energy','XLU:公用事業 ETF']),
 ...us('工業','板塊指標',['CAT:Caterpillar','GE:GE Aerospace','XLI:工業 ETF']),
 ...us('原材料','板塊指標',['LIN:Linde','FCX:Freeport-McMoRan','XLB:原材料 ETF']),
 ...us('不動產','板塊指標',['PLD:Prologis','XLRE:不動產 ETF']),
 ...us('非必需消費','板塊指標',['HD:Home Depot','XLY:非必需消費 ETF']),
 ...us('通訊服務','板塊指標',['NFLX:Netflix','XLC:通訊服務 ETF']),
 ...us('資訊科技','板塊指標',['XLK:資訊科技 ETF']),
];
