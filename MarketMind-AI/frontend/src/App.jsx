// src/App.jsx
import React from "react";
import { BrowserRouter as Router, Routes, Route, useLocation } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { WatchlistProvider } from "./context/WatchlistContext";
import DashboardPage from "./pages/DashboardPage";
import FeaturePage from "./pages/FeaturePage";
import MarketsPage from "./pages/MarketsPage";
import ScreenerPage from "./pages/ScreenerPage";
import WatchlistPage from "./pages/WatchlistPage";
import FundamentalsPage from "./pages/FundamentalsPage";
import NewsPage from "./pages/NewsPage";
import AIInsightsPage from "./pages/AIInsightsPage";
import PortfolioPage from "./pages/PortfolioPage";
import PaperTradingPage from "./pages/PaperTradingPage";
import PriceAlertsPage from "./pages/PriceAlertsPage";
import TransactionsPage from "./pages/TransactionsPage";
import SettingsPage from "./pages/SettingsPage";
import LandingPage from "./pages/LandingPage";
import AuthPage from "./pages/AuthPage";
import AboutPage from "./pages/AboutPage";
import NotFoundPage from "./pages/NotFoundPage";

const featureRoutes = [
  { path: "/explorer", title: "Stock Explorer" },
  { path: "/analysis", title: "Stock Analysis" },
  { path: "/orders", title: "Orders & Trades" },
  { path: "/assistant", title: "AI Market Assistant" },
  { path: "/strategy-lab", title: "Strategy Lab" },
  { path: "/backtesting", title: "Backtesting" },
  { path: "/help", title: "Help & Support" },
];

const sidebarPages = [
  { path: "/dashboard", Component: DashboardPage },
  { path: "/markets", Component: MarketsPage },
  { path: "/screener", Component: ScreenerPage },
  { path: "/watchlist", Component: WatchlistPage },
  { path: "/fundamentals", Component: FundamentalsPage },
  { path: "/portfolio", Component: PortfolioPage },
  { path: "/paper-trading", Component: PaperTradingPage },
  { path: "/alerts", Component: PriceAlertsPage },
  { path: "/transactions", Component: TransactionsPage },
  { path: "/ai-insights", Component: AIInsightsPage },
  { path: "/news", Component: NewsPage },
  { path: "/settings", Component: SettingsPage },
];

function RoutedPageCache({ authenticated }) {
  const { pathname } = useLocation();
  const normalizedPath = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const [visitedPaths, setVisitedPaths] = React.useState(() => (
    sidebarPages.some((page) => page.path === normalizedPath) ? [normalizedPath] : []
  ));
  const currentPage = sidebarPages.find((page) => page.path === normalizedPath);
  const renderedPaths = authenticated && currentPage && !visitedPaths.includes(currentPage.path)
    ? [...visitedPaths, currentPage.path]
    : visitedPaths;

  React.useEffect(() => {
    if (currentPage) {
      setVisitedPaths((paths) => (
        paths.includes(currentPage.path) ? paths : [...paths, currentPage.path]
      ));
    }
  }, [currentPage]);

  return (
    <>
      {authenticated && renderedPaths.map((path) => {
        const page = sidebarPages.find((item) => item.path === path);
        if (!page) return null;
        const Page = page.Component;
        return (
          <div key={page.path} hidden={page.path !== normalizedPath}>
            <ProtectedRoute><Page /></ProtectedRoute>
          </div>
        );
      })}
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/features" element={<FeaturePage title="Features" />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/login" element={<AuthPage />} />
        <Route path="/register" element={<AuthPage />} />
        {sidebarPages.map(({ path, Component }) => (
          <Route
            key={path}
            path={path}
            element={authenticated ? null : <ProtectedRoute><Component /></ProtectedRoute>}
          />
        ))}
        {featureRoutes.map(({ path, title }) => (
          <Route
            key={path}
            path={path}
            element={<ProtectedRoute><FeaturePage title={title} /></ProtectedRoute>}
          />
        ))}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </>
  );
}

function RoutedApp() {
  const { session } = useAuth();
  return (
    <RoutedPageCache
      key={session?.user?.id || "signed-out"}
      authenticated={Boolean(session)}
    />
  );
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <WatchlistProvider>
          <RoutedApp />
        </WatchlistProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
