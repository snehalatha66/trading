import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useAuth } from "./AuthContext";
import { invalidateRequestCache, requestJson } from "../utils/api";

const WatchlistContext = createContext(null);
const watchlistCache = {
  ownerId: null,
  data: null,
  selectedListId: "",
  inFlight: null,
};

function isWatchlistResponse(data) {
  return Array.isArray(data)
    && data.every((list) => Array.isArray(list.stocks));
}

export function WatchlistProvider({ children }) {
  const { session } = useAuth();
  const accessToken = session?.access_token;
  const ownerId = session?.user?.id || null;
  const [watchlists, setWatchlists] = useState([]);
  const [selectedListId, setSelectedListIdState] = useState(
    watchlistCache.ownerId === ownerId ? watchlistCache.selectedListId : "",
  );
  const [loading, setLoading] = useState(Boolean(
    accessToken && (
      watchlistCache.ownerId !== ownerId
      || !watchlistCache.data
    ),
  ));
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const refresh = useCallback(async (force = true) => {
    if (!accessToken || !ownerId) {
      setWatchlists([]);
      setLoadError("Sign in to view your watchlists.");
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (watchlistCache.ownerId !== ownerId) {
      watchlistCache.ownerId = ownerId;
      watchlistCache.data = null;
      watchlistCache.selectedListId = "";
      watchlistCache.inFlight = null;
    }
    if (!force && watchlistCache.data) {
      setWatchlists(watchlistCache.data);
      setLoadError(null);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    if (watchlistCache.inFlight) {
      setLoading(!watchlistCache.data);
      setRefreshing(Boolean(watchlistCache.data));
      return watchlistCache.inFlight;
    }

    const hasCachedData = Boolean(watchlistCache.data);
    setLoading(!hasCachedData);
    setRefreshing(hasCachedData);
    setLoadError(null);
    if (force) invalidateRequestCache();

    const request = requestJson("/watchlists/", accessToken)
      .then((data) => {
        if (!isWatchlistResponse(data)) {
          throw new Error("The watchlists API returned incomplete stock data.");
        }
        if (watchlistCache.ownerId === ownerId) {
          watchlistCache.data = data;
          setWatchlists(data);
          setLoadError(null);
        }
        return data;
      })
      .catch((error) => {
        if (watchlistCache.ownerId === ownerId) {
          setLoadError(error.message);
        }
        return null;
      })
      .finally(() => {
        if (watchlistCache.inFlight === request) {
          watchlistCache.inFlight = null;
        }
        if (watchlistCache.ownerId === ownerId) {
          setLoading(false);
          setRefreshing(false);
        }
      });

    watchlistCache.inFlight = request;
    return request;
  }, [accessToken, ownerId]);

  useEffect(() => {
    if (!accessToken || !ownerId) {
      watchlistCache.ownerId = ownerId;
      watchlistCache.data = null;
      watchlistCache.selectedListId = "";
      watchlistCache.inFlight = null;
      setWatchlists([]);
      setSelectedListIdState("");
      setLoading(true);
      setRefreshing(false);
      setLoadError(null);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (watchlistCache.ownerId !== ownerId) {
      watchlistCache.ownerId = ownerId;
      watchlistCache.data = null;
      watchlistCache.selectedListId = "";
      watchlistCache.inFlight = null;
      setWatchlists([]);
      setSelectedListIdState("");
    } else if (watchlistCache.data) {
      setWatchlists(watchlistCache.data);
      setLoading(false);
      setLoadError(null);
    }
    refresh(!watchlistCache.data);
  }, [accessToken, ownerId, refresh]);

  const commit = useCallback((update) => {
    const current = watchlistCache.ownerId === ownerId
      ? watchlistCache.data || []
      : [];
    const next = update(current);
    watchlistCache.ownerId = ownerId;
    watchlistCache.data = next;
    setWatchlists(next);
  }, [ownerId]);

  const setSelectedListId = useCallback((value) => {
    const next = typeof value === "function"
      ? value(watchlistCache.selectedListId)
      : value;
    watchlistCache.selectedListId = next;
    setSelectedListIdState(next);
  }, []);

  const createWatchlist = useCallback(async (name) => {
    const created = await requestJson("/watchlists/", accessToken, {
      method: "POST",
      body: { name },
    });
    commit((current) => [
      { ...created, stocks: [] },
      ...current.filter((list) => list.id !== created.id),
    ]);
    setLoadError(null);
    return created;
  }, [accessToken, commit]);

  const addStock = useCallback(async (watchlistId, stock) => {
    await requestJson(`/watchlists/${encodeURIComponent(watchlistId)}/stocks`, accessToken, {
      method: "POST",
      body: { stock_id: stock.id },
    });
    commit((current) => current.map((list) => (
      list.id !== watchlistId || list.stocks.some((item) => item.id === stock.id)
        ? list
        : { ...list, stocks: [...list.stocks, { ...stock, snapshot: null }] }
    )));
    setLoadError(null);
  }, [accessToken, commit]);

  const removeStock = useCallback(async (watchlistId, stock) => {
    await requestJson(
      `/watchlists/${encodeURIComponent(watchlistId)}/stocks/${encodeURIComponent(stock.id)}`,
      accessToken,
      { method: "DELETE" },
    );
    commit((current) => current.map((list) => (
      list.id === watchlistId
        ? { ...list, stocks: list.stocks.filter((item) => item.id !== stock.id) }
        : list
    )));
    setLoadError(null);
  }, [accessToken, commit]);

  const visibleWatchlists = watchlistCache.ownerId === ownerId ? watchlists : [];

  return (
    <WatchlistContext.Provider value={{
      watchlists: visibleWatchlists,
      selectedListId,
      setSelectedListId,
      loading,
      refreshing,
      loadError,
      refresh,
      createWatchlist,
      addStock,
      removeStock,
    }}>
      {children}
    </WatchlistContext.Provider>
  );
}

export function useWatchlists() {
  const context = useContext(WatchlistContext);
  if (!context) {
    throw new Error("useWatchlists must be used within a WatchlistProvider.");
  }
  return context;
}
