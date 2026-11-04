import React, { useEffect, useMemo, useState } from "react";
import Layout from "../components/Layout";
import { useAuth } from "../context/AuthContext";
import { invalidateRequestCache, requestJson } from "../utils/api";
import { formatMarketTime } from "../utils/marketTime";

function amount(value) {
  const parsed = Number(value);
  return value === null || value === undefined || value === "" || !Number.isFinite(parsed)
    ? null
    : parsed;
}

function money(value) {
  const parsed = amount(value);
  return parsed === null ? "Unavailable" : `₹${parsed.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function dateTime(value) {
  if (!value) return "Unavailable";
  return formatMarketTime(value);
}

function providerSymbol(stock) {
  const symbol = String(stock?.symbol || "").toUpperCase();
  const exchange = String(stock?.exchange || "").toUpperCase();
  return symbol && !symbol.includes(".") && exchange ? `${symbol}.${exchange}` : symbol;
}

export default function PaperTradingPage() {
  const { session } = useAuth();
  const [account, setAccount] = useState(null);
  const [holdings, setHoldings] = useState([]);
  const [orders, setOrders] = useState([]);
  const [holdingQuotes, setHoldingQuotes] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [selectedStock, setSelectedStock] = useState(null);
  const [selectedQuote, setSelectedQuote] = useState(null);
  const [quoteError, setQuoteError] = useState(null);
  const [quantity, setQuantity] = useState("");
  const [side, setSide] = useState("buy");
  const [searching, setSearching] = useState(false);
  const [trading, setTrading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);
      if (!session?.access_token) {
        setError("Sign in to use paper trading.");
        setLoading(false);
        return;
      }
      try {
        const [accountResponse, transactionRows] = await Promise.all([
          requestJson("/paper/account", session.access_token, { signal: controller.signal }),
          requestJson("/paper/transactions?limit=100", session.access_token, { signal: controller.signal }),
        ]);
        if (!accountResponse?.account || !Array.isArray(accountResponse.holdings) || !Array.isArray(transactionRows)) {
          throw new Error("The paper-trading API returned an unexpected response.");
        }
        const quoteRows = await Promise.all(accountResponse.holdings.map(async (holding) => {
          const symbol = providerSymbol(holding.stock);
          if (!symbol) return [holding.id, { quote: null, error: "No stock symbol is available." }];
          try {
            const quotes = await requestJson(
              `/eodhd/quotes?symbols=${encodeURIComponent(symbol)}`,
              session.access_token,
              { signal: controller.signal },
            );
            return [holding.id, { quote: Array.isArray(quotes) ? quotes[0] || null : null, error: null }];
          } catch (quoteLoadError) {
            if (quoteLoadError.name === "AbortError") throw quoteLoadError;
            return [holding.id, { quote: null, error: quoteLoadError.message }];
          }
        }));
        const accountOrders = transactionRows.map((row) => ({
          ...row,
          status: "filled",
          placed_at: row.executed_at || row.placed_at,
        }));
        if (active) {
          setAccount(accountResponse.account);
          setHoldings(accountResponse.holdings);
          setOrders(accountOrders);
          setHoldingQuotes(Object.fromEntries(quoteRows));
        }
      } catch (loadError) {
        if (active && loadError.name !== "AbortError") {
          setError(loadError.message);
          setAccount(null);
          setHoldings([]);
          setOrders([]);
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

  useEffect(() => {
    if (!selectedStock || !session?.access_token) {
      setSelectedQuote(null);
      setQuoteError(null);
      return undefined;
    }
    const controller = new AbortController();
    let active = true;
    async function loadQuote() {
      setSelectedQuote(null);
      setQuoteError(null);
      try {
        const quotes = await requestJson(
          `/eodhd/quotes?symbols=${encodeURIComponent(providerSymbol(selectedStock))}`,
          session.access_token,
          { signal: controller.signal },
        );
        const quote = Array.isArray(quotes) ? quotes[0] || null : null;
        if (!quote || amount(quote.price) === null) throw new Error("No valid live price was returned.");
        if (active) setSelectedQuote(quote);
      } catch (loadError) {
        if (active && loadError.name !== "AbortError") setQuoteError(loadError.message);
      }
    }
    loadQuote();
    return () => {
      active = false;
      controller.abort();
    };
  }, [selectedStock, session?.access_token]);

  const cash = amount(account?.cash_balance);
  const initialBalance = amount(account?.initial_balance);
  const realizedPnl = orders.reduce((sum, order) => sum + (amount(order.realized_pnl) || 0), 0);
  const pricedHoldings = holdings.map((holding) => {
    const livePrice = amount(holdingQuotes[holding.id]?.quote?.price);
    const snapshotPrice = amount(holding.snapshot?.price);
    return {
      ...holding,
      livePrice,
      snapshotPrice,
      currentPrice: livePrice ?? snapshotPrice,
    };
  });
  const hasAllLivePrices = pricedHoldings.every((holding) => holding.livePrice !== null);
  const liveMarketValue = hasAllLivePrices
    ? pricedHoldings.reduce((sum, holding) => sum + Number(holding.quantity) * holding.livePrice, 0)
    : null;
  const snapshotMarketValue = pricedHoldings.every((holding) => holding.snapshotPrice !== null)
    ? pricedHoldings.reduce((sum, holding) => sum + Number(holding.quantity) * holding.snapshotPrice, 0)
    : null;
  const unrealizedPnl = hasAllLivePrices
    ? pricedHoldings.reduce(
      (sum, holding) => sum + (holding.livePrice - Number(holding.avg_price)) * Number(holding.quantity),
      0,
    )
    : null;
  const currentPortfolioValue = cash !== null && liveMarketValue !== null ? cash + liveMarketValue : null;
  const searchMatches = useMemo(() => new Set(holdings.map((holding) => holding.stock_id)), [holdings]);

  async function searchStocks(event) {
    event.preventDefault();
    const term = query.trim();
    setActionError(null);
    if (!term) {
      setActionError("Enter a company name or stock symbol.");
      return;
    }
    setSearching(true);
    try {
      const results = await requestJson(`/stocks?q=${encodeURIComponent(term)}&limit=10`, session?.access_token);
      if (!Array.isArray(results)) throw new Error("The stock search returned an unexpected response.");
      setSearchResults(results);
      if (!results.length) setActionError("No matching stocks were found.");
    } catch (searchError) {
      setActionError(searchError.message);
    } finally {
      setSearching(false);
    }
  }

  async function executeTrade(event) {
    event.preventDefault();
    setActionError(null);
    setSuccess(null);
    const parsedQuantity = amount(quantity);
    if (!selectedStock) {
      setActionError("Search for and select a stock first.");
      return;
    }
    if (parsedQuantity === null || parsedQuantity <= 0) {
      setActionError("Enter a quantity greater than zero.");
      return;
    }
    if (!selectedQuote || amount(selectedQuote.price) === null) {
      setActionError("A valid live market price is required. No order was placed.");
      return;
    }
    if (side === "sell") {
      const holding = holdings.find((item) => item.stock_id === selectedStock.id);
      if (!holding || Number(holding.quantity) < parsedQuantity) {
        setActionError("You do not have enough virtual shares to sell that quantity.");
        return;
      }
    }
    setTrading(true);
    try {
      await requestJson("/paper/trades", session?.access_token, {
        method: "POST",
        body: { stock_id: selectedStock.id, side, quantity: parsedQuantity },
      });
      setSuccess(`Paper ${side} order filled using the server-verified market price.`);
      setQuantity("");
      setRefreshKey((key) => key + 1);
    } catch (tradeError) {
      setActionError(tradeError.message);
    } finally {
      setTrading(false);
    }
  }

  return (
    <Layout>
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-text-main">Paper Trading</h1>
            <p className="mt-1 text-sm text-text-secondary">
              Simulated trades only. No broker orders are placed. New accounts start with ₹10,00,000 virtual cash.
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

        {loading && <p role="status" className="text-sm text-text-secondary">Loading paper account…</p>}
        {!loading && error && (
          <p role="alert" className="rounded-md border border-negative/40 bg-negative/10 p-3 text-sm text-negative">
            Could not load paper trading: {error}
          </p>
        )}
        {!loading && !error && account && (
          <>
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {[
                ["Virtual starting balance", money(initialBalance)],
                ["Available virtual cash", money(cash)],
                ["Portfolio value", currentPortfolioValue === null ? "Unavailable without live prices" : money(currentPortfolioValue)],
                ["Realized P/L", money(realizedPnl)],
                ["Unrealized P/L", unrealizedPnl === null ? "Unavailable without live prices" : money(unrealizedPnl)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-border-dark bg-bg-card p-4">
                  <p className="text-sm text-text-secondary">{label}</p>
                  <p className="mt-2 text-lg font-semibold text-text-main">{value}</p>
                </div>
              ))}
            </section>

            {pricedHoldings.some((holding) => holding.livePrice === null) && holdings.length > 0 && (
              <p role="status" className="rounded-md border border-secondary-gold/30 bg-secondary-gold/10 p-3 text-sm text-text-secondary">
                Live quotes are unavailable for one or more holdings. Saved snapshots are shown separately below; trades are disabled unless a real provider quote is available.
                {snapshotMarketValue !== null && ` Snapshot-based holdings value: ${money(snapshotMarketValue)}.`}
              </p>
            )}

            <section className="grid gap-5 lg:grid-cols-2">
              <div className="space-y-4 rounded-lg border border-border-dark bg-bg-card p-4">
                <h2 className="text-lg font-semibold text-text-main">Place a simulated trade</h2>
                <form onSubmit={searchStocks} className="flex gap-2">
                  <input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search stocks"
                    placeholder="Search company or symbol" className="min-w-0 flex-1 rounded-md border border-border-dark bg-bg-surface px-3 py-2 text-sm text-text-main" />
                  <button disabled={searching} className="rounded-md bg-primary-emerald px-4 py-2 text-sm text-white disabled:opacity-60">
                    {searching ? "Searching…" : "Search"}
                  </button>
                </form>
                {searchResults.length > 0 && (
                  <ul className="max-h-48 divide-y divide-border-dark overflow-y-auto rounded-md border border-border-dark">
                    {searchResults.map((stock) => (
                      <li key={stock.id} className="flex items-center justify-between gap-2 p-3">
                        <div>
                          <p className="text-sm text-text-main">{stock.name}</p>
                          <p className="text-xs text-text-secondary">{stock.symbol} · {stock.exchange || "Exchange unavailable"}</p>
                        </div>
                        <button type="button" onClick={() => {
                          setSelectedStock(stock);
                          setSide(searchMatches.has(stock.id) ? "sell" : "buy");
                          setSearchResults([]);
                        }} className="rounded border border-border-dark px-3 py-1 text-xs text-text-main">
                          Select
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {selectedStock && (
                  <div className="rounded-md bg-bg-surface p-3 text-sm">
                    <p className="font-medium text-text-main">{selectedStock.name} ({selectedStock.symbol})</p>
                    <p className="mt-1 text-text-secondary">
                      {selectedQuote ? `Provider price: ${money(selectedQuote.price)} · ${dateTime(selectedQuote.timestamp)}` : "Waiting for a provider quote…"}
                    </p>
                    {quoteError && <p role="alert" className="mt-1 text-negative">Live quote unavailable: {quoteError}</p>}
                  </div>
                )}
                <form onSubmit={executeTrade} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                  <label className="space-y-1 text-xs text-text-secondary">
                    Side
                    <select value={side} onChange={(event) => setSide(event.target.value)}
                      className="block w-full rounded-md border border-border-dark bg-bg-surface px-3 py-2 text-sm text-text-main">
                      <option value="buy">Buy</option>
                      <option value="sell">Sell</option>
                    </select>
                  </label>
                  <label className="space-y-1 text-xs text-text-secondary">
                    Quantity
                    <input type="number" min="0.000001" step="any" value={quantity} onChange={(event) => setQuantity(event.target.value)}
                      className="block w-full rounded-md border border-border-dark bg-bg-surface px-3 py-2 text-sm text-text-main" />
                  </label>
                  <button type="submit" disabled={trading || loading || !selectedQuote || !selectedStock}
                    className="self-end rounded-md bg-primary-emerald px-4 py-2 text-sm text-white disabled:opacity-50">
                    {trading ? "Placing…" : `${side === "buy" ? "Buy" : "Sell"} virtually`}
                  </button>
                </form>
                {actionError && <p role="alert" className="text-sm text-negative">{actionError}</p>}
                {success && <p role="status" className="text-sm text-positive">{success}</p>}
              </div>

              <div className="overflow-x-auto rounded-lg border border-border-dark bg-bg-card p-4">
                <h2 className="mb-3 text-lg font-semibold text-text-main">Paper holdings</h2>
                {holdings.length === 0 ? (
                  <p className="text-sm text-text-secondary">No paper holdings yet. Search for a stock and place a simulated buy when a live quote is available.</p>
                ) : (
                  <table className="w-full text-left text-sm">
                    <thead className="text-text-secondary"><tr>
                      {["Stock", "Quantity", "Average price", "Live price", "Unrealized P/L"].map((item) => <th key={item} className="px-2 py-2 font-medium">{item}</th>)}
                    </tr></thead>
                    <tbody className="divide-y divide-border-dark">
                      {pricedHoldings.map((holding) => {
                        const pnl = holding.livePrice === null ? null : (holding.livePrice - Number(holding.avg_price)) * Number(holding.quantity);
                        return (
                          <tr key={holding.id}>
                            <td className="px-2 py-3 text-text-main">{holding.stock?.symbol || "Unknown"}</td>
                            <td className="px-2 py-3 text-text-secondary">{holding.quantity}</td>
                            <td className="px-2 py-3 text-text-secondary">{money(holding.avg_price)}</td>
                            <td className="px-2 py-3 text-text-secondary">
                              {holding.livePrice === null ? "Unavailable" : money(holding.livePrice)}
                              {holding.livePrice === null && holding.snapshotPrice !== null && ` (snapshot ${money(holding.snapshotPrice)} · ${dateTime(holding.snapshot?.snapshot_at)})`}
                            </td>
                            <td className={`px-2 py-3 ${pnl === null ? "text-text-secondary" : pnl >= 0 ? "text-positive" : "text-negative"}`}>
                              {pnl === null ? "Unavailable" : money(pnl)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </section>

            <section className="overflow-x-auto rounded-lg border border-border-dark bg-bg-card p-4">
              <h2 className="mb-3 text-lg font-semibold text-text-main">Paper order history</h2>
              {orders.length === 0 ? (
                <p className="text-sm text-text-secondary">No paper orders have been filled.</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="text-text-secondary"><tr>
                    {["Stock", "Side", "Quantity", "Price", "Total", "Realized P/L", "Executed"].map((item) => <th key={item} className="px-3 py-2 font-medium">{item}</th>)}
                  </tr></thead>
                  <tbody className="divide-y divide-border-dark">
                    {orders.map((order) => (
                      <tr key={order.id}>
                        <td className="px-3 py-3 text-text-main">{order.symbol || order.stock_id}</td>
                        <td className="px-3 py-3 text-text-secondary">{order.type || order.side}</td>
                        <td className="px-3 py-3 text-text-secondary">{order.quantity}</td>
                        <td className="px-3 py-3 text-text-secondary">{money(order.price)}</td>
                        <td className="px-3 py-3 text-text-secondary">{money(order.total)}</td>
                        <td className="px-3 py-3 text-text-secondary">{money(order.realized_pnl)}</td>
                        <td className="px-3 py-3 text-text-secondary">{dateTime(order.executed_at)}</td>
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
