import React, { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { useAuth } from "../context/AuthContext";
import { invalidateRequestCache, requestJson } from "../utils/api";

export default function SettingsPage() {
  const { session } = useAuth();
  const [profile, setProfile] = useState(null);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    async function loadProfile() {
      setLoading(true);
      setError(null);
      if (!session?.access_token) {
        setError("Sign in to view account settings.");
        setLoading(false);
        return;
      }
      try {
        const result = await requestJson("/profile/me", session.access_token, {
          signal: controller.signal,
        });
        if (!result || typeof result.email !== "string") {
          throw new Error("The profile API returned an unexpected response.");
        }
        if (active) {
          setProfile(result);
          setEmail(result.email);
          setFullName(result.full_name || "");
        }
      } catch (loadError) {
        if (active && loadError.name !== "AbortError") setError(loadError.message);
      } finally {
        if (active) setLoading(false);
      }
    }
    loadProfile();
    return () => {
      active = false;
      controller.abort();
    };
  }, [session?.access_token, refreshKey]);

  async function saveProfile(event) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    if (!email.trim()) {
      setError("Email is required.");
      return;
    }
    setSaving(true);
    try {
      const updated = await requestJson("/profile/me", session?.access_token, {
        method: "PATCH",
        body: { email: email.trim(), full_name: fullName.trim() || null },
      });
      setProfile(updated);
      setEmail(updated.email);
      setFullName(updated.full_name || "");
      setMessage("Profile settings saved.");
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Layout>
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-text-main">Account Settings</h1>
            <p className="mt-1 text-sm text-text-secondary">Profile information is loaded from your authenticated account.</p>
          </div>
          <button type="button" disabled={loading} onClick={() => {
            invalidateRequestCache();
            setRefreshKey((key) => key + 1);
          }}
            className="rounded-md border border-border-dark px-4 py-2 text-sm text-text-main disabled:opacity-50">
            Retry
          </button>
        </header>
        {loading && <p role="status" className="text-sm text-text-secondary">Loading account settings…</p>}
        {!loading && error && <p role="alert" className="rounded-md bg-negative/10 p-3 text-sm text-negative">{error}</p>}
        {!loading && profile && (
          <form onSubmit={saveProfile} className="space-y-4 rounded-lg border border-border-dark bg-bg-card p-5">
            <label className="block space-y-1 text-sm text-text-secondary">
              Email
              <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)}
                className="block w-full rounded-md border border-border-dark bg-bg-surface px-3 py-2 text-text-main" />
            </label>
            <label className="block space-y-1 text-sm text-text-secondary">
              Full name
              <input value={fullName} onChange={(event) => setFullName(event.target.value)}
                className="block w-full rounded-md border border-border-dark bg-bg-surface px-3 py-2 text-text-main" />
            </label>
            <p className="text-xs text-text-secondary">
              Updating this profile record does not change your Supabase authentication email.
            </p>
            <button type="submit" disabled={saving}
              className="rounded-md bg-primary-emerald px-4 py-2 text-sm font-medium text-bg-main disabled:opacity-50">
              {saving ? "Saving…" : "Save profile"}
            </button>
            {message && <p role="status" className="text-sm text-positive">{message}</p>}
          </form>
        )}
      </div>
    </Layout>
  );
}
