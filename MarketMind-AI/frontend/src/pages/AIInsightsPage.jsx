import React, { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { useAuth } from "../context/AuthContext";
import { invalidateRequestCache, requestJson } from "../utils/api";
import { formatMarketTime } from "../utils/marketTime";

function providerTimestamp(value) {
  if (!value) return "Unavailable";
  return formatMarketTime(value);
}

function displayNumber(value) {
  if (value === null || value === undefined || value === "") return "Unavailable";
  const number = Number(value);
  return Number.isFinite(number)
    ? number.toLocaleString("en-IN", { maximumFractionDigits: 2 })
    : String(value);
}

function SourceCard({ title, source }) {
  if (!source || source.status === "not_requested") return null;

  if (source.status === "unavailable") {
    return (
      <section className="rounded-lg border border-border-dark bg-bg-card p-4">
        <h2 className="font-semibold text-text-main">{title}</h2>
        <p className="mt-2 text-sm text-text-secondary">
          Source data unavailable{source.detail ? `: ${source.detail}` : "."}
        </p>
      </section>
    );
  }

  return null;
}

function MarketDataSummary({ data, symbol }) {
  const sources = data?.data_sources;
  const nifty = sources?.nifty_50;
  const quote = nifty?.quote;
  const latest = nifty?.latest_history;
  const previous = nifty?.previous_history;
  const companyData = sources?.stock_fundamentals;
  const metrics = companyData?.data?.metrics || {};
  const dailyChange = nifty?.change_percent_from_latest_daily_closes;
  const hasNiftyData = nifty?.status === "available";

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-text-main">Provider data and signals</h2>
      <div className="grid gap-3 md:grid-cols-2">
        <section className="rounded-lg border border-border-dark bg-bg-card p-4">
          <h3 className="font-semibold text-text-main">NIFTY 50</h3>
          {hasNiftyData ? (
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-text-secondary">Latest value</dt>
                <dd className="mt-1 text-text-main">
                  {displayNumber(quote?.value ?? latest?.value)}
                </dd>
              </div>
              <div>
                <dt className="text-text-secondary">Latest daily close change</dt>
                <dd className="mt-1 text-text-main">
                  {dailyChange === null || dailyChange === undefined
                    ? "Insufficient history"
                    : `${displayNumber(dailyChange)}%`}
                </dd>
              </div>
              <div>
                <dt className="text-text-secondary">Quote status</dt>
                <dd className="mt-1 text-text-main">
                  {quote?.status || "Historical data"}
                </dd>
              </div>
              <div>
                <dt className="text-text-secondary">Last provider observation</dt>
                <dd className="mt-1 text-text-main">
                  {providerTimestamp(quote?.timestamp || latest?.time)}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="mt-2 text-sm text-text-secondary">
              NIFTY 50 data is unavailable from the configured provider.
            </p>
          )}
          {previous && (
            <p className="mt-3 text-xs text-text-secondary">
              Daily close comparison: {displayNumber(previous.value)} to {displayNumber(latest.value)}.
            </p>
          )}
        </section>

        <SourceCard title="SENSEX" source={sources?.sensex} />

        {symbol && (
          <section className="rounded-lg border border-border-dark bg-bg-card p-4">
            <h3 className="font-semibold text-text-main">
              Stock analysis: {companyData?.data?.company || symbol}
            </h3>
            {companyData?.status === "available" ? (
              <>
                <p className="mt-1 text-xs text-text-secondary">
                  {[companyData.data.exchange, companyData.data.sector, companyData.data.industry]
                    .filter(Boolean)
                    .join(" · ") || "Company classification not provided"}
                </p>
                {Object.keys(metrics).length ? (
                  <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    {Object.entries(metrics).map(([name, value]) => (
                      <div key={name}>
                        <dt className="text-text-secondary">{name}</dt>
                        <dd className="mt-1 text-text-main">{displayNumber(value)}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="mt-3 text-sm text-text-secondary">
                    The provider returned no headline financial metrics for this symbol.
                  </p>
                )}
              </>
            ) : (
              <p className="mt-2 text-sm text-text-secondary">
                {companyData?.detail || "Company fundamentals are unavailable."}
              </p>
            )}
          </section>
        )}
      </div>
    </section>
  );
}

export default function AIInsightsPage() {
  const { session } = useAuth();
  const [symbolInput, setSymbolInput] = useState("");
  const [requestedSymbol, setRequestedSymbol] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [analysis, setAnalysis] = useState({ data: null, loading: true, error: null });

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    async function generateInsights() {
      setAnalysis({ data: null, loading: true, error: null });
      const query = requestedSymbol
        ? `?symbol=${encodeURIComponent(requestedSymbol)}`
        : "";
      try {
        const payload = await requestJson(
          `/ai/insights${query}`,
          session?.access_token,
          { signal: controller.signal },
        );
        if (typeof payload?.insight !== "string" || !payload.insight.trim()) {
          throw new Error("The AI service returned no analysis.");
        }
        if (active) setAnalysis({ data: payload, loading: false, error: null });
      } catch (error) {
        if (active && error.name !== "AbortError") {
          setAnalysis({ data: null, loading: false, error: error.message });
        }
      }
    }

    generateInsights();
    return () => {
      active = false;
      controller.abort();
    };
  }, [requestedSymbol, refreshKey, session?.access_token]);

  function submitStockAnalysis(event) {
    event.preventDefault();
    invalidateRequestCache();
    setRequestedSymbol(symbolInput.trim().toUpperCase());
    setRefreshKey((value) => value + 1);
  }

  return (
    <Layout>
      <div className="mx-auto max-w-6xl space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-text-main">AI Market Insights</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Evidence-based analysis generated from available market-provider data.
            Missing data is identified rather than estimated.
          </p>
        </header>

        <form onSubmit={submitStockAnalysis} className="flex flex-col gap-3 sm:flex-row">
          <label htmlFor="insights-symbol" className="sr-only">Stock symbol for company analysis</label>
          <input
            id="insights-symbol"
            value={symbolInput}
            onChange={(event) => setSymbolInput(event.target.value)}
            placeholder="Optional stock symbol (e.g. RELIANCE.NSE)"
            className="min-w-0 flex-1 rounded-md border border-border-dark bg-bg-card px-4 py-3 text-text-main placeholder:text-text-secondary focus:border-primary-emerald focus:outline-none"
          />
          <button
            type="submit"
            disabled={analysis.loading}
            className="rounded-md bg-primary-emerald px-5 py-3 font-semibold text-bg-main disabled:cursor-not-allowed disabled:opacity-60"
          >
            {analysis.loading ? "Generating…" : "Analyze market / stock"}
          </button>
          <button
            type="button"
            disabled={analysis.loading}
            onClick={() => {
              invalidateRequestCache();
              setRefreshKey((value) => value + 1);
            }}
            className="rounded-md bg-bg-surface px-5 py-3 font-semibold text-text-main hover:bg-bg-surface/80 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {analysis.loading ? "Generating…" : "Regenerate"}
          </button>
        </form>

        {analysis.loading && (
          <p role="status" className="text-sm text-text-secondary">
            Generating insights from available provider market data…
          </p>
        )}
        {analysis.error && (
          <p role="alert" className="rounded-md border border-negative/40 bg-negative/10 p-3 text-sm text-negative">
            Analysis unavailable: {analysis.error}
          </p>
        )}
        {analysis.data && (
          <>
            <section className="rounded-lg border border-border-dark bg-bg-card p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-text-main">Generated analysis</h2>
                <p className="text-xs text-text-secondary">
                  Generated {providerTimestamp(analysis.data.generated_at)}
                  {" · "}Market data as of {providerTimestamp(analysis.data.market_data_as_of)}
                </p>
              </div>
              <div className="whitespace-pre-line text-sm leading-6 text-text-secondary">
                {analysis.data.insight}
              </div>
            </section>
            <MarketDataSummary
              data={analysis.data}
              symbol={analysis.data.symbol || requestedSymbol}
            />
          </>
        )}
      </div>
    </Layout>
  );
}
