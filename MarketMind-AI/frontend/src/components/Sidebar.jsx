// src/components/Sidebar.jsx
import React from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  BarChart2,
  ListChecks,
  ClipboardList,
  Wallet,
  TrendingUp,
  CalendarCheck,
  FileText,
  Activity,
  Users,
  AlertCircle,
  Settings,
  X,
} from "lucide-react";

// Navigation groups as per design spec
const groups = [
  {
    label: "MAIN",
    items: [
      { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
      { to: "/markets", icon: BarChart2, label: "Markets" },
      { to: "/screener", icon: ListChecks, label: "Stock Screener" },
      { to: "/watchlist", icon: ClipboardList, label: "My Watchlist" },
      { to: "/fundamentals", icon: FileText, label: "Company Fundamentals" },
    ],
  },
  {
    label: "MY TRADING",
    items: [
      { to: "/portfolio", icon: Wallet, label: "Portfolio" },
      { to: "/paper-trading", icon: TrendingUp, label: "Paper Trading" },
      { to: "/alerts", icon: AlertCircle, label: "Price Alerts" },
      { to: "/transactions", icon: CalendarCheck, label: "Transaction History" },
    ],
  },
  {
    label: "INTELLIGENCE",
    items: [
      { to: "/ai-insights", icon: Users, label: "AI Insights" },
      { to: "/news", icon: Activity, label: "Market News" },
    ],
  },
  {
    label: "SYSTEM",
    items: [
      { to: "/settings", icon: Settings, label: "Settings" },
    ],
  },
];

export default function Sidebar({ mobileOpen = false, onNavigate = () => {} }) {
  return (
    <aside className={`${mobileOpen ? "block fixed inset-y-0 left-0 z-40" : "hidden"} bg-bg-sidebar text-text-main w-64 flex-shrink-0 h-screen overflow-y-auto lg:static lg:block`}>
      <div className="p-4 flex items-center justify-between space-x-2">
        <div className="flex items-center space-x-2">
          <span className="text-2xl font-bold text-primary-emerald">🧠</span>
          <span className="text-xl font-semibold">MarketMind AI</span>
        </div>
        <button type="button" onClick={onNavigate} aria-label="Close navigation"
          className="rounded p-2 text-text-secondary hover:bg-bg-surface lg:hidden">
          <X className="h-5 w-5" />
        </button>
      </div>
      <nav className="mt-6">
        {groups.map((group) => (
          <div key={group.label} className="mb-4">
            <p className="px-4 text-xs font-medium text-secondary-gold uppercase tracking-wider">
              {group.label}
            </p>
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onNavigate}
                className={({ isActive }) =>
                  `flex items-center px-4 py-2 mt-1 rounded-md text-sm font-medium transition-colors hover:bg-bg-surface ${
                    isActive ? "bg-bg-surface text-primary-emerald" : "text-text-secondary"
                  }`
                }
              >
                <item.icon className="w-5 h-5 mr-3" />
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  );
}
