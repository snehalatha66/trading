import React, { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { useAuth } from "../context/AuthContext";
import { invalidateRequestCache, requestJson } from "../utils/api";
import { formatMarketTime } from "../utils/marketTime";

function money(value) {
  const parsed = Number(value);
  return value === null || value === undefined || value === "" || !Number.isFinite(parsed)
    ? "Unavailable"
    : `₹${parsed.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function dateTime(value) {
  if (!value) return "Not checked";
  return formatMarketTime(value);
}

function providerSymbol(stock) {
  const symbol = String(stock?.symbol || "").toUpperCase();
  const exchange = String(stock?.exchange || "").toUpperCase();
  return symbol && !symbol.includes(".") && exchange ? `${symbol}.${exchange}` : symbol;
}

export default function PriceAlertsPage() {
  const { session } = useAuth();
  const [alerts, setAlerts] = useState([]);
  const [alertStatus, setAlertStatus] = useState(null);
  const [statusError, setStatusError] = useState(null);
  const [currentQuotes, setCurrentQuotes] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedStock, setSelectedStock] = useState(null);
  const [condition, setCondition] = useState("above");
  const [targetPrice, setTargetPrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState({});

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      if (!session?.access_token) {
        setAlerts([]);
        setError("Sign in to manage price alerts.");
        setLoading(false);
        return;
      }
      try {
        const data = await requestJson("/alerts/", session.access_token, { signal: controller.signal });
        if (!Array.isArray(data)) throw new Error("The alerts API returned an unexpected response.");
        const [statusResult, quoteEntries] = await Promise.all([
          requestJson("/alerts/status", session.access_token, { signal: controller.signal })
            .then((statusData) => ({ data: statusData, error: null }))
            .catch((statusLoadError) => {
              if (statusLoadError.name === "AbortError") throw statusLoadError;
              return { data: null, error: statusLoadError.message };
            }),
          Promise.all(data.map(async (alert) => {
          const symbol = providerSymbol(alert.stock);
          if (!symbol) return [alert.id, { quote: null, error: "Stock symbol unavailable." }];
          try {
            const quotes = await requestJson(
              `/eodhd/quotes?symbols=${encodeURIComponent(symbol)}`,
              session.access_token,
              { signal: controller.signal },
            );
            return [alert.id, { quote: Array.isArray(quotes) ? quotes[0] || null : null, error: null }];
          } catch (quoteError) {
            if (quoteError.name === "AbortError") throw quoteError;
            return [alert.id, { quote: null, error: quoteError.message }];
          }
          })),
        ]);
        if (active) {
          setAlerts(data);
          setCurrentQuotes(Object.fromEntries(quoteEntries));
          setAlertStatus(statusResult.data);
          setStatusError(statusResult.error);
        }
      } catch (loadError) {
        if (active && loadError.name !== "AbortError") {
          setError(loadError.message);
          setAlerts([]);
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

  async function searchStocks(event) {
    event.preventDefault();
    setActionError(null);
    if (!query.trim()) {
      setActionError("Enter a company name or stock symbol.");
      return;
    }
    setSearching(true);
    try {
      const data = await requestJson(`/stocks?q=${encodeURIComponent(query.trim())}&limit=10`, session?.access_token);
      if (!Array.isArray(data)) throw new Error("The stock search returned an unexpected response.");
      setResults(data);
      if (!data.length) setActionError("No matching stocks were found.");
    } catch (searchError) {
      setActionError(searchError.message);
    } finally {
      setSearching(false);
    }
  }

  async function createAlert(event) {
    event.preventDefault();
    setActionError(null);
    const target = Number(targetPrice);
    if (!selectedStock) {
      setActionError("Search for and select a stock first.");
      return;
    }
    if (!Number.isFinite(target) || target <= 0) {
      setActionError("Enter a target price greater than zero.");
      return;
    }
    setSaving(true);
    try {
      await requestJson("/alerts/", session?.access_token, {
        method: "POST",
        body: { stock_id: selectedStock.id, condition, target_price: target },
      });
      setSelectedStock(null);
      setTargetPrice("");
      setQuery("");
      setResults([]);
      setRefreshKey((key) => key + 1);
    } catch (saveError) {
      setActionError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  async function updateAlert(alert, changes) {
    setActionError(null);
    setSaving(true);
    try {
      await requestJson(`/alerts/${encodeURIComponent(alert.id)}`, session?.access_token, {
        method: "PATCH",
        body: changes,
      });
      setEditing((current) => {
        const next = { ...current };
        delete next[alert.id];
        return next;
      });
      setRefreshKey((key) => key + 1);
    } catch (updateError) {
      setActionError(updateError.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteAlert(alert) {
    if (!window.confirm(`Delete the ${alert.stock?.symbol || "stock"} price alert?`)) return;
    setActionError(null);
    setSaving(true);
    try {
      await requestJson(`/alerts/${encodeURIComponent(alert.id)}`, session?.access_token, { method: "DELETE" });
      setAlerts((current) => current.filter((item) => item.id !== alert.id));
    } catch (deleteError) {
      setActionError(deleteError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Layout>
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-text-main">Price Alerts</h1>
            <p className="mt-1 text-sm text-text-secondary">
              Alerts are monitored by the backend when provider access and scheduler configuration are available. Triggering an alert updates its status; no notification delivery is configured.
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
        {loading && <p role="status" className="text-sm text-text-secondary">Loading alerts…</p>}
        {!loading && error && (
          <p role="alert" className="rounded-md border border-negative/40 bg-negative/10 p-3 text-sm text-negative">
            Could not load alerts: {error}. Confirm the Supabase alert migration has been applied.
            <button type="button" onClick={() => {
              invalidateRequestCache();
              setRefreshKey((key) => key + 1);
            }}
              className="ml-3 underline">Retry</button>
          </p>
        )}
        {!loading && !error && (
          <>
            <section className="space-y-3 rounded-lg border border-border-dark bg-bg-card p-4">
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  ["Active", alertStatus?.counts?.active],
                  ["Triggered", alertStatus?.counts?.triggered],
                  ["Paused", alertStatus?.counts?.paused],
                ].map(([label, count]) => (
                  <div key={label} className="rounded-md bg-bg-surface p-3">
                    <p className="text-xs text-text-secondary">{label} alerts</p>
                    <p className="mt-1 text-lg font-semibold text-text-main">
                      {Number.isInteger(count) ? count : "Unavailable"}
                    </p>
                  </div>
                ))}
              </div>
              {statusError && (
                <p role="alert" className="text-sm text-negative">
                  Could not load alert monitoring status: {statusError}
                </p>
              )}
              {alertStatus && (
                <>
                  <p className="text-xs text-text-secondary">
                    Price monitoring {alertStatus.monitoring_configured ? "is configured on the backend." : "is unavailable until EODHD and Supabase service-role settings are configured."}
                    {" "}Notification delivery {alertStatus.notifications_configured ? "is configured." : "is not configured."}
                  </p>
                  {alertStatus.triggered?.length > 0 && (
                    <div className="space-y-1">
                      <h2 className="text-sm font-semibold text-text-main">Triggered alerts</h2>
                      {alertStatus.triggered.map((alert) => (
                        <p key={alert.id} className="text-sm text-text-secondary">
                          {alert.stock?.name || alert.stock?.symbol || "Stock"} reached {money(alert.current_price)} against {money(alert.target_price)} ({dateTime(alert.triggered_at)}).
                        </p>
                      ))}
                    </div>
                  )}
                </>
              )}
            </section>
            <section className="space-y-4 rounded-lg border border-border-dark bg-bg-card p-4">
              <h2 className="text-lg font-semibold text-text-main">Create a price alert</h2>
              <form onSubmit={searchStocks} className="flex gap-2">
                <input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search stocks"
                  placeholder="Search company or symbol" className="min-w-0 flex-1 rounded-md border border-border-dark bg-bg-surface px-3 py-2 text-sm text-text-main" />
                <button disabled={searching} className="rounded-md bg-primary-emerald px-4 py-2 text-sm text-white disabled:opacity-60">
                  {searching ? "Searching…" : "Search"}
                </button>
              </form>
              {results.length > 0 && (
                <ul className="max-h-44 divide-y divide-border-dark overflow-y-auto rounded-md border border-border-dark">
                  {results.map((stock) => (
                    <li key={stock.id} className="flex items-center justify-between gap-2 p-3">
                      <span className="text-sm text-text-main">{stock.name} <span className="text-text-secondary">{stock.symbol}</span></span>
                      <button type="button" onClick={() => { setSelectedStock(stock); setResults([]); }}
                        className="rounded border border-border-dark px-3 py-1 text-xs text-text-main">Select</button>
                    </li>
                  ))}
                </ul>
              )}
              {selectedStock && (
                <form onSubmit={createAlert} className="grid items-end gap-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
                  <p className="text-sm text-text-main">{selectedStock.name} ({selectedStock.symbol})</p>
                  <label className="space-y-1 text-xs text-text-secondary">Condition
                    <select value={condition} onChange={(event) => setCondition(event.target.value)}
                      className="block w-full rounded-md border border-border-dark bg-bg-surface px-3 py-2 text-sm text-text-main">
                      <option value="above">Price rises to/above</option>
                      <option value="below">Price falls to/below</option>
                    </select>
                  </label>
                  <label className="space-y-1 text-xs text-text-secondary">Target price
                    <input type="number" min="0.01" step="any" value={targetPrice} onChange={(event) => setTargetPrice(event.target.value)}
                      className="block w-full rounded-md border border-border-dark bg-bg-surface px-3 py-2 text-sm text-text-main" />
                  </label>
                  <button disabled={saving} className="rounded-md bg-primary-emerald px-4 py-2 text-sm text-white disabled:opacity-60">
                    {saving ? "Saving…" : "Create"}
                  </button>
                </form>
              )}
              {actionError && <p role="alert" className="text-sm text-negative">{actionError}</p>}
            </section>

            <section className="overflow-x-auto rounded-lg border border-border-dark bg-bg-card">
              <h2 className="px-4 pt-4 text-lg font-semibold text-text-main">Your alerts</h2>
              {alerts.length === 0 ? (
                <p className="p-4 text-sm text-text-secondary">No price alerts have been created.</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="text-text-secondary"><tr>
                    {["Stock", "Current price", "Target", "Condition", "Status", "Last checked", "Actions"].map((item) => <th key={item} className="px-4 py-3 font-medium">{item}</th>)}
                  </tr></thead>
                  <tbody className="divide-y divide-border-dark">
                    {alerts.map((alert) => {
                      const draft = editing[alert.id] || { target_price: alert.target_price, condition: alert.condition };
                      const live = currentQuotes[alert.id]?.quote;
                      return (
                        <tr key={alert.id}>
                          <td className="px-4 py-3 text-text-main">{alert.stock?.name || "Unknown"} <span className="text-xs text-text-secondary">{alert.stock?.symbol}</span></td>
                          <td className="px-4 py-3 text-text-secondary">
                            {live ? money(live.price) : money(alert.current_price)}
                            <span className="block text-xs">{live ? dateTime(live.timestamp) : `Saved · ${dateTime(alert.last_checked_at)}`}</span>
                            {!live && currentQuotes[alert.id]?.error && <span className="block max-w-48 text-xs text-negative">Provider unavailable: {currentQuotes[alert.id].error}</span>}
                          </td>
                          <td className="px-4 py-3 text-text-secondary">
                            <input aria-label={`Target price for ${alert.stock?.symbol}`} type="number" min="0.01" step="any"
                              value={draft.target_price} onChange={(event) => setEditing((current) => ({
                                ...current, [alert.id]: { ...draft, target_price: event.target.value },
                              }))} className="w-28 rounded border border-border-dark bg-bg-surface px-2 py-1 text-text-main" />
                          </td>
                          <td className="px-4 py-3 text-text-secondary">
                            <select aria-label={`Condition for ${alert.stock?.symbol}`} value={draft.condition}
                              onChange={(event) => setEditing((current) => ({
                                ...current, [alert.id]: { ...draft, condition: event.target.value },
                              }))} className="rounded border border-border-dark bg-bg-surface px-2 py-1 text-text-main">
                              <option value="above">Above</option><option value="below">Below</option>
                            </select>
                          </td>
                          <td className="px-4 py-3 text-text-secondary">{alert.status}</td>
                          <td className="px-4 py-3 text-xs text-text-secondary">{dateTime(alert.last_checked_at)}</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-2">
                              <button type="button" disabled={saving} onClick={() => updateAlert(alert, {
                                ...draft,
                                target_price: Number(draft.target_price),
                              })} className="text-xs text-primary-emerald disabled:opacity-50">Save</button>
                              {alert.status !== "triggered" && (
                                <button type="button" disabled={saving} onClick={() => updateAlert(alert, {
                                  status: alert.status === "active" ? "paused" : "active",
                                })} className="text-xs text-text-secondary disabled:opacity-50">
                                  {alert.status === "active" ? "Pause" : "Resume"}
                                </button>
                              )}
                              <button type="button" disabled={saving} onClick={() => deleteAlert(alert)}
                                className="text-xs text-negative disabled:opacity-50">Delete</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
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
