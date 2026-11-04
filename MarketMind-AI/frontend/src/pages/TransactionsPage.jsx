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
  if (!value) return "Unavailable";
  return formatMarketTime(value);
}

function csvCell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadCsv(rows) {
  const columns = [
    ["scope", "Account"],
    ["name", "Stock name"],
    ["symbol", "Symbol"],
    ["type", "Type"],
    ["quantity", "Quantity"],
    ["price", "Price"],
    ["total", "Total"],
    ["executed_at", "Date/time"],
  ];
  const content = [
    columns.map(([, title]) => csvCell(title)).join(","),
    ...rows.map((row) => columns.map(([key]) => csvCell(row[key])).join(",")),
  ].join("\r\n");
  const blob = new Blob([`\uFEFF${content}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "marketmind-transactions.csv";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function TransactionsPage() {
  const { session } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState([]);
  const [scope, setScope] = useState("all");
  const [stock, setStock] = useState("");
  const [type, setType] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    async function load() {
      setLoading(true);
      setErrors([]);
      if (!session?.access_token) {
        setTransactions([]);
        setErrors([{ scope, message: "Sign in to view transaction history." }]);
        setLoading(false);
        return;
      }
      try {
        const scopes = scope === "all" ? ["portfolio", "paper"] : [scope];
        const responses = await Promise.all(scopes.map(async (requestedScope) => {
          const params = new URLSearchParams({ scope: requestedScope, limit: "1000" });
          if (stock.trim()) params.set("stock", stock.trim());
          if (type) params.set("type", type);
          if (dateFrom) params.set("date_from", new Date(`${dateFrom}T00:00:00`).toISOString());
          if (dateTo) params.set("date_to", new Date(`${dateTo}T23:59:59.999`).toISOString());
          try {
            const data = await requestJson(
              `/transactions?${params.toString()}`,
              session.access_token,
              { signal: controller.signal },
            );
            if (!Array.isArray(data)) {
              throw new Error("The transactions API returned an unexpected response.");
            }
            return { scope: requestedScope, data };
          } catch (requestError) {
            if (requestError.name === "AbortError") throw requestError;
            return { scope: requestedScope, error: requestError.message };
          }
        }));
        if (active) {
          const records = responses.flatMap((response) => response.data || []);
          records.sort((left, right) => (
            (right.executed_at || "").localeCompare(left.executed_at || "")
          ));
          setTransactions(records);
          setErrors(responses
            .filter((response) => response.error)
            .map(({ scope: failedScope, error: message }) => ({
              scope: failedScope,
              message,
            })));
        }
      } catch (loadError) {
        if (active && loadError.name !== "AbortError") {
          setTransactions([]);
          setErrors([{ scope, message: loadError.message }]);
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
  }, [session?.access_token, scope, stock, type, dateFrom, dateTo, refreshKey]);

  return (
    <Layout>
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-text-main">Transaction History</h1>
            <p className="mt-1 text-sm text-text-secondary">Portfolio and simulated paper trades are separated and sourced from your Supabase records.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" disabled={loading} onClick={() => {
              invalidateRequestCache();
              setRefreshKey((key) => key + 1);
            }}
              className="rounded-md border border-border-dark px-4 py-2 text-sm text-text-main disabled:opacity-50">Refresh</button>
            <button type="button" disabled={loading || transactions.length === 0} onClick={() => downloadCsv(transactions)}
              className="rounded-md bg-primary-emerald px-4 py-2 text-sm text-white disabled:opacity-50">Export CSV</button>
          </div>
        </header>

        <section className="grid gap-3 rounded-lg border border-border-dark bg-bg-card p-4 sm:grid-cols-2 lg:grid-cols-5">
          <label className="space-y-1 text-xs text-text-secondary">Account
            <select value={scope} onChange={(event) => setScope(event.target.value)}
              className="block w-full rounded-md border border-border-dark bg-bg-surface px-3 py-2 text-sm text-text-main">
              <option value="all">All transactions</option>
              <option value="portfolio">Portfolio</option>
              <option value="paper">Paper trading</option>
            </select>
          </label>
          <label className="space-y-1 text-xs text-text-secondary">Stock name or symbol
            <input value={stock} onChange={(event) => setStock(event.target.value)} placeholder="Filter"
              className="block w-full rounded-md border border-border-dark bg-bg-surface px-3 py-2 text-sm text-text-main" />
          </label>
          <label className="space-y-1 text-xs text-text-secondary">Buy / Sell
            <select value={type} onChange={(event) => setType(event.target.value)}
              className="block w-full rounded-md border border-border-dark bg-bg-surface px-3 py-2 text-sm text-text-main">
              <option value="">All types</option>
              <option value="buy">Buy</option>
              <option value="sell">Sell</option>
            </select>
          </label>
          <label className="space-y-1 text-xs text-text-secondary">From
            <input type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => setDateFrom(event.target.value)}
              className="block w-full rounded-md border border-border-dark bg-bg-surface px-3 py-2 text-sm text-text-main" />
          </label>
          <label className="space-y-1 text-xs text-text-secondary">To
            <input type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)}
              className="block w-full rounded-md border border-border-dark bg-bg-surface px-3 py-2 text-sm text-text-main" />
          </label>
        </section>

        {loading && <p role="status" className="text-sm text-text-secondary">Loading transactions…</p>}
        {!loading && errors.map((item) => (
          <p key={item.scope} role="alert" className="rounded-md border border-negative/40 bg-negative/10 p-3 text-sm text-negative">
            Could not load {item.scope === "paper" ? "paper trading" : "portfolio"} transactions: {item.message}
          </p>
        ))}
        {!loading && !errors.length && transactions.length === 0 && (
          <section className="rounded-lg border border-border-dark bg-bg-card p-5 text-sm text-text-secondary">
            No transactions match the selected filters.
          </section>
        )}
        {!loading && transactions.length > 0 && (
          <section className="overflow-x-auto rounded-lg border border-border-dark bg-bg-card">
            <table className="w-full text-left text-sm">
              <thead className="text-text-secondary"><tr>
                {["Account", "Stock", "Symbol", "Type", "Quantity", "Price", "Total", "Date/time"].map((item) => <th key={item} className="px-4 py-3 font-medium">{item}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-border-dark">
                {transactions.map((transaction) => (
                  <tr key={`${transaction.scope}-${transaction.id}`}>
                    <td className="px-4 py-3 capitalize text-text-secondary">{transaction.scope === "paper" ? "Paper trading" : "Portfolio"}</td>
                    <td className="px-4 py-3 text-text-main">{transaction.name || "Unknown"}</td>
                    <td className="px-4 py-3 text-text-secondary">{transaction.symbol || "Unavailable"}</td>
                    <td className="px-4 py-3 capitalize text-text-secondary">{transaction.type || transaction.side}</td>
                    <td className="px-4 py-3 text-text-secondary">{transaction.quantity}</td>
                    <td className="px-4 py-3 text-text-secondary">{money(transaction.price)}</td>
                    <td className="px-4 py-3 text-text-secondary">{money(transaction.total)}</td>
                    <td className="px-4 py-3 text-text-secondary">{dateTime(transaction.executed_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </Layout>
  );
}
