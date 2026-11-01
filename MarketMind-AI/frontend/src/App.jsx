// src/App.jsx
import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import { AuthProvider } from "./context/AuthContext";
import DashboardPage from "./pages/DashboardPage";
import FeaturePage from "./pages/FeaturePage";
import LandingPage from "./pages/LandingPage";
import AuthPage from "./pages/AuthPage";
import NotFoundPage from "./pages/NotFoundPage";

const featureRoutes = [
  { path: "/markets", title: "Markets" },
  { path: "/explorer", title: "Stock Explorer" },
  { path: "/analysis", title: "Stock Analysis" },
  { path: "/screener", title: "Stock Screener" },
  { path: "/watchlist", title: "Watchlist" },
  { path: "/portfolio", title: "My Portfolio" },
  { path: "/paper-trading", title: "Paper Trading" },
  { path: "/orders", title: "Orders & Trades" },
  { path: "/transactions", title: "Transaction History" },
  { path: "/news", title: "Market News" },
  { path: "/assistant", title: "AI Market Assistant" },
  { path: "/strategy-lab", title: "Strategy Lab" },
  { path: "/backtesting", title: "Backtesting" },
  { path: "/alerts", title: "Alerts" },
  { path: "/settings", title: "Settings" },
  { path: "/help", title: "Help & Support" },
];

function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<AuthPage />} />
          <Route path="/register" element={<AuthPage />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          {featureRoutes.map(({ path, title }) => (
            <Route
              key={path}
              path={path}
              element={
                <ProtectedRoute>
                  <FeaturePage title={title} />
                </ProtectedRoute>
              }
            />
          ))}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;
