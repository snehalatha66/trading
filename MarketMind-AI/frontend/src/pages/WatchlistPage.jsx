import React, { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { useAuth } from "../context/AuthContext";
import { useWatchlists } from "../context/WatchlistContext";
import { requestJson } from "../utils/api";
import { formatMarketTime } from "../utils/marketTime";

function currency(value) {
  const price = Number(value);
  if (value === null || value === undefined || value === "" || !Number.isFinite(price)) {
    return "Unavailable";
  }
  return `₹${price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function timestamp(value) {
  if (!value) return "Timestamp unavailable";
  return formatMarketTime(value);
}

export default function WatchlistPage() {
  const { session } = useAuth();
  const {
    watchlists,
    selectedListId,
    setSelectedListId,
    loading,
    refreshing,
    loadError,
    refresh,
    createWatchlist: saveWatchlist,
    addStock: saveStock,
    removeStock: deleteStock,
  } = useWatchlists();
  const [actionError, setActionError] = useState(null);
  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [busyStockId, setBusyStockId] = useState(null);
  const [newListName, setNewListName] = useState("");
  const [creatingList, setCreatingList] = useState(false);

  useEffect(() => {
    setSelectedListId((current) =>
      watchlists.some((list) => list.id === current) ? current : watchlists[0]?.id || "",
    );
  }, [watchlists]);

  async function searchStocks(event) {
    event.preventDefault();
    const term = searchText.trim();
    setActionError(null);
    if (!term) {
      setActionError("Enter a company name or stock symbol to search.");
      return;
    }

    setSearching(true);
    setSearchResults([]);
    try {
      const results = await requestJson(
        `/stocks?q=${encodeURIComponent(term)}&limit=10`,
        session?.access_token,
      );
      if (!Array.isArray(results)) throw new Error("The stock search returned an unexpected response.");
      setSearchResults(results);
      if (!results.length) setActionError("No matching stocks were found.");
    } catch (error) {
      setActionError(error.message);
    } finally {
      setSearching(false);
    }
  }

  async function createWatchlist(event) {
    event.preventDefault();
    const name = newListName.trim();
    if (!name) {
      setActionError("Enter a name for the new watchlist.");
      return;
    }

    setActionError(null);
    setCreatingList(true);
    try {
      const created = await saveWatchlist(name);
      setNewListName("");
      setSelectedListId(created.id);
    } catch (error) {
      setActionError(error.message);
    } finally {
      setCreatingList(false);
    }
  }

  async function addStock(stock) {
    setActionError(null);
    setBusyStockId(stock.id);
    try {
      let listId = selectedListId;
      if (!listId) {
        const created = await saveWatchlist("My Watchlist");
        listId = created.id;
        setSelectedListId(listId);
      }
      const list = watchlists.find((item) => item.id === listId);
      if (list?.stocks.some((item) => item.id === stock.id)) {
        throw new Error(`${stock.symbol} is already in this watchlist.`);
      }
      await saveStock(listId, stock);
      setSearchResults([]);
      setSearchText("");
    } catch (error) {
      setActionError(error.message);
    } finally {
      setBusyStockId(null);
    }
  }

  async function removeStock(list, stock) {
    setActionError(null);
    setBusyStockId(stock.id);
    try {
      await deleteStock(list.id, stock);
    } catch (error) {
      setActionError(error.message);
    } finally {
      setBusyStockId(null);
    }
  }

  const selectedList = watchlists.find((list) => list.id === selectedListId);

  return (
    <Layout>
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-text-main">My Watchlist</h1>
            <p className="mt-1 text-sm text-text-secondary">
              Your watchlists are saved to your account and refreshed from the server.
            </p>
          </div>
          <button
            type="button"
            onClick={() => refresh(true)}
            disabled={loading || refreshing}
            className="rounded-md bg-bg-surface px-4 py-2 text-sm text-text-main disabled:opacity-60"
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </header>

        <form onSubmit={searchStocks} className="flex flex-col gap-3 sm:flex-row">
          <label htmlFor="watchlist-search" className="sr-only">Search stocks</label>
          <input
            id="watchlist-search"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Search a company name or stock symbol"
            className="min-w-0 flex-1 rounded-md border border-border-dark bg-bg-card px-4 py-3 text-text-main placeholder:text-text-secondary"
          />
          <button
            type="submit"
            disabled={searching}
            className="rounded-md bg-primary-emerald px-5 py-3 font-semibold text-bg-main disabled:opacity-60"
          >
            {searching ? "Searching…" : "Find stocks"}
          </button>
        </form>

        {searchResults.length > 0 && (
          <section aria-label="Stock search results" className="space-y-2">
            {searchResults.map((stock) => (
              <div key={stock.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border-dark bg-bg-card p-3">
                <div>
                  <p className="font-medium text-text-main">{stock.name || stock.symbol}</p>
                  <p className="text-sm text-text-secondary">
                    {stock.symbol} · {stock.exchange || "Exchange unavailable"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => addStock(stock)}
                  disabled={busyStockId === stock.id || !selectedListId && watchlists.length > 0}
                  className="rounded bg-bg-surface px-3 py-2 text-sm text-text-main disabled:opacity-60"
                >
                  {busyStockId === stock.id ? "Adding…" : "Add to watchlist"}
                </button>
              </div>
            ))}
          </section>
        )}

        {actionError && (
          <p role="alert" className="rounded-md border border-negative/40 bg-negative/10 p-3 text-sm text-negative">
            {actionError}
          </p>
        )}

        <form onSubmit={createWatchlist} className="flex flex-col gap-3 sm:flex-row">
          <label htmlFor="watchlist-name" className="sr-only">New watchlist name</label>
          <input
            id="watchlist-name"
            value={newListName}
            onChange={(event) => setNewListName(event.target.value)}
            placeholder="Name a new watchlist"
            className="min-w-0 flex-1 rounded-md border border-border-dark bg-bg-card px-4 py-3 text-text-main placeholder:text-text-secondary"
          />
          <button
            type="submit"
            disabled={creatingList}
            className="rounded-md bg-bg-surface px-5 py-3 text-text-main disabled:opacity-60"
          >
            {creatingList ? "Creating…" : "Create watchlist"}
          </button>
        </form>

        {loading && <p role="status" className="text-sm text-text-secondary">Loading your saved watchlists…</p>}
        {!loading && loadError && (
          <p role="alert" className="rounded-md border border-negative/40 bg-negative/10 p-3 text-sm text-negative">
            Could not load watchlists: {loadError}
            <button
              type="button"
              onClick={() => refresh(true)}
              disabled={refreshing}
              className="ml-3 underline"
            >
              {refreshing ? "Retrying…" : "Retry"}
            </button>
          </p>
        )}
        {!loading && !loadError && watchlists.length === 0 && (
          <p className="rounded-lg border border-border-dark bg-bg-card p-5 text-sm text-text-secondary">
            You do not have a watchlist yet. Create one above, then search for and add stocks.
          </p>
        )}

        {!loading && watchlists.length > 0 && (
          <section className="space-y-4">
            <label htmlFor="watchlist-select" className="block text-sm font-medium text-text-main">
              Select watchlist
            </label>
            <select
              id="watchlist-select"
              value={selectedListId}
              onChange={(event) => setSelectedListId(event.target.value)}
              className="w-full rounded-md border border-border-dark bg-bg-card px-4 py-3 text-text-main sm:max-w-sm"
            >
              {watchlists.map((list) => (
                <option key={list.id} value={list.id}>{list.name}</option>
              ))}
            </select>

            {selectedList && (
              <div className="overflow-x-auto rounded-lg border border-border-dark bg-bg-card">
                {selectedList.stocks.length === 0 ? (
                  <p className="p-5 text-sm text-text-secondary">
                    This watchlist is empty. Search above to add stocks.
                  </p>
                ) : (
                  <table className="w-full text-left text-sm">
                    <thead className="bg-bg-surface text-text-secondary">
                      <tr>
                        <th className="px-4 py-3 font-medium">Company</th>
                        <th className="px-4 py-3 font-medium">Symbol</th>
                        <th className="px-4 py-3 font-medium">Saved market price</th>
                        <th className="px-4 py-3 font-medium">As of</th>
                        <th className="px-4 py-3 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-dark">
                      {selectedList.stocks.map((stock) => (
                        <tr key={stock.id}>
                          <td className="px-4 py-3 text-text-main">{stock.name || stock.symbol}</td>
                          <td className="px-4 py-3 text-text-secondary">{stock.symbol}</td>
                          <td className="px-4 py-3 text-text-main">{currency(stock.snapshot?.price)}</td>
                          <td className="px-4 py-3 text-text-secondary">{timestamp(stock.snapshot?.snapshot_at)}</td>
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() => removeStock(selectedList, stock)}
                              disabled={busyStockId === stock.id}
                              className="text-negative hover:underline disabled:opacity-60"
                            >
                              {busyStockId === stock.id ? "Removing…" : "Remove"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </section>
        )}
      </div>
    </Layout>
  );
}
