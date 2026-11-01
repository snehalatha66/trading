// Sample demo data for UI components – all values are DEMO only
export const marketIndices = [
  { name: "NIFTY 50", value: "19,550.32", change: "+0.73%", trend: "up" },
  { name: "SENSEX", value: "73,112.45", change: "-0.12%", trend: "down" },
  { name: "BANK NIFTY", value: "44,321.78", change: "+1.04%", trend: "up" },
];

export const topGainers = [
  { symbol: "RELIANCE", name: "Reliance Industries Ltd.", price: "2,950.00", change: "+5.23%" },
  { symbol: "TCS", name: "Tata Consultancy Services Ltd.", price: "3,560.00", change: "+4.78%" },
  { symbol: "INFY", name: "Infosys Ltd.", price: "1,620.00", change: "+4.55%" },
];

export const topLosers = [
  { symbol: "HDFC", name: "HDFC Bank Ltd.", price: "1,540.00", change: "-3.21%" },
  { symbol: "ITC", name: "ITC Ltd.", price: "450.00", change: "-2.95%" },
  { symbol: "SBIN", name: "State Bank of India", price: "620.00", change: "-2.70%" },
];

export const mostActive = [
  { symbol: "SBIN", name: "State Bank of India", volume: "5.2M", price: "620.00", change: "+0.30%" },
  { symbol: "RELIANCE", name: "Reliance Industries Ltd.", volume: "4.8M", price: "2,950.00", change: "+0.45%" },
  { symbol: "TCS", name: "Tata Consultancy Services Ltd.", volume: "3.9M", price: "3,560.00", change: "-0.10%" },
];

export const sectorPerformance = [
  { sector: "Banking", change: "+1.2%" },
  { sector: "IT", change: "+0.8%" },
  { sector: "Pharma", change: "-0.5%" },
  { sector: "Auto", change: "+0.3%" },
  { sector: "Energy", change: "-0.2%" },
  { sector: "FMCG", change: "+0.6%" },
  { sector: "Metal", change: "-0.1%" },
];

export const watchlist = [
  { symbol: "YESBANK", name: "Yes Bank Ltd.", price: "23.45", change: "+1.10%" },
  { symbol: "MARUTI", name: "Maruti Suzuki India Ltd.", price: "7,800.00", change: "-0.45%" },
  { symbol: "NTPC", name: "NTPC Ltd.", price: "145.20", change: "+0.85%" },
];

export const portfolio = {
  cash: 50000,
  holdings: [
    { symbol: "TCS", name: "Tata Consultancy Services Ltd.", qty: 10, avgPrice: 3050, currentPrice: 3560 },
    { symbol: "RELIANCE", name: "Reliance Industries Ltd.", qty: 5, avgPrice: 2600, currentPrice: 2950 },
  ],
};

export const newsArticles = [
  { title: "Indian markets dip amid global risk aversion", source: "Economic Times", time: "2 hrs ago", sentiment: "neutral" },
  { title: "Tech stocks rally as earnings beat expectations", source: "LiveMint", time: "5 hrs ago", sentiment: "positive" },
  { title: "Oil price surge hits energy sector", source: "Reuters", time: "1 day ago", sentiment: "negative" },
];

export const insights = {
  summary: "Demo market insights – bullish on IT and Banking sectors, moderate volatility observed.",
  note: "All data is for UI demonstration purposes only (DEMO).",
};
