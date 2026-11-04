import React, { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { invalidateRequestCache, requestJson } from "../utils/api";
import { formatMarketTime } from "../utils/marketTime";

function number(value) {
  const parsed = Number(value);
  return value === null || value === undefined || value === "" || !Number.isFinite(parsed)
    ? null
    : parsed;
}

function money(value) {
  const parsed = number(value);
  return parsed === null ? "Unavailable" : `₹${parsed.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export default function ScreenerPage() {
  const [query, setQuery] = useState("");
  const [sectorInput, setSectorInput] = useState("");
  const [sort, setSort] = useState("market_cap");
  const [order, setOrder] = useState("desc");
  const [filters, setFilters] = useState({ query: "", sector: "" });
  const [offset, setOffset] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const pageSize = 50;

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    async function loadScreener() {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({
        sort,
        order,
        limit: String(pageSize),
        offset: String(offset),
      });
      if (filters.query) params.set("q", filters.query);
      if (filters.sector) params.set("sector", filters.sector);
      try {
        const data = await requestJson(`/eodhd/screener?${params.toString()}`, undefined, {
          signal: controller.signal,
        });
        if (!Array.isArray(data)) throw new Error("The stock screener returned an unexpected response.");
        if (active) setResults(data);
      } catch (loadError) {
        if (active && loadError.name !== "AbortError") {
          setResults([]);
          setError(loadError.message);
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    loadScreener();
    return () => {
      active = false;
      controller.abort();
    };
  }, [filters, sort, order, offset, refreshKey]);

  function applyFilters(event) {
    event.preventDefault();
    setOffset(0);
    setFilters({ query: query.trim(), sector: sectorInput.trim() });
  }

  const latestDate = results.find((item) => item.timestamp)?.timestamp;

  return (
    <Layout>
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-text-main">Stock Screener</h1>
            <p className="mt-1 text-sm text-text-secondary">
              NSE securities screened from EODHD’s authorized Stock Screener API. Results are latest completed-trading-day data, not live quotes.
            </p>
          </div>
          <button type="button" disabled={loading} onClick={() => {
            invalidateRequestCache();
            setRefreshKey((key) => key + 1);
          }}
            className="rounded-md border border-border-dark px-4 py-2 text-sm text-text-main disabled:opacity-50">
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </header>

        <form onSubmit={applyFilters} className="grid gap-3 rounded-lg border border-border-dark bg-bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1 text-sm text-text-secondary">
            Company name starts with
            <input value={query} onChange={(event) => setQuery(event.target.value)} maxLength={60}
              className="block w-full rounded-md border border-border-dark bg-bg-surface px-3 py-2 text-text-main" />
          </label>
          <label className="space-y-1 text-sm text-text-secondary">
            Sector
            <input value={sectorInput} onChange={(event) => setSectorInput(event.target.value)} maxLength={60}
              className="block w-full rounded-md border border-border-dark bg-bg-surface px-3 py-2 text-text-main" />
          </label>
          <label className="space-y-1 text-sm text-text-secondary">
            Sort by
            <select value={sort} onChange={(event) => { setSort(event.target.value); setOffset(0); }}
              className="block w-full rounded-md border border-border-dark bg-bg-surface px-3 py-2 text-text-main">
              <option value="market_cap">Market capitalization</option>
              <option value="change">Daily percentage change</option>
              <option value="volume">Last day volume</option>
              <option value="price">Adjusted close</option>
            </select>
          </label>
          <div className="flex items-end gap-2">
            <label className="min-w-0 flex-1 space-y-1 text-sm text-text-secondary">
              Order
              <select value={order} onChange={(event) => { setOrder(event.target.value); setOffset(0); }}
                className="block w-full rounded-md border border-border-dark bg-bg-surface px-3 py-2 text-text-main">
                <option value="desc">Highest first</option>
                <option value="asc">Lowest first</option>
              </select>
            </label>
            <button type="submit" className="rounded-md bg-primary-emerald px-4 py-2 text-sm font-medium text-bg-main">
              Apply
            </button>
          </div>
        </form>

        {loading && <p role="status" className="text-sm text-text-secondary">Loading NSE screener data…</p>}
        {!loading && error && (
          <section className="space-y-2 rounded-lg border border-secondary-gold/40 bg-secondary-gold/10 p-4">
            <h2 className="font-semibold text-text-main">Screener data unavailable</h2>
            <p role="alert" className="text-sm text-text-secondary">{error}</p>
            <p className="text-sm text-text-secondary">
              EODHD documents Stock Screener access in its All-In-One and EOD+Intraday — All World Extended plans. NSE screening additionally requires NSE exchange coverage. If this account lacks either entitlement, configure a licensed India-market provider; Supabase credentials do not grant market-data access.
            </p>
            <button type="button" onClick={() => {
              invalidateRequestCache();
              setRefreshKey((key) => key + 1);
            }}
              className="rounded-md border border-border-dark px-3 py-1.5 text-sm text-text-main">
              Retry
            </button>
          </section>
        )}
        {!loading && !error && results.length === 0 && (
          <p className="rounded-lg border border-border-dark bg-bg-card p-5 text-sm text-text-secondary">
            No matching NSE securities were returned by the provider.
          </p>
        )}
        {!loading && !error && results.length > 0 && (
          <>
            <p className="text-xs text-text-secondary">
              EODHD data date: {latestDate || "Not supplied"} · {results.length} provider results
              {latestDate && ` · Date parsed: ${formatMarketTime(latestDate)}`}
            </p>
            <section className="overflow-x-auto rounded-lg border border-border-dark bg-bg-card">
              <table className="w-full text-left text-sm">
                <thead className="text-text-secondary"><tr>
                  {["Company", "Symbol", "Sector", "Adjusted close", "1D change", "Market cap", "Last day volume", "Data date"].map((item) => <th key={item} className="px-4 py-3 font-medium">{item}</th>)}
                </tr></thead>
                <tbody className="divide-y divide-border-dark">
                  {results.map((item) => {
                    const change = number(item.change_percent);
                    return (
                      <tr key={item.symbol}>
                        <td className="px-4 py-3 text-text-main">{item.name || "Name unavailable"}</td>
                        <td className="px-4 py-3 text-text-secondary">{item.symbol}</td>
                        <td className="px-4 py-3 text-text-secondary">{item.sector || "Not provided"}</td>
                        <td className="px-4 py-3 text-text-main">{money(item.price)}</td>
                        <td className={`px-4 py-3 ${change === null ? "text-text-secondary" : change >= 0 ? "text-positive" : "text-negative"}`}>
                          {change === null ? "Unavailable" : `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`}
                        </td>
                        <td className="px-4 py-3 text-text-secondary">{money(item.market_cap)}</td>
                        <td className="px-4 py-3 text-text-secondary">{number(item.volume)?.toLocaleString("en-IN") || "Unavailable"}</td>
                        <td className="px-4 py-3 text-text-secondary">{item.timestamp || "Not supplied"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
            <div className="flex justify-between">
              <button type="button" disabled={offset === 0 || loading} onClick={() => setOffset((value) => Math.max(0, value - pageSize))}
                className="rounded-md border border-border-dark px-4 py-2 text-sm text-text-main disabled:opacity-50">
                Previous
              </button>
              <button type="button" disabled={results.length < pageSize || loading} onClick={() => setOffset((value) => value + pageSize)}
                className="rounded-md border border-border-dark px-4 py-2 text-sm text-text-main disabled:opacity-50">
                Next
              </button>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
