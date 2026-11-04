import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Layout from "../components/Layout";
import { useAuth } from "../context/AuthContext";
import { invalidateRequestCache, requestJson } from "../utils/api";
import { formatMarketTime } from "../utils/marketTime";

const COLORS = ["#20C982", "#D6AD62", "#5CA4E8", "#D879AE", "#8B87E8", "#E78652"];

function number(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function currency(value) {
  const amount = number(value);
  return amount === null ? "Unavailable" : `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function formatPercent(value) {
  const amount = number(value);
  return amount === null ? "Unavailable" : `${amount >= 0 ? "+" : ""}${amount.toFixed(2)}%`;
}

function providerSymbol(stock) {
  const symbol = String(stock?.symbol || "").toUpperCase();
  const exchange = String(stock?.exchange || "").toUpperCase();
  return symbol && !symbol.includes(".") && exchange ? `${symbol}.${exchange}` : symbol;
}

function formatTime(value) {
  if (!value) return "No saved market price";
  return formatMarketTime(value);
}

export default function PortfolioPage() {
  const { session } = useAuth();
  const [portfolios, setPortfolios] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [quoteWarning, setQuoteWarning] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);
      setQuoteWarning(null);
      if (!session?.access_token) {
        setPortfolios([]);
        setTransactions([]);
        setError("Sign in to view your portfolio.");
        setLoading(false);
        return;
      }

      try {
        const [summaries, transactionRows] = await Promise.all([
          requestJson("/portfolios/", session.access_token, { signal: controller.signal }),
          requestJson("/transactions?scope=portfolio&limit=1000", session.access_token, { signal: controller.signal }),
        ]);
        if (!Array.isArray(summaries) || !Array.isArray(transactionRows)) {
          throw new Error("The portfolio API returned an unexpected response.");
        }
        const details = await Promise.all(
          summaries.map((portfolio) =>
            requestJson(`/portfolios/${encodeURIComponent(portfolio.id)}`, session.access_token, {
              signal: controller.signal,
            }),
          ),
        );
        const holdings = details.flatMap((portfolio) => portfolio.holdings || []);
        const priceRows = await Promise.all(
          holdings.map(async (holding) => {
            const stockId = holding.stock?.id || holding.stock_id;
            let quote = null;
            let quoteError = null;
            const symbol = providerSymbol(holding.stock);
            if (symbol) {
              try {
                const quotes = await requestJson(
                  `/eodhd/quotes?symbols=${encodeURIComponent(symbol)}`,
                  session.access_token,
                  { signal: controller.signal },
                );
                quote = Array.isArray(quotes) ? quotes[0] || null : null;
                if (!quote) quoteError = `No provider quote was returned for ${symbol}.`;
              } catch (requestError) {
                if (requestError.name === "AbortError") throw requestError;
                quoteError = requestError.message;
              }
            }

            let snapshots = [];
            try {
              snapshots = await requestJson(
                `/stocks/${encodeURIComponent(stockId)}/snapshots?limit=1`,
                session.access_token,
                { signal: controller.signal },
              );
            } catch (requestError) {
              if (requestError.name === "AbortError") throw requestError;
              if (!quoteError) quoteError = requestError.message;
            }
            return [
              holding.id || `${holding.portfolio_id}-${stockId}`,
              {
                quote,
                snapshot: Array.isArray(snapshots) ? snapshots[0] || null : null,
                quoteError,
              },
            ];
          }),
        );
        const priceByHolding = new Map(priceRows);
        if (active) {
          setPortfolios(details.map((portfolio) => ({
            ...portfolio,
            holdings: (portfolio.holdings || []).map((holding) => ({
              ...holding,
              market: priceByHolding.get(
                holding.id || `${holding.portfolio_id}-${holding.stock_id}`,
              ),
            })),
          })));
          setTransactions(transactionRows);
          const quoteErrors = priceRows.map(([, data]) => data.quoteError).filter(Boolean);
          if (quoteErrors.length) setQuoteWarning(quoteErrors[0]);
        }
      } catch (loadError) {
        if (active && loadError.name !== "AbortError") {
          setError(loadError.message);
          setPortfolios([]);
          setTransactions([]);
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [session?.access_token, refreshKey]);

  const holdings = useMemo(
    () => portfolios.flatMap((portfolio) => portfolio.holdings || []),
    [portfolios],
  );
  const invested = holdings.reduce(
    (sum, holding) => sum + (number(holding.quantity) || 0) * (number(holding.avg_price) || 0),
    0,
  );
  const hasAllCurrentQuotes = holdings.length > 0 && holdings.every(
    (holding) => number(holding.market?.quote?.price) !== null,
  );
  const currentValue = hasAllCurrentQuotes
    ? holdings.reduce((sum, holding) => sum + Number(holding.quantity) * Number(holding.market.quote.price), 0)
    : null;
  const fallbackValue = holdings.every((holding) => number(holding.market?.snapshot?.price) !== null)
    ? holdings.reduce((sum, holding) => sum + Number(holding.quantity) * Number(holding.market.snapshot.price), 0)
    : null;
  const profitLoss = currentValue === null ? null : currentValue - invested;
  const profitPercent = profitLoss === null || invested === 0 ? null : (profitLoss / invested) * 100;
  const allocation = holdings
    .map((holding) => {
      const marketPrice = number(holding.market?.quote?.price)
        ?? number(holding.market?.snapshot?.price);
      return {
        name: holding.stock?.symbol || "Unknown",
        value: marketPrice === null ? 0 : marketPrice * (number(holding.quantity) || 0),
      };
    })
    .filter((item) => item.value > 0);
  const performance = holdings.map((holding) => {
    const current = number(holding.market?.quote?.price)
      ?? number(holding.market?.snapshot?.price);
    const cost = (number(holding.quantity) || 0) * (number(holding.avg_price) || 0);
    return {
      symbol: holding.stock?.symbol || "Unknown",
      cost,
      marketValue: current === null ? null : current * (number(holding.quantity) || 0),
    };
  }).filter((item) => item.marketValue !== null);

  return (
    <Layout>
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-text-main">Portfolio</h1>
            <p className="mt-1 text-sm text-text-secondary">
              Holdings and transactions are loaded from your account. Market value uses live provider quotes when available.
            </p>
          </div>
          <button type="button" onClick={() => {
            invalidateRequestCache();
            setRefreshKey((key) => key + 1);
          }} disabled={loading}
            className="rounded-md bg-bg-surface px-4 py-2 text-sm text-text-main disabled:opacity-60">
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </header>

        {loading && <p role="status" className="text-sm text-text-secondary">Loading portfolio data…</p>}
        {!loading && error && (
          <p role="alert" className="rounded-md border border-negative/40 bg-negative/10 p-3 text-sm text-negative">
            Could not load portfolio: {error}
          </p>
        )}
        {!loading && !error && portfolios.length === 0 && (
          <section className="rounded-lg border border-border-dark bg-bg-card p-5 text-sm text-text-secondary">
            No portfolio data is saved to your account yet.
          </section>
        )}
        {quoteWarning && !loading && (
          <p role="status" className="rounded-md border border-secondary-gold/30 bg-secondary-gold/10 p-3 text-sm text-text-secondary">
            Live quotes are unavailable: {quoteWarning} Current values and charts use saved market snapshots when available and show their timestamps.
          </p>
        )}

        {!loading && !error && portfolios.length > 0 && (
          <>
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Invested", currency(invested)],
                ["Current value", hasAllCurrentQuotes ? currency(currentValue) : currency(fallbackValue)],
                ["Profit / Loss", profitLoss === null ? "Unavailable without live quotes" : currency(profitLoss)],
                ["Return", profitPercent === null ? "Unavailable without live quotes" : formatPercent(profitPercent)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-border-dark bg-bg-card p-4">
                  <p className="text-sm text-text-secondary">{label}</p>
                  <p className="mt-2 text-xl font-semibold text-text-main">{value}</p>
                </div>
              ))}
            </section>

            {holdings.length === 0 ? (
              <p className="rounded-lg border border-border-dark bg-bg-card p-5 text-sm text-text-secondary">
                Your saved portfolios have no holdings.
              </p>
            ) : (
              <>
                <section className="overflow-x-auto rounded-lg border border-border-dark bg-bg-card">
                  <h2 className="px-4 pt-4 text-lg font-semibold text-text-main">Stock holdings</h2>
                  <table className="w-full text-left text-sm">
                    <thead className="text-text-secondary">
                      <tr>
                        {["Portfolio", "Stock", "Quantity", "Average buy", "Market price", "P/L", "Quote as of"].map((item) => (
                          <th key={item} className="px-4 py-3 font-medium">{item}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-dark">
                      {portfolios.flatMap((portfolio) => portfolio.holdings.map((holding) => {
                        const live = number(holding.market?.quote?.price);
                        const saved = number(holding.market?.snapshot?.price);
                        const marketPrice = live ?? saved;
                        const quantity = number(holding.quantity) || 0;
                        const costBasis = quantity * (number(holding.avg_price) || 0);
                        const holdingPnl = live === null ? null : live * quantity - costBasis;
                        return (
                          <tr key={`${portfolio.id}-${holding.id || holding.stock_id}`}>
                            <td className="px-4 py-3 text-text-secondary">{portfolio.name}</td>
                            <td className="px-4 py-3 text-text-main">
                              {holding.stock?.name || holding.stock?.symbol || "Unknown"}
                              <span className="ml-2 text-xs text-text-secondary">{holding.stock?.symbol}</span>
                            </td>
                            <td className="px-4 py-3 text-text-secondary">{holding.quantity}</td>
                            <td className="px-4 py-3 text-text-secondary">{currency(holding.avg_price)}</td>
                            <td className="px-4 py-3 text-text-main">
                              {marketPrice === null ? "Unavailable" : currency(marketPrice)}
                              {live === null && saved !== null && <span className="ml-1 text-xs text-text-secondary">(saved)</span>}
                            </td>
                            <td className={`px-4 py-3 ${holdingPnl === null ? "text-text-secondary" : holdingPnl >= 0 ? "text-positive" : "text-negative"}`}>
                              {holdingPnl === null ? "Unavailable without live quote" : currency(holdingPnl)}
                            </td>
                            <td className="px-4 py-3 text-xs text-text-secondary">
                              {live !== null
                                ? formatTime(holding.market?.quote?.timestamp)
                                : formatTime(holding.market?.snapshot?.snapshot_at)}
                            </td>
                          </tr>
                        );
                      }))}
                    </tbody>
                  </table>
                </section>

                <section className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-lg border border-border-dark bg-bg-card p-4">
                    <h2 className="mb-3 text-lg font-semibold text-text-main">Portfolio allocation</h2>
                    {allocation.length ? (
                      <ResponsiveContainer width="100%" height={280}>
                        <PieChart>
                          <Pie data={allocation} dataKey="value" nameKey="name" outerRadius={95} label>
                            {allocation.map((entry, index) => <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />)}
                          </Pie>
                          <Tooltip formatter={(value) => currency(value)} />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="text-sm text-text-secondary">Allocation is unavailable until provider prices or saved snapshots exist.</p>
                    )}
                    <p className="mt-2 text-xs text-text-secondary">
                      Based on live quotes where available; otherwise latest saved snapshots.
                    </p>
                  </div>
                  <div className="rounded-lg border border-border-dark bg-bg-card p-4">
                    <h2 className="mb-3 text-lg font-semibold text-text-main">Holding performance</h2>
                    {performance.length ? (
                      <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={performance}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#303A32" />
                          <XAxis dataKey="symbol" stroke="#929B93" />
                          <YAxis stroke="#929B93" />
                          <Tooltip formatter={(value) => currency(value)} />
                          <Legend />
                          <Bar dataKey="cost" name="Cost basis" fill="#D6AD62" />
                          <Bar dataKey="marketValue" name="Current / saved value" fill="#20C982" />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="text-sm text-text-secondary">Performance is unavailable until market-price data exists.</p>
                    )}
                  </div>
                </section>
              </>
            )}

            <section className="overflow-x-auto rounded-lg border border-border-dark bg-bg-card">
              <div className="flex items-center justify-between gap-2 px-4 py-4">
                <h2 className="text-lg font-semibold text-text-main">Recent portfolio transactions</h2>
                <Link to="/transactions" className="text-sm text-primary-emerald hover:underline">View history</Link>
              </div>
              {transactions.length === 0 ? (
                <p className="px-4 pb-4 text-sm text-text-secondary">No portfolio transactions are recorded.</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="text-text-secondary">
                    <tr>
                      {["Stock", "Type", "Quantity", "Price", "Total", "Date"].map((item) => (
                        <th key={item} className="px-4 py-3 font-medium">{item}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-dark">
                    {transactions.slice(0, 10).map((transaction) => (
                      <tr key={transaction.id}>
                        <td className="px-4 py-3 text-text-main">{transaction.name || transaction.symbol} <span className="text-xs text-text-secondary">{transaction.symbol}</span></td>
                        <td className="px-4 py-3 text-text-secondary">{transaction.type}</td>
                        <td className="px-4 py-3 text-text-secondary">{transaction.quantity}</td>
                        <td className="px-4 py-3 text-text-secondary">{currency(transaction.price)}</td>
                        <td className="px-4 py-3 text-text-secondary">{currency(transaction.total)}</td>
                        <td className="px-4 py-3 text-text-secondary">{formatTime(transaction.executed_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </>
        )}
      </div>
    </Layout>
  );
}
