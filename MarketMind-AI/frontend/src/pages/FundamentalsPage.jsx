import React, { useState } from "react";
import Layout from "../components/Layout";
import { useAuth } from "../context/AuthContext";
import { invalidateRequestCache, requestJson } from "../utils/api";
import { formatMarketTime } from "../utils/marketTime";

function firstValue(data, paths) {
  for (const path of paths) {
    const value = path.split(".").reduce((current, key) => current?.[key], data);
    if (value !== null && value !== undefined && value !== "") return value;
  }
  return null;
}

function numericValue(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function latestFinancialValue(financials, statement, field) {
  const rows = financials?.[statement]?.yearly;
  if (!rows || typeof rows !== "object") return null;
  const latest = Object.values(rows).filter((row) => row && typeof row === "object")[0];
  return latest?.[field] ?? null;
}

function formatCurrency(value, currencyCode = "INR") {
  const number = numericValue(value);
  if (number === null) return "Not provided by data source";
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: currencyCode,
      maximumFractionDigits: 2,
    }).format(number);
  } catch {
    return `${number.toLocaleString("en-IN")} ${currencyCode}`;
  }
}

function formatNumber(value, suffix = "") {
  const number = numericValue(value);
  return number === null
    ? "Not provided by data source"
    : `${number.toLocaleString("en-IN", { maximumFractionDigits: 2 })}${suffix}`;
}

function MetricCard({ label, value }) {
  return (
    <div className="rounded-lg border border-[#303A32] bg-[#1C231E] p-4">
      <p className="text-sm text-[#929B93]">{label}</p>
      <p className="mt-2 break-words text-lg font-semibold text-[#F1F3F0]">{value}</p>
    </div>
  );
}

