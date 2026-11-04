// src/components/Navbar.jsx
import React from "react";
import { Link } from "react-router-dom";

// Navbar with logo and navigation links matching the design specifications.
// Uses the dark charcoal background and emerald/gold accent colors.
export default function Navbar() {
  return (
    <nav className="flex items-center justify-between bg-[#151915] px-6 py-3 shadow-md">
      {/* Logo */}
      <div className="flex items-center space-x-2">
        {/* Replace with actual logo image if available */}
        <span className="text-2xl font-bold text-[#20C982]">MarketMind AI</span>
      </div>
      {/* Navigation links */}
      <div className="flex space-x-4">
        <Link
          to="/"
          className="text-[#F1F3F0] hover:text-[#20C982] transition-colors"
        >
          Home
        </Link>
        <Link
          to="/markets"
          className="text-[#F1F3F0] hover:text-[#20C982] transition-colors"
        >
          Markets
        </Link>
        <Link
          to="/features"
          className="text-[#F1F3F0] hover:text-[#20C982] transition-colors"
        >
          Features
        </Link>
        <Link
          to="/about"
          className="text-[#F1F3F0] hover:text-[#20C982] transition-colors"
        >
          About
        </Link>
        <Link
          to="/login"
          className="text-[#F1F3F0] hover:text-[#20C982] transition-colors"
        >
          Login
        </Link>
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
