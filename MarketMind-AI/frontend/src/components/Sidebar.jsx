// src/components/Sidebar.jsx
import React from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  BarChart2,
  Search,
  LineChart,
  ListChecks,
  ClipboardList,
  Wallet,
  TrendingUp,
  CalendarCheck,
  FileText,
  Activity,
  Users,
  Cpu,
  AlertCircle,
  Settings,
  HelpCircle,
} from "lucide-react";

const sections = [
  {
    label: "Overview",
    items: [
      { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
      { to: "/markets", icon: BarChart2, label: "Markets" },
    ],
  },
  {
    label: "Stock Discovery",
    items: [
      { to: "/explorer", icon: Search, label: "Stock Explorer" },
      { to: "/analysis", icon: LineChart, label: "Stock Analysis" },
      { to: "/screener", icon: ListChecks, label: "Stock Screener" },
      { to: "/watchlist", icon: ClipboardList, label: "Watchlist" },
    ],
  },
  {
    label: "Trading",
    items: [
      { to: "/portfolio", icon: Wallet, label: "My Portfolio" },
      { to: "/paper-trading", icon: TrendingUp, label: "Paper Trading" },
      { to: "/orders", icon: CalendarCheck, label: "Orders & Trades" },
      { to: "/transactions", icon: FileText, label: "Transaction History" },
    ],
  },
  {
    label: "AI & Research",
    items: [
      { to: "/news", icon: Activity, label: "Market News" },
      { to: "/assistant", icon: Users, label: "AI Market Assistant" },
      { to: "/strategy-lab", icon: Cpu, label: "Strategy Lab" },
      { to: "/backtesting", icon: ClipboardList, label: "Backtesting" },
    ],
  },
  {
    label: "Personal",
    items: [
      { to: "/alerts", icon: AlertCircle, label: "Alerts" },
      { to: "/settings", icon: Settings, label: "Settings" },
      { to: "/help", icon: HelpCircle, label: "Help & Support" },
    ],
  },
];

export default function Sidebar() {
  return (
    <aside className="bg-gray-950 text-gray-100 w-64 flex-shrink-0 hidden lg:block h-screen overflow-y-auto">
      <div className="p-4 flex items-center space-x-2">
        <span className="text-2xl font-bold text-emerald-400">🧠</span>
        <span className="text-xl font-semibold">MarketMind AI</span>
      </div>
      <nav className="mt-6">
        {sections.map((sec) => (
          <div key={sec.label} className="mb-4">
            <p className="px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
              {sec.label}
            </p>
            {sec.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center px-4 py-2 mt-1 rounded-md text-sm font-medium hover:bg-gray-800 transition-colors ${
                    isActive ? "bg-gray-800 text-emerald-400" : "text-gray-300"
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
