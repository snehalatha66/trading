import React, { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { useAuth } from "../context/AuthContext";
import { invalidateRequestCache, requestJson } from "../utils/api";
import { formatMarketTime } from "../utils/marketTime";

function providerTimestamp(value) {
  if (!value) return "Timestamp unavailable";
  return formatMarketTime(value);
}

function ErrorMessage({ error }) {
  if (!error) return null;
  return (
    <p role="alert" className="text-sm text-negative">
      Data unavailable: {error}
    </p>
  );
}

function NewsList({ items, loading, error }) {
  if (loading) return <p className="text-sm text-text-secondary">Loading market news…</p>;
  if (error) return <ErrorMessage error={error} />;
  if (!items.length) {
    return <p className="text-sm text-text-secondary">No market news was returned by EODHD.</p>;
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {items.map((article, index) => (
        <article
          key={article.url || `${article.title}-${index}`}
          className="rounded-lg border border-border-dark bg-bg-card p-5 shadow"
        >
          <h2 className="text-lg font-semibold text-text-main">
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-emerald hover:underline"
            >
              {article.title}
            </a>
          </h2>
          <p className="mt-3 whitespace-pre-line text-sm text-text-secondary">
            {article.summary || "No summary was provided by the publisher."}
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border-dark pt-3 text-xs text-text-secondary">
            <span>{article.source || "Source unavailable"}</span>
            <time dateTime={article.timestamp || undefined}>
              {providerTimestamp(article.timestamp)}
            </time>
          </div>
        </article>
      ))}
    </div>
  );
}

export default function NewsPage() {
  const { session } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [news, setNews] = useState({ items: [], loading: true, error: null });

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    async function loadNews() {
      setNews({ items: [], loading: true, error: null });
      try {
        const payload = await requestJson(
          "/eodhd/news?limit=50",
          session?.access_token,
          { signal: controller.signal },
        );
        if (!Array.isArray(payload)) {
          throw new Error("The news API returned an unexpected response.");
        }
        if (active) setNews({ items: payload, loading: false, error: null });
      } catch (error) {
        if (active && error.name !== "AbortError") {
          setNews({ items: [], loading: false, error: error.message });
        }
      }
    }

    loadNews();
    return () => {
      active = false;
      controller.abort();
    };
  }, [session?.access_token, refreshKey]);

  return (
    <Layout>
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-text-main">Market News</h1>
            <p className="mt-1 text-sm text-text-secondary">
              Latest Indian market headlines from EODHD and their publishers.
            </p>
          </div>
          <button type="button" disabled={news.loading} onClick={() => {
            invalidateRequestCache();
            setRefreshKey((key) => key + 1);
          }}
            className="rounded-md border border-border-dark px-4 py-2 text-sm text-text-main disabled:opacity-50">
            {news.loading ? "Refreshing…" : "Refresh"}
          </button>
        </header>
        <NewsList items={news.items} loading={news.loading} error={news.error} />
        {!news.loading && news.error && (
          <button type="button" onClick={() => {
            invalidateRequestCache();
            setRefreshKey((key) => key + 1);
          }}
            className="rounded-md bg-bg-surface px-4 py-2 text-sm text-text-main">
            Retry
          </button>
        )}
      </div>
    </Layout>
  );
}
