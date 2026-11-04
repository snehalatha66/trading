// src/components/Layout.jsx
import React, { useState } from "react";
import { Menu } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Sidebar from "./Sidebar";
import { useAuth } from "../context/AuthContext";

export default function Layout({ children }) {
  const { session, signOut } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signOutError, setSignOutError] = useState(null);

  async function handleSignOut() {
    setSignOutError(null);
    try {
      await signOut();
      navigate("/login", { replace: true });
    } catch (error) {
      setSignOutError(error.message || "Could not sign out. Please retry.");
    }
  }

  return (
    <div className="flex min-h-screen bg-gray-950 text-gray-100">
      {mobileOpen && (
        <button type="button" aria-label="Close navigation" onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-30 bg-black/60 lg:hidden" />
      )}
      <Sidebar mobileOpen={mobileOpen} onNavigate={() => setMobileOpen(false)} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="flex min-h-14 items-center justify-between border-b border-border-dark bg-bg-sidebar px-4 lg:px-6">
          <div className="flex items-center gap-3">
            <button type="button" aria-label="Open navigation" onClick={() => setMobileOpen(true)}
              className="rounded p-2 text-text-secondary hover:bg-bg-surface lg:hidden">
              <Menu className="h-5 w-5" />
            </button>
            <span className="font-semibold text-text-main lg:hidden">MarketMind AI</span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm text-text-secondary sm:inline">{session?.user?.email}</span>
            <button type="button" onClick={handleSignOut}
              className="rounded-md border border-border-dark px-3 py-1.5 text-sm text-text-main hover:bg-bg-surface">
              Sign out
            </button>
          </div>
        </header>
        {signOutError && <p role="alert" className="px-4 pt-3 text-sm text-negative">{signOutError}</p>}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
