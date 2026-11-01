// src/pages/DashboardPage.jsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../services/supabase";
import Layout from "../components/Layout";
import { marketIndices, topGainers, topLosers, mostActive, sectorPerformance, watchlist, portfolio, newsArticles, insights } from "../data/sampleData";
import {
  BarChart as ReBarChart,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  Bar,
} from "recharts";

function IndexCard({ name, value, change, trend }) {
  return (
    <div className="bg-gray-900 rounded-lg p-4 shadow border border-gray-800">
      <h3 className="text-sm font-medium text-gray-400">{name}</h3>
      <p className="mt-1 text-2xl font-bold text-gray-100">{value}</p>
      <p className={`mt-1 text-sm ${trend === "up" ? "text-emerald-400" : "text-red-400"}`}>{change}</p>
    </div>
  );
}

function DashboardPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [message, setMessage] = useState("");

  async function handleSignOut() {
    setMessage("");
    const { error } = await supabase.auth.signOut();
    if (error) {
      setMessage(error.message);
      return;
    }
    navigate("/login", { replace: true });
  }

  return (
    <Layout>
      {/* Header already includes Navbar via Layout */}
      <div className="grid gap-6">
        {/* Index cards */}
        <div className="grid gap-4 md:grid-cols-3">
          {marketIndices.map((idx) => (
            <IndexCard key={idx.name} {...idx} />
          ))}
        </div>

        {/* Market performance chart */}
        <div className="bg-gray-900 rounded-lg p-4 shadow border border-gray-800">
          <h3 className="text-lg font-medium text-gray-200 mb-2">Market Overview (DEMO)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <ReBarChart data={marketIndices}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="value" fill="#10B981" />
            </ReBarChart>
          </ResponsiveContainer>
        </div>

        {/* Gainers / Losers */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="bg-gray-900 rounded-lg p-4 shadow border border-gray-800">
            <h3 className="text-lg font-medium text-gray-200 mb-2">Top Gainers (DEMO)</h3>
            <ul className="divide-y divide-gray-800">
              {topGainers.map((g) => (
                <li key={g.symbol} className="py-2 flex justify-between items-center text-sm">
                  <span className="font-medium text-gray-100">{g.symbol}</span>
                  <span className="text-emerald-400">{g.change}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-gray-900 rounded-lg p-4 shadow border border-gray-800">
            <h3 className="text-lg font-medium text-gray-200 mb-2">Top Losers (DEMO)</h3>
            <ul className="divide-y divide-gray-800">
              {topLosers.map((l) => (
                <li key={l.symbol} className="py-2 flex justify-between items-center text-sm">
                  <span className="font-medium text-gray-100">{l.symbol}</span>
                  <span className="text-red-400">{l.change}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Most Active */}
        <div className="bg-gray-900 rounded-lg p-4 shadow border border-gray-800">
          <h3 className="text-lg font-medium text-gray-200 mb-2">Most Active (DEMO)</h3>
          <ul className="divide-y divide-gray-800">
            {mostActive.map((s) => (
              <li key={s.symbol} className="py-2 flex justify-between items-center text-sm">
                <span className="font-medium text-gray-100">{s.symbol}</span>
                <span className="text-gray-400">{s.volume}</span>
                <span className="text-gray-300">{s.price}</span>
                <span className={s.change.startsWith("+") ? "text-emerald-400" : "text-red-400"}>{s.change}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Sector performance */}
        <div className="bg-gray-900 rounded-lg p-4 shadow border border-gray-800">
          <h3 className="text-lg font-medium text-gray-200 mb-2">Sector Performance (DEMO)</h3>
          <ul className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {sectorPerformance.map((sec) => (
              <li key={sec.sector} className="flex justify-between items-center text-sm">
                <span className="font-medium text-gray-100">{sec.sector}</span>
                <span className={sec.change.startsWith("+") ? "text-emerald-400" : "text-red-400"}>{sec.change}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Watchlist preview */}
        <div className="bg-gray-900 rounded-lg p-4 shadow border border-gray-800">
          <h3 className="text-lg font-medium text-gray-200 mb-2">Watchlist (DEMO)</h3>
          <ul className="divide-y divide-gray-800">
            {watchlist.map((w) => (
              <li key={w.symbol} className="py-2 flex justify-between items-center text-sm">
                <span className="font-medium text-gray-100">{w.symbol}</span>
                <span className="text-gray-300">{w.price}</span>
                <span className={w.change.startsWith("+") ? "text-emerald-400" : "text-red-400"}>{w.change}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Portfolio summary */}
        <div className="bg-gray-900 rounded-lg p-4 shadow border border-gray-800">
          <h3 className="text-lg font-medium text-gray-200 mb-2">Portfolio Summary (DEMO)</h3>
          <p className="text-sm text-gray-400">Cash: ₹{portfolio.cash.toLocaleString()}</p>
          <p className="text-sm text-gray-400">Holdings: {portfolio.holdings.length}</p>
        </div>

        {/* News */}
        <div className="bg-gray-900 rounded-lg p-4 shadow border border-gray-800">
          <h3 className="text-lg font-medium text-gray-200 mb-2">Latest Market News (DEMO)</h3>
          <ul className="divide-y divide-gray-800">
            {newsArticles.map((a, i) => (
              <li key={i} className="py-2">
                <p className="font-medium text-gray-100">{a.title}</p>
                <p className="text-xs text-gray-400">{a.source} • {a.time}</p>
              </li>
            ))}
          </ul>
        </div>

        {/* AI insights */}
        <div className="bg-gray-900 rounded-lg p-4 shadow border border-gray-800">
          <h3 className="text-lg font-medium text-gray-200 mb-2">AI Market Insights (DEMO)</h3>
          <p className="text-sm text-gray-300">{insights.summary}</p>
          <p className="text-xs text-gray-600 mt-1 italic">{insights.note}</p>
        </div>
      </div>
    </Layout>
  );
}

export default DashboardPage;