export default function FundamentalsPage() {
  const { session } = useAuth();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState({ results: [], loading: false, error: null });
  const [company, setCompany] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [marketData, setMarketData] = useState({ price: null, timestamp: null, error: null });
  const [fundamentals, setFundamentals] = useState({ data: null, loading: false, error: null });

  async function searchStocks(event) {
    event.preventDefault();
    const term = query.trim();
    if (!term) {
      setSearch({ results: [], loading: false, error: "Enter a company name or stock symbol." });
      return;
    }

    setCompany(null);
    setSearch({ results: [], loading: true, error: null });
    try {
      const results = await requestJson(
        `/stocks?q=${encodeURIComponent(term)}&limit=10`,
        session?.access_token,
      );
      if (!Array.isArray(results)) throw new Error("The stock search returned an unexpected response.");
      setSearch({
        results,
        loading: false,
        error: results.length ? null : "No matching companies were found.",
      });
    } catch (error) {
      setSearch({ results: [], loading: false, error: error.message });
    }
  }

  React.useEffect(() => {
    if (!company) return undefined;
    const controller = new AbortController();
    let active = true;
    setMarketData({ price: null, timestamp: null, error: null });
    setFundamentals({ data: null, loading: true, error: null });

    const providerSymbol = company.symbol.includes(".")
      ? company.symbol
      : `${company.symbol}.${company.exchange || "NSE"}`;
    requestJson(
      `/stocks/${encodeURIComponent(company.id)}/snapshots?limit=1`,
      session?.access_token,
      { signal: controller.signal },
    )
      .then((snapshots) => {
        if (!active) return;
        if (!Array.isArray(snapshots)) throw new Error("The price history returned an unexpected response.");
        setMarketData({
          price: snapshots[0]?.price ?? null,
          timestamp: snapshots[0]?.snapshot_at ?? null,
          error: snapshots.length ? null : "No saved market price is available for this company.",
        });
      })
      .catch((error) => {
        if (active && error.name !== "AbortError") {
          setMarketData({ price: null, timestamp: null, error: error.message });
        }
      });

    requestJson(
      `/eodhd/fundamentals/${encodeURIComponent(providerSymbol)}`,
      session?.access_token,
      { signal: controller.signal },
    )
      .then((data) => {
        if (active) setFundamentals({ data, loading: false, error: null });
      })
      .catch((error) => {
        if (active && error.name !== "AbortError") {
          setFundamentals({ data: null, loading: false, error: error.message });
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [company, refreshKey, session?.access_token]);

  const data = fundamentals.data;
  const general = data?.General || {};
  const financials = data?.Financials || {};
  const currencyCode = general.CurrencyCode || "INR";
  const marketCap = firstValue(data, ["Highlights.MarketCapitalization"]);
  const peRatio = firstValue(data, ["Highlights.PERatio", "Valuation.TrailingPE"]);
  const eps = firstValue(data, ["Highlights.EarningsShare", "Highlights.DilutedEpsTTM"])
    ?? latestFinancialValue(financials, "Income_Statement", "dilutedEPS");
  const roe = firstValue(data, ["Highlights.ReturnOnEquityTTM"]);
  const debtToEquity = firstValue(data, ["Highlights.DebtEquityRatio"])
    ?? latestFinancialValue(financials, "Balance_Sheet", "debtToEquity");
  const revenue = firstValue(data, ["Highlights.RevenueTTM"])
    ?? latestFinancialValue(financials, "Income_Statement", "totalRevenue");
  const profit = firstValue(data, ["Highlights.NetIncomeTTM"])
    ?? latestFinancialValue(financials, "Income_Statement", "netIncome");

  const metrics = [
    ["Market capitalization", formatCurrency(marketCap, currencyCode)],
    ["P/E ratio", formatNumber(peRatio)],
    ["EPS", formatCurrency(eps, currencyCode)],
    ["Return on equity", formatNumber(roe, "%")],
    ["Debt-to-equity ratio", formatNumber(debtToEquity)],
    ["Revenue", formatCurrency(revenue, currencyCode)],
    ["Net income / profit", formatCurrency(profit, currencyCode)],
  ];

  return (
    <Layout>
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[#F1F3F0]">Company Fundamentals</h1>
            <p className="mt-1 text-sm text-[#929B93]">
              Company financials and saved market prices from connected data sources.
            </p>
          </div>
          {company && (
            <button type="button" disabled={fundamentals.loading}
              onClick={() => {
                invalidateRequestCache();
                setRefreshKey((key) => key + 1);
              }}
              className="rounded-md border border-[#303A32] px-4 py-2 text-sm text-[#F1F3F0] disabled:opacity-50">
              {fundamentals.loading ? "Refreshing…" : "Refresh"}
            </button>
          )}
        </header>

        <form onSubmit={searchStocks} className="flex flex-col gap-3 sm:flex-row">
          <label htmlFor="stock-search" className="sr-only">Company name or stock symbol</label>
          <input
            id="stock-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search company name or symbol (e.g. RELIANCE.NSE)"
            className="min-w-0 flex-1 rounded-md border border-[#303A32] bg-[#1C231E] px-4 py-3 text-[#F1F3F0] placeholder:text-[#929B93] focus:border-[#20C982] focus:outline-none"
          />
          <button
            type="submit"
            disabled={search.loading}
            className="rounded-md bg-[#20C982] px-5 py-3 font-semibold text-[#101310] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {search.loading ? "Searching…" : "Search"}
          </button>
        </form>

        {search.error && <p role="alert" className="text-sm text-[#E46B70]">{search.error}</p>}
        {search.results.length > 0 && (
          <section aria-label="Company search results" className="space-y-2">
            {search.results.map((result) => (
              <button
                type="button"
                key={result.id}
                onClick={() => setCompany(result)}
                className="flex w-full items-center justify-between rounded-md border border-[#303A32] bg-[#1C231E] px-4 py-3 text-left hover:border-[#20C982]"
              >
                <span className="font-medium text-[#F1F3F0]">{result.name || result.symbol}</span>
                <span className="text-sm text-[#929B93]">{result.symbol} · {result.exchange || "Exchange unavailable"}</span>
              </button>
            ))}
          </section>
        )}

        {company && (
          <section className="space-y-6" aria-live="polite">
            <div className="rounded-lg border border-[#303A32] bg-[#151915] p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-[#F1F3F0]">
                    {general.Name || company.name || company.symbol}
                  </h2>
                  <p className="mt-1 text-sm text-[#929B93]">
                    {company.symbol}{general.Exchange ? ` · ${general.Exchange}` : ""}
                    {general.Sector ? ` · ${general.Sector}` : ""}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-[#929B93]">Current price</p>
                  <p className="mt-1 text-2xl font-bold text-[#20C982]">
                    {formatCurrency(marketData.price, currencyCode)}
                  </p>
                  {marketData.timestamp && (
                    <p className="mt-1 text-xs text-[#929B93]">
                      Saved quote: {formatMarketTime(marketData.timestamp)}
                    </p>
                  )}
                  {marketData.error && (
                    <p role="status" className="mt-1 text-xs text-[#E46B70]">{marketData.error}</p>
                  )}
                </div>
              </div>
            </div>

            {fundamentals.loading && <p className="text-sm text-[#929B93]">Loading provider fundamentals…</p>}
            {fundamentals.error && (
              <p role="alert" className="rounded-md border border-[#E46B70]/40 bg-[#E46B70]/10 p-3 text-sm text-[#E46B70]">
                Provider fundamentals unavailable: {fundamentals.error}
              </p>
            )}

            <section aria-labelledby="key-metrics-heading">
              <h3 id="key-metrics-heading" className="mb-3 text-lg font-semibold text-[#F1F3F0]">Key metrics</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <MetricCard label="Market capitalization" value={formatCurrency(marketCap, currencyCode)} />
                <MetricCard label="P/E ratio" value={formatNumber(peRatio)} />
                <MetricCard label="EPS" value={formatCurrency(eps, currencyCode)} />
                <MetricCard label="ROE" value={formatNumber(roe, "%")} />
              </div>
            </section>

            <section aria-labelledby="financials-heading" className="space-y-3">
              <h3 id="financials-heading" className="text-lg font-semibold text-[#F1F3F0]">Revenue and profit</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <MetricCard label="Revenue" value={formatCurrency(revenue, currencyCode)} />
                <MetricCard label="Net income / profit" value={formatCurrency(profit, currencyCode)} />
              </div>
            </section>

            <section aria-labelledby="metrics-table-heading">
              <h3 id="metrics-table-heading" className="mb-3 text-lg font-semibold text-[#F1F3F0]">Financial metrics</h3>
              <div className="overflow-x-auto rounded-lg border border-[#303A32]">
                <table className="w-full border-collapse text-left text-sm">
                  <thead className="bg-[#1C231E] text-[#929B93]">
                    <tr>
                      <th scope="col" className="px-4 py-3 font-medium">Metric</th>
                      <th scope="col" className="px-4 py-3 font-medium">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#303A32]">
                    {metrics.map(([label, value]) => (
                      <tr key={label} className="bg-[#151915]">
                        <th scope="row" className="px-4 py-3 font-medium text-[#F1F3F0]">{label}</th>
                        <td className="px-4 py-3 text-[#929B93]">{value}</td>
                      </tr>
                    ))}
                    <tr className="bg-[#151915]">
                      <th scope="row" className="px-4 py-3 font-medium text-[#F1F3F0]">Industry</th>
                      <td className="px-4 py-3 text-[#929B93]">{general.Industry || "Not provided by data source"}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          </section>
        )}
      </div>
    </Layout>
  );
}
