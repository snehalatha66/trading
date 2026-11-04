import React, { useEffect, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Layout from "../components/Layout";
import { invalidateRequestCache, requestJson } from "../utils/api";
import { formatMarketTime, marketDateOnly } from "../utils/marketTime";

function money(value) {
  const parsed = Number(value);
  return value === null || value === undefined || value === "" || !Number.isFinite(parsed)
    ? "Unavailable"
    : `₹${parsed.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function percent(value) {
  const parsed = Number(value);
  return value === null || value === undefined || value === "" || !Number.isFinite(parsed)
    ? "Unavailable"
    : `${parsed >= 0 ? "+" : ""}${parsed.toFixed(2)}%`;
}

function ProviderTime({ value, retrievedAt }) {
  return (
    <p className="mt-2 text-xs text-text-secondary">
      {value
        ? `${marketDateOnly(value) ? "Provider data date" : "Provider timestamp"}: ${formatMarketTime(value)}`
        : "Provider timestamp unavailable"}
      {retrievedAt ? ` · Retrieved ${formatMarketTime(retrievedAt)} IST` : ""}
    </p>
  );
}

function DataCard({ title, state, retrievedAt, emptyMessage }) {
  return (
    <section className="rounded-lg border border-border-dark bg-bg-card p-4">
      <h2 className="mb-3 text-lg font-semibold text-text-main">{title}</h2>
      {state.loading ? (
        <p role="status" className="text-sm text-text-secondary">Loading provider data…</p>
      ) : state.error ? (
        <p role="alert" className="text-sm text-negative">Data unavailable: {state.error}</p>
      ) : state.items.length === 0 ? (
        <p className="text-sm text-text-secondary">{emptyMessage}</p>
      ) : (
        <div className="space-y-2">
          {state.items.slice(0, 10).map((item) => (
            <div key={item.symbol} className="flex items-start justify-between gap-3 border-b border-border-dark py-2 last:border-0">
              <div>
                <p className="text-sm font-medium text-text-main">{item.name || item.symbol}</p>
                <p className="text-xs text-text-secondary">{item.symbol}{item.sector ? ` · ${item.sector}` : ""}</p>
              </div>
              <div className="text-right text-sm">
                <p className="text-text-main">{money(item.price)}</p>
                <p className="text-text-secondary">{percent(item.change_percent)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      {!state.loading && !state.error && state.items[0]?.timestamp && (
        <ProviderTime value={state.items[0].timestamp} retrievedAt={retrievedAt} />
      )}
    </section>
  );
}

export default function MarketsPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [data, setData] = useState({
    index: { items: [], loading: true, error: null },
    history: { items: [], loading: true, error: null },
    sectors: { items: [], loading: true, error: null },
    status: { loading: true, error: null, result: null },
  });
  const [retrievedAt, setRetrievedAt] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const routes = {
      index: "/eodhd/indices",
      history: "/eodhd/indices/NSEI.INDX/history",
      sectors: "/eodhd/sectors",
      status: "/eodhd/status",
    };
    setData((current) => Object.fromEntries(
      Object.entries(current).map(([key]) => [
        key,
        key === "status"
          ? { loading: true, error: null, result: null }
          : { items: [], loading: true, error: null },
      ]),
    ));

    async function load() {
      const results = await Promise.all(Object.entries(routes).map(async ([key, path]) => {
        try {
          const result = await requestJson(path, undefined, { signal: controller.signal });
          if (key === "status") {
            if (!result || typeof result.status !== "string") throw new Error("NSE returned an unexpected market-status response.");
            return [key, { result, loading: false, error: null }];
          }
          if (!Array.isArray(result)) throw new Error("The market-data API returned an unexpected response.");
          return [key, { items: result, loading: false, error: null }];
        } catch (error) {
          if (error.name === "AbortError") return [key, null];
          return [key, key === "status"
            ? { result: null, loading: false, error: error.message }
            : { items: [], loading: false, error: error.message }];
        }
      }));
      if (!active) return;
      setData((current) => {
        const next = { ...current };
        results.forEach(([key, result]) => {
          if (result) next[key] = result;
        });
        return next;
      });
      setRetrievedAt(new Date().toISOString());
    }

    load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [refreshKey]);

  const index = data.index.items[0];
  const status = data.status.result;
  const lineData = data.history.items.map((row) => ({
    ...row,
    dateLabel: marketDateOnly(row.time) ? row.time : formatMarketTime(row.time, { includeTime: false }),
  }));
  const loading = Object.values(data).some((item) => item.loading);

  return (
    <Layout>
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-text-main">Markets</h1>
            <p className="mt-1 text-sm text-text-secondary">
              Verified NSE market status and provider market data. Market hours do not imply that a real-time data feed is available.
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

        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-border-dark bg-bg-card p-4">
            <h2 className="text-sm font-medium uppercase text-text-secondary">NIFTY 50</h2>
            {data.index.loading ? (
              <p role="status" className="mt-2 text-sm text-text-secondary">Loading index data…</p>
            ) : data.index.error ? (
              <p role="alert" className="mt-2 text-sm text-negative">Market data unavailable: {data.index.error}</p>
            ) : index ? (
              <>
                <p className="mt-2 text-3xl font-bold text-text-main">{money(index.value)}</p>
                <p className="mt-1 text-sm text-text-secondary">
                  {index.change === null || index.change === undefined ? "Change unavailable" : `${money(index.change)} (${percent(index.change_percent)})`}
                </p>
                <p className="mt-2 text-xs text-text-secondary">
                  {index.status === "end-of-day"
                    ? "End-of-day data; not a live quote."
                    : "Provider quote; freshness and delay are not independently verified."}
                  {index.realtime_error ? ` Real-time quote unavailable: ${index.realtime_error}` : ""}
                </p>
                <ProviderTime value={index.timestamp} retrievedAt={retrievedAt} />
              </>
            ) : <p className="mt-2 text-sm text-text-secondary">No NIFTY 50 data was returned.</p>}
          </div>
          <div className="rounded-lg border border-border-dark bg-bg-card p-4">
            <h2 className="text-sm font-medium uppercase text-text-secondary">NSE Capital Market</h2>
            {data.status.loading ? (
              <p role="status" className="mt-2 text-sm text-text-secondary">Checking NSE status and holiday calendar…</p>
            ) : data.status.error ? (
              <p role="alert" className="mt-2 text-sm text-negative">Market status unavailable: {data.status.error}</p>
            ) : status?.status === "unavailable" ? (
              <p role="alert" className="mt-2 text-sm text-negative">{status.detail}</p>
            ) : (
              <>
                <p className="mt-2 text-2xl font-semibold text-text-main">{status?.status || "Unavailable"}</p>
                {status?.holiday && <p className="mt-1 text-sm text-text-secondary">Trading holiday: {status.holiday}</p>}
                <p className="mt-2 text-xs text-text-secondary">
                  Pre-open {status?.pre_open_hours}; normal session {status?.regular_trading_hours} (Asia/Kolkata).
                </p>
                <p className="mt-1 text-xs text-text-secondary">
                  Source: {status?.source || "NSE"}{status?.trade_date ? ` · ${status.trade_date}` : ""}
                  {status?.checked_at ? ` · checked ${formatMarketTime(status.checked_at)} IST` : ""}
                </p>
                {status?.holiday_calendar_status === "unavailable" && (
                  <p role="status" className="mt-1 text-xs text-secondary-gold">
                    NSE holiday calendar could not be verified: {status.holiday_calendar_error}
                  </p>
                )}
              </>
            )}
          </div>
        </section>

        <section className="rounded-lg border border-border-dark bg-bg-card p-4">
          <h2 className="mb-3 text-lg font-semibold text-text-main">NIFTY 50 daily history</h2>
          {data.history.loading ? (
            <p role="status" className="text-sm text-text-secondary">Loading historical observations…</p>
          ) : data.history.error ? (
            <p role="alert" className="text-sm text-negative">Historical data unavailable: {data.history.error}</p>
          ) : lineData.length ? (
            <>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={lineData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#303A32" />
                  <XAxis dataKey="dateLabel" minTickGap={30} stroke="#929B93" />
                  <YAxis domain={["auto", "auto"]} stroke="#929B93" />
                  <Tooltip formatter={(value) => money(value)} />
                  <Line type="monotone" dataKey="value" name="Daily close" stroke="#20C982" dot={false} />
                </LineChart>
              </ResponsiveContainer>
              <p className="mt-2 text-xs text-text-secondary">Historical daily observations from EODHD; not an intraday chart.</p>
              <ProviderTime value={lineData[lineData.length - 1].time} retrievedAt={retrievedAt} />
            </>
          ) : <p className="text-sm text-text-secondary">No historical observations were returned.</p>}
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <DataCard title="Sector Performance" state={data.sectors} retrievedAt={retrievedAt} emptyMessage="No verified sector-index performance feed is configured." />
        </section>
      </div>
    </Layout>
  );
}
