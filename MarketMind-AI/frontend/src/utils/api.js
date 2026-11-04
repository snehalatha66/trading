const API_ROOT = "/api/v1";
const REQUEST_TIMEOUT_MS = 20000;
const DEFAULT_CACHE_TTL_MS = 45000;
const MAX_CACHE_ENTRIES_PER_TOKEN = 200;
const requestCache = new Map();

function cacheForToken(accessToken) {
  const cacheKey = accessToken || "";
  if (!requestCache.has(cacheKey)) requestCache.set(cacheKey, new Map());
  const cache = requestCache.get(cacheKey);
  for (const [key, entry] of cache) {
    if (!entry.promise && entry.expiresAt <= Date.now()) cache.delete(key);
  }
  while (cache.size > MAX_CACHE_ENTRIES_PER_TOKEN) {
    cache.delete(cache.keys().next().value);
  }
  return cache;
}

function abortError() {
  return new DOMException("The request was aborted.", "AbortError");
}

function waitForRequest(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener("abort", onAbort);
      reject(abortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

async function fetchJson(path, accessToken, options = {}) {
  const controller = new AbortController();
  let timedOut = false;
  const forwardAbort = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) {
    forwardAbort();
  } else {
    options.signal?.addEventListener("abort", forwardAbort, { once: true });
  }
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    const headers = new Headers(options.headers || {});
    if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
    if (options.body !== undefined) headers.set("Content-Type", "application/json");

    let response;
    const method = options.method || "GET";
    const requestPath = `${API_ROOT}${path}`;
    try {
      response = await fetch(requestPath, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
      });
    } catch (error) {
      if (timedOut) {
        throw new Error(`${method} ${requestPath} timed out after ${REQUEST_TIMEOUT_MS / 1000}s. Please retry.`);
      }
      throw error;
    }

    if (response.status === 204) return null;
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = payload?.detail || payload?.message || `Request failed (${response.status})`;
      const description = typeof detail === "string" ? detail : JSON.stringify(detail);
      throw new Error(`${method} ${requestPath} failed (${response.status}): ${description}`);
    }
    return payload;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", forwardAbort);
  }
}

export function invalidateRequestCache(accessToken) {
  if (accessToken === undefined) {
    requestCache.clear();
    return;
  }
  requestCache.delete(accessToken || "");
}

export async function requestJson(path, accessToken, options = {}) {
  const method = options.method || "GET";
  if (method !== "GET" || options.cache === false) {
    const result = await fetchJson(path, accessToken, options);
    if (method !== "GET") invalidateRequestCache();
    return result;
  }

  const tokenCache = cacheForToken(accessToken);
  const requestPath = `${API_ROOT}${path}`;
  const ttlMs = Number.isFinite(options.cacheTtlMs)
    ? Math.max(0, options.cacheTtlMs)
    : DEFAULT_CACHE_TTL_MS;
  const cached = tokenCache.get(requestPath);
  if (cached?.value !== undefined && cached.expiresAt > Date.now()) {
    return waitForRequest(Promise.resolve(cached.value), options.signal);
  }
  if (cached?.promise) {
    return waitForRequest(cached.promise, options.signal);
  }
  if (ttlMs === 0) {
    return fetchJson(path, accessToken, options);
  }

  const entry = { expiresAt: 0, promise: null, value: undefined };
  entry.promise = fetchJson(path, accessToken, { ...options, signal: undefined })
    .then((value) => {
      if (tokenCache.get(requestPath) === entry) {
        entry.value = value;
        entry.expiresAt = Date.now() + ttlMs;
        entry.promise = null;
      }
      return value;
    })
    .catch((error) => {
      if (tokenCache.get(requestPath) === entry) tokenCache.delete(requestPath);
      throw error;
    });
  tokenCache.set(requestPath, entry);
  return waitForRequest(entry.promise, options.signal);
}
