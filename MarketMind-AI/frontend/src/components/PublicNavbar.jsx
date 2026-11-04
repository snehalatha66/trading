// src/components/PublicNavbar.jsx
import React from "react";
import { Link } from "react-router-dom";

// Professional public navigation bar with sticky blur background.
export default function PublicNavbar() {
  return (
    <nav className="sticky top-0 z-50 flex items-center justify-between bg-[#151915]/80 backdrop-blur-md px-6 py-3 shadow-md">
      {/* Logo with AI brain icon (placeholder emoji) */}
      <div className="flex items-center space-x-2">
        <span className="text-2xl font-bold text-[#20C982]">🧠 MarketMind AI</span>
      </div>
      {/* Center navigation links */}
      <div className="hidden md:flex space-x-6 text-[#F1F3F0]">
        <Link to="/" className="hover:text-[#20C982] transition-colors">Home</Link>
        <Link to="/markets" className="hover:text-[#20C982] transition-colors">Markets</Link>
        <Link to="/features" className="hover:text-[#20C982] transition-colors">Features</Link>
        <Link to="/about" className="hover:text-[#20C982] transition-colors">About</Link>
      </div>
      {/* Right side actions */}
      <div className="flex space-x-4 items-center">
        <Link to="/login" className="text-[#F1F3F0] hover:text-[#20C982] transition-colors">Login</Link>
        <Link to="/register" className="text-[#F1F3F0] hover:text-[#20C982] transition-colors">Register</Link>
        <Link
          to="/register"
          className="px-4 py-1 bg-[#20C982] text-[#101310] rounded hover:bg-[#1A9E70] transition"
        >
          Get Started
        </Link>
      </div>
    </nav>
  );
}
