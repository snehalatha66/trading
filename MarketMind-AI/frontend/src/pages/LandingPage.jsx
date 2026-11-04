// src/pages/LandingPage.jsx
import React from "react";
import { Link } from "react-router-dom";
import PublicNavbar from "../components/PublicNavbar";
import PublicFooter from "../components/PublicFooter";

function LandingPage() {
  const [indices, setIndices] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    const fetchIndices = async () => {
      try {
        const res = await fetch("/api/v1/eodhd/indices");
        if (!res.ok) throw new Error("Failed to fetch indices");
        const data = await res.json();
        setIndices(data);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    fetchIndices();
  }, []);

  const features = [
    { title: "AI Market Insights", desc: "Gemini‑powered market analysis with real‑time sentiment", icon: "🤖" },
    { title: "Smart Stock Screener", desc: "Filter stocks by price, market‑cap, sector and more", icon: "🔍" },
    { title: "Company Fundamentals", desc: "Deep financial data for every listed company", icon: "📊" },
    { title: "Personal Watchlist", desc: "Track your favorite stocks with live updates", icon: "⭐" },
    { title: "Paper Trading", desc: "Practice strategies risk‑free with virtual capital", icon: "📝" },
    { title: "Market News", desc: "Stay informed with curated Indian market headlines", icon: "📰" },
  ];

  return (
    <div className="min-h-screen bg-[#101310] text-[#F1F3F0] flex flex-col">
      <PublicNavbar />

      {/* Hero Section */}
      <section className="w-full bg-[#151915] py-12 px-6 lg:px-12 text-center">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center gap-8">
          {/* Left */}
          <div className="flex-1 text-left">
            <span className="inline-block bg-[#20C982]/10 text-[#20C982] px-3 py-1 rounded-full text-sm mb-3">
              AI‑Powered Market Intelligence
            </span>
            <h1 className="text-5xl font-bold mb-4 text-[#20C982]">Smarter Investing Starts with AI</h1>
            <p className="text-lg mb-6 max-w-2xl">
              Real‑time Indian market data, AI‑driven insights and paper‑trading – all in one premium platform.
            </p>
            <div className="flex space-x-4">
              <Link to="/markets" className="px-6 py-2 bg-[#20C982] text-[#101310] rounded hover:bg-[#1A9E70] transition">
                Explore Markets
              </Link>
              <Link to="/paper-trading" className="px-6 py-2 bg-[#D6AD62] text-[#101310] rounded hover:bg-[#BF9D55] transition">
                Start Paper Trading
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Live Market Overview */}
      <section className="w-full py-8 px-4 lg:px-12">
        <h2 className="text-2xl font-semibold mb-4 text-[#20C982] text-center">Live Market Overview</h2>
        {loading && <p className="text-center text-[#929B93]">Loading indices…</p>}
        {error && <p className="text-center text-[#E46B70]">Error: {error}</p>}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 max-w-6xl mx-auto">
          {indices.map((idx) => (
            <div key={idx.name} className="bg-[#1C231E] p-4 rounded shadow border border-[#303A32]">
              <h3 className="text-sm font-medium text-[#F1F3F0] mb-1">{idx.name}</h3>
              <p className="text-3xl font-bold text-[#20C982]">{idx.value?.toFixed(2) ?? "--"}</p>
              {idx.change !== undefined && (
                <p className={`text-sm ${idx.change >= 0 ? "text-[#20C982]" : "text-[#E46B70]"}`}> 
                  {idx.change >= 0 ? "+" : ""}{idx.change?.toFixed(2)} ({idx.change_percent?.toFixed(2)}%)
                </p>
              )}
              <p className="text-xs text-[#929B93] mt-1">{idx.timestamp?.split("T")[0]}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features Section */}
      <section className="w-full py-12 px-4 lg:px-12 bg-[#151915]">
        <h2 className="text-2xl font-semibold mb-6 text-center text-[#20C982]">Platform Features</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {features.map((f) => (
            <div key={f.title} className="bg-[#1C231E] p-6 rounded hover:bg-[#1F2620] transition border border-[#303A32]">
              <div className="text-3xl mb-3">{f.icon}</div>
              <h3 className="text-lg font-medium mb-2 text-[#F1F3F0]">{f.title}</h3>
              <p className="text-sm text-[#929B93]">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* AI Intelligence Showcase */}
      <section className="w-full py-12 px-4 lg:px-12">
        <h2 className="text-2xl font-semibold mb-4 text-center text-[#20C982]">AI‑Powered Market Summary</h2>
        <div className="max-w-4xl mx-auto bg-[#1C231E] p-6 rounded border border-[#303A32]">
          <p className="text-sm text-[#929B93] mb-2">[AI summary fetched from /api/v1/ai/summary – will be displayed here when available.]</p>
          <p className="text-[#F1F3F0]">Stay tuned for live AI insights.</p>
        </div>
      </section>

      {/* How It Works */}
      <section className="w-full py-12 px-4 lg:px-12 bg-[#151915]">
        <h2 className="text-2xl font-semibold mb-6 text-center text-[#20C982]">How It Works</h2>
        <div className="flex flex-col md:flex-row justify-center items-center gap-8 max-w-5xl mx-auto">
          {[
            { step: 1, title: "Explore Markets", icon: "📈", desc: "Browse live Indian market data and discover opportunities." },
            { step: 2, title: "Analyze with AI", icon: "🤖", desc: "Leverage Gemini‑powered insights for smarter decisions." },
            { step: 3, title: "Practice Paper Trading", icon: "📝", desc: "Test strategies risk‑free before committing capital." },
          ].map((s) => (
            <div key={s.step} className="flex-1 text-center">
              <div className="text-4xl mb-2">{s.icon}</div>
              <h3 className="text-xl font-medium mb-1 text-[#F1F3F0]">Step {s.step}: {s.title}</h3>
              <p className="text-sm text-[#929B93]">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Call to Action */}
      <section className="w-full py-12 px-4 lg:px-12 text-center bg-[#151915]">
        <h2 className="text-3xl font-bold mb-4 text-[#20C982]">Make Smarter Market Decisions with AI</h2>
        <p className="mb-6 text-[#F1F3F0] max-w-2xl mx-auto">
          Explore market data, understand trends and improve your trading knowledge with MarketMind AI.
        </p>
        <div className="flex justify-center space-x-4">
          <Link to="/register" className="px-8 py-3 bg-[#20C982] text-[#101310] rounded hover:bg-[#1A9E70] transition">
            Get Started
          </Link>
          <Link to="/features" className="px-8 py-3 bg-[#D6AD62] text-[#101310] rounded hover:bg-[#BF9D55] transition">
            Explore Features
          </Link>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}

export default LandingPage;
