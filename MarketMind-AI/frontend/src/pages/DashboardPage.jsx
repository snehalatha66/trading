import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import Layout from "../components/Layout";
import {
  BarChart as ReBarChart,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Bar,
} from "recharts";
import { invalidateRequestCache, requestJson } from "../utils/api";
import { formatMarketTime, marketDateOnly } from "../utils/marketTime";

const NIFTY_50 = "NSEI.INDX";

function providerTimestamp(value) {
  if (value === null || value === undefined || value === "") return null;
  return formatMarketTime(value);
}

function currency(value) {
  if (value === null || value === undefined || value === "") return "Unavailable";
  const number = Number(value);
  return Number.isFinite(number)
    ? `₹${number.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
    : "Unavailable";
}

function percent(value) {
  if (value === null || value === undefined || value === "") return "Unavailable";
  const number = Number(value);
  if (!Number.isFinite(number)) return "Unavailable";
  return `${number > 0 ? "+" : ""}${number.toFixed(2)}%`;
}

function numericValue(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function LastUpdated({ timestamp, fetchedAt }) {
  const providerTime = providerTimestamp(timestamp);
  return (
    <p className="mt-2 text-xs text-text-secondary">
      {providerTime
        ? `${marketDateOnly(timestamp) ? "Provider data date" : "Provider timestamp"}: ${providerTime}`
        : "Provider timestamp unavailable"}
      {fetchedAt ? ` • Retrieved ${formatMarketTime(fetchedAt)} IST` : ""}
    </p>
  );
}

function IndexCard({ index, fetchedAt }) {
  const change = numericValue(index.change);
  const changePercent = numericValue(index.change_percent);
  const positive = change !== null && change >= 0;
  return (
    <div className="bg-bg-card rounded-lg p-4 shadow border border-border-dark">
      <h3 className="text-sm font-medium text-text-secondary uppercase">{index.name}</h3>
      <p className="mt-1 text-2xl font-bold text-text-main">{currency(index.value)}</p>
      <p className={`mt-1 text-sm ${positive ? "text-positive" : "text-negative"}`}>
        {change !== null ? `${change >= 0 ? "+" : "-"}${currency(Math.abs(change))}` : "Change unavailable"}
        {changePercent !== null ? ` (${percent(changePercent)})` : ""}
      </p>
      <p className="text-xs text-text-secondary mt-1">
        {index.status === "provider_quote"
          ? "Provider quote; freshness and delay are not independently verified"
          : index.status}
      </p>
      <LastUpdated timestamp={index.timestamp} fetchedAt={fetchedAt} />
    </div>
  );
}

function DashboardHeader({ user, marketStatus, onRefresh, refreshing }) {
  const now = new Date();
  const hour = Number(new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Kolkata",
  }).format(now));
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const today = new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(now);
  const statusText = marketStatus.status === "unavailable"
    ? `NSE status unavailable: ${marketStatus.detail || "No verified status was returned."}`
    : marketStatus.status === "checking"
      ? marketStatus.detail
      : `NSE market ${marketStatus.status}`;
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-text-main">
          {greeting}, {user?.email?.split("@")[0] || "Trader"}
        </h1>
        <p className="text-text-secondary">{today} • {statusText}
          {marketStatus.trade_date ? ` • ${marketStatus.trade_date}` : ""}
          {marketStatus.holiday ? ` • NSE holiday: ${marketStatus.holiday}` : ""}
          {marketStatus.checked_at ? ` • Checked ${formatMarketTime(marketStatus.checked_at)} IST` : ""}
        </p>
        {marketStatus.regular_trading_hours && (
          <p className="mt-1 text-xs text-text-secondary">
            NSE Capital Market hours: pre-open {marketStatus.pre_open_hours}; normal session {marketStatus.regular_trading_hours}.
            {marketStatus.holiday_calendar_status === "unavailable" && ` Holiday calendar unavailable: ${marketStatus.holiday_calendar_error}`}
          </p>
        )}
      </div>
      <button
        className="flex items-center gap-2 px-3 py-1 bg-bg-surface text-text-main rounded hover:bg-bg-surface/80 transition-colors disabled:opacity-60"
        onClick={onRefresh}
        disabled={refreshing}
      >
        {refreshing ? "Refreshing…" : "Refresh"}
      </button>
    </div>
  );
}

export default function DashboardPage() {
  const { session } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [marketStatus, setMarketStatus] = useState({
    status: "unavailable",
    detail: "NSE market status has not been checked.",
  });
  const [indices, setIndices] = useState({ items: [], loading: true, error: null, fetchedAt: null });
  const [chart, setChart] = useState({ items: [], loading: true, error: null, fetchedAt: null });
  const [marketSync, setMarketSync] = useState({ error: null, result: null });

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const update = (setter, value) => {
      if (active) setter(value);
    };
    const loadSection = async (path, setter, selectItems = (data) => data) => {
      update(setter, { items: [], loading: true, error: null, fetchedAt: null });
      try {
        const data = await requestJson(path, session?.access_token, { signal: controller.signal });
        const items = selectItems(data);
        if (!Array.isArray(items)) {
          throw new Error("The API returned an unexpected response shape.");
        }
        update(setter, {
          items,
          loading: false,
          error: null,
          fetchedAt: new Date().toISOString(),
        });
      } catch (error) {
        if (error.name !== "AbortError") {
          update(setter, { items: [], loading: false, error: error.message, fetchedAt: null });
        }
      }
    };

    update(setMarketStatus, { status: "checking", detail: "Checking NSE market status…" });
    requestJson("/eodhd/status", session?.access_token, { signal: controller.signal })
      .then((result) => {
        update(setMarketStatus, result);
      })
      .catch((error) => {
        if (error.name !== "AbortError") {
          update(setMarketStatus, { status: "unavailable", detail: error.message });
        }
      });

    const accessToken = session?.access_token;
    const loadProviderSections = () => {
      loadSection("/eodhd/indices", setIndices);
      loadSection(`/eodhd/indices/${encodeURIComponent(NIFTY_50)}/history`, setChart);
    };
    const syncMarketData = async () => {
      if (!accessToken) {
        update(setMarketSync, { error: null, result: null });
        loadProviderSections();
        return;
      }

      update(setMarketSync, { error: null, result: null });
      try {
        const result = await requestJson("/eodhd/sync", accessToken, {
          method: "POST",
          signal: controller.signal,
        });
        const fetchedAt = new Date().toISOString();
        update(setMarketSync, {
          error: result.errors?.length
            ? result.errors.map((item) => `${item.source}: ${item.detail}`).join("; ")
            : null,
          result,
        });
        update(setIndices, {
          items: result.market.quote ? [result.market.quote] : [],
          loading: false,
          error: null,
          fetchedAt,
        });
        update(setChart, {
          items: result.market.history || [],
          loading: false,
          error: null,
          fetchedAt,
        });
      } catch (error) {
        if (error.name !== "AbortError") {
          update(setMarketSync, { error: error.message, result: null });
          loadProviderSections();
        }
      }
    };
    syncMarketData();

    return () => {
      active = false;
      controller.abort();
    };
  }, [session?.access_token, refreshKey]);

  const refreshing = [
    indices.loading,
    chart.loading,
  ].some(Boolean);
  const index = indices.items[0];

  return (
    <Layout>
      <DashboardHeader
        user={session?.user}
        marketStatus={marketStatus}
        onRefresh={() => {
          invalidateRequestCache();
          setRefreshKey((value) => value + 1);
        }}
        refreshing={refreshing}
      />
      {marketSync.result && !marketSync.error && (
        <p className="mb-4 text-xs text-text-secondary" role="status">
          Market data synchronized: {marketSync.result.market.candles_saved} new EOD candles and{" "}
          {marketSync.result.news.saved} news records saved.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-3 mb-6">
        {indices.items.map((item) => (
          <IndexCard key={item.symbol} index={item} fetchedAt={indices.fetchedAt} />
        ))}
      </div>
      <div className="bg-bg-card rounded-lg p-4 shadow border border-border-dark mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-text-main">NIFTY 50 Chart</h2>
        </div>
        {chart.loading ? (
          <p className="text-sm text-text-secondary">Loading NIFTY 50 history…</p>
        ) : chart.error ? null : chart.items.length ? (
          <>
            <ResponsiveContainer width="100%" height={300}>
              <ReBarChart data={chart.items}>
                <CartesianGrid strokeDasharray="3 3" stroke="#303A32" />
                <XAxis dataKey="time" stroke="#929B93" />
                <YAxis stroke="#929B93" domain={["auto", "auto"]} />
                <Tooltip contentStyle={{ backgroundColor: "#252D27", border: "none", color: "#F1F3F0" }} />
                <Bar dataKey="value" fill="#20C982" />
              </ReBarChart>
            </ResponsiveContainer>
            <LastUpdated timestamp={chart.items[chart.items.length - 1]?.time} fetchedAt={chart.fetchedAt} />
          </>
        ) : (
          <p className="text-sm text-text-secondary">No historical NIFTY 50 observations were returned by EODHD.</p>
        )}
        {index?.status && <p className="mt-1 text-xs text-text-secondary">Quote status: {index.status}; a provider timestamp does not prove real-time delivery.</p>}
      </div>

    </Layout>
  );
}
