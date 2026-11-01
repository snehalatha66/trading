// src/pages/LandingPage.jsx
import React from "react";
import { Link } from "react-router-dom";

function LandingPage() {
  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col items-center justify-center">
      <h1 className="text-4xl font-bold mb-4">MarketMind AI</h1>
      <p className="mb-6 text-center max-w-xl">
        Indian stock‑market intelligence and paper‑trading platform. Explore market data,
        analyze stocks, build strategies, and practice paper trading – all for free.
      </p>
      <div className="flex space-x-4">
        <Link
          to="/login"
          className="px-6 py-2 bg-green-600 hover:bg-green-500 rounded transition"
        >
          Login
        </Link>
        <Link
          to="/register"
          className="px-6 py-2 bg-blue-600 hover:bg-blue-500 rounded transition"
        >
          Register
        </Link>
      </div>
    </div>
  );
}

export default LandingPage;
